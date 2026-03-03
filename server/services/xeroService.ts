import { storage } from "../storage";
import type { XeroConnection } from "@shared/schema";

const XERO_CLIENT_ID = process.env.XERO_CLIENT_ID || "";
const XERO_CLIENT_SECRET = process.env.XERO_CLIENT_SECRET || "";
const XERO_AUTHORIZE_URL = "https://login.xero.com/identity/connect/authorize";
const XERO_TOKEN_URL = "https://identity.xero.com/connect/token";
const XERO_CONNECTIONS_URL = "https://api.xero.com/connections";
const XERO_API_BASE = "https://api.xero.com/api.xro/2.0";
const XERO_SCOPES = "openid profile email accounting.transactions accounting.contacts accounting.settings offline_access";

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

    const now = new Date();
    const bufferMs = 60 * 1000;
    if (connection.tokenExpiresAt.getTime() - bufferMs <= now.getTime()) {
      connection = await this.refreshAccessToken(connectionId);
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
        return "NONE";
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
}

export const xeroService = new XeroService();
