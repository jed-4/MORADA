import { processInvoiceWithAI } from "./aiBillReader";
import { getEmailParserService, type ParsedEmail } from "./emailParser";
import { storage } from "../storage";
import type { InsertBill, InsertBillLineItem } from "@shared/schema";
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
  defaultUserId: string;
  companyId?: string;
  autoMatch: boolean;
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
      ? fileContent.toString('base64')
      : fileContent;

    const invoiceData = await processInvoiceWithAI(base64Data, fileName);

    let projectId = options.defaultProjectId;
    if (!projectId) {
      const projectHint = emailParser.extractProjectHint(email);
      if (projectHint && options.autoMatch) {
        const projects = await storage.getProjects();
        const matchedProject = projects.find(p =>
          p.name.toLowerCase().includes(projectHint.toLowerCase())
        );
        if (matchedProject) {
          projectId = matchedProject.id;
        }
      }

      if (!projectId) {
        const projects = await storage.getProjects();
        const activeProject = projects.find(p => p.isActive);
        if (activeProject) {
          projectId = activeProject.id;
        } else {
          throw new Error("No active project found. Please set a default project.");
        }
      }
    }

    let supplierId: string | undefined;
    let supplierName = invoiceData.supplierName || emailParser.extractSupplierHint(email) || "Unknown Supplier";

    if (options.autoMatch && invoiceData.supplierName) {
      const suppliers = await storage.getSuppliers();
      const matchedSupplier = suppliers.find(s =>
        s.name.toLowerCase() === invoiceData.supplierName!.toLowerCase()
      );

      if (matchedSupplier) {
        supplierId = matchedSupplier.id;
        supplierName = matchedSupplier.name;
      } else {
        const newSupplier = await storage.createSupplier({
          name: invoiceData.supplierName,
          email: invoiceData.supplierEmail,
          phone: invoiceData.supplierPhone,
          address: invoiceData.supplierAddress,
          isActive: true,
        });
        supplierId = newSupplier.id;
        supplierName = newSupplier.name;
      }
    } else {
      const suppliers = await storage.getSuppliers();
      if (suppliers.length > 0) {
        supplierId = suppliers[0].id;
        supplierName = suppliers[0].name;
      } else {
        throw new Error("No suppliers found. Please create at least one supplier.");
      }
    }

    const billNumber = await storage.getNextBillNumber();

    const billData: InsertBill = {
      billNumber,
      projectId,
      supplierId,
      billType: "bill",
      status: "draft",
      billDate: invoiceData.invoiceDate ? new Date(invoiceData.invoiceDate) : new Date(),
      dueDate: invoiceData.dueDate ? new Date(invoiceData.dueDate) : undefined,
      billReference: invoiceData.invoiceNumber,
      notes: `Auto-created from email: ${email.subject}\nFrom: ${email.from}`,
      subtotal: invoiceData.subtotalAmount || 0,
      tax: invoiceData.totalTax || 0,
      total: invoiceData.totalAmount || 0,
      paidAmount: 0,
      sendToXero: false,
      ocrProcessed: true,
      ocrData: invoiceData as any,
      attachmentUrls: [],
      createdById: options.defaultUserId,
    };

    const createdBill = await storage.createBill(billData);

    // Upload the original invoice document to object storage so it's accessible
    // as a bill attachment for future reference (regardless of the OCR section).
    try {
      const privateDir = process.env.PRIVATE_OBJECT_DIR || "";
      if (privateDir) {
        const dirParts = privateDir.replace(/^\//, "").split("/");
        const bucketName = dirParts[0];
        const dirPrefix = dirParts.slice(1).join("/");
        const objectId = randomUUID();
        const ext = fileName.split(".").pop()?.toLowerCase() || "";
        const objectNameSuffix = ext ? `${objectId}.${ext}` : objectId;
        const objectName = dirPrefix ? `${dirPrefix}/uploads/${objectNameSuffix}` : `uploads/${objectNameSuffix}`;
        const fileBuffer = Buffer.isBuffer(fileContent)
          ? fileContent
          : Buffer.from(fileContent, "base64");
        const contentType =
          ext === "pdf" ? "application/pdf" :
          ext === "png" ? "image/png" :
          ["jpg", "jpeg"].includes(ext) ? "image/jpeg" : "application/octet-stream";
        await objectStorageClient.bucket(bucketName).file(objectName).save(fileBuffer, {
          metadata: { contentType },
        });
        const companyId = options.companyId;
        const attachmentUrl = companyId
          ? `/objects/company/${companyId}/uploads/${objectNameSuffix}`
          : `/objects/uploads/${objectNameSuffix}`;
        await storage.updateBill(createdBill.id, { attachmentUrls: [attachmentUrl] });
      }
    } catch (uploadErr: any) {
      console.error("autoBillCreator: failed to upload invoice attachment:", uploadErr.message);
    }

    if (invoiceData.lineItems && invoiceData.lineItems.length > 0) {
      const costCodes = await storage.getCostCodes(projectId);
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

    const project = await storage.getProject(projectId);

    return {
      success: true,
      billId: createdBill.id,
      billNumber: createdBill.billNumber,
      supplierName,
      projectName: project?.name,
      total: createdBill.total,
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
