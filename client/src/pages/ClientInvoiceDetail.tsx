import { useEffect, useState, useRef, useMemo, type ReactNode } from "react";
import { useParams, useLocation } from "wouter";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { format, addDays } from "date-fns";
import { pdf } from "@react-pdf/renderer";
import { InvoiceDocument } from "@/components/invoices/pdf/InvoiceDocument";
import { SendInvoiceDialog } from "@/components/invoices/SendInvoiceDialog";
import { DocumentPreviewModal } from "@/components/ui/DocumentPreviewModal";
import { XeroContactLinkModal } from "@/components/invoices/XeroContactLinkModal";
import {
  ArrowLeft,
  Plus,
  FileText,
  Calendar as CalendarIcon,
  Loader2,
  Eye,
  Send,
  Download,
  Mail,
  DollarSign,
  Paperclip,
  ChevronDown,
  ChevronUp,
  Lock,
  Settings2,
  Pencil,
  RefreshCw,
  GripVertical,
  Check,
  X,
  Search,
  ArrowUp,
  ArrowDown,
  ArrowUpDown,
  LayoutGrid,
  AlertCircle,
} from "lucide-react";
import { SiXero } from "react-icons/si";
import { SearchableSelect } from "@/components/ui/searchable-select";
import { LineItemTable, type LineItemColumn } from "@/components/LineItemTable";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Switch } from "@/components/ui/switch";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { RichTextEditor } from "@/components/RichTextEditor";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { CostCodeSelect } from "@/components/CostCodeSelect";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Calendar } from "@/components/ui/calendar";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/hooks/use-auth";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { cn } from "@/lib/utils";
import { logActivity } from "@/lib/activityLogger";
import type {
  ClientInvoice,
  ClientInvoiceItem,
  ClientInvoicePayment,
  Project,
  Estimate,
  EstimateItem,
  Variation,
  Bill,
  Contact,
} from "@shared/schema";
import {
  summariseClaimsElsewhere,
  // Aliased: this file already has a local `remainingClaimPercent` for the
  // contract claim (a single number), distinct from these per-line helpers.
  remainingClaimPercent as remainingLineClaimPercent,
  isFullyClaimedElsewhere,
} from "@shared/invoiceClaims";

const GST_RATE = 0.1;

// ─── Column config ──────────────────────────────────────────────────────────

type ColumnId =
  | "name"
  | "description"
  | "contractTotal"
  | "remaining"
  | "claimPercent"
  | "claimAmount"
  | "amountExTax"
  | "amountTax"
  | "amountIncTax";

interface ColumnDef {
  id: ColumnId;
  label: string;
  required: boolean;
  defaultVisible: boolean;
}

const INVOICE_BILL_COLUMNS = [
  { id: "billNumber", label: "Bill No.", required: true },
  { id: "status", label: "Status", required: false },
  { id: "supplier", label: "Supplier", required: false },
  { id: "reference", label: "Reference", required: false },
  { id: "date", label: "Date", required: false },
  { id: "total", label: "Total", required: true },
  { id: "due", label: "Due", required: false },
  { id: "xero", label: "Xero", required: false },
];

const ALL_COLUMNS: ColumnDef[] = [
  { id: "name", label: "Name", required: true, defaultVisible: true },
  { id: "description", label: "Description", required: false, defaultVisible: true },
  { id: "contractTotal", label: "Contract Total", required: false, defaultVisible: true },
  { id: "remaining", label: "Remaining", required: false, defaultVisible: true },
  { id: "claimPercent", label: "Claim %", required: true, defaultVisible: true },
  { id: "claimAmount", label: "Claim $", required: true, defaultVisible: true },
  { id: "amountExTax", label: "Ex Tax", required: false, defaultVisible: false },
  { id: "amountTax", label: "Tax", required: false, defaultVisible: false },
  { id: "amountIncTax", label: "Inc Tax", required: false, defaultVisible: true },
];

interface ColumnConfig {
  id: ColumnId;
  visible: boolean;
  order: number;
}

function defaultColumnConfig(): ColumnConfig[] {
  return ALL_COLUMNS.map((col, i) => ({
    id: col.id,
    visible: col.defaultVisible,
    order: i,
  }));
}

function mergeColumnConfig(saved: any[]): ColumnConfig[] {
  if (!saved || !Array.isArray(saved) || saved.length === 0) return defaultColumnConfig();
  return saved as ColumnConfig[];
}

// ─── Form schema ─────────────────────────────────────────────────────────────

const invoiceFormSchema = z.object({
  invoiceNumber: z.string().optional(),
  projectId: z.string().min(1, "Project is required"),
  name: z.string().min(1, "Name is required"),
  invoiceDate: z.date(),
  dueDate: z.date().optional(),
  introductionText: z.string().optional(),
  closingText: z.string().optional(),
  markupPercent: z.number().optional(),
});

const paymentFormSchema = z.object({
  amount: z.number().min(0.01, "Amount is required"),
  paymentDate: z.date(),
  paymentMethod: z
    .enum(["Bank Transfer", "Credit Card", "Cash", "Cheque", "Other"])
    .optional(),
  reference: z.string().optional(),
  notes: z.string().optional(),
});

type InvoiceFormData = z.infer<typeof invoiceFormSchema>;
type PaymentFormData = z.infer<typeof paymentFormSchema>;

// ─── Custom line type ─────────────────────────────────────────────────────────

type CustomLine = {
  id?: string;
  name: string;
  description: string;
  quantity: number;
  unitPrice: number;
  totalPrice: number;
  taxable: boolean;
  sortOrder: number;
  unit?: string;
  costCodeId?: string | null;
  xeroAccountCode?: string | null;
};

// ─── Contract claim row ───────────────────────────────────────────────────────

type ContractClaimRow = {
  id: string;
  name: string;
  description: string;
  claimPercent: number;
};

// ─── Variation claim state ─────────────────────────────────────────────────────

type ClaimState = Record<string, number>; // variationId/allowanceId -> claimPercent (0-100)

// ─── Component ────────────────────────────────────────────────────────────────

