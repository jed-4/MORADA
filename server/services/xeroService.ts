import { storage } from "../storage";
import type { XeroConnection } from "@shared/schema";

const XERO_CLIENT_ID = process.env.XERO_CLIENT_ID || "";
const XERO_CLIENT_SECRET = process.env.XERO_CLIENT_SECRET || "";
const XERO_AUTHORIZE_URL = "https://login.xero.com/identity/connect/authorize";
const XERO_TOKEN_URL = "https://identity.xero.com/connect/token";
const XERO_CONNECTIONS_URL = "https://api.xero.com/connections";
const XERO_API_BASE = "https://api.xero.com/api.xro/2.0";
const XERO_SCOPES = "openid profile email accounting.transactions accounting.contacts accounting.settings accounting.reports.read offline_access";

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
    const connection = await storage.getXeroConnection(connectionId);
    if (!connection) {
      throw new Error(`Xero connection not found: ${connectionId}`);
    }

    const body = new URLSearchParams({
      grant_type: "refresh_token",
      refresh_token: connection.refreshToken,
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
      throw new Error(`Failed to refresh token: ${response.status} ${errorText}`);
    }

    const tokenData = (await response.json()) as XeroTokenResponse;
    const expiresAt = new Date(Date.now() + tokenData.expires_in * 1000);

    const updated = await storage.updateXeroConnection(connectionId, {
      accessToken: tokenData.access_token,
      refreshToken: tokenData.refresh_token,
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

    return connection.accessToken;
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

  async getTrackingCategories(connectionId: string): Promise<any[]> {
    const accessToken = await this.getValidToken(connectionId);
    const connection = await storage.getXeroConnection(connectionId);
    if (!connection) throw new Error("Connection not found");

    const response = await fetch(`${XERO_API_BASE}/TrackingCategories`, {
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Xero-Tenant-Id": connection.tenantId,
        Accept: "application/json",
      },
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Failed to get tracking categories: ${response.status} ${errorText}`);
    }

    const data = (await response.json()) as any;
    return data.TrackingCategories || [];
  }

  async getAccounts(connectionId: string): Promise<any[]> {
    const accessToken = await this.getValidToken(connectionId);
    const connection = await storage.getXeroConnection(connectionId);
    if (!connection) throw new Error("Connection not found");

    const response = await fetch(`${XERO_API_BASE}/Accounts?where=Type=="EXPENSE"||Type=="DIRECTCOSTS"||Type=="OVERHEADS"||Type=="CURRLIAB"`, {
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

    const response = await fetch(`${XERO_API_BASE}/Invoices/${xeroInvoiceId}`, {
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
      throw await xeroErrorFromResponse(response, "Failed to update Xero bill");
    }

    const data = (await response.json()) as any;
    return data.Invoices?.[0] || data;
  }

  /**
   * Returns the existing attachment summaries on a Xero invoice. Used to
   * skip re-uploading files we've already pushed (idempotent attachment sync).
   */
  async getInvoiceAttachments(connectionId: string, xeroInvoiceId: string): Promise<XeroAttachmentSummary[]> {
    const accessToken = await this.getValidToken(connectionId);
    const connection = await storage.getXeroConnection(connectionId);
    if (!connection) throw new Error("Connection not found");
    const response = await fetch(`${XERO_API_BASE}/Invoices/${xeroInvoiceId}/Attachments`, {
      method: "GET",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Xero-Tenant-Id": connection.tenantId,
        Accept: "application/json",
      },
    });
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
    const response = await fetch(
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
      throw new Error(`Failed to create Xero invoice: ${response.status} ${errorText}`);
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
    opts: { modifiedSince?: Date; page?: number; statuses?: string[] } = {}
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

    const response = await fetch(`${XERO_API_BASE}/Invoices?${params}`, { headers });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Failed to fetch Xero bills: ${response.status} ${errorText}`);
    }

    const data = (await response.json()) as any;
    return data.Invoices || [];
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

    const response = await fetch(`${XERO_API_BASE}/Payments`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Xero-Tenant-Id": connection.tenantId,
        Accept: "application/json",
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
    });

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

  async getInvoice(connectionId: string, invoiceId: string): Promise<any> {
    const accessToken = await this.getValidToken(connectionId);
    const connection = await storage.getXeroConnection(connectionId);
    if (!connection) throw new Error("Xero connection not found");

    const response = await fetch(`${XERO_API_BASE}/Invoices/${invoiceId}`, {
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Xero-Tenant-Id": connection.tenantId,
        Accept: "application/json",
      },
    });

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
  ): Promise<{ byAccount: Record<string, { name: string; amounts: Record<string, number> }>; accounts: any[]; incomeTotals: Record<string, number>; directCostTotals: Record<string, number>; incomeByAccount: Record<string, Record<string, number>>; directCostByAccount: Record<string, Record<string, number>> }> {
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
    if (accountsResponse.ok) {
      const accountsData = (await accountsResponse.json()) as any;
      for (const acc of (accountsData.Accounts || [])) {
        if (acc.AccountID) {
          if (acc.Code) uuidToCode.set(acc.AccountID as string, (acc.Code as string).trim());
          if (acc.Type) uuidToType.set(acc.AccountID as string, (acc.Type as string).toUpperCase());
        }
      }
    }

    const INCOME_TYPES = new Set(["REVENUE", "SALES", "OTHERINCOME"]);

    const data = (await response.json()) as any;
    const report = data.Reports?.[0];
    if (!report) return { byAccount: {}, accounts: [], incomeTotals: {}, directCostTotals: {}, incomeByAccount: {}, directCostByAccount: {} };

    // Parse column headers to extract month labels (format: "Jan 2025")
    const columns: string[] = (report.Rows?.[0]?.Cells || []).map((c: any) => c.Value || "");

    // Optional diagnostic logging for investigating missing-month issues in the
    // Xero P&L response (e.g. an absent May 2025 column). Off by default; enable
    // by setting XERO_PL_DIAGNOSTIC=1 in the server environment when needed.
    if (process.env.XERO_PL_DIAGNOSTIC === "1") {
      const diagMonthMap: Record<string, string> = {
        Jan: "01", Feb: "02", Mar: "03", Apr: "04", May: "05", Jun: "06",
        Jul: "07", Aug: "08", Sep: "09", Oct: "10", Nov: "11", Dec: "12",
      };
      const parsedMonthKeys: string[] = columns.slice(1).map((label) => {
        const parts = (label || "").trim().split(/\s+/);
        let mm: string | undefined;
        let yearStr: string | undefined;
        for (let j = 0; j < parts.length; j++) {
          const code = diagMonthMap[parts[j] as keyof typeof diagMonthMap];
          if (code) {
            mm = code;
            for (let k = j + 1; k < parts.length; k++) {
              if (/^\d{2}(\d{2})?$/.test(parts[k])) { yearStr = parts[k]; break; }
            }
            if (!yearStr) {
              for (let k = j - 1; k >= 0; k--) {
                if (/^\d{2}(\d{2})?$/.test(parts[k])) { yearStr = parts[k]; break; }
              }
            }
            break;
          }
        }
        if (!mm || !yearStr) return `<unparsed:"${label}">`;
        const yyyy = yearStr.length === 2 ? `20${yearStr}` : yearStr;
        return `${yyyy}-${mm}`;
      });
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
      });
    }

    const byAccount: Record<string, { name: string; amounts: Record<string, number> }> = {};
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
        const monthLabel = (columns[i] || "").trim();
        const val = parseFloat(cells[i]?.Value || "0") || 0;
        // Xero P&L column headers can come in several shapes:
        //   "Jan 2025" | "Jan 25" | "30 Apr 26" | "30 Apr 2026" | "30 Apr 2026 YTD"
        // Find the month token, then take whichever adjacent token looks like a year.
        const parts = monthLabel.split(/\s+/);
        let mm: string | undefined;
        let yearStr: string | undefined;
        for (let j = 0; j < parts.length; j++) {
          const p = parts[j];
          const monthCode = MONTH_MAP[p as keyof typeof MONTH_MAP];
          if (monthCode) {
            mm = monthCode;
            // Year is the next purely-numeric token (covers "Jan 2025" and "30 Apr 26")
            for (let k = j + 1; k < parts.length; k++) {
              if (/^\d{2}(\d{2})?$/.test(parts[k])) {
                yearStr = parts[k];
                break;
              }
            }
            // Or fall back to the previous numeric token if no trailing year was found
            if (!yearStr) {
              for (let k = j - 1; k >= 0; k--) {
                if (/^\d{2}(\d{2})?$/.test(parts[k])) {
                  yearStr = parts[k];
                  break;
                }
              }
            }
            break;
          }
        }
        if (mm && yearStr) {
          const yyyy = yearStr.length === 2 ? `20${yearStr}` : yearStr;
          result[`${yyyy}-${mm}`] = val;
        }
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
          if (!incomeByAccount[accountName]) incomeByAccount[accountName] = {};
          incomeByAccount[accountName][monthKey] = (incomeByAccount[accountName][monthKey] || 0) + val;
        }
      } else if (accountType && DIRECT_COST_TYPES.has(accountType)) {
        // Track direct costs separately for the P&L gross profit calculation
        const monthAmts = extractMonthAmounts(cells);
        const accountName = rowTitle || "Direct Costs";
        for (const [monthKey, val] of Object.entries(monthAmts)) {
          directCostTotals[monthKey] = (directCostTotals[monthKey] || 0) + val;
          if (!directCostByAccount[accountName]) directCostByAccount[accountName] = {};
          directCostByAccount[accountName][monthKey] = (directCostByAccount[accountName][monthKey] || 0) + val;
        }
      } else if (effectiveExpense) {
        const accountCode = (accountUuid && uuidToCode.get(accountUuid)) || accountUuid;
        if (!accountCode && !rowTitle) return;
        const key = accountCode || rowTitle;
        if (!byAccount[key]) {
          byAccount[key] = { name: rowTitle, amounts: {} };
          accounts.push({ code: accountCode, name: rowTitle });
        }
        const monthAmts = extractMonthAmounts(cells);
        for (const [monthKey, val] of Object.entries(monthAmts)) {
          byAccount[key].amounts[monthKey] = (byAccount[key].amounts[monthKey] || 0) + val;
        }
      }
    }

    function parseSection(rows: any[], insideExpense: boolean, insideIncome: boolean) {
      for (const row of rows) {
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

    return { byAccount, accounts, incomeTotals, directCostTotals, incomeByAccount, directCostByAccount };
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
    if (accountsResponse.ok) {
      const accountsData = (await accountsResponse.json()) as any;
      for (const acc of (accountsData.Accounts || [])) {
        if (acc.AccountID && acc.Type) uuidToType.set(acc.AccountID as string, (acc.Type as string).toUpperCase());
      }
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
