import { storage } from "../storage";
import type { XeroConnection } from "@shared/schema";
import { encryptToken, decryptToken } from "../utils/encryption";

// Encrypt Xero tokens at rest when a 32-char key is configured; otherwise store
// as-is so a missing key never breaks the connection. Reads transparently
// handle both encrypted and legacy plaintext values (gradual migration — rows
// re-encrypt on the next refresh).
const XERO_ENCRYPTION_ENABLED = (process.env.GOOGLE_OAUTH_ENCRYPTION_KEY || "").length === 32;
const XERO_ENCRYPTED_RE = /^[0-9a-f]{32}:[0-9a-f]{32}:[0-9a-f]+$/i;

export function encryptXeroToken(raw: string): string {
  if (!XERO_ENCRYPTION_ENABLED || !raw) return raw;
  try { return encryptToken(raw); } catch { return raw; }
}

export function decryptXeroToken(stored: string): string {
  if (!stored || !XERO_ENCRYPTED_RE.test(stored)) return stored;
  try { return decryptToken(stored); } catch { return stored; }
}

const XERO_CLIENT_ID = process.env.XERO_CLIENT_ID || "";
const XERO_CLIENT_SECRET = process.env.XERO_CLIENT_SECRET || "";
const XERO_AUTHORIZE_URL = "https://login.xero.com/identity/connect/authorize";
const XERO_TOKEN_URL = "https://identity.xero.com/connect/token";
const XERO_CONNECTIONS_URL = "https://api.xero.com/connections";
import { parseXeroPnlMonthLabel, type SectionTotals } from "@shared/xeroPnl";

const XERO_API_BASE = "https://api.xero.com/api.xro/2.0";
const XERO_SCOPES = "openid profile email accounting.transactions accounting.attachments accounting.contacts accounting.settings accounting.reports.read offline_access";

// Turn a Xero API error body (raw text or already-parsed JSON) into a short,
// human-readable summary suitable for a toast. Xero nests validation messages
// under top-level ValidationErrors and per-Element/LineItem ValidationErrors, and
// repeats line-level messages once per line — so we collect, map the common ones
// to plain English, and de-duplicate.
export function summarizeXeroError(body: string | any): string {
  let data: any = body;
  if (typeof body === "string") {
    try { data = JSON.parse(body); } catch { return body.slice(0, 300); }
  }
  if (!data || typeof data !== "object") return String(body).slice(0, 300);

  const raw: string[] = [];
  const pushErrors = (errs: any) => {
    if (Array.isArray(errs)) {
      for (const e of errs) {
        if (e && typeof e.Message === "string") raw.push(e.Message);
      }
    }
  };
  pushErrors(data.ValidationErrors);
  if (Array.isArray(data.Elements)) {
    for (const el of data.Elements) {
      pushErrors(el?.ValidationErrors);
      if (Array.isArray(el?.LineItems)) {
        for (const li of el.LineItems) pushErrors(li?.ValidationErrors);
      }
    }
  }

  // Map Xero's wording to something short and actionable.
  const friendly = (msg: string): string => {
    const m = msg.toLowerCase();
    if (m.includes("duedate")) return "Due date is required";
    if (m.includes("account code")) return "Each invoice line needs a Xero account code";
    if (m.includes("contact")) return "The client isn't linked to a valid Xero contact";
    if (m.includes("date")) return "The invoice date is invalid";
    return msg.replace(/\.$/, "");
  };

  const seen = new Set<string>();
  const summary: string[] = [];
  for (const msg of raw) {
    const f = friendly(msg);
    if (!seen.has(f)) { seen.add(f); summary.push(f); }
  }

  if (summary.length > 0) return summary.join("; ");
  if (typeof data.Message === "string" && data.Message) return data.Message;
  return "Xero rejected the request";
}

export interface XeroTracking {
  TrackingCategoryID: string;
  TrackingOptionID: string;
  Name?: string;
  Option?: string;
}

export interface XeroBillLineItem {
  description: string;
  quantity: number;
  unitAmount: number;
  taxType: string;
  accountCode?: string;
  tracking?: XeroTracking[];
  // Explicit per-line tax override in dollars. When set, Xero uses this instead
  // of computing tax from the rate — used by the client-invoice push so the
  // Xero total matches Morada's stored totals to the cent.
  taxAmount?: number;
}

export interface XeroBillData {
  supplierName: string;
  supplierXeroContactId?: string;
  billDate: string;
  dueDate?: string;
  reference?: string;
  invoiceNumber?: string;
  taxMode?: "inclusive" | "exclusive";
  lineItems: XeroBillLineItem[];
  // Xero invoice status: "DRAFT" | "SUBMITTED" | "AUTHORISED".
  //   - SUBMITTED   → "Awaiting Approval" in the Xero UI
  //   - AUTHORISED  → "Awaiting Payment" in the Xero UI (approved)
  // Defaults to AUTHORISED for backward compatibility.
  xeroStatus?: "DRAFT" | "SUBMITTED" | "AUTHORISED";
}

export interface XeroAttachmentSummary {
  AttachmentID?: string;
  FileName?: string;
  Url?: string;
  MimeType?: string;
  ContentLength?: number;
}

export interface XeroValidationIssue {
  scope: "invoice" | "lineItem" | "contact" | "unknown";
  lineIndex?: number;
  message: string;
}

/**
 * Typed error thrown when Xero responds with HTTP 400 + a ValidationException
 * payload. Carries a structured list of per-invoice / per-line-item messages
 * so callers can log them as fields and surface them to users.
 */
export class XeroValidationError extends Error {
  status: number;
  validationErrors: XeroValidationIssue[];
  rawBody: string;
  constructor(status: number, validationErrors: XeroValidationIssue[], rawBody: string) {
    const summary = validationErrors[0]?.message || "Xero validation failed";
    super(summary);
    this.name = "XeroValidationError";
    this.status = status;
    this.validationErrors = validationErrors;
    this.rawBody = rawBody;
  }
}

/**
 * Parse a Xero error response body. If the body contains a ValidationException
 * with per-element / per-line-item ValidationErrors, return a flattened list.
 * Returns null when the body isn't a recognised Xero validation envelope.
 */
function parseXeroValidationErrors(body: string): XeroValidationIssue[] | null {
  let parsed: any;
  try {
    parsed = JSON.parse(body);
  } catch {
    return null;
  }
  if (!parsed || typeof parsed !== "object") return null;
  if (parsed.Type !== "ValidationException" && !Array.isArray(parsed.Elements)) return null;

  const issues: XeroValidationIssue[] = [];
  const elements = Array.isArray(parsed.Elements) ? parsed.Elements : [];
  for (const el of elements) {
    if (Array.isArray(el?.ValidationErrors)) {
      for (const ve of el.ValidationErrors) {
        if (ve?.Message) issues.push({ scope: "invoice", message: String(ve.Message) });
      }
    }
    if (el?.Contact?.ValidationErrors && Array.isArray(el.Contact.ValidationErrors)) {
      for (const ve of el.Contact.ValidationErrors) {
        if (ve?.Message) issues.push({ scope: "contact", message: String(ve.Message) });
      }
    }
    if (Array.isArray(el?.LineItems)) {
      el.LineItems.forEach((li: any, idx: number) => {
        if (Array.isArray(li?.ValidationErrors)) {
          for (const ve of li.ValidationErrors) {
            if (ve?.Message) {
              issues.push({ scope: "lineItem", lineIndex: idx, message: String(ve.Message) });
            }
          }
        }
      });
    }
  }

  if (issues.length === 0 && parsed.Message) {
    issues.push({ scope: "unknown", message: String(parsed.Message) });
  }
  return issues.length > 0 ? issues : null;
}

/**
 * Wrap a non-OK Xero response in either a XeroValidationError (when the body
 * is a parseable ValidationException) or a generic Error containing the raw
 * status + body. The intent is that callers can `instanceof XeroValidationError`
 * for clean structured handling, while preserving the existing generic-error
 * behaviour for everything else (auth failures, 500s, etc).
 */
async function xeroErrorFromResponse(response: Response, fallbackPrefix: string): Promise<Error> {
  const errorText = await response.text();
  if (response.status === 400) {
    const issues = parseXeroValidationErrors(errorText);
    if (issues && issues.length > 0) {
      return new XeroValidationError(response.status, issues, errorText);
    }
  }
  return new Error(`${fallbackPrefix}: ${response.status} ${errorText}`);
}

/**
 * fetch() wrapper that transparently retries on HTTP 429 (Too Many Requests),
 * honouring Xero's `Retry-After` header. Xero enforces ~60 calls/min per tenant;
 * bursty operations (e.g. paging through every bill) combined with background
 * pollers can trip this. Retrying with the server-provided delay turns a hard
 * failure into a brief wait. The wait is capped and retries are bounded so a
 * request can never hang indefinitely.
 */
async function xeroFetchWithRetry(
  url: string,
  init: RequestInit,
  opts: { maxRetries?: number; label?: string } = {}
): Promise<Response> {
  const maxRetries = opts.maxRetries ?? 3;
  let attempt = 0;
  while (true) {
    const response = await fetch(url, init);
    if (response.status !== 429 || attempt >= maxRetries) {
      return response;
    }
    const retryAfterRaw = response.headers.get("Retry-After");
    const retryAfterSec = retryAfterRaw ? parseInt(retryAfterRaw, 10) : NaN;
    const waitMs =
      Number.isFinite(retryAfterSec) && retryAfterSec > 0
        ? Math.min(retryAfterSec, 60) * 1000
        : Math.min(2 ** attempt, 30) * 1000;
    // Drain the body so the underlying socket can be reused.
    await response.text().catch(() => {});
    console.warn(
      `[Xero] 429 rate-limited${opts.label ? ` (${opts.label})` : ""}; retrying in ${Math.round(
        waitMs / 1000,
      )}s (attempt ${attempt + 1}/${maxRetries})`,
    );
    await new Promise((resolve) => setTimeout(resolve, waitMs));
    attempt++;
  }
}

