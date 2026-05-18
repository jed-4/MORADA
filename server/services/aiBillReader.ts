export interface InvoiceData {
  invoiceNumber?: string;
  invoiceDate?: string;
  dueDate?: string;
  supplierName?: string;
  supplierAbn?: string;
  supplierAddress?: string;
  supplierEmail?: string;
  supplierPhone?: string;
  siteAddress?: string;
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

import { exec } from "child_process";
import { promisify } from "util";
import * as fs from "fs";
import * as path from "path";
import * as os from "os";

const execAsync = promisify(exec);

// ─── Stage 1: PDF text extraction ───────────────────────────────────────────

async function extractTextFromPdf(pdfBuffer: Buffer): Promise<string> {
  try {
    const pdfParse = (await import("pdf-parse")).default;
    const data = await pdfParse(pdfBuffer, { max: 3 });
    return data.text ?? "";
  } catch {
    return "";
  }
}

// ─── Stage 2: Regex extraction for structured fields ────────────────────────

interface RegexExtractedFields {
  abn?: string;
  invoiceNumber?: string;
  invoiceDate?: string;
  dueDate?: string;
  totalAmountIncGst?: number;
  gstAmount?: number;
  subtotal?: number;
}

function parseDateString(dateStr: string): string {
  // DD/MM/YYYY or DD-MM-YYYY
  const dmyMatch = dateStr.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{2,4})$/);
  if (dmyMatch) {
    const [, d, m, y] = dmyMatch;
    const year = y.length === 2 ? `20${y}` : y;
    return `${year}-${m.padStart(2, "0")}-${d.padStart(2, "0")}`;
  }
  // D MMM YYYY (e.g. 5 Mar 2025)
  const monthNames: Record<string, string> = {
    jan: "01", feb: "02", mar: "03", apr: "04", may: "05", jun: "06",
    jul: "07", aug: "08", sep: "09", oct: "10", nov: "11", dec: "12",
  };
  const dmonthMatch = dateStr.match(/^(\d{1,2})\s+(\w{3,9})\s+(\d{4})$/i);
  if (dmonthMatch) {
    const [, d, mon, y] = dmonthMatch;
    const m = monthNames[mon.slice(0, 3).toLowerCase()];
    if (m) return `${y}-${m}-${d.padStart(2, "0")}`;
  }
  // YYYY-MM-DD already
  if (/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) return dateStr;
  return dateStr;
}

