import { useEffect, useState, useRef } from "react";
import { useParams, useLocation } from "wouter";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { format, addDays } from "date-fns";
import {
  ArrowLeft,
  Plus,
  Trash2,
  FileText,
  Calendar as CalendarIcon,
  Loader2,
  Eye,
  Send,
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
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
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
} from "@shared/schema";

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
  termsAndConditions: z.string().optional(),
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
  const [paymentDialogOpen, setPaymentDialogOpen] = useState(false);
  const [xeroPushing, setXeroPushing] = useState(false);

  // ── new UI state ─────────────────────────────────────────────────────────────
  const [introCollapsed, setIntroCollapsed] = useState(true);
  const [closingCollapsed, setClosingCollapsed] = useState(true);
  const [termsCollapsed, setTermsCollapsed] = useState(true);
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

  // ── queries ──────────────────────────────────────────────────────────────────
  const { data: xeroStatus } = useQuery<{ connected: boolean }>({
    queryKey: ["/api/xero/status"],
  });

  const { data: companySettings } = useQuery<{ termsAndConditions?: string; termsTemplates?: Array<{ id: string; name: string; content: string }>; companyName?: string; address?: string }>({
    queryKey: ["/api/company-settings"],
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
      termsAndConditions: "",
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
        termsAndConditions: (invoice as any).termsAndConditions || "",
        markupPercent: invoice.markupPercent || undefined,
      });
      // Restore column config
      if ((invoice as any).columnConfig) {
        setColumnConfig(mergeColumnConfig((invoice as any).columnConfig));
      }
      if ((invoice as any).showAmountsIncTax !== undefined) {
        setShowAmountsIncTax((invoice as any).showAmountsIncTax);
      }
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


  // ── helpers ───────────────────────────────────────────────────────────────────

  const getAllowanceItems = () =>
    estimateItems.filter((item) => item.allowance && item.allowance !== "None");

  const getSelectedVariations = () =>
    variations.filter((v) => selectedVariationIds.includes(v.id));

  const getSelectedAllowanceItems = () =>
    getAllowanceItems().filter((item) => selectedAllowanceIds.includes(item.id));

  const getSelectedBills = () => bills.filter((b) => selectedBillIds.includes(b.id));

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
    if (currentProject?.invoicingMethod === "cost_plus") {
      const billsTotal = calculateBillsTotal() / 100;
      const markupPercent = form.watch("markupPercent") || 0;
      return billsTotal * (markupPercent / 100);
    }
    return 0;
  };

  const calculateSubtotal = () => {
    if (currentProject?.invoicingMethod === "progress_payments") {
      const contract = calculateContractPrice() / 100;
      const vars = calculateVariationsTotal() / 100;
      const allowances = calculateAllowancesTotal() / 100;
      const custom = calculateCustomLinesSubtotal();
      return contract + vars + allowances + custom;
    } else {
      return calculateBillsTotal() / 100 + calculateCustomLinesSubtotal();
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
    invoicingMethod: currentProject?.invoicingMethod || "progress_payments",
    markupPercent: data.markupPercent,
    introductionText: data.introductionText,
    closingText: data.closingText,
    termsAndConditions: data.termsAndConditions || null,
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

      if (currentProject?.invoicingMethod === "cost_plus") {
        for (const billId of selectedBillIds) {
          await apiRequest(`/api/client-invoices/${newInvoice.id}/bills`, "POST", {
            invoiceId: newInvoice.id,
            billId,
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
  const GST_RATE = 0.1;

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
                <button
                  type="button"
                  className="h-6 w-auto px-2 text-xs border rounded-md hover-elevate active-elevate-2 flex items-center gap-1"
                  data-testid="button-preview"
                >
                  <Eye className="w-3 h-3" />
                  <span>Preview</span>
                </button>
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
              </div>
            </div>

          </div>{/* end unified header card */}

          {/* Main Content */}
          <div className="flex-1 overflow-auto">
            <div className="max-w-4xl mx-auto px-3 py-3 space-y-3">

                {/* Card 1 — Invoice Info */}
                <div className="rounded-lg border border-border bg-card overflow-hidden">

                  {/* Section header */}
                  <div className="h-8 flex items-center px-3 gap-2 border-b border-border/50">
                    <div className="w-1.5 h-1.5 rounded-full flex-shrink-0 bg-slate-400/60" />
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
                    </div>

                  {/* Introduction Text — collapsible */}
                  <div className="border-t border-border/50">
                    <div
                      className="h-8 flex items-center justify-between px-3 gap-2 cursor-pointer"
                      onClick={() => setIntroCollapsed((v) => !v)}
                    >
                      <div className="flex items-center gap-2">
                        <div className="w-1.5 h-1.5 rounded-full flex-shrink-0 bg-slate-400/60" />
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
                    <div className="w-1.5 h-1.5 rounded-full flex-shrink-0 bg-slate-400/60" />
                    <span className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Financials</span>
                  </div>

                {currentProject?.invoicingMethod === "progress_payments" && (
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
                {currentProject?.invoicingMethod === "cost_plus" && (
                  <>
                    {/* Bills sub-section */}
                    <div className="border-t border-border/50" data-testid="section-bills">
                      <div className="h-8 flex items-center justify-between px-3 gap-2 border-b border-border/50 bg-muted/40">
                        <div className="flex items-center gap-2">
                          <div className="w-1.5 h-1.5 rounded-full flex-shrink-0 bg-orange-400/70" />
                          <span className="text-xs font-medium">Bills</span>
                        </div>
                      </div>
                      <div className="px-4 py-3 space-y-4">
                        <div>
                          <Label>Select Bills</Label>
                          <Select
                            value={selectedBillIds[0] || ""}
                            onValueChange={(value) => {
                              if (value && !selectedBillIds.includes(value)) {
                                setSelectedBillIds([...selectedBillIds, value]);
                              }
                            }}
                          >
                            <SelectTrigger className="mt-2" data-testid="select-bills">
                              <SelectValue placeholder="Select bills" />
                            </SelectTrigger>
                            <SelectContent>
                              {bills.map((bill) => (
                                <SelectItem key={bill.id} value={bill.id}>
                                  {bill.billNumber}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </div>
                        {selectedBillIds.length > 0 && (
                          <div className="space-y-2">
                            {getSelectedBills().map((b) => (
                              <div
                                key={b.id}
                                className="flex items-center justify-between text-sm p-2 bg-muted rounded-md"
                              >
                                <span>{b.billNumber}</span>
                                <Button
                                  type="button"
                                  variant="ghost"
                                  size="icon"
                                  onClick={() =>
                                    setSelectedBillIds(
                                      selectedBillIds.filter((id) => id !== b.id)
                                    )
                                  }
                                >
                                  <Trash2 className="h-3 w-3" />
                                </Button>
                              </div>
                            ))}
                          </div>
                        )}
                        <div className="flex justify-between text-sm pt-2 border-t">
                          <span className="text-muted-foreground">Bills Total:</span>
                          <span className="font-medium">
                            {formatCurrency(calculateBillsTotal() / 100)}
                          </span>
                        </div>
                      </div>{/* end bills content */}
                    </div>{/* end bills sub-section */}

                    <FormField
                      control={form.control}
                      name="markupPercent"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Markup (%)</FormLabel>
                          <FormControl>
                            <Input
                              type="number"
                              {...field}
                              value={field.value || ""}
                              onChange={(e) =>
                                field.onChange(
                                  e.target.value ? parseFloat(e.target.value) : undefined
                                )
                              }
                              data-testid="input-markup-percent"
                            />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                  </>
                )}

                {/* Custom Lines sub-section */}
                <div className="border-t border-border/50" data-testid="section-custom-lines">
                  <div className="h-8 flex items-center justify-between px-3 gap-2 border-b border-border/50 bg-muted/40">
                    <div className="flex items-center gap-2">
                      <div className="w-1.5 h-1.5 rounded-full flex-shrink-0 bg-[#bba7db]/70" />
                      <span className="text-xs font-medium">Custom Lines</span>
                    </div>
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
                  <div className="px-4 py-3">
                    {customLines.length === 0 ? (
                      <p className="text-sm text-muted-foreground text-center py-2">
                        No custom lines. Click "Add Line" to add a custom line item.
                      </p>
                    ) : (
                      <Table>
                        <TableHeader>
                          <TableRow className="h-6 bg-muted/30">
                            {isColVisible("name") && <TableHead className="w-36 text-[10px] uppercase tracking-wide text-muted-foreground/50 font-normal py-0 px-2">Name</TableHead>}
                            {isColVisible("description") && <TableHead className="text-[10px] uppercase tracking-wide text-muted-foreground/50 font-normal py-0 px-2">Description</TableHead>}
                            <TableHead className="text-right w-16 text-[10px] uppercase tracking-wide text-muted-foreground/50 font-normal py-0 px-2">Qty</TableHead>
                            <TableHead className="text-right w-24 text-[10px] uppercase tracking-wide text-muted-foreground/50 font-normal py-0 px-2">Price</TableHead>
                            {isColVisible("claimAmount") && (
                              <TableHead className="text-right w-28 text-[10px] uppercase tracking-wide text-muted-foreground/50 font-normal py-0 px-2">Claim $</TableHead>
                            )}
                            {isColVisible("amountExTax") && (
                              <TableHead className="text-right w-24 text-[10px] uppercase tracking-wide text-muted-foreground/50 font-normal py-0 px-2">Ex Tax</TableHead>
                            )}
                            {isColVisible("amountTax") && (
                              <TableHead className="text-right w-20 text-[10px] uppercase tracking-wide text-muted-foreground/50 font-normal py-0 px-2">Tax</TableHead>
                            )}
                            {isColVisible("amountIncTax") && (
                              <TableHead className="text-right w-28 text-[10px] uppercase tracking-wide text-muted-foreground/50 font-normal py-0 px-2">Inc Tax</TableHead>
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
                                {isColVisible("name") && (
                                  <TableCell className="py-1">
                                    <Input
                                      value={line.name}
                                      onChange={(e) =>
                                        updateCustomLine(index, "name", e.target.value)
                                      }
                                      placeholder="Name"
                                      className="h-7 text-sm border-0 bg-transparent shadow-none focus-visible:ring-1 focus-visible:ring-ring px-1 rounded-sm placeholder:text-muted-foreground/30"
                                    />
                                  </TableCell>
                                )}
                                {isColVisible("description") && (
                                  <TableCell className="py-1">
                                    <Input
                                      value={line.description}
                                      onChange={(e) =>
                                        updateCustomLine(index, "description", e.target.value)
                                      }
                                      placeholder="Description"
                                      className="h-7 text-sm border-0 bg-transparent shadow-none focus-visible:ring-1 focus-visible:ring-ring px-1 rounded-sm placeholder:text-muted-foreground/30"
                                    />
                                  </TableCell>
                                )}
                                <TableCell className="py-1">
                                  <Input
                                    type="number"
                                    value={line.quantity}
                                    onChange={(e) =>
                                      updateCustomLine(
                                        index,
                                        "quantity",
                                        parseFloat(e.target.value) || 0
                                      )
                                    }
                                    className="h-7 w-14 text-right text-sm border-0 bg-transparent shadow-none focus-visible:ring-1 focus-visible:ring-ring px-1 rounded-sm ml-auto"
                                  />
                                </TableCell>
                                <TableCell className="py-1">
                                  <Input
                                    type="number"
                                    value={line.unitPrice}
                                    onChange={(e) =>
                                      updateCustomLine(
                                        index,
                                        "unitPrice",
                                        parseFloat(e.target.value) || 0
                                      )
                                    }
                                    className="h-7 w-20 text-right text-sm border-0 bg-transparent shadow-none focus-visible:ring-1 focus-visible:ring-ring px-1 rounded-sm ml-auto"
                                  />
                                </TableCell>
                                {isColVisible("claimAmount") && (
                                  <TableCell className="text-right text-sm font-medium py-1">
                                    {formatCurrency(line.totalPrice)}
                                  </TableCell>
                                )}
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
                        {currentProject?.invoicingMethod === "progress_payments" && contractClaimRows.length > 0 && (
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
                        {currentProject?.invoicingMethod === "cost_plus" && (
                          <>
                            <div className="flex justify-between text-sm">
                              <span className="text-muted-foreground">Bills</span>
                              <span className="font-medium tabular-nums">
                                {formatCurrency(calculateBillsTotal() / 100)}
                              </span>
                            </div>
                            <div className="flex justify-between text-sm">
                              <span className="text-muted-foreground">Markup</span>
                              <span className="font-medium tabular-nums">{formatCurrency(calculateMarkup())}</span>
                            </div>
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
                      <div className="w-1.5 h-1.5 rounded-full flex-shrink-0 bg-slate-400/60" />
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
                            value=""
                            onValueChange={(id) => {
                              const tpl = companySettings.termsTemplates!.find(t => t.id === id);
                              if (tpl) form.setValue("termsAndConditions", tpl.content);
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
                      <FormField
                        control={form.control}
                        name="termsAndConditions"
                        render={({ field }) => (
                          <FormItem>
                            <FormControl>
                              <Textarea
                                {...field}
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
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                      {/* Load from company defaults */}
                      {companySettings?.termsAndConditions && !form.watch("termsAndConditions") && (
                        <button
                          type="button"
                          onClick={() => form.setValue("termsAndConditions", companySettings.termsAndConditions!)}
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
                      <Paperclip className="h-3 w-3 text-muted-foreground" />
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
                            <TableRow>
                              <TableHead>Date</TableHead>
                              <TableHead className="text-right">Amount</TableHead>
                              <TableHead>Method</TableHead>
                              <TableHead>Reference</TableHead>
                            </TableRow>
                          </TableHeader>
                          <TableBody>
                            {payments.map((payment) => (
                              <TableRow key={payment.id}>
                                <TableCell className="text-sm">
                                  {payment.paymentDate
                                    ? format(new Date(payment.paymentDate), "d MMM yyyy")
                                    : "-"}
                                </TableCell>
                                <TableCell className="text-right text-sm font-medium">
                                  {formatCurrency(payment.amount / 100)}
                                </TableCell>
                                <TableCell className="text-sm text-muted-foreground">
                                  {payment.paymentMethod || "-"}
                                </TableCell>
                                <TableCell className="text-sm text-muted-foreground">
                                  {payment.reference || "-"}
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
    </div>
  );
}