// De-duplicate concurrent token refreshes per connection. Xero rotates the
// refresh token on every use, so two parallel refreshes invalidate each other;
// sharing one in-flight promise prevents that self-inflicted disconnect.
const refreshInFlight = new Map<string, Promise<XeroConnection>>();

interface XeroTokenResponse {
  access_token: string;
  refresh_token: string;
  expires_in: number;
  token_type: string;
  id_token?: string;
}

interface XeroTenant {
  tenantId: string;
  tenantName: string;
  tenantType: string;
}

function getRedirectUri(): string {
  if (process.env.REPLIT_DOMAINS) {
    const domains = process.env.REPLIT_DOMAINS.split(',');
    const canonicalDomain = domains.find(d => d.trim().endsWith('.replit.app')) || domains[0]?.trim();
    if (canonicalDomain) {
      return `https://${canonicalDomain}/api/xero/callback`;
    }
  }
  if (process.env.REPLIT_DEV_DOMAIN) {
    return `https://${process.env.REPLIT_DEV_DOMAIN}/api/xero/callback`;
  }
  return "http://localhost:5000/api/xero/callback";
}

export class XeroService {
  getAuthUrl(state: string): string {
    const params = new URLSearchParams({
      response_type: "code",
      client_id: XERO_CLIENT_ID,
      redirect_uri: getRedirectUri(),
      scope: XERO_SCOPES,
      state,
    });
    return `${XERO_AUTHORIZE_URL}?${params.toString()}`;
  }