function extractFieldsWithRegex(text: string): RegexExtractedFields {
  const result: RegexExtractedFields = {};

  // ABN: 11 digits with optional spaces
  const abnMatch = text.match(/ABN[:\s]+(\d{2}\s?\d{3}\s?\d{3}\s?\d{3})/i);
  if (abnMatch) result.abn = abnMatch[1].replace(/\s/g, "");

  // Invoice number
  const invMatch = text.match(
    /(?:invoice\s*(?:no|number|#)[:\s]*|inv[:\s#-]+)([A-Z0-9-]{2,20})/i,
  );
  if (invMatch) result.invoiceNumber = invMatch[1].trim();

  // Invoice date
  const datePatterns = [
    /(?:invoice\s+date|date\s+of\s+invoice|tax\s+invoice\s+date|date)[:\s]+(\d{1,2}[\/\-]\d{1,2}[\/\-]\d{2,4})/i,
    /(?:invoice\s+date|date)[:\s]+(\d{1,2}\s+\w+\s+\d{4})/i,
  ];
  for (const pattern of datePatterns) {
    const match = text.match(pattern);
    if (match) { result.invoiceDate = parseDateString(match[1]); break; }
  }

  // Due date
  const dueDateMatch = text.match(
    /(?:due\s+date|payment\s+due|due\s+by)[:\s]+(\d{1,2}[\/\-]\d{1,2}[\/\-]\d{2,4})/i,
  );
  if (dueDateMatch) result.dueDate = parseDateString(dueDateMatch[1]);

  // GST amount
  const gstMatch = text.match(/(?:(?:total\s+)?gst|tax\s+amount)[:\s]+\$?\s*([\d,]+\.?\d{0,2})/i);
  if (gstMatch) result.gstAmount = parseFloat(gstMatch[1].replace(/,/g, ""));

  // Total inc GST — try specific labels first, then generic "Total"
  const totalPatterns = [
    /(?:total\s+amount|amount\s+due|balance\s+due|total\s+inc\.?\s*gst|total\s+payable)[:\s]+\$?\s*([\d,]+\.?\d{0,2})/i,
    /\btotal\b[:\s]+\$?\s*([\d,]+\.?\d{0,2})/i,
  ];
  for (const pattern of totalPatterns) {
    const match = text.match(pattern);
    if (match) { result.totalAmountIncGst = parseFloat(match[1].replace(/,/g, "")); break; }
  }

  // Subtotal (ex GST)
  const subtotalMatch = text.match(
    /(?:subtotal|sub\s*total|total\s+ex\.?\s*gst|amount\s+ex\.?\s*gst)[:\s]+\$?\s*([\d,]+\.?\d{0,2})/i,
  );
  if (subtotalMatch) result.subtotal = parseFloat(subtotalMatch[1].replace(/,/g, ""));

  return result;
}

// ─── Stage 3: Small AI model for semantic fields ─────────────────────────────

interface AIInvoiceResponse {
  invoiceNumber?: string;
  invoiceDate?: string;
  dueDate?: string;
  supplierName?: string;
  supplierAbn?: string;
  supplierAddress?: string;
  supplierEmail?: string;
  supplierPhone?: string;
  siteAddress?: string;
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

async function extractSemanticFields(
  rawText: string,
  alreadyExtracted: RegexExtractedFields,
): Promise<AIInvoiceResponse> {
  const OpenAI = (await import("openai")).default;
  const openai = new OpenAI({
    baseURL: process.env.AI_INTEGRATIONS_OPENAI_BASE_URL,
    apiKey: process.env.AI_INTEGRATIONS_OPENAI_API_KEY,
  });

  const knownLines: string[] = [];
  if (alreadyExtracted.abn) knownLines.push(`ABN already found: ${alreadyExtracted.abn} — do not re-extract.`);
  if (alreadyExtracted.invoiceNumber) knownLines.push(`Invoice number already found: ${alreadyExtracted.invoiceNumber} — do not re-extract.`);
  if (alreadyExtracted.invoiceDate) knownLines.push(`Invoice date already found: ${alreadyExtracted.invoiceDate} — do not re-extract.`);
  if (alreadyExtracted.dueDate) knownLines.push(`Due date already found: ${alreadyExtracted.dueDate} — do not re-extract.`);
  if (alreadyExtracted.totalAmountIncGst) knownLines.push(`Total (inc GST) already found: ${alreadyExtracted.totalAmountIncGst} — do not re-extract.`);
  if (alreadyExtracted.gstAmount) knownLines.push(`GST amount already found: ${alreadyExtracted.gstAmount} — do not re-extract.`);
  if (alreadyExtracted.subtotal) knownLines.push(`Subtotal already found: ${alreadyExtracted.subtotal} — do not re-extract.`);

  const prompt = `Extract the following fields from this invoice text. Return JSON only, no explanation or markdown.

${knownLines.length > 0 ? `Already extracted (do NOT re-extract these):\n${knownLines.join("\n")}\n` : ""}
Fields to extract:
- supplierName: the trading/company name of the business SENDING this invoice — from their letterhead or "From:" block, NOT the recipient
${!alreadyExtracted.abn ? "- supplierAbn: ABN of the supplier, digits only (e.g. \"12345678901\"), null if not found" : ""}
- supplierAddress: supplier's business/office address, null if not found
- supplierEmail: supplier's contact email, null if not found
- supplierPhone: supplier's contact phone, null if not found
- siteAddress: job site / delivery address where work was performed — often labelled "Site:", "Job Address:", or "Delivery Address:". null if not found
${!alreadyExtracted.invoiceNumber ? '- invoiceNumber: invoice/bill reference number, null if not found' : ""}
${!alreadyExtracted.invoiceDate ? '- invoiceDate: invoice date in YYYY-MM-DD format, null if not found' : ""}
${!alreadyExtracted.dueDate ? '- dueDate: payment due date in YYYY-MM-DD format, null if not found' : ""}
${!alreadyExtracted.totalAmountIncGst ? '- totalAmount: total amount due including GST, as a number in dollars, null if not found' : ""}
${!alreadyExtracted.gstAmount ? '- totalTax: GST/tax amount, as a number in dollars, null if not found' : ""}
${!alreadyExtracted.subtotal ? '- subtotalAmount: subtotal before GST, as a number in dollars, null if not found' : ""}
- currency: 3-letter currency code, default "AUD"
- lineItems: array of { description, quantity, unitPrice, totalAmount, taxAmount } — all monetary values in dollars

Invoice text:
---
${rawText.substring(0, 4000)}
---

Return ONLY valid JSON. No markdown fences.`;

  const response = await openai.chat.completions.create({
    model: "gpt-4o-mini",
    messages: [{ role: "user", content: prompt }],
    max_tokens: 2048,
    temperature: 0,
  });

  const content = response.choices[0]?.message?.content ?? "";
  const jsonMatch = content.match(/\{[\s\S]*\}/);
  if (!jsonMatch) {
    console.error("[AI Bill Reader] No JSON in semantic AI response:", content.substring(0, 300));
    throw new Error("No JSON found in semantic AI response");
  }
  return JSON.parse(jsonMatch[0]);
}

// ─── Vision fallback (existing behaviour for scanned/image PDFs) ─────────────

const VISION_EXTRACTION_PROMPT = `You are an expert invoice/bill data extraction system. Analyze the provided document image and extract all relevant invoice data.

Return a JSON object with the following structure. All monetary values should be in their original dollar amounts (NOT cents):

{
  "invoiceNumber": "string or null",
  "invoiceDate": "YYYY-MM-DD format or null",
  "dueDate": "YYYY-MM-DD format or null",
  "supplierName": "the trading name or company name of the business sending this invoice, as printed on the invoice letterhead or 'From:' / sender block — NOT the recipient",
  "supplierAbn": "ABN (Australian Business Number) of the supplier if present on the invoice — digits only, no spaces (e.g. '12345678901'). null if not found",
  "supplierAddress": "full supplier address of the supplier/vendor (their business address) or null",
  "supplierEmail": "supplier email or null",
  "supplierPhone": "supplier phone number or null",
  "siteAddress": "the delivery/job site/installation address where work was performed or materials delivered — often labelled 'Site:', 'Job Address:', 'Delivery Address:', or appears in invoice description. null if not found",
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
  const ext = fileName.toLowerCase().split(".").pop();
  switch (ext) {
    case "pdf": return "application/pdf";
    case "png": return "image/png";
    case "jpg":
    case "jpeg": return "image/jpeg";
    case "gif": return "image/gif";
    case "webp": return "image/webp";
    case "tiff":
    case "tif": return "image/tiff";
    default: return "image/jpeg";
  }
}

async function convertPdfToImages(pdfBuffer: Buffer): Promise<string[]> {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "bill-pdf-"));
  const pdfPath = path.join(tmpDir, "input.pdf");
  fs.writeFileSync(pdfPath, pdfBuffer);

  const outputPrefix = path.join(tmpDir, "page");
  await execAsync(`pdftoppm -png -r 150 -l 3 "${pdfPath}" "${outputPrefix}"`);

  const files = fs
    .readdirSync(tmpDir)
    .filter((f) => f.startsWith("page") && f.endsWith(".png"))
    .sort()
    .slice(0, 3);

  const base64Images = files.map((f) => {
    const imgBuffer = fs.readFileSync(path.join(tmpDir, f));
    return `data:image/png;base64,${imgBuffer.toString("base64")}`;
  });

  fs.rmSync(tmpDir, { recursive: true, force: true });
  return base64Images;
}

async function extractWithVision(pdfBuffer: Buffer): Promise<AIInvoiceResponse> {
  const OpenAI = (await import("openai")).default;
  const openai = new OpenAI({
    baseURL: process.env.AI_INTEGRATIONS_OPENAI_BASE_URL,
    apiKey: process.env.AI_INTEGRATIONS_OPENAI_API_KEY,
  });

  const pageImages = await convertPdfToImages(pdfBuffer);
  if (pageImages.length === 0) {
    throw new Error("Failed to convert scanned PDF to images for vision processing");
  }

  const imageContent = pageImages.map((dataUrl) => ({
    type: "image_url" as const,
    image_url: { url: dataUrl, detail: "auto" as const },
  }));

  const response = await openai.chat.completions.create({
    model: "gpt-4o",
    messages: [
      {
        role: "user",
        content: [{ type: "text", text: VISION_EXTRACTION_PROMPT }, ...imageContent],
      },
    ],
    max_tokens: 4096,
    temperature: 0,
  });

  const content = response.choices[0]?.message?.content ?? "";
  const jsonMatch = content.match(/\{[\s\S]*\}/);
  if (!jsonMatch) {
    console.error("[AI Bill Reader] No JSON in vision response:", content.substring(0, 300));
    throw new Error("No JSON found in vision AI response");
  }
  return JSON.parse(jsonMatch[0]);
}

// ─── Non-PDF image extraction (single image, no text to extract) ─────────────

async function extractFromImage(
  base64Clean: string,
  mimeType: string,
): Promise<AIInvoiceResponse> {
  const OpenAI = (await import("openai")).default;
  const openai = new OpenAI({
    baseURL: process.env.AI_INTEGRATIONS_OPENAI_BASE_URL,
    apiKey: process.env.AI_INTEGRATIONS_OPENAI_API_KEY,
  });

  const dataUrl = `data:${mimeType};base64,${base64Clean}`;
  const response = await openai.chat.completions.create({
    model: "gpt-4o",
    messages: [
      {
        role: "user",
        content: [
          { type: "text", text: VISION_EXTRACTION_PROMPT },
          { type: "image_url", image_url: { url: dataUrl, detail: "high" } },
        ],
      },
    ],
    max_tokens: 4096,
    temperature: 0,
  });

  const content = response.choices[0]?.message?.content ?? "";
  const jsonMatch = content.match(/\{[\s\S]*\}/);
  if (!jsonMatch) throw new Error("No JSON found in image AI response");
  return JSON.parse(jsonMatch[0]);
}

// ─── Main entry point ─────────────────────────────────────────────────────────

export async function processInvoiceWithAI(
  base64Data: string,
  fileName: string,
): Promise<InvoiceData> {
  const base64Clean = base64Data.replace(/^data:.*?;base64,/, "");
  const mimeType = getMimeType(fileName);
  const isPdf = mimeType === "application/pdf";

  const toCents = (val: number | undefined | null): number | undefined => {
    if (val === undefined || val === null) return undefined;
    return Math.round(val * 100);
  };

  let aiResponse: AIInvoiceResponse;

  if (!isPdf) {
    // Non-PDF image — go straight to vision
    console.log("[AI Bill Reader] Non-PDF file — using vision extraction");
    aiResponse = await extractFromImage(base64Clean, mimeType);
  } else {
    // PDF: try text extraction first
    const pdfBuffer = Buffer.from(base64Clean, "base64");
    const rawText = await extractTextFromPdf(pdfBuffer);

    if (rawText.length < 50) {
      // Scanned / image PDF — fall back to vision
      console.log("[AI Bill Reader] PDF has insufficient text (scanned image?) — falling back to vision extraction");
      aiResponse = await extractWithVision(pdfBuffer);
    } else {
      // Text-based PDF — run hybrid pipeline
      console.log(`[AI Bill Reader] PDF text extracted (${rawText.length} chars) — running hybrid pipeline`);

      // Stage 2: regex
      const regexFields = extractFieldsWithRegex(rawText);
      console.log("[AI Bill Reader] Regex extracted:", JSON.stringify(regexFields));

      // Stage 3: small AI model for semantic fields
      const semanticFields = await extractSemanticFields(rawText, regexFields);
      console.log("[AI Bill Reader] Semantic AI extracted — supplier:", semanticFields.supplierName, "lines:", semanticFields.lineItems?.length ?? 0);

      // Merge: regex wins for fields it confidently found
      aiResponse = {
        supplierName: semanticFields.supplierName,
        supplierAbn: regexFields.abn ?? semanticFields.supplierAbn,
        supplierAddress: semanticFields.supplierAddress,
        supplierEmail: semanticFields.supplierEmail,
        supplierPhone: semanticFields.supplierPhone,
        siteAddress: semanticFields.siteAddress,
        invoiceNumber: regexFields.invoiceNumber ?? semanticFields.invoiceNumber,
        invoiceDate: regexFields.invoiceDate ?? semanticFields.invoiceDate,
        dueDate: regexFields.dueDate ?? semanticFields.dueDate,
        totalAmount: regexFields.totalAmountIncGst ?? semanticFields.totalAmount,
        totalTax: regexFields.gstAmount ?? semanticFields.totalTax,
        subtotalAmount: regexFields.subtotal ?? semanticFields.subtotalAmount,
        lineItems: semanticFields.lineItems,
        currency: semanticFields.currency ?? "AUD",
      };
    }
  }

  const result: InvoiceData = {
    invoiceNumber: aiResponse.invoiceNumber || undefined,
    invoiceDate: aiResponse.invoiceDate || undefined,
    dueDate: aiResponse.dueDate || undefined,
    supplierName: aiResponse.supplierName || undefined,
    supplierAbn: aiResponse.supplierAbn || undefined,
    supplierAddress: aiResponse.supplierAddress || undefined,
    supplierEmail: aiResponse.supplierEmail || undefined,
    supplierPhone: aiResponse.supplierPhone || undefined,
    siteAddress: aiResponse.siteAddress || undefined,
    totalAmount: toCents(aiResponse.totalAmount),
    totalTax: toCents(aiResponse.totalTax),
    subtotalAmount: toCents(aiResponse.subtotalAmount),
    lineItems: aiResponse.lineItems?.map((item) => ({
      description: item.description || undefined,
      quantity: item.quantity ?? 1,
      unitPrice: toCents(item.unitPrice),
      totalAmount: toCents(item.totalAmount),
      taxAmount: toCents(item.taxAmount),
    })),
    currency: aiResponse.currency || "AUD",
    confidence: 0.95,
  };

  return result;
}
