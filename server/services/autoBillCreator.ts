import { getOCRService } from "./ocr";
import { getEmailParserService, type ParsedEmail } from "./emailParser";
import { storage } from "../storage";
import type { InsertBill, InsertBillLineItem } from "@shared/schema";

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
  autoMatch: boolean;
}

export class AutoBillCreatorService {
  /**
   * Process email and create bills from attachments
   */
  async processEmailInvoices(
    email: ParsedEmail,
    options: AutoBillOptions
  ): Promise<AutoBillResult[]> {
    const emailParser = getEmailParserService();
    const ocrService = getOCRService();
    
    // Filter to invoice-like attachments
    const invoiceAttachments = emailParser.filterInvoiceAttachments(email.attachments);
    
    if (invoiceAttachments.length === 0) {
      return [{
        success: false,
        error: "No invoice attachments found (PDF or images)",
      }];
    }

    const results: AutoBillResult[] = [];

    // Process each attachment
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

  /**
   * Create a bill from a single attachment
   */
  private async createBillFromAttachment(
    fileContent: Buffer | string,
    fileName: string,
    email: ParsedEmail,
    options: AutoBillOptions
  ): Promise<AutoBillResult> {
    const ocrService = getOCRService();
    const emailParser = getEmailParserService();

    // Convert to base64 if buffer
    const base64Data = Buffer.isBuffer(fileContent)
      ? fileContent.toString('base64')
      : fileContent;

    // Run OCR
    const ocrData = await ocrService.processInvoiceFromBase64(base64Data, fileName);

    // Determine project
    let projectId = options.defaultProjectId;
    if (!projectId) {
      // Try to find project from email hints
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
      
      // Fallback to first active project
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

    // Match or create supplier
    let supplierId: string | undefined;
    let supplierName = ocrData.supplierName || emailParser.extractSupplierHint(email) || "Unknown Supplier";

    if (options.autoMatch && ocrData.supplierName) {
      const suppliers = await storage.getSuppliers();
      const matchedSupplier = suppliers.find(s => 
        s.name.toLowerCase() === ocrData.supplierName!.toLowerCase()
      );
      
      if (matchedSupplier) {
        supplierId = matchedSupplier.id;
        supplierName = matchedSupplier.name;
      } else {
        // Create new supplier
        const newSupplier = await storage.createSupplier({
          name: ocrData.supplierName,
          email: ocrData.supplierEmail,
          phone: ocrData.supplierPhone,
          address: ocrData.supplierAddress,
          isActive: true,
        });
        supplierId = newSupplier.id;
        supplierName = newSupplier.name;
      }
    } else {
      // Use first supplier as fallback
      const suppliers = await storage.getSuppliers();
      if (suppliers.length > 0) {
        supplierId = suppliers[0].id;
        supplierName = suppliers[0].name;
      } else {
        throw new Error("No suppliers found. Please create at least one supplier.");
      }
    }

    const billNumber = await storage.getNextBillNumber();

    // Create bill
    const billData: InsertBill = {
      billNumber,
      projectId,
      supplierId,
      billType: "bill",
      status: "draft",
      billDate: ocrData.invoiceDate ? new Date(ocrData.invoiceDate) : new Date(),
      dueDate: ocrData.dueDate ? new Date(ocrData.dueDate) : undefined,
      billReference: ocrData.invoiceNumber,
      notes: `Auto-created from email: ${email.subject}\nFrom: ${email.from}`,
      subtotal: ocrData.subtotalAmount || 0,
      tax: ocrData.totalTax || 0,
      total: ocrData.totalAmount || 0,
      paidAmount: 0,
      sendToXero: false,
      ocrProcessed: true,
      ocrData: ocrData as any,
      attachmentUrls: [], // Would store file URL here if we had file storage
      createdById: options.defaultUserId,
    };

    const createdBill = await storage.createBill(billData);

    // Create line items if OCR extracted them
    if (ocrData.lineItems && ocrData.lineItems.length > 0) {
      // Get first available cost code for the project
      const costCodes = await storage.getCostCodes(projectId);
      const defaultCostCode = costCodes.find(cc => cc.isActive);

      for (let i = 0; i < ocrData.lineItems.length; i++) {
        const item = ocrData.lineItems[i];
        
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

// Singleton instance
let autoBillCreatorService: AutoBillCreatorService | null = null;

export function getAutoBillCreatorService(): AutoBillCreatorService {
  if (!autoBillCreatorService) {
    autoBillCreatorService = new AutoBillCreatorService();
  }
  return autoBillCreatorService;
}