  async exchangeCodeForTokens(code: string): Promise<XeroTokenResponse> {
    const body = new URLSearchParams({
      grant_type: "authorization_code",
      code,
      redirect_uri: getRedirectUri(),
    });

    const response = await fetch(XERO_TOKEN_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        Authorization: `Basic ${Buffer.from(`${XERO_CLIENT_ID}:${XERO_CLIENT_SECRET}`).toString("base64")}`,
      },
      body: body.toString(),
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Failed to exchange code for tokens: ${response.status} ${errorText}`);
    }

    return response.json() as Promise<XeroTokenResponse>;
  }

  async refreshAccessToken(connectionId: string): Promise<XeroConnection> {
    const existing = refreshInFlight.get(connectionId);
    if (existing) return existing;
    const p = this.doRefreshAccessToken(connectionId).finally(() => {
      refreshInFlight.delete(connectionId);
    });
    refreshInFlight.set(connectionId, p);
    return p;
  }

  private async doRefreshAccessToken(connectionId: string): Promise<XeroConnection> {
    const connection = await storage.getXeroConnection(connectionId);
    if (!connection) {
      throw new Error(`Xero connection not found: ${connectionId}`);
    }

    const body = new URLSearchParams({
      grant_type: "refresh_token",
      refresh_token: decryptXeroToken(connection.refreshToken),
    });

    const response = await fetch(XERO_TOKEN_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        Authorization: `Basic ${Buffer.from(`${XERO_CLIENT_ID}:${XERO_CLIENT_SECRET}`).toString("base64")}`,
      },
      body: body.toString(),
    });

    if (!response.ok) {
      const errorText = await response.text();
      // invalid_grant = the refresh token was revoked/expired. That's terminal,
      // so mark the connection inactive: /api/xero/status will report it
      // disconnected and prompt a reconnect instead of retrying a dead token.
      if (response.status === 400 && errorText.includes("invalid_grant")) {
        await storage.updateXeroConnection(connectionId, { isActive: false }).catch(() => {});
      }
      throw new Error(`Failed to refresh token: ${response.status} ${errorText}`);
    }

    const tokenData = (await response.json()) as XeroTokenResponse;
    const expiresAt = new Date(Date.now() + tokenData.expires_in * 1000);

    const updated = await storage.updateXeroConnection(connectionId, {
      accessToken: encryptXeroToken(tokenData.access_token),
      refreshToken: encryptXeroToken(tokenData.refresh_token),
      tokenExpiresAt: expiresAt,
    });

    if (!updated) {
      throw new Error(`Failed to update Xero connection: ${connectionId}`);
    }

    return updated;
  }

  async getValidToken(connectionId: string): Promise<string> {
    let connection = await storage.getXeroConnection(connectionId);
    if (!connection) {
      throw new Error(`Xero connection not found: ${connectionId}`);
    }
    if (!connection.isActive) {
      throw new Error(`Xero connection ${connectionId} is not active — please reconnect Xero in Settings`);
    }
    if (!connection.tenantId) {
      throw new Error(`Xero connection ${connectionId} is missing tenantId — please reconnect Xero in Settings`);
    }

    // Refresh 5 minutes before expiry (increased from 60s) to reduce production clock-skew failures
    const now = new Date();
    const bufferMs = 5 * 60 * 1000;
    if (!connection.tokenExpiresAt || connection.tokenExpiresAt.getTime() - bufferMs <= now.getTime()) {
      try {
        connection = await this.refreshAccessToken(connectionId);
      } catch (refreshErr: any) {
        // If refresh fails due to invalid_grant (revoked / expired refresh token), throw a clear error
        if (refreshErr.message?.includes("invalid_grant") || refreshErr.message?.includes("401")) {
          throw new Error("Xero refresh token has expired — please reconnect Xero in Settings");
        }
        throw refreshErr;
      }
    }

    return decryptXeroToken(connection.accessToken);
  }

  async getTenants(accessToken: string): Promise<XeroTenant[]> {
    const response = await fetch(XERO_CONNECTIONS_URL, {
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
      },
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Failed to get Xero tenants: ${response.status} ${errorText}`);
    }

    return response.json() as Promise<XeroTenant[]>;
  }

  async getContacts(connectionId: string, opts?: { includeArchived?: boolean }): Promise<any[]> {
    const accessToken = await this.getValidToken(connectionId);
    const connection = await storage.getXeroConnection(connectionId);
    if (!connection) throw new Error("Connection not found");

    const includeArchived = !!opts?.includeArchived;
    const pageSize = 500;
    const all: any[] = [];
    const maxPages = 50;

    for (let page = 1; page <= maxPages; page++) {
      const params = new URLSearchParams();
      params.set("page", String(page));
      params.set("pageSize", String(pageSize));
      params.set("summaryOnly", "true");
      if (includeArchived) {
        params.set("includeArchived", "true");
      }

      const response = await fetch(`${XERO_API_BASE}/Contacts?${params.toString()}`, {
        headers: {
          Authorization: `Bearer ${accessToken}`,
          "Xero-Tenant-Id": connection.tenantId,
          Accept: "application/json",
        },
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`Failed to get Xero contacts: ${response.status} ${errorText}`);
      }

      const data = (await response.json()) as any;
      const batch: any[] = data.Contacts || [];
      all.push(...batch);
      if (batch.length < pageSize) break;
    }

    all.sort((a, b) => String(a?.Name || "").localeCompare(String(b?.Name || ""), undefined, { sensitivity: "base" }));
    return all;
  }

  async getTrackingCategories(
    connectionId: string,
    opts: { maxRetries?: number; includeArchived?: boolean } = {},
  ): Promise<any[]> {
    const accessToken = await this.getValidToken(connectionId);
    const connection = await storage.getXeroConnection(connectionId);
    if (!connection) throw new Error("Connection not found");

    const url = opts.includeArchived
      ? `${XERO_API_BASE}/TrackingCategories?includeArchived=true`
      : `${XERO_API_BASE}/TrackingCategories`;
    const response = await xeroFetchWithRetry(url, {
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Xero-Tenant-Id": connection.tenantId,
        Accept: "application/json",
      },
    }, { label: "getTrackingCategories", maxRetries: opts.maxRetries });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Failed to get tracking categories: ${response.status} ${errorText}`);
    }

    const data = (await response.json()) as any;
    return data.TrackingCategories || [];
  }

  async getAccounts(connectionId: string, opts?: { types?: string[] }): Promise<any[]> {
    const accessToken = await this.getValidToken(connectionId);
    const connection = await storage.getXeroConnection(connectionId);
    if (!connection) throw new Error("Connection not found");

    // Default: expense/liability accounts (used for bills). Callers pushing
    // client invoices pass revenue types so Sales-style accounts are returned.
    const types = opts?.types ?? ["EXPENSE", "DIRECTCOSTS", "OVERHEADS", "CURRLIAB"];
    const where = types.map((t) => `Type=="${t}"`).join("||");

    const response = await fetch(`${XERO_API_BASE}/Accounts?where=${where}`, {
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Xero-Tenant-Id": connection.tenantId,
        Accept: "application/json",
      },
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Failed to get Xero accounts: ${response.status} ${errorText}`);
    }

    const data = (await response.json()) as any;
    return data.Accounts || [];
  }

  // Short-lived in-process cache for /TaxRates so back-to-back bill pushes
  // (e.g. AI bill reader bulk import, debounced auto-push) don't each pay a
  // round-trip + Xero rate-limit hit. Keyed per Xero connection.
  private static TAX_RATE_CACHE_TTL_MS = 5 * 60 * 1000;
  private taxRateCache = new Map<string, { fetchedAt: number; rates: Array<{ Name: string; TaxType: string; Status?: string }> }>();

  async getTaxRates(connectionId: string): Promise<Array<{ Name: string; TaxType: string; Status?: string }>> {
    const cached = this.taxRateCache.get(connectionId);
    if (cached && Date.now() - cached.fetchedAt < XeroService.TAX_RATE_CACHE_TTL_MS) {
      return cached.rates;
    }

    const accessToken = await this.getValidToken(connectionId);
    const connection = await storage.getXeroConnection(connectionId);
    if (!connection) throw new Error("Connection not found");

    const response = await fetch(`${XERO_API_BASE}/TaxRates`, {
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Xero-Tenant-Id": connection.tenantId,
        Accept: "application/json",
      },
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Failed to get Xero tax rates: ${response.status} ${errorText}`);
    }

    const data = (await response.json()) as any;
    const rates = data.TaxRates || [];
    this.taxRateCache.set(connectionId, { fetchedAt: Date.now(), rates });
    return rates;
  }

  /** Invalidate cached tax rates for a connection (e.g. after re-auth). */
  invalidateTaxRateCache(connectionId: string): void {
    this.taxRateCache.delete(connectionId);
  }

  /**
   * Find an ACTIVE tracking option by name within a category (trimmed,
   * case-insensitive). Deliberately never creates options — Xero is the
   * source of truth for the tracking option list, and enforces unique names
   * (including archived ones), so blind auto-creation 400s for any name that
   * was ever used. Callers surface a warning when no match exists.
   */
  async findTrackingOptionByName(
    connectionId: string,
    trackingCategoryId: string,
    name: string,
  ): Promise<{ TrackingOptionID: string; Name: string; Status?: string } | null> {
    const categories = await this.getTrackingCategories(connectionId);
    const category = categories.find((tc: any) => tc.TrackingCategoryID === trackingCategoryId);
    const options = (category?.Options || []) as any[];
    const wanted = name.trim().toLowerCase();
    return (
      options.find(
        (o: any) =>
          o.Status === "ACTIVE" && String(o.Name || "").trim().toLowerCase() === wanted,
      ) || null
    );
  }

  async createTrackingOption(connectionId: string, trackingCategoryId: string, name: string): Promise<any> {
    const accessToken = await this.getValidToken(connectionId);
    const connection = await storage.getXeroConnection(connectionId);
    if (!connection) throw new Error("Connection not found");

    const response = await fetch(`${XERO_API_BASE}/TrackingCategories/${trackingCategoryId}/Options`, {
      method: "PUT",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Xero-Tenant-Id": connection.tenantId,
        "Content-Type": "application/json",
        Accept: "application/json",
      },
      body: JSON.stringify({ Name: name }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Failed to create tracking option: ${response.status} ${errorText}`);
    }

    const data = (await response.json()) as any;
    return data.Options?.[0] || data;
  }

  private async findOrCreateContact(
    accessToken: string,
    tenantId: string,
    supplierName: string
  ): Promise<{ ContactID: string; Name: string }> {
    const searchResponse = await fetch(
      `${XERO_API_BASE}/Contacts?where=Name=="${encodeURIComponent(supplierName)}"`,
      {
        headers: {
          Authorization: `Bearer ${accessToken}`,
          "Xero-Tenant-Id": tenantId,
          Accept: "application/json",
        },
      }
    );

    if (searchResponse.ok) {
      const searchData = (await searchResponse.json()) as any;
      if (searchData.Contacts && searchData.Contacts.length > 0) {
        return searchData.Contacts[0];
      }
    }

    const createResponse = await fetch(`${XERO_API_BASE}/Contacts`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Xero-Tenant-Id": tenantId,
        "Content-Type": "application/json",
        Accept: "application/json",
      },
      body: JSON.stringify({
        Contacts: [{ Name: supplierName }],
      }),
    });

    if (!createResponse.ok) {
      const errorText = await createResponse.text();
      throw new Error(`Failed to create Xero contact: ${createResponse.status} ${errorText}`);
    }

    const createData = (await createResponse.json()) as any;
    return createData.Contacts[0];
  }

  private mapGstToXeroTaxType(gst: string): string {
    switch (gst) {
      case "GST on expenses":
        return "INPUT";
      case "No GST":
        return "EXEMPTEXPENSES";
      default:
        return "INPUT";
    }
  }

  async createPurchaseOrder(
    connectionId: string,
    poData: {
      supplierName: string;
      supplierXeroContactId?: string;
      poDate: string;
      deliveryDate?: string;
      reference?: string;
      poNumber?: string;
      attentionTo?: string;
      deliveryAddress?: string;
      deliveryInstructions?: string;
      taxMode: "inclusive" | "exclusive";
      lineItems: Array<{
        description: string;
        quantity: number;
        unitAmount: number;
        taxType?: string;
        accountCode?: string;
        tracking?: Array<{ TrackingCategoryID: string; TrackingOptionID: string }>;
      }>;
      status?: "DRAFT" | "SUBMITTED" | "AUTHORISED";
    },
  ): Promise<any> {
    const accessToken = await this.getValidToken(connectionId);
    const connection = await storage.getXeroConnection(connectionId);
    if (!connection) throw new Error("Connection not found");

    let contactId: string;
    if (poData.supplierXeroContactId) {
      contactId = poData.supplierXeroContactId;
    } else {
      const contact = await this.findOrCreateContact(
        accessToken,
        connection.tenantId,
        poData.supplierName,
      );
      contactId = contact.ContactID;
    }

    const xeroLineItems = poData.lineItems.map((item) => {
      const lineItem: any = {
        Description: item.description,
        Quantity: item.quantity,
        UnitAmount: item.unitAmount,
      };
      if (item.taxType) lineItem.TaxType = item.taxType;
      if (item.accountCode) lineItem.AccountCode = item.accountCode;
      if (item.tracking && item.tracking.length > 0) {
        lineItem.Tracking = item.tracking.map((t) => ({
          TrackingCategoryID: t.TrackingCategoryID,
          TrackingOptionID: t.TrackingOptionID,
        }));
      }
      return lineItem;
    });

    const poPayload: any = {
      Contact: { ContactID: contactId },
      Date: poData.poDate,
      LineItems: xeroLineItems,
      LineAmountTypes: poData.taxMode === "inclusive" ? "Inclusive" : "Exclusive",
      Status: poData.status || "DRAFT",
    };
    if (poData.deliveryDate) poPayload.DeliveryDate = poData.deliveryDate;
    if (poData.reference) poPayload.Reference = poData.reference;
    if (poData.poNumber) poPayload.PurchaseOrderNumber = poData.poNumber;
    if (poData.attentionTo) poPayload.AttentionTo = poData.attentionTo;
    if (poData.deliveryAddress) poPayload.DeliveryAddress = poData.deliveryAddress;
    if (poData.deliveryInstructions) poPayload.DeliveryInstructions = poData.deliveryInstructions;

    const response = await fetch(`${XERO_API_BASE}/PurchaseOrders`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Xero-Tenant-Id": connection.tenantId,
        "Content-Type": "application/json",
        Accept: "application/json",
      },
      body: JSON.stringify({ PurchaseOrders: [poPayload] }),
    });

    if (!response.ok) {
      throw await xeroErrorFromResponse(response, "Failed to create Xero purchase order");
    }

    const data = (await response.json()) as any;
    return data.PurchaseOrders?.[0] || data;
  }

  async getPurchaseOrder(connectionId: string, xeroPurchaseOrderId: string): Promise<any> {
    const accessToken = await this.getValidToken(connectionId);
    const connection = await storage.getXeroConnection(connectionId);
    if (!connection) throw new Error("Connection not found");

    const response = await fetch(
      `${XERO_API_BASE}/PurchaseOrders/${xeroPurchaseOrderId}`,
      {
        method: "GET",
        headers: {
          Authorization: `Bearer ${accessToken}`,
          "Xero-Tenant-Id": connection.tenantId,
          Accept: "application/json",
        },
      },
    );

    if (!response.ok) {
      throw await xeroErrorFromResponse(response, "Failed to fetch Xero purchase order");
    }

    const data = (await response.json()) as any;
    return data.PurchaseOrders?.[0] || null;
  }

  /**
   * List a single page (100) of purchase orders for a tenant. Used by the
   * background status poller to match many local POs against Xero in ONE call
   * instead of a GET per PO (which trips Xero's ~60/min rate limit).
   */
  async listPurchaseOrders(connectionId: string, opts: { page?: number; maxRetries?: number } = {}): Promise<any[]> {
    const accessToken = await this.getValidToken(connectionId);
    const connection = await storage.getXeroConnection(connectionId);
    if (!connection) throw new Error("Connection not found");

    const params = new URLSearchParams({ page: String(opts.page || 1) });
    const response = await xeroFetchWithRetry(
      `${XERO_API_BASE}/PurchaseOrders?${params}`,
      {
        headers: {
          Authorization: `Bearer ${accessToken}`,
          "Xero-Tenant-Id": connection.tenantId,
          Accept: "application/json",
        },
      },
      { label: "listPurchaseOrders", maxRetries: opts.maxRetries },
    );

    if (!response.ok) {
      if (response.status === 429) {
        throw new Error("Xero is rate-limiting requests right now (429). Please wait a minute and try again.");
      }
      const errorText = await response.text();
      throw new Error(`Failed to fetch Xero purchase orders: ${response.status} ${errorText}`);
    }

    const data = (await response.json()) as any;
    return data.PurchaseOrders || [];
  }

  /** Fetch every page of (non-deleted) purchase orders, 100 per page. */
  async listAllPurchaseOrders(connectionId: string, opts: { maxPages?: number; maxRetries?: number } = {}): Promise<any[]> {
    const maxPages = opts.maxPages ?? 20;
    const all: any[] = [];
    for (let page = 1; page <= maxPages; page++) {
      if (page > 1) await new Promise((resolve) => setTimeout(resolve, 300));
      const batch = await this.listPurchaseOrders(connectionId, { page, maxRetries: opts.maxRetries });
      all.push(...batch);
      if (batch.length < 100) break;
    }
    return all;
  }

  async createBill(connectionId: string, billData: XeroBillData): Promise<any> {
    const accessToken = await this.getValidToken(connectionId);
    const connection = await storage.getXeroConnection(connectionId);
    if (!connection) throw new Error("Connection not found");

    let contactId: string;

    if (billData.supplierXeroContactId) {
      contactId = billData.supplierXeroContactId;
    } else {
      const contact = await this.findOrCreateContact(
        accessToken,
        connection.tenantId,
        billData.supplierName
      );
      contactId = contact.ContactID;
    }

    const xeroLineItems = billData.lineItems.map((item) => {
      const lineItem: any = {
        Description: item.description,
        Quantity: item.quantity,
        UnitAmount: item.unitAmount,
        TaxType: item.taxType,
      };
      if (item.accountCode) {
        lineItem.AccountCode = item.accountCode;
      }
      if (item.tracking && item.tracking.length > 0) {
        lineItem.Tracking = item.tracking.map(t => ({
          TrackingCategoryID: t.TrackingCategoryID,
          TrackingOptionID: t.TrackingOptionID,
        }));
      }
      return lineItem;
    });

    const invoicePayload: any = {
      Type: "ACCPAY",
      Contact: { ContactID: contactId },
      Date: billData.billDate,
      LineItems: xeroLineItems,
      LineAmountTypes: billData.taxMode === "inclusive" ? "Inclusive" : "Exclusive",
      Status: billData.xeroStatus || "AUTHORISED",
    };

    if (billData.dueDate) {
      invoicePayload.DueDate = billData.dueDate;
    }
    if (billData.reference) {
      invoicePayload.Reference = billData.reference;
    }
    if (billData.invoiceNumber) {
      invoicePayload.InvoiceNumber = billData.invoiceNumber;
    }

    const response = await xeroFetchWithRetry(`${XERO_API_BASE}/Invoices`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Xero-Tenant-Id": connection.tenantId,
        "Content-Type": "application/json",
        Accept: "application/json",
      },
      body: JSON.stringify({ Invoices: [invoicePayload] }),
    }, { label: "createBill" });

    if (!response.ok) {
      throw await xeroErrorFromResponse(response, "Failed to create Xero bill");
    }

    const data = (await response.json()) as any;
    return data.Invoices?.[0] || data;
  }

  async updateBill(connectionId: string, xeroInvoiceId: string, billData: XeroBillData): Promise<any> {
    const accessToken = await this.getValidToken(connectionId);
    const connection = await storage.getXeroConnection(connectionId);
    if (!connection) throw new Error("Connection not found");

    let contactId = billData.supplierXeroContactId;
    if (!contactId) {
      const contact = await this.findOrCreateContact(accessToken, connection.tenantId, billData.supplierName);
      contactId = contact.ContactID;
    }

    const xeroLineItems = billData.lineItems.map((item) => {
      const lineItem: any = {
        Description: item.description,
        Quantity: item.quantity,
        UnitAmount: item.unitAmount,
        TaxType: item.taxType,
      };
      if (item.accountCode) lineItem.AccountCode = item.accountCode;
      if (item.tracking && item.tracking.length > 0) {
        lineItem.Tracking = item.tracking.map(t => ({
          TrackingCategoryID: t.TrackingCategoryID,
          TrackingOptionID: t.TrackingOptionID,
        }));
      }
      return lineItem;
    });

    const invoicePayload: any = {
      InvoiceID: xeroInvoiceId,
      Type: "ACCPAY",
      Contact: { ContactID: contactId },
      Date: billData.billDate,
      LineItems: xeroLineItems,
      LineAmountTypes: billData.taxMode === "inclusive" ? "Inclusive" : "Exclusive",
      Status: billData.xeroStatus || "AUTHORISED",
    };

    if (billData.dueDate) invoicePayload.DueDate = billData.dueDate;
    if (billData.reference) invoicePayload.Reference = billData.reference;
    if (billData.invoiceNumber) invoicePayload.InvoiceNumber = billData.invoiceNumber;

    const response = await xeroFetchWithRetry(`${XERO_API_BASE}/Invoices/${xeroInvoiceId}`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Xero-Tenant-Id": connection.tenantId,
        "Content-Type": "application/json",
        Accept: "application/json",
      },
      body: JSON.stringify({ Invoices: [invoicePayload] }),
    }, { label: "updateBill" });

    if (!response.ok) {
      throw await xeroErrorFromResponse(response, "Failed to update Xero bill");
    }

    const data = (await response.json()) as any;
    return data.Invoices?.[0] || data;
  }

  /**
   * Returns the existing attachment summaries on a Xero invoice. Used to
   * skip re-uploading files we've already pushed (idempotent attachment sync).
   */
  // ── Vendor credits (ACCPAYCREDIT) ──────────────────────────────────────────
  // A supplier credit is its own document type in Xero and lives on
  // /CreditNotes, not /Invoices. Pushing one as an ACCPAY invoice — which is
  // what happened before the guard went in — raises payables instead of
  // reducing them. Amounts go up positive exactly like a bill; the document
  // type is what makes it a credit.
  //
  // Shapes taken from the Xero SDK's own model definitions, not from memory:
  //   Type          ACCPAYCREDIT | ACCRECCREDIT
  //   Status        DRAFT | SUBMITTED | DELETED | AUTHORISED | PAID | VOIDED
  //   response      { CreditNotes: [ { CreditNoteID, CreditNoteNumber, … } ] }
  // Note there is no Reference field on a payables credit — the SDK documents
  // Reference as ACCRECCREDIT-only, so the bill push's `Reference` must not be
  // carried across.
  private buildCreditNotePayload(billData: XeroBillData, contactId: string): any {
    const payload: any = {
      Type: "ACCPAYCREDIT",
      Contact: { ContactID: contactId },
      Date: billData.billDate,
      LineItems: billData.lineItems.map((item) => {
        const lineItem: any = {
          Description: item.description,
          Quantity: item.quantity,
          UnitAmount: item.unitAmount,
          TaxType: item.taxType,
        };
        if (item.accountCode) lineItem.AccountCode = item.accountCode;
        if (item.tracking && item.tracking.length > 0) {
          lineItem.Tracking = item.tracking.map((t) => ({
            TrackingCategoryID: t.TrackingCategoryID,
            TrackingOptionID: t.TrackingOptionID,
          }));
        }
        return lineItem;
      }),
      LineAmountTypes: billData.taxMode === "inclusive" ? "Inclusive" : "Exclusive",
      Status: billData.xeroStatus || "AUTHORISED",
    };
    // The supplier's own credit note number, mirroring how billReference maps
    // to InvoiceNumber on a bill.
    if (billData.invoiceNumber) payload.CreditNoteNumber = billData.invoiceNumber;
    return payload;
  }

  private async creditNoteRequest(
    connectionId: string,
    path: string,
    body: any,
    label: string,
  ): Promise<any> {
    const accessToken = await this.getValidToken(connectionId);
    const connection = await storage.getXeroConnection(connectionId);
    if (!connection) throw new Error("Connection not found");

    const response = await xeroFetchWithRetry(`${XERO_API_BASE}${path}`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Xero-Tenant-Id": connection.tenantId,
        "Content-Type": "application/json",
        Accept: "application/json",
      },
      body: JSON.stringify(body),
    }, { label });

    if (!response.ok) {
      // Same shape the bill push raises, so the caller's validation-error
      // handling (missing account code, locked document, and the rest) works
      // identically for a credit note.
      throw await xeroErrorFromResponse(response, `Failed to ${label === "createCreditNote" ? "create" : "update"} Xero credit note`);
    }
    const data = (await response.json()) as any;
    return data.CreditNotes?.[0] || null;
  }

  async createCreditNote(connectionId: string, billData: XeroBillData): Promise<any> {
    const accessToken = await this.getValidToken(connectionId);
    const connection = await storage.getXeroConnection(connectionId);
    if (!connection) throw new Error("Connection not found");
    let contactId = billData.supplierXeroContactId;
    if (!contactId) {
      const contact = await this.findOrCreateContact(accessToken, connection.tenantId, billData.supplierName);
      contactId = contact.ContactID;
    }
    const payload = this.buildCreditNotePayload(billData, contactId);
    return this.creditNoteRequest(connectionId, "/CreditNotes", { CreditNotes: [payload] }, "createCreditNote");
  }

  async updateCreditNote(connectionId: string, creditNoteId: string, billData: XeroBillData): Promise<any> {
    const accessToken = await this.getValidToken(connectionId);
    const connection = await storage.getXeroConnection(connectionId);
    if (!connection) throw new Error("Connection not found");
    let contactId = billData.supplierXeroContactId;
    if (!contactId) {
      const contact = await this.findOrCreateContact(accessToken, connection.tenantId, billData.supplierName);
      contactId = contact.ContactID;
    }
    const payload = { ...this.buildCreditNotePayload(billData, contactId), CreditNoteID: creditNoteId };
    return this.creditNoteRequest(
      connectionId,
      `/CreditNotes/${creditNoteId}`,
      { CreditNotes: [payload] },
      "updateCreditNote",
    );
  }

  async getCreditNote(connectionId: string, creditNoteId: string): Promise<any> {
    const accessToken = await this.getValidToken(connectionId);
    const connection = await storage.getXeroConnection(connectionId);
    if (!connection) throw new Error("Xero connection not found");

    const response = await xeroFetchWithRetry(`${XERO_API_BASE}/CreditNotes/${creditNoteId}`, {
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Xero-Tenant-Id": connection.tenantId,
        Accept: "application/json",
      },
    }, { label: "getCreditNote" });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Failed to fetch Xero credit note: ${response.status} ${errorText}`);
    }
    const data = (await response.json()) as any;
    return data.CreditNotes?.[0] || null;
  }

  async getInvoiceAttachments(connectionId: string, xeroInvoiceId: string): Promise<XeroAttachmentSummary[]> {
    const accessToken = await this.getValidToken(connectionId);
    const connection = await storage.getXeroConnection(connectionId);
    if (!connection) throw new Error("Connection not found");
    const response = await xeroFetchWithRetry(`${XERO_API_BASE}/Invoices/${xeroInvoiceId}/Attachments`, {
      method: "GET",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Xero-Tenant-Id": connection.tenantId,
        Accept: "application/json",
      },
    }, { label: "getInvoiceAttachments" });
    if (!response.ok) {
      // 404 from Xero means "no attachments yet" — treat as empty.
      if (response.status === 404) return [];
      const txt = await response.text();
      throw new Error(`Failed to list Xero attachments: ${response.status} ${txt}`);
    }
    const data = (await response.json()) as any;
    return Array.isArray(data?.Attachments) ? data.Attachments : [];
  }

  /**
   * Uploads a single file to a Xero invoice via the Attachments endpoint.
   * Xero requires the raw file body (not multipart) and the filename in the URL.
   * Honour Xero's 25MB cap with a clear error so callers can surface it.
   */
  async uploadInvoiceAttachment(
    connectionId: string,
    xeroInvoiceId: string,
    filename: string,
    contentType: string,
    body: Buffer,
  ): Promise<any> {
    const MAX_BYTES = 25 * 1024 * 1024;
    if (body.byteLength > MAX_BYTES) {
      throw new Error(`Attachment "${filename}" exceeds Xero's 25MB limit (${body.byteLength} bytes)`);
    }
    const accessToken = await this.getValidToken(connectionId);
    const connection = await storage.getXeroConnection(connectionId);
    if (!connection) throw new Error("Connection not found");
    // Xero requires the filename to be URL-encoded in the path.
    const safeName = encodeURIComponent(filename);
    const response = await fetch(
      `${XERO_API_BASE}/Invoices/${xeroInvoiceId}/Attachments/${safeName}`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${accessToken}`,
          "Xero-Tenant-Id": connection.tenantId,
          "Content-Type": contentType || "application/octet-stream",
          Accept: "application/json",
        },
        body: body as any,
      },
    );
    if (!response.ok) {
      const txt = await response.text();
      throw new Error(`Failed to upload attachment "${filename}": ${response.status} ${txt}`);
    }
    return response.json().catch(() => ({}));
  }

  /**
   * Downloads a single attachment's binary content from a Xero invoice.
   * Prefers the AttachmentID (collision-free) and falls back to the
   * URL-encoded filename. Returns the raw bytes plus filename/contentType so
   * callers can persist it to object storage.
   */
  async downloadInvoiceAttachment(
    connectionId: string,
    xeroInvoiceId: string,
    attachment: { AttachmentID?: string; FileName?: string; MimeType?: string },
  ): Promise<{ filename: string; contentType: string; buffer: Buffer }> {
    const accessToken = await this.getValidToken(connectionId);
    const connection = await storage.getXeroConnection(connectionId);
    if (!connection) throw new Error("Connection not found");

    const filename = attachment.FileName || "attachment";
    const contentType = attachment.MimeType || "application/octet-stream";
    const ref = attachment.AttachmentID || encodeURIComponent(filename);
    const response = await xeroFetchWithRetry(
      `${XERO_API_BASE}/Invoices/${xeroInvoiceId}/Attachments/${ref}`,
      {
        method: "GET",
        headers: {
          Authorization: `Bearer ${accessToken}`,
          "Xero-Tenant-Id": connection.tenantId,
          // Xero returns the raw file when Accept matches the file's MIME type.
          Accept: contentType,
        },
      },
      { label: "downloadInvoiceAttachment" },
    );
    if (!response.ok) {
      const txt = await response.text();
      throw new Error(`Failed to download attachment "${filename}": ${response.status} ${txt}`);
    }
    const arrayBuffer = await response.arrayBuffer();
    return { filename, contentType, buffer: Buffer.from(arrayBuffer) };
  }

  async createInvoice(connectionId: string, invoiceData: {
    clientName: string;
    clientXeroContactId?: string;
    invoiceDate: string;
    dueDate?: string;
    reference?: string;
    invoiceNumber?: string;
    lineItems: XeroBillLineItem[];
  }): Promise<any> {
    const accessToken = await this.getValidToken(connectionId);
    const connection = await storage.getXeroConnection(connectionId);
    if (!connection) throw new Error("Connection not found");

    let contactId: string;

    if (invoiceData.clientXeroContactId) {
      contactId = invoiceData.clientXeroContactId;
    } else {
      const contact = await this.findOrCreateContact(
        accessToken,
        connection.tenantId,
        invoiceData.clientName
      );
      contactId = contact.ContactID;
    }

    const xeroLineItems = invoiceData.lineItems.map((item) => {
      const lineItem: any = {
        Description: item.description,
        Quantity: item.quantity,
        UnitAmount: item.unitAmount,
        TaxType: item.taxType === "INPUT" ? "OUTPUT" : item.taxType,
      };
      if (item.taxAmount !== undefined) {
        lineItem.TaxAmount = item.taxAmount;
      }
      if (item.accountCode) {
        lineItem.AccountCode = item.accountCode;
      }
      if (item.tracking && item.tracking.length > 0) {
        lineItem.Tracking = item.tracking.map(t => ({
          TrackingCategoryID: t.TrackingCategoryID,
          TrackingOptionID: t.TrackingOptionID,
        }));
      }
      return lineItem;
    });

    const invoicePayload: any = {
      Type: "ACCREC",
      Contact: { ContactID: contactId },
      Date: invoiceData.invoiceDate,
      LineItems: xeroLineItems,
      LineAmountTypes: "Exclusive",
      Status: "AUTHORISED",
    };

    if (invoiceData.dueDate) {
      invoicePayload.DueDate = invoiceData.dueDate;
    }
    if (invoiceData.reference) {
      invoicePayload.Reference = invoiceData.reference;
    }
    if (invoiceData.invoiceNumber) {
      invoicePayload.InvoiceNumber = invoiceData.invoiceNumber;
    }

    const response = await fetch(`${XERO_API_BASE}/Invoices`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Xero-Tenant-Id": connection.tenantId,
        "Content-Type": "application/json",
        Accept: "application/json",
      },
      body: JSON.stringify({ Invoices: [invoicePayload] }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      const err = new Error(summarizeXeroError(errorText)) as Error & {
        status?: number;
        xeroBody?: string;
      };
      err.status = response.status;
      err.xeroBody = errorText;
      throw err;
    }

    const data = (await response.json()) as any;
    return data.Invoices?.[0] || data;
  }

  /**
   * List ACCPAY (supplier bill) invoices from Xero.
   * Pulls AUTHORISED + PAID + SUBMITTED bills, paginated.
   */
  async listBills(
    connectionId: string,
    opts: { modifiedSince?: Date; page?: number; statuses?: string[]; maxRetries?: number } = {}
  ): Promise<any[]> {
    const accessToken = await this.getValidToken(connectionId);
    const connection = await storage.getXeroConnection(connectionId);
    if (!connection) throw new Error("Xero connection not found");

    const statuses = opts.statuses && opts.statuses.length > 0
      ? opts.statuses
      : ["AUTHORISED", "PAID", "SUBMITTED"];

    // Build filter: Type=="ACCPAY" AND (Status=="AUTHORISED" OR ...)
    const statusClause = statuses.map(s => `Status=="${s}"`).join(" OR ");
    const where = `Type=="ACCPAY" AND (${statusClause})`;

    const params = new URLSearchParams({
      where,
      order: "Date DESC",
      page: String(opts.page || 1),
    });

    const headers: Record<string, string> = {
      Authorization: `Bearer ${accessToken}`,
      "Xero-Tenant-Id": connection.tenantId,
      Accept: "application/json",
    };

    if (opts.modifiedSince) {
      headers["If-Modified-Since"] = opts.modifiedSince.toUTCString();
    }

    const response = await xeroFetchWithRetry(`${XERO_API_BASE}/Invoices?${params}`, { headers }, { label: "listBills", maxRetries: opts.maxRetries });

    if (!response.ok) {
      if (response.status === 429) {
        throw new Error("Xero is rate-limiting requests right now (429). Please wait a minute and try again.");
      }
      const errorText = await response.text();
      throw new Error(`Failed to fetch Xero bills: ${response.status} ${errorText}`);
    }

    const data = (await response.json()) as any;
    return data.Invoices || [];
  }

  /**
   * Fetch ALL pages of ACCPAY bills (up to maxPages) by following Xero's
   * 100-per-page pagination. Xero cannot filter by tracking category
   * server-side (tracking lives on line items), so the import preview must
   * load every page and filter locally — otherwise a job's older bills beyond
   * the most-recent 100 silently never appear in the import list.
   */
  async listAllBills(
    connectionId: string,
    opts: { modifiedSince?: Date; statuses?: string[]; maxPages?: number; maxRetries?: number } = {}
  ): Promise<any[]> {
    const maxPages = opts.maxPages ?? 50;
    const all: any[] = [];
    let pagesFetched = 0;
    for (let page = 1; page <= maxPages; page++) {
      // Pace successive pages so a deep ledger doesn't burst Xero's ~60/min
      // limit; listBills also retries on 429 as a safety net.
      if (page > 1) await new Promise((resolve) => setTimeout(resolve, 300));
      const batch = await this.listBills(connectionId, {
        modifiedSince: opts.modifiedSince,
        statuses: opts.statuses,
        page,
        maxRetries: opts.maxRetries,
      });
      pagesFetched = page;
      all.push(...batch);
      if (batch.length < 100) break;
    }
    console.log(`[Xero] listAllBills: fetched ${pagesFetched} page(s), ${all.length} bill(s) total`);
    return all;
  }

  /**
   * Create a payment in Xero against an invoice (POST /Payments).
   * accountCode: Xero bank account code (e.g. "090") or accountId
   */
  async createPayment(
    connectionId: string,
    payment: {
      invoiceId: string;
      amount: number; // in dollars
      date?: string; // YYYY-MM-DD
      accountCode?: string;
      accountId?: string;
      reference?: string;
    }
  ): Promise<any> {
    const accessToken = await this.getValidToken(connectionId);
    const connection = await storage.getXeroConnection(connectionId);
    if (!connection) throw new Error("Xero connection not found");

    const body: any = {
      Invoice: { InvoiceID: payment.invoiceId },
      Amount: payment.amount,
      Date: payment.date || new Date().toISOString().slice(0, 10),
    };
    if (payment.accountId) body.Account = { AccountID: payment.accountId };
    else if (payment.accountCode) body.Account = { Code: payment.accountCode };
    else throw new Error("createPayment requires accountCode or accountId");
    if (payment.reference) body.Reference = payment.reference;

    const response = await xeroFetchWithRetry(`${XERO_API_BASE}/Payments`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Xero-Tenant-Id": connection.tenantId,
        Accept: "application/json",
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
    }, { label: "createPayment" });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Failed to create Xero payment: ${response.status} ${errorText}`);
    }

    const data = (await response.json()) as any;
    return data.Payments?.[0] || null;
  }

  /**
   * Fetch a single payment from Xero by its PaymentID.
   * Returns the payment object including the nested Invoice.InvoiceID so the
   * webhook handler can resolve which local bill to update.
   */
  async getPayment(connectionId: string, paymentId: string): Promise<any> {
    const accessToken = await this.getValidToken(connectionId);
    const connection = await storage.getXeroConnection(connectionId);
    if (!connection) throw new Error("Xero connection not found");

    const response = await fetch(`${XERO_API_BASE}/Payments/${paymentId}`, {
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Xero-Tenant-Id": connection.tenantId,
        Accept: "application/json",
      },
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Failed to fetch Xero payment: ${response.status} ${errorText}`);
    }

    const data = (await response.json()) as any;
    return data.Payments?.[0] || null;
  }

  /**
   * Flag an invoice as sent to the contact in Xero.
   *
   * Xero has no SENT status — AUTHORISED covers both "approved" and "sent", and
   * SentToContact is the boolean that separates them. Morada carries those as
   * two statuses, so emailing from here has to write the flag back or Xero
   * keeps showing the invoice as never sent.
   */
  /**
   * Void an invoice in Xero.
   *
   * An AUTHORISED invoice cannot be deleted through the API — voiding is the
   * only way to withdraw it, and it is irreversible. Xero refuses to void an
   * invoice carrying payments; that needs a credit note instead, so callers
   * must check before reaching this.
   */
  async voidInvoice(connectionId: string, invoiceId: string): Promise<void> {
    const accessToken = await this.getValidToken(connectionId);
    const connection = await storage.getXeroConnection(connectionId);
    if (!connection) throw new Error("Xero connection not found");

    const response = await fetch(`${XERO_API_BASE}/Invoices`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Xero-Tenant-Id": connection.tenantId,
        "Content-Type": "application/json",
        Accept: "application/json",
      },
      body: JSON.stringify({ Invoices: [{ InvoiceID: invoiceId, Status: "VOIDED" }] }),
    });
    if (!response.ok) {
      throw new Error(summarizeXeroError(await response.text()));
    }
  }

  async markInvoiceSentToContact(connectionId: string, invoiceId: string): Promise<void> {
    const accessToken = await this.getValidToken(connectionId);
    const connection = await storage.getXeroConnection(connectionId);
    if (!connection) throw new Error("Xero connection not found");

    const response = await fetch(`${XERO_API_BASE}/Invoices`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Xero-Tenant-Id": connection.tenantId,
        "Content-Type": "application/json",
        Accept: "application/json",
      },
      body: JSON.stringify({ Invoices: [{ InvoiceID: invoiceId, SentToContact: true }] }),
    });
    if (!response.ok) {
      throw new Error(summarizeXeroError(await response.text()));
    }
  }

  async getInvoice(connectionId: string, invoiceId: string): Promise<any> {
    const accessToken = await this.getValidToken(connectionId);
    const connection = await storage.getXeroConnection(connectionId);
    if (!connection) throw new Error("Xero connection not found");

    const response = await xeroFetchWithRetry(`${XERO_API_BASE}/Invoices/${invoiceId}`, {
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Xero-Tenant-Id": connection.tenantId,
        Accept: "application/json",
      },
    }, { label: "getInvoice" });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Failed to fetch Xero invoice: ${response.status} ${errorText}`);
    }

    const data = (await response.json()) as any;
    return data.Invoices?.[0] || null;
  }

  /**
   * Fetch P&L report for a date range and return expense lines grouped by account code and month.
   * fromDate / toDate: "YYYY-MM-DD"
   * Returns: { [accountCode]: { [YYYY-MM]: amountExTax } }
   */
  async getProfitAndLossReport(
    connectionId: string,
    fromDate: string,
    toDate: string
  ): Promise<{ byAccount: Record<string, { name: string; type: string | null; amounts: Record<string, number> }>; accounts: any[]; incomeTotals: Record<string, number>; directCostTotals: Record<string, number>; incomeByAccount: Record<string, Record<string, number>>; directCostByAccount: Record<string, Record<string, number>>; parsedTotals: Record<string, SectionTotals>; reportTotals: Record<string, SectionTotals> }> {
    const accessToken = await this.getValidToken(connectionId);
    const connection = await storage.getXeroConnection(connectionId);
    if (!connection) throw new Error("Connection not found");

    // We need single-month columns. Two important Xero quirks to work around:
    //
    // 1. Sending fromDate+toDate together with periods+timeframe makes Xero
    //    treat the fromDate→toDate range as the period length and return
    //    periods+1 sliding-window columns of that length (e.g. a 10-month
    //    range with periods=10 → 11 columns each summing 10 months).
    //
    // 2. Xero's ProfitAndLoss endpoint does NOT support the `date` parameter
    //    (that one is for Balance Sheet, which is an "as at" report). When
    //    `date` is sent to P&L it is silently ignored and Xero falls back to
    //    "today" as the report end-date — so every chunked call returns the
    //    same most-recent N+1 months and older windows are never fetched.
    //
    // Correct approach: set fromDate+toDate to a SINGLE-MONTH range (the last
    // month of the requested window). Then `periods+timeframe=MONTH` adds N
    // additional comparison columns of the same length (1 month each) going
    // back from toDate, for a total of N+1 monthly columns ending at toDate.
    // Cap periods at 11 (Xero's documented max).
    const from = new Date(fromDate);
    const to = new Date(toDate);
    const monthsDiff = (to.getFullYear() - from.getFullYear()) * 12 + (to.getMonth() - from.getMonth()) + 1;
    const periods = String(Math.min(11, Math.max(0, monthsDiff - 1)));
    const lastMonthYear = to.getFullYear();
    const lastMonthIdx = to.getMonth(); // 0-11
    const reportFromDate = `${lastMonthYear}-${String(lastMonthIdx + 1).padStart(2, "0")}-01`;
    const lastDayOfReportMonth = new Date(lastMonthYear, lastMonthIdx + 1, 0).getDate();
    const reportToDate = `${lastMonthYear}-${String(lastMonthIdx + 1).padStart(2, "0")}-${String(lastDayOfReportMonth).padStart(2, "0")}`;

    const headers = {
      Authorization: `Bearer ${accessToken}`,
      "Xero-Tenant-Id": connection.tenantId,
      Accept: "application/json",
    };

    // Fetch P&L report and full accounts list in parallel
    // Accounts list is needed to resolve Xero AccountIDs (UUIDs) → account code numbers
    const params = new URLSearchParams({
      fromDate: reportFromDate,
      toDate: reportToDate,
      periods,
      timeframe: "MONTH",
      standardLayout: "true",
    });

    const [response, accountsResponse] = await Promise.all([
      fetch(`${XERO_API_BASE}/Reports/ProfitAndLoss?${params}`, { headers }),
      fetch(`${XERO_API_BASE}/Accounts`, { headers }),
    ]);

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Failed to fetch P&L report: ${response.status} ${errorText}`);
    }

    // Build UUID → account code and UUID → account type maps
    // The type map lets us classify income vs expense by Xero's canonical Type field
    // (REVENUE / SALES / OTHERINCOME) instead of fragile section-title keyword matching
    const uuidToCode = new Map<string, string>();
    const uuidToType = new Map<string, string>(); // e.g. "REVENUE", "SALES", "OTHERINCOME", "EXPENSE", etc.
    // These maps are not optional. Without them every P&L row keys on a raw
    // account UUID instead of its code (so it matches no overhead item) and
    // income/direct-cost classification silently degrades to section-title
    // keyword guessing. A sync that continued here would quietly write almost
    // nothing, so a failed /Accounts call has to abort the whole run.
    if (!accountsResponse.ok) {
      const errorText = await accountsResponse.text();
      throw new Error(`Failed to fetch Xero accounts for P&L mapping: ${accountsResponse.status} ${errorText}`);
    }
    const accountsData = (await accountsResponse.json()) as any;
    for (const acc of (accountsData.Accounts || [])) {
      if (acc.AccountID) {
        if (acc.Code) uuidToCode.set(acc.AccountID as string, (acc.Code as string).trim());
        if (acc.Type) uuidToType.set(acc.AccountID as string, (acc.Type as string).toUpperCase());
      }
    }
    if (uuidToCode.size === 0) {
      throw new Error("Xero returned an empty account list — refusing to sync P&L against unmapped accounts");
    }

    const INCOME_TYPES = new Set(["REVENUE", "SALES", "OTHERINCOME"]);

    const data = (await response.json()) as any;
    const report = data.Reports?.[0];
    if (!report) return { byAccount: {}, accounts: [], incomeTotals: {}, directCostTotals: {}, incomeByAccount: {}, directCostByAccount: {}, parsedTotals: {}, reportTotals: {} };

    // Parse column headers to extract month labels (format: "Jan 2025")
    const columns: string[] = (report.Rows?.[0]?.Cells || []).map((c: any) => c.Value || "");

    // Optional diagnostic logging for investigating missing-month issues in the
    // Xero P&L response (e.g. an absent May 2025 column). Off by default; enable
    // by setting XERO_PL_DIAGNOSTIC=1 in the server environment when needed.
    // Diagnostic for the missing-month failure mode: a P&L column Xero does not
    // return (or that we fail to parse) means that month is never written, and
    // for a CONFIRMED month that leaves the stored figures frozen at stale
    // values with no drift flag and no visible signal. Enable with
    // XERO_PL_DIAGNOSTIC=1 and read `missingMonths`.
    if (process.env.XERO_PL_DIAGNOSTIC === "1") {
      const parsedMonthKeys = columns.slice(1).map(
        (label) => parseXeroPnlMonthLabel(label) ?? `<unparsed:"${label}">`,
      );
      // Every month the caller asked for, so we can name what came back short.
      const requested: string[] = [];
      {
        const cursor = new Date(fromDate);
        const last = new Date(toDate);
        while (cursor <= last) {
          requested.push(`${cursor.getFullYear()}-${String(cursor.getMonth() + 1).padStart(2, "0")}`);
          cursor.setMonth(cursor.getMonth() + 1);
        }
      }
      const returned = new Set(parsedMonthKeys);
      const missingMonths = requested.filter((m) => !returned.has(m));
      console.log("[Xero P&L diagnostic]", {
        windowFromDate: fromDate,
        windowToDate: toDate,
        reportFromDate,
        reportToDate,
        periods,
        monthsDiff,
        columnsCount: columns.length,
        columns,
        parsedMonthKeys,
        requestedMonths: requested,
        missingMonths,
      });
      if (missingMonths.length > 0) {
        console.warn(
          `[Xero P&L diagnostic] Xero did not return ${missingMonths.length} requested month column(s): ${missingMonths.join(", ")}`,
        );
      }
    }

    const byAccount: Record<string, { name: string; type: string | null; amounts: Record<string, number> }> = {};
    // Per-month section totals straight off the report, used to reconcile what we
    // actually stored against what Xero said (see verifySyncedTotals).
    // parsedTotals = what THIS parser pulled out of the account rows.
    // reportTotals  = what Xero's own "Total ..." summary rows say.
    // Comparing the two separates a parse bug from a write bug when the
    // reconciliation guard fires.
    const parsedTotals: Record<string, SectionTotals> = {};
    const reportTotals: Record<string, SectionTotals> = {};
    const bump = (into: Record<string, SectionTotals>, monthKey: string, field: keyof SectionTotals, val: number) => {
      if (!into[monthKey]) into[monthKey] = { income: 0, directCosts: 0, expenses: 0 };
      into[monthKey][field] += val;
    };
    const accounts: any[] = [];
    // income totals keyed by "YYYY-MM"
    const incomeTotals: Record<string, number> = {};
    // income by individual account name: { accountName: { "YYYY-MM": cents } }
    const incomeByAccount: Record<string, Record<string, number>> = {};
    // direct cost totals keyed by "YYYY-MM" (Xero DIRECTCOSTS type accounts)
    const directCostTotals: Record<string, number> = {};
    // direct costs by individual account name: { accountName: { "YYYY-MM": amount } }
    const directCostByAccount: Record<string, Record<string, number>> = {};
    const DIRECT_COST_TYPES = new Set(["DIRECTCOSTS"]);

    const MONTH_MAP: Record<string, string> = {
      Jan: "01", Feb: "02", Mar: "03", Apr: "04", May: "05", Jun: "06",
      Jul: "07", Aug: "08", Sep: "09", Oct: "10", Nov: "11", Dec: "12",
    };

    // Fallback keyword sets — only used when account UUID is not resolvable
    const INCOME_SECTION_KEYWORDS = ["revenue", "income", "sales", "trading income", "other income"];
    const SUMMARY_KEYWORDS = ["gross profit", "net profit", "total"];

    function isSummaryRow(title: string): boolean {
      const lower = title.toLowerCase();
      return SUMMARY_KEYWORDS.some(k => lower.includes(k));
    }

    function isIncomeSectionTitle(title: string): boolean {
      const lower = title.toLowerCase();
      if (SUMMARY_KEYWORDS.some(k => lower.includes(k))) return false;
      return INCOME_SECTION_KEYWORDS.some(k => lower.includes(k));
    }

    function isExpenseSectionTitle(title: string): boolean {
      const lower = title.toLowerCase();
      if (INCOME_SECTION_KEYWORDS.some(k => lower.includes(k))) return false;
      if (SUMMARY_KEYWORDS.some(k => lower.includes(k))) return false;
      return true;
    }

    function extractMonthAmounts(cells: any[]): Record<string, number> {
      const result: Record<string, number> = {};
      for (let i = 1; i < cells.length && i < columns.length; i++) {
        const monthKey = parseXeroPnlMonthLabel(columns[i] || "");
        if (!monthKey) continue;
        result[monthKey] = parseFloat(cells[i]?.Value || "0") || 0;
      }
      return result;
    }

    function getAccountUuid(cells: any[]): string {
      return cells[0]?.Attributes?.find((a: any) => a.Id === "account")?.Value || "";
    }

    function parseRow(cells: any[], insideExpense: boolean, insideIncome: boolean) {
      const rowTitle = cells[0]?.Value || "";
      if (isSummaryRow(rowTitle)) return;

      const accountUuid = getAccountUuid(cells);
      const accountType = accountUuid ? uuidToType.get(accountUuid) : undefined;

      // Primary classification: use Xero's Type field if available
      const isIncomeByType = accountType ? INCOME_TYPES.has(accountType) : false;
      const isExpenseByType = accountType ? !INCOME_TYPES.has(accountType) : false;

      // Determine effective classification
      const effectiveIncome = isIncomeByType || (!accountType && insideIncome);
      const effectiveExpense = isExpenseByType || (!accountType && insideExpense);

      if (effectiveIncome) {
        const monthAmts = extractMonthAmounts(cells);
        const accountName = rowTitle || "Income";
        for (const [monthKey, val] of Object.entries(monthAmts)) {
          incomeTotals[monthKey] = (incomeTotals[monthKey] || 0) + val;
          bump(parsedTotals, monthKey, "income", val);
          if (!incomeByAccount[accountName]) incomeByAccount[accountName] = {};
          incomeByAccount[accountName][monthKey] = (incomeByAccount[accountName][monthKey] || 0) + val;
        }
      } else if (accountType && DIRECT_COST_TYPES.has(accountType)) {
        // Track direct costs separately for the P&L gross profit calculation
        const monthAmts = extractMonthAmounts(cells);
        const accountName = rowTitle || "Direct Costs";
        for (const [monthKey, val] of Object.entries(monthAmts)) {
          directCostTotals[monthKey] = (directCostTotals[monthKey] || 0) + val;
          bump(parsedTotals, monthKey, "directCosts", val);
          if (!directCostByAccount[accountName]) directCostByAccount[accountName] = {};
          directCostByAccount[accountName][monthKey] = (directCostByAccount[accountName][monthKey] || 0) + val;
        }
      } else if (effectiveExpense) {
        const accountCode = (accountUuid && uuidToCode.get(accountUuid)) || accountUuid;
        if (!accountCode && !rowTitle) return;
        const key = accountCode || rowTitle;
        if (!byAccount[key]) {
          byAccount[key] = { name: rowTitle, type: accountType || null, amounts: {} };
          accounts.push({ code: accountCode, name: rowTitle, type: accountType || null });
        }
        const monthAmts = extractMonthAmounts(cells);
        for (const [monthKey, val] of Object.entries(monthAmts)) {
          byAccount[key].amounts[monthKey] = (byAccount[key].amounts[monthKey] || 0) + val;
          bump(parsedTotals, monthKey, "expenses", val);
        }
      }
    }

    // Xero closes each P&L section with a SummaryRow ("Total Income",
    // "Total Cost of Sales", "Total Operating Expenses", ...). Those are the
    // figures a human reads off the report, so capture them verbatim.
    function captureSummaryRow(cells: any[]) {
      const title = (cells?.[0]?.Value || "").toLowerCase();
      if (!title.startsWith("total")) return;
      let field: keyof SectionTotals | null = null;
      if (title.includes("cost of sales") || title.includes("direct cost")) field = "directCosts";
      else if (title.includes("operating expense") || title === "total expenses") field = "expenses";
      else if (title.includes("income") || title.includes("revenue")) field = "income";
      if (!field) return;
      for (const [monthKey, val] of Object.entries(extractMonthAmounts(cells))) {
        bump(reportTotals, monthKey, field, val);
      }
    }

    function parseSection(rows: any[], insideExpense: boolean, insideIncome: boolean) {
      for (const row of rows) {
        if (row.RowType === "SummaryRow" && row.Cells) {
          captureSummaryRow(row.Cells);
          continue;
        }
        if (row.RowType === "Section") {
          const sectionTitle: string = row.Title || row.Cells?.[0]?.Value || "";
          const nextIncome = sectionTitle ? isIncomeSectionTitle(sectionTitle) : insideIncome;
          const nextExpense = sectionTitle ? isExpenseSectionTitle(sectionTitle) : insideExpense;
          if (row.Rows) parseSection(row.Rows, nextExpense, nextIncome);
        } else if (row.RowType === "Row" && row.Cells) {
          parseRow(row.Cells, insideExpense, insideIncome);
        } else if (row.Rows) {
          parseSection(row.Rows, insideExpense, insideIncome);
        }
      }
    }

    parseSection(report.Rows || [], false, false);

    return { byAccount, accounts, incomeTotals, directCostTotals, incomeByAccount, directCostByAccount, parsedTotals, reportTotals };
  }

  async createContact(connectionId: string, name: string): Promise<{ contactId: string; name: string }> {
    const accessToken = await this.getValidToken(connectionId);
    const connection = await storage.getXeroConnection(connectionId);
    if (!connection) throw new Error("Connection not found");
    const contact = await this.findOrCreateContact(accessToken, connection.tenantId, name);
    return { contactId: contact.ContactID, name: contact.Name };
  }

  /**
   * Single-column P&L total revenue (income) for an arbitrary date range.
   * Uses Xero's ProfitAndLoss report without periods/timeframe so the entire
   * window collapses into one column. Income rows are classified by account
   * Type (REVENUE / SALES / OTHERINCOME) and fall back to section-title
   * keywords when account UUID isn't resolvable. Used by /api/kpis/revenue-xero.
   */
  async getRevenueTotal(connectionId: string, fromDate: string, toDate: string): Promise<number> {
    const accessToken = await this.getValidToken(connectionId);
    const connection = await storage.getXeroConnection(connectionId);
    if (!connection) throw new Error("Connection not found");

    const headers = {
      Authorization: `Bearer ${accessToken}`,
      "Xero-Tenant-Id": connection.tenantId,
      Accept: "application/json",
    };
    const params = new URLSearchParams({ fromDate, toDate, standardLayout: "true" });
    const [response, accountsResponse] = await Promise.all([
      fetch(`${XERO_API_BASE}/Reports/ProfitAndLoss?${params}`, { headers }),
      fetch(`${XERO_API_BASE}/Accounts`, { headers }),
    ]);
    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Failed to fetch P&L revenue: ${response.status} ${errorText}`);
    }

    const uuidToType = new Map<string, string>();
    // Same rule as getProfitAndLossReport: without the type map this falls back
    // to section-title keyword matching and can silently under- or over-count
    // revenue, so treat a failed account fetch as fatal rather than degrading.
    if (!accountsResponse.ok) {
      const errorText = await accountsResponse.text();
      throw new Error(`Failed to fetch Xero accounts for revenue classification: ${accountsResponse.status} ${errorText}`);
    }
    const accountsData = (await accountsResponse.json()) as any;
    for (const acc of (accountsData.Accounts || [])) {
      if (acc.AccountID && acc.Type) uuidToType.set(acc.AccountID as string, (acc.Type as string).toUpperCase());
    }
    const INCOME_TYPES = new Set(["REVENUE", "SALES", "OTHERINCOME"]);
    const INCOME_SECTION_KEYWORDS = ["revenue", "income", "sales", "trading income", "other income"];
    const SUMMARY_KEYWORDS = ["gross profit", "net profit", "total"];

    const data = (await response.json()) as any;
    const report = data.Reports?.[0];
    if (!report) return 0;

    let total = 0;
    const visit = (rows: any[], insideIncomeSection: boolean) => {
      for (const row of rows) {
        if (row.RowType === "Section") {
          const title: string = (row.Title || row.Cells?.[0]?.Value || "").toLowerCase();
          const isSummary = SUMMARY_KEYWORDS.some(k => title.includes(k));
          const nextIncome = isSummary
            ? insideIncomeSection
            : (title ? INCOME_SECTION_KEYWORDS.some(k => title.includes(k)) : insideIncomeSection);
          if (row.Rows) visit(row.Rows, nextIncome);
        } else if (row.RowType === "Row" && row.Cells) {
          const rowTitle = String(row.Cells[0]?.Value || "");
          if (SUMMARY_KEYWORDS.some(k => rowTitle.toLowerCase().includes(k))) continue;
          const accountUuid = row.Cells[0]?.Attributes?.find((a: any) => a.Id === "account")?.Value || "";
          const accountType = accountUuid ? uuidToType.get(accountUuid) : undefined;
          const isIncome = accountType ? INCOME_TYPES.has(accountType) : insideIncomeSection;
          if (!isIncome) continue;
          // First numeric cell after the title is the period total (single-column report).
          const val = parseFloat(row.Cells[1]?.Value || "0") || 0;
          total += val;
        } else if (row.Rows) {
          visit(row.Rows, insideIncomeSection);
        }
      }
    };
    visit(report.Rows || [], false);
    return total;
  }

  /**
   * Sum of AmountDue across AUTHORISED ACCREC (customer) invoices. Mirrors
   * Xero's outstanding A/R total. Paginated via Xero's standard page param.
   * Used by /api/kpis/outstanding-xero.
   */
  async getOutstandingReceivablesTotal(connectionId: string): Promise<number> {
    const accessToken = await this.getValidToken(connectionId);
    const connection = await storage.getXeroConnection(connectionId);
    if (!connection) throw new Error("Connection not found");

    const where = `Type=="ACCREC" AND Status=="AUTHORISED"`;
    let total = 0;
    const maxPages = 50;
    for (let page = 1; page <= maxPages; page++) {
      const params = new URLSearchParams({ where, page: String(page), order: "Date DESC" });
      const response = await fetch(`${XERO_API_BASE}/Invoices?${params}`, {
        headers: {
          Authorization: `Bearer ${accessToken}`,
          "Xero-Tenant-Id": connection.tenantId,
          Accept: "application/json",
        },
      });
      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`Failed to fetch outstanding invoices: ${response.status} ${errorText}`);
      }
      const data = (await response.json()) as any;
      const invoices: any[] = data.Invoices || [];
      for (const inv of invoices) {
        const due = Number(inv.AmountDue ?? 0);
        if (Number.isFinite(due)) total += due;
      }
      if (invoices.length < 100) break; // Xero default page size
    }
    return total;
  }

  /**
   * Returns Xero BANK accounts and their current statement / Xero balances.
   * Bank account list comes from /Accounts?where=Type=="BANK"; balances are
   * derived from the BankSummary report. Used by /api/kpis/cash-xero.
   */
  async getBankAccountBalances(connectionId: string): Promise<Array<{
    accountId: string;
    name: string;
    code?: string;
    statementBalance: number;
    xeroBalance: number;
  }>> {
    const accessToken = await this.getValidToken(connectionId);
    const connection = await storage.getXeroConnection(connectionId);
    if (!connection) throw new Error("Connection not found");

    const headers = {
      Authorization: `Bearer ${accessToken}`,
      "Xero-Tenant-Id": connection.tenantId,
      Accept: "application/json",
    };
    const [accountsResponse, summaryResponse] = await Promise.all([
      fetch(`${XERO_API_BASE}/Accounts?where=Type=="BANK"`, { headers }),
      fetch(`${XERO_API_BASE}/Reports/BankSummary`, { headers }),
    ]);
    if (!accountsResponse.ok) {
      const errorText = await accountsResponse.text();
      throw new Error(`Failed to fetch BANK accounts: ${accountsResponse.status} ${errorText}`);
    }
    const accountsData = (await accountsResponse.json()) as any;
    const accounts: any[] = accountsData.Accounts || [];

    // BankSummary parsing: each non-summary section corresponds to one bank
    // account. The header row carries the account UUID via the `account`
    // Attribute; the SummaryRow inside the section carries the closing
    // balance (last numeric cell).
    const balances = new Map<string, { statement: number; xero: number }>();
    if (summaryResponse.ok) {
      const summaryData = (await summaryResponse.json()) as any;
      const report = summaryData.Reports?.[0];
      const sections: any[] = report?.Rows || [];
      for (const section of sections) {
        if (section.RowType !== "Section" || !Array.isArray(section.Rows)) continue;
        const headerRow = section.Rows.find((r: any) => r.RowType === "Row");
        const accountUuid = headerRow?.Cells?.[0]?.Attributes?.find((a: any) => a.Id === "account")?.Value;
        if (!accountUuid) continue;
        const summaryRow = section.Rows.find((r: any) => r.RowType === "SummaryRow");
        const cells: any[] = summaryRow?.Cells || headerRow?.Cells || [];
        const numericCells = cells
          .map((c: any) => parseFloat(c?.Value || ""))
          .filter((v: number) => Number.isFinite(v));
        const closing = numericCells.length > 0 ? numericCells[numericCells.length - 1] : 0;
        balances.set(accountUuid, { statement: closing, xero: closing });
      }
    }

    return accounts.map((a: any) => {
      const bal = balances.get(a.AccountID) || { statement: 0, xero: 0 };
      return {
        accountId: a.AccountID,
        name: a.Name,
        code: a.Code,
        statementBalance: bal.statement,
        xeroBalance: bal.xero,
      };
    });
  }
}

export const xeroService = new XeroService();
