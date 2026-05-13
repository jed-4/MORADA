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
  async processEmailInvoices(
    email: ParsedEmail,
    options: AutoBillOptions
  ): Promise<AutoBillResult[]> {
    const emailParser = getEmailParserService();

    const invoiceAttachments = emailParser.filterInvoiceAttachments(email.attachments);

    if (invoiceAttachments.length === 0) {
      return [{
        success: false,
        error: "No invoice attachments found (PDF or images)",
      }];
    }

    const results: AutoBillResult[] = [];

    for (const attachment of invoiceAttachments) {
      try {
        const result = await this.createBillFromAttachment(
          attachment.content,
          attachment.filename,
          email,
          options
        );
        results.push(result);
      } catch (error: any) {
        results.push({
          success: false,
          error: `Failed to process ${attachment.filename}: ${error.message}`,
        });
      }
    }

    return results;
  }

  private async createBillFromAttachment(
    fileContent: Buffer | string,
    fileName: string,
    email: ParsedEmail,
    options: AutoBillOptions
  ): Promise<AutoBillResult> {
    const emailParser = getEmailParserService();

    const base64Data = Buffer.isBuffer(fileContent)
      ? fileContent.toString("base64")
      : fileContent;

    const fileBuffer = Buffer.isBuffer(fileContent)
      ? fileContent
      : Buffer.from(fileContent, "base64");

    // ── Resolve company ──────────────────────────────────────────────────────
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

    // ── Resolve supplier (hint only — no AI yet) ─────────────────────────────
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

    // ── STEP 1: Upload attachment ─────────────────────────────────────────────
    let attachmentUrl: string | undefined;
    try {
      const privateDir = process.env.PRIVATE_OBJECT_DIR || "";
      if (privateDir) {
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
        attachmentUrl = `/objects/company/${companyId}/uploads/${objectNameSuffix}`;
      }
    } catch (uploadErr: any) {
      console.error("autoBillCreator: failed to upload invoice attachment:", uploadErr.message);
    }

    // ── STEP 1: Create draft bill (or reuse existing unprocessed draft) ──────
    let createdBill: import("@shared/schema").Bill;

    if (options.existingBillId) {
      // Reuse the draft that was created in a previous failed attempt
      const existing = await storage.getBillById(options.existingBillId);
      if (!existing) throw new Error(`Existing bill ${options.existingBillId} not found`);
      createdBill = existing;
      console.log(`[autoBillCreator] Reusing existing draft bill ${existing.billNumber} for AI processing`);

      // Upload attachment if not already present
      if (attachmentUrl) {
        const existingUrls = (createdBill.attachmentUrls as any[]) || [];
        if (existingUrls.length === 0) {
          await storage.appendBillAttachment(createdBill.id, {
            objectPath: attachmentUrl,
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

      // Attach the uploaded file immediately so it's accessible even if AI fails
      if (attachmentUrl) {
        await storage.appendBillAttachment(createdBill.id, {
          objectPath: attachmentUrl,
          source: "email",
          uploadedAt: new Date().toISOString(),
        });
      }
    }

    // ── STEP 2: Run AI on attachment, update bill → awaiting_approval ─────────
    try {
      const invoiceData = await processInvoiceWithAI(base64Data, fileName);

      // Re-resolve supplier now that AI has the real supplier name
      let aiSupplierId = supplierId;
      let aiSupplierName = invoiceData.supplierName || supplierName;

      if (options.autoMatch && invoiceData.supplierName) {
        const contacts = await storage.getContacts(companyId, "supplier");
        const result = matchSupplier(
          invoiceData.supplierName,
          contacts.map((c: any) => ({
            id: c.id,
            names: [c.company, c.name, `${c.firstName || ""} ${c.lastName || ""}`.trim()].filter(Boolean),
            raw: c,
          })),
        );

        if (result.match) {
          aiSupplierId = result.match.candidate.id;
          aiSupplierName = (result.match.candidate as any).raw?.name || invoiceData.supplierName;
        } else {
          // Auto-create the supplier as a contact
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

      // Update the draft bill with AI-extracted data and promote to awaiting_approval
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

      // Create line items
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
      // Bill remains as draft with the attachment — user can manually process it
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
