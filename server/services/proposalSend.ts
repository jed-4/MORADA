/**
 * Freezing a proposal at the moment it goes out.
 *
 * Sending is two jobs: freeze the document, then email it. They were one block
 * inside POST /api/proposals/:id/send, which was fine while emailing was the
 * only way a proposal could leave the building. It is not — plenty go out by
 * hand, printed or attached to the builder's own email — and those need the
 * same freeze so the client's portal link, the acceptance flow, the reminder
 * schedule and the "valid until" date all behave identically.
 *
 * So the freeze lives here and both routes call it. Copying it into a second
 * handler would have worked today and drifted by the second change; this file
 * exists so there is exactly one definition of what "sent" means.
 *
 * What it does NOT do is email anything. That stays in the route.
 */
import { storage } from "../storage";
import { ObjectStorageService } from "../replit_integrations/object_storage";
import { endOfDay } from "@shared/proposalExpiry";
import type { Proposal } from "@shared/schema";

export interface Recipient {
  name?: string;
  email: string;
}

export interface FreezeInput {
  proposalId: string;
  /**
   * The caller's company, never the row's. Undefined is allowed because
   * getSessionCompanyId can return it and proposals.company_id is nullable —
   * tightening it here only moved the same error out to the call sites.
   */
  companyId: string | undefined;
  /** The rendered document, base64. Rendered in the browser by @react-pdf. */
  pdfBase64: string;
  /** When it went out. Defaults to now; a manual send back-dates it. */
  sentAt?: Date;
  /** How long the pricing holds. Absent leaves whatever the proposal carries. */
  expiryDate?: Date;
  /** Who it went to. Empty for a send made outside the system. */
  recipients: Recipient[];
  /** Chasing is opt-in, and needs an address to chase. */
  remindersEnabled?: boolean;
  /** Origin for the client's link — the canonical domain, not req.host. */
  baseUrl: string;
}

export interface FreezeResult {
  proposal: Proposal;
  portalLink: string;
  companySettings: Awaited<ReturnType<typeof storage.getCompanySettings>>;
}

/**
 * Recompute the money, capture the PDF, build the snapshot the client will be
 * held to, and flip the proposal to "sent".
 */
export async function freezeProposalForSend(input: FreezeInput): Promise<FreezeResult> {
  const { proposalId, companyId, pdfBase64, recipients, baseUrl } = input;

  // Totals first: the snapshot, the emailed figure and every percentage
  // milestone all read proposals.totalAmount, and until this ran the column
  // was still the 0 it was created with.
  await storage.recomputeProposalTotals(proposalId);
  const priced = await storage.getProposal(proposalId);
  if (!priced) throw new Error("Proposal not found");

  // Resolve the company once and insist on one. Both callers are behind
  // ownership checks so this cannot fire in practice, but the alternative was
  // passing `string | undefined` down into the settings lookup and the upload
  // — which is how a proposal could have gone to a client with no branding on
  // it and nothing to say why.
  const resolvedCompanyId = companyId ?? priced.companyId ?? undefined;
  if (!resolvedCompanyId) {
    throw new Error("Cannot send a proposal with no company on the session or the proposal");
  }

  const [sections, items, milestones, companySettings] = await Promise.all([
    storage.getProposalSections(proposalId),
    storage.getProposalItems(proposalId),
    storage.getProposalPaymentMilestones(proposalId),
    storage.getCompanySettings(resolvedCompanyId),
  ]);

  // Persist the exact PDF the client is about to be given, so the portal can
  // serve that document back instead of re-deriving a lookalike.
  const oss = new ObjectStorageService();
  const sentPdfPath = await oss.uploadObjectEntity(
    Buffer.from(pdfBase64, "base64"),
    "application/pdf",
    priced.companyId ?? resolvedCompanyId,
  );

  const sentDate = input.sentAt ? new Date(input.sentAt) : new Date();

  // Resolve the expiry BEFORE the snapshot: the client's frozen copy shows
  // "Valid until", so a date set in this same request has to be inside the
  // snapshot, not only on the row we update afterwards.
  const resolvedExpiry = input.expiryDate ? endOfDay(input.expiryDate) : priced.expiryDate ?? null;

  const sentProposalPreview = {
    ...priced,
    status: "sent" as const,
    sentDate,
    sentPdfPath,
    sentTo: recipients,
    expiryDate: resolvedExpiry,
  };

  const snapshot = {
    capturedAt: new Date().toISOString(),
    proposal: sentProposalPreview,
    sections,
    items,
    milestones,
    // Present and empty on purpose. The portal decides whether the client
    // has already responded by looking here; when the key was absent the
    // sign panel came back on every reload and the same client could sign
    // the same proposal any number of times.
    acceptances: [] as unknown[],
    company: companySettings
      ? {
          companyName: companySettings.companyName,
          address: companySettings.address,
          phone: companySettings.phone,
          email: companySettings.email,
          website: companySettings.website,
          logoUrl: companySettings.logoUrl,
          proposalPrimaryColor: companySettings.proposalPrimaryColor,
          proposalSecondaryColor: companySettings.proposalSecondaryColor,
          proposalFontFamily: companySettings.proposalFontFamily,
          proposalHeaderText: companySettings.proposalHeaderText,
          proposalFooterText: companySettings.proposalFooterText,
          taxRate: companySettings.taxRate,
          termsTemplates: companySettings.termsTemplates,
          paymentScheduleTemplates: companySettings.paymentScheduleTemplates,
        }
      : null,
  };

  const proposal = await storage.updateProposal(proposalId, {
    status: "sent",
    sentDate,
    contentSnapshot: snapshot,
    sentPdfPath,
    sentTo: recipients,
    remindersEnabled: input.remindersEnabled === true,
    ...(input.expiryDate ? { expiryDate: resolvedExpiry } : {}),
  } as any);

  if (!proposal) throw new Error("Proposal not found");

  return {
    proposal,
    portalLink: `${baseUrl}/portal/proposal/${proposal.id}?token=${encodeURIComponent(proposal.shareToken)}`,
    companySettings,
  };
}

/** The canonical origin for a client's link, which outlives this request. */
export function resolveBaseUrl(req: {
  get: (h: string) => string | undefined;
  secure?: boolean;
}): string {
  // Prefer the canonical domain over the host this request happened to arrive
  // on: the client's link lives for weeks, and building it from req.host bakes
  // a preview/staging host into it. Mirrors RFQ send.
  return (
    (process.env.APP_BASE_URL || process.env.APP_URL || "").replace(/\/$/, "")
    || `${req.get("x-forwarded-proto") || (req.secure ? "https" : "http")}://${req.get("host")}`
  );
}
