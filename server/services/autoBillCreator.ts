import { getEmailParserService, type ParsedEmail } from "./emailParser";
import { storage } from "../storage";
import type { InsertBill } from "@shared/schema";
import { objectStorage } from "../objectStorage";

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

  /**
   * Writes one email attachment to object storage.
   *
   * This used to reach past the service to the raw storage client and
   * re-implement key derivation inline — splitting PRIVATE_OBJECT_DIR into a
   * bucket and prefix by hand, then building the returned path separately. The
   * two had to agree, and nothing enforced that they did. It now goes through
   * the same uploadObjectEntity() every other upload path uses, so the key
   * layout and the returned path come from one place.
   *
   * Keeping the file extension on the key preserves the previous behaviour —
   * the AI bill reader sniffs PDF vs image from the stored path.
   */
  private async uploadAttachment(
    fileContent: Buffer | string,
    fileName: string,
    companyId: string
  ): Promise<{ objectPath: string; mimeType: string } | null> {
    if (!process.env.PRIVATE_OBJECT_DIR) return null;

    const fileBuffer = Buffer.isBuffer(fileContent)
      ? fileContent
      : Buffer.from(fileContent as string, "base64");

    const ext = fileName.split(".").pop()?.toLowerCase() || "";
    const contentType =
      ext === "pdf" ? "application/pdf" :
      ext === "png" ? "image/png" :
      ["jpg", "jpeg"].includes(ext) ? "image/jpeg" : "application/octet-stream";

    const objectPath = await objectStorage.uploadObjectEntity(
      fileBuffer,
      contentType,
      companyId,
      ext || undefined,
    );

    return { objectPath, mimeType: contentType };
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

      // No fallback to "first active project": guessing put every unmatched
      // invoice on whichever project happened to come back first, which is
      // indistinguishable from a real match once it's on the bill. If the
      // email doesn't name a project, leave it unset — the bill lands as a
      // business-level draft and the reviewer picks the project.
      if (!projectId) {
        console.log("[autoBillCreator] No project matched from the email — leaving the bill unassigned");
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
        // Bills that arrive by email are real supplier bills and belong in Xero
        // like any other. Defaulting this off meant every emailed bill waited
        // for someone to notice the checkbox, and quietly never synced if
        // nobody did. The push still only fires once the bill reaches
        // awaiting_approval, so nothing leaves as an unreviewed draft.
        sendToXero: true,
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

    const project = projectId ? await storage.getProject(projectId) : undefined;
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
