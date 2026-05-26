import { processInvoiceWithAI } from "./aiBillReader";
import { getEmailParserService, type ParsedEmail } from "./emailParser";
import { storage } from "../storage";
import type { InsertBill, InsertBillLineItem } from "@shared/schema";
import * as schema from "@shared/schema";
import { matchSupplier } from "@shared/supplierMatcher";
import { objectStorageClient } from "../replit_integrations/object_storage/objectStorage";
import { randomUUID } from "crypto";
import { db } from "../db";
import { and, eq, gte, lte } from "drizzle-orm";
import { recomputePOStatusFromBills } from "./poStatusFromBills";

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

/**
 * Normalise an address/name string for project matching:
 * lowercase, expand common abbreviations, strip punctuation.
 */
function normAddr(s: string): string {
  return s.toLowerCase()
    .replace(/\bplace\b/g, "pl").replace(/\bstreet\b/g, "st").replace(/\broad\b/g, "rd")
    .replace(/\bdrive\b/g, "dr").replace(/\bcourt\b/g, "ct").replace(/\bavenue\b/g, "ave")
    .replace(/\blane\b/g, "ln").replace(/\bcrescent\b/g, "cres")
    .replace(/[^a-z0-9\s]/g, " ").replace(/\s+/g, " ").trim();
}
function tokAddr(s: string): string[] { return normAddr(s).split(" ").filter(t => t.length > 1); }

/**
 * Try to match a single text source against all projects (name + location).
 * Returns { projectId, score } if confident, null otherwise.
 */
function matchTextAgainstProjects(
  sourceText: string,
  projects: import("@shared/schema").Project[],
): string | null {
  const srcTokens = new Set(tokAddr(sourceText));
  const srcStreetNum = normAddr(sourceText).match(/\b(\d+)\b/)?.[1];

  let best: { id: string; score: number } | null = null;

  for (const project of projects) {
    if ((project as any).isArchived) continue;

    // Try both the project name and the location as candidate pools
    const candidatePools = [
      [project.name, project.location].filter(Boolean).join(" "),
    ];

    for (const candidateText of candidatePools) {
      if (!candidateText.trim()) continue;

      const projTokens = tokAddr(candidateText);
      if (projTokens.length === 0) continue;

      // Street number check: if both have a number, they must match
      const projStreetNum = normAddr(candidateText).match(/\b(\d+)\b/)?.[1];
      if (srcStreetNum && projStreetNum && srcStreetNum !== projStreetNum) continue;

      let overlap = 0;
      for (const t of projTokens) {
        if (srcTokens.has(t)) overlap++;
      }

      // Require at least 2 shared tokens OR (street number match + 1 other token)
      if (overlap < 2 && !(srcStreetNum && projStreetNum && overlap >= 1)) continue;
      const score = overlap / Math.max(projTokens.length, 1);
      if (score < 0.3) continue;

      if (!best || score > best.score) best = { id: project.id, score };
    }
  }

  return best?.id ?? null;
}

/**
 * Match project using multiple signals, in priority order:
 *   1. AI-extracted siteAddress vs project location + name
 *   2. AI-extracted siteAddress vs project name alone (for projects with no location)
 *   3. PDF filenames (tokenised) vs project name + location
 *   4. Email subject vs project name + location
 */
