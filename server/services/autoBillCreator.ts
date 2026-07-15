import { getEmailParserService, type ParsedEmail } from "./emailParser";
import { storage } from "../storage";
import type { InsertBill } from "@shared/schema";
import { objectStorageClient } from "../replit_integrations/object_storage/objectStorage";
import { randomUUID } from "crypto";

export interface AutoBillResult {
  success: boolean;
  billId?: string;
  billNumber?: string;
  error?: string;
  supplierName?: string;
  projectName?: string;
  total?: number;
}

export interface AutoBillOptions {
  defaultProjectId?: string;
  defaultUserId?: string | null;
  companyId?: string;
  autoMatch: boolean;
  gmailMessageId?: string;
  existingBillId?: string;
}


export class AutoBillCreatorService {
  /**
   * Process all attachments from one email → create exactly ONE bill.
   * All attachment files are uploaded to that bill; AI runs on the first one.
   */
  async processEmailInvoices(
    email: ParsedEmail,
    options: AutoBillOptions
  ): Promise<AutoBillResult[]> {
    const emailParser = getEmailParserService();
    const invoiceAttachments = emailParser.filterInvoiceAttachments(email.attachments);

    if (invoiceAttachments.length === 0) {
      return [{ success: false, error: "No invoice attachments found (PDF or images)" }];
    }

    try {
      const result = await this.createBillFromEmail(invoiceAttachments, email, options);
      // Keep the project budget live after creating a bill from email. Covers
      // all callers of this service (webhook, manual poll, Gmail poller).
      if (result.success && result.billId) {
        try {
          const bill = await storage.getBillById(result.billId);
          const projectId = (bill as any)?.projectId;
          if (projectId) {
            const budget = await storage.calculateBudget(projectId);
            if (budget) await storage.recalculateBudgetLineItems(budget.id);
          }
        } catch (recalcErr: any) {
          console.warn("[autoBillCreator] budget recalc failed:", recalcErr?.message || recalcErr);
        }
      }
      return [result];
    } catch (error: any) {
      return [{ success: false, error: error.message }];
    }
  }

