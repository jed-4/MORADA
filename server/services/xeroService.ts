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
  lineItems: XeroBillLineItem[];
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

  async getContacts(connectionId: string): Promise<any[]> {
    const accessToken = await this.getValidToken(connectionId);
    const connection = await storage.getXeroConnection(connectionId);
    if (!connection) throw new Error("Connection not found");

    const response = await fetch(`${XERO_API_BASE}/Contacts?page=1&pageSize=500`, {
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
    return data.Contacts || [];
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
      LineAmountTypes: "Exclusive",
      Status: "AUTHORISED",
    };

    if (billData.dueDate) {
      invoicePayload.DueDate = billData.dueDate;
    }
    if (billData.reference) {
      invoicePayload.Reference = billData.reference;
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
      throw new Error(`Failed to create Xero bill: ${response.status} ${errorText}`);
    }

    const data = (await response.json()) as any;
    return data.Invoices?.[0] || data;
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
  ): Promise<{ byAccount: Record<string, { name: string; amounts: Record<string, number> }>; accounts: any[]; incomeTotals: Record<string, number> }> {
    const accessToken = await this.getValidToken(connectionId);
    const connection = await storage.getXeroConnection(connectionId);
    if (!connection) throw new Error("Connection not found");

    // Calculate months in range, capped at 11 (Xero's maximum for the periods param)
    const from = new Date(fromDate);
    const to = new Date(toDate);
    const monthsDiff = (to.getFullYear() - from.getFullYear()) * 12 + (to.getMonth() - from.getMonth()) + 1;
    const periods = String(Math.min(11, Math.max(1, monthsDiff)));

    const headers = {
      Authorization: `Bearer ${accessToken}`,
      "Xero-Tenant-Id": connection.tenantId,
      Accept: "application/json",
    };

    // Fetch P&L report and full accounts list in parallel
    // Accounts list is needed to resolve Xero AccountIDs (UUIDs) → account code numbers
    const params = new URLSearchParams({
      fromDate,
      toDate,
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
    if (!report) return { byAccount: {}, accounts: [], incomeTotals: {} };

    // Parse column headers to extract month labels (format: "Jan 2025")
    const columns: string[] = (report.Rows?.[0]?.Cells || []).map((c: any) => c.Value || "");

    const byAccount: Record<string, { name: string; amounts: Record<string, number> }> = {};
    const accounts: any[] = [];
    // income totals keyed by "YYYY-MM"
    const incomeTotals: Record<string, number> = {};

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
        const monthLabel = columns[i];
        const val = parseFloat(cells[i]?.Value || "0") || 0;
        const parts = monthLabel.split(" ");
        if (parts.length === 2) {
          const mm = MONTH_MAP[parts[0]];
          const yyyy = parts[1];
          if (mm && yyyy) result[`${yyyy}-${mm}`] = val;
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
        for (const [monthKey, val] of Object.entries(monthAmts)) {
          incomeTotals[monthKey] = (incomeTotals[monthKey] || 0) + val;
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

    return { byAccount, accounts, incomeTotals };
  }
}

export const xeroService = new XeroService();
