import type { MindeeInvoiceData } from "./ocr";
import { exec } from "child_process";
import { promisify } from "util";
import * as fs from "fs";
import * as path from "path";
import * as os from "os";

const execAsync = promisify(exec);

interface AIInvoiceResponse {
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
}

const INVOICE_EXTRACTION_PROMPT = `You are an expert invoice/bill data extraction system. Analyze the provided document image and extract all relevant invoice data.

Return a JSON object with the following structure. All monetary values should be in their original dollar amounts (NOT cents):

{
  "invoiceNumber": "string or null",
  "invoiceDate": "YYYY-MM-DD format or null",
  "dueDate": "YYYY-MM-DD format or null",
  "supplierName": "vendor/supplier company name or null",
  "supplierAddress": "full supplier address or null",
  "supplierEmail": "supplier email or null",
  "supplierPhone": "supplier phone number or null",
  "totalAmount": number or null (total amount including tax, in dollars),
  "totalTax": number or null (total GST/tax amount, in dollars),
  "subtotalAmount": number or null (subtotal before tax, in dollars),
  "lineItems": [
    {
      "description": "item description",
      "quantity": number or null,
      "unitPrice": number or null (in dollars),
      "totalAmount": number or null (line total in dollars),
      "taxAmount": number or null (line tax in dollars)
    }
  ],
  "currency": "3-letter currency code like AUD, USD, etc. Default to AUD if not specified"
}

Rules:
- Extract ALL line items visible on the invoice/bill document
- If a field is not found, set it to null
- Dates must be in YYYY-MM-DD format. If dates use Australian DD/MM/YYYY format, convert them correctly (e.g., 15/03/2025 becomes 2025-03-15)
- Monetary values are numbers (not strings), in dollars (e.g., 150.00 not 15000)
- For quantity, default to 1 if not explicitly stated
- Look for GST, VAT, or tax amounts. Australian invoices typically have 10% GST
- If you see a tax invoice, statement, or bill - extract ALL data from it even if quality is low
- If the document contains a table of items/charges, extract each row as a line item
- For multi-page documents, combine data from all pages
- Return ONLY valid JSON, no markdown or explanation
- IMPORTANT: Always try your best to extract data. Even if the image quality is poor, extract whatever you can see`;

function getMimeType(fileName: string): string {
  const ext = fileName.toLowerCase().split('.').pop();
  switch (ext) {
    case 'pdf': return 'application/pdf';
    case 'png': return 'image/png';
    case 'jpg':
    case 'jpeg': return 'image/jpeg';
    case 'gif': return 'image/gif';
    case 'webp': return 'image/webp';
    case 'tiff':
    case 'tif': return 'image/tiff';
    default: return 'image/jpeg';
  }
}

async function convertPdfToImages(pdfBuffer: Buffer): Promise<string[]> {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "bill-pdf-"));
  const pdfPath = path.join(tmpDir, "input.pdf");
  fs.writeFileSync(pdfPath, pdfBuffer);

  const outputPrefix = path.join(tmpDir, "page");
  await execAsync(`pdftoppm -png -r 200 -l 3 "${pdfPath}" "${outputPrefix}"`);

  const files = fs.readdirSync(tmpDir)
    .filter(f => f.startsWith("page") && f.endsWith(".png"))
    .sort()
    .slice(0, 3);

  const base64Images = files.map(f => {
    const imgBuffer = fs.readFileSync(path.join(tmpDir, f));
    return `data:image/png;base64,${imgBuffer.toString("base64")}`;
  });

  fs.rmSync(tmpDir, { recursive: true, force: true });
  return base64Images;
}

export async function processInvoiceWithAI(base64Data: string, fileName: string): Promise<MindeeInvoiceData> {
  const OpenAI = (await import('openai')).default;
  const openai = new OpenAI({
    baseURL: process.env.AI_INTEGRATIONS_OPENAI_BASE_URL,
    apiKey: process.env.AI_INTEGRATIONS_OPENAI_API_KEY,
  });

  const base64Clean = base64Data.replace(/^data:.*?;base64,/, "");
  const mimeType = getMimeType(fileName);
  const isPdf = mimeType === "application/pdf";

  let imageContent: Array<{ type: "image_url"; image_url: { url: string; detail: "high" } }> = [];

  if (isPdf) {
    const pdfBuffer = Buffer.from(base64Clean, "base64");
    const pageImages = await convertPdfToImages(pdfBuffer);
    if (pageImages.length === 0) {
      throw new Error("Failed to convert PDF to images for processing");
    }
    imageContent = pageImages.map(dataUrl => ({
      type: "image_url" as const,
      image_url: { url: dataUrl, detail: "high" as const },
    }));
  } else {
    const dataUrl = `data:${mimeType};base64,${base64Clean}`;
    imageContent = [{
      type: "image_url" as const,
      image_url: { url: dataUrl, detail: "high" as const },
    }];
  }

  const response = await openai.chat.completions.create({
    model: "gpt-4o",
    messages: [
      {
        role: "user",
        content: [
          { type: "text", text: INVOICE_EXTRACTION_PROMPT },
          ...imageContent,
        ],
      },
    ],
    max_tokens: 4096,
    temperature: 0,
  });

  const content = response.choices[0]?.message?.content;
  if (!content) {
    throw new Error("No response from AI model");
  }

  console.log("[AI Bill Reader] Raw AI response length:", content.length);
  console.log("[AI Bill Reader] Response preview:", content.substring(0, 500));

  let parsed: AIInvoiceResponse;
  try {
    const jsonMatch = content.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      console.error("[AI Bill Reader] No JSON found in response:", content);
      throw new Error("No JSON found in response");
    }
    parsed = JSON.parse(jsonMatch[0]);
    console.log("[AI Bill Reader] Parsed successfully - supplier:", parsed.supplierName, "lines:", parsed.lineItems?.length || 0);
  } catch (e: any) {
    console.error("[AI Bill Reader] Failed to parse AI response:", content);
    throw new Error(`Failed to parse AI invoice response: ${e.message}`);
  }

  const toCents = (val: number | undefined | null): number | undefined => {
    if (val === undefined || val === null) return undefined;
    return Math.round(val * 100);
  };

  const result: MindeeInvoiceData = {
    invoiceNumber: parsed.invoiceNumber || undefined,
    invoiceDate: parsed.invoiceDate || undefined,
    dueDate: parsed.dueDate || undefined,
    supplierName: parsed.supplierName || undefined,
    supplierAddress: parsed.supplierAddress || undefined,
    supplierEmail: parsed.supplierEmail || undefined,
    supplierPhone: parsed.supplierPhone || undefined,
    totalAmount: toCents(parsed.totalAmount),
    totalTax: toCents(parsed.totalTax),
    subtotalAmount: toCents(parsed.subtotalAmount),
    lineItems: parsed.lineItems?.map(item => ({
      description: item.description || undefined,
      quantity: item.quantity ?? 1,
      unitPrice: toCents(item.unitPrice),
      totalAmount: toCents(item.totalAmount),
      taxAmount: toCents(item.taxAmount),
    })),
    currency: parsed.currency || "AUD",
    confidence: 0.95,
  };

  return result;
}
