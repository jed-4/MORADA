import * as mindee from "mindee";

// Mindee invoice OCR types
export interface MindeeInvoiceData {
  invoiceNumber?: string;
  invoiceDate?: string;
  dueDate?: string;
  supplierName?: string;
  supplierAddress?: string;
  supplierEmail?: string;
  supplierPhone?: string;
  totalAmount?: number;
  totalTax?: number;
  subtotalAmount?: number;
  lineItems?: Array<{
    description?: string;
    quantity?: number;
    unitPrice?: number;
    totalAmount?: number;
    taxAmount?: number;
  }>;
  currency?: string;
  confidence?: number;
}

export class MindeeOCRService {
  private client: mindee.Client;

  constructor() {
    const apiKey = process.env.MINDEE_API_KEY;
    if (!apiKey) {
      throw new Error("MINDEE_API_KEY environment variable is not set");
    }
    this.client = new mindee.Client({ apiKey });
  }

  async extractInvoiceData(fileBuffer: Buffer, fileName: string): Promise<MindeeInvoiceData> {
    try {
      // Create input from buffer
      const inputSource = this.client.docFromBuffer(fileBuffer, fileName);

      // Parse using Mindee's Invoice API
      const apiResponse = await this.client.parse(
        mindee.product.InvoiceV4,
        inputSource
      );

      const invoice = apiResponse.document.inference.prediction;

      // Extract line items
      const lineItems = invoice.lineItems.map((item: any) => ({
        description: item.description?.value || "",
        quantity: item.quantity?.value || 1,
        unitPrice: item.unitPrice?.value || 0,
        totalAmount: item.totalAmount?.value || 0,
        taxAmount: item.tax?.value || 0,
      }));

      // Convert to our format (cents for monetary values)
      const result: MindeeInvoiceData = {
        invoiceNumber: invoice.invoiceNumber?.value || undefined,
        invoiceDate: invoice.date?.value || undefined,
        dueDate: invoice.dueDate?.value || undefined,
        supplierName: invoice.supplierName?.value || undefined,
        supplierAddress: invoice.supplierAddress?.value || undefined,
        supplierEmail: undefined,
        supplierPhone: undefined,
        // Convert from dollars to cents
        totalAmount: invoice.totalAmount?.value ? Math.round(invoice.totalAmount.value * 100) : undefined,
        totalTax: invoice.totalTax?.value ? Math.round(invoice.totalTax.value * 100) : undefined,
        subtotalAmount: invoice.totalNet?.value ? Math.round(invoice.totalNet.value * 100) : undefined,
        lineItems: lineItems.map((item: any) => ({
          ...item,
          unitPrice: Math.round((item.unitPrice || 0) * 100),
          totalAmount: Math.round((item.totalAmount || 0) * 100),
          taxAmount: Math.round((item.taxAmount || 0) * 100),
        })),
        currency: invoice.locale?.currency || "AUD",
        confidence: 0,
      };

      return result;
    } catch (error: any) {
      console.error("Mindee OCR Error:", error);
      throw new Error(`Failed to process invoice with OCR: ${error.message}`);
    }
  }

  async processInvoiceFromBase64(base64Data: string, fileName: string): Promise<MindeeInvoiceData> {
    // Remove data URL prefix if present
    const base64Clean = base64Data.replace(/^data:.*?;base64,/, "");
    const buffer = Buffer.from(base64Clean, "base64");
    return this.extractInvoiceData(buffer, fileName);
  }
}

// Singleton instance
let ocrService: MindeeOCRService | null = null;

export function getOCRService(): MindeeOCRService {
  if (!ocrService) {
    ocrService = new MindeeOCRService();
  }
  return ocrService;
}