function matchProjectMultiSignal(
  invoiceData: { siteAddress?: string; supplierAddress?: string },
  pdfFilenames: string[],
  emailSubject: string,
  projects: import("@shared/schema").Project[],
): string | null {
  // Signal 1 & 2: AI-extracted address
  const aiAddress = invoiceData.siteAddress || invoiceData.supplierAddress;
  if (aiAddress) {
    const m = matchTextAgainstProjects(aiAddress, projects);
    if (m) return m;
  }

  // Signal 3: PDF filenames
  for (const filename of pdfFilenames) {
    // Strip extension and common filler words for cleaner matching
    const cleaned = filename.replace(/\.(pdf|png|jpg|jpeg)$/i, "")
      .replace(/invoice|receipt|bill|tax|statement/gi, " ");
    const m = matchTextAgainstProjects(cleaned, projects);
    if (m) return m;
  }

  // Signal 4: Email subject
  if (emailSubject) {
    const m = matchTextAgainstProjects(emailSubject, projects);
    if (m) return m;
  }

  return null;
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
    let projectMatchConfident = !!options.defaultProjectId;
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
          projectMatchConfident = true;
        }
      }

      if (!projectId) {
        const activeProject = projects.find(p => p.isActive);
        if (activeProject) {
          projectId = activeProject.id;
          projectMatchConfident = false; // fallback — may be refined after AI
        }
        // If still no project, bill will be saved as a business-level bill (projectId = null)
      }
    }

    // ── Extract sender email domain for fallback matching later ─────────────
    const fromEmailMatch = email.from.match(/<([^>]+)>/) || email.from.match(/(\S+@\S+)/);
    const senderEmail = fromEmailMatch ? fromEmailMatch[1] : email.from;
    const senderDomain = senderEmail.includes("@")
      ? senderEmail.split("@")[1].toLowerCase().replace(/^www\./, "")
      : null;

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

    // ── Run AI on the FIRST (primary) attachment ─────────────────────────────
    const primary = attachments[0];
    const primaryBase64 = Buffer.isBuffer(primary.content)
      ? primary.content.toString("base64")
      : primary.content;

    // Skip AI if this is an existing bill that was already successfully processed.
    // The polling cycle can revisit the same bill multiple times; once ocrProcessed
    // is true and the bill has a supplier or invoice reference, there is no value
    // in running the extraction pipeline again.
    if (options.existingBillId && createdBill.ocrProcessed && (createdBill.supplierId || (createdBill as any).billReference)) {
      console.log(`[autoBillCreator] Bill ${createdBill.id} already processed (ocrProcessed=true) — skipping AI re-extraction`);
      return { success: true, billId: createdBill.id, billNumber: createdBill.billNumber ?? undefined, supplierName };
    }

    try {
      const invoiceData = await processInvoiceWithAI(primaryBase64, primary.filename);

      // ── Re-resolve supplier using full priority chain ────────────────────────
      // Priority: ABN → learned name mapping → fuzzy name match → email domain
      let aiSupplierId = supplierId;
      let aiSupplierName = invoiceData.supplierName || supplierName;

      if (options.autoMatch) {
        const [supplierContacts, tradeContacts] = await Promise.all([
          storage.getContacts(companyId, "supplier"),
          storage.getContacts(companyId, "trade"),
        ]);
        const seenIds = new Set<string>();
        const allContacts = [...supplierContacts, ...tradeContacts].filter((c: any) => {
          if (seenIds.has(c.id)) return false;
          seenIds.add(c.id);
          return true;
        });

        let matched = false;

        // 1. ABN match (exact — strip all spaces before comparing)
        if (!matched && invoiceData.supplierAbn) {
          const normAbn = invoiceData.supplierAbn.replace(/\s/g, "");
          const abnMatch = allContacts.find((c: any) => c.abn && c.abn.replace(/\s/g, "") === normAbn);
          if (abnMatch) {
            aiSupplierId = abnMatch.id;
            aiSupplierName = (abnMatch as any).name || invoiceData.supplierName || supplierName;
            console.log(`[autoBillCreator] Supplier matched by ABN ${normAbn} → "${aiSupplierName}"`);
            matched = true;
          }
        }

        // 2. Learned name mapping (exact on AI-extracted name)
        if (!matched && invoiceData.supplierName) {
          const mapping = await storage.getSupplierNameMapping(invoiceData.supplierName, companyId);
          if (mapping) {
            const contact = allContacts.find((c: any) => c.id === mapping.supplierId);
            if (contact) {
              aiSupplierId = contact.id;
              aiSupplierName = (contact as any).name || invoiceData.supplierName;
              console.log(`[autoBillCreator] Supplier matched by learned name mapping "${invoiceData.supplierName}" → "${aiSupplierName}"`);
              matched = true;
            }
          }
        }

        // 3. Fuzzy name match against supplier/trade contacts
        if (!matched && invoiceData.supplierName) {
          const matchResult = matchSupplier(
            invoiceData.supplierName,
            allContacts.map((c: any) => ({
              id: c.id,
              names: [c.company, c.name, `${c.firstName || ""} ${c.lastName || ""}`.trim()].filter(Boolean),
              raw: c,
            })),
          );
          if (matchResult.match) {
            aiSupplierId = matchResult.match.candidate.id;
            aiSupplierName = (matchResult.match.candidate as any).raw?.name || invoiceData.supplierName;
            console.log(`[autoBillCreator] Supplier fuzzy-matched "${invoiceData.supplierName}" → "${aiSupplierName}" (confidence ${matchResult.match.confidence.toFixed(2)})`);
            // Auto-save the name mapping so future imports skip fuzzy matching
            await storage.createSupplierNameMapping({
              invoiceNameString: invoiceData.supplierName,
              supplierId: aiSupplierId!,
              companyId,
            }).catch(() => {}); // Non-fatal
            matched = true;
          }
        }

        // 4. Email domain match (sender domain vs contact email domain)
        if (!matched && senderDomain) {
          const domainMatch = allContacts.find((c: any) => {
            if (!c.email) return false;
            const contactDomain = c.email.split("@")[1]?.toLowerCase().replace(/^www\./, "");
            return contactDomain === senderDomain;
          });
          if (domainMatch) {
            aiSupplierId = domainMatch.id;
            aiSupplierName = (domainMatch as any).name || supplierName;
            console.log(`[autoBillCreator] Supplier matched by email domain "${senderDomain}" → "${aiSupplierName}"`);
            matched = true;
          }
        }

        // 5. No match — leave supplierId null; bill goes to "needs_review" status
        if (!matched) {
          aiSupplierId = undefined;
          aiSupplierName = invoiceData.supplierName || supplierName;
          console.log(`[autoBillCreator] No supplier match found for "${aiSupplierName}" — bill will require manual review`);
        }
      }

      // ── Re-resolve project using all available signals ───────────────────────
      if (!projectMatchConfident && options.autoMatch) {
        const pdfFilenames = attachments.map(a => a.filename).filter(Boolean);
        const projectMatch = matchProjectMultiSignal(
          invoiceData,
          pdfFilenames,
          email.subject || "",
          projects,
        );
        if (projectMatch) {
          console.log(`[autoBillCreator] Matched project ${projectMatch} via multi-signal matching`);
          projectId = projectMatch;
          await storage.updateBill(createdBill.id, { projectId });
        }
      }

      // ── SITE PO MATCHING ─────────────────────────────────────────────────────
      let matchedSitePOId: string | null = null;
      let suggestedSitePOIds: string[] = [];

      if (options.autoMatch) {
        const pdfFilenames = attachments.map(a => a.filename).filter(Boolean) as string[];
        // PO number patterns cover all PO types (site, supplier, labour, etc.).
        const poPattern = /\b(?:SP|PO|SO|LP)-\d{4}-\d{3}\b/gi;
        const searchTargets = [
          (invoiceData as any)?.rawText || '',
          ...pdfFilenames,
          email?.subject || '',
        ].join(' ');

        const poMatches = searchTargets.match(poPattern);
        const foundPONumber = poMatches?.[0]?.toUpperCase() ?? null;

        if (foundPONumber) {
          // Match any PO type — bill → PO link is no longer site-only.
          // Allow draft or sent POs (sent = issued and awaiting an invoice).
          const [matchedPO] = await db
            .select()
            .from(schema.purchaseOrders)
            .where(and(
              eq(schema.purchaseOrders.companyId, companyId),
              eq(schema.purchaseOrders.poNumber, foundPONumber),
            ))
            .limit(1);

          if (matchedPO && matchedPO.status !== 'cancelled') {
            matchedSitePOId = matchedPO.id;

            // Override project and supplier from the PO (authoritative match)
            if (matchedPO.projectId) projectId = matchedPO.projectId;
            if (matchedPO.supplierId) aiSupplierId = matchedPO.supplierId;

            console.log(`[autoBillCreator] Matched PO ${foundPONumber} (${matchedPO.poType}) → bill ${createdBill.billNumber}`);
          }
        }

        // Fuzzy fallback: suggest POs by supplier + amount proximity (any PO type)
        if (!matchedSitePOId) {
          const billTotal = (invoiceData as any)?.totalAmountIncGst ?? invoiceData?.totalAmount ?? 0;
          const sixtyDaysAgo = new Date(Date.now() - 60 * 24 * 60 * 60 * 1000);
          const conditions: any[] = [
            eq(schema.purchaseOrders.companyId, companyId),
            // Suggest POs that have been issued but not yet linked to a bill.
            eq(schema.purchaseOrders.status, 'sent' as any),
            gte(schema.purchaseOrders.createdAt, sixtyDaysAgo),
          ];
          if (aiSupplierId) {
            conditions.push(eq(schema.purchaseOrders.supplierId, aiSupplierId));
          }
          if (billTotal > 0) {
            conditions.push(gte(schema.purchaseOrders.total, Math.round(billTotal * 85)));
            conditions.push(lte(schema.purchaseOrders.total, Math.round(billTotal * 115)));
          }

          const suggestions = await db
            .select({ id: schema.purchaseOrders.id })
            .from(schema.purchaseOrders)
            .where(and(...conditions))
            .limit(3);

          suggestedSitePOIds = suggestions.map(s => s.id);
          if (suggestedSitePOIds.length > 0) {
            console.log(`[autoBillCreator] Found ${suggestedSitePOIds.length} site PO suggestion(s) for bill ${createdBill.billNumber}`);
          }
        }
      }
      // ── END SITE PO MATCHING ──────────────────────────────────────────────────

      // If no supplier matched, leave as "needs_review" so the bill is flagged
      const billStatus = aiSupplierId ? "awaiting_approval" : "needs_review";

      await storage.updateBill(createdBill.id, {
        supplierId: aiSupplierId || null,
        status: billStatus,
        billDate: invoiceData.invoiceDate ? new Date(invoiceData.invoiceDate) : new Date(),
        dueDate: invoiceData.dueDate ? new Date(invoiceData.dueDate) : undefined,
        billReference: invoiceData.invoiceNumber,
        subtotal: invoiceData.subtotalAmount || 0,
        tax: invoiceData.totalTax || 0,
        total: invoiceData.totalAmount || 0,
        ocrProcessed: true,
        ocrData: invoiceData as any,
        ...(matchedSitePOId ? { matchedSitePOId } : {}),
        ...(suggestedSitePOIds.length > 0 ? { suggestedSitePOIds } : {}),
      });

      // Push status of the matched PO forward (sent → invoiced) once the bill
      // is linked. recomputePOStatusFromBills is idempotent and PO-type agnostic.
      if (matchedSitePOId) {
        try {
          await recomputePOStatusFromBills(matchedSitePOId);
        } catch (err) {
          console.error("[autoBillCreator] PO recompute failed:", err);
        }
      }

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