export default function ClientInvoiceDetail() {
  const { id, invoiceId, projectId: projectIdFromParams } = useParams<{
    id?: string;
    invoiceId?: string;
    projectId?: string;
  }>();
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const { user } = useAuth();

  const effectiveInvoiceId = invoiceId || id;
  const isEditMode = !!(effectiveInvoiceId && effectiveInvoiceId !== "new");

  // ── core state ──────────────────────────────────────────────────────────────
  const [customLines, setCustomLines] = useState<CustomLine[]>([]);
  const [selectedEstimateId, setSelectedEstimateId] = useState<string>("");
  const [selectedVariationIds, setSelectedVariationIds] = useState<string[]>([]);
  const [selectedBillIds, setSelectedBillIds] = useState<string[]>([]);
  const [selectedTimesheetIds, setSelectedTimesheetIds] = useState<string[]>([]);
  const [selectedSelectionOptionIds, setSelectedSelectionOptionIds] = useState<string[]>([]);
  const [invoiceType, setInvoiceType] = useState<"progress_payments" | "cost_plus">("progress_payments");
  const [paymentDialogOpen, setPaymentDialogOpen] = useState(false);
  const [xeroPushing, setXeroPushing] = useState(false);
  const [sendToXero, setSendToXero] = useState(false);
  const [xeroLinkModalOpen, setXeroLinkModalOpen] = useState(false);
  const [xeroUnmappedClientName, setXeroUnmappedClientName] = useState("");
  const xeroRetryRef = useRef<(() => Promise<void>) | null>(null);

  // ── new UI state ─────────────────────────────────────────────────────────────
  const [introCollapsed, setIntroCollapsed] = useState(true);
  const [closingCollapsed, setClosingCollapsed] = useState(true);
  const [termsCollapsed, setTermsCollapsed] = useState(true);
  const [attachmentsCollapsed, setAttachmentsCollapsed] = useState(true);
  const [termsAndConditions, setTermsAndConditions] = useState<string>("");
  const [selectedTemplateId, setSelectedTemplateId] = useState<string>("");
  const [invoiceNumberOverride, setInvoiceNumberOverride] = useState(false);
  const [variationsModalOpen, setVariationsModalOpen] = useState(false);
  const [allowancesModalOpen, setAllowancesModalOpen] = useState(false);
  const [selectedAllowanceIds, setSelectedAllowanceIds] = useState<string[]>([]);
  const [variationClaims, setVariationClaims] = useState<ClaimState>({});
  const [allowanceClaims, setAllowanceClaims] = useState<ClaimState>({});
  const [columnConfig, setColumnConfig] = useState<ColumnConfig[]>(defaultColumnConfig());
  const [showAmountsIncTax, setShowAmountsIncTax] = useState(true);
  const [contractClaimRows, setContractClaimRows] = useState<ContractClaimRow[]>([
    { id: crypto.randomUUID(), name: "", description: "", claimPercent: 0 },
  ]);
  const [columnPickerOpen, setColumnPickerOpen] = useState(false);
  const [dragOverId, setDragOverId] = useState<ColumnId | null>(null);
  const dragItem = useRef<ColumnId | null>(null);
  const [invoiceDateOpen, setInvoiceDateOpen] = useState(false);
  const [dueDateOpen, setDueDateOpen] = useState(false);
  const [dueDateCustom, setDueDateCustom] = useState(false);
  const [billsModalOpen, setBillsModalOpen] = useState(false);
  const [labourModalOpen, setLabourModalOpen] = useState(false);
  const [selectionsModalOpen, setSelectionsModalOpen] = useState(false);
  const [billsSearch, setBillsSearch] = useState("");
  const [labourSearch, setLabourSearch] = useState("");
  const [selectionsSearch, setSelectionsSearch] = useState("");
  const [labourDisplayMode, setLabourDisplayMode] = useState<"individual" | "by_user" | "by_date" | "single">("individual");
  const [labourBreakByCostCode, setLabourBreakByCostCode] = useState(false);
  const [labourFilterUser, setLabourFilterUser] = useState("all");
  const [labourFilterStatus, setLabourFilterStatus] = useState("all");
  const [labourFilterCostCode, setLabourFilterCostCode] = useState("all");
  const [labourFilterLabel, setLabourFilterLabel] = useState("all");
  const [labourSortCol, setLabourSortCol] = useState<string>("date");
  const [labourSortDir, setLabourSortDir] = useState<"asc" | "desc">("asc");
  // Bills modal state
  const [billsSortCol, setBillsSortCol] = useState<string>("date");
  const [billsSortDir, setBillsSortDir] = useState<"asc" | "desc">("desc");
  const [billsColPickerOpen, setBillsColPickerOpen] = useState(false);
  const [billsColConfig, setBillsColConfig] = useState<{ id: string; visible: boolean }[]>(() => {
    try {
      const saved = localStorage.getItem("invoice-bills-col-v1");
      if (saved) return JSON.parse(saved);
    } catch {}
    return [
      { id: "billNumber", visible: true },
      { id: "status", visible: true },
      { id: "supplier", visible: true },
      { id: "reference", visible: false },
      { id: "date", visible: true },
      { id: "total", visible: true },
      { id: "due", visible: false },
      { id: "xero", visible: false },
    ];
  });
  const [customLineColPickerOpen, setCustomLineColPickerOpen] = useState(false);
  const [bulkAccountCode, setBulkAccountCode] = useState("");
  // Per-line Xero overrides for the non-custom sources, keyed by
  // lineAccountKey(). The breakdown is rebuilt from source data on every
  // render, so an override cannot live on the derived line — it is keyed by the
  // line's stable identity and persisted on the invoice. An absent field means
  // "company default account, GST charged, project's own tracking option".
  type LineXeroOverride = {
    account?: string | null;
    /** Xero TaxType, e.g. OUTPUT ("GST on Income") or EXEMPTOUTPUT. */
    taxType?: string;
    taxable?: boolean;
    tracking?: Record<string, string>;
  };
  // Only a GST-bearing sales rate adds 10%; every other rate is 0%.
  const GST_BEARING_TAX_TYPES = new Set(["OUTPUT", "OUTPUT2"]);
  const [lineXeroOverrides, setLineXeroOverrides] = useState<Record<string, LineXeroOverride>>({});
  const [modalBillIds, setModalBillIds] = useState<string[]>([]);
  const [modalTimesheetIds, setModalTimesheetIds] = useState<string[]>([]);
  const [modalSelectionOptionIds, setModalSelectionOptionIds] = useState<string[]>([]);

  // ── queries ──────────────────────────────────────────────────────────────────
  const { data: xeroStatus } = useQuery<{ connected: boolean }>({
    queryKey: ["/api/xero/status"],
  });

  // T004: PDF + email state
  const [invoicePdfGenerating, setInvoicePdfGenerating] = useState(false);
  const [invoicePreviewOpen, setInvoicePreviewOpen] = useState(false);
  const [invoiceSendModalOpen, setInvoiceSendModalOpen] = useState(false);
  const [invoiceSendData, setInvoiceSendData] = useState<{
    lineItems: Array<{ label: string; description?: string | null; claimPct?: number | null; amountExTax: number; gst: number; amountIncTax: number }>;
    subtotalCents: number;
    gstCents: number;
    totalCents: number;
    paidCents: number;
    balanceDueCents: number;
    initialSubject: string;
    initialBody: string;
  } | null>(null);

  const { data: companyInfo } = useQuery<{ id: string; name: string; abn?: string; phone?: string; email?: string; logo?: string }>({
    queryKey: ["/api/company"],
  });

  const { data: companySettings } = useQuery<{ termsAndConditions?: string; termsTemplates?: Array<{ id: string; name: string; content: string }>; companyName?: string; address?: string; clientInvoiceDefaultXeroAccount?: string | null; brandColor?: string; documentStyle?: string; logoUrl?: string; paymentDetails?: string | null }>({
    queryKey: ["/api/company-settings"],
  });
  const logoUrl = companySettings?.logoUrl
    ? (companySettings.logoUrl.startsWith("http") ? companySettings.logoUrl : `${window.location.origin}${companySettings.logoUrl}`)
    : undefined;
  const docStyle = (companySettings?.documentStyle as "style1" | "style2" | undefined) || "style1";

  const { data: xeroAccounts = [] } = useQuery<Array<{ code: string; name: string; type: string; accountId: string }>>({
    queryKey: ["/api/xero/accounts?kind=revenue"],
  });

  const { data: xeroTaxRates = [] } = useQuery<Array<{ taxType: string; name: string }>>({
    queryKey: ["/api/xero/tax-rates"],
    enabled: !!xeroStatus?.connected,
  });

  const { data: xeroTrackingCategories = [] } = useQuery<Array<{
    trackingCategoryId: string;
    name: string;
    options: Array<{ trackingOptionId: string; name: string }>;
  }>>({
    queryKey: ["/api/xero/tracking-categories"],
    enabled: !!xeroStatus?.connected,
  });

  const { data: invoice, isLoading: invoiceLoading } = useQuery<ClientInvoice>({
    queryKey: [`/api/client-invoices/${effectiveInvoiceId}`],
    enabled: isEditMode,
  });

  const { data: existingCustomLines = [] } = useQuery<ClientInvoiceItem[]>({
    queryKey: [`/api/client-invoices/${effectiveInvoiceId}/items`],
    enabled: isEditMode,
  });

  const { data: payments = [] } = useQuery<ClientInvoicePayment[]>({
    queryKey: [`/api/client-invoices/${effectiveInvoiceId}/payments`],
    enabled: isEditMode,
  });

  const { data: linkedEstimates = [] } = useQuery<any[]>({
    queryKey: [`/api/client-invoices/${effectiveInvoiceId}/estimates`],
    enabled: isEditMode,
  });

  const { data: linkedVariations = [] } = useQuery<any[]>({
    queryKey: [`/api/client-invoices/${effectiveInvoiceId}/variations`],
    enabled: isEditMode,
  });

  const { data: linkedAllowances = [] } = useQuery<any[]>({
    queryKey: [`/api/client-invoices/${effectiveInvoiceId}/allowances`],
    enabled: isEditMode,
  });

  const { data: linkedBills = [] } = useQuery<any[]>({
    queryKey: [`/api/client-invoices/${effectiveInvoiceId}/bills`],
    enabled: isEditMode,
  });

  const { data: projects = [] } = useQuery<Project[]>({
    queryKey: ["/api/projects"],
  });

  const selectedProjectId = invoice?.projectId || projectIdFromParams || "";

  const { data: currentProject } = useQuery<Project>({
    queryKey: [`/api/projects/${selectedProjectId}`],
    enabled: !!selectedProjectId,
  });

  // Live original contract price (inc-GST cents) computed from the selected
  // estimate. While the estimate is "approved" this tracks edits; once it is
  // marked as Contract the estimate is locked so the value is effectively
  // frozen. Prefer this over the stamped project.contractPrice snapshot.
  const { data: contractMetrics } = useQuery<{ originalContractPriceIncGstCents: number }>({
    queryKey: ["/api/projects", selectedProjectId, "contract-metrics"],
    queryFn: () =>
      fetch(`/api/projects/${selectedProjectId}/contract-metrics`, { credentials: "include" }).then((r) => r.json()),
    enabled: !!selectedProjectId,
  });

  const { data: clientContact } = useQuery<Contact>({
    queryKey: [`/api/contacts/${(currentProject as any)?.clientId}`],
    enabled: !!(currentProject as any)?.clientId,
  });

  const { data: estimates = [] } = useQuery<Estimate[]>({
    queryKey: [`/api/estimates?projectId=${selectedProjectId}`],
    enabled: !!selectedProjectId,
  });

  const { data: variations = [], isLoading: variationsLoading } = useQuery<Variation[]>({
    queryKey: [`/api/variations?projectId=${selectedProjectId}`],
    enabled: !!selectedProjectId,
  });

  const { data: projectInvoices = [] } = useQuery<ClientInvoice[]>({
    queryKey: ["/api/client-invoices", selectedProjectId],
    queryFn: () =>
      fetch(`/api/client-invoices?projectId=${selectedProjectId}`, { credentials: "include" })
        .then((r) => r.json())
        // A failed request answers with an error object, not a list. Without this
        // the page white-screens on `.filter` and blames the client.
        .then((d) => (Array.isArray(d) ? d : [])),
    enabled: !!selectedProjectId,
  });

  // Cross-invoice claim links for this project. Used to true up the CLOSING
  // claim (the one whose cumulative claim across all invoices reaches 100%) so
  // percentage-based progress claims reconcile to the contract to the penny
  // instead of leaving a phantom rounding cent. claimPercent here is what each
  // OTHER invoice has billed for the same variation/allowance line.
  const { data: projectInvoiceVariations = [] } = useQuery<Array<{ variationId: string; invoiceId: string; invoiceNumber: string | null; claimPercent: number }>>({
    queryKey: ["/api/invoice-variations/by-project", selectedProjectId],
    queryFn: () => fetch(`/api/invoice-variations/by-project?projectId=${selectedProjectId}`, { credentials: "include" }).then(r => r.json()),
    enabled: !!selectedProjectId,
  });

  const { data: projectInvoiceAllowances = [] } = useQuery<Array<{ estimateItemId: string; invoiceId: string; claimPercent: number }>>({
    queryKey: ["/api/invoice-allowances/by-project", selectedProjectId],
    queryFn: () => fetch(`/api/invoice-allowances/by-project?projectId=${selectedProjectId}`, { credentials: "include" }).then(r => r.json()),
    enabled: !!selectedProjectId,
  });

  const { data: bills = [], isLoading: billsLoading } = useQuery<Bill[]>({
    queryKey: [`/api/bills?projectId=${selectedProjectId}`],
    enabled: !!selectedProjectId,
  });

  const { data: projectTimesheets = [], isLoading: timesheetsLoading } = useQuery<any[]>({
    queryKey: [`/api/projects/${selectedProjectId}/timesheets`],
    enabled: !!selectedProjectId && invoiceType === "cost_plus",
  });

  const { data: invoiceableSelections = [], isLoading: selectionsLoading } = useQuery<any[]>({
    queryKey: [`/api/projects/${selectedProjectId}/selection-options/invoiceable`],
    enabled: !!selectedProjectId && invoiceType === "cost_plus",
  });

  const { data: linkedTimesheets = [] } = useQuery<any[]>({
    queryKey: [`/api/client-invoices/${effectiveInvoiceId}/timesheets`],
    enabled: isEditMode,
  });

  const { data: linkedSelections = [] } = useQuery<any[]>({
    queryKey: [`/api/client-invoices/${effectiveInvoiceId}/selections`],
    enabled: isEditMode,
  });

  const { data: users = [] } = useQuery<any[]>({
    queryKey: ["/api/users"],
  });

  const { data: costCodes = [] } = useQuery<any[]>({
    queryKey: ["/api/cost-codes"],
  });

  const { data: estimateItems = [], isLoading: estimateItemsLoading } = useQuery<EstimateItem[]>({
    queryKey: [`/api/estimates/${selectedEstimateId}/items`],
    enabled: !!selectedEstimateId,
  });

  // Fetch auto-generated invoice number
  const { data: nextNumberData } = useQuery<{ invoiceNumber: string }>({
    queryKey: [`/api/client-invoices/next-number`, selectedProjectId],
    queryFn: async () => {
      if (!selectedProjectId) return { invoiceNumber: "" };
      const res = await fetch(
        `/api/client-invoices/next-number?projectId=${selectedProjectId}`,
        { credentials: "include" }
      );
      if (!res.ok) return { invoiceNumber: "" };
      return res.json();
    },
    enabled: !!selectedProjectId && !isEditMode,
  });

  // ── form ──────────────────────────────────────────────────────────────────────
  const form = useForm<InvoiceFormData>({
    resolver: zodResolver(invoiceFormSchema),
    defaultValues: {
      invoiceNumber: "",
      projectId: "",
      name: "",
      invoiceDate: new Date(),
      dueDate: undefined,
      introductionText: "",
      closingText: "",
      markupPercent: undefined,
    },
  });

  const paymentForm = useForm<PaymentFormData>({
    resolver: zodResolver(paymentFormSchema),
    defaultValues: {
      amount: 0,
      paymentDate: new Date(),
      paymentMethod: "Bank Transfer",
      reference: "",
      notes: "",
    },
  });

  // ── effects ───────────────────────────────────────────────────────────────────

  useEffect(() => {
    if (invoice && isEditMode) {
      form.reset({
        invoiceNumber: invoice.invoiceNumber || "",
        projectId: invoice.projectId,
        name: invoice.name,
        invoiceDate: invoice.invoiceDate ? new Date(invoice.invoiceDate) : new Date(),
        dueDate: invoice.dueDate ? new Date(invoice.dueDate) : undefined,
        introductionText: invoice.introductionText || "",
        closingText: invoice.closingText || "",
        markupPercent: invoice.markupPercent || undefined,
      });
      // Restore column config
      if ((invoice as any).columnConfig) {
        setColumnConfig(mergeColumnConfig((invoice as any).columnConfig));
      }
      if ((invoice as any).showAmountsIncTax !== undefined) {
        setShowAmountsIncTax((invoice as any).showAmountsIncTax);
      }
      setTermsAndConditions((invoice as any).termsAndConditions || "");
      if ((invoice as any).contractClaimRows && Array.isArray((invoice as any).contractClaimRows)) {
        setContractClaimRows((invoice as any).contractClaimRows as ContractClaimRow[]);
      }
      const overrides = (invoice as any).lineXeroOverrides;
      if (overrides && typeof overrides === "object" && !Array.isArray(overrides)) {
        setLineXeroOverrides(overrides as Record<string, LineXeroOverride>);
      }
      // Open intro/closing if they have content
      if (invoice.introductionText) setIntroCollapsed(false);
      if (invoice.closingText) setClosingCollapsed(false);
      // Restore sendToXero toggle from persisted value
      setSendToXero(!!invoice.sendToXero);
    }
  }, [invoice, isEditMode, form]);

  useEffect(() => {
    if (existingCustomLines.length > 0 && isEditMode) {
      setCustomLines(
        existingCustomLines.map((item) => ({
          id: item.id,
          name: (item as any).name || "",
          description: item.description,
          quantity: item.quantity,
          unitPrice: item.unitPrice / 100,
          totalPrice: item.totalPrice / 100,
          taxable: item.taxable,
          sortOrder: item.sortOrder,
          unit: (item as any).unit || "unit",
          costCodeId: (item as any).costCodeId || null,
          xeroAccountCode: (item as any).xeroAccountCode || null,
        }))
      );
    }
  }, [existingCustomLines, isEditMode]);

  useEffect(() => {
    if (!isEditMode && projects.length > 0) {
      const projectIdToUse = projectIdFromParams || projects[0]?.id;
      if (projectIdToUse) {
        form.setValue("projectId", projectIdToUse);
        form.setValue("name", `Invoice ${format(new Date(), "MMM yyyy")}`);
      }
    }
  }, [projects, isEditMode, form, projectIdFromParams]);

  // Auto-fill invoice number on new invoice
  useEffect(() => {
    if (!isEditMode && nextNumberData?.invoiceNumber && !invoiceNumberOverride) {
      form.setValue("invoiceNumber", nextNumberData.invoiceNumber);
    }
  }, [nextNumberData, isEditMode, invoiceNumberOverride, form]);

  useEffect(() => {
    if (linkedEstimates.length > 0) {
      setSelectedEstimateId(linkedEstimates[0].estimateId);
    } else if (estimates.length > 0) {
      setSelectedEstimateId(estimates[0].id);
    }
  }, [linkedEstimates, estimates]);

  useEffect(() => {
    if (linkedVariations.length > 0 && isEditMode) {
      setSelectedVariationIds(linkedVariations.map((v: any) => v.variationId));
      const claims: ClaimState = {};
      linkedVariations.forEach((v: any) => {
        claims[v.variationId] = v.claimPercent ?? 100;
      });
      setVariationClaims(claims);
    }
  }, [linkedVariations, isEditMode]);

  useEffect(() => {
    if (linkedAllowances.length > 0 && isEditMode) {
      setSelectedAllowanceIds(linkedAllowances.map((a: any) => a.estimateItemId));
      const claims: ClaimState = {};
      linkedAllowances.forEach((a: any) => {
        claims[a.estimateItemId] = a.claimPercent ?? 100;
      });
      setAllowanceClaims(claims);
    }
  }, [linkedAllowances, isEditMode]);

  useEffect(() => {
    if (linkedBills.length > 0 && isEditMode) {
      setSelectedBillIds(linkedBills.map((b: any) => b.billId));
    }
  }, [linkedBills, isEditMode]);

  useEffect(() => {
    if (linkedTimesheets.length > 0 && isEditMode) {
      setSelectedTimesheetIds(linkedTimesheets.map((t: any) => t.timesheetId));
    }
  }, [linkedTimesheets, isEditMode]);

  useEffect(() => {
    if (linkedSelections.length > 0 && isEditMode) {
      setSelectedSelectionOptionIds(linkedSelections.map((s: any) => s.selectionOptionId));
    }
  }, [linkedSelections, isEditMode]);

  // initialise invoiceType from project or from existing invoice
  useEffect(() => {
    if (isEditMode && invoice) {
      setInvoiceType((invoice.invoicingMethod as any) || "progress_payments");
    } else if (!isEditMode && currentProject) {
      setInvoiceType((currentProject.invoicingMethod as any) || "progress_payments");
    }
  }, [invoice, currentProject, isEditMode]);


  // ── helpers ───────────────────────────────────────────────────────────────────

  const getAllowanceItems = () =>
    estimateItems.filter((item) => item.allowance && item.allowance !== "None");

  const getSelectedVariations = () =>
    variations.filter((v) => selectedVariationIds.includes(v.id));

  const getSelectedAllowanceItems = () =>
    getAllowanceItems().filter((item) => selectedAllowanceIds.includes(item.id));

  const getSelectedBills = () => bills.filter((b) => selectedBillIds.includes(b.id));

  const getSelectedTimesheets = () =>
    projectTimesheets.filter((t: any) => selectedTimesheetIds.includes(t.id));

  const expandByCostCode = (timesheets: any[]): any[] => {
    if (!labourBreakByCostCode) return timesheets;
    return timesheets.flatMap((t: any) => {
      const splits: any[] = t.costCodeSplits || [];
      if (splits.length === 0) return [t];
      return splits.map((s: any) => ({
        ...t,
        _splitId: s.id,
        costCodeId: s.costCodeId,
        duration: s.duration,
        hourlyRate: s.hourlyRate,
        total: s.total,
        _isSplit: true,
      }));
    });
  };

  const getSelectedSelectionOptions = () =>
    invoiceableSelections.filter((o: any) => selectedSelectionOptionIds.includes(o.id));

  const getUserName = (userId: string) => {
    const u = users.find((u: any) => u.id === userId);
    if (!u) return "Unknown";
    return u.name || u.firstName ? `${u.firstName || ""} ${u.lastName || ""}`.trim() : u.email || "Unknown";
  };

  // ── calculations ───────────────────────────────────────────────────────────────

  // Always the original-contract snapshot from the approved estimate. This is
  // the "Contract" base used to compute the contract-claim rows in this
  // invoice (e.g. progress payments). Variations are claimed in their own
  // section below, so this MUST NOT be the revised contract price — using
  // revised here would double-count approved variations on the invoice.
  // Surfaces that need the revised total (Project Total panel, project header)
  // call /api/projects/:id/contract-metrics or use useProjectMetrics.
  // Progress claims are only available once the project's selected estimate is
  // marked as Contract — a draft/approved estimate isn't a contract yet, so
  // there is nothing to claim against.
  const selectedProjectEstimate = estimates.find(
    (e: any) => e.id === (currentProject as any)?.selectedEstimateId
  );
  const hasContractEstimate = (selectedProjectEstimate as any)?.status === "contract";

  // Contract price for claims:
  // - DRAFT invoices read the LIVE original contract price (computed from the
  //   contract estimate) so claims track estimate edits until the invoice is sent.
  // - SENT/PAID invoices read the price stamped into lockedContractPrice at
  //   send time (server-side), so a later estimate edit can never silently
  //   change an invoice the client has already received.
  const getEffectiveContractPrice = () => {
    if (invoice && invoice.status !== "draft" && invoice.lockedContractPrice != null) {
      return invoice.lockedContractPrice;
    }
    return (contractMetrics?.originalContractPriceIncGstCents
      ?? (currentProject as any)?.contractPrice
      ?? null);
  };

  // True when the live contract price has drifted from what this (sent)
  // invoice was locked at — surfaced as a warning banner in the claims section.
  const contractPriceDrifted =
    !!invoice &&
    invoice.status !== "draft" &&
    invoice.lockedContractPrice != null &&
    contractMetrics?.originalContractPriceIncGstCents != null &&
    contractMetrics.originalContractPriceIncGstCents !== invoice.lockedContractPrice;

  // ── Closing-claim true-up ─────────────────────────────────────────────────
  // Progress claims are percentage-based and each row is rounded to the nearest
  // cent independently, so several claims that together cover 100% of a line can
  // fail to add back up to the line total (a phantom rounding cent). The claim
  // that CLOSES OUT a line — i.e. the cumulative claim across all of the
  // project's invoices reaches 100% — trues up to the exact remaining balance
  // instead of its own independently-rounded percentage, so the invoices always
  // reconcile to the contract (and to each variation/allowance) to the penny.
  const CLAIM_CLOSE_TOL = 0.005; // percentage-point tolerance for "reaches 100%"

  const baseContractCents = getEffectiveContractPrice() ?? 0;

  // Percent + cents already billed for the contract on the OTHER invoices.
  const otherInvoicesUsedPercent = projectInvoices
    .filter(inv => inv.id !== effectiveInvoiceId)
    .reduce((sum, inv) => {
      const rows = (inv as any).contractClaimRows as Array<{ claimPercent: number }> | null;
      if (!rows || !Array.isArray(rows)) return sum;
      return sum + rows.reduce((s, r) => s + (r.claimPercent || 0), 0);
    }, 0);
  const otherInvoicesContractCents = projectInvoices
    .filter(inv => inv.id !== effectiveInvoiceId)
    .reduce((sum, inv) => {
      const rows = (inv as any).contractClaimRows as Array<{ claimPercent: number }> | null;
      if (!rows || !Array.isArray(rows)) return sum;
      return sum + rows.reduce((s, r) => s + Math.round((baseContractCents * (r.claimPercent || 0)) / 100), 0);
    }, 0);
  const remainingClaimPercent = Math.max(0, 100 - otherInvoicesUsedPercent);

  // Returns true when adding `thisPct` to `otherPct` first brings the cumulative
  // claim to 100% on THIS invoice (and the others have not already closed it).
  const isClosingClaim = (otherPct: number, thisPct: number) =>
    thisPct > 0 &&
    otherPct + thisPct >= 100 - CLAIM_CLOSE_TOL &&
    otherPct < 100 - CLAIM_CLOSE_TOL;

  // How much of each variation is ALREADY claimed on the project's OTHER
  // invoices — see shared/invoiceClaims.ts for why the guard is cumulative
  // percent rather than "is it linked anywhere".
  const otherInvoiceVariationClaims = useMemo(
    () => summariseClaimsElsewhere(projectInvoiceVariations, (r) => r.variationId, effectiveInvoiceId),
    [projectInvoiceVariations, effectiveInvoiceId],
  );

  // Claim percent still available for a variation on THIS invoice (0–100).
  const getVariationRemainingPercent = (variationId: string) =>
    remainingLineClaimPercent(otherInvoiceVariationClaims[variationId]);

  // Fully claimed elsewhere — nothing left to bill, so the picker locks it.
  const isVariationFullyClaimedElsewhere = (variationId: string) =>
    isFullyClaimedElsewhere(otherInvoiceVariationClaims[variationId]);

  // Per-row contract claim cents for THIS invoice. When this invoice closes the
  // contract, the rounding residual is absorbed into the last claimed row so the
  // rows and the total reconcile exactly to the remaining contract balance.
  const getContractClaimRowCents = (): Record<string, number> => {
    const result: Record<string, number> = {};
    contractClaimRows.forEach(r => {
      result[r.id] = baseContractCents
        ? Math.round((baseContractCents * (r.claimPercent || 0)) / 100)
        : 0;
    });
    if (!baseContractCents) return result;
    const thisPercent = contractClaimRows.reduce((s, r) => s + (r.claimPercent || 0), 0);
    if (isClosingClaim(otherInvoicesUsedPercent, thisPercent)) {
      const target = baseContractCents - otherInvoicesContractCents;
      const summed = contractClaimRows.reduce((s, r) => s + result[r.id], 0);
      const delta = target - summed;
      if (delta !== 0) {
        const lastClaimed = [...contractClaimRows].reverse().find(r => (r.claimPercent || 0) > 0);
        if (lastClaimed) result[lastClaimed.id] += delta;
      }
    }
    return result;
  };

  const calculateContractPrice = () => {
    const cents = getContractClaimRowCents();
    return contractClaimRows.reduce((sum, r) => sum + (cents[r.id] || 0), 0);
  };

  // Contract-claim cents for a single row (used by row display + PDF).
  const getContractRowCents = (rowId: string) => getContractClaimRowCents()[rowId] ?? 0;

  // Variation claim cents for THIS invoice, trued up when this invoice closes
  // out the variation (cumulative claim across invoices reaches 100%).
  const getVariationClaimCents = (variation: any): number => {
    const target = variation.totalAmount || 0;
    const thisPct = variationClaims[variation.id] ?? 100;
    const others = projectInvoiceVariations.filter(
      r => r.variationId === variation.id && r.invoiceId !== effectiveInvoiceId
    );
    const otherPct = others.reduce((s, r) => s + (r.claimPercent || 0), 0);
    if (isClosingClaim(otherPct, thisPct)) {
      const otherCents = others.reduce((s, r) => s + Math.round((target * (r.claimPercent || 0)) / 100), 0);
      return target - otherCents;
    }
    return Math.round((target * thisPct) / 100);
  };

  const calculateVariationsTotal = () =>
    getSelectedVariations().reduce((sum, v) => sum + getVariationClaimCents(v), 0);

  // Allowance claim cents for THIS invoice, trued up when this invoice closes
  // out the allowance (cumulative claim across invoices reaches 100%).
  const getAllowanceClaimCents = (item: any): number => {
    // priceIncTax is already the whole line total (qty-inclusive for priced
    // lines, the typed amount for fixed-price allowances) — do NOT multiply by
    // quantity again (that was a qty² over-claim).
    const target = Math.round(item.priceIncTax * 100);
    const thisPct = allowanceClaims[item.id] ?? 100;
    const others = projectInvoiceAllowances.filter(
      r => r.estimateItemId === item.id && r.invoiceId !== effectiveInvoiceId
    );
    const otherPct = others.reduce((s, r) => s + (r.claimPercent || 0), 0);
    if (isClosingClaim(otherPct, thisPct)) {
      const otherCents = others.reduce((s, r) => s + Math.round((target * (r.claimPercent || 0)) / 100), 0);
      return target - otherCents;
    }
    return Math.round((target * thisPct) / 100);
  };

  const calculateAllowancesTotal = () =>
    getSelectedAllowanceItems().reduce((sum, item) => sum + getAllowanceClaimCents(item), 0);

  const calculateBillsTotal = () =>
    getSelectedBills().reduce((sum, b) => sum + b.total, 0);

  const calculateLabourTotal = () =>
    getSelectedTimesheets().reduce((sum, t: any) => sum + Math.round(Number(t.total) * 100), 0);

  const calculateSelectionsTotal = () =>
    getSelectedSelectionOptions().reduce((sum, o: any) => sum + (o.totalCost || 0), 0);

  const calculateCustomLinesSubtotal = () =>
    customLines.reduce((sum, item) => sum + item.totalPrice, 0);

  const calculateMarkup = () => {
    if (invoiceType === "cost_plus") {
      const markupPercent = form.watch("markupPercent") || 0;
      return (calculateBillsTotal() + calculateSelectionsTotal()) / 100 * (markupPercent / 100);
    }
    return 0;
  };

  const calculateSubtotal = () => {
    if (invoiceType === "progress_payments") {
      // contractPrice, variation totalAmount, and allowance priceIncTax are all stored inc-GST.
      // Divide by (1 + GST_RATE) to get the ex-GST base so calculateGST() doesn't double-count.
      const contract = calculateContractPrice() / 100 / (1 + GST_RATE);
      const vars = calculateVariationsTotal() / 100 / (1 + GST_RATE);
      const allowances = calculateAllowancesTotal() / 100 / (1 + GST_RATE);
      const custom = calculateCustomLinesSubtotal(); // user-entered dollar amounts are already ex-GST
      return contract + vars + allowances + custom;
    } else {
      return calculateLabourTotal() / 100 + calculateBillsTotal() / 100 + calculateSelectionsTotal() / 100 + calculateCustomLinesSubtotal();
    }
  };

  const addContractClaimRow = () => {
    if (contractClaimRows.length >= 5) return;
    setContractClaimRows((prev) => [
      ...prev,
      { id: crypto.randomUUID(), name: "", description: "", claimPercent: 0 },
    ]);
  };

  const updateContractClaimRow = (id: string, field: keyof ContractClaimRow, value: any) => {
    setContractClaimRows((prev) =>
      prev.map((row) => (row.id === id ? { ...row, [field]: value } : row))
    );
  };

  const removeContractClaimRow = (id: string) => {
    setContractClaimRows((prev) => prev.filter((row) => row.id !== id));
  };

  // GST and grand total are derived from the per-line breakdown (defined just
  // below) so non-taxable custom lines carry no GST anywhere — footer, stored
  // totals, PDF, and Xero all agree by construction.
  const calculateGST = () => breakdownTotals(buildInvoiceLineBreakdown()).gstAmount / 100;

  const calculateTotal = () => breakdownTotals(buildInvoiceLineBreakdown()).totalAmount / 100;

  // ── Line breakdown snapshot ────────────────────────────────────────────────
  // The single per-line money source for the saved snapshot (`lineBreakdown`),
  // the stored header totals, the summary panel, and the PDF. Everything is
  // integer cents; ex + gst always equals inc on every line, so the header
  // totals derived from this can never drift from the lines — and the Xero
  // push (which materialises its line items from the saved snapshot) always
  // reconciles to the invoice total to the cent.
  type BreakdownLine = {
    source: "contract" | "variation" | "allowance" | "labour" | "bill" | "selection" | "markup" | "custom";
    description: string;
    amountExCents: number;
    gstCents: number;
    amountIncCents: number;
    taxable: boolean;
    accountCode?: string | null;
    taxType?: string;
    tracking?: Array<{ categoryId: string; optionId: string }>;
    // Editor-only extras — the save payload picks fields explicitly, so these
    // never reach the server. `accountKey` is the line's override identity;
    // custom lines use `custom#<index>` and write through to their own column.
    accountKey?: string;
    // PDF-only extras (stripped by the server's Zod schema on save)
    label?: string;
    pdfDescription?: string;
    claimPct?: number;
  };

  // Split an inc-GST cents amount into ex + gst (claims are stored inc GST).
  // A GST-free line is billed at its own amount with no GST inside it, so the
  // ex-GST figure is the amount itself and the invoice total drops by the GST.
  const splitInc = (incCents: number, taxable = true) => {
    if (!taxable) return { ex: incCents, gst: 0 };
    const ex = Math.round(incCents / (1 + GST_RATE));
    return { ex, gst: incCents - ex };
  };
  // GST on top of an ex-GST cents amount (cost-plus sources + custom lines).
  const gstOnEx = (exCents: number, taxable: boolean) =>
    taxable ? Math.round(exCents * GST_RATE) : 0;

  // Stable identity for a non-custom line, used to key its Xero account
  // override. `labour` and `markup` are single lines per invoice and so need
  // no id. Custom lines are excluded — they carry their own account column.
  const lineAccountKey = (source: BreakdownLine["source"], id?: string) =>
    id ? `${source}:${id}` : source;
  const overrideFor = (source: BreakdownLine["source"], id?: string): LineXeroOverride =>
    lineXeroOverrides[lineAccountKey(source, id)] ?? {};
  const accountFor = (source: BreakdownLine["source"], id?: string) =>
    overrideFor(source, id).account || null;
  // Lines charge GST unless explicitly marked otherwise. Marking a line GST-free
  // does not gross it up: the line's own amount is what the client pays, and the
  // GST inside it comes off the invoice total (same as custom lines already do).
  const taxTypeFor = (source: BreakdownLine["source"], id?: string) =>
    overrideFor(source, id).taxType ?? (overrideFor(source, id).taxable === false ? "NONE" : "OUTPUT");
  const taxableFor = (source: BreakdownLine["source"], id?: string) =>
    GST_BEARING_TAX_TYPES.has(taxTypeFor(source, id));
  // Resolved tracking for a line: its own overrides, else the project's option
  // on the Jobs category, which is what every line used to get unconditionally.
  const trackingForKey = (key: string) => {
    const own = (lineXeroOverrides[key] ?? {}).tracking ?? {};
    const pairs = Object.entries(own).filter(([, optionId]) => !!optionId);
    if (pairs.length > 0) return pairs.map(([categoryId, optionId]) => ({ categoryId, optionId }));
    return undefined;
  };
  const trackingFor = (source: BreakdownLine["source"], id?: string) =>
    trackingForKey(lineAccountKey(source, id));

  // Write an override by the line's accountKey. Custom lines keep their account
  // and taxable flag on their own row; everything else goes into the map.
  const setXeroByKey = (key: string, patch: LineXeroOverride) => {
    if (key.startsWith("custom#")) {
      const index = Number(key.slice("custom#".length));
      setCustomLines((prev) =>
        prev.map((l, i) =>
          i === index
            ? {
                ...l,
                ...(patch.account !== undefined ? { xeroAccountCode: patch.account } : {}),
                ...(patch.taxable !== undefined ? { taxable: patch.taxable } : {}),
              }
            : l,
        ),
      );
      // A custom line still needs somewhere to keep its tracking.
      if (patch.tracking === undefined) return;
    }
    setLineXeroOverrides((prev) => {
      const next: LineXeroOverride = { ...(prev[key] ?? {}), ...patch };
      if (patch.tracking !== undefined) {
        next.tracking = Object.fromEntries(
          Object.entries(patch.tracking).filter(([, v]) => !!v),
        );
        if (Object.keys(next.tracking).length === 0) delete next.tracking;
      }
      if (next.account === null || next.account === "") delete next.account;
      if (next.taxable === true) delete next.taxable;
      if (Object.keys(next).length === 0) {
        const { [key]: _dropped, ...rest } = prev;
        return rest;
      }
      return { ...prev, [key]: next };
    });
  };

  // Apply one field down every line in the breakdown.
  const setXeroForAll = (patch: LineXeroOverride) => {
    buildInvoiceLineBreakdown().forEach((l) => l.accountKey && setXeroByKey(l.accountKey, patch));
  };

  const buildInvoiceLineBreakdown = (): BreakdownLine[] => {
    const lines: BreakdownLine[] = [];

    if (invoiceType === "progress_payments") {
      const contractRowCents = getContractClaimRowCents();
      for (const row of contractClaimRows) {
        if (!baseContractCents || !row.claimPercent) continue;
        const inc = contractRowCents[row.id] ?? 0;
        const taxable = taxableFor("contract", row.id);
        const { ex, gst } = splitInc(inc, taxable);
        lines.push({
          source: "contract",
          description: `${row.name || "Contract Claim"}${row.description ? ` — ${row.description}` : ""} (${row.claimPercent}%)`,
          amountExCents: ex, gstCents: gst, amountIncCents: ex + gst, taxable,
          accountCode: accountFor("contract", row.id),
          taxType: taxTypeFor("contract", row.id),
          tracking: trackingFor("contract", row.id),
          accountKey: lineAccountKey("contract", row.id),
          label: row.name || "Contract Claim", pdfDescription: row.description, claimPct: row.claimPercent,
        });
      }
      for (const v of getSelectedVariations()) {
        const pct = variationClaims[v.id] ?? 100;
        const inc = getVariationClaimCents(v);
        const taxable = taxableFor("variation", v.id);
        const { ex, gst } = splitInc(inc, taxable);
        lines.push({
          source: "variation",
          description: `Variation ${v.variationNumber || ""}${v.name ? `: ${v.name}` : ""} (${pct}%)`,
          amountExCents: ex, gstCents: gst, amountIncCents: ex + gst, taxable,
          accountCode: accountFor("variation", v.id),
          taxType: taxTypeFor("variation", v.id),
          tracking: trackingFor("variation", v.id),
          accountKey: lineAccountKey("variation", v.id),
          label: `Variation ${v.variationNumber || ""}`, pdfDescription: v.name || undefined, claimPct: pct,
        });
      }
      for (const item of getSelectedAllowanceItems()) {
        const pct = allowanceClaims[item.id] ?? 100;
        const inc = getAllowanceClaimCents(item);
        const taxable = taxableFor("allowance", item.id);
        const { ex, gst } = splitInc(inc, taxable);
        lines.push({
          source: "allowance",
          description: `Allowance — ${item.name || ""} (${pct}%)`,
          amountExCents: ex, gstCents: gst, amountIncCents: ex + gst, taxable,
          accountCode: accountFor("allowance", item.id),
          taxType: taxTypeFor("allowance", item.id),
          tracking: trackingFor("allowance", item.id),
          accountKey: lineAccountKey("allowance", item.id),
          label: `Allowance - ${item.name || ""}`, claimPct: pct,
        });
      }
    } else {
      // Cost plus. Labour/bills/selections feed the ex-GST base (mirrors
      // calculateSubtotal) with GST added on the client invoice.
      const selectedTimesheets = getSelectedTimesheets();
      if (selectedTimesheets.length > 0) {
        const ex = calculateLabourTotal();
        const labourTaxable = taxableFor("labour");
        const gst = gstOnEx(ex, labourTaxable);
        lines.push({
          source: "labour",
          description: `Labour — ${selectedTimesheets.length} timesheet${selectedTimesheets.length === 1 ? "" : "s"}`,
          amountExCents: ex, gstCents: gst, amountIncCents: ex + gst, taxable: labourTaxable,
          accountCode: accountFor("labour"),
          taxType: taxTypeFor("labour"),
          tracking: trackingFor("labour"),
          accountKey: lineAccountKey("labour"),
          label: "Labour",
        });
      }
      for (const bill of getSelectedBills()) {
        const ex = bill.total;
        const billTaxable = taxableFor("bill", bill.id);
        const gst = gstOnEx(ex, billTaxable);
        const supplierName = (bill as any).supplierName as string | undefined;
        lines.push({
          source: "bill",
          description: `${supplierName || "Bill"}${bill.billNumber ? ` — ${bill.billNumber}` : ""}`,
          amountExCents: ex, gstCents: gst, amountIncCents: ex + gst, taxable: billTaxable,
          accountCode: accountFor("bill", bill.id),
          taxType: taxTypeFor("bill", bill.id),
          tracking: trackingFor("bill", bill.id),
          accountKey: lineAccountKey("bill", bill.id),
          label: supplierName || "Bill", pdfDescription: bill.billNumber || undefined,
        });
      }
      for (const o of getSelectedSelectionOptions()) {
        const ex = o.totalCost || 0;
        const selTaxable = taxableFor("selection", o.id);
        const gst = gstOnEx(ex, selTaxable);
        lines.push({
          source: "selection",
          description: `Selection — ${o.name || ""}`,
          amountExCents: ex, gstCents: gst, amountIncCents: ex + gst, taxable: selTaxable,
          accountCode: accountFor("selection", o.id),
          taxType: taxTypeFor("selection", o.id),
          tracking: trackingFor("selection", o.id),
          accountKey: lineAccountKey("selection", o.id),
          label: `Selection - ${o.name || ""}`,
        });
      }
      const markupEx = Math.round(calculateMarkup() * 100);
      if (markupEx !== 0) {
        const markupTaxable = taxableFor("markup");
        const gst = gstOnEx(markupEx, markupTaxable);
        lines.push({
          source: "markup",
          description: `Builder's margin (${form.watch("markupPercent") || 0}%)`,
          amountExCents: markupEx, gstCents: gst, amountIncCents: markupEx + gst, taxable: markupTaxable,
          accountCode: accountFor("markup"),
          taxType: taxTypeFor("markup"),
          tracking: trackingFor("markup"),
          accountKey: lineAccountKey("markup"),
          label: "Builder's margin",
        });
      }
    }

    // Custom lines (both methods). Prices are entered EX GST; GST applies only
    // when the line is taxable — this is the single GST convention (the row
    // display, footer, PDF, and Xero all derive from these same cents).
    customLines.forEach((line, customIndex) => {
      const ex = Math.round(line.totalPrice * 100);
      const gst = gstOnEx(ex, line.taxable);
      lines.push({
        source: "custom",
        description: line.name || line.description || "Custom Item",
        amountExCents: ex, gstCents: gst, amountIncCents: ex + gst, taxable: line.taxable,
        accountCode: line.xeroAccountCode || null,
        tracking: trackingForKey(`custom#${customIndex}`),
        accountKey: `custom#${customIndex}`,
        label: line.name || line.description || "Custom Item",
        pdfDescription: line.name ? line.description || undefined : undefined,
      });
    });

    return lines;
  };

  // Header totals derived from the breakdown so lines and totals can never
  // disagree. `subtotal` excludes the markup line (stored separately in
  // `markupAmount`), matching the existing schema semantics.
  const breakdownTotals = (lines: BreakdownLine[]) => {
    const subtotal = lines.filter((l) => l.source !== "markup").reduce((s, l) => s + l.amountExCents, 0);
    const markupAmount = lines.filter((l) => l.source === "markup").reduce((s, l) => s + l.amountExCents, 0);
    const gstAmount = lines.reduce((s, l) => s + l.gstCents, 0);
    const totalAmount = lines.reduce((s, l) => s + l.amountIncCents, 0);
    return { subtotal, markupAmount, gstAmount, totalAmount };
  };

  const amountExTax = () => {
    const t = breakdownTotals(buildInvoiceLineBreakdown());
    return (t.subtotal + t.markupAmount) / 100;
  };
  const amountTax = () => breakdownTotals(buildInvoiceLineBreakdown()).gstAmount / 100;
  const amountIncTax = () => breakdownTotals(buildInvoiceLineBreakdown()).totalAmount / 100;

  const formatCurrency = (amount: number) => {
    const isWholeNumber = amount % 1 === 0;
    return new Intl.NumberFormat("en-AU", {
      style: "currency",
      currency: "AUD",
      minimumFractionDigits: isWholeNumber ? 0 : 2,
      maximumFractionDigits: 2,
    }).format(amount);
  };

  // ── column visibility ──────────────────────────────────────────────────────────

  const visibleColumns = columnConfig
    .slice()
    .sort((a, b) => a.order - b.order)
    .filter((c) => {
      const def = ALL_COLUMNS.find((d) => d.id === c.id);
      return def?.required || c.visible;
    });

  const isColVisible = (id: ColumnId) => visibleColumns.some((c) => c.id === id);

  const isBillColVisible = (id: string) => {
    const col = billsColConfig.find((c) => c.id === id);
    return col ? col.visible : true;
  };

  const toggleBillCol = (id: string) => {
    const updated = billsColConfig.map((c) => c.id === id ? { ...c, visible: !c.visible } : c);
    setBillsColConfig(updated);
    try { localStorage.setItem("invoice-bills-col-v1", JSON.stringify(updated)); } catch {}
  };

  const labourSortToggle = (col: string) => {
    if (labourSortCol === col) setLabourSortDir(d => d === "asc" ? "desc" : "asc");
    else { setLabourSortCol(col); setLabourSortDir("asc"); }
  };

  const billsSortToggle = (col: string) => {
    if (billsSortCol === col) setBillsSortDir(d => d === "asc" ? "desc" : "asc");
    else { setBillsSortCol(col); setBillsSortDir("asc"); }
  };

  const SortIcon = ({ col, current, dir }: { col: string; current: string; dir: "asc" | "desc" }) => {
    if (col !== current) return <ArrowUpDown className="w-3 h-3 opacity-30 ml-0.5 inline" />;
    return dir === "asc" ? <ArrowUp className="w-3 h-3 ml-0.5 inline" /> : <ArrowDown className="w-3 h-3 ml-0.5 inline" />;
  };

  const toggleColumn = (id: ColumnId) => {
    const def = ALL_COLUMNS.find((d) => d.id === id);
    if (def?.required) return;
    setColumnConfig((prev) =>
      prev.map((c) => (c.id === id ? { ...c, visible: !c.visible } : c))
    );
  };

  // Drag-to-reorder columns
  const onDragStart = (id: ColumnId) => {
    dragItem.current = id;
  };
  const onDragOver = (id: ColumnId, e: React.DragEvent) => {
    e.preventDefault();
    setDragOverId(id);
  };
  const onDrop = (targetId: ColumnId) => {
    if (!dragItem.current || dragItem.current === targetId) {
      setDragOverId(null);
      return;
    }
    setColumnConfig((prev) => {
      const updated = [...prev];
      const fromIdx = updated.findIndex((c) => c.id === dragItem.current);
      const toIdx = updated.findIndex((c) => c.id === targetId);
      if (fromIdx === -1 || toIdx === -1) return prev;
      const [moved] = updated.splice(fromIdx, 1);
      updated.splice(toIdx, 0, moved);
      return updated.map((c, i) => ({ ...c, order: i }));
    });
    setDragOverId(null);
    dragItem.current = null;
  };

  // ── mutations ─────────────────────────────────────────────────────────────────

  const buildInvoicePayload = (data: InvoiceFormData) => {
    // Header totals and the persisted snapshot come from the SAME per-line
    // cents, so stored totals always equal the sum of the stored lines.
    const lineBreakdown = buildInvoiceLineBreakdown();
    const totals = breakdownTotals(lineBreakdown);
    return {
      projectId: data.projectId,
      invoiceNumber: data.invoiceNumber || undefined,
      name: data.name,
      invoiceDate: data.invoiceDate,
      dueDate: data.dueDate,
      invoicingMethod: invoiceType,
      markupPercent: data.markupPercent,
      introductionText: data.introductionText,
      closingText: data.closingText,
      termsAndConditions: termsAndConditions || null,
      subtotal: totals.subtotal,
      markupAmount: totals.markupAmount,
      gstAmount: totals.gstAmount,
      totalAmount: totals.totalAmount,
      lineBreakdown: lineBreakdown.map((l) => ({
        source: l.source,
        description: l.description,
        amountExCents: l.amountExCents,
        gstCents: l.gstCents,
        amountIncCents: l.amountIncCents,
        taxable: l.taxable,
        accountCode: l.accountCode ?? null,
        taxType: l.taxType ?? null,
        tracking: l.tracking ?? null,
      })),
      columnConfig: columnConfig,
      showAmountsIncTax: showAmountsIncTax,
      contractClaimRows: contractClaimRows,
      lineXeroOverrides: lineXeroOverrides,
      sendToXero: sendToXero,
    };
  };

  const openXeroLinkModal = (error: any, retryFn: () => Promise<void>) => {
    const payload = error?.payload;
    if (payload?.error === "UNMAPPED_CONTACT") {
      setXeroUnmappedClientName(payload.clientName || "Unknown Client");
      xeroRetryRef.current = retryFn;
      setXeroLinkModalOpen(true);
      return true;
    }
    return false;
  };

  // Child rows for the transactional save — the FULL current selection (the
  // server replaces children wholesale inside one DB transaction, so a
  // mid-save failure can never leave a half-saved invoice).
  const buildInvoiceChildren = () => ({
    items: customLines.map((item, i) => ({
      name: item.name,
      description: item.description,
      quantity: item.quantity,
      unitPrice: Math.round(item.unitPrice * 100),
      taxable: item.taxable,
      sortOrder: i,
      unit: item.unit || null,
      costCodeId: item.costCodeId || null,
      xeroAccountCode: item.xeroAccountCode || null,
    })),
    variations: selectedVariationIds.map((variationId) => ({
      variationId,
      claimPercent: variationClaims[variationId] ?? 100,
    })),
    allowances: selectedAllowanceIds.map((estimateItemId) => ({
      estimateItemId,
      claimPercent: allowanceClaims[estimateItemId] ?? 100,
    })),
    bills: invoiceType === "cost_plus" ? selectedBillIds : [],
    timesheets: invoiceType === "cost_plus" ? selectedTimesheetIds : [],
    selections: invoiceType === "cost_plus" ? selectedSelectionOptionIds : [],
  });

  // Refetch the invoice's children after a wholesale save (row ids change).
  const invalidateInvoiceChildQueries = (invoiceId: string) => {
    for (const child of ["items", "variations", "allowances", "bills", "timesheets", "selections", "payments"]) {
      queryClient.invalidateQueries({ queryKey: [`/api/client-invoices/${invoiceId}/${child}`] });
    }
  };

  // The cross-invoice claim lists drive the "already claimed elsewhere" guard
  // in the variation/allowance pickers. queryClient runs staleTime: Infinity,
  // so without an explicit invalidation a save here leaves every other invoice
  // in the session reading a stale list — the guard would miss a variation
  // that was just claimed, and un-linking one would not free it again.
  const invalidateProjectClaimQueries = () => {
    queryClient.invalidateQueries({ queryKey: ["/api/invoice-variations/by-project"] });
    queryClient.invalidateQueries({ queryKey: ["/api/invoice-allowances/by-project"] });
  };

  const createMutation = useMutation({
    mutationFn: async (data: InvoiceFormData) => {
      const payload = buildInvoicePayload(data);
      const invoiceData = {
        ...payload,
        paidAmount: 0,
        balanceAmount: payload.totalAmount,
        status: "draft",
      };

      // One request, one DB transaction — invoice + all child rows.
      const newInvoice = (await apiRequest("/api/client-invoices/full", "POST", {
        invoice: invoiceData,
        ...buildInvoiceChildren(),
      })) as ClientInvoice;

      return newInvoice;
    },
    onSuccess: async (inv) => {
      queryClient.invalidateQueries({ queryKey: ["/api/client-invoices"] });
      invalidateProjectClaimQueries();
      // Refresh the auto-generated number so the next new invoice advances
      // instead of reusing (and colliding with) the number we just consumed.
      queryClient.invalidateQueries({ queryKey: ["/api/client-invoices/next-number"] });
      if (user?.id) {
        logActivity({
          projectId: inv.projectId,
          userId: user.id,
          activityType: "invoice",
          action: "created",
          description: `created invoice '${inv.invoiceNumber}'`,
          entityId: inv.id,
          entityName: inv.invoiceNumber || `INV-${inv.id.slice(0, 8)}`,
          metadata: {},
        });
      }

      // Auto-push to Xero if sendToXero is enabled on create
      if (sendToXero && xeroStatus?.connected && inv.id) {
        const doPush = async () => {
          const data = await apiRequest("/api/xero/push-client-invoice", "POST", { invoiceId: inv.id });
          toast({ title: "Created & pushed to Xero", description: `Xero invoice ${data.xeroInvoiceNumber || data.xeroInvoiceId} created` });
        };
        try {
          await doPush();
          handleCancel();
        } catch (xeroErr: any) {
          if (!openXeroLinkModal(xeroErr, doPush)) {
            toast({ title: "Created, but Xero push failed", description: xeroErr?.payload?.message || xeroErr.message || "Invoice saved — you can push to Xero manually", variant: "destructive" });
            handleCancel();
          }
          // if modal opened, stay on page so user can link and retry
        }
      } else {
        toast({ title: "Success", description: "Invoice created successfully" });
        handleCancel();
      }
    },
    onError: (error: Error) => {
      // A duplicate-number collision means our cached auto-number is stale —
      // refresh it so the form picks up a fresh number before the user retries.
      queryClient.invalidateQueries({ queryKey: ["/api/client-invoices/next-number"] });
      toast({ title: "Error", description: error.message || "Failed to create invoice", variant: "destructive" });
    },
  });

  const updateMutation = useMutation({
    mutationFn: async (data: InvoiceFormData) => {
      const payload = buildInvoicePayload(data);
      const invoiceData = {
        ...payload,
        paidAmount: invoice?.paidAmount || 0,
        balanceAmount: payload.totalAmount - (invoice?.paidAmount || 0),
      };

      // One request, one DB transaction — invoice + all child rows replaced
      // wholesale. (The old diff-per-row flow also never synced variation or
      // allowance links on update at all.)
      const updatedInvoice = (await apiRequest(
        `/api/client-invoices/${effectiveInvoiceId}/full`,
        "PUT",
        { invoice: invoiceData, ...buildInvoiceChildren() }
      )) as ClientInvoice;

      return updatedInvoice;
    },
    onSuccess: async (inv) => {
      queryClient.invalidateQueries({ queryKey: ["/api/client-invoices"] });
      queryClient.invalidateQueries({
        queryKey: [`/api/client-invoices/${effectiveInvoiceId}`],
      });
      invalidateProjectClaimQueries();
      if (effectiveInvoiceId) invalidateInvoiceChildQueries(effectiveInvoiceId);
      if (user?.id) {
        logActivity({
          projectId: inv.projectId,
          userId: user.id,
          activityType: "invoice",
          action: "updated",
          description: `updated invoice '${inv.invoiceNumber}'`,
          entityId: inv.id,
          entityName: inv.invoiceNumber || `INV-${inv.id.slice(0, 8)}`,
          metadata: {},
        });
      }

      // Auto-sync to Xero if sendToXero is enabled
      if (sendToXero && xeroStatus?.connected && effectiveInvoiceId) {
        const xeroInvoiceId = (inv as ClientInvoice).xeroInvoiceId;
        const doPush = async () => {
          if (xeroInvoiceId) {
            const data = await apiRequest(`/api/xero/update-client-invoice/${effectiveInvoiceId}`, "PATCH");
            toast({ title: "Saved & synced to Xero", description: `Xero invoice ${data.xeroInvoiceNumber || xeroInvoiceId} updated` });
          } else {
            const data = await apiRequest("/api/xero/push-client-invoice", "POST", { invoiceId: effectiveInvoiceId });
            queryClient.invalidateQueries({ queryKey: [`/api/client-invoices/${effectiveInvoiceId}`] });
            toast({ title: "Saved & pushed to Xero", description: `Xero invoice ${data.xeroInvoiceNumber || data.xeroInvoiceId} created` });
          }
        };
        try {
          await doPush();
          handleCancel();
        } catch (xeroErr: any) {
          if (!openXeroLinkModal(xeroErr, doPush)) {
            toast({ title: "Saved, but Xero sync failed", description: xeroErr?.payload?.message || xeroErr.message || "Unknown Xero error", variant: "destructive" });
            handleCancel();
          }
          // if modal opened, stay on page so user can link and retry
        }
      } else {
        toast({ title: "Success", description: "Invoice updated successfully" });
        handleCancel();
      }
    },
    onError: (error: Error) => {
      toast({ title: "Error", description: error.message || "Failed to update invoice", variant: "destructive" });
    },
  });

  const voidPaymentMutation = useMutation({
    mutationFn: async (paymentId: string) => {
      return await apiRequest(`/api/client-invoice-payments/${paymentId}/void`, "PATCH");
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [`/api/client-invoices/${effectiveInvoiceId}/payments`] });
      queryClient.invalidateQueries({ queryKey: [`/api/client-invoices/${effectiveInvoiceId}`] });
      queryClient.invalidateQueries({ queryKey: ["/api/client-invoices"] });
      toast({ title: "Payment voided" });
    },
    onError: () => {
      toast({ title: "Failed to void payment", variant: "destructive" });
    },
  });

  const recordPaymentMutation = useMutation({
    mutationFn: async (data: PaymentFormData) => {
      const paymentData = {
        invoiceId: effectiveInvoiceId,
        amount: Math.round(data.amount * 100),
        paymentDate: data.paymentDate,
        paymentMethod: data.paymentMethod,
        reference: data.reference,
        notes: data.notes,
      };

      // Clamp to the outstanding balance — an overpayment is almost always a
      // typo, and it would flip the invoice to "paid" with a negative residual.
      const outstandingCents = Math.max(0, (invoice?.totalAmount || 0) - (invoice?.paidAmount || 0));
      if (paymentData.amount > outstandingCents) {
        throw new Error(`Payment is more than the outstanding balance (${formatCurrency(outstandingCents / 100)})`);
      }

      // The server recomputes paidAmount/balanceAmount/status from the payment
      // rows when the payment is created (single writer) — no client-side
      // PATCH of paid state.
      const newPayment = (await apiRequest(
        `/api/client-invoices/${effectiveInvoiceId}/payments`,
        "POST",
        paymentData
      )) as ClientInvoicePayment;

      return newPayment;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: [`/api/client-invoices/${effectiveInvoiceId}`],
      });
      queryClient.invalidateQueries({
        queryKey: [`/api/client-invoices/${effectiveInvoiceId}/payments`],
      });
      queryClient.invalidateQueries({ queryKey: ["/api/client-invoices"] });
      toast({ title: "Success", description: "Payment recorded successfully" });
      setPaymentDialogOpen(false);
      paymentForm.reset();
    },
    onError: (error: Error) => {
      toast({ title: "Error", description: error.message || "Failed to record payment", variant: "destructive" });
    },
  });

  const sendInvoiceMutation = useMutation({
    mutationFn: async () => {
      await apiRequest(`/api/client-invoices/${effectiveInvoiceId}`, "PATCH", {
        status: "sent",
      });
    },
    onSuccess: async () => {
      queryClient.invalidateQueries({
        queryKey: [`/api/client-invoices/${effectiveInvoiceId}`],
      });
      queryClient.invalidateQueries({ queryKey: ["/api/client-invoices"] });
      if (invoice && user?.id) {
        logActivity({
          projectId: invoice.projectId,
          userId: user.id,
          activityType: "invoice",
          action: "submitted",
          description: `sent invoice '${invoice.invoiceNumber}'`,
          entityId: invoice.id,
          entityName: invoice.invoiceNumber || `INV-${invoice.id.slice(0, 8)}`,
          metadata: {},
        });
      }

      // Auto-sync to Xero on send if sendToXero is enabled
      if (sendToXero && xeroStatus?.connected && effectiveInvoiceId) {
        const doPush = async () => {
          if (invoice?.xeroInvoiceId) {
            await apiRequest(`/api/xero/update-client-invoice/${effectiveInvoiceId}`, "PATCH");
            toast({ title: "Sent & synced to Xero", description: "Invoice marked as sent and synced to Xero" });
          } else {
            const data = await apiRequest("/api/xero/push-client-invoice", "POST", { invoiceId: effectiveInvoiceId });
            toast({ title: "Sent & pushed to Xero", description: `Xero invoice ${data.xeroInvoiceNumber || data.xeroInvoiceId} created` });
          }
        };
        try {
          await doPush();
          handleCancel();
        } catch (xeroErr: any) {
          if (!openXeroLinkModal(xeroErr, doPush)) {
            toast({ title: "Sent, but Xero sync failed", description: xeroErr?.payload?.message || xeroErr.message || "Invoice sent — you can sync to Xero manually", variant: "destructive" });
            handleCancel();
          }
          // if modal opened, stay on page so user can link and retry
        }
      } else {
        toast({ title: "Success", description: "Invoice sent successfully" });
        handleCancel();
      }
    },
    onError: (error: Error) => {
      toast({ title: "Error", description: error.message || "Failed to send invoice", variant: "destructive" });
    },
  });

  // ── handlers ──────────────────────────────────────────────────────────────────

  const addCustomLine = () => {
    setCustomLines([
      ...customLines,
      {
        name: "",
        description: "",
        quantity: 1,
        unitPrice: 0,
        totalPrice: 0,
        taxable: true,
        sortOrder: customLines.length,
        unit: "unit",
        costCodeId: null,
        xeroAccountCode: companySettings?.clientInvoiceDefaultXeroAccount || null,
      },
    ]);
  };

  const updateCustomLine = (index: number, field: keyof CustomLine, value: any) => {
    const updated = [...customLines];
    updated[index] = { ...updated[index], [field]: value };
    if (field === "quantity" || field === "unitPrice") {
      const qty = field === "quantity" ? value : updated[index].quantity;
      const price = field === "unitPrice" ? value : updated[index].unitPrice;
      updated[index].totalPrice = qty * price;
    }
    setCustomLines(updated);
  };

  const deleteCustomLine = (index: number) => {
    setCustomLines(customLines.filter((_, i) => i !== index));
  };

  const handleCancel = () => {
    if (projectIdFromParams) {
      setLocation(`/projects/${projectIdFromParams}/client-invoices`);
    } else {
      setLocation("/client-invoices");
    }
  };

  const handlePushToXero = async () => {
    if (!effectiveInvoiceId || xeroPushing) return;
    setXeroPushing(true);
    const doPush = async () => {
      const data = await apiRequest("/api/xero/push-client-invoice", "POST", {
        invoiceId: effectiveInvoiceId,
      });
      toast({
        title: "Sent to Xero",
        description: `Invoice pushed to Xero successfully (${data.xeroInvoiceNumber || data.xeroInvoiceId})`,
      });
      queryClient.invalidateQueries({
        queryKey: [`/api/client-invoices/${effectiveInvoiceId}`],
      });
    };
    try {
      await doPush();
    } catch (error: any) {
      if (!openXeroLinkModal(error, doPush)) {
        toast({
          title: "Failed to send to Xero",
          description: error?.payload?.message || error.message || "Could not push invoice to Xero",
          variant: "destructive",
        });
      }
    } finally {
      setXeroPushing(false);
    }
  };

  const syncPaymentMutation = useMutation({
    mutationFn: async (): Promise<{ synced: boolean; diff: number; xeroStatus: string }> => {
      // apiRequest throws on non-2xx and returns parsed JSON on success
      return await apiRequest(`/api/xero/sync-client-invoice-payment/${effectiveInvoiceId}`, "POST");
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: [`/api/client-invoices/${effectiveInvoiceId}`] });
      queryClient.invalidateQueries({ queryKey: [`/api/client-invoices/${effectiveInvoiceId}/payments`] });
      if (data.synced && data.diff > 0) {
        toast({ title: "Payment synced from Xero", description: `$${(data.diff / 100).toFixed(2)} recorded — status: ${data.xeroStatus}` });
      } else {
        toast({ title: "Already up to date", description: `Xero status: ${data.xeroStatus}` });
      }
    },
    onError: (error: Error) => {
      toast({ title: "Sync failed", description: error.message, variant: "destructive" });
    },
  });

  const pullFromXeroMutation = useMutation({
    mutationFn: async (): Promise<{ success: boolean; xeroStatus: string; amountPaidCents: number; newLocalStatus: string }> => {
      // apiRequest throws on non-2xx and returns parsed JSON on success
      return await apiRequest(`/api/xero/pull-client-invoice/${effectiveInvoiceId}`, "POST");
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: [`/api/client-invoices/${effectiveInvoiceId}`] });
      queryClient.invalidateQueries({ queryKey: [`/api/client-invoices/${effectiveInvoiceId}/payments`] });
      queryClient.invalidateQueries({ queryKey: ["/api/client-invoices"] });
      toast({
        title: "Synced from Xero",
        description: `Status: ${data.xeroStatus} — Paid: $${(data.amountPaidCents / 100).toFixed(2)}`,
      });
    },
    onError: (error: Error) => {
      toast({ title: "Sync from Xero failed", description: error.message, variant: "destructive" });
    },
  });


  const onSubmit = (data: InvoiceFormData) => {
    if (isEditMode) updateMutation.mutate(data);
    else createMutation.mutate(data);
  };

  // ── loading ───────────────────────────────────────────────────────────────────

  if (invoiceLoading) {
    return (
      <div className="flex items-center justify-center h-full">
        <Loader2
          className="w-8 h-8 animate-spin text-muted-foreground"
          data-testid="loader-invoice"
        />
      </div>
    );
  }

  const total = calculateTotal();
  const paid = invoice?.paidAmount ? invoice.paidAmount / 100 : 0;
  const due = total - paid;
  const contractTotal = calculateContractPrice() / 100;

  // T004: Build PDF line items from current invoice state
  // PDF rows come from the same breakdown as the saved snapshot/totals/Xero,
  // so every line whose money is in the total appears on the PDF (previously
  // cost-plus labour, selections, and markup were omitted while their amounts
  // stayed in the totals) and per-line `taxable` is honoured.
  const buildInvoicePdfLineItems = () =>
    buildInvoiceLineBreakdown().map((l) => ({
      label: l.label || l.description,
      description: l.pdfDescription,
      claimPct: l.claimPct,
      amountExTax: l.amountExCents,
      gst: l.gstCents,
      amountIncTax: l.amountIncCents,
    }));

  const handleDownloadInvoicePdf = async () => {
    setInvoicePdfGenerating(true);
    try {
      const subtotalCents = Math.round(amountExTax() * 100);
      const gstCents = Math.round(amountTax() * 100);
      const totalCents = Math.round(amountIncTax() * 100);
      const paidCents = Math.round(paid * 100);
      const balanceDueCents = totalCents - paidCents;
      const blob = await pdf(
        <InvoiceDocument
          invoiceNumber={form.watch("invoiceNumber") || invoice?.invoiceNumber || "Invoice"}
          issueDate={form.watch("invoiceDate") || invoice?.invoiceDate}
          dueDate={form.watch("dueDate") || invoice?.dueDate}
          company={companyInfo}
          clientName={clientContact?.name}
          projectName={currentProject?.name}
          projectAddress={(currentProject as any)?.address || (clientContact as any)?.addressFormatted}
          lineItems={buildInvoicePdfLineItems()}
          subtotalCents={subtotalCents}
          gstCents={gstCents}
          totalCents={totalCents}
          paidCents={paidCents}
          balanceDueCents={balanceDueCents}
          brandColor={companySettings?.brandColor || "#6d28d9"}
          documentStyle={docStyle}
          logoUrl={logoUrl}
          paymentDetails={companySettings?.paymentDetails}
          termsAndConditions={termsAndConditions}
          status={invoice?.status}
        />
      ).toBlob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `invoice-${form.watch("invoiceNumber") || "export"}.pdf`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch (err) {
      console.error("PDF generation error:", err);
      toast({ title: "PDF generation failed", variant: "destructive" });
    } finally {
      setInvoicePdfGenerating(false);
    }
  };

  const handleOpenInvoiceSendModal = () => {
    const subtotalCents = Math.round(amountExTax() * 100);
    const gstCents = Math.round(amountTax() * 100);
    const totalCents = Math.round(amountIncTax() * 100);
    const paidCents = Math.round(paid * 100);
    const balanceDueCents = totalCents - paidCents;
    setInvoiceSendData({
      lineItems: buildInvoicePdfLineItems(),
      subtotalCents,
      gstCents,
      totalCents,
      paidCents,
      balanceDueCents,
      initialSubject: `Invoice ${form.watch("invoiceNumber") || invoice?.invoiceNumber || ""} — ${currentProject?.name || ""}`,
      initialBody: `Hi ${clientContact?.name || ""},\n\nPlease find your invoice attached.\n\nKind regards,\n${user?.firstName || ""} ${user?.lastName || ""}`,
    });
    setInvoiceSendModalOpen(true);
  };

  // ── render helpers ────────────────────────────────────────────────────────────

  // ── Progress-claim line grid ──────────────────────────────────────────────
  // Contract claims, variations and allowances are the same seven columns with
  // the same money maths — only the name, description and claim-% cells differ
  // per source. One column set and one grid renderer, so the three can't drift
  // apart the way three copies of the markup did.
  type ClaimLine = {
    key: string;
    /** Override identity — `contract:<id>` etc, not the bare row id. */
    xeroKey: string;
    name: ReactNode;
    description: ReactNode;
    claimPercentCell: ReactNode;
    /** Dollars, inc GST — the ex/tax columns derive from this. */
    claimAmt: number;
    onRemove: () => void;
  };

  const claimLineColumns = (): LineItemColumn<ClaimLine>[] => {
    const exOf = (incAmt: number) => incAmt / (1 + GST_RATE);
    const cols: LineItemColumn<ClaimLine>[] = [];
    // Name/description/claim% hold inline editors on the contract grid, so they
    // opt out of LineItemTable's truncating wrapper.
    if (isColVisible("name"))
      cols.push({ key: "name", header: "Name", width: 160, truncate: false, className: "font-medium", cell: (l) => l.name });
    if (isColVisible("description"))
      cols.push({ key: "description", header: "Description", width: 260, truncate: false, className: "text-muted-foreground", cell: (l) => l.description });
    if (isColVisible("claimPercent"))
      cols.push({ key: "claimPercent", header: "Claim %", align: "right", width: 80, truncate: false, cell: (l) => l.claimPercentCell });
    if (isColVisible("claimAmount"))
      cols.push({ key: "claimAmount", header: "Claim $", align: "right", width: 112, className: "font-medium", cell: (l) => formatCurrency(l.claimAmt) });
    // Tax and Account sit inline, exactly as they do on Custom Lines — the Xero
    // Posting panel is for setting them in bulk and for tracking, not the only
    // way to reach them.
    cols.push({
      key: "taxType", header: "Tax", width: 128, truncate: false,
      cell: (l) => {
        const current = lineXeroOverrides[l.xeroKey]?.taxType
          ?? (lineXeroOverrides[l.xeroKey]?.taxable === false ? "NONE" : "OUTPUT");
        // Fall back to the two rates every AU org has when Xero isn't reachable,
        // so the column is still usable rather than a free-text guess.
        const rates = xeroTaxRates.length > 0
          ? xeroTaxRates
          : [{ taxType: "OUTPUT", name: "GST on Income" }, { taxType: "NONE", name: "No GST" }];
        return (
          <Select value={current} onValueChange={(v) => setXeroByKey(l.xeroKey, { taxType: v })}>
            <SelectTrigger className="h-7 text-table border-0 bg-transparent shadow-none focus:ring-1 focus:ring-ring px-1.5 rounded-sm w-full" data-testid={`select-tax-${l.xeroKey}`}>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {rates.map((r) => (
                <SelectItem key={r.taxType} value={r.taxType}>{r.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        );
      },
    });
    cols.push({
      key: "account", header: "Account", width: 128, truncate: false,
      cell: (l) => {
        const value = lineXeroOverrides[l.xeroKey]?.account || "";
        return xeroAccounts.length > 0 ? (
          <Select
            value={value || "__none__"}
            onValueChange={(v) => setXeroByKey(l.xeroKey, { account: v === "__none__" ? null : v })}
          >
            <SelectTrigger className="h-7 text-table border-0 bg-transparent shadow-none focus:ring-1 focus:ring-ring px-1.5 rounded-sm w-full" data-testid={`select-account-${l.xeroKey}`}>
              <SelectValue placeholder="— Account —" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="__none__"><span className="text-muted-foreground">— Default —</span></SelectItem>
              {xeroAccounts.map((acc) => (
                <SelectItem key={acc.code} value={acc.code}>{acc.code} — {acc.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        ) : (
          <input
            value={value}
            onChange={(e) => setXeroByKey(l.xeroKey, { account: e.target.value || null })}
            placeholder="Account"
            className="w-full h-7 px-1.5 text-table bg-transparent border-0 outline-none focus:ring-1 focus:ring-ring rounded-sm placeholder:text-muted-foreground/30"
            data-testid={`input-account-${l.xeroKey}`}
          />
        );
      },
    });
    if (isColVisible("amountExTax"))
      cols.push({ key: "amountExTax", header: "Ex Tax", align: "right", width: 112, cell: (l) => formatCurrency(exOf(l.claimAmt)) });
    if (isColVisible("amountTax"))
      cols.push({ key: "amountTax", header: "Tax", align: "right", width: 96, cell: (l) => formatCurrency(l.claimAmt - exOf(l.claimAmt)) });
    if (isColVisible("amountIncTax"))
      cols.push({ key: "amountIncTax", header: "Inc Tax", align: "right", width: 112, className: "font-medium", cell: (l) => formatCurrency(l.claimAmt) });
    return cols;
  };

  // Section header bar shared by every sub-section: accent dot, label, and a
  // right-hand slot for the section total, its action, or a collapse chevron.
  // One bar so the sections can't drift apart the way the grids had.
  const sectionHeader = (opts: {
    label: string;
    /** "card" titles a whole card; "section" titles a band inside one. */
    variant?: "card" | "section";
    right?: ReactNode;
    icon?: ReactNode;
    onToggle?: () => void;
    collapsed?: boolean;
    testId?: string;
  }) => (
    <div
      className={cn(
        "flex items-center justify-between px-3 gap-2 border-b border-border/50",
        opts.variant === "card" ? "h-9 bg-card" : "h-8 bg-muted/40",
        opts.onToggle && "cursor-pointer",
      )}
      onClick={opts.onToggle}
      data-testid={opts.testId}
    >
      <div className="flex items-center gap-2 min-w-0">
        {opts.icon}
        <span
          className={cn(
            "truncate",
            opts.variant === "card"
              ? "text-xs font-semibold text-foreground uppercase tracking-wide"
              : "text-xs font-medium text-muted-foreground",
          )}
        >
          {opts.label}
        </span>
      </div>
      <div className="flex items-center gap-2 flex-shrink-0">
        {opts.right}
        {opts.collapsed !== undefined &&
          (opts.collapsed ? (
            <ChevronDown className="h-3.5 w-3.5 text-muted-foreground" />
          ) : (
            <ChevronUp className="h-3.5 w-3.5 text-muted-foreground" />
          ))}
      </div>
    </div>
  );

  // The action that opens a picker, sized to sit in a section header.
  const sectionAction = (label: string, onClick: () => void, testId: string) => (
    <button
      type="button"
      onClick={(e) => { e.stopPropagation(); onClick(); }}
      className="h-6 px-2 text-xs border rounded-md hover-elevate active-elevate-2 flex items-center gap-1"
      data-testid={testId}
    >
      <Plus className="w-3 h-3" />
      {label}
    </button>
  );

  // Header treatment shared by every line grid on this page, matched to the
  // allowance grid (LineItemsTable): 9px uppercase semibold in muted-foreground
  // — literal 9px, not the `text-label` token, because tailwind-merge reads
  // `text-label` as a text-COLOUR utility and drops it in favour of the colour
  // class beside it (the same reason <TableHead>'s own text-label never lands)
  // under a hairline rule. No fill — --table-header-bg is 2% off white and
  // vanishes on a card. The rule must sit on the th, not the thead: the table
  // is border-separate, and that border model never paints row-group borders.
  const GRID_HEADER =
    "bg-transparent [&_th]:border-b [&_th]:border-border [&_th]:text-[9px] [&_th]:text-muted-foreground [&_th]:font-semibold";

  // All three grids stack in one document, so they share a resize namespace —
  // dragging a column on any of them keeps the whole invoice aligned.
  const renderClaimGrid = (lines: ClaimLine[], testId: string) => (
    <LineItemTable
      fixedLayout
      filler
      resizeNamespace="client-invoice-claim-lines"
      headerClassName={GRID_HEADER}
      data={lines}
      columns={claimLineColumns()}
      rowKey={(l) => l.key}
      testId={testId}
      rowTestId={(l) => `row-${testId}-${l.key}`}
      actions={(l) => (
        <button
          type="button"
          onClick={l.onRemove}
          className="text-muted-foreground hover:text-destructive"
        >
          <X className="w-3.5 h-3.5" />
        </button>
      )}
    />
  );



  // ── render ────────────────────────────────────────────────────────────────────

  return (
    <div className="flex flex-col h-full" data-testid="page-client-invoice-detail">
      <Form {...form}>
        <form onSubmit={form.handleSubmit(onSubmit)} className="flex flex-col h-full">
          {/* Unified header card */}
          <div className="mx-3 mt-3 rounded-lg border border-border bg-card flex-shrink-0 overflow-hidden">

            {/* Row 1 — Title & Actions */}
            <div className="h-8 flex items-center justify-between px-3 border-b border-border/50">
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={handleCancel}
                  className="h-6 w-6 flex items-center justify-center rounded-md hover-elevate active-elevate-2"
                  data-testid="button-back"
                >
                  <ArrowLeft className="h-3.5 w-3.5 text-muted-foreground" />
                </button>
                <h2 className="text-sm font-semibold" data-testid="text-page-title">
                  {isEditMode ? "Edit Invoice" : "Create Invoice"}
                </h2>
              </div>

              <div className="flex items-center gap-1.5">
                {isEditMode && (
                  <>
                    <button
                      type="button"
                      onClick={() => setInvoicePreviewOpen(true)}
                      className="h-6 w-auto px-2 text-xs border rounded-md hover-elevate active-elevate-2 flex items-center gap-1"
                      data-testid="button-preview-invoice"
                    >
                      <Eye className="w-3 h-3" />
                      <span>Preview</span>
                    </button>
                    <button
                      type="button"
                      onClick={handleDownloadInvoicePdf}
                      disabled={invoicePdfGenerating}
                      className="h-6 w-auto px-2 text-xs border rounded-md hover-elevate active-elevate-2 flex items-center gap-1"
                      data-testid="button-download-invoice-pdf"
                    >
                      {invoicePdfGenerating ? <Loader2 className="w-3 h-3 animate-spin" /> : <Download className="w-3 h-3" />}
                      <span>PDF</span>
                    </button>
                    <button
                      type="button"
                      onClick={handleOpenInvoiceSendModal}
                      className="h-6 w-auto px-2 text-xs border rounded-md hover-elevate active-elevate-2 flex items-center gap-1"
                      data-testid="button-email-invoice"
                    >
                      <Mail className="w-3 h-3" />
                      <span>Email</span>
                    </button>
                  </>
                )}
                <button
                  type="submit"
                  disabled={createMutation.isPending || updateMutation.isPending}
                  className="h-6 w-auto px-2 text-xs border rounded-md bg-primary text-white border-primary/20 hover:bg-primary/90 active-elevate-2 flex items-center gap-0.5"
                  data-testid="button-save-invoice"
                >
                  {(createMutation.isPending || updateMutation.isPending) ? (
                    <Loader2 className="w-3 h-3 animate-spin" />
                  ) : (
                    <FileText className="w-3 h-3" />
                  )}
                  <span>{isEditMode ? "Update" : "Create"} Invoice</span>
                </button>
              </div>
            </div>

            {/* Row 2 — Lilac summary strip */}
            <div className="bg-primary/10 flex items-center justify-between px-4 py-2 gap-6">
              <div className="flex items-center gap-5 text-xs">
                <div className="flex items-center gap-1.5" data-testid="header-summary-total">
                  <span className="text-muted-foreground">Total</span>
                  <span className="font-semibold">{formatCurrency(total)}</span>
                </div>
                <div className="w-px h-3.5 bg-primary/40" />
                <div className="flex items-center gap-1.5" data-testid="header-summary-paid">
                  <span className="text-muted-foreground">Paid</span>
                  <span className="font-semibold text-sage">{formatCurrency(paid)}</span>
                </div>
                <div className="w-px h-3.5 bg-primary/40" />
                <div className="flex items-center gap-1.5" data-testid="header-summary-due">
                  <span className="text-muted-foreground">Due</span>
                  <span className={cn(
                    "font-semibold",
                    due <= 0
                      ? "text-sage"
                      : paid > 0
                      ? "text-amber"
                      : "text-coral"
                  )}>{formatCurrency(due)}</span>
                </div>
              </div>

              <div className="flex items-center gap-1.5 flex-wrap">
                {isEditMode && invoice?.status === "draft" && (
                  <button
                    type="button"
                    onClick={() => sendInvoiceMutation.mutate()}
                    disabled={sendInvoiceMutation.isPending}
                    className="h-6 w-auto px-2 text-xs border rounded-md hover-elevate active-elevate-2 flex items-center gap-1"
                    data-testid="button-send-invoice"
                  >
                    <Send className="w-3 h-3" />
                    <span>Send Invoice</span>
                  </button>
                )}

                {/* Xero Sync toggle — shown in both create and edit mode; disabled when Xero not connected */}
                <Tooltip>
                    <TooltipTrigger asChild>
                      <div className={cn(
                        "relative flex items-center gap-1.5 px-2 h-6 border rounded-md text-xs",
                        xeroStatus?.connected
                          ? "text-status-info border-status-info/30"
                          : "text-muted-foreground border-border opacity-60 cursor-not-allowed"
                      )}>
                        <Switch
                          id="sendToXero"
                          checked={sendToXero}
                          onCheckedChange={xeroStatus?.connected ? setSendToXero : undefined}
                          disabled={!xeroStatus?.connected}
                          className="scale-75 data-[state=checked]:bg-status-info"
                          data-testid="toggle-send-to-xero"
                        />
                        <label htmlFor="sendToXero" className={cn("select-none whitespace-nowrap flex items-center gap-1", xeroStatus?.connected ? "cursor-pointer" : "cursor-not-allowed")}>
                          <SiXero className="w-3 h-3" />
                          Sync to Xero
                        </label>
                      </div>
                    </TooltipTrigger>
                    <TooltipContent>
                      {!xeroStatus?.connected
                        ? "Connect Xero in Settings to enable automatic sync"
                        : sendToXero
                        ? "Invoice will auto-sync to Xero on save"
                        : "Enable to auto-push this invoice to Xero on save"}
                    </TooltipContent>
                  </Tooltip>

                {/* Synced badge with Xero invoice number */}
                {isEditMode && invoice?.xeroInvoiceId && (
                  <span className="text-data text-status-success flex items-center gap-1 px-1.5 h-6 border border-sage/40 rounded-md bg-sage-light" data-testid="badge-synced-to-xero">
                    <SiXero className="w-3 h-3" />
                    {invoice.xeroInvoiceNumber ? `#${invoice.xeroInvoiceNumber}` : "Synced"}
                  </span>
                )}

                {/* Sync from Xero button — shown when xeroInvoiceId is set */}
                {isEditMode && invoice?.xeroInvoiceId && xeroStatus?.connected && (
                  <button
                    type="button"
                    onClick={() => pullFromXeroMutation.mutate()}
                    disabled={pullFromXeroMutation.isPending}
                    className="h-6 w-auto px-2 text-xs border rounded-md hover-elevate active-elevate-2 flex items-center gap-1 text-muted-foreground"
                    data-testid="button-sync-from-xero"
                  >
                    {pullFromXeroMutation.isPending ? (
                      <Loader2 className="w-3 h-3 animate-spin" />
                    ) : (
                      <RefreshCw className="w-3 h-3" />
                    )}
                    <span>Sync from Xero</span>
                  </button>
                )}

                {/* Manual push button — only shown when sendToXero is off and no xeroInvoiceId */}
                {isEditMode && xeroStatus?.connected && !invoice?.xeroInvoiceId && !sendToXero && (
                  <button
                    type="button"
                    onClick={handlePushToXero}
                    disabled={xeroPushing}
                    className="h-6 w-auto px-2 text-xs border rounded-md hover-elevate active-elevate-2 flex items-center gap-1 text-status-info border-status-info/30"
                    data-testid="button-send-to-xero"
                  >
                    {xeroPushing ? (
                      <Loader2 className="w-3 h-3 animate-spin" />
                    ) : (
                      <Send className="w-3 h-3" />
                    )}
                    <span>Push to Xero</span>
                  </button>
                )}
              </div>
            </div>

          </div>{/* end unified header card */}

          {/* Main Content */}
          <div className="flex-1 overflow-auto">
            <div className="max-w-4xl mx-auto px-3 py-3 space-y-3">

                {/* Card 1 — Invoice Info */}
                <div className="rounded-lg border border-border bg-card overflow-hidden">

                  {/* Section header */}
                  {sectionHeader({ label: "Invoice Info", variant: "card" })}

                  {/* Invoice Name + Number + Dates, with the recipient alongside —
                      an invoice header is "who" and "which invoice" read together,
                      not two stacked cards. */}
                  <div className="px-4 py-3 grid grid-cols-1 lg:grid-cols-3 gap-4">
                    <div className="lg:col-span-2 space-y-3">
                      <div className="grid grid-cols-3 gap-3">
                        <FormField
                          control={form.control}
                          name="name"
                          render={({ field }) => (
                            <FormItem className="col-span-2">
                              <FormLabel className="h-4 leading-none flex items-center text-[9px] text-muted-foreground uppercase tracking-wide font-semibold">Invoice Name*</FormLabel>
                              <FormControl>
                                <Input {...field} className="h-7 text-[11px]" data-testid="input-name" />
                              </FormControl>
                              <FormMessage />
                            </FormItem>
                          )}
                        />
                        {/* Invoice Number (auto-generated, override optional) */}
                        <FormField
                          control={form.control}
                          name="invoiceNumber"
                          render={({ field }) => (
                            <FormItem>
                              <FormLabel className="h-4 leading-none flex items-center gap-1.5 text-[9px] text-muted-foreground uppercase tracking-wide font-semibold">
                                Invoice Number
                                {!isEditMode && (
                                  <Tooltip>
                                    <TooltipTrigger asChild>
                                      <button
                                        type="button"
                                        onClick={() => setInvoiceNumberOverride((v) => !v)}
                                        className="text-muted-foreground hover:text-foreground"
                                      >
                                        <Pencil className="w-3 h-3" />
                                      </button>
                                    </TooltipTrigger>
                                    <TooltipContent>
                                      {invoiceNumberOverride ? "Use auto-generated" : "Override number"}
                                    </TooltipContent>
                                  </Tooltip>
                                )}
                                {!isEditMode && !invoiceNumberOverride && (
                                  <Tooltip>
                                    <TooltipTrigger asChild>
                                      <button
                                        type="button"
                                        onClick={() => {
                                          queryClient.invalidateQueries({
                                            queryKey: ["/api/client-invoices/next-number", selectedProjectId],
                                          });
                                        }}
                                        className="text-muted-foreground hover:text-foreground"
                                      >
                                        <RefreshCw className="w-3 h-3" />
                                      </button>
                                    </TooltipTrigger>
                                    <TooltipContent>Re-generate number</TooltipContent>
                                  </Tooltip>
                                )}
                              </FormLabel>
                              <FormControl>
                                <Input
                                  {...field}
                                  readOnly={isEditMode || !invoiceNumberOverride}
                                  className={cn(
                                    "h-7 text-[11px]",
                                    !invoiceNumberOverride && !isEditMode
                                      ? "text-muted-foreground cursor-default"
                                      : ""
                                  )}
                                  data-testid="input-invoice-number"
                                />
                              </FormControl>
                              <FormMessage />
                            </FormItem>
                          )}
                        />
                      </div>

                      {/* Invoice Date + Due Date + Type */}
                      <div className="grid grid-cols-3 gap-3">
                        <FormField
                          control={form.control}
                          name="invoiceDate"
                          render={({ field }) => (
                            <FormItem className="flex flex-col">
                              <FormLabel className="h-4 leading-none flex items-center text-[9px] text-muted-foreground uppercase tracking-wide font-semibold">Invoice Date</FormLabel>
                              <Popover open={invoiceDateOpen} onOpenChange={setInvoiceDateOpen}>
                                <PopoverTrigger asChild>
                                  <FormControl>
                                    <Button
                                      variant="outline"
                                      size="sm"
                                      className={cn(
                                        "h-7 min-h-7 w-full justify-start text-left font-normal text-[11px] px-2",
                                        "border-input bg-background hover:bg-background",
                                        !field.value && "text-muted-foreground"
                                      )}
                                      data-testid="button-invoice-date"
                                    >
                                      <CalendarIcon className="mr-1.5 h-3 w-3" />
                                      {field.value ? format(field.value, "d MMM yyyy") : "Pick a date"}
                                    </Button>
                                  </FormControl>
                                </PopoverTrigger>
                                <PopoverContent className="w-auto p-0">
                                  <div className="p-2 border-b">
                                    <button
                                      type="button"
                                      className="w-full h-7 px-2 text-xs rounded-md border border-border/60 bg-muted/40 hover-elevate text-left"
                                      onClick={() => { field.onChange(new Date()); setInvoiceDateOpen(false); }}
                                    >
                                      Today — {format(new Date(), "d MMM yyyy")}
                                    </button>
                                  </div>
                                  <Calendar
                                    mode="single"
                                    selected={field.value}
                                    onSelect={(d) => { field.onChange(d); setInvoiceDateOpen(false); }}
                                    initialFocus
                                  />
                                </PopoverContent>
                              </Popover>
                              <FormMessage />
                            </FormItem>
                          )}
                        />
                        <FormField
                          control={form.control}
                          name="dueDate"
                          render={({ field }) => (
                            <FormItem className="flex flex-col">
                              <FormLabel className="h-4 leading-none flex items-center text-[9px] text-muted-foreground uppercase tracking-wide font-semibold">Due Date</FormLabel>
                              <Popover open={dueDateOpen} onOpenChange={(open) => { setDueDateOpen(open); if (!open) setDueDateCustom(false); }}>
                                <PopoverTrigger asChild>
                                  <FormControl>
                                    <Button
                                      variant="outline"
                                      size="sm"
                                      className={cn(
                                        "h-7 min-h-7 w-full justify-start text-left font-normal text-[11px] px-2",
                                        "border-input bg-background hover:bg-background",
                                        !field.value && "text-muted-foreground"
                                      )}
                                      data-testid="button-due-date"
                                    >
                                      <CalendarIcon className="mr-1.5 h-3 w-3" />
                                      {field.value ? format(field.value, "d MMM yyyy") : "Pick a date"}
                                    </Button>
                                  </FormControl>
                                </PopoverTrigger>
                                <PopoverContent className="w-auto p-0" align="start">
                                  {!dueDateCustom ? (
                                    <div className="p-1 w-52">
                                      {[
                                        { label: "Due on receipt", days: 0 },
                                        { label: "7 days", days: 7 },
                                        { label: "14 days", days: 14 },
                                        { label: "30 days", days: 30 },
                                      ].map((opt) => {
                                        const base = form.getValues("invoiceDate") || new Date();
                                        const target = opt.days === 0 ? base : addDays(base, opt.days);
                                        return (
                                          <button
                                            key={opt.label}
                                            type="button"
                                            className="w-full h-8 px-2 text-sm rounded-md hover-elevate flex items-center justify-between gap-3"
                                            onClick={() => { field.onChange(target); setDueDateOpen(false); }}
                                            data-testid={`button-due-preset-${opt.days}`}
                                          >
                                            <span>{opt.label}</span>
                                            <span className="text-xs text-muted-foreground">{format(target, "d MMM")}</span>
                                          </button>
                                        );
                                      })}
                                      <div className="h-px bg-border my-1" />
                                      <button
                                        type="button"
                                        className="w-full h-8 px-2 text-sm rounded-md hover-elevate flex items-center justify-between gap-3"
                                        onClick={() => setDueDateCustom(true)}
                                        data-testid="button-due-custom"
                                      >
                                        <span>Custom…</span>
                                        <CalendarIcon className="h-3.5 w-3.5 text-muted-foreground" />
                                      </button>
                                      {field.value && (
                                        <button
                                          type="button"
                                          className="w-full h-8 px-2 text-sm rounded-md text-muted-foreground hover-elevate text-left"
                                          onClick={() => { field.onChange(undefined); setDueDateOpen(false); }}
                                        >
                                          Clear
                                        </button>
                                      )}
                                    </div>
                                  ) : (
                                    <div>
                                      <div className="p-1 border-b">
                                        <button
                                          type="button"
                                          className="h-8 px-2 text-sm rounded-md hover-elevate flex items-center gap-1.5 text-muted-foreground"
                                          onClick={() => setDueDateCustom(false)}
                                          data-testid="button-due-back"
                                        >
                                          <ArrowLeft className="h-3.5 w-3.5" /> Back
                                        </button>
                                      </div>
                                      <Calendar
                                        mode="single"
                                        selected={field.value}
                                        onSelect={(d) => { field.onChange(d); setDueDateOpen(false); setDueDateCustom(false); }}
                                        initialFocus
                                      />
                                    </div>
                                  )}
                                </PopoverContent>
                              </Popover>
                              <FormMessage />
                            </FormItem>
                          )}
                        />
                        <div className="flex flex-col space-y-2">
                          <span className="h-4 leading-none flex items-center text-[9px] text-muted-foreground uppercase tracking-wide font-semibold">Type</span>
                          <div className="flex items-center h-7 rounded-md border border-input overflow-hidden w-full bg-background">
                          <button
                            type="button"
                            onClick={() => setInvoiceType("progress_payments")}
                            className={cn(
                              "flex-1 h-full text-[11px] leading-none whitespace-nowrap transition-colors",
                              invoiceType === "progress_payments"
                                ? "bg-primary text-primary-foreground font-medium"
                                : "text-muted-foreground hover:text-foreground"
                            )}
                          >
                            Progress
                          </button>
                          <div className="w-px h-full bg-border" />
                          <button
                            type="button"
                            onClick={() => setInvoiceType("cost_plus")}
                            className={cn(
                              "flex-1 h-full text-[11px] leading-none whitespace-nowrap transition-colors",
                              invoiceType === "cost_plus"
                                ? "bg-primary text-primary-foreground font-medium"
                                : "text-muted-foreground hover:text-foreground"
                            )}
                          >
                            Cost Plus
                          </button>
                          </div>
                        </div>
                      </div>
                    </div>

                    {/* Bill To — static context, so it reads as a panel rather than
                        another card with its own header bar. */}
                    {(currentProject || clientContact) && (
                      <div className="rounded-md border border-border/60 bg-muted/30 px-3 py-2.5 space-y-2">
                        <div className="text-[9px] text-muted-foreground uppercase tracking-wide font-semibold">Bill To</div>
                        {clientContact && (
                          <div className="min-w-0">
                            <div className="text-[11px] font-semibold truncate">{clientContact.name}</div>
                            {clientContact.company && (
                              <div className="text-[11px] text-muted-foreground truncate">{clientContact.company}</div>
                            )}
                            {(clientContact.addressFormatted || clientContact.address) && (
                              <div className="text-[11px] text-muted-foreground truncate">{clientContact.addressFormatted || clientContact.address}</div>
                            )}
                          </div>
                        )}
                        {currentProject && (
                          <div className="min-w-0 pt-1.5 border-t border-border/50">
                            <div className="text-[9px] text-muted-foreground uppercase tracking-wide font-semibold">Project</div>
                            <div className="text-[11px] font-medium truncate">{(currentProject as any).name}</div>
                            {(currentProject as any).location && (
                              <div className="text-[11px] text-muted-foreground truncate">{(currentProject as any).location}</div>
                            )}
                          </div>
                        )}
                      </div>
                    )}
                  </div>


                  {/* Introduction — closes out the invoice header, collapsed by default */}
                  <div className="border-t border-border/50">
                    <div
                      className="h-8 flex items-center justify-between px-3 gap-2 border-b border-border/50 cursor-pointer bg-muted/40"
                      onClick={() => setIntroCollapsed((v) => !v)}
                    >
                      <div className="flex items-center gap-2">
                        <span className="text-xs font-medium">Introduction</span>
                      </div>
                      {introCollapsed ? (
                        <ChevronDown className="h-3.5 w-3.5 text-muted-foreground flex-shrink-0" />
                      ) : (
                        <ChevronUp className="h-3.5 w-3.5 text-muted-foreground flex-shrink-0" />
                      )}
                    </div>
                    {!introCollapsed && (
                      <div className="px-4 py-3">
                        <FormField
                          control={form.control}
                          name="introductionText"
                          render={({ field }) => (
                            <FormItem>
                              <FormControl>
                                <RichTextEditor
                                  content={field.value || ""}
                                  onChange={(html) => field.onChange(html)}
                                  placeholder="Enter introduction text..."
                                  data-testid="editor-introduction"
                                />
                              </FormControl>
                              <FormMessage />
                            </FormItem>
                          )}
                        />
                      </div>
                    )}
                  </div>

                </div>{/* end Card 1 — Invoice Info */}


                {/* Card 2 — Financials */}
                <div className="rounded-lg border border-border bg-card overflow-hidden">
                  {sectionHeader({ label: "Financials", variant: "card" })}

                {invoiceType === "progress_payments" && (
                  <>
                    {/* Contract Price sub-section */}
                    <div data-testid="section-contract-price">
                      <div className="h-8 flex items-center justify-between px-3 gap-2 border-b border-border/50 bg-muted/40">
                        <div className="flex items-center gap-2">
                          <span className="text-xs font-medium">Contract Price</span>
                          {!!getEffectiveContractPrice() && (
                            <Tooltip>
                              <TooltipTrigger asChild>
                                <Badge variant="secondary" className="flex items-center gap-1 text-xs">
                                  <Lock className="w-2.5 h-2.5" />
                                  Locked
                                </Badge>
                              </TooltipTrigger>
                              <TooltipContent>
                                Contract price is locked from the project's approved estimate
                              </TooltipContent>
                            </Tooltip>
                          )}
                        </div>
                        <div className="flex items-center gap-1.5">
                          {calculateContractPrice() > 0 && (
                            <span className="text-xs font-medium tabular-nums text-muted-foreground mr-1">
                              {formatCurrency(calculateContractPrice() / 100)}
                            </span>
                          )}
                          {/* Column picker */}
                          <Popover open={columnPickerOpen} onOpenChange={setColumnPickerOpen}>
                            <PopoverTrigger asChild>
                              <button
                                type="button"
                                className="h-7 w-7 flex items-center justify-center rounded-md hover-elevate active-elevate-2"
                                data-testid="button-column-picker"
                              >
                                <Settings2 className="h-3.5 w-3.5 text-muted-foreground" />
                              </button>
                            </PopoverTrigger>
                            <PopoverContent className="w-56 p-3" align="end">
                              <p className="text-xs font-medium mb-2 text-muted-foreground">
                                Columns — drag to reorder
                              </p>
                              <div className="space-y-1">
                                {columnConfig
                                  .slice()
                                  .sort((a, b) => a.order - b.order)
                                  .map((col) => {
                                    const def = ALL_COLUMNS.find((d) => d.id === col.id)!;
                                    return (
                                      <div
                                        key={col.id}
                                        draggable
                                        onDragStart={() => onDragStart(col.id)}
                                        onDragOver={(e) => onDragOver(col.id, e)}
                                        onDrop={() => onDrop(col.id)}
                                        className={cn(
                                          "flex items-center gap-2 p-1.5 rounded-md text-sm select-none",
                                          dragOverId === col.id
                                            ? "bg-accent"
                                            : "hover-elevate"
                                        )}
                                      >
                                        <GripVertical className="h-3 w-3 text-muted-foreground cursor-grab" />
                                        <Checkbox
                                          checked={def.required ? true : col.visible}
                                          disabled={def.required}
                                          onCheckedChange={() => toggleColumn(col.id)}
                                        />
                                        <span
                                          className={cn(
                                            "flex-1",
                                            def.required && "text-muted-foreground"
                                          )}
                                        >
                                          {def.label}
                                        </span>
                                        {def.required && (
                                          <Lock className="h-3 w-3 text-muted-foreground" />
                                        )}
                                      </div>
                                    );
                                  })}
                              </div>
                            </PopoverContent>
                          </Popover>
                        </div>
                      </div>{/* end contract price header */}

                      <div className="px-4 py-3 space-y-3">
                        {/* Progress claims need a contract: gate on the project's
                            selected estimate being marked as Contract. */}
                        {!hasContractEstimate && (
                          <div
                            className="flex items-start gap-2 rounded-md border px-3 py-2 text-sm"
                            style={{ borderColor: "hsl(var(--amber))", backgroundColor: "hsl(var(--amber-light))" }}
                            data-testid="banner-no-contract-estimate"
                          >
                            <Lock className="w-4 h-4 mt-0.5 shrink-0" style={{ color: "hsl(var(--amber))" }} />
                            <span>
                              Progress claims need a contract. Mark this project's estimate as{" "}
                              <strong>Contract</strong> in the Estimates tab to enable claiming.
                            </span>
                          </div>
                        )}

                        {/* Sent invoices are locked to the contract price at send time —
                            warn when the live estimate has since drifted. */}
                        {contractPriceDrifted && (
                          <div
                            className="flex items-start gap-2 rounded-md border px-3 py-2 text-sm"
                            style={{ borderColor: "hsl(var(--coral))", backgroundColor: "hsl(var(--coral-light))" }}
                            data-testid="banner-contract-price-drift"
                          >
                            <Lock className="w-4 h-4 mt-0.5 shrink-0" style={{ color: "hsl(var(--coral))" }} />
                            <span>
                              The contract price has changed since this invoice was sent
                              (now {formatCurrency((contractMetrics?.originalContractPriceIncGstCents ?? 0) / 100)},
                              invoiced at {formatCurrency((invoice?.lockedContractPrice ?? 0) / 100)}).
                              This invoice keeps the amount it was sent with.
                            </span>
                          </div>
                        )}

                        {/* Locked contract price display (read-only — sourced from contract estimate) */}
                        {(() => {
                          const baseCents = getEffectiveContractPrice();
                          const isLocked = !!invoice && invoice.status !== "draft" && invoice.lockedContractPrice != null;
                          return (
                            <div className="flex items-center gap-3 py-2 border-b">
                              <span className="text-xs text-muted-foreground uppercase tracking-wide">
                                {isLocked ? "Contract Price (locked at send)" : "Contract Price"}
                              </span>
                              <span className="font-semibold text-sm" data-testid="text-locked-contract-price">
                                {baseCents ? formatCurrency(baseCents / 100) : (
                                  <span className="text-muted-foreground italic">Not set</span>
                                )}
                              </span>
                              <span className="text-xs text-muted-foreground italic">
                                {isLocked ? "frozen when the invoice was sent (inc GST)" : "from contract estimate (inc GST)"}
                              </span>
                            </div>
                          );
                        })()}

                        {/* Claim rows table */}
                        {contractClaimRows.length > 0 ? (
                          <>
                            {(() => {
                              const contractRowCents = getContractClaimRowCents();
                              return renderClaimGrid(
                                contractClaimRows.map((row) => ({
                                  key: row.id,
                                  xeroKey: lineAccountKey("contract", row.id),
                                  name: (
                                    <Input
                                      value={row.name}
                                      onChange={(e) => updateContractClaimRow(row.id, "name", e.target.value)}
                                      className="h-7 text-table border-0 bg-transparent shadow-none focus-visible:ring-1 focus-visible:ring-ring px-1.5 rounded-sm placeholder:text-muted-foreground/30"
                                      placeholder="Claim name"
                                    />
                                  ),
                                  description: (
                                    <Input
                                      value={row.description}
                                      onChange={(e) => updateContractClaimRow(row.id, "description", e.target.value)}
                                      className="h-7 text-table border-0 bg-transparent shadow-none focus-visible:ring-1 focus-visible:ring-ring px-1.5 rounded-sm placeholder:text-muted-foreground/30"
                                      placeholder="Description"
                                    />
                                  ),
                                  claimPercentCell: (
                                    <Input
                                      type="number"
                                      min="0"
                                      // Contract claim rows live in the contract_claim_rows jsonb
                                      // column and are validated by a bare z.number(), so fractional
                                      // claims (7.5% progress payments) are storable. Without an
                                      // explicit step, type="number" defaults to step="1" and the
                                      // browser treats 7.5 as a stepMismatch.
                                      step="0.01"
                                      value={row.claimPercent}
                                      onChange={(e) =>
                                        updateContractClaimRow(row.id, "claimPercent", parseFloat(e.target.value) || 0)
                                      }
                                      className="h-7 w-16 text-right text-table ml-auto border-0 bg-transparent shadow-none focus-visible:ring-1 focus-visible:ring-ring px-1.5 rounded-sm"
                                    />
                                  ),
                                  claimAmt: (contractRowCents[row.id] ?? 0) / 100,
                                  onRemove: () => removeContractClaimRow(row.id),
                                })),
                                "contract-claim-lines",
                              );
                            })()}
                          </>
                        ) : (
                          <p className="text-table text-muted-foreground text-center py-2">
                            {hasContractEstimate
                              ? 'No claim rows yet. Click "Add Claim Row" to begin.'
                              : "Claiming is disabled until an estimate is marked as Contract."}
                          </p>
                        )}

                        <div className="mt-1 flex items-center gap-3">
                          {contractClaimRows.length < 5 && (
                            <button
                              type="button"
                              onClick={addContractClaimRow}
                              className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors"
                              data-testid="button-add-claim-row"
                            >
                              <Plus className="w-3.5 h-3.5" />
                              Add Claim Row
                            </button>
                          )}
                          {otherInvoicesUsedPercent > 0 && (
                            <span className="text-xs text-muted-foreground/60">
                              {remainingClaimPercent}% remaining across invoices
                            </span>
                          )}
                        </div>

                        {contractClaimRows.length > 0 && (() => {
                          const claimAmt = calculateContractPrice() / 100;
                          const exTax = claimAmt / (1 + GST_RATE);
                          const tax = claimAmt - exTax;
                          return (
                            <div className="flex justify-end pt-2 mt-1 border-t border-border/50">
                              <div className="space-y-0.5 min-w-[210px]">
                                <div className="flex justify-between gap-8 text-xs text-muted-foreground">
                                  <span>Amount ex GST</span>
                                  <span className="tabular-nums">{formatCurrency(exTax)}</span>
                                </div>
                                <div className="flex justify-between gap-8 text-xs text-muted-foreground">
                                  <span>GST (10%)</span>
                                  <span className="tabular-nums">{formatCurrency(tax)}</span>
                                </div>
                                <div className="flex justify-between gap-8 text-sm font-semibold border-t border-border/50 pt-1">
                                  <span>Total inc GST</span>
                                  <span className="tabular-nums">{formatCurrency(claimAmt)}</span>
                                </div>
                              </div>
                            </div>
                          );
                        })()}
                      </div>{/* end contract price content */}
                    </div>{/* end contract price sub-section */}

                    {/* Variations sub-section */}
                    <div className="border-t border-border/50" data-testid="section-variations">
                      {sectionHeader({
                        label: "Variations",
                        right: (
                          <>
                            {selectedVariationIds.length > 0 && (
                              <span className="text-xs font-medium tabular-nums text-muted-foreground">
                                {formatCurrency(calculateVariationsTotal() / 100)}
                              </span>
                            )}
                            {sectionAction(
                              selectedVariationIds.length === 0 ? "Select Variations" : "Add",
                              () => setVariationsModalOpen(true),
                              "button-select-variations",
                            )}
                          </>
                        ),
                      })}

                      {/* Nothing selected renders no body — the header carries the
                          action, so an unused section costs one row, not a panel. */}
                      {selectedVariationIds.length > 0 && (
                        <div className="px-4 py-3">
                          <>
                            {renderClaimGrid(
                              getSelectedVariations().map((variation) => {
                                // Can't claim more than the other invoices left behind.
                                const maxClaimPct = getVariationRemainingPercent(variation.id);
                                return {
                                  key: variation.id,
                                  xeroKey: lineAccountKey("variation", variation.id),
                                  name: variation.variationNumber,
                                  description: variation.name,
                                  claimPercentCell: (
                                    <Input
                                      type="number"
                                      min="0"
                                      // invoice_variations.claim_percent is an integer column and
                                      // the Zod schema is .int(), so this field is whole-number
                                      // only — step="1" makes the browser agree. Round rather
                                      // than truncate: parseInt("7.5") silently billed 7, and
                                      // because the rounded value never changed, React left the
                                      // field reading "7.5" while state held 7. Rounding makes the
                                      // field snap to 8, so the stored number is the visible one.
                                      step="1"
                                      max={maxClaimPct}
                                      value={variationClaims[variation.id] ?? 100}
                                      onChange={(e) =>
                                        setVariationClaims((prev) => ({
                                          ...prev,
                                          [variation.id]: Math.min(
                                            maxClaimPct,
                                            Math.round(parseFloat(e.target.value)) || 0,
                                          ),
                                        }))
                                      }
                                      className="h-7 w-16 text-right text-table border-0 bg-transparent shadow-none focus-visible:ring-1 focus-visible:ring-ring ml-auto"
                                    />
                                  ),
                                  claimAmt: getVariationClaimCents(variation) / 100,
                                  onRemove: () =>
                                    setSelectedVariationIds((prev) => prev.filter((id) => id !== variation.id)),
                                };
                              }),
                              "variation-claim-lines",
                            )}
                            <div className="flex items-center justify-end gap-6 pt-2 border-t text-sm">
                              <span className="text-muted-foreground">
                                {showAmountsIncTax ? "Amount inc Tax:" : "Amount ex Tax:"}
                              </span>
                              <span className="font-semibold">
                                {showAmountsIncTax
                                  ? formatCurrency(calculateVariationsTotal() / 100)
                                  : formatCurrency(
                                      calculateVariationsTotal() / 100 / (1 + GST_RATE)
                                    )}
                              </span>
                            </div>
                          </>
                        </div>
                      )}{/* end variations content */}
                    </div>{/* end variations sub-section */}

                    {/* Allowances sub-section */}
                    <div className="border-t border-border/50" data-testid="section-allowances">
                      {sectionHeader({
                        label: "Allowances",
                        right: (
                          <>
                            {selectedAllowanceIds.length > 0 && (
                              <span className="text-xs font-medium tabular-nums text-muted-foreground">
                                {formatCurrency(calculateAllowancesTotal() / 100)}
                              </span>
                            )}
                            {sectionAction(
                              selectedAllowanceIds.length === 0 ? "Select Allowances" : "Add",
                              () => setAllowancesModalOpen(true),
                              "button-select-allowances",
                            )}
                          </>
                        ),
                      })}

                      {selectedAllowanceIds.length > 0 && (
                        <div className="px-4 py-3">
                          <>
                            {renderClaimGrid(
                              getSelectedAllowanceItems().map((item) => ({
                                key: item.id,
                                xeroKey: lineAccountKey("allowance", item.id),
                                name: (
                                  <div className="flex items-center gap-1.5">
                                    {item.name}
                                    <Badge variant="outline" className="text-data">
                                      {item.allowance}
                                    </Badge>
                                  </div>
                                ),
                                description: item.description,
                                claimPercentCell: (
                                  <Input
                                    type="number"
                                    min="0"
                                    // invoice_allowances.claim_percent is an integer column and
                                    // the Zod schema is .int() — same whole-number constraint,
                                    // and the same round-don't-truncate reasoning, as the
                                    // variation claim input above.
                                    step="1"
                                    max="100"
                                    value={allowanceClaims[item.id] ?? 100}
                                    onChange={(e) =>
                                      setAllowanceClaims((prev) => ({
                                        ...prev,
                                        [item.id]: Math.round(parseFloat(e.target.value)) || 0,
                                      }))
                                    }
                                    className="h-7 w-16 text-right text-table border-0 bg-transparent shadow-none focus-visible:ring-1 focus-visible:ring-ring ml-auto"
                                  />
                                ),
                                claimAmt: getAllowanceClaimCents(item) / 100,
                                onRemove: () =>
                                  setSelectedAllowanceIds((prev) => prev.filter((id) => id !== item.id)),
                              })),
                              "allowance-claim-lines",
                            )}
                            <div className="flex items-center justify-end gap-6 pt-2 border-t text-sm">
                              <span className="text-muted-foreground">
                                {showAmountsIncTax ? "Amount inc Tax:" : "Amount ex Tax:"}
                              </span>
                              <span className="font-semibold">
                                {showAmountsIncTax
                                  ? formatCurrency(calculateAllowancesTotal() / 100)
                                  : formatCurrency(
                                      calculateAllowancesTotal() / 100 / (1 + GST_RATE)
                                    )}
                              </span>
                            </div>
                          </>
                        </div>
                      )}{/* end allowances content */}
                    </div>{/* end allowances sub-section */}
                  </>
                )}

                {/* ── Cost Plus sections ── */}
                {invoiceType === "cost_plus" && (
                  <>
                    {/* Labour sub-section */}
                    <div className="border-t border-border/50" data-testid="section-labour">
                      <div className="h-8 flex items-center justify-between px-3 gap-2 border-b border-border/50 bg-muted/40">
                        <div className="flex items-center gap-2">
                          <span className="text-xs font-medium">Labour</span>
                          {selectedTimesheetIds.length > 0 && (
                            <span className="text-xs tabular-nums text-muted-foreground">
                              {formatCurrency(calculateLabourTotal() / 100)}
                            </span>
                          )}
                        </div>
                        <button
                          type="button"
                          onClick={() => { setModalTimesheetIds([...selectedTimesheetIds]); setLabourModalOpen(true); }}
                          className="h-6 px-2 text-xs border rounded-md hover-elevate active-elevate-2 flex items-center gap-1"
                        >
                          <Plus className="w-3 h-3" />
                          Import Labour
                        </button>
                      </div>
                      <div className="px-4 py-3">
                        {selectedTimesheetIds.length === 0 ? (
                          <p className="text-table text-muted-foreground text-center py-2">No labour entries selected.</p>
                        ) : (() => {
                          const rows = expandByCostCode(getSelectedTimesheets());
                                                    const showCostCode = labourBreakByCostCode;

                          if (labourDisplayMode === "individual") {
                            return (
                              <Table>
                                <TableHeader>
                                  <TableRow className="[&>th]:border-b-2 [&>th]:border-border [&>th]:text-foreground/75 [&>th]:font-semibold">
                                    <TableHead>Date</TableHead>
                                    <TableHead>Staff</TableHead>
                                    {showCostCode && <TableHead>Cost Code</TableHead>}
                                    <TableHead className="text-right w-16">Hours</TableHead>
                                    <TableHead className="text-right w-20">Rate</TableHead>
                                    <TableHead className="text-right w-24">Total</TableHead>
                                    <TableHead className="w-8 py-0" />
                                  </TableRow>
                                </TableHeader>
                                <TableBody>
                                  {rows.map((t: any) => {
                                    const cc = showCostCode ? costCodes.find((c: any) => c.id === t.costCodeId) : null;
                                    const rowKey = t._splitId ? `${t.id}-${t._splitId}` : t.id;
                                    return (
                                      <TableRow key={rowKey} className="h-9">
                                        <TableCell className="text-table py-1">{t.date ? format(new Date(t.date), "d MMM yyyy") : "—"}</TableCell>
                                        <TableCell className="text-table py-1">{getUserName(t.userId)}</TableCell>
                                        {showCostCode && <TableCell className="text-table py-1 text-muted-foreground">{cc?.code || cc?.name || "—"}</TableCell>}
                                        <TableCell className="text-right text-table py-1">{Number(t.duration).toFixed(1)}</TableCell>
                                        <TableCell className="text-right text-table py-1">{formatCurrency(Number(t.hourlyRate))}</TableCell>
                                        <TableCell className="text-right text-table font-medium py-1">{formatCurrency(Number(t.total))}</TableCell>
                                        <TableCell className="py-1 w-8">
                                          {!t._isSplit && (
                                            <button type="button" onClick={() => setSelectedTimesheetIds(prev => prev.filter(id => id !== t.id))} className="text-muted-foreground hover:text-destructive">
                                              <X className="w-3.5 h-3.5" />
                                            </button>
                                          )}
                                        </TableCell>
                                      </TableRow>
                                    );
                                  })}
                                </TableBody>
                              </Table>
                            );
                          }

                          if (labourDisplayMode === "by_user") {
                            const grouped = rows.reduce((acc: Record<string, any[]>, t: any) => {
                              const key = `${t.userId}${showCostCode ? `|${t.costCodeId || "none"}` : ""}`;
                              if (!acc[key]) acc[key] = [];
                              acc[key].push(t);
                              return acc;
                            }, {});
                            return (
                              <Table>
                                <TableHeader>
                                  <TableRow className="[&>th]:border-b-2 [&>th]:border-border [&>th]:text-foreground/75 [&>th]:font-semibold">
                                    <TableHead>Staff</TableHead>
                                    {showCostCode && <TableHead>Cost Code</TableHead>}
                                    <TableHead className="text-right w-20">Hours</TableHead>
                                    <TableHead className="text-right w-20">Avg Rate</TableHead>
                                    <TableHead className="text-right w-24">Total</TableHead>
                                  </TableRow>
                                </TableHeader>
                                <TableBody>
                                  {Object.entries(grouped).map(([key, group]) => {
                                    const g = group as any[];
                                    const userId = g[0].userId;
                                    const ccId = showCostCode ? g[0].costCodeId : null;
                                    const cc = showCostCode ? costCodes.find((c: any) => c.id === ccId) : null;
                                    const totalHours = g.reduce((s, t) => s + Number(t.duration), 0);
                                    const totalCost = g.reduce((s, t) => s + Number(t.total), 0);
                                    const avgRate = totalHours > 0 ? totalCost / totalHours : 0;
                                    return (
                                      <TableRow key={key} className="h-9">
                                        <TableCell className="text-table py-1 font-medium">{getUserName(userId)}</TableCell>
                                        {showCostCode && <TableCell className="text-table py-1 text-muted-foreground">{cc?.code || cc?.name || "—"}</TableCell>}
                                        <TableCell className="text-right text-table py-1">{totalHours.toFixed(1)}</TableCell>
                                        <TableCell className="text-right text-table py-1">{formatCurrency(avgRate)}</TableCell>
                                        <TableCell className="text-right text-table font-medium py-1">{formatCurrency(totalCost)}</TableCell>
                                      </TableRow>
                                    );
                                  })}
                                </TableBody>
                              </Table>
                            );
                          }

                          if (labourDisplayMode === "by_date") {
                            const grouped = rows.reduce((acc: Record<string, any[]>, t: any) => {
                              const dk = t.date ? format(new Date(t.date), "yyyy-MM-dd") : "no-date";
                              const key = showCostCode ? `${dk}|${t.costCodeId || "none"}` : dk;
                              if (!acc[key]) acc[key] = [];
                              acc[key].push(t);
                              return acc;
                            }, {});
                            const sorted = Object.entries(grouped).sort(([a], [b]) => a.localeCompare(b));
                            return (
                              <Table>
                                <TableHeader>
                                  <TableRow className="[&>th]:border-b-2 [&>th]:border-border [&>th]:text-foreground/75 [&>th]:font-semibold">
                                    <TableHead>Date</TableHead>
                                    <TableHead>Staff</TableHead>
                                    {showCostCode && <TableHead>Cost Code</TableHead>}
                                    <TableHead className="text-right w-20">Hours</TableHead>
                                    <TableHead className="text-right w-20">Avg Rate</TableHead>
                                    <TableHead className="text-right w-24">Total</TableHead>
                                  </TableRow>
                                </TableHeader>
                                <TableBody>
                                  {sorted.map(([key, group]) => {
                                    const g = group as any[];
                                    const dk = key.split("|")[0];
                                    const ccId = showCostCode ? g[0].costCodeId : null;
                                    const cc = showCostCode ? costCodes.find((c: any) => c.id === ccId) : null;
                                    const staffNames = Array.from(new Set(g.map((t: any) => getUserName(t.userId)))).join(", ");
                                    const totalHours = g.reduce((s, t) => s + Number(t.duration), 0);
                                    const totalCost = g.reduce((s, t) => s + Number(t.total), 0);
                                    const avgRate = totalHours > 0 ? totalCost / totalHours : 0;
                                    return (
                                      <TableRow key={key} className="h-9">
                                        <TableCell className="text-table py-1 tabular-nums">{dk !== "no-date" ? format(new Date(dk), "d MMM yyyy") : "—"}</TableCell>
                                        <TableCell className="text-xs py-1 text-muted-foreground max-w-[140px] truncate">{staffNames}</TableCell>
                                        {showCostCode && <TableCell className="text-table py-1 text-muted-foreground">{cc?.code || cc?.name || "—"}</TableCell>}
                                        <TableCell className="text-right text-table py-1">{totalHours.toFixed(1)}</TableCell>
                                        <TableCell className="text-right text-table py-1">{formatCurrency(avgRate)}</TableCell>
                                        <TableCell className="text-right text-table font-medium py-1">{formatCurrency(totalCost)}</TableCell>
                                      </TableRow>
                                    );
                                  })}
                                </TableBody>
                              </Table>
                            );
                          }

                          // Single total
                          const grouped = showCostCode ? rows.reduce((acc: Record<string, any[]>, t: any) => {
                            const key = t.costCodeId || "none";
                            if (!acc[key]) acc[key] = [];
                            acc[key].push(t);
                            return acc;
                          }, {}) : { all: rows };
                          return (
                            <Table>
                              <TableHeader>
                                <TableRow className="[&>th]:border-b-2 [&>th]:border-border [&>th]:text-foreground/75 [&>th]:font-semibold">
                                  <TableHead>Description</TableHead>
                                  {showCostCode && <TableHead>Cost Code</TableHead>}
                                  <TableHead className="text-right w-20">Hours</TableHead>
                                  <TableHead className="text-right w-20">Avg Rate</TableHead>
                                  <TableHead className="text-right w-24">Total</TableHead>
                                </TableRow>
                              </TableHeader>
                              <TableBody>
                                {Object.entries(grouped).map(([key, group]) => {
                                  const g = group as any[];
                                  const ccId = key !== "all" ? key : null;
                                  const cc = ccId ? costCodes.find((c: any) => c.id === ccId) : null;
                                  const totalHours = g.reduce((s, t) => s + Number(t.duration), 0);
                                  const totalCost = g.reduce((s, t) => s + Number(t.total), 0);
                                  const avgRate = totalHours > 0 ? totalCost / totalHours : 0;
                                  return (
                                    <TableRow key={key} className="h-9">
                                      <TableCell className="text-table py-1 font-medium">Labour</TableCell>
                                      {showCostCode && <TableCell className="text-table py-1 text-muted-foreground">{cc?.code || cc?.name || "—"}</TableCell>}
                                      <TableCell className="text-right text-table py-1">{totalHours.toFixed(1)}</TableCell>
                                      <TableCell className="text-right text-table py-1">{formatCurrency(avgRate)}</TableCell>
                                      <TableCell className="text-right text-table font-medium py-1">{formatCurrency(totalCost)}</TableCell>
                                    </TableRow>
                                  );
                                })}
                              </TableBody>
                            </Table>
                          );
                        })()}
                      </div>
                    </div>

                    {/* Bills sub-section */}
                    <div className="border-t border-border/50" data-testid="section-bills">
                      <div className="h-8 flex items-center justify-between px-3 gap-2 border-b border-border/50 bg-muted/40">
                        <div className="flex items-center gap-2">
                          <span className="text-xs font-medium">Bills</span>
                          {selectedBillIds.length > 0 && (
                            <span className="text-xs tabular-nums text-muted-foreground">
                              {formatCurrency(calculateBillsTotal() / 100)}
                            </span>
                          )}
                        </div>
                        <button
                          type="button"
                          onClick={() => { setModalBillIds([...selectedBillIds]); setBillsModalOpen(true); }}
                          className="h-6 px-2 text-xs border rounded-md hover-elevate active-elevate-2 flex items-center gap-1"
                        >
                          <Plus className="w-3 h-3" />
                          Import Bills
                        </button>
                      </div>
                      <div className="px-4 py-3">
                        {selectedBillIds.length === 0 ? (
                          <p className="text-table text-muted-foreground text-center py-2">No bills selected.</p>
                        ) : (
                          <Table>
                            <TableHeader>
                              <TableRow className="[&>th]:border-b-2 [&>th]:border-border [&>th]:text-foreground/75 [&>th]:font-semibold">
                                <TableHead>Bill No.</TableHead>
                                <TableHead>Supplier</TableHead>
                                <TableHead>Date</TableHead>
                                <TableHead className="text-right w-28">Total</TableHead>
                                <TableHead className="w-8 py-0" />
                              </TableRow>
                            </TableHeader>
                            <TableBody>
                              {getSelectedBills().map((b) => (
                                <TableRow key={b.id} className="h-9">
                                  <TableCell className="text-table font-medium py-1">{b.billNumber}</TableCell>
                                  <TableCell className="text-table text-muted-foreground py-1">{(b as any).supplierName || "—"}</TableCell>
                                  <TableCell className="text-table text-muted-foreground py-1">{(b as any).billDate ? format(new Date((b as any).billDate), "d MMM yyyy") : "—"}</TableCell>
                                  <TableCell className="text-right text-table font-medium py-1">{formatCurrency(b.total / 100)}</TableCell>
                                  <TableCell className="py-1 w-8">
                                    <button type="button" onClick={() => setSelectedBillIds(prev => prev.filter(id => id !== b.id))} className="text-muted-foreground hover:text-destructive">
                                      <X className="w-3.5 h-3.5" />
                                    </button>
                                  </TableCell>
                                </TableRow>
                              ))}
                            </TableBody>
                          </Table>
                        )}
                      </div>
                    </div>

                    {/* Selections sub-section */}
                    <div className="border-t border-border/50" data-testid="section-selections">
                      <div className="h-8 flex items-center justify-between px-3 gap-2 border-b border-border/50 bg-muted/40">
                        <div className="flex items-center gap-2">
                          <span className="text-xs font-medium">Selections</span>
                          {selectedSelectionOptionIds.length > 0 && (
                            <span className="text-xs tabular-nums text-muted-foreground">
                              {formatCurrency(calculateSelectionsTotal() / 100)}
                            </span>
                          )}
                        </div>
                        <button
                          type="button"
                          onClick={() => { setModalSelectionOptionIds([...selectedSelectionOptionIds]); setSelectionsModalOpen(true); }}
                          className="h-6 px-2 text-xs border rounded-md hover-elevate active-elevate-2 flex items-center gap-1"
                        >
                          <Plus className="w-3 h-3" />
                          Import Selections
                        </button>
                      </div>
                      <div className="px-4 py-3">
                        {selectedSelectionOptionIds.length === 0 ? (
                          <p className="text-table text-muted-foreground text-center py-2">No selections added.</p>
                        ) : (
                          <Table>
                            <TableHeader>
                              <TableRow className="[&>th]:border-b-2 [&>th]:border-border [&>th]:text-foreground/75 [&>th]:font-semibold">
                                <TableHead>Selection</TableHead>
                                <TableHead>Option</TableHead>
                                <TableHead className="text-right w-16">Qty</TableHead>
                                <TableHead className="w-16">Unit</TableHead>
                                <TableHead className="text-right w-28">Total</TableHead>
                                <TableHead className="w-8 py-0" />
                              </TableRow>
                            </TableHeader>
                            <TableBody>
                              {getSelectedSelectionOptions().map((o: any) => (
                                <TableRow key={o.id} className="h-9">
                                  <TableCell className="text-table py-1">{o.selectionName || "—"}</TableCell>
                                  <TableCell className="text-table font-medium py-1">{o.name}</TableCell>
                                  <TableCell className="text-right text-table py-1">{o.quantity}</TableCell>
                                  <TableCell className="text-table text-muted-foreground py-1">{o.unitType}</TableCell>
                                  <TableCell className="text-right text-table font-medium py-1">{formatCurrency((o.totalCost || 0) / 100)}</TableCell>
                                  <TableCell className="py-1 w-8">
                                    <button type="button" onClick={() => setSelectedSelectionOptionIds(prev => prev.filter(id => id !== o.id))} className="text-muted-foreground hover:text-destructive">
                                      <X className="w-3.5 h-3.5" />
                                    </button>
                                  </TableCell>
                                </TableRow>
                              ))}
                            </TableBody>
                          </Table>
                        )}
                      </div>
                    </div>
                  </>
                )}

                {/* Custom Lines sub-section */}
                <div className="border-t border-border/50" data-testid="section-custom-lines">
                  <div className="h-8 flex items-center justify-between px-3 gap-2 border-b border-border/50 bg-muted/40">
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-medium">Custom Lines</span>
                    </div>
                    <div className="flex items-center gap-1.5">
                      {customLines.length > 0 && (
                        <>
                          {xeroAccounts.length > 0 ? (
                            <Select value={bulkAccountCode || "__none__"} onValueChange={setBulkAccountCode}>
                              <SelectTrigger className="h-6 w-36 text-xs border-dashed" data-testid="select-bulk-xero-account">
                                <SelectValue placeholder="Xero account…" />
                              </SelectTrigger>
                              <SelectContent>
                                <SelectItem value="__none__"><span className="text-muted-foreground">— None —</span></SelectItem>
                                {xeroAccounts.map((acc) => (
                                  <SelectItem key={acc.code} value={acc.code}>{acc.code} — {acc.name}</SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                          ) : (
                            <input
                              value={bulkAccountCode}
                              onChange={(e) => setBulkAccountCode(e.target.value)}
                              placeholder="Account"
                              className="h-6 w-24 px-2 text-xs border border-dashed rounded-md bg-transparent focus:outline-none focus:ring-1 focus:ring-ring"
                              data-testid="input-bulk-xero-account"
                            />
                          )}
                          <button
                            type="button"
                            onClick={() => {
                              const code = bulkAccountCode === "__none__" ? null : bulkAccountCode || null;
                              setCustomLines(customLines.map((l) => ({ ...l, xeroAccountCode: code })));
                            }}
                            className="h-6 px-2 text-xs border rounded-md hover-elevate active-elevate-2 flex items-center gap-1"
                            data-testid="button-set-all-account"
                          >
                            Set all
                          </button>
                        </>
                      )}
                      <Popover open={customLineColPickerOpen} onOpenChange={setCustomLineColPickerOpen}>
                        <PopoverTrigger asChild>
                          <button type="button" className="h-6 w-6 flex items-center justify-center rounded hover-elevate text-muted-foreground">
                            <LayoutGrid className="w-3.5 h-3.5" />
                          </button>
                        </PopoverTrigger>
                        <PopoverContent className="w-44 p-2" align="end">
                          <p className="text-xs font-medium text-muted-foreground mb-2 px-1">Columns</p>
                          {ALL_COLUMNS.filter((c) => !c.required && ["description", "amountExTax", "amountTax", "amountIncTax"].includes(c.id)).map((col) => (
                            <button
                              key={col.id}
                              type="button"
                              className="flex items-center gap-2 w-full px-1 py-1 text-sm rounded hover-elevate"
                              onClick={() => toggleColumn(col.id as any)}
                            >
                              <div className={cn("w-4 h-4 rounded border flex items-center justify-center flex-shrink-0", isColVisible(col.id as any) ? "bg-primary border-primary" : "border-input")}>
                                {isColVisible(col.id as any) && <Check className="h-3 w-3 text-primary-foreground" />}
                              </div>
                              <span>{col.label}</span>
                            </button>
                          ))}
                        </PopoverContent>
                      </Popover>
                      <button
                        type="button"
                        onClick={addCustomLine}
                        className="h-6 px-2 text-xs border rounded-md hover-elevate active-elevate-2 flex items-center gap-1"
                        data-testid="button-add-custom-line"
                      >
                        <Plus className="w-3 h-3" />
                        <span>Add Line</span>
                      </button>
                    </div>
                  </div>
                  <div className="overflow-x-auto">
                    {/* Header carries "+ Add Line", so an empty section shows nothing —
                        same as Variations and Allowances. */}
                    {customLines.length === 0 ? null : (
                      <LineItemTable
                        fixedLayout
                        filler
                        resizeNamespace="client-invoice-custom-lines"
                        headerClassName={GRID_HEADER}
                        data={customLines}
                        rowKey={(_line, index) => index}
                        rowTestId={(_line, index) => `custom-line-${index}`}
                        testId="custom-lines"
                        columns={(() => {
                          const inputCls =
                            "h-7 text-table border-0 bg-transparent shadow-none focus-visible:ring-1 focus-visible:ring-ring px-1.5 rounded-sm placeholder:text-muted-foreground/30";
                          const cols: LineItemColumn<CustomLine>[] = [];
                          if (isColVisible("name"))
                            cols.push({
                              key: "name", header: "Name", width: 128, truncate: false,
                              cell: (line, index) => (
                                <Input
                                  value={line.name}
                                  onChange={(e) => updateCustomLine(index, "name", e.target.value)}
                                  placeholder="Name"
                                  className={inputCls}
                                />
                              ),
                            });
                          if (isColVisible("description"))
                            cols.push({
                              key: "description", header: "Description", width: 220, truncate: false,
                              cell: (line, index) => (
                                <Input
                                  value={line.description}
                                  onChange={(e) => updateCustomLine(index, "description", e.target.value)}
                                  placeholder="Description"
                                  className={inputCls}
                                />
                              ),
                            });
                          cols.push({
                            key: "costCode", header: "Cost Code", width: 144, truncate: false,
                            cell: (line, index) => (
                              <CostCodeSelect
                                value={line.costCodeId || ""}
                                onValueChange={(v) => updateCustomLine(index, "costCodeId", v || null)}
                                placeholder="— Cost code —"
                                allowNone
                                triggerClassName="h-7 text-table border-0 bg-transparent shadow-none focus:ring-1 focus:ring-ring px-1.5 rounded-sm w-full"
                              />
                            ),
                          });
                          cols.push({
                            key: "unit", header: "Unit", width: 80, truncate: false,
                            cell: (line, index) => (
                              <Input
                                value={line.unit || ""}
                                onChange={(e) => updateCustomLine(index, "unit", e.target.value)}
                                placeholder="unit"
                                className={inputCls}
                              />
                            ),
                          });
                          cols.push({
                            key: "quantity", header: "Qty", align: "right", width: 56, truncate: false,
                            cell: (line, index) => (
                              <Input
                                type="number"
                                value={line.quantity}
                                onChange={(e) => updateCustomLine(index, "quantity", parseFloat(e.target.value) || 0)}
                                className="h-7 w-14 text-right text-table border-0 bg-transparent shadow-none focus-visible:ring-1 focus-visible:ring-ring px-1.5 rounded-sm ml-auto"
                              />
                            ),
                          });
                          cols.push({
                            key: "unitPrice", header: "Unit Cost (ex GST)", align: "right", width: 96, truncate: false,
                            cell: (line, index) => (
                              <Input
                                type="number"
                                value={line.unitPrice}
                                onChange={(e) => updateCustomLine(index, "unitPrice", parseFloat(e.target.value) || 0)}
                                className="h-7 w-20 text-right text-table border-0 bg-transparent shadow-none focus-visible:ring-1 focus-visible:ring-ring px-1.5 rounded-sm ml-auto"
                              />
                            ),
                          });
                          cols.push({
                            key: "taxable", header: "Tax", width: 112, truncate: false,
                            cell: (line, index) => (
                              <button
                                type="button"
                                onClick={() => updateCustomLine(index, "taxable", !line.taxable)}
                                className="text-table text-muted-foreground hover:text-foreground whitespace-nowrap"
                              >
                                {line.taxable ? "GST on income" : "No Tax"}
                              </button>
                            ),
                          });
                          cols.push({
                            key: "account", header: "Account", width: 128, truncate: false,
                            cell: (line, index) =>
                              xeroAccounts.length > 0 ? (
                                <Select
                                  value={line.xeroAccountCode || "__none__"}
                                  onValueChange={(val) => updateCustomLine(index, "xeroAccountCode", val === "__none__" ? null : val)}
                                >
                                  <SelectTrigger className="h-7 text-table border-0 bg-transparent shadow-none focus:ring-1 focus:ring-ring px-1.5 rounded-sm w-full" data-testid={`select-account-${index}`}>
                                    <SelectValue placeholder="— Account —" />
                                  </SelectTrigger>
                                  <SelectContent>
                                    <SelectItem value="__none__"><span className="text-muted-foreground">— None —</span></SelectItem>
                                    {xeroAccounts.map((acc) => (
                                      <SelectItem key={acc.code} value={acc.code}>{acc.code} — {acc.name}</SelectItem>
                                    ))}
                                  </SelectContent>
                                </Select>
                              ) : (
                                <input
                                  value={line.xeroAccountCode || ""}
                                  onChange={(e) => updateCustomLine(index, "xeroAccountCode", e.target.value || null)}
                                  placeholder="Account"
                                  className="w-full h-7 px-1.5 text-table bg-transparent border-0 outline-none focus:ring-1 focus:ring-ring rounded-sm placeholder:text-muted-foreground/30"
                                  data-testid={`input-account-${index}`}
                                />
                              ),
                          });
                          // Prices are entered EX GST; GST is added on top for
                          // taxable lines (same convention as the totals/PDF/Xero).
                          if (isColVisible("amountExTax"))
                            cols.push({ key: "amountExTax", header: "Ex Tax", align: "right", width: 96, cell: (line) => formatCurrency(line.totalPrice) });
                          if (isColVisible("amountTax"))
                            cols.push({ key: "amountTax", header: "Tax $", align: "right", width: 80, cell: (line) => formatCurrency(line.taxable ? line.totalPrice * GST_RATE : 0) });
                          if (isColVisible("amountIncTax"))
                            cols.push({
                              key: "amountIncTax", header: "Inc Tax", align: "right", width: 96, className: "font-medium",
                              cell: (line) => formatCurrency(line.totalPrice + (line.taxable ? line.totalPrice * GST_RATE : 0)),
                            });
                          return cols;
                        })()}
                        actions={(_line, index) => (
                          <button
                            type="button"
                            onClick={() => deleteCustomLine(index)}
                            className="text-muted-foreground hover:text-destructive"
                            data-testid={`button-delete-custom-line-${index}`}
                          >
                            <X className="w-3.5 h-3.5" />
                          </button>
                        )}
                      />
                    )}
                  </div>{/* end custom lines content */}
                </div>{/* end custom lines sub-section */}

              {/* ── Xero posting ──
                  Every line needs an account before Xero will accept the
                  invoice, and only custom lines can carry one on the line
                  itself — so without this panel a progress-claim invoice
                  depends entirely on the company default. GST and tracking sit
                  here too: this is the last look before the money leaves.
                  Blank account = company default; blank tracking = the
                  project's own option. */}
              {xeroStatus?.connected && (() => {
                const lines = buildInvoiceLineBreakdown();
                if (lines.length === 0) return null;
                const defaultAccount = companySettings?.clientInvoiceDefaultXeroAccount || null;
                const unresolved = lines.filter((l) => !l.accountCode && !defaultAccount).length;
                const accountOptions = [...xeroAccounts]
                  .sort((a, b) => (a.name || "").localeCompare(b.name || ""))
                  .map((acc) => ({ value: acc.code, label: `${acc.code} — ${acc.name}` }));
                // Xero accepts at most two tracking categories per line.
                const cats = (xeroTrackingCategories ?? []).slice(0, 2);

                const accountCell = (value: string | null, onPick: (v: string | null) => void, testId: string) =>
                  accountOptions.length > 0 ? (
                    <SearchableSelect
                      value={value || ""}
                      onValueChange={(v) => onPick(v || null)}
                      allowClear
                      placeholder={defaultAccount ? `Default (${defaultAccount})` : "Account…"}
                      searchPlaceholder="Search accounts..."
                      emptyMessage="No accounts found."
                      triggerClassName={cn("w-44 h-7 text-[11px]", !value && !defaultAccount && "border-status-warning/60")}
                      data-testid={testId}
                      options={accountOptions}
                    />
                  ) : (
                    <input
                      value={value || ""}
                      onChange={(e) => onPick(e.target.value || null)}
                      placeholder="Account"
                      className="h-7 w-44 px-2 text-[11px] border rounded-md bg-transparent focus:outline-none focus:ring-1 focus:ring-ring"
                      data-testid={testId}
                    />
                  );

                const trackingCell = (
                  cat: any,
                  value: string,
                  onPick: (v: string) => void,
                  testId: string,
                ) => (
                  <SearchableSelect
                    value={value}
                    onValueChange={onPick}
                    allowClear
                    placeholder={cat.name}
                    searchPlaceholder={`Search ${cat.name}...`}
                    emptyMessage="No options found."
                    triggerClassName="w-36 h-7 text-[11px]"
                    data-testid={testId}
                    options={(cat.options ?? []).map((o: any) => ({ value: o.trackingOptionId, label: o.name }))}
                  />
                );

                return (
                  <div data-testid="xero-posting-panel">
                    {sectionHeader({
                      label: "Xero Posting",
                      icon: <SiXero className="w-3 h-3" />,
                      right:
                        unresolved > 0 ? (
                          <span className="text-xs text-status-warning flex items-center gap-1" data-testid="text-unresolved-accounts">
                            <AlertCircle className="w-3 h-3" />
                            {unresolved} line{unresolved === 1 ? "" : "s"} will fail
                          </span>
                        ) : undefined,
                    })}
                    <div className="px-3 py-2 overflow-x-auto">
                      {/* Set-all row — applies one field down every line. */}
                      <div className="flex items-center gap-2 pb-2 mb-1 border-b border-border/50">
                        <span className="text-[9px] uppercase tracking-wide font-semibold text-muted-foreground w-40 flex-shrink-0">
                          Set all
                        </span>
                        {accountCell(null, (v) => setXeroForAll({ account: v }), "select-all-lines-account")}
                        <div className="flex items-center rounded-md border border-input overflow-hidden h-7 flex-shrink-0">
                          <button type="button" onClick={() => setXeroForAll({ taxable: true })}
                            className="px-2 h-full text-[11px] text-muted-foreground hover:text-foreground" data-testid="button-all-gst">
                            GST
                          </button>
                          <div className="w-px h-full bg-border" />
                          <button type="button" onClick={() => setXeroForAll({ taxable: false })}
                            className="px-2 h-full text-[11px] text-muted-foreground hover:text-foreground" data-testid="button-all-nogst">
                            No GST
                          </button>
                        </div>
                        {cats.map((cat: any) =>
                          trackingCell(cat, "", (v) => setXeroForAll({ tracking: { [cat.trackingCategoryId]: v } }),
                            `select-all-tracking-${cat.trackingCategoryId}`),
                        )}
                      </div>

                      {lines.map((line) => {
                        const key = line.accountKey!;
                        const own = lineXeroOverrides[key] ?? {};
                        return (
                          <div key={key} className="flex items-center gap-2 py-0.5">
                            <span className="truncate w-40 flex-shrink-0 text-[11px] text-muted-foreground" title={line.description}>
                              {line.description}
                            </span>
                            {accountCell(line.accountCode ?? null, (v) => setXeroByKey(key, { account: v }), `select-line-account-${key}`)}
                            <button
                              type="button"
                              onClick={() => setXeroByKey(key, { taxable: !line.taxable })}
                              className={cn(
                                "h-7 px-2 text-[11px] rounded-md border flex-shrink-0 w-20",
                                line.taxable ? "border-input text-foreground" : "border-input text-muted-foreground",
                              )}
                              data-testid={`button-line-gst-${key}`}
                            >
                              {line.taxable ? "GST 10%" : "No GST"}
                            </button>
                            {cats.map((cat: any) =>
                              trackingCell(
                                cat,
                                own.tracking?.[cat.trackingCategoryId] ?? "",
                                (v) => setXeroByKey(key, { tracking: { ...(own.tracking ?? {}), [cat.trackingCategoryId]: v } }),
                                `select-line-tracking-${cat.trackingCategoryId}-${key}`,
                              ),
                            )}
                            <span className="ml-auto tabular-nums text-[11px] text-muted-foreground w-24 text-right flex-shrink-0">
                              {formatCurrency(line.amountIncCents / 100)}
                            </span>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                );
              })()}

              {/* ── Invoice Summary ── */}
              <div data-testid="summary-panel">
                <div className="bg-primary/10 px-4 py-3 flex items-center justify-between gap-4">
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-medium">Invoice Summary</span>
                  </div>
                  <div className="relative flex items-center gap-1.5 text-xs">
                      <span
                        className={cn(
                          "text-xs",
                          !showAmountsIncTax
                            ? "text-foreground font-medium"
                            : "text-muted-foreground"
                        )}
                      >
                        Ex GST
                      </span>
                      <Switch
                        checked={showAmountsIncTax}
                        onCheckedChange={setShowAmountsIncTax}
                        className="scale-75"
                      />
                      <span
                        className={cn(
                          "text-xs",
                          showAmountsIncTax
                            ? "text-foreground font-medium"
                            : "text-muted-foreground"
                        )}
                      >
                        Inc GST
                      </span>
                    </div>
                  </div>{/* end summary header strip */}
                  <div className="px-4 py-3">
                    <div className="grid grid-cols-5 gap-6">
                      {/* Left: Breakdown */}
                      <div className="col-span-3 space-y-1.5">
                        {invoiceType === "progress_payments" && contractClaimRows.length > 0 && (
                          <div className="flex justify-between text-sm">
                            <span className="text-muted-foreground">Contract Price</span>
                            <span className="font-medium tabular-nums">
                              {formatCurrency(calculateContractPrice() / 100)}
                            </span>
                          </div>
                        )}
                        {selectedVariationIds.length > 0 && (
                          <div className="flex justify-between text-sm">
                            <span className="text-muted-foreground">Variations</span>
                            <span className="font-medium tabular-nums">
                              {formatCurrency(calculateVariationsTotal() / 100)}
                            </span>
                          </div>
                        )}
                        {selectedAllowanceIds.length > 0 && (
                          <div className="flex justify-between text-sm">
                            <span className="text-muted-foreground">Allowances</span>
                            <span className="font-medium tabular-nums">
                              {formatCurrency(calculateAllowancesTotal() / 100)}
                            </span>
                          </div>
                        )}
                        {invoiceType === "cost_plus" && (
                          <>
                            {selectedTimesheetIds.length > 0 && (
                              <div className="flex justify-between text-sm">
                                <span className="text-muted-foreground">Labour</span>
                                <span className="font-medium tabular-nums">{formatCurrency(calculateLabourTotal() / 100)}</span>
                              </div>
                            )}
                            {selectedBillIds.length > 0 && (
                              <div className="flex justify-between text-sm">
                                <span className="text-muted-foreground">Bills</span>
                                <span className="font-medium tabular-nums">{formatCurrency(calculateBillsTotal() / 100)}</span>
                              </div>
                            )}
                            {selectedSelectionOptionIds.length > 0 && (
                              <div className="flex justify-between text-sm">
                                <span className="text-muted-foreground">Selections</span>
                                <span className="font-medium tabular-nums">{formatCurrency(calculateSelectionsTotal() / 100)}</span>
                              </div>
                            )}
                          </>
                        )}
                        {customLines.length > 0 && (
                          <div className="flex justify-between text-sm">
                            <span className="text-muted-foreground">Custom Lines</span>
                            <span className="font-medium tabular-nums">
                              {formatCurrency(calculateCustomLinesSubtotal())}
                            </span>
                          </div>
                        )}
                        {invoiceType === "cost_plus" && (
                          <div className="flex justify-between text-sm items-center pt-0.5">
                            <div className="flex items-center gap-1.5">
                              <span className="text-muted-foreground">Markup</span>
                              <FormField
                                control={form.control}
                                name="markupPercent"
                                render={({ field }) => (
                                  <FormItem className="m-0 p-0">
                                    <FormControl>
                                      <div className="flex items-center gap-0.5">
                                        <Input
                                          type="number"
                                          min="0"
                                          max="100"
                                          {...field}
                                          value={field.value ?? ""}
                                          onChange={(e) => field.onChange(e.target.value ? parseFloat(e.target.value) : undefined)}
                                          className="h-6 w-14 text-right text-xs border-0 bg-muted/50 shadow-none focus-visible:ring-1 focus-visible:ring-ring px-1 rounded-sm"
                                          data-testid="input-markup-percent"
                                        />
                                        <span className="text-xs text-muted-foreground">%</span>
                                      </div>
                                    </FormControl>
                                  </FormItem>
                                )}
                              />
                            </div>
                            <span className="font-medium tabular-nums">{formatCurrency(calculateMarkup())}</span>
                          </div>
                        )}
                        <div className="border-t border-border/30 pt-2 mt-2 space-y-1.5">
                          <div className="flex justify-between text-sm">
                            <span className="text-muted-foreground">Amount ex GST</span>
                            <span className="font-medium tabular-nums">{formatCurrency(amountExTax())}</span>
                          </div>
                          <div className="border-t border-border/30 pt-1.5 flex justify-between text-sm">
                            <span className="text-muted-foreground">GST (10%)</span>
                            <span className="font-medium tabular-nums">{formatCurrency(amountTax())}</span>
                          </div>
                        </div>
                      </div>

                      {/* Divider */}
                      <div className="col-span-2 border-l pl-6 flex flex-col justify-center">
                        <p className="text-xs text-muted-foreground mb-1">Total inc GST</p>
                        <p
                          className="text-3xl font-bold tracking-tight"
                          data-testid="text-summary-total"
                        >
                          {formatCurrency(total)}
                        </p>
                        {isEditMode && (
                          <div className="mt-3 pt-3 border-t space-y-1.5">
                            {paid > 0 && (
                              <div className="flex justify-between text-sm">
                                <span className="text-muted-foreground">Paid</span>
                                <span className="font-medium text-sage tabular-nums">
                                  {formatCurrency(paid)}
                                </span>
                              </div>
                            )}
                            <div className={cn(
                              "flex justify-between text-sm font-semibold",
                              paid > 0 && "border-t pt-1.5"
                            )}>
                              <span className={cn(
                                due <= 0
                                  ? "text-sage"
                                  : paid > 0
                                  ? "text-amber"
                                  : "text-coral"
                              )}>
                                {due <= 0 ? "Paid in Full" : "Balance Due"}
                              </span>
                              <span
                                className={cn(
                                  "tabular-nums",
                                  due <= 0
                                    ? "text-sage"
                                    : paid > 0
                                    ? "text-amber"
                                    : "text-coral"
                                )}
                                data-testid="text-summary-due"
                              >
                                {due <= 0 ? formatCurrency(total) : formatCurrency(due)}
                              </span>
                            </div>
                          </div>
                        )}
                      </div>
                    </div>
                  </div>{/* end summary content */}
              </div>{/* end summary-panel */}
              </div>{/* end Act 2: Money */}

                {/* Payments — money, so it sits with the financials, not adrift
                   at the bottom of the page. */}
                {isEditMode && (
                  <div className="rounded-lg border border-border bg-card overflow-hidden" data-testid="section-payments-history">
                    <div className="h-8 flex items-center justify-between px-3 gap-2 border-b border-border/50">
                      <div className="flex items-center gap-2">
                        <span className="text-xs font-medium">Payments ({payments.length})</span>
                      </div>
                      <button
                        type="button"
                        onClick={() => setPaymentDialogOpen(true)}
                        className="h-6 px-2 text-xs border rounded-md bg-primary text-white border-primary/20 hover:bg-primary/90 active-elevate-2 flex items-center gap-0.5"
                        data-testid="button-record-payment"
                      >
                        <Plus className="w-3 h-3" />
                        <span>Record Payment</span>
                      </button>
                    </div>
                    <div className="px-4 py-3">
                      {payments.length > 0 ? (
                        <Table>
                          <TableHeader>
                            <TableRow className="[&>th]:border-b-2 [&>th]:border-border [&>th]:text-foreground/75 [&>th]:font-semibold">
                              <TableHead>Date</TableHead>
                              <TableHead className="text-right">Amount</TableHead>
                              <TableHead>Method</TableHead>
                              <TableHead>Reference</TableHead>
                              <TableHead className="w-16 py-0 px-2" />
                            </TableRow>
                          </TableHeader>
                          <TableBody>
                            {payments.map((payment) => (
                              <TableRow key={payment.id} className={cn("h-9", (payment as any).isVoided && "opacity-50")}>
                                <TableCell className="text-table px-2">
                                  {payment.paymentDate
                                    ? format(new Date(payment.paymentDate), "d MMM yyyy")
                                    : "-"}
                                </TableCell>
                                <TableCell className={cn("text-right text-sm font-medium px-2", (payment as any).isVoided && "line-through")}>
                                  {formatCurrency(payment.amount / 100)}
                                </TableCell>
                                <TableCell className="text-table text-muted-foreground px-2">
                                  {payment.paymentMethod || "-"}
                                </TableCell>
                                <TableCell className="text-table text-muted-foreground px-2">
                                  {payment.reference || "-"}
                                </TableCell>
                                <TableCell className="px-2 w-16">
                                  {(payment as any).isVoided ? (
                                    <Badge variant="secondary" className="text-data h-4 px-1.5">Voided</Badge>
                                  ) : (
                                    <button
                                      type="button"
                                      onClick={() => voidPaymentMutation.mutate(payment.id)}
                                      disabled={voidPaymentMutation.isPending}
                                      className="h-5 px-1.5 text-data border rounded text-muted-foreground hover-elevate flex items-center gap-0.5"
                                      data-testid={`button-void-payment-${payment.id}`}
                                    >
                                      Void
                                    </button>
                                  )}
                                </TableCell>
                              </TableRow>
                            ))}
                          </TableBody>
                        </Table>
                      ) : (
                        <p className="text-table text-muted-foreground text-center py-2">
                          No payments recorded
                        </p>
                      )}
                    </div>
                  </div>
                )}

              {/* ── Act 3: Presentation — everything that shapes how the invoice
                   reads to the client. All collapsible, all closed by default. ── */}
              <div className="rounded-lg border border-border bg-card overflow-hidden">
                {/* Closing Text sub-section */}
                <div>
                  <div
                    className="h-8 flex items-center justify-between px-3 gap-2 border-b border-border/50 cursor-pointer bg-muted/40"
                    onClick={() => setClosingCollapsed((v) => !v)}
                  >
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-medium">Closing Text</span>
                    </div>
                    {closingCollapsed ? (
                      <ChevronDown className="h-3.5 w-3.5 text-muted-foreground flex-shrink-0" />
                    ) : (
                      <ChevronUp className="h-3.5 w-3.5 text-muted-foreground flex-shrink-0" />
                    )}
                  </div>
                  {!closingCollapsed && (
                    <div className="px-4 py-3">
                      <FormField
                        control={form.control}
                        name="closingText"
                        render={({ field }) => (
                          <FormItem>
                            <FormControl>
                              <RichTextEditor
                                content={field.value || ""}
                                onChange={(html) => field.onChange(html)}
                                placeholder="Enter closing text..."
                                data-testid="editor-closing"
                              />
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                    </div>
                  )}
                </div>

                {/* Terms & Conditions sub-section */}
                <div className="border-t border-border/50">
                  <div
                    className="h-8 flex items-center justify-between px-3 gap-2 border-b border-border/50 cursor-pointer bg-muted/40"
                    onClick={() => setTermsCollapsed((v) => !v)}
                  >
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-medium">Terms &amp; Conditions</span>
                    </div>
                    {termsCollapsed ? (
                      <ChevronDown className="h-3.5 w-3.5 text-muted-foreground flex-shrink-0" />
                    ) : (
                      <ChevronUp className="h-3.5 w-3.5 text-muted-foreground flex-shrink-0" />
                    )}
                  </div>
                  {!termsCollapsed && (
                    <div className="px-4 py-3 space-y-2">
                      {/* Template selector */}
                      {companySettings?.termsTemplates && companySettings.termsTemplates.length > 0 && (
                        <div className="flex items-center gap-2">
                          <span className="text-xs text-muted-foreground flex-shrink-0">Load template:</span>
                          <Select
                            value={selectedTemplateId}
                            onValueChange={(id) => {
                              setSelectedTemplateId(id);
                              const tpl = companySettings.termsTemplates!.find(t => t.id === id);
                              if (tpl) setTermsAndConditions(tpl.content);
                            }}
                          >
                            <SelectTrigger className="h-7 text-xs flex-1">
                              <SelectValue placeholder="Choose a template..." />
                            </SelectTrigger>
                            <SelectContent>
                              {companySettings.termsTemplates.map(tpl => (
                                <SelectItem key={tpl.id} value={tpl.id}>{tpl.name}</SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </div>
                      )}
                      {/* Editable T&C textarea */}
                      <Textarea
                        value={termsAndConditions}
                        onChange={(e) => setTermsAndConditions(e.target.value)}
                        rows={8}
                        placeholder={
                          companySettings?.termsTemplates && companySettings.termsTemplates.length > 0
                            ? "Select a template above, or type your terms and conditions..."
                            : companySettings?.termsAndConditions
                            ? "Load from company defaults or type custom terms..."
                            : "Type the terms and conditions for this invoice..."
                        }
                        className="text-sm resize-y"
                        data-testid="textarea-terms-and-conditions"
                      />
                      {/* Load from company defaults */}
                      {companySettings?.termsAndConditions && !termsAndConditions && (
                        <button
                          type="button"
                          onClick={() => setTermsAndConditions(companySettings.termsAndConditions!)}
                          className="text-xs text-primary hover:underline"
                          data-testid="button-load-company-terms"
                        >
                          Load company default terms
                        </button>
                      )}
                    </div>
                  )}
                </div>

                {/* Attachments sub-section */}
                <div className="border-t border-border/50" data-testid="section-attachments">
                  {sectionHeader({
                    label: "Attachments",
                    icon: <Paperclip className="h-3 w-3 text-muted-foreground flex-shrink-0" />,
                    onToggle: () => setAttachmentsCollapsed((v) => !v),
                    collapsed: attachmentsCollapsed,
                  })}
                  {!attachmentsCollapsed && (
                    <div className="px-4 py-3">
                      <p className="text-table text-muted-foreground text-center py-2">
                        No attachments
                      </p>
                    </div>
                  )}
                </div>
              </div>{/* end Act 3: Presentation */}


            </div>
          </div>

          {/* Footer for sent/partial */}
          {isEditMode && (invoice?.status === "sent" || invoice?.status === "partial") && (
            <div className="h-9 bg-background flex items-center justify-end px-2 border-t border-border flex-shrink-0">
              <button
                type="button"
                onClick={() => setPaymentDialogOpen(true)}
                className="h-6 w-auto px-2 text-xs border rounded-md bg-primary text-white border-primary/20 flex items-center gap-1"
                data-testid="button-record-payment-footer"
              >
                <DollarSign className="w-3 h-3" />
                <span>Record Payment</span>
              </button>
            </div>
          )}
        </form>
      </Form>

      {/* ── Variations Modal ── */}
      <Dialog open={variationsModalOpen} onOpenChange={setVariationsModalOpen}>
        <DialogContent className="max-w-2xl" data-testid="dialog-variations">
          <DialogHeader>
            <DialogTitle>Select Variations</DialogTitle>
            <DialogDescription>
              Only approved variations can be added to an invoice.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-2 max-h-96 overflow-y-auto">
            {variationsLoading ? (
              <div className="text-center py-8"><Loader2 className="w-5 h-5 animate-spin mx-auto text-muted-foreground" /></div>
            ) : variations.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-8">
                No variations found for this project.
              </p>
            ) : (
              variations.map((v) => {
                const isApproved = v.status === "approved";
                const isSelected = selectedVariationIds.includes(v.id);
                const claimedElsewhere = otherInvoiceVariationClaims[v.id];
                const fullyClaimed = isVariationFullyClaimedElsewhere(v.id);
                const remaining = getVariationRemainingPercent(v.id);
                // A variation billed in full on another invoice can't be added
                // again. It stays visible (with the invoice that holds it) so
                // "where did VO-017 go?" answers itself. Already-selected rows
                // stay togglable so a bad link can always be removed.
                const isLocked = fullyClaimed && !isSelected;
                const canToggle = isApproved && !isLocked;
                return (
                  <div
                    key={v.id}
                    className={cn(
                      "flex items-center gap-3 p-3 rounded-md border",
                      canToggle
                        ? "hover-elevate cursor-pointer"
                        : "opacity-40 cursor-not-allowed"
                    )}
                    onClick={() => {
                      if (!canToggle) return;
                      if (isSelected) {
                        setSelectedVariationIds((prev) => prev.filter((id) => id !== v.id));
                        return;
                      }
                      setSelectedVariationIds((prev) => [...prev, v.id]);
                      // Default this invoice's claim to what's actually left,
                      // not a blind 100% on top of an existing partial claim.
                      setVariationClaims((prev) => ({
                        ...prev,
                        [v.id]: prev[v.id] ?? remaining,
                      }));
                    }}
                    data-testid={`variation-option-${v.id}`}
                  >
                    <div
                      className={cn(
                        "w-4 h-4 rounded border flex items-center justify-center flex-shrink-0",
                        isSelected && isApproved
                          ? "bg-primary border-primary"
                          : "border-input"
                      )}
                    >
                      {isSelected && isApproved && (
                        <Check className="h-3 w-3 text-primary-foreground" />
                      )}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-medium font-mono">
                          {v.variationNumber}
                        </span>
                        <span className="text-sm truncate">{v.name}</span>
                      </div>
                      {claimedElsewhere && (
                        <div
                          className="text-xs text-muted-foreground mt-0.5"
                          data-testid={`variation-claimed-note-${v.id}`}
                        >
                          {fullyClaimed
                            ? `Already claimed in full on ${claimedElsewhere.invoiceNumbers.join(", ")}`
                            : `${claimedElsewhere.percent}% claimed on ${claimedElsewhere.invoiceNumbers.join(", ")} — ${remaining}% remaining`}
                        </div>
                      )}
                    </div>
                    <div className="flex items-center gap-3 flex-shrink-0">
                      <Badge
                        variant={
                          v.status === "approved"
                            ? "default"
                            : v.status === "rejected"
                            ? "destructive"
                            : "secondary"
                        }
                        className="text-xs"
                      >
                        {v.status}
                      </Badge>
                      <span className="text-sm font-medium w-24 text-right">
                        {formatCurrency(v.totalAmount / 100)}
                      </span>
                    </div>
                  </div>
                );
              })
            )}
          </div>

          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setVariationsModalOpen(false)}
            >
              Done
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Allowances Modal ── */}
      <Dialog open={allowancesModalOpen} onOpenChange={setAllowancesModalOpen}>
        <DialogContent className="max-w-2xl" data-testid="dialog-allowances">
          <DialogHeader>
            <DialogTitle>Select Allowances</DialogTitle>
            <DialogDescription>
              Only finalized allowances (PC/PS items) can be added to an invoice.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-2 max-h-96 overflow-y-auto">
            {estimateItemsLoading ? (
              <div className="text-center py-8"><Loader2 className="w-5 h-5 animate-spin mx-auto text-muted-foreground" /></div>
            ) : getAllowanceItems().length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-8">
                No allowance items (PC/PS) found in the selected estimate.
              </p>
            ) : (
              getAllowanceItems().map((item) => {
                const isFinalized = item.allowanceStatus === "finalized";
                const isSelected = selectedAllowanceIds.includes(item.id);
                const totalAmt = item.priceIncTax; // already the full line total; no ×qty
                return (
                  <div
                    key={item.id}
                    className={cn(
                      "flex items-center gap-3 p-3 rounded-md border",
                      isFinalized
                        ? "hover-elevate cursor-pointer"
                        : "opacity-40 cursor-not-allowed"
                    )}
                    onClick={() => {
                      if (!isFinalized) return;
                      setSelectedAllowanceIds((prev) =>
                        isSelected
                          ? prev.filter((id) => id !== item.id)
                          : [...prev, item.id]
                      );
                    }}
                    data-testid={`allowance-option-${item.id}`}
                  >
                    <div
                      className={cn(
                        "w-4 h-4 rounded border flex items-center justify-center flex-shrink-0",
                        isSelected && isFinalized
                          ? "bg-primary border-primary"
                          : "border-input"
                      )}
                    >
                      {isSelected && isFinalized && (
                        <Check className="h-3 w-3 text-primary-foreground" />
                      )}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-medium truncate">{item.name}</span>
                        <Badge variant="outline" className="text-xs flex-shrink-0">
                          {item.allowance}
                        </Badge>
                      </div>
                      {item.description && (
                        <p className="text-xs text-muted-foreground truncate mt-0.5">
                          {item.description}
                        </p>
                      )}
                    </div>
                    <div className="flex items-center gap-3 flex-shrink-0">
                      <Badge
                        variant={isFinalized ? "default" : "secondary"}
                        className="text-xs"
                      >
                        {item.allowanceStatus}
                      </Badge>
                      <span className="text-sm font-medium w-24 text-right">
                        {formatCurrency(totalAmt)}
                      </span>
                    </div>
                  </div>
                );
              })
            )}
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setAllowancesModalOpen(false)}>
              Done
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Import Labour Modal ── */}
      <Dialog open={labourModalOpen} onOpenChange={setLabourModalOpen}>
        <DialogContent className="max-w-3xl" data-testid="dialog-labour">
          <DialogHeader>
            <DialogTitle>Import Labour</DialogTitle>
            <DialogDescription>
              Approved timesheets can be selected. Submitted timesheets are pending approval.
            </DialogDescription>
          </DialogHeader>

          {/* Invoice display mode + break by cost code */}
          <div className="flex flex-wrap items-center gap-3">
            <div className="flex items-center gap-2">
              <span className="text-data uppercase tracking-wide text-muted-foreground/50 flex-shrink-0">Invoice will show labour as</span>
              <div className="flex items-center rounded-full border border-border/50 overflow-hidden">
                {(["individual", "by_user", "by_date", "single"] as const).map((mode, i, arr) => (
                  <button
                    key={mode}
                    type="button"
                    onClick={() => setLabourDisplayMode(mode)}
                    className={cn(
                      "px-2.5 py-1 text-table leading-none transition-colors",
                      i < arr.length - 1 && "border-r border-border/50",
                      labourDisplayMode === mode
                        ? "bg-muted text-foreground font-medium"
                        : "text-muted-foreground/60 hover:text-muted-foreground"
                    )}
                  >
                    {mode === "individual" ? "Individual lines" : mode === "by_user" ? "Group by staff" : mode === "by_date" ? "Group by date" : "Single total"}
                  </button>
                ))}
              </div>
            </div>
            <div className="flex items-center gap-1.5">
              <Switch
                id="break-by-cost-code"
                checked={labourBreakByCostCode}
                onCheckedChange={setLabourBreakByCostCode}
                className="scale-75 origin-left"
              />
              <label htmlFor="break-by-cost-code" className="text-table text-muted-foreground cursor-pointer select-none">
                Break down by cost code
              </label>
            </div>
          </div>

          {/* Filters row */}
          <div className="flex flex-wrap items-center gap-2">
            <div className="relative flex-1 min-w-32">
              <Search className="absolute left-2.5 top-2 h-3.5 w-3.5 text-muted-foreground" />
              <Input
                placeholder="Search..."
                value={labourSearch}
                onChange={(e) => setLabourSearch(e.target.value)}
                className="pl-8 h-7 text-xs"
              />
            </div>
            <Select value={labourFilterUser} onValueChange={setLabourFilterUser}>
              <SelectTrigger className="h-7 text-xs w-36">
                <SelectValue placeholder="All staff" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All staff</SelectItem>
                {Array.from(new Set(projectTimesheets.map((t: any) => t.userId))).map((uid: any) => (
                  <SelectItem key={uid} value={uid}>{getUserName(uid)}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select value={labourFilterStatus} onValueChange={setLabourFilterStatus}>
              <SelectTrigger className="h-7 text-xs w-32">
                <SelectValue placeholder="All status" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All status</SelectItem>
                <SelectItem value="approved">Approved</SelectItem>
                <SelectItem value="submitted">Pending</SelectItem>
              </SelectContent>
            </Select>
            <Select value={labourFilterCostCode} onValueChange={setLabourFilterCostCode}>
              <SelectTrigger className="h-7 text-xs w-36">
                <SelectValue placeholder="All cost codes" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All cost codes</SelectItem>
                {costCodes.map((cc: any) => (
                  <SelectItem key={cc.id} value={cc.id}>{cc.code || cc.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select value={labourFilterLabel} onValueChange={setLabourFilterLabel}>
              <SelectTrigger className="h-7 text-xs w-32">
                <SelectValue placeholder="All labels" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All labels</SelectItem>
                {Array.from(new Set(projectTimesheets.flatMap((t: any) => t.labels || []))).map((lbl: any) => (
                  <SelectItem key={lbl} value={lbl}>{lbl}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Table — always shows individual rows; "Invoice will show labour as" controls invoice rendering */}
          <div className="rounded-md border overflow-hidden">
            <div className="max-h-[340px] overflow-y-auto overflow-x-auto">
              <Table className="min-w-[640px]">
                {(() => {
                  const filtered = projectTimesheets
                    .filter((t: any) => t.status === "approved" || t.status === "submitted")
                    .filter((t: any) => labourFilterStatus === "all" || t.status === labourFilterStatus)
                    .filter((t: any) => labourFilterUser === "all" || t.userId === labourFilterUser)
                    .filter((t: any) => labourFilterCostCode === "all" || t.costCodeId === labourFilterCostCode)
                    .filter((t: any) => labourFilterLabel === "all" || (t.labels || []).includes(labourFilterLabel))
                    .filter((t: any) => {
                      if (!labourSearch) return true;
                      const q = labourSearch.toLowerCase();
                      const name = getUserName(t.userId).toLowerCase();
                      const dateStr = t.date ? format(new Date(t.date), "d MMM yy").toLowerCase() : "";
                      const cc = costCodes.find((c: any) => c.id === t.costCodeId);
                      const ccName = ((cc?.title || cc?.code) || "").toLowerCase();
                      return name.includes(q) || dateStr.includes(q) || ccName.includes(q);
                    });
                  const base = [...filtered].sort((a: any, b: any) => {
                    let av: any, bv: any;
                    if (labourSortCol === "date") { av = a.date || ""; bv = b.date || ""; }
                    else if (labourSortCol === "staff") { av = getUserName(a.userId); bv = getUserName(b.userId); }
                    else if (labourSortCol === "status") { av = a.status; bv = b.status; }
                    else if (labourSortCol === "hours") { av = Number(a.duration); bv = Number(b.duration); }
                    else if (labourSortCol === "costCode") {
                      const ca = costCodes.find((c: any) => c.id === a.costCodeId);
                      const cb = costCodes.find((c: any) => c.id === b.costCodeId);
                      av = ca?.title || ca?.code || ""; bv = cb?.title || cb?.code || "";
                    } else { av = ""; bv = ""; }
                    if (av < bv) return labourSortDir === "asc" ? -1 : 1;
                    if (av > bv) return labourSortDir === "asc" ? 1 : -1;
                    return 0;
                  });
                  const thCls = "cursor-pointer select-none hover:text-muted-foreground whitespace-nowrap";
                  return (
                    <>
                      <TableHeader>
                        <TableRow className="[&>th]:border-b-2 [&>th]:border-border [&>th]:text-foreground/75 [&>th]:font-semibold">
                          <TableHead className="w-8 py-0 px-2" />
                          <TableHead onClick={() => labourSortToggle("date")}>Date <SortIcon col="date" current={labourSortCol} dir={labourSortDir} /></TableHead>
                          <TableHead onClick={() => labourSortToggle("staff")}>Staff <SortIcon col="staff" current={labourSortCol} dir={labourSortDir} /></TableHead>
                          <TableHead onClick={() => labourSortToggle("status")}>Status <SortIcon col="status" current={labourSortCol} dir={labourSortDir} /></TableHead>
                          <TableHead className="text-right" onClick={() => labourSortToggle("hours")}>Hours <SortIcon col="hours" current={labourSortCol} dir={labourSortDir} /></TableHead>
                          <TableHead onClick={() => labourSortToggle("costCode")}>Cost Code <SortIcon col="costCode" current={labourSortCol} dir={labourSortDir} /></TableHead>
                          <TableHead className={`${thCls} cursor-default`}>Labels</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {timesheetsLoading ? (
                          <TableRow><TableCell colSpan={7} className="text-center py-8"><Loader2 className="w-5 h-5 animate-spin mx-auto text-muted-foreground" /></TableCell></TableRow>
                        ) : base.length === 0 ? (
                          <TableRow><TableCell colSpan={7} className="text-center text-table text-muted-foreground py-8">No timesheets found.</TableCell></TableRow>
                        ) : base.map((t: any) => {
                          const isApproved = t.status === "approved";
                          const isChecked = modalTimesheetIds.includes(t.id);
                          const cc = costCodes.find((c: any) => c.id === t.costCodeId);
                          const labels = (t.labels as string[] || []);
                          return (
                            <TableRow key={t.id} className={cn("h-9", isApproved ? "hover-elevate cursor-pointer" : "opacity-40 cursor-not-allowed")}
                              onClick={() => { if (!isApproved) return; setModalTimesheetIds(prev => isChecked ? prev.filter(id => id !== t.id) : [...prev, t.id]); }}>
                              <TableCell className="w-8 py-1 px-2">
                                <div className={cn("w-4 h-4 rounded border flex items-center justify-center", isChecked && isApproved ? "bg-primary border-primary" : "border-input")}>
                                  {isChecked && isApproved && <Check className="h-3 w-3 text-primary-foreground" />}
                                </div>
                              </TableCell>
                              <TableCell className="py-1 text-table tabular-nums whitespace-nowrap">{t.date ? format(new Date(t.date), "d MMM yy") : "—"}</TableCell>
                              <TableCell className="py-1 text-table font-medium whitespace-nowrap">{getUserName(t.userId)}</TableCell>
                              <TableCell className="py-1 whitespace-nowrap">
                                {isApproved
                                  ? <span className="flex items-center gap-1 text-xs"><div className="w-1.5 h-1.5 rounded-full bg-sage flex-shrink-0" />Approved</span>
                                  : <span className="flex items-center gap-1 text-xs"><div className="w-1.5 h-1.5 rounded-full bg-amber flex-shrink-0" />Pending</span>}
                              </TableCell>
                              <TableCell className="py-1 text-right text-table tabular-nums">{Number(t.duration).toFixed(1)}</TableCell>
                              <TableCell className="py-1 text-table text-muted-foreground whitespace-nowrap">{cc?.title || cc?.code || "—"}</TableCell>
                              <TableCell className="py-1 text-xs text-muted-foreground truncate max-w-[120px]">{labels.length > 0 ? labels.slice(0, 3).join(", ") : "—"}</TableCell>
                            </TableRow>
                          );
                        })}
                      </TableBody>
                    </>
                  );
                })()}
              </Table>
            </div>
          </div>

          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => setLabourModalOpen(false)}>Cancel</Button>
            <Button
              onClick={() => {
                setSelectedTimesheetIds([...modalTimesheetIds]);
                setLabourModalOpen(false);
              }}
              disabled={modalTimesheetIds.length === 0}
            >
              Add {modalTimesheetIds.length > 0 ? `${modalTimesheetIds.length} ` : ""}to Invoice
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Import Bills Modal ── */}
      <Dialog open={billsModalOpen} onOpenChange={setBillsModalOpen}>
        <DialogContent className="max-w-4xl" data-testid="dialog-bills">
          <DialogHeader>
            <DialogTitle>Import Bills</DialogTitle>
            <DialogDescription>
              Select bills to include in this invoice.
            </DialogDescription>
          </DialogHeader>
          <div className="flex items-center gap-2">
            <div className="relative flex-1">
              <Search className="absolute left-2.5 top-2.5 h-3.5 w-3.5 text-muted-foreground" />
              <Input
                placeholder="Search by bill number or supplier..."
                value={billsSearch}
                onChange={(e) => setBillsSearch(e.target.value)}
                className="pl-8 h-8 text-sm"
              />
            </div>
            <Popover open={billsColPickerOpen} onOpenChange={setBillsColPickerOpen}>
              <PopoverTrigger asChild>
                <Button variant="outline" size="icon" className="flex-shrink-0">
                  <LayoutGrid className="w-4 h-4" />
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-44 p-2" align="end">
                <p className="text-xs font-medium text-muted-foreground mb-2 px-1">Columns</p>
                {INVOICE_BILL_COLUMNS.filter((c) => !c.required).map((col) => (
                  <button
                    key={col.id}
                    type="button"
                    className="flex items-center gap-2 w-full px-1 py-1 text-sm rounded hover-elevate"
                    onClick={() => toggleBillCol(col.id)}
                  >
                    <div className={cn("w-4 h-4 rounded border flex items-center justify-center flex-shrink-0", isBillColVisible(col.id) ? "bg-primary border-primary" : "border-input")}>
                      {isBillColVisible(col.id) && <Check className="h-3 w-3 text-primary-foreground" />}
                    </div>
                    <span>{col.label}</span>
                  </button>
                ))}
              </PopoverContent>
            </Popover>
          </div>
          <div className="rounded-md border overflow-hidden">
            <div className="max-h-[380px] overflow-y-auto overflow-x-auto">
              <Table className="min-w-[560px]">
                {(() => {
                  const filtered = bills.filter((b) => {
                    if (!billsSearch) return true;
                    const q = billsSearch.toLowerCase();
                    return (
                      b.billNumber?.toLowerCase().includes(q) ||
                      (b as any).supplierName?.toLowerCase().includes(q)
                    );
                  });
                  const sorted = [...filtered].sort((a: any, b_: any) => {
                    let av: any, bv: any;
                    if (billsSortCol === "billNumber") { av = a.billNumber || ""; bv = b_.billNumber || ""; }
                    else if (billsSortCol === "status") { av = a.status || ""; bv = b_.status || ""; }
                    else if (billsSortCol === "supplier") { av = a.supplierName || ""; bv = b_.supplierName || ""; }
                    else if (billsSortCol === "reference") { av = a.reference || ""; bv = b_.reference || ""; }
                    else if (billsSortCol === "date") { av = a.billDate || ""; bv = b_.billDate || ""; }
                    else if (billsSortCol === "total") { av = a.total || 0; bv = b_.total || 0; }
                    else if (billsSortCol === "due") { av = a.dueDate || ""; bv = b_.dueDate || ""; }
                    else { av = ""; bv = ""; }
                    if (av < bv) return billsSortDir === "asc" ? -1 : 1;
                    if (av > bv) return billsSortDir === "asc" ? 1 : -1;
                    return 0;
                  });
                  const colCount = 1 + INVOICE_BILL_COLUMNS.filter((c) => isBillColVisible(c.id)).length;
                  const thCls = "cursor-pointer select-none hover:text-muted-foreground whitespace-nowrap";
                  const billStatusBadge = (status: string) => {
                    const map: Record<string, { label: string; cls: string }> = {
                      draft: { label: "Draft", cls: "text-muted-foreground" },
                      awaiting_approval: { label: "Pending Approval", cls: "text-amber" },
                      awaiting_payment: { label: "Awaiting Payment", cls: "text-status-info" },
                      paid: { label: "Paid", cls: "text-sage" },
                    };
                    const s = map[status] || { label: status || "—", cls: "text-muted-foreground" };
                    return (
                      <span className={cn("flex items-center gap-1 text-xs whitespace-nowrap", s.cls)}>
                        <div className={cn("w-1.5 h-1.5 rounded-full flex-shrink-0", {
                          "bg-muted-foreground/60": status === "draft",
                          "bg-amber": status === "awaiting_approval",
                          "bg-status-info": status === "awaiting_payment",
                          "bg-sage": status === "paid",
                        })} />
                        {s.label}
                      </span>
                    );
                  };
                  return (
                    <>
                      <TableHeader>
                        <TableRow className="[&>th]:border-b-2 [&>th]:border-border [&>th]:text-foreground/75 [&>th]:font-semibold">
                          <TableHead className="w-8 py-0 px-2" />
                          {isBillColVisible("billNumber") && <TableHead onClick={() => billsSortToggle("billNumber")}>Bill No. <SortIcon col="billNumber" current={billsSortCol} dir={billsSortDir} /></TableHead>}
                          {isBillColVisible("status") && <TableHead onClick={() => billsSortToggle("status")}>Status <SortIcon col="status" current={billsSortCol} dir={billsSortDir} /></TableHead>}
                          {isBillColVisible("supplier") && <TableHead onClick={() => billsSortToggle("supplier")}>Supplier <SortIcon col="supplier" current={billsSortCol} dir={billsSortDir} /></TableHead>}
                          {isBillColVisible("reference") && <TableHead onClick={() => billsSortToggle("reference")}>Reference <SortIcon col="reference" current={billsSortCol} dir={billsSortDir} /></TableHead>}
                          {isBillColVisible("date") && <TableHead onClick={() => billsSortToggle("date")}>Date <SortIcon col="date" current={billsSortCol} dir={billsSortDir} /></TableHead>}
                          {isBillColVisible("total") && <TableHead className="text-right" onClick={() => billsSortToggle("total")}>Total <SortIcon col="total" current={billsSortCol} dir={billsSortDir} /></TableHead>}
                          {isBillColVisible("due") && <TableHead onClick={() => billsSortToggle("due")}>Due <SortIcon col="due" current={billsSortCol} dir={billsSortDir} /></TableHead>}
                          {isBillColVisible("xero") && <TableHead className={`${thCls} cursor-default`}>Xero</TableHead>}
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {billsLoading ? (
                          <TableRow><TableCell colSpan={colCount} className="text-center py-8"><Loader2 className="w-5 h-5 animate-spin mx-auto text-muted-foreground" /></TableCell></TableRow>
                        ) : sorted.length === 0 ? (
                          <TableRow>
                            <TableCell colSpan={colCount} className="text-center text-table text-muted-foreground py-8">
                              No bills found for this project.
                            </TableCell>
                          </TableRow>
                        ) : sorted.map((b) => {
                          const isChecked = modalBillIds.includes(b.id);
                          return (
                            <TableRow
                              key={b.id}
                              className="h-9 hover-elevate cursor-pointer"
                              onClick={() => setModalBillIds(prev => isChecked ? prev.filter(id => id !== b.id) : [...prev, b.id])}
                            >
                              <TableCell className="w-8 py-1 px-2">
                                <div className={cn("w-4 h-4 rounded border flex items-center justify-center", isChecked ? "bg-primary border-primary" : "border-input")}>
                                  {isChecked && <Check className="h-3 w-3 text-primary-foreground" />}
                                </div>
                              </TableCell>
                              {isBillColVisible("billNumber") && <TableCell className="py-1 text-table font-medium font-mono whitespace-nowrap">{b.billNumber}</TableCell>}
                              {isBillColVisible("status") && <TableCell className="py-1">{billStatusBadge((b as any).status)}</TableCell>}
                              {isBillColVisible("supplier") && <TableCell className="py-1 text-table text-muted-foreground whitespace-nowrap">{(b as any).supplierName || "—"}</TableCell>}
                              {isBillColVisible("reference") && <TableCell className="py-1 text-table text-muted-foreground whitespace-nowrap">{(b as any).reference || "—"}</TableCell>}
                              {isBillColVisible("date") && <TableCell className="py-1 text-table text-muted-foreground whitespace-nowrap">{(b as any).billDate ? format(new Date((b as any).billDate), "d MMM yy") : "—"}</TableCell>}
                              {isBillColVisible("total") && <TableCell className="py-1 text-right text-table font-medium tabular-nums whitespace-nowrap">{formatCurrency(b.total / 100)}</TableCell>}
                              {isBillColVisible("due") && <TableCell className="py-1 text-table text-muted-foreground whitespace-nowrap">{(b as any).dueDate ? format(new Date((b as any).dueDate), "d MMM yy") : "—"}</TableCell>}
                              {isBillColVisible("xero") && (
                                <TableCell className="py-1 text-table">
                                  {(b as any).xeroInvoiceId
                                    ? <span className="flex items-center gap-1 text-xs text-sage"><div className="w-1.5 h-1.5 rounded-full bg-sage" />Synced</span>
                                    : <span className="text-muted-foreground/40">—</span>}
                                </TableCell>
                              )}
                            </TableRow>
                          );
                        })}
                      </TableBody>
                    </>
                  );
                })()}
              </Table>
            </div>
          </div>
          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => setBillsModalOpen(false)}>Cancel</Button>
            <Button
              onClick={() => {
                setSelectedBillIds([...modalBillIds]);
                setBillsModalOpen(false);
              }}
              disabled={modalBillIds.length === 0}
            >
              Add {modalBillIds.length > 0 ? `${modalBillIds.length} ` : ""}to Invoice
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Import Selections Modal ── */}
      <Dialog open={selectionsModalOpen} onOpenChange={setSelectionsModalOpen}>
        <DialogContent className="max-w-2xl" data-testid="dialog-selections">
          <DialogHeader>
            <DialogTitle>Import Selections</DialogTitle>
            <DialogDescription>
              Client-confirmed selections with a cost can be added to the invoice.
            </DialogDescription>
          </DialogHeader>
          <div className="relative">
            <Search className="absolute left-2.5 top-2.5 h-3.5 w-3.5 text-muted-foreground" />
            <Input
              placeholder="Search by selection or option name..."
              value={selectionsSearch}
              onChange={(e) => setSelectionsSearch(e.target.value)}
              className="pl-8 h-8 text-sm"
            />
          </div>
          <div className="rounded-md border overflow-hidden">
            <div className="max-h-[380px] overflow-y-auto">
              <Table>
                <TableHeader>
                  <TableRow className="[&>th]:border-b-2 [&>th]:border-border [&>th]:text-foreground/75 [&>th]:font-semibold">
                    <TableHead className="w-8 py-0 px-2" />
                    <TableHead>Selection</TableHead>
                    <TableHead>Room</TableHead>
                    <TableHead>Option</TableHead>
                    <TableHead className="text-right">Qty</TableHead>
                    <TableHead className="text-right">Total</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {(() => {
                    const filtered = invoiceableSelections.filter((o: any) => {
                      if (!selectionsSearch) return true;
                      const q = selectionsSearch.toLowerCase();
                      return (
                        o.name?.toLowerCase().includes(q) ||
                        o.selectionName?.toLowerCase().includes(q) ||
                        o.room?.toLowerCase().includes(q)
                      );
                    });
                    if (selectionsLoading) {
                      return (
                        <TableRow>
                          <TableCell colSpan={6} className="text-center py-8">
                            <Loader2 className="w-5 h-5 animate-spin mx-auto text-muted-foreground" />
                          </TableCell>
                        </TableRow>
                      );
                    }
                    if (filtered.length === 0) {
                      return (
                        <TableRow>
                          <TableCell colSpan={6} className="text-center text-table text-muted-foreground py-8">
                            No invoiceable selections found for this project.
                          </TableCell>
                        </TableRow>
                      );
                    }
                    return filtered.map((o: any) => {
                      const isChecked = modalSelectionOptionIds.includes(o.id);
                      return (
                        <TableRow
                          key={o.id}
                          className="h-9 hover-elevate cursor-pointer"
                          onClick={() =>
                            setModalSelectionOptionIds(prev =>
                              isChecked ? prev.filter(id => id !== o.id) : [...prev, o.id]
                            )
                          }
                        >
                          <TableCell className="w-8 py-1 px-2">
                            <div className={cn(
                              "w-4 h-4 rounded border flex items-center justify-center",
                              isChecked ? "bg-primary border-primary" : "border-input"
                            )}>
                              {isChecked && <Check className="h-3 w-3 text-primary-foreground" />}
                            </div>
                          </TableCell>
                          <TableCell className="py-1 text-table font-medium truncate max-w-[140px]">{o.selectionName || "—"}</TableCell>
                          <TableCell className="py-1 text-table text-muted-foreground">{o.room || "—"}</TableCell>
                          <TableCell className="py-1 text-table">{o.name}</TableCell>
                          <TableCell className="py-1 text-right text-table tabular-nums">{o.quantity || "—"}</TableCell>
                          <TableCell className="py-1 text-right text-table font-medium tabular-nums">{formatCurrency((o.totalCost || 0) / 100)}</TableCell>
                        </TableRow>
                      );
                    });
                  })()}
                </TableBody>
              </Table>
            </div>
          </div>
          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => setSelectionsModalOpen(false)}>Cancel</Button>
            <Button
              onClick={() => {
                setSelectedSelectionOptionIds([...modalSelectionOptionIds]);
                setSelectionsModalOpen(false);
              }}
              disabled={modalSelectionOptionIds.length === 0}
            >
              Add {modalSelectionOptionIds.length > 0 ? `${modalSelectionOptionIds.length} ` : ""}to Invoice
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Record Payment Dialog ── */}
      <Dialog open={paymentDialogOpen} onOpenChange={setPaymentDialogOpen}>
        <DialogContent data-testid="dialog-record-payment">
          <DialogHeader>
            <DialogTitle>Record Payment</DialogTitle>
            <DialogDescription>
              Record a payment for this invoice. The invoice status will be automatically updated.
            </DialogDescription>
          </DialogHeader>

          <Form {...paymentForm}>
            <form
              onSubmit={paymentForm.handleSubmit((data) =>
                recordPaymentMutation.mutate(data)
              )}
              className="space-y-4"
            >
              <FormField
                control={paymentForm.control}
                name="amount"
                render={({ field }) => {
                  const outstandingCents = Math.max(0, (invoice?.totalAmount || 0) - (invoice?.paidAmount || 0));
                  return (
                    <FormItem>
                      <FormLabel>Amount (AUD)*</FormLabel>
                      <FormControl>
                        <Input
                          type="number"
                          step="0.01"
                          min="0.01"
                          max={outstandingCents / 100}
                          {...field}
                          onChange={(e) => field.onChange(parseFloat(e.target.value) || 0)}
                          data-testid="input-payment-amount"
                        />
                      </FormControl>
                      <p className="text-xs text-muted-foreground">
                        Outstanding balance: {formatCurrency(outstandingCents / 100)}
                      </p>
                      <FormMessage />
                    </FormItem>
                  );
                }}
              />

              <FormField
                control={paymentForm.control}
                name="paymentDate"
                render={({ field }) => (
                  <FormItem className="flex flex-col">
                    <FormLabel>Payment Date*</FormLabel>
                    <Popover>
                      <PopoverTrigger asChild>
                        <FormControl>
                          <Button
                            variant="outline"
                            className={cn(
                              "justify-start text-left font-normal",
                              !field.value && "text-muted-foreground"
                            )}
                            data-testid="button-payment-date"
                          >
                            <CalendarIcon className="mr-1.5 h-3 w-3" />
                            {field.value ? format(field.value, "d MMM yyyy") : "Pick a date"}
                          </Button>
                        </FormControl>
                      </PopoverTrigger>
                      <PopoverContent className="w-auto p-0">
                        <Calendar
                          mode="single"
                          selected={field.value}
                          onSelect={field.onChange}
                          initialFocus
                        />
                      </PopoverContent>
                    </Popover>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={paymentForm.control}
                name="paymentMethod"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Payment Method</FormLabel>
                    <Select onValueChange={field.onChange} value={field.value}>
                      <FormControl>
                        <SelectTrigger data-testid="select-payment-method">
                          <SelectValue placeholder="Select method" />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        <SelectItem value="Bank Transfer">Bank Transfer</SelectItem>
                        <SelectItem value="Credit Card">Credit Card</SelectItem>
                        <SelectItem value="Cash">Cash</SelectItem>
                        <SelectItem value="Cheque">Cheque</SelectItem>
                        <SelectItem value="Other">Other</SelectItem>
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={paymentForm.control}
                name="reference"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Reference</FormLabel>
                    <FormControl>
                      <Input {...field} data-testid="input-payment-reference" />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={paymentForm.control}
                name="notes"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Notes</FormLabel>
                    <FormControl>
                      <Textarea {...field} rows={3} data-testid="textarea-payment-notes" />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <DialogFooter>
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => setPaymentDialogOpen(false)}
                >
                  Cancel
                </Button>
                <Button type="submit" disabled={recordPaymentMutation.isPending}>
                  {recordPaymentMutation.isPending && (
                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  )}
                  Record Payment
                </Button>
              </DialogFooter>
            </form>
          </Form>
        </DialogContent>
      </Dialog>

      {/* Preview Invoice PDF */}
      {invoice && (
        <DocumentPreviewModal
          open={invoicePreviewOpen}
          onOpenChange={setInvoicePreviewOpen}
          document={
            <InvoiceDocument
              invoiceNumber={form.watch("invoiceNumber") || invoice.invoiceNumber || "Invoice"}
              issueDate={form.watch("invoiceDate") || invoice.invoiceDate}
              dueDate={form.watch("dueDate") || invoice.dueDate}
              company={companyInfo}
              clientName={clientContact?.name}
              projectName={currentProject?.name}
              projectAddress={(currentProject as any)?.address || (clientContact as any)?.addressFormatted}
              lineItems={buildInvoicePdfLineItems()}
              subtotalCents={Math.round(amountExTax() * 100)}
              gstCents={Math.round(amountTax() * 100)}
              totalCents={Math.round(amountIncTax() * 100)}
              paidCents={Math.round(paid * 100)}
              balanceDueCents={Math.round(amountIncTax() * 100) - Math.round(paid * 100)}
              brandColor={companySettings?.brandColor || "#6d28d9"}
              documentStyle={docStyle}
              logoUrl={logoUrl}
              paymentDetails={companySettings?.paymentDetails}
              termsAndConditions={termsAndConditions}
              status={invoice?.status}
            />
          }
          filename={`INV-${form.watch("invoiceNumber") || invoice.invoiceNumber || "export"}.pdf`}
          onSend={() => { setInvoicePreviewOpen(false); handleOpenInvoiceSendModal(); }}
        />
      )}

      {/* Send Invoice Dialog */}
      {invoice && invoiceSendData && (
        <SendInvoiceDialog
          open={invoiceSendModalOpen}
          onOpenChange={setInvoiceSendModalOpen}
          invoice={invoice}
          lineItems={invoiceSendData.lineItems}
          subtotalCents={invoiceSendData.subtotalCents}
          gstCents={invoiceSendData.gstCents}
          totalCents={invoiceSendData.totalCents}
          paidCents={invoiceSendData.paidCents}
          balanceDueCents={invoiceSendData.balanceDueCents}
          company={companyInfo}
          clientName={clientContact?.name}
          projectName={currentProject?.name}
          projectAddress={(currentProject as any)?.address || (clientContact as any)?.addressFormatted}
          brandColor={companySettings?.brandColor || "#6d28d9"}
          documentStyle={docStyle}
          logoUrl={logoUrl}
          paymentDetails={companySettings?.paymentDetails}
          termsAndConditions={(invoice as any).termsAndConditions}
          status={invoice?.status}
          clientEmail={clientContact?.email ?? undefined}
          initialSubject={invoiceSendData.initialSubject}
          initialBody={invoiceSendData.initialBody}
        />
      )}

      <XeroContactLinkModal
        open={xeroLinkModalOpen}
        onClose={() => {
          xeroRetryRef.current = null;
          setXeroLinkModalOpen(false);
        }}
        clientId={(currentProject as any)?.clientId || null}
        clientName={xeroUnmappedClientName}
        onLinked={async () => {
          setXeroLinkModalOpen(false);
          const retry = xeroRetryRef.current;
          xeroRetryRef.current = null;
          if (retry) {
            try {
              await retry();
            } catch (err: any) {
              toast({ title: "Xero push failed", description: err?.payload?.message || err.message || "Could not push invoice to Xero", variant: "destructive" });
            }
          }
        }}
      />
    </div>
  );
}
