import { processInvoiceWithAI } from "./aiBillReader";
import { getEmailParserService, type ParsedEmail } from "./emailParser";
import { storage } from "../storage";
import type { InsertBill, InsertBillLineItem } from "@shared/schema";
import { matchSupplier } from "@shared/supplierMatcher";
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
      metadata: { contentType },
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
    if (!projectId) {
      const projectHint = emailParser.extractProjectHint(email);
      const projects = await storage.getProjects();

      if (projectHint && options.autoMatch) {
        const matchedProject = projects.find(p =>
          p.name.toLowerCase().includes(projectHint.toLowerCase())
        );
        if (matchedProject) projectId = matchedProject.id;
      }

      if (!projectId) {
        const activeProject = projects.find(p => p.isActive);
        if (activeProject) {
          projectId = activeProject.id;
        } else {
          throw new Error("No active project found. Please set a default project.");
        }
      }
    }

    // ── Resolve supplier from email (hint only — AI will refine later) ───────
    const supplierHint = emailParser.extractSupplierHint(email);
    let supplierId: string | undefined;
    let supplierName = supplierHint || "Unknown Supplier";

    if (options.autoMatch && supplierHint) {
      const contacts = await storage.getContacts(companyId, "supplier");
      const result = matchSupplier(
        supplierHint,
        contacts.map((c: any) => ({
          id: c.id,
          names: [c.company, c.name, `${c.firstName || ""} ${c.lastName || ""}`.trim()].filter(Boolean),
          raw: c,
        })),
      );
      if (result.match) {
        supplierId = result.match.candidate.id;
        supplierName = (result.match.candidate as any).raw?.name || supplierHint;
      }
    }

    // ── Upload ALL attachments ───────────────────────────────────────────────
    const uploadedAttachments: Array<{
      objectPath: string;
      filename: string;
      mimeType: string;
    }> = [];

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

    // ── Create ONE bill (or reuse existing draft) ────────────────────────────
    let createdBill: import("@shared/schema").Bill;

    if (options.existingBillId) {
      const existing = await storage.getBillById(options.existingBillId);
      if (!existing) throw new Error(`Existing bill ${options.existingBillId} not found`);
      createdBill = existing;
      console.log(`[autoBillCreator] Reusing existing draft bill ${existing.billNumber} for AI processing`);

      // Append any newly-uploaded attachments that aren't already present
      const existingPaths = new Set(
        ((createdBill.attachmentUrls as any[]) || []).map((a: any) => a.objectPath)
      );
      for (const u of uploadedAttachments) {
        if (!existingPaths.has(u.objectPath)) {
          await storage.appendBillAttachment(createdBill.id, {
            ...u,
            source: "email",
            uploadedAt: new Date().toISOString(),
          });
        }
      }
    } else {
      const billNumber = await storage.getNextBillNumber();

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

    // ── Run AI on the FIRST (primary) attachment ─────────────────────────────
    const primary = attachments[0];
    const primaryBase64 = Buffer.isBuffer(primary.content)
      ? primary.content.toString("base64")
      : primary.content;

    try {
      const invoiceData = await processInvoiceWithAI(primaryBase64, primary.filename);

      // Re-resolve supplier now that AI has the real name
      let aiSupplierId = supplierId;
      let aiSupplierName = invoiceData.supplierName || supplierName;

      if (options.autoMatch && invoiceData.supplierName) {
        const [supplierContacts, tradeContacts] = await Promise.all([
          storage.getContacts(companyId, "supplier"),
          storage.getContacts(companyId, "trade"),
        ]);
        const seenIds = new Set<string>();
        const contacts = [...supplierContacts, ...tradeContacts].filter((c: any) => {
          if (seenIds.has(c.id)) return false;
          seenIds.add(c.id);
          return true;
        });
        const matchResult = matchSupplier(
          invoiceData.supplierName,
          contacts.map((c: any) => ({
            id: c.id,
            names: [c.company, c.name, `${c.firstName || ""} ${c.lastName || ""}`.trim()].filter(Boolean),
            raw: c,
          })),
        );

        if (matchResult.match) {
          aiSupplierId = matchResult.match.candidate.id;
          aiSupplierName = (matchResult.match.candidate as any).raw?.name || invoiceData.supplierName;
        } else {
          const newContact = await storage.createContact({
            name: invoiceData.supplierName,
            email: invoiceData.supplierEmail || null,
            phone: invoiceData.supplierPhone || null,
            address: invoiceData.supplierAddress || null,
            contactType: "supplier",
            companyId,
          });
          aiSupplierId = newContact.id;
          aiSupplierName = newContact.name;
        }
      }

      await storage.updateBill(createdBill.id, {
        supplierId: aiSupplierId,
        status: "awaiting_approval",
        billDate: invoiceData.invoiceDate ? new Date(invoiceData.invoiceDate) : new Date(),
        dueDate: invoiceData.dueDate ? new Date(invoiceData.dueDate) : undefined,
        billReference: invoiceData.invoiceNumber,
        subtotal: invoiceData.subtotalAmount || 0,
        tax: invoiceData.totalTax || 0,
        total: invoiceData.totalAmount || 0,
        ocrProcessed: true,
        ocrData: invoiceData as any,
      });

      if (invoiceData.lineItems && invoiceData.lineItems.length > 0) {
        const costCodes = await storage.getCostCodes(projectId!);
        const defaultCostCode = costCodes.find(cc => cc.isActive);

        for (let i = 0; i < invoiceData.lineItems.length; i++) {
          const item = invoiceData.lineItems[i];
          const lineItemData: InsertBillLineItem = {
            billId: createdBill.id,
            lineType: "custom",
            description: item.description || `Line Item ${i + 1}`,
            costCodeId: defaultCostCode?.id,
            quantity: item.quantity || 1,
            unitPrice: item.unitPrice || 0,
            tax: item.taxAmount ? "GST on expenses" : "No GST",
            account: "Expenses",
            total: item.totalAmount || 0,
            order: i,
          };
          await storage.createBillLineItem(lineItemData);
        }
      }

      const project = await storage.getProject(projectId!);
      const attachCount = attachments.length;
      console.log(`[autoBillCreator] Bill ${createdBill.billNumber} created with ${attachCount} attachment(s), AI processed from "${primary.filename}"`);

      return {
        success: true,
        billId: createdBill.id,
        billNumber: createdBill.billNumber,
        supplierName: aiSupplierName,
        projectName: project?.name,
        total: invoiceData.totalAmount || 0,
      };
    } catch (aiError: any) {
      console.error("autoBillCreator: AI extraction failed, bill saved as draft:", aiError.message);
      const project = await storage.getProject(projectId!);
      return {
        success: true,
        billId: createdBill.id,
        billNumber: createdBill.billNumber,
        supplierName,
        projectName: project?.name,
        total: 0,
      };
    }
  }
}

let autoBillCreatorService: AutoBillCreatorService | null = null;

export function getAutoBillCreatorService(): AutoBillCreatorService {
  if (!autoBillCreatorService) {
    autoBillCreatorService = new AutoBillCreatorService();
  }
  return autoBillCreatorService;
}
