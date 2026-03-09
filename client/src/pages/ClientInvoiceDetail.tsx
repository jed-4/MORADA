import { useEffect, useState, useRef } from "react";
import { useParams, useLocation } from "wouter";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { format, addDays } from "date-fns";
import { pdf } from "@react-pdf/renderer";
import { InvoiceDocument } from "@/components/invoices/pdf/InvoiceDocument";
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
  Unlock,
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
} from "lucide-react";
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

  // ── new UI state ─────────────────────────────────────────────────────────────
  const [introCollapsed, setIntroCollapsed] = useState(true);
  const [closingCollapsed, setClosingCollapsed] = useState(true);
  const [termsCollapsed, setTermsCollapsed] = useState(true);
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
  const [lockedContractPrice, setLockedContractPrice] = useState<number | null>(null);
  const [contractClaimRows, setContractClaimRows] = useState<ContractClaimRow[]>([
    { id: crypto.randomUUID(), name: "", description: "", claimPercent: 100 },
  ]);
  const [contractPriceOverrideOpen, setContractPriceOverrideOpen] = useState(false);
  const [contractPriceOverrideValue, setContractPriceOverrideValue] = useState("");
  const [columnPickerOpen, setColumnPickerOpen] = useState(false);
  const [dragOverId, setDragOverId] = useState<ColumnId | null>(null);
  const dragItem = useRef<ColumnId | null>(null);
  const [invoiceDateOpen, setInvoiceDateOpen] = useState(false);
  const [dueDateOpen, setDueDateOpen] = useState(false);
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
  const [modalBillIds, setModalBillIds] = useState<string[]>([]);
  const [modalTimesheetIds, setModalTimesheetIds] = useState<string[]>([]);
  const [modalSelectionOptionIds, setModalSelectionOptionIds] = useState<string[]>([]);

  // ── queries ──────────────────────────────────────────────────────────────────
  const { data: xeroStatus } = useQuery<{ connected: boolean }>({
    queryKey: ["/api/xero/status"],
  });

  // T004: PDF + email state
  const [invoicePdfGenerating, setInvoicePdfGenerating] = useState(false);
  const [invoiceSendModalOpen, setInvoiceSendModalOpen] = useState(false);
  const [invoiceSendTo, setInvoiceSendTo] = useState("");
  const [invoiceSendSubject, setInvoiceSendSubject] = useState("");
  const [invoiceSendBody, setInvoiceSendBody] = useState("");
  const [invoiceSendAttachPdf, setInvoiceSendAttachPdf] = useState(true);

  const { data: companyInfo } = useQuery<{ id: string; name: string; abn?: string; phone?: string; email?: string; logo?: string }>({
    queryKey: ["/api/company"],
  });

  const { data: companySettings } = useQuery<{ termsAndConditions?: string; termsTemplates?: Array<{ id: string; name: string; content: string }>; companyName?: string; address?: string; clientInvoiceDefaultXeroAccount?: string | null; brandColor?: string }>({
    queryKey: ["/api/company-settings"],
  });

  const { data: xeroAccounts = [] } = useQuery<Array<{ code: string; name: string; type: string; accountId: string }>>({
    queryKey: ["/api/xero/accounts"],
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

  const { data: clientContact } = useQuery<Contact>({
    queryKey: [`/api/contacts/${(currentProject as any)?.clientId}`],
    enabled: !!(currentProject as any)?.clientId,
  });

  const { data: estimates = [] } = useQuery<Estimate[]>({
    queryKey: [`/api/estimates?projectId=${selectedProjectId}`],
    enabled: !!selectedProjectId,
  });

  const { data: variations = [] } = useQuery<Variation[]>({
    queryKey: [`/api/variations?projectId=${selectedProjectId}`],
    enabled: !!selectedProjectId,
  });

  const { data: projectInvoices = [] } = useQuery<ClientInvoice[]>({
    queryKey: ["/api/client-invoices", selectedProjectId],
    queryFn: () => fetch(`/api/client-invoices?projectId=${selectedProjectId}`).then(r => r.json()),
    enabled: !!selectedProjectId,
  });

  const { data: bills = [] } = useQuery<Bill[]>({
    queryKey: [`/api/bills?projectId=${selectedProjectId}`],
    enabled: !!selectedProjectId,
  });

  const { data: projectTimesheets = [] } = useQuery<any[]>({
    queryKey: [`/api/projects/${selectedProjectId}/timesheets`],
    enabled: !!selectedProjectId && invoiceType === "cost_plus",
  });

  const { data: invoiceableSelections = [] } = useQuery<any[]>({
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

  const { data: estimateItems = [] } = useQuery<EstimateItem[]>({
    queryKey: [`/api/estimates/${selectedEstimateId}/items`],
    enabled: !!selectedEstimateId,
  });

  const { data: paymentTermsRaw = [] } = useQuery<any[]>({
    queryKey: ["/api/payment-terms-options"],
  });
  const paymentTermsOptions = paymentTermsRaw
    .filter((o) => o.isInvoiceDefault)
    .sort((a, b) => a.sortOrder - b.sortOrder);

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
      if ((invoice as any).lockedContractPrice) {
        setLockedContractPrice((invoice as any).lockedContractPrice);
      }
      if ((invoice as any).contractClaimRows && Array.isArray((invoice as any).contractClaimRows)) {
        setContractClaimRows((invoice as any).contractClaimRows as ContractClaimRow[]);
      }
      // Open intro/closing if they have content
      if (invoice.introductionText) setIntroCollapsed(false);
      if (invoice.closingText) setClosingCollapsed(false);
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

  const getEffectiveContractPrice = () =>
    lockedContractPrice || ((currentProject as any)?.contractPrice ?? null);

  const calculateContractPrice = () => {
    const baseCents = getEffectiveContractPrice();
    if (!baseCents) return 0;
    return contractClaimRows.reduce((sum, row) => {
      return sum + Math.round((baseCents * row.claimPercent) / 100);
    }, 0);
  };

  const calculateVariationsTotal = () =>
    getSelectedVariations().reduce((sum, v) => {
      const pct = variationClaims[v.id] ?? 100;
      return sum + Math.round((v.totalAmount * pct) / 100);
    }, 0);

  const calculateAllowancesTotal = () =>
    getSelectedAllowanceItems().reduce((sum, item) => {
      const pct = allowanceClaims[item.id] ?? 100;
      const total = Math.round(item.priceIncTax * item.quantity * 100);
      return sum + Math.round((total * pct) / 100);
    }, 0);

  const calculateBillsTotal = () =>
    getSelectedBills().reduce((sum, b) => sum + b.total, 0);

  const calculateLabourTotal = () =>
    getSelectedTimesheets().reduce((sum, t: any) => sum + Math.round(Number(t.total) * 100), 0);

  const calculateSelectionsTotal = () =>
    getSelectedSelectionOptions().reduce((sum, o: any) => sum + (o.totalCost || 0), 0);

  const otherInvoicesUsedPercent = projectInvoices
    .filter(inv => inv.id !== effectiveInvoiceId)
    .reduce((sum, inv) => {
      const rows = (inv as any).contractClaimRows as Array<{ claimPercent: number }> | null;
      if (!rows || !Array.isArray(rows)) return sum;
      return sum + rows.reduce((s, r) => s + (r.claimPercent || 0), 0);
    }, 0);
  const remainingClaimPercent = Math.max(0, 100 - otherInvoicesUsedPercent);

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

  const calculateGST = () => {
    const subtotal = calculateSubtotal();
    const markupVal = calculateMarkup();
    return (subtotal + markupVal) * 0.1;
  };

  const calculateTotal = () => calculateSubtotal() + calculateMarkup() + calculateGST();

  const amountExTax = () => calculateSubtotal() + calculateMarkup();
  const amountTax = () => calculateGST();
  const amountIncTax = () => calculateTotal();

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

  const buildInvoicePayload = (data: InvoiceFormData) => ({
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
    subtotal: Math.round(calculateSubtotal() * 100),
    markupAmount: Math.round(calculateMarkup() * 100),
    gstAmount: Math.round(calculateGST() * 100),
    totalAmount: Math.round(calculateTotal() * 100),
    lockedContractPrice: lockedContractPrice,
    columnConfig: columnConfig,
    showAmountsIncTax: showAmountsIncTax,
    contractClaimRows: contractClaimRows,
  });

  const createMutation = useMutation({
    mutationFn: async (data: InvoiceFormData) => {
      const invoiceData = {
        ...buildInvoicePayload(data),
        paidAmount: 0,
        balanceAmount: Math.round(calculateTotal() * 100),
        status: "draft",
      };

      const invoiceRes = await apiRequest("/api/client-invoices", "POST", invoiceData);
      const newInvoice = (await invoiceRes.json()) as ClientInvoice;

      for (let i = 0; i < customLines.length; i++) {
        const item = customLines[i];
        await apiRequest(`/api/client-invoices/${newInvoice.id}/items`, "POST", {
          invoiceId: newInvoice.id,
          name: item.name,
          description: item.description,
          quantity: item.quantity,
          unitPrice: Math.round(item.unitPrice * 100),
          totalPrice: Math.round(item.totalPrice * 100),
          taxable: item.taxable,
          sortOrder: i,
          unit: item.unit || null,
          costCodeId: item.costCodeId || null,
          xeroAccountCode: item.xeroAccountCode || null,
        });
      }


      for (const variationId of selectedVariationIds) {
        await apiRequest(`/api/client-invoices/${newInvoice.id}/variations`, "POST", {
          invoiceId: newInvoice.id,
          variationId,
          claimPercent: variationClaims[variationId] ?? 100,
        });
      }

      for (const estimateItemId of selectedAllowanceIds) {
        await apiRequest(`/api/client-invoices/${newInvoice.id}/allowances`, "POST", {
          invoiceId: newInvoice.id,
          estimateItemId,
          claimPercent: allowanceClaims[estimateItemId] ?? 100,
        });
      }

      if (invoiceType === "cost_plus") {
        for (const billId of selectedBillIds) {
          await apiRequest(`/api/client-invoices/${newInvoice.id}/bills`, "POST", {
            invoiceId: newInvoice.id,
            billId,
          });
        }
        for (const timesheetId of selectedTimesheetIds) {
          await apiRequest(`/api/client-invoices/${newInvoice.id}/timesheets`, "POST", {
            invoiceId: newInvoice.id,
            timesheetId,
          });
        }
        for (const selectionOptionId of selectedSelectionOptionIds) {
          await apiRequest(`/api/client-invoices/${newInvoice.id}/selections`, "POST", {
            invoiceId: newInvoice.id,
            selectionOptionId,
          });
        }
      }

      return newInvoice;
    },
    onSuccess: (inv) => {
      queryClient.invalidateQueries({ queryKey: ["/api/client-invoices"] });
      if (user?.id) {
        logActivity({
          projectId: inv.projectId,
          userId: user.id,
          activityType: "invoice",
          action: "created",
          description: `User created invoice '${inv.invoiceNumber}'`,
          entityId: inv.id,
          entityName: inv.invoiceNumber || `INV-${inv.id.slice(0, 8)}`,
          metadata: {},
        });
      }
      toast({ title: "Success", description: "Invoice created successfully" });
      handleCancel();
    },
    onError: (error: Error) => {
      toast({ title: "Error", description: error.message || "Failed to create invoice", variant: "destructive" });
    },
  });

  const updateMutation = useMutation({
    mutationFn: async (data: InvoiceFormData) => {
      const invoiceData = {
        ...buildInvoicePayload(data),
        paidAmount: invoice?.paidAmount || 0,
        balanceAmount:
          Math.round(calculateTotal() * 100) - (invoice?.paidAmount || 0),
      };

      const invoiceRes = await apiRequest(
        `/api/client-invoices/${effectiveInvoiceId}`,
        "PATCH",
        invoiceData
      );
      const updatedInvoice = (await invoiceRes.json()) as ClientInvoice;

      // Sync custom lines
      const existingIds = existingCustomLines.map((item) => item.id);
      const currentIds = customLines.map((item) => item.id).filter(Boolean);
      for (const itemId of existingIds.filter((id) => !currentIds.includes(id))) {
        await apiRequest(`/api/client-invoice-items/${itemId}`, "DELETE");
      }
      for (let i = 0; i < customLines.length; i++) {
        const item = customLines[i];
        const itemData = {
          invoiceId: effectiveInvoiceId,
          name: item.name,
          description: item.description,
          quantity: item.quantity,
          unitPrice: Math.round(item.unitPrice * 100),
          totalPrice: Math.round(item.totalPrice * 100),
          taxable: item.taxable,
          sortOrder: i,
          unit: item.unit || null,
          costCodeId: item.costCodeId || null,
          xeroAccountCode: item.xeroAccountCode || null,
        };
        if (item.id) {
          await apiRequest(`/api/client-invoice-items/${item.id}`, "PATCH", itemData);
        } else {
          await apiRequest(
            `/api/client-invoices/${effectiveInvoiceId}/items`,
            "POST",
            itemData
          );
        }
      }

      // Sync cost-plus junctions: delete old, re-add current selection
      if (invoiceType === "cost_plus") {
        // Bills: delete removed
        for (const lb of linkedBills) {
          if (!selectedBillIds.includes(lb.billId)) {
            await apiRequest(`/api/invoice-bills/${lb.id}`, "DELETE");
          }
        }
        for (const billId of selectedBillIds) {
          if (!linkedBills.find((lb: any) => lb.billId === billId)) {
            await apiRequest(`/api/client-invoices/${effectiveInvoiceId}/bills`, "POST", {
              invoiceId: effectiveInvoiceId, billId,
            });
          }
        }
        // Timesheets: delete removed
        for (const lt of linkedTimesheets) {
          if (!selectedTimesheetIds.includes(lt.timesheetId)) {
            await apiRequest(`/api/invoice-timesheets/${lt.id}`, "DELETE");
          }
        }
        for (const timesheetId of selectedTimesheetIds) {
          if (!linkedTimesheets.find((lt: any) => lt.timesheetId === timesheetId)) {
            await apiRequest(`/api/client-invoices/${effectiveInvoiceId}/timesheets`, "POST", {
              invoiceId: effectiveInvoiceId, timesheetId,
            });
          }
        }
        // Selections: delete removed
        for (const ls of linkedSelections) {
          if (!selectedSelectionOptionIds.includes(ls.selectionOptionId)) {
            await apiRequest(`/api/invoice-selections/${ls.id}`, "DELETE");
          }
        }
        for (const selectionOptionId of selectedSelectionOptionIds) {
          if (!linkedSelections.find((ls: any) => ls.selectionOptionId === selectionOptionId)) {
            await apiRequest(`/api/client-invoices/${effectiveInvoiceId}/selections`, "POST", {
              invoiceId: effectiveInvoiceId, selectionOptionId,
            });
          }
        }
      }

      return updatedInvoice;
    },
    onSuccess: (inv) => {
      queryClient.invalidateQueries({ queryKey: ["/api/client-invoices"] });
      queryClient.invalidateQueries({
        queryKey: [`/api/client-invoices/${effectiveInvoiceId}`],
      });
      if (user?.id) {
        logActivity({
          projectId: inv.projectId,
          userId: user.id,
          activityType: "invoice",
          action: "updated",
          description: `User updated invoice '${inv.invoiceNumber}'`,
          entityId: inv.id,
          entityName: inv.invoiceNumber || `INV-${inv.id.slice(0, 8)}`,
          metadata: {},
        });
      }
      toast({ title: "Success", description: "Invoice updated successfully" });
      handleCancel();
    },
    onError: (error: Error) => {
      toast({ title: "Error", description: error.message || "Failed to update invoice", variant: "destructive" });
    },
  });

  const voidPaymentMutation = useMutation({
    mutationFn: async (paymentId: string) => {
      const res = await apiRequest(`/api/client-invoice-payments/${paymentId}/void`, "PATCH");
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [`/api/client-invoices/${effectiveInvoiceId}/payments`] });
      queryClient.invalidateQueries({ queryKey: [`/api/client-invoices/${effectiveInvoiceId}`] });
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

      const paymentRes = await apiRequest(
        `/api/client-invoices/${effectiveInvoiceId}/payments`,
        "POST",
        paymentData
      );
      const newPayment = (await paymentRes.json()) as ClientInvoicePayment;

      const currentPaid = invoice?.paidAmount || 0;
      const newPaid = currentPaid + Math.round(data.amount * 100);
      const total = invoice?.totalAmount || 0;
      const newBalance = total - newPaid;
      let newStatus = invoice?.status || "draft";
      if (newBalance <= 0) newStatus = "paid";
      else if (newPaid > 0) newStatus = "partial";

      await apiRequest(`/api/client-invoices/${effectiveInvoiceId}`, "PATCH", {
        paidAmount: newPaid,
        balanceAmount: newBalance,
        status: newStatus,
      });

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
    onSuccess: () => {
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
          description: `User sent invoice '${invoice.invoiceNumber}'`,
          entityId: invoice.id,
          entityName: invoice.invoiceNumber || `INV-${invoice.id.slice(0, 8)}`,
          metadata: {},
        });
      }
      toast({ title: "Success", description: "Invoice sent successfully" });
      handleCancel();
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
    try {
      const res = await apiRequest("/api/xero/push-client-invoice", "POST", {
        invoiceId: effectiveInvoiceId,
      });
      const data = await res.json();
      if (data.success) {
        toast({
          title: "Sent to Xero",
          description: `Invoice pushed to Xero successfully (${data.xeroInvoiceNumber || data.xeroInvoiceId})`,
        });
        queryClient.invalidateQueries({
          queryKey: [`/api/client-invoices/${effectiveInvoiceId}`],
        });
      }
    } catch (error: any) {
      toast({
        title: "Failed to send to Xero",
        description: error.message || "Could not push invoice to Xero",
        variant: "destructive",
      });
    } finally {
      setXeroPushing(false);
    }
  };

  const syncPaymentMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest(`/api/xero/sync-client-invoice-payment/${effectiveInvoiceId}`, "POST");
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error((err as any).error || "Failed to sync");
      }
      return res.json() as Promise<{ synced: boolean; diff: number; xeroStatus: string }>;
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

  const sendInvoiceEmailMutation = useMutation({
    mutationFn: async () => {
      let pdfBase64: string | undefined;
      if (invoiceSendAttachPdf && effectiveInvoiceId) {
        const subtotalCents = Math.round(amountExTax() * 100);
        const gstCents = Math.round(amountTax() * 100);
        const totalCents = Math.round(amountIncTax() * 100);
        const paidCents = Math.round(paid * 100);
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
            balanceDueCents={totalCents - paidCents}
            brandColor={companySettings?.brandColor || "#6d28d9"}
          />
        ).toBlob();
        const arrayBuf = await blob.arrayBuffer();
        pdfBase64 = btoa(String.fromCharCode(...new Uint8Array(arrayBuf)));
      }
      const res = await apiRequest(`/api/client-invoices/${effectiveInvoiceId}/send-email`, "POST", {
        to: invoiceSendTo,
        subject: invoiceSendSubject,
        body: invoiceSendBody,
        pdfBase64,
        pdfFilename: `invoice-${invoice?.invoiceNumber || "export"}.pdf`,
      });
      if (!res.ok) throw new Error("Failed to send email");
    },
    onSuccess: () => {
      toast({ title: "Email sent successfully" });
      setInvoiceSendModalOpen(false);
    },
    onError: () => {
      toast({ title: "Failed to send email", variant: "destructive" });
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
  const buildInvoicePdfLineItems = () => {
    const lineItems: Array<{ label: string; description?: string; claimPct?: number; amountExTax: number; gst: number; amountIncTax: number }> = [];
    const GST = 0.1;
    if (invoiceType === "progress_payments") {
      // Contract claim rows
      for (const row of contractClaimRows) {
        const base = getEffectiveContractPrice();
        if (!base || !row.claimPercent) continue;
        const incTax = Math.round((base * row.claimPercent) / 100);
        const exTax = Math.round(incTax / (1 + GST));
        const gst = incTax - exTax;
        lineItems.push({ label: row.name || "Contract Claim", description: row.description, claimPct: row.claimPercent, amountExTax: exTax, gst, amountIncTax: incTax });
      }
      // Selected variations
      for (const v of getSelectedVariations()) {
        const pct = variationClaims[v.id] ?? 100;
        const incTax = Math.round((v.totalAmount * pct) / 100);
        const exTax = Math.round(incTax / (1 + GST));
        const gst = incTax - exTax;
        lineItems.push({ label: `Variation ${v.variationNumber || ""}`, description: v.name || undefined, claimPct: pct, amountExTax: exTax, gst, amountIncTax: incTax });
      }
      // Selected allowances
      for (const item of getSelectedAllowanceItems()) {
        const pct = allowanceClaims[item.id] ?? 100;
        const incTax = Math.round((item.priceIncTax * pct) / 100);
        const exTax = Math.round(incTax / (1 + GST));
        const gst = incTax - exTax;
        lineItems.push({ label: `Allowance - ${item.name || ""}`, claimPct: pct, amountExTax: exTax, gst, amountIncTax: incTax });
      }
    } else {
      // Bills
      for (const bill of getSelectedBills()) {
        const incTax = bill.total;
        const exTax = Math.round(incTax / (1 + GST));
        lineItems.push({ label: bill.supplierName || "Bill", description: bill.billNumber || undefined, amountExTax: exTax, gst: incTax - exTax, amountIncTax: incTax });
      }
    }
    // Custom lines (always)
    for (const line of customLines) {
      const exTax = Math.round(line.totalPrice * 100);
      const gst = Math.round(exTax * GST);
      lineItems.push({ label: line.description || "Custom Item", amountExTax: exTax, gst, amountIncTax: exTax + gst });
    }
    return lineItems;
  };

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
    setInvoiceSendTo(clientContact?.email || "");
    setInvoiceSendSubject(`Invoice ${form.watch("invoiceNumber") || invoice?.invoiceNumber || ""} — ${currentProject?.name || ""}`);
    setInvoiceSendBody(`Hi ${clientContact?.name || ""},\n\nPlease find your invoice attached.\n\nKind regards,\n${user?.firstName || ""} ${user?.lastName || ""}`);
    setInvoiceSendModalOpen(true);
  };

  // ── render helpers ────────────────────────────────────────────────────────────

  const renderLineTableHeader = (_includeContractCols: boolean = false) => (
    <TableRow className="h-6 bg-muted/30">
      {isColVisible("name") && <TableHead className="w-40 text-[10px] uppercase tracking-wide text-muted-foreground/50 font-normal py-0 px-2">Name</TableHead>}
      {isColVisible("description") && <TableHead className="text-[10px] uppercase tracking-wide text-muted-foreground/50 font-normal py-0 px-2">Description</TableHead>}
      {isColVisible("claimPercent") && (
        <TableHead className="text-right w-20 text-[10px] uppercase tracking-wide text-muted-foreground/50 font-normal py-0 px-2">Claim %</TableHead>
      )}
      {isColVisible("claimAmount") && (
        <TableHead className="text-right w-28 text-[10px] uppercase tracking-wide text-muted-foreground/50 font-normal py-0 px-2">Claim $</TableHead>
      )}
      {isColVisible("amountExTax") && (
        <TableHead className="text-right w-28 text-[10px] uppercase tracking-wide text-muted-foreground/50 font-normal py-0 px-2">Ex Tax</TableHead>
      )}
      {isColVisible("amountTax") && (
        <TableHead className="text-right w-24 text-[10px] uppercase tracking-wide text-muted-foreground/50 font-normal py-0 px-2">Tax</TableHead>
      )}
      {isColVisible("amountIncTax") && (
        <TableHead className="text-right w-28 text-[10px] uppercase tracking-wide text-muted-foreground/50 font-normal py-0 px-2">Inc Tax</TableHead>
      )}
      <TableHead className="w-8 py-0" />
    </TableRow>
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
                  className="h-6 w-auto px-2 text-xs border rounded-md bg-[#bba7db] text-white border-[#bba7db]/20 hover:bg-[#bba7db]/90 active-elevate-2 flex items-center gap-0.5"
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
            <div className="bg-[#bba7db]/10 flex items-center justify-between px-4 py-2 gap-6">
              <div className="flex items-center gap-5 text-xs">
                <div className="flex items-center gap-1.5" data-testid="header-summary-total">
                  <span className="text-muted-foreground">Total</span>
                  <span className="font-semibold">{formatCurrency(total)}</span>
                </div>
                <div className="w-px h-3.5 bg-[#bba7db]/40" />
                <div className="flex items-center gap-1.5" data-testid="header-summary-paid">
                  <span className="text-muted-foreground">Paid</span>
                  <span className="font-semibold text-emerald-600 dark:text-emerald-400">{formatCurrency(paid)}</span>
                </div>
                <div className="w-px h-3.5 bg-[#bba7db]/40" />
                <div className="flex items-center gap-1.5" data-testid="header-summary-due">
                  <span className="text-muted-foreground">Due</span>
                  <span className={cn(
                    "font-semibold",
                    due <= 0
                      ? "text-emerald-600 dark:text-emerald-400"
                      : paid > 0
                      ? "text-amber-600 dark:text-amber-400"
                      : "text-red-500 dark:text-red-400"
                  )}>{formatCurrency(due)}</span>
                </div>
              </div>

              <div className="flex items-center gap-1.5">
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
                {isEditMode && xeroStatus?.connected && !(invoice as any)?.xeroInvoiceId && (
                  <button
                    type="button"
                    onClick={handlePushToXero}
                    disabled={xeroPushing}
                    className="h-6 w-auto px-2 text-xs border rounded-md hover-elevate active-elevate-2 flex items-center gap-1 text-blue-600 dark:text-blue-400 border-blue-300 dark:border-blue-600"
                    data-testid="button-send-to-xero"
                  >
                    {xeroPushing ? (
                      <Loader2 className="w-3 h-3 animate-spin" />
                    ) : (
                      <Send className="w-3 h-3" />
                    )}
                    <span>Send to Xero</span>
                  </button>
                )}
                {isEditMode && (invoice as any)?.xeroInvoiceId && (
                  <span className="text-[10px] text-green-600 dark:text-green-400 flex items-center gap-0.5 px-1">
                    Synced to Xero
                  </span>
                )}
                {!isEditMode && (invoice as any)?.xeroInvoiceId && xeroStatus?.connected && (
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    onClick={() => syncPaymentMutation.mutate()}
                    disabled={syncPaymentMutation.isPending}
                    data-testid="button-sync-payment-from-xero"
                    className="h-7 text-xs gap-1.5"
                  >
                    {syncPaymentMutation.isPending ? (
                      <Loader2 className="w-3 h-3 animate-spin" />
                    ) : (
                      <RefreshCw className="w-3 h-3" />
                    )}
                    Sync from Xero
                  </Button>
                )}
              </div>
            </div>

          </div>{/* end unified header card */}

          {/* Main Content */}
          <div className="flex-1 overflow-auto">
            <div className="max-w-4xl mx-auto px-3 py-3 space-y-3">

                {/* Bill To strip — shows billing recipient (client + project) */}
                {(currentProject || clientContact) && (
                  <div className="rounded-lg border border-border bg-card overflow-hidden">
                    <div className="h-8 flex items-center px-3 gap-2 border-b border-border/50 bg-muted/40">
                      <div className="w-1.5 h-1.5 rounded-full flex-shrink-0 bg-[#bba7db]/80" />
                      <span className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Bill To</span>
                    </div>
                    <div className="px-4 py-2.5 flex items-start gap-6">
                      {clientContact && (
                        <div className="min-w-0">
                          <div className="text-xs font-semibold truncate">{clientContact.name}</div>
                          {clientContact.company && (
                            <div className="text-xs text-muted-foreground truncate">{clientContact.company}</div>
                          )}
                          {(clientContact.addressFormatted || clientContact.address) && (
                            <div className="text-xs text-muted-foreground truncate">{clientContact.addressFormatted || clientContact.address}</div>
                          )}
                        </div>
                      )}
                      {currentProject && (
                        <div className="min-w-0">
                          <div className="text-[10px] text-muted-foreground/60 uppercase tracking-wide">Project</div>
                          <div className="text-xs font-medium truncate">{(currentProject as any).name}</div>
                          {(currentProject as any).location && (
                            <div className="text-xs text-muted-foreground truncate">{(currentProject as any).location}</div>
                          )}
                        </div>
                      )}
                    </div>
                  </div>
                )}

                {/* Card 1 — Invoice Info */}
                <div className="rounded-lg border border-border bg-card overflow-hidden">

                  {/* Section header */}
                  <div className="h-8 flex items-center px-3 gap-2 border-b border-border/50">
                    <div className="w-1.5 h-1.5 rounded-full flex-shrink-0 bg-[#bba7db]/80" />
                    <span className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Invoice Info</span>
                  </div>

                  {/* Invoice Name + Number + Dates */}
                  <div className="px-4 py-3 space-y-3">
                      <div className="grid grid-cols-3 gap-4">
                        <FormField
                          control={form.control}
                          name="name"
                          render={({ field }) => (
                            <FormItem className="col-span-2">
                              <FormLabel className="h-4 leading-none flex items-center text-[11px] text-muted-foreground/70 uppercase tracking-wide font-medium">Invoice Name*</FormLabel>
                              <FormControl>
                                <Input {...field} className="h-8 text-sm" data-testid="input-name" />
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
                              <FormLabel className="h-4 leading-none flex items-center gap-1.5 text-[11px] text-muted-foreground/70 uppercase tracking-wide font-medium">
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
                                    "h-8 text-sm",
                                    !invoiceNumberOverride && !isEditMode
                                      ? "bg-muted text-muted-foreground cursor-default"
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

                      {/* Invoice Date + Due Date */}
                      <div className="grid grid-cols-3 gap-4">
                        <FormField
                          control={form.control}
                          name="invoiceDate"
                          render={({ field }) => (
                            <FormItem className="flex flex-col">
                              <FormLabel className="h-4 leading-none flex items-center text-[11px] text-muted-foreground/70 uppercase tracking-wide font-medium">Invoice Date</FormLabel>
                              <Popover open={invoiceDateOpen} onOpenChange={setInvoiceDateOpen}>
                                <PopoverTrigger asChild>
                                  <FormControl>
                                    <Button
                                      variant="outline"
                                      size="sm"
                                      className={cn(
                                        "justify-start text-left font-normal text-sm",
                                        !field.value && "text-muted-foreground"
                                      )}
                                      data-testid="button-invoice-date"
                                    >
                                      <CalendarIcon className="mr-2 h-4 w-4" />
                                      {field.value ? format(field.value, "PPP") : "Pick a date"}
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
                              <FormLabel className="h-4 leading-none flex items-center text-[11px] text-muted-foreground/70 uppercase tracking-wide font-medium">Due Date</FormLabel>
                              <Popover open={dueDateOpen} onOpenChange={setDueDateOpen}>
                                <PopoverTrigger asChild>
                                  <FormControl>
                                    <Button
                                      variant="outline"
                                      size="sm"
                                      className={cn(
                                        "justify-start text-left font-normal text-sm",
                                        !field.value && "text-muted-foreground"
                                      )}
                                      data-testid="button-due-date"
                                    >
                                      <CalendarIcon className="mr-2 h-4 w-4" />
                                      {field.value ? format(field.value, "PPP") : "Pick a date"}
                                    </Button>
                                  </FormControl>
                                </PopoverTrigger>
                                <PopoverContent className="w-auto p-0">
                                  {paymentTermsOptions.length > 0 && (
                                    <div className="p-2 border-b flex flex-wrap gap-1">
                                      {paymentTermsOptions.map((opt) => (
                                        <button
                                          key={opt.id}
                                          type="button"
                                          className="h-6 px-2 text-xs rounded-md border border-border/60 bg-muted/40 hover-elevate"
                                          onClick={() => {
                                            const base = form.getValues("invoiceDate") || new Date();
                                            field.onChange(addDays(base, opt.dueValue));
                                            setDueDateOpen(false);
                                          }}
                                        >
                                          {opt.name}
                                        </button>
                                      ))}
                                      {field.value && (
                                        <button
                                          type="button"
                                          className="h-6 px-2 text-xs rounded-md text-muted-foreground hover-elevate"
                                          onClick={() => { field.onChange(undefined); setDueDateOpen(false); }}
                                        >
                                          Clear
                                        </button>
                                      )}
                                    </div>
                                  )}
                                  <Calendar
                                    mode="single"
                                    selected={field.value}
                                    onSelect={(d) => { field.onChange(d); setDueDateOpen(false); }}
                                    initialFocus
                                  />
                                </PopoverContent>
                              </Popover>
                              <FormMessage />
                            </FormItem>
                          )}
                        />
                        <div />
                      </div>

                      {/* Invoice Type toggle — subtle pill */}
                      <div className="flex items-center gap-1.5 pt-0.5">
                        <span className="text-[10px] text-muted-foreground/40 uppercase tracking-wide">Type:</span>
                        <div className="flex items-center rounded-full border border-border/50 overflow-hidden">
                          <button
                            type="button"
                            onClick={() => setInvoiceType("progress_payments")}
                            className={cn(
                              "px-2.5 py-0.5 text-[11px] leading-none transition-colors",
                              invoiceType === "progress_payments"
                                ? "bg-muted text-foreground font-medium"
                                : "text-muted-foreground/50 hover:text-muted-foreground"
                            )}
                          >
                            Progress
                          </button>
                          <div className="w-px h-3 bg-border/50" />
                          <button
                            type="button"
                            onClick={() => setInvoiceType("cost_plus")}
                            className={cn(
                              "px-2.5 py-0.5 text-[11px] leading-none transition-colors",
                              invoiceType === "cost_plus"
                                ? "bg-muted text-foreground font-medium"
                                : "text-muted-foreground/50 hover:text-muted-foreground"
                            )}
                          >
                            Cost Plus
                          </button>
                        </div>
                      </div>
                    </div>

                  {/* Introduction Text — collapsible */}
                  <div className="border-t border-border/50">
                    <div
                      className="h-8 flex items-center justify-between px-3 gap-2 cursor-pointer"
                      onClick={() => setIntroCollapsed((v) => !v)}
                    >
                      <div className="flex items-center gap-2">
                        <div className="w-1.5 h-1.5 rounded-full flex-shrink-0 bg-sky-400/70" />
                        <span className="text-xs font-medium">Introduction</span>
                      </div>
                      {introCollapsed ? (
                        <ChevronDown className="h-3.5 w-3.5 text-muted-foreground flex-shrink-0" />
                      ) : (
                        <ChevronUp className="h-3.5 w-3.5 text-muted-foreground flex-shrink-0" />
                      )}
                    </div>
                    {!introCollapsed && (
                      <div className="px-4 pb-3">
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
                  <div className="h-8 flex items-center px-3 gap-2 border-b border-border/50 bg-muted/40">
                    <div className="w-1.5 h-1.5 rounded-full flex-shrink-0 bg-emerald-400/70" />
                    <span className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Financials</span>
                  </div>

                {invoiceType === "progress_payments" && (
                  <>
                    {/* Contract Price sub-section */}
                    <div data-testid="section-contract-price">
                      <div className="h-8 flex items-center justify-between px-3 gap-2 border-b border-border/50 bg-muted/40">
                        <div className="flex items-center gap-2">
                          <div className="w-1.5 h-1.5 rounded-full flex-shrink-0 bg-blue-400/70" />
                          <span className="text-xs font-medium">Contract Price</span>
                          {getEffectiveContractPrice() && (
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
                        {/* Locked contract price display + unlock popover */}
                        {(() => {
                          const baseCents = getEffectiveContractPrice();
                          return (
                            <div className="flex items-center gap-3 py-2 border-b">
                              <span className="text-xs text-muted-foreground uppercase tracking-wide">
                                Locked Contract Price
                              </span>
                              <span className="font-semibold text-sm">
                                {baseCents ? formatCurrency(baseCents / 100) : (
                                  <span className="text-muted-foreground italic">Not set</span>
                                )}
                              </span>
                              {/* Unlock / override popover */}
                              <Popover>
                                <PopoverTrigger asChild>
                                  <button
                                    type="button"
                                    className="text-muted-foreground hover:text-foreground"
                                    title="Override contract price"
                                  >
                                    <Unlock className="w-3.5 h-3.5" />
                                  </button>
                                </PopoverTrigger>
                                <PopoverContent className="w-64 p-3" align="start">
                                  <p className="text-sm font-medium mb-1">Override contract price?</p>
                                  <p className="text-xs text-muted-foreground mb-3">
                                    This will override the locked price from the project's approved estimate for this invoice only.
                                  </p>
                                  <div className="flex gap-2">
                                    <Input
                                      type="number"
                                      placeholder="Amount (inc GST)"
                                      defaultValue={baseCents ? (baseCents / 100).toFixed(2) : ""}
                                      min="0"
                                      step="0.01"
                                      className="h-8 text-sm"
                                      id="contract-price-override-input"
                                    />
                                    <Button
                                      type="button"
                                      size="sm"
                                      onClick={() => {
                                        const input = document.getElementById("contract-price-override-input") as HTMLInputElement;
                                        const val = parseFloat(input?.value || "0");
                                        if (!isNaN(val) && val >= 0) {
                                          setLockedContractPrice(Math.round(val * 100));
                                        }
                                      }}
                                    >
                                      Set
                                    </Button>
                                  </div>
                                </PopoverContent>
                              </Popover>
                            </div>
                          );
                        })()}

                        {/* Claim rows table */}
                        {contractClaimRows.length > 0 ? (
                          <>
                            <Table>
                              <TableHeader>
                                {renderLineTableHeader()}
                              </TableHeader>
                              <TableBody>
                                {contractClaimRows.map((row) => {
                                  const baseCents = getEffectiveContractPrice() ?? 0;
                                  const claimCents = Math.round((baseCents * row.claimPercent) / 100);
                                  const claimAmt = claimCents / 100;
                                  const exTax = claimAmt / (1 + GST_RATE);
                                  const tax = claimAmt - exTax;
                                  return (
                                    <TableRow key={row.id} className="h-9">
                                      {isColVisible("name") && (
                                        <TableCell className="py-1">
                                          <Input
                                            value={row.name}
                                            onChange={(e) => updateContractClaimRow(row.id, "name", e.target.value)}
                                            className="h-7 text-sm border-0 bg-transparent shadow-none focus-visible:ring-1 focus-visible:ring-ring px-1 rounded-sm placeholder:text-muted-foreground/30"
                                            placeholder="Claim name"
                                          />
                                        </TableCell>
                                      )}
                                      {isColVisible("description") && (
                                        <TableCell className="py-1">
                                          <Input
                                            value={row.description}
                                            onChange={(e) => updateContractClaimRow(row.id, "description", e.target.value)}
                                            className="h-7 text-sm border-0 bg-transparent shadow-none focus-visible:ring-1 focus-visible:ring-ring px-1 rounded-sm placeholder:text-muted-foreground/30"
                                            placeholder="Description"
                                          />
                                        </TableCell>
                                      )}
                                      {isColVisible("claimPercent") && (
                                        <TableCell className="text-right py-1">
                                          <Input
                                            type="number"
                                            min="0"
                                            max="100"
                                            value={row.claimPercent}
                                            onChange={(e) =>
                                              updateContractClaimRow(row.id, "claimPercent", parseFloat(e.target.value) || 0)
                                            }
                                            className="h-7 w-16 text-right text-sm ml-auto border-0 bg-transparent shadow-none focus-visible:ring-1 focus-visible:ring-ring px-1 rounded-sm"
                                          />
                                        </TableCell>
                                      )}
                                      {isColVisible("claimAmount") && (
                                        <TableCell className="text-right text-sm font-medium py-1">
                                          {formatCurrency(claimAmt)}
                                        </TableCell>
                                      )}
                                      {isColVisible("amountExTax") && (
                                        <TableCell className="text-right text-sm py-1">
                                          {formatCurrency(exTax)}
                                        </TableCell>
                                      )}
                                      {isColVisible("amountTax") && (
                                        <TableCell className="text-right text-sm py-1">
                                          {formatCurrency(tax)}
                                        </TableCell>
                                      )}
                                      {isColVisible("amountIncTax") && (
                                        <TableCell className="text-right text-sm font-medium py-1">
                                          {formatCurrency(claimAmt)}
                                        </TableCell>
                                      )}
                                      <TableCell className="py-1 w-8">
                                        <button
                                          type="button"
                                          onClick={() => removeContractClaimRow(row.id)}
                                          className="text-muted-foreground hover:text-destructive"
                                        >
                                          <X className="w-3.5 h-3.5" />
                                        </button>
                                      </TableCell>
                                    </TableRow>
                                  );
                                })}
                              </TableBody>
                            </Table>
                          </>
                        ) : (
                          <p className="text-sm text-muted-foreground text-center py-2">
                            No claim rows yet. Click "Add Claim Row" to begin.
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
                      <div className="h-8 flex items-center justify-between px-3 gap-2 border-b border-border/50 bg-muted/40">
                        <div className="flex items-center gap-2">
                          <div className="w-1.5 h-1.5 rounded-full flex-shrink-0 bg-amber-400/70" />
                          <span className="text-xs font-medium">Variations</span>
                        </div>
                        {selectedVariationIds.length > 0 && (
                          <span className="text-xs font-medium tabular-nums text-muted-foreground">
                            {formatCurrency(calculateVariationsTotal() / 100)}
                          </span>
                        )}
                      </div>

                      <div className="px-4 py-3">
                        {selectedVariationIds.length === 0 ? (
                          <div className="py-1.5 flex items-center gap-3">
                            <button
                              type="button"
                              onClick={() => setVariationsModalOpen(true)}
                              className="h-7 px-3 text-xs border rounded-md hover-elevate active-elevate-2 flex items-center gap-1.5"
                              data-testid="button-select-variations"
                            >
                              <Plus className="w-3 h-3" />
                              Select Variations
                            </button>
                            <span className="text-xs text-muted-foreground/50">No approved variations selected</span>
                          </div>
                        ) : (
                          <>
                            <Table>
                              <TableHeader>
                                {renderLineTableHeader(false)}
                              </TableHeader>
                              <TableBody>
                                {getSelectedVariations().map((variation) => {
                                  const claimPct = variationClaims[variation.id] ?? 100;
                                  const claimAmt =
                                    (variation.totalAmount * claimPct) / 100 / 100;
                                  const exTax = claimAmt / (1 + GST_RATE);
                                  const tax = claimAmt - exTax;
                                  return (
                                    <TableRow key={variation.id} className="h-9">
                                      {isColVisible("name") && (
                                        <TableCell className="text-sm font-medium py-1">
                                          {variation.variationNumber}
                                        </TableCell>
                                      )}
                                      {isColVisible("description") && (
                                        <TableCell className="text-sm text-muted-foreground py-1">
                                          {variation.name}
                                        </TableCell>
                                      )}
                                      {isColVisible("claimPercent") && (
                                        <TableCell className="text-right py-1">
                                          <Input
                                            type="number"
                                            min="0"
                                            max="100"
                                            value={claimPct}
                                            onChange={(e) =>
                                              setVariationClaims((prev) => ({
                                                ...prev,
                                                [variation.id]: parseInt(e.target.value) || 0,
                                              }))
                                            }
                                            className="h-7 w-16 text-right text-sm border-0 bg-transparent shadow-none focus-visible:ring-1 focus-visible:ring-ring ml-auto"
                                          />
                                        </TableCell>
                                      )}
                                      {isColVisible("claimAmount") && (
                                        <TableCell className="text-right text-sm font-medium py-1">
                                          {formatCurrency(claimAmt)}
                                        </TableCell>
                                      )}
                                      {isColVisible("amountExTax") && (
                                        <TableCell className="text-right text-sm py-1">
                                          {formatCurrency(exTax)}
                                        </TableCell>
                                      )}
                                      {isColVisible("amountTax") && (
                                        <TableCell className="text-right text-sm py-1">
                                          {formatCurrency(tax)}
                                        </TableCell>
                                      )}
                                      {isColVisible("amountIncTax") && (
                                        <TableCell className="text-right text-sm font-medium py-1">
                                          {formatCurrency(claimAmt)}
                                        </TableCell>
                                      )}
                                      <TableCell className="py-1 w-8">
                                        <button
                                          type="button"
                                          onClick={() => {
                                            setSelectedVariationIds((prev) =>
                                              prev.filter((id) => id !== variation.id)
                                            );
                                          }}
                                          className="text-muted-foreground hover:text-destructive"
                                        >
                                          <X className="w-3.5 h-3.5" />
                                        </button>
                                      </TableCell>
                                    </TableRow>
                                  );
                                })}
                              </TableBody>
                            </Table>
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
                            <div className="pt-1.5">
                              <button
                                type="button"
                                onClick={() => setVariationsModalOpen(true)}
                                className="text-xs text-muted-foreground hover:text-foreground flex items-center gap-1 transition-colors"
                                data-testid="button-select-variations"
                              >
                                <Plus className="w-3 h-3" />
                                Add more variations
                              </button>
                            </div>
                          </>
                        )}
                      </div>{/* end variations content */}
                    </div>{/* end variations sub-section */}

                    {/* Allowances sub-section */}
                    <div className="border-t border-border/50" data-testid="section-allowances">
                      <div className="h-8 flex items-center justify-between px-3 gap-2 border-b border-border/50 bg-muted/40">
                        <div className="flex items-center gap-2">
                          <div className="w-1.5 h-1.5 rounded-full flex-shrink-0 bg-emerald-400/70" />
                          <span className="text-xs font-medium">Allowances</span>
                        </div>
                        {selectedAllowanceIds.length > 0 && (
                          <span className="text-xs font-medium tabular-nums text-muted-foreground">
                            {formatCurrency(calculateAllowancesTotal() / 100)}
                          </span>
                        )}
                      </div>

                      <div className="px-4 py-3">
                        {selectedAllowanceIds.length === 0 ? (
                          <div className="py-1.5 flex items-center gap-3">
                            <button
                              type="button"
                              onClick={() => setAllowancesModalOpen(true)}
                              className="h-7 px-3 text-xs border rounded-md hover-elevate active-elevate-2 flex items-center gap-1.5"
                              data-testid="button-select-allowances"
                            >
                              <Plus className="w-3 h-3" />
                              Select Allowances
                            </button>
                            <span className="text-xs text-muted-foreground/50">No finalized allowances selected</span>
                          </div>
                        ) : (
                          <>
                            <Table>
                              <TableHeader>
                                {renderLineTableHeader(false)}
                              </TableHeader>
                              <TableBody>
                                {getSelectedAllowanceItems().map((item) => {
                                  const claimPct = allowanceClaims[item.id] ?? 100;
                                  const totalCents = Math.round(
                                    item.priceIncTax * item.quantity * 100
                                  );
                                  const claimAmt = (totalCents * claimPct) / 100 / 100;
                                  const exTax = claimAmt / (1 + GST_RATE);
                                  const tax = claimAmt - exTax;
                                  return (
                                    <TableRow key={item.id} className="h-9">
                                      {isColVisible("name") && (
                                        <TableCell className="text-sm font-medium py-1">
                                          <div className="flex items-center gap-1.5">
                                            {item.name}
                                            <Badge variant="outline" className="text-[10px]">
                                              {item.allowance}
                                            </Badge>
                                          </div>
                                        </TableCell>
                                      )}
                                      {isColVisible("description") && (
                                        <TableCell className="text-sm text-muted-foreground py-1">
                                          {item.description}
                                        </TableCell>
                                      )}
                                      {isColVisible("claimPercent") && (
                                        <TableCell className="text-right py-1">
                                          <Input
                                            type="number"
                                            min="0"
                                            max="100"
                                            value={claimPct}
                                            onChange={(e) =>
                                              setAllowanceClaims((prev) => ({
                                                ...prev,
                                                [item.id]: parseInt(e.target.value) || 0,
                                              }))
                                            }
                                            className="h-7 w-16 text-right text-sm border-0 bg-transparent shadow-none focus-visible:ring-1 focus-visible:ring-ring ml-auto"
                                          />
                                        </TableCell>
                                      )}
                                      {isColVisible("claimAmount") && (
                                        <TableCell className="text-right text-sm font-medium py-1">
                                          {formatCurrency(claimAmt)}
                                        </TableCell>
                                      )}
                                      {isColVisible("amountExTax") && (
                                        <TableCell className="text-right text-sm py-1">
                                          {formatCurrency(exTax)}
                                        </TableCell>
                                      )}
                                      {isColVisible("amountTax") && (
                                        <TableCell className="text-right text-sm py-1">
                                          {formatCurrency(tax)}
                                        </TableCell>
                                      )}
                                      {isColVisible("amountIncTax") && (
                                        <TableCell className="text-right text-sm font-medium py-1">
                                          {formatCurrency(claimAmt)}
                                        </TableCell>
                                      )}
                                      <TableCell className="py-1 w-8">
                                        <button
                                          type="button"
                                          onClick={() =>
                                            setSelectedAllowanceIds((prev) =>
                                              prev.filter((id) => id !== item.id)
                                            )
                                          }
                                          className="text-muted-foreground hover:text-destructive"
                                        >
                                          <X className="w-3.5 h-3.5" />
                                        </button>
                                      </TableCell>
                                    </TableRow>
                                  );
                                })}
                              </TableBody>
                            </Table>
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
                            <div className="pt-1.5">
                              <button
                                type="button"
                                onClick={() => setAllowancesModalOpen(true)}
                                className="text-xs text-muted-foreground hover:text-foreground flex items-center gap-1 transition-colors"
                                data-testid="button-select-allowances"
                              >
                                <Plus className="w-3 h-3" />
                                Add more allowances
                              </button>
                            </div>
                          </>
                        )}
                      </div>{/* end allowances content */}
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
                          <div className="w-1.5 h-1.5 rounded-full flex-shrink-0 bg-emerald-400/70" />
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
                          <p className="text-sm text-muted-foreground text-center py-2">No labour entries selected.</p>
                        ) : (() => {
                          const rows = expandByCostCode(getSelectedTimesheets());
                          const thCls = "text-[10px] uppercase tracking-wide text-muted-foreground/50 font-normal py-0 px-2";
                          const showCostCode = labourBreakByCostCode;

                          if (labourDisplayMode === "individual") {
                            return (
                              <Table>
                                <TableHeader>
                                  <TableRow className="h-6 bg-muted/30">
                                    <TableHead className={thCls}>Date</TableHead>
                                    <TableHead className={thCls}>Staff</TableHead>
                                    {showCostCode && <TableHead className={thCls}>Cost Code</TableHead>}
                                    <TableHead className={`text-right w-16 ${thCls}`}>Hours</TableHead>
                                    <TableHead className={`text-right w-20 ${thCls}`}>Rate</TableHead>
                                    <TableHead className={`text-right w-24 ${thCls}`}>Total</TableHead>
                                    <TableHead className="w-8 py-0" />
                                  </TableRow>
                                </TableHeader>
                                <TableBody>
                                  {rows.map((t: any) => {
                                    const cc = showCostCode ? costCodes.find((c: any) => c.id === t.costCodeId) : null;
                                    const rowKey = t._splitId ? `${t.id}-${t._splitId}` : t.id;
                                    return (
                                      <TableRow key={rowKey} className="h-9">
                                        <TableCell className="text-sm py-1">{t.date ? format(new Date(t.date), "d MMM yyyy") : "—"}</TableCell>
                                        <TableCell className="text-sm py-1">{getUserName(t.userId)}</TableCell>
                                        {showCostCode && <TableCell className="text-sm py-1 text-muted-foreground">{cc?.code || cc?.name || "—"}</TableCell>}
                                        <TableCell className="text-right text-sm py-1">{Number(t.duration).toFixed(1)}</TableCell>
                                        <TableCell className="text-right text-sm py-1">{formatCurrency(Number(t.hourlyRate))}</TableCell>
                                        <TableCell className="text-right text-sm font-medium py-1">{formatCurrency(Number(t.total))}</TableCell>
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
                                  <TableRow className="h-6 bg-muted/30">
                                    <TableHead className={thCls}>Staff</TableHead>
                                    {showCostCode && <TableHead className={thCls}>Cost Code</TableHead>}
                                    <TableHead className={`text-right w-20 ${thCls}`}>Hours</TableHead>
                                    <TableHead className={`text-right w-20 ${thCls}`}>Avg Rate</TableHead>
                                    <TableHead className={`text-right w-24 ${thCls}`}>Total</TableHead>
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
                                        <TableCell className="text-sm py-1 font-medium">{getUserName(userId)}</TableCell>
                                        {showCostCode && <TableCell className="text-sm py-1 text-muted-foreground">{cc?.code || cc?.name || "—"}</TableCell>}
                                        <TableCell className="text-right text-sm py-1">{totalHours.toFixed(1)}</TableCell>
                                        <TableCell className="text-right text-sm py-1">{formatCurrency(avgRate)}</TableCell>
                                        <TableCell className="text-right text-sm font-medium py-1">{formatCurrency(totalCost)}</TableCell>
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
                                  <TableRow className="h-6 bg-muted/30">
                                    <TableHead className={thCls}>Date</TableHead>
                                    <TableHead className={thCls}>Staff</TableHead>
                                    {showCostCode && <TableHead className={thCls}>Cost Code</TableHead>}
                                    <TableHead className={`text-right w-20 ${thCls}`}>Hours</TableHead>
                                    <TableHead className={`text-right w-20 ${thCls}`}>Avg Rate</TableHead>
                                    <TableHead className={`text-right w-24 ${thCls}`}>Total</TableHead>
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
                                        <TableCell className="text-sm py-1 tabular-nums">{dk !== "no-date" ? format(new Date(dk), "d MMM yyyy") : "—"}</TableCell>
                                        <TableCell className="text-xs py-1 text-muted-foreground max-w-[140px] truncate">{staffNames}</TableCell>
                                        {showCostCode && <TableCell className="text-sm py-1 text-muted-foreground">{cc?.code || cc?.name || "—"}</TableCell>}
                                        <TableCell className="text-right text-sm py-1">{totalHours.toFixed(1)}</TableCell>
                                        <TableCell className="text-right text-sm py-1">{formatCurrency(avgRate)}</TableCell>
                                        <TableCell className="text-right text-sm font-medium py-1">{formatCurrency(totalCost)}</TableCell>
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
                                <TableRow className="h-6 bg-muted/30">
                                  <TableHead className={thCls}>Description</TableHead>
                                  {showCostCode && <TableHead className={thCls}>Cost Code</TableHead>}
                                  <TableHead className={`text-right w-20 ${thCls}`}>Hours</TableHead>
                                  <TableHead className={`text-right w-20 ${thCls}`}>Avg Rate</TableHead>
                                  <TableHead className={`text-right w-24 ${thCls}`}>Total</TableHead>
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
                                      <TableCell className="text-sm py-1 font-medium">Labour</TableCell>
                                      {showCostCode && <TableCell className="text-sm py-1 text-muted-foreground">{cc?.code || cc?.name || "—"}</TableCell>}
                                      <TableCell className="text-right text-sm py-1">{totalHours.toFixed(1)}</TableCell>
                                      <TableCell className="text-right text-sm py-1">{formatCurrency(avgRate)}</TableCell>
                                      <TableCell className="text-right text-sm font-medium py-1">{formatCurrency(totalCost)}</TableCell>
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
                          <div className="w-1.5 h-1.5 rounded-full flex-shrink-0 bg-orange-400/70" />
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
                          <p className="text-sm text-muted-foreground text-center py-2">No bills selected.</p>
                        ) : (
                          <Table>
                            <TableHeader>
                              <TableRow className="h-6 bg-muted/30">
                                <TableHead className="text-[10px] uppercase tracking-wide text-muted-foreground/50 font-normal py-0 px-2">Bill No.</TableHead>
                                <TableHead className="text-[10px] uppercase tracking-wide text-muted-foreground/50 font-normal py-0 px-2">Supplier</TableHead>
                                <TableHead className="text-[10px] uppercase tracking-wide text-muted-foreground/50 font-normal py-0 px-2">Date</TableHead>
                                <TableHead className="text-right w-28 text-[10px] uppercase tracking-wide text-muted-foreground/50 font-normal py-0 px-2">Total</TableHead>
                                <TableHead className="w-8 py-0" />
                              </TableRow>
                            </TableHeader>
                            <TableBody>
                              {getSelectedBills().map((b) => (
                                <TableRow key={b.id} className="h-9">
                                  <TableCell className="text-sm font-medium py-1">{b.billNumber}</TableCell>
                                  <TableCell className="text-sm text-muted-foreground py-1">{(b as any).supplierName || "—"}</TableCell>
                                  <TableCell className="text-sm text-muted-foreground py-1">{(b as any).billDate ? format(new Date((b as any).billDate), "d MMM yyyy") : "—"}</TableCell>
                                  <TableCell className="text-right text-sm font-medium py-1">{formatCurrency(b.total / 100)}</TableCell>
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
                          <div className="w-1.5 h-1.5 rounded-full flex-shrink-0 bg-[#bba7db]/80" />
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
                          <p className="text-sm text-muted-foreground text-center py-2">No selections added.</p>
                        ) : (
                          <Table>
                            <TableHeader>
                              <TableRow className="h-6 bg-muted/30">
                                <TableHead className="text-[10px] uppercase tracking-wide text-muted-foreground/50 font-normal py-0 px-2">Selection</TableHead>
                                <TableHead className="text-[10px] uppercase tracking-wide text-muted-foreground/50 font-normal py-0 px-2">Option</TableHead>
                                <TableHead className="text-right w-16 text-[10px] uppercase tracking-wide text-muted-foreground/50 font-normal py-0 px-2">Qty</TableHead>
                                <TableHead className="w-16 text-[10px] uppercase tracking-wide text-muted-foreground/50 font-normal py-0 px-2">Unit</TableHead>
                                <TableHead className="text-right w-28 text-[10px] uppercase tracking-wide text-muted-foreground/50 font-normal py-0 px-2">Total</TableHead>
                                <TableHead className="w-8 py-0" />
                              </TableRow>
                            </TableHeader>
                            <TableBody>
                              {getSelectedSelectionOptions().map((o: any) => (
                                <TableRow key={o.id} className="h-9">
                                  <TableCell className="text-sm py-1">{o.selectionName || "—"}</TableCell>
                                  <TableCell className="text-sm font-medium py-1">{o.name}</TableCell>
                                  <TableCell className="text-right text-sm py-1">{o.quantity}</TableCell>
                                  <TableCell className="text-sm text-muted-foreground py-1">{o.unitType}</TableCell>
                                  <TableCell className="text-right text-sm font-medium py-1">{formatCurrency((o.totalCost || 0) / 100)}</TableCell>
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
                      <div className="w-1.5 h-1.5 rounded-full flex-shrink-0 bg-[#bba7db]/70" />
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
                    {customLines.length === 0 ? (
                      <p className="text-sm text-muted-foreground text-center py-4 px-4">
                        No custom lines. Click "Add Line" to add a custom line item.
                      </p>
                    ) : (
                      <Table className="min-w-[1060px]">
                        <TableHeader>
                          <TableRow className="h-6 bg-muted/30">
                            <TableHead className="w-8 py-0 px-2" />
                            {isColVisible("name") && <TableHead className="w-32 text-[10px] uppercase tracking-wide text-muted-foreground/50 font-normal py-0 px-2">Name</TableHead>}
                            {isColVisible("description") && <TableHead className="text-[10px] uppercase tracking-wide text-muted-foreground/50 font-normal py-0 px-2">Description</TableHead>}
                            <TableHead className="w-36 text-[10px] uppercase tracking-wide text-muted-foreground/50 font-normal py-0 px-2">Cost Code</TableHead>
                            <TableHead className="w-20 text-[10px] uppercase tracking-wide text-muted-foreground/50 font-normal py-0 px-2">Unit</TableHead>
                            <TableHead className="text-right w-14 text-[10px] uppercase tracking-wide text-muted-foreground/50 font-normal py-0 px-2">Qty</TableHead>
                            <TableHead className="text-right w-24 text-[10px] uppercase tracking-wide text-muted-foreground/50 font-normal py-0 px-2">Unit Cost</TableHead>
                            <TableHead className="w-28 text-[10px] uppercase tracking-wide text-muted-foreground/50 font-normal py-0 px-2">Tax</TableHead>
                            <TableHead className="w-32 text-[10px] uppercase tracking-wide text-muted-foreground/50 font-normal py-0 px-2">Account</TableHead>
                            {isColVisible("amountExTax") && (
                              <TableHead className="text-right w-24 text-[10px] uppercase tracking-wide text-muted-foreground/50 font-normal py-0 px-2">Ex Tax</TableHead>
                            )}
                            {isColVisible("amountTax") && (
                              <TableHead className="text-right w-20 text-[10px] uppercase tracking-wide text-muted-foreground/50 font-normal py-0 px-2">Tax $</TableHead>
                            )}
                            {isColVisible("amountIncTax") && (
                              <TableHead className="text-right w-24 text-[10px] uppercase tracking-wide text-muted-foreground/50 font-normal py-0 px-2">Inc Tax</TableHead>
                            )}
                            <TableHead className="w-8 py-0" />
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {customLines.map((line, index) => {
                            const exTax = line.totalPrice / (1 + GST_RATE);
                            const tax = line.totalPrice - exTax;
                            return (
                              <TableRow key={index} className="h-9" data-testid={`custom-line-${index}`}>
                                {/* Visual-only checkbox */}
                                <TableCell className="py-1 px-2 w-8">
                                  <div className="w-4 h-4 rounded border border-input flex items-center justify-center" />
                                </TableCell>
                                {isColVisible("name") && (
                                  <TableCell className="py-1">
                                    <Input
                                      value={line.name}
                                      onChange={(e) => updateCustomLine(index, "name", e.target.value)}
                                      placeholder="Name"
                                      className="h-7 text-sm border-0 bg-transparent shadow-none focus-visible:ring-1 focus-visible:ring-ring px-1 rounded-sm placeholder:text-muted-foreground/30"
                                    />
                                  </TableCell>
                                )}
                                {isColVisible("description") && (
                                  <TableCell className="py-1">
                                    <Input
                                      value={line.description}
                                      onChange={(e) => updateCustomLine(index, "description", e.target.value)}
                                      placeholder="Description"
                                      className="h-7 text-sm border-0 bg-transparent shadow-none focus-visible:ring-1 focus-visible:ring-ring px-1 rounded-sm placeholder:text-muted-foreground/30"
                                    />
                                  </TableCell>
                                )}
                                {/* Cost Code */}
                                <TableCell className="py-1 w-36">
                                  <Select
                                    value={line.costCodeId || "__none__"}
                                    onValueChange={(v) => updateCustomLine(index, "costCodeId", v === "__none__" ? null : v)}
                                  >
                                    <SelectTrigger className="h-7 text-xs border-0 bg-transparent shadow-none focus:ring-1 focus:ring-ring px-1 rounded-sm w-full">
                                      <SelectValue placeholder="— Cost code —" />
                                    </SelectTrigger>
                                    <SelectContent>
                                      <SelectItem value="__none__"><span className="text-muted-foreground">— None —</span></SelectItem>
                                      {(costCodes as any[]).map((cc: any) => (
                                        <SelectItem key={cc.id} value={cc.id}>{cc.title || cc.code}</SelectItem>
                                      ))}
                                    </SelectContent>
                                  </Select>
                                </TableCell>
                                {/* Unit */}
                                <TableCell className="py-1 w-20">
                                  <Input
                                    value={line.unit || ""}
                                    onChange={(e) => updateCustomLine(index, "unit", e.target.value)}
                                    placeholder="unit"
                                    className="h-7 text-sm border-0 bg-transparent shadow-none focus-visible:ring-1 focus-visible:ring-ring px-1 rounded-sm placeholder:text-muted-foreground/30"
                                  />
                                </TableCell>
                                {/* Qty */}
                                <TableCell className="py-1">
                                  <Input
                                    type="number"
                                    value={line.quantity}
                                    onChange={(e) => updateCustomLine(index, "quantity", parseFloat(e.target.value) || 0)}
                                    className="h-7 w-14 text-right text-sm border-0 bg-transparent shadow-none focus-visible:ring-1 focus-visible:ring-ring px-1 rounded-sm ml-auto"
                                  />
                                </TableCell>
                                {/* Unit Cost */}
                                <TableCell className="py-1">
                                  <Input
                                    type="number"
                                    value={line.unitPrice}
                                    onChange={(e) => updateCustomLine(index, "unitPrice", parseFloat(e.target.value) || 0)}
                                    className="h-7 w-20 text-right text-sm border-0 bg-transparent shadow-none focus-visible:ring-1 focus-visible:ring-ring px-1 rounded-sm ml-auto"
                                  />
                                </TableCell>
                                {/* Tax text */}
                                <TableCell className="py-1 w-28">
                                  <button
                                    type="button"
                                    onClick={() => updateCustomLine(index, "taxable", !line.taxable)}
                                    className="text-xs text-muted-foreground hover:text-foreground whitespace-nowrap"
                                  >
                                    {line.taxable ? "GST on income" : "No Tax"}
                                  </button>
                                </TableCell>
                                {/* Account */}
                                <TableCell className="py-1 w-32">
                                  {xeroAccounts.length > 0 ? (
                                    <Select
                                      value={line.xeroAccountCode || "__none__"}
                                      onValueChange={(val) => updateCustomLine(index, "xeroAccountCode", val === "__none__" ? null : val)}
                                    >
                                      <SelectTrigger className="h-7 text-xs border-0 bg-transparent shadow-none focus:ring-1 focus:ring-ring px-1 rounded-sm w-full" data-testid={`select-account-${index}`}>
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
                                      className="w-full h-7 px-1.5 text-xs bg-transparent border-0 outline-none focus:ring-1 focus:ring-ring rounded-sm placeholder:text-muted-foreground/30"
                                      data-testid={`input-account-${index}`}
                                    />
                                  )}
                                </TableCell>
                                {isColVisible("amountExTax") && (
                                  <TableCell className="text-right text-sm py-1">
                                    {line.taxable ? formatCurrency(exTax) : formatCurrency(line.totalPrice)}
                                  </TableCell>
                                )}
                                {isColVisible("amountTax") && (
                                  <TableCell className="text-right text-sm py-1">
                                    {line.taxable ? formatCurrency(tax) : formatCurrency(0)}
                                  </TableCell>
                                )}
                                {isColVisible("amountIncTax") && (
                                  <TableCell className="text-right text-sm font-medium py-1">
                                    {formatCurrency(line.totalPrice)}
                                  </TableCell>
                                )}
                                <TableCell className="py-1 w-8">
                                  <button
                                    type="button"
                                    onClick={() => deleteCustomLine(index)}
                                    className="text-muted-foreground hover:text-destructive"
                                    data-testid={`button-delete-custom-line-${index}`}
                                  >
                                    <X className="w-3.5 h-3.5" />
                                  </button>
                                </TableCell>
                              </TableRow>
                            );
                          })}
                        </TableBody>
                      </Table>
                    )}
                  </div>{/* end custom lines content */}
                </div>{/* end custom lines sub-section */}


              {/* ── Invoice Summary ── */}
              <div data-testid="summary-panel">
                <div className="bg-[#bba7db]/10 px-4 py-3 flex items-center justify-between gap-4">
                  <div className="flex items-center gap-2">
                    <div className="w-1.5 h-1.5 rounded-full flex-shrink-0 bg-[#bba7db]/80" />
                    <span className="text-xs font-medium">Invoice Summary</span>
                  </div>
                  <div className="flex items-center gap-1.5 text-xs">
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
                                <span className="font-medium text-emerald-600 dark:text-emerald-400 tabular-nums">
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
                                  ? "text-emerald-600 dark:text-emerald-400"
                                  : paid > 0
                                  ? "text-amber-600 dark:text-amber-400"
                                  : "text-red-500 dark:text-red-400"
                              )}>
                                {due <= 0 ? "Paid in Full" : "Balance Due"}
                              </span>
                              <span
                                className={cn(
                                  "tabular-nums",
                                  due <= 0
                                    ? "text-emerald-600 dark:text-emerald-400"
                                    : paid > 0
                                    ? "text-amber-600 dark:text-amber-400"
                                    : "text-red-500 dark:text-red-400"
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
              </div>{/* end Card 2: Financials */}

              {/* ── Card 3: Documentation ── */}
              <div className="rounded-lg border border-border bg-card overflow-hidden">
                {/* Closing Text sub-section */}
                <div>
                  <div
                    className="h-8 flex items-center justify-between px-3 gap-2 border-b border-border/50 cursor-pointer bg-muted/40"
                    onClick={() => setClosingCollapsed((v) => !v)}
                  >
                    <div className="flex items-center gap-2">
                      <div className="w-1.5 h-1.5 rounded-full flex-shrink-0 bg-amber-400/70" />
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
                      <div className="w-1.5 h-1.5 rounded-full flex-shrink-0 bg-slate-400/60" />
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
                          className="text-xs text-[#bba7db] hover:underline"
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
                  <div className="h-8 flex items-center justify-between px-3 gap-2 border-b border-border/50 bg-muted/40">
                    <div className="flex items-center gap-2">
                      <div className="w-1.5 h-1.5 rounded-full flex-shrink-0 bg-slate-400/60" />
                      <Paperclip className="h-3 w-3 text-muted-foreground flex-shrink-0" />
                      <span className="text-xs font-medium">Attachments</span>
                    </div>
                  </div>
                  <div className="px-4 py-3">
                    <p className="text-sm text-muted-foreground text-center py-2">
                      No attachments
                    </p>
                  </div>
                </div>
              </div>{/* end Card 3: Documentation */}

                {/* ── Card 5: Payments ── */}
                {isEditMode && (
                  <div className="rounded-lg border border-border bg-card overflow-hidden" data-testid="section-payments-history">
                    <div className="h-8 flex items-center justify-between px-3 gap-2 border-b border-border/50">
                      <div className="flex items-center gap-2">
                        <div className="w-1.5 h-1.5 rounded-full flex-shrink-0 bg-emerald-400/70" />
                        <span className="text-xs font-medium">Payments ({payments.length})</span>
                      </div>
                      <button
                        type="button"
                        onClick={() => setPaymentDialogOpen(true)}
                        className="h-6 px-2 text-xs border rounded-md bg-[#bba7db] text-white border-[#bba7db]/20 hover:bg-[#bba7db]/90 active-elevate-2 flex items-center gap-0.5"
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
                            <TableRow className="h-6 bg-muted/30">
                              <TableHead className="text-[10px] uppercase tracking-wide text-muted-foreground/50 font-normal py-0 px-2">Date</TableHead>
                              <TableHead className="text-right text-[10px] uppercase tracking-wide text-muted-foreground/50 font-normal py-0 px-2">Amount</TableHead>
                              <TableHead className="text-[10px] uppercase tracking-wide text-muted-foreground/50 font-normal py-0 px-2">Method</TableHead>
                              <TableHead className="text-[10px] uppercase tracking-wide text-muted-foreground/50 font-normal py-0 px-2">Reference</TableHead>
                              <TableHead className="w-16 py-0 px-2" />
                            </TableRow>
                          </TableHeader>
                          <TableBody>
                            {payments.map((payment) => (
                              <TableRow key={payment.id} className={cn("h-9", (payment as any).isVoided && "opacity-50")}>
                                <TableCell className="text-sm px-2">
                                  {payment.paymentDate
                                    ? format(new Date(payment.paymentDate), "d MMM yyyy")
                                    : "-"}
                                </TableCell>
                                <TableCell className={cn("text-right text-sm font-medium px-2", (payment as any).isVoided && "line-through")}>
                                  {formatCurrency(payment.amount / 100)}
                                </TableCell>
                                <TableCell className="text-sm text-muted-foreground px-2">
                                  {payment.paymentMethod || "-"}
                                </TableCell>
                                <TableCell className="text-sm text-muted-foreground px-2">
                                  {payment.reference || "-"}
                                </TableCell>
                                <TableCell className="px-2 w-16">
                                  {(payment as any).isVoided ? (
                                    <Badge variant="secondary" className="text-[10px] h-4 px-1.5">Voided</Badge>
                                  ) : (
                                    <button
                                      type="button"
                                      onClick={() => voidPaymentMutation.mutate(payment.id)}
                                      disabled={voidPaymentMutation.isPending}
                                      className="h-5 px-1.5 text-[10px] border rounded text-muted-foreground hover-elevate flex items-center gap-0.5"
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
                        <p className="text-sm text-muted-foreground text-center py-2">
                          No payments recorded
                        </p>
                      )}
                    </div>
                  </div>
                )}

            </div>
          </div>

          {/* Footer for sent/partial */}
          {isEditMode && (invoice?.status === "sent" || invoice?.status === "partial") && (
            <div className="h-9 bg-background flex items-center justify-end px-2 border-t border-border flex-shrink-0">
              <button
                type="button"
                onClick={() => setPaymentDialogOpen(true)}
                className="h-6 w-auto px-2 text-xs border rounded-md bg-[#bba7db] text-white border-[#bba7db]/20 flex items-center gap-1"
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
            {variations.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-8">
                No variations found for this project.
              </p>
            ) : (
              variations.map((v) => {
                const isApproved = v.status === "approved";
                const isSelected = selectedVariationIds.includes(v.id);
                return (
                  <div
                    key={v.id}
                    className={cn(
                      "flex items-center gap-3 p-3 rounded-md border",
                      isApproved
                        ? "hover-elevate cursor-pointer"
                        : "opacity-40 cursor-not-allowed"
                    )}
                    onClick={() => {
                      if (!isApproved) return;
                      setSelectedVariationIds((prev) =>
                        isSelected
                          ? prev.filter((id) => id !== v.id)
                          : [...prev, v.id]
                      );
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
            {getAllowanceItems().length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-8">
                No allowance items (PC/PS) found in the selected estimate.
              </p>
            ) : (
              getAllowanceItems().map((item) => {
                const isFinalized = item.allowanceStatus === "finalized";
                const isSelected = selectedAllowanceIds.includes(item.id);
                const totalAmt = item.priceIncTax * item.quantity;
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
              <span className="text-[10px] uppercase tracking-wide text-muted-foreground/50 flex-shrink-0">Invoice will show labour as</span>
              <div className="flex items-center rounded-full border border-border/50 overflow-hidden">
                {(["individual", "by_user", "by_date", "single"] as const).map((mode, i, arr) => (
                  <button
                    key={mode}
                    type="button"
                    onClick={() => setLabourDisplayMode(mode)}
                    className={cn(
                      "px-2.5 py-1 text-[11px] leading-none transition-colors",
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
              <label htmlFor="break-by-cost-code" className="text-[11px] text-muted-foreground cursor-pointer select-none">
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
                  const thCls = "text-[10px] uppercase tracking-wide text-muted-foreground/50 font-normal py-0 px-2 cursor-pointer select-none hover:text-muted-foreground whitespace-nowrap";
                  return (
                    <>
                      <TableHeader>
                        <TableRow className="h-6 bg-muted/30 hover:bg-muted/30">
                          <TableHead className="w-8 py-0 px-2" />
                          <TableHead className={thCls} onClick={() => labourSortToggle("date")}>Date <SortIcon col="date" current={labourSortCol} dir={labourSortDir} /></TableHead>
                          <TableHead className={thCls} onClick={() => labourSortToggle("staff")}>Staff <SortIcon col="staff" current={labourSortCol} dir={labourSortDir} /></TableHead>
                          <TableHead className={thCls} onClick={() => labourSortToggle("status")}>Status <SortIcon col="status" current={labourSortCol} dir={labourSortDir} /></TableHead>
                          <TableHead className={`text-right ${thCls}`} onClick={() => labourSortToggle("hours")}>Hours <SortIcon col="hours" current={labourSortCol} dir={labourSortDir} /></TableHead>
                          <TableHead className={thCls} onClick={() => labourSortToggle("costCode")}>Cost Code <SortIcon col="costCode" current={labourSortCol} dir={labourSortDir} /></TableHead>
                          <TableHead className={`${thCls} cursor-default`}>Labels</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {base.length === 0 ? (
                          <TableRow><TableCell colSpan={7} className="text-center text-sm text-muted-foreground py-8">No timesheets found.</TableCell></TableRow>
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
                              <TableCell className="py-1 text-sm tabular-nums whitespace-nowrap">{t.date ? format(new Date(t.date), "d MMM yy") : "—"}</TableCell>
                              <TableCell className="py-1 text-sm font-medium whitespace-nowrap">{getUserName(t.userId)}</TableCell>
                              <TableCell className="py-1 whitespace-nowrap">
                                {isApproved
                                  ? <span className="flex items-center gap-1 text-xs"><div className="w-1.5 h-1.5 rounded-full bg-emerald-400 flex-shrink-0" />Approved</span>
                                  : <span className="flex items-center gap-1 text-xs"><div className="w-1.5 h-1.5 rounded-full bg-amber-400 flex-shrink-0" />Pending</span>}
                              </TableCell>
                              <TableCell className="py-1 text-right text-sm tabular-nums">{Number(t.duration).toFixed(1)}</TableCell>
                              <TableCell className="py-1 text-sm text-muted-foreground whitespace-nowrap">{cc?.title || cc?.code || "—"}</TableCell>
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
                  const thCls = "text-[10px] uppercase tracking-wide text-muted-foreground/50 font-normal py-0 px-2 cursor-pointer select-none hover:text-muted-foreground whitespace-nowrap";
                  const billStatusBadge = (status: string) => {
                    const map: Record<string, { label: string; cls: string }> = {
                      draft: { label: "Draft", cls: "text-muted-foreground" },
                      awaiting_approval: { label: "Pending Approval", cls: "text-amber-600 dark:text-amber-400" },
                      awaiting_payment: { label: "Awaiting Payment", cls: "text-blue-600 dark:text-blue-400" },
                      paid: { label: "Paid", cls: "text-emerald-600 dark:text-emerald-400" },
                    };
                    const s = map[status] || { label: status || "—", cls: "text-muted-foreground" };
                    return (
                      <span className={cn("flex items-center gap-1 text-xs whitespace-nowrap", s.cls)}>
                        <div className={cn("w-1.5 h-1.5 rounded-full flex-shrink-0", {
                          "bg-muted-foreground/60": status === "draft",
                          "bg-amber-400": status === "awaiting_approval",
                          "bg-blue-400": status === "awaiting_payment",
                          "bg-emerald-400": status === "paid",
                        })} />
                        {s.label}
                      </span>
                    );
                  };
                  return (
                    <>
                      <TableHeader>
                        <TableRow className="h-6 bg-muted/30 hover:bg-muted/30">
                          <TableHead className="w-8 py-0 px-2" />
                          {isBillColVisible("billNumber") && <TableHead className={thCls} onClick={() => billsSortToggle("billNumber")}>Bill No. <SortIcon col="billNumber" current={billsSortCol} dir={billsSortDir} /></TableHead>}
                          {isBillColVisible("status") && <TableHead className={thCls} onClick={() => billsSortToggle("status")}>Status <SortIcon col="status" current={billsSortCol} dir={billsSortDir} /></TableHead>}
                          {isBillColVisible("supplier") && <TableHead className={thCls} onClick={() => billsSortToggle("supplier")}>Supplier <SortIcon col="supplier" current={billsSortCol} dir={billsSortDir} /></TableHead>}
                          {isBillColVisible("reference") && <TableHead className={thCls} onClick={() => billsSortToggle("reference")}>Reference <SortIcon col="reference" current={billsSortCol} dir={billsSortDir} /></TableHead>}
                          {isBillColVisible("date") && <TableHead className={thCls} onClick={() => billsSortToggle("date")}>Date <SortIcon col="date" current={billsSortCol} dir={billsSortDir} /></TableHead>}
                          {isBillColVisible("total") && <TableHead className={`text-right ${thCls}`} onClick={() => billsSortToggle("total")}>Total <SortIcon col="total" current={billsSortCol} dir={billsSortDir} /></TableHead>}
                          {isBillColVisible("due") && <TableHead className={thCls} onClick={() => billsSortToggle("due")}>Due <SortIcon col="due" current={billsSortCol} dir={billsSortDir} /></TableHead>}
                          {isBillColVisible("xero") && <TableHead className={`${thCls} cursor-default`}>Xero</TableHead>}
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {sorted.length === 0 ? (
                          <TableRow>
                            <TableCell colSpan={colCount} className="text-center text-sm text-muted-foreground py-8">
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
                              {isBillColVisible("billNumber") && <TableCell className="py-1 text-sm font-medium font-mono whitespace-nowrap">{b.billNumber}</TableCell>}
                              {isBillColVisible("status") && <TableCell className="py-1">{billStatusBadge((b as any).status)}</TableCell>}
                              {isBillColVisible("supplier") && <TableCell className="py-1 text-sm text-muted-foreground whitespace-nowrap">{(b as any).supplierName || "—"}</TableCell>}
                              {isBillColVisible("reference") && <TableCell className="py-1 text-sm text-muted-foreground whitespace-nowrap">{(b as any).reference || "—"}</TableCell>}
                              {isBillColVisible("date") && <TableCell className="py-1 text-sm text-muted-foreground whitespace-nowrap">{(b as any).billDate ? format(new Date((b as any).billDate), "d MMM yy") : "—"}</TableCell>}
                              {isBillColVisible("total") && <TableCell className="py-1 text-right text-sm font-medium tabular-nums whitespace-nowrap">{formatCurrency(b.total / 100)}</TableCell>}
                              {isBillColVisible("due") && <TableCell className="py-1 text-sm text-muted-foreground whitespace-nowrap">{(b as any).dueDate ? format(new Date((b as any).dueDate), "d MMM yy") : "—"}</TableCell>}
                              {isBillColVisible("xero") && (
                                <TableCell className="py-1 text-sm">
                                  {(b as any).xeroInvoiceId
                                    ? <span className="flex items-center gap-1 text-xs text-emerald-600 dark:text-emerald-400"><div className="w-1.5 h-1.5 rounded-full bg-emerald-400" />Synced</span>
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
                  <TableRow className="h-6 bg-muted/30 hover:bg-muted/30">
                    <TableHead className="w-8 py-0 px-2" />
                    <TableHead className="text-[10px] uppercase tracking-wide text-muted-foreground/50 font-normal py-0 px-2">Selection</TableHead>
                    <TableHead className="text-[10px] uppercase tracking-wide text-muted-foreground/50 font-normal py-0 px-2">Room</TableHead>
                    <TableHead className="text-[10px] uppercase tracking-wide text-muted-foreground/50 font-normal py-0 px-2">Option</TableHead>
                    <TableHead className="text-right text-[10px] uppercase tracking-wide text-muted-foreground/50 font-normal py-0 px-2">Qty</TableHead>
                    <TableHead className="text-right text-[10px] uppercase tracking-wide text-muted-foreground/50 font-normal py-0 px-2">Total</TableHead>
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
                    if (filtered.length === 0) {
                      return (
                        <TableRow>
                          <TableCell colSpan={6} className="text-center text-sm text-muted-foreground py-8">
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
                          <TableCell className="py-1 text-sm font-medium truncate max-w-[140px]">{o.selectionName || "—"}</TableCell>
                          <TableCell className="py-1 text-sm text-muted-foreground">{o.room || "—"}</TableCell>
                          <TableCell className="py-1 text-sm">{o.name}</TableCell>
                          <TableCell className="py-1 text-right text-sm tabular-nums">{o.quantity || "—"}</TableCell>
                          <TableCell className="py-1 text-right text-sm font-medium tabular-nums">{formatCurrency((o.totalCost || 0) / 100)}</TableCell>
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
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Amount (AUD)*</FormLabel>
                    <FormControl>
                      <Input
                        type="number"
                        step="0.01"
                        {...field}
                        onChange={(e) => field.onChange(parseFloat(e.target.value) || 0)}
                        data-testid="input-payment-amount"
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
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
                            <CalendarIcon className="mr-2 h-4 w-4" />
                            {field.value ? format(field.value, "PPP") : "Pick a date"}
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

      {/* ── Send Invoice Email Modal ── */}
      <Dialog open={invoiceSendModalOpen} onOpenChange={setInvoiceSendModalOpen}>
        <DialogContent className="max-w-lg" data-testid="dialog-send-invoice-email">
          <DialogHeader>
            <DialogTitle>Email Invoice</DialogTitle>
            <DialogDescription>Send this invoice to the client by email.</DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div>
              <label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">To</label>
              <Input
                value={invoiceSendTo}
                onChange={(e) => setInvoiceSendTo(e.target.value)}
                placeholder="client@example.com"
                className="mt-1"
                data-testid="input-invoice-send-to"
              />
            </div>
            <div>
              <label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Subject</label>
              <Input
                value={invoiceSendSubject}
                onChange={(e) => setInvoiceSendSubject(e.target.value)}
                className="mt-1"
              />
            </div>
            <div>
              <label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Message</label>
              <Textarea
                value={invoiceSendBody}
                onChange={(e) => setInvoiceSendBody(e.target.value)}
                rows={5}
                className="mt-1"
              />
            </div>
            <div className="flex items-center gap-2">
              <input
                id="invoice-attach-pdf"
                type="checkbox"
                checked={invoiceSendAttachPdf}
                onChange={(e) => setInvoiceSendAttachPdf(e.target.checked)}
                className="h-3.5 w-3.5"
              />
              <label htmlFor="invoice-attach-pdf" className="text-sm text-muted-foreground">Attach PDF copy</label>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setInvoiceSendModalOpen(false)}>Cancel</Button>
            <Button
              onClick={() => sendInvoiceEmailMutation.mutate()}
              disabled={!invoiceSendTo.trim() || sendInvoiceEmailMutation.isPending}
              data-testid="button-confirm-send-invoice-email"
            >
              {sendInvoiceEmailMutation.isPending ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" />Sending...</> : <><Mail className="mr-2 h-4 w-4" />Send</>}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