  private async uploadAttachment(
    fileContent: Buffer | string,
    fileName: string,
    companyId: string
  ): Promise<{ objectPath: string; mimeType: string } | null> {
    const privateDir = process.env.PRIVATE_OBJECT_DIR || "";
    if (!privateDir) return null;

    const fileBuffer = Buffer.isBuffer(fileContent)
      ? fileContent
      : Buffer.from(fileContent as string, "base64");

    const dirParts = privateDir.replace(/^\//, "").split("/");
    const bucketName = dirParts[0];
    const dirPrefix = dirParts.slice(1).join("/");
    const objectId = randomUUID();
    const ext = fileName.split(".").pop()?.toLowerCase() || "";
    const objectNameSuffix = ext ? `${objectId}.${ext}` : objectId;
    const objectName = dirPrefix
      ? `${dirPrefix}/uploads/${objectNameSuffix}`
      : `uploads/${objectNameSuffix}`;
    const contentType =
      ext === "pdf" ? "application/pdf" :
      ext === "png" ? "image/png" :
      ["jpg", "jpeg"].includes(ext) ? "image/jpeg" : "application/octet-stream";

    await objectStorageClient.bucket(bucketName).file(objectName).save(fileBuffer, {
      contentType,
    });

    return {
      objectPath: `/objects/company/${companyId}/uploads/${objectNameSuffix}`,
      mimeType: contentType,
    };
  }

  private async createBillFromEmail(
    attachments: import("./emailParser").EmailAttachment[],
    email: ParsedEmail,
    options: AutoBillOptions
  ): Promise<AutoBillResult> {
    const emailParser = getEmailParserService();

    const companyId = options.companyId || await storage.getFirstCompanyId();
    if (!companyId) throw new Error("No company found — cannot create bill.");

    // ── Resolve project ──────────────────────────────────────────────────────
    let projectId = options.defaultProjectId;
    // Filter projects by companyId to avoid cross-tenant matches
    const allProjects = await storage.getProjects();
    const projects = companyId
      ? allProjects.filter((p: any) => p.companyId === companyId)
      : allProjects;

    if (!projectId) {
      const projectHint = emailParser.extractProjectHint(email);

      if (projectHint && options.autoMatch) {
        const matchedProject = projects.find(p =>
          p.name.toLowerCase().includes(projectHint.toLowerCase())
        );
        if (matchedProject) {
          projectId = matchedProject.id;
        }
      }

      if (!projectId) {
        const activeProject = projects.find(p => p.isActive);
        if (activeProject) {
          projectId = activeProject.id;
        }
        // If still no project, bill will be saved as a business-level bill (projectId = null)
      }
    }

    let supplierId: string | undefined;
    let supplierName = "Unknown Supplier";

    // ── Upload ALL attachments (skip if bill already has attachments to avoid duplicates on retry) ──
    const uploadedAttachments: Array<{
      objectPath: string;
      filename: string;
      mimeType: string;
    }> = [];

    // Check if the existing bill already has attachments — if so skip re-upload
    const existingBillForCheck = options.existingBillId
      ? await storage.getBillById(options.existingBillId)
      : null;
    const hasExistingAttachments =
      existingBillForCheck &&
      ((existingBillForCheck.attachmentUrls as any[]) || []).length > 0;

    if (!hasExistingAttachments) {
      for (const attachment of attachments) {
        try {
          const uploaded = await this.uploadAttachment(
            attachment.content,
            attachment.filename,
            companyId
          );
          if (uploaded) {
            uploadedAttachments.push({
              objectPath: uploaded.objectPath,
              filename: attachment.filename,
              mimeType: uploaded.mimeType,
            });
          }
        } catch (uploadErr: any) {
          console.error(`autoBillCreator: failed to upload ${attachment.filename}:`, uploadErr.message);
        }
      }
    } else {
      console.log(`[autoBillCreator] Skipping re-upload for ${options.existingBillId} — ${(existingBillForCheck.attachmentUrls as any[]).length} attachment(s) already present`);
    }

    // ── Create ONE bill (or reuse existing draft) ────────────────────────────
    let createdBill: import("@shared/schema").Bill;

    if (options.existingBillId) {
      const existing = existingBillForCheck;
      if (!existing) throw new Error(`Existing bill ${options.existingBillId} not found`);
      createdBill = existing;
      console.log(`[autoBillCreator] Reusing existing draft bill ${existing.billNumber} for AI processing`);

      // Append any newly-uploaded attachments (only happens when bill had 0 attachments previously)
      for (const u of uploadedAttachments) {
        await storage.appendBillAttachment(createdBill.id, {
          ...u,
          source: "email",
          uploadedAt: new Date().toISOString(),
        });
      }
    } else {
      const billNumber = await storage.getNextBillNumber(companyId);

      const draftBillData: InsertBill = {
        billNumber,
        projectId,
        supplierId,
        billType: "bill",
        status: "draft",
        billDate: new Date(),
        notes: `Auto-created from email: ${email.subject}\nFrom: ${email.from}`,
        subtotal: 0,
        tax: 0,
        total: 0,
        paidAmount: 0,
        sendToXero: false,
        ocrProcessed: false,
        attachmentUrls: [],
        createdById: options.defaultUserId || null,
        gmailMessageId: options.gmailMessageId || null,
        companyId: companyId || null,
      };

      createdBill = await storage.createBill(draftBillData);

      // Attach all uploaded files immediately (accessible even if AI fails)
      for (const u of uploadedAttachments) {
        await storage.appendBillAttachment(createdBill.id, {
          ...u,
          source: "email",
          uploadedAt: new Date().toISOString(),
        });
      }
    }

    // ── Bill saved as draft — AI extraction deferred to bulk "Run AI Read" ───
    // Do NOT run processInvoiceWithAI here. The bill lands in the list as a
    // draft with its attachment saved. Users select one or more drafts and
    // trigger OCR in bulk from the bills list.
    console.log(`[autoBillCreator] Bill ${createdBill.billNumber} saved as draft — AI extraction deferred`);

    const project = await storage.getProject(projectId!);
    return {
      success: true,
      billId: createdBill.id,
      billNumber: createdBill.billNumber ?? undefined,
      supplierName,
      projectName: project?.name,
      total: 0,
    };

  }
}

let autoBillCreatorService: AutoBillCreatorService | null = null;

export function getAutoBillCreatorService(): AutoBillCreatorService {
  if (!autoBillCreatorService) {
    autoBillCreatorService = new AutoBillCreatorService();
  }
  return autoBillCreatorService;
}
