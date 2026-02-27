import { useEffect, useState, useRef } from "react";
import { useParams, useLocation } from "wouter";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { format } from "date-fns";
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
  Settings2,
  Pencil,
  RefreshCw,
  GripVertical,
  Check,
  X,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
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
  { id: "description", label: "Description", required: false, defaultVisible: false },
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
  const [progressPercent, setProgressPercent] = useState<number | undefined>(undefined);
  const [isCustomProgress, setIsCustomProgress] = useState(false);
  const [customProgressPercent, setCustomProgressPercent] = useState<string>("");
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
  const [columnPickerOpen, setColumnPickerOpen] = useState(false);
  const [dragOverId, setDragOverId] = useState<ColumnId | null>(null);
  const dragItem = useRef<ColumnId | null>(null);

  // ── queries ──────────────────────────────────────────────────────────────────
  const { data: xeroStatus } = useQuery<{ connected: boolean }>({
    queryKey: ["/api/xero/status"],
  });

  const { data: companySettings } = useQuery<{ termsAndConditions?: string; companyName?: string; address?: string }>({
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

  const { data: bills = [] } = useQuery<Bill[]>({
    queryKey: [`/api/bills?projectId=${selectedProjectId}`],
    enabled: !!selectedProjectId,
  });

  const { data: estimateItems = [] } = useQuery<EstimateItem[]>({
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
      if ((invoice as any).lockedContractPrice) {
        setLockedContractPrice((invoice as any).lockedContractPrice);
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
    if (linkedEstimates.length > 0 && isEditMode) {
      const estimate = linkedEstimates[0];
      setSelectedEstimateId(estimate.estimateId);
      setProgressPercent(estimate.progressPercent || undefined);
    }
  }, [linkedEstimates, isEditMode]);

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
    if (isCustomProgress) {
      if (customProgressPercent === "") {
        setProgressPercent(undefined);
      } else {
        const val = parseInt(customProgressPercent);
        if (!isNaN(val) && val >= 0 && val <= 100) {
          setProgressPercent(val);
        }
      }
    }
  }, [customProgressPercent, isCustomProgress]);

  // Lock contract price when linked estimate is approved/locked
  useEffect(() => {
    if (selectedEstimateId && estimates.length > 0) {
      const est = estimates.find((e) => e.id === selectedEstimateId);
      if (est && (est.status === "approved" || est.isLocked)) {
        if (!lockedContractPrice) {
          // Calculate and lock
          const total = estimateItems.reduce(
            (sum, item) => sum + item.priceIncTax * item.quantity,
            0
          );
          if (total > 0) setLockedContractPrice(Math.round(total * 100));
        }
      }
    }
  }, [selectedEstimateId, estimates, estimateItems, lockedContractPrice]);

  // ── helpers ───────────────────────────────────────────────────────────────────

  const getSelectedEstimate = () => estimates.find((e) => e.id === selectedEstimateId);

  const getAllowanceItems = () =>
    estimateItems.filter((item) => item.allowance && item.allowance !== "None");

  const getSelectedVariations = () =>
    variations.filter((v) => selectedVariationIds.includes(v.id));

  const getSelectedAllowanceItems = () =>
    getAllowanceItems().filter((item) => selectedAllowanceIds.includes(item.id));

  const getSelectedBills = () => bills.filter((b) => selectedBillIds.includes(b.id));

  const isEstimateLocked = () => {
    const est = getSelectedEstimate();
    return !!(est && (est.status === "approved" || est.isLocked));
  };

  // ── calculations ───────────────────────────────────────────────────────────────

  const calculateContractPrice = () => {
    if (lockedContractPrice) return lockedContractPrice;
    if (!selectedEstimateId) return 0;
    const total = estimateItems.reduce(
      (sum, item) => sum + item.priceIncTax * item.quantity,
      0
    );
    if (progressPercent !== undefined) {
      return Math.round(total * (progressPercent / 100) * 100);
    }
    return Math.round(total * 100);
  };

  const contractClaimAmount = () => {
    const contractTotal = calculateContractPrice();
    const pct = progressPercent !== undefined ? progressPercent : 100;
    return Math.round((contractTotal * pct) / 100);
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
    subtotal: Math.round(calculateSubtotal() * 100),
    markupAmount: Math.round(calculateMarkup() * 100),
    gstAmount: Math.round(calculateGST() * 100),
    totalAmount: Math.round(calculateTotal() * 100),
    lockedContractPrice: lockedContractPrice,
    columnConfig: columnConfig,
    showAmountsIncTax: showAmountsIncTax,
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

      if (selectedEstimateId && currentProject?.invoicingMethod === "progress_payments") {
        await apiRequest(`/api/client-invoices/${newInvoice.id}/estimates`, "POST", {
          invoiceId: newInvoice.id,
          estimateId: selectedEstimateId,
          progressPercent: progressPercent,
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

  const renderLineTableHeader = (includeContractCols: boolean) => (
    <TableRow>
      {isColVisible("name") && <TableHead className="w-40">Name</TableHead>}
      {isColVisible("description") && <TableHead>Description</TableHead>}
      {includeContractCols && isColVisible("contractTotal") && (
        <TableHead className="text-right w-28">Contract Total</TableHead>
      )}
      {includeContractCols && isColVisible("remaining") && (
        <TableHead className="text-right w-28">Remaining</TableHead>
      )}
      {isColVisible("claimPercent") && (
        <TableHead className="text-right w-20">Claim %</TableHead>
      )}
      {isColVisible("claimAmount") && (
        <TableHead className="text-right w-28">Claim $</TableHead>
      )}
      {isColVisible("amountExTax") && (
        <TableHead className="text-right w-28">Ex Tax</TableHead>
      )}
      {isColVisible("amountTax") && (
        <TableHead className="text-right w-24">Tax</TableHead>
      )}
      {isColVisible("amountIncTax") && (
        <TableHead className="text-right w-28">Inc Tax</TableHead>
      )}
    </TableRow>
  );

  const renderLineTableFooter = (claimAmountCents: number) => {
    const claimAmt = claimAmountCents / 100;
    const exTax = claimAmt / (1 + GST_RATE);
    const tax = claimAmt - exTax;
    return (
      <TableRow className="border-t bg-muted/30 font-medium text-sm">
        <TableCell colSpan={visibleColumns.filter((c) => !["amountExTax","amountTax","amountIncTax","claimAmount"].includes(c.id)).length + 1} className="text-right text-muted-foreground">
          Subtotal
        </TableCell>
        {isColVisible("claimAmount") && (
          <TableCell className="text-right">{formatCurrency(claimAmt)}</TableCell>
        )}
        {isColVisible("amountExTax") && (
          <TableCell className="text-right">{formatCurrency(exTax)}</TableCell>
        )}
        {isColVisible("amountTax") && (
          <TableCell className="text-right">{formatCurrency(tax)}</TableCell>
        )}
        {isColVisible("amountIncTax") && (
          <TableCell className="text-right">{formatCurrency(claimAmt)}</TableCell>
        )}
      </TableRow>
    );
  };

  // ── render ────────────────────────────────────────────────────────────────────

  return (
    <div className="flex flex-col h-full" data-testid="page-client-invoice-detail">
      <Form {...form}>
        <form onSubmit={form.handleSubmit(onSubmit)} className="flex flex-col h-full">
          {/* Row 1 - Title & Actions */}
          <div className="h-9 bg-background flex items-center justify-between px-2 gap-4 flex-shrink-0">
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

          {/* Row 2 - Summary */}
          <div className="h-9 bg-background flex items-center justify-between px-2 border-b border-border flex-shrink-0">
            <div className="flex items-center gap-4 text-xs">
              <div className="flex items-center gap-1.5" data-testid="header-summary-total">
                <span className="text-muted-foreground">Total:</span>
                <span className="font-semibold">{formatCurrency(total)}</span>
              </div>
              <div className="w-px h-4 bg-border" />
              <div className="flex items-center gap-1.5" data-testid="header-summary-paid">
                <span className="text-muted-foreground">Paid:</span>
                <span className="font-semibold text-green-600">{formatCurrency(paid)}</span>
              </div>
              <div className="w-px h-4 bg-border" />
              <div className="flex items-center gap-1.5" data-testid="header-summary-due">
                <span className="text-muted-foreground">Due:</span>
                <span className="font-semibold text-[#bba7db]">{formatCurrency(due)}</span>
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

          {/* Main Content */}
          <div className="flex-1 overflow-auto">
            <div className="max-w-5xl mx-auto px-6 py-6 space-y-6">

                {/* Document Header Card */}
                <Card className="bg-muted/20">
                  <CardContent className="p-5">
                    <div className="grid grid-cols-5 gap-4">
                      <div className="col-span-3 pr-5 border-r border-border">
                        <p className="font-semibold text-base">
                          {companySettings?.companyName || user?.companyName || "Your Company"}
                        </p>
                        {companySettings?.address && (
                          <p className="text-xs text-muted-foreground mt-0.5 whitespace-pre-line">
                            {companySettings.address}
                          </p>
                        )}
                      </div>
                      <div className="col-span-2 pl-2 flex flex-col items-end justify-between">
                        <p className="text-xl font-bold tracking-widest text-muted-foreground/40 uppercase">
                          Tax Invoice
                        </p>
                        <div className="text-right space-y-0.5 mt-2">
                          {form.watch("invoiceNumber") && (
                            <p className="text-xs text-muted-foreground">
                              <span className="font-medium text-foreground">{form.watch("invoiceNumber")}</span>
                            </p>
                          )}
                          {form.watch("invoiceDate") && (
                            <p className="text-xs text-muted-foreground">
                              Issued: <span className="text-foreground">{format(form.watch("invoiceDate"), "d MMM yyyy")}</span>
                            </p>
                          )}
                          {form.watch("dueDate") && (
                            <p className="text-xs text-muted-foreground">
                              Due: <span className="text-foreground">{format(form.watch("dueDate")!, "d MMM yyyy")}</span>
                            </p>
                          )}
                        </div>
                      </div>
                    </div>
                  </CardContent>
                </Card>

                {/* Bill To / Project strip */}
                {selectedProjectId && currentProject && (
                  <div className="grid grid-cols-2 gap-6 px-1">
                    <div>
                      <p className="text-[10px] uppercase tracking-wide text-muted-foreground font-medium mb-1">Bill To</p>
                      <p className="text-sm font-medium">{currentProject.clientName || currentProject.name}</p>
                      {currentProject.location && (
                        <p className="text-xs text-muted-foreground mt-0.5">{currentProject.location}</p>
                      )}
                    </div>
                    <div>
                      <p className="text-[10px] uppercase tracking-wide text-muted-foreground font-medium mb-1">Project</p>
                      <p className="text-sm font-medium">{currentProject.name}</p>
                      {(currentProject.constructionNumber || currentProject.preConstructionNumber || currentProject.leadNumber) && (
                        <p className="text-xs text-muted-foreground mt-0.5">
                          #{currentProject.constructionNumber || currentProject.preConstructionNumber || currentProject.leadNumber}
                        </p>
                      )}
                    </div>
                  </div>
                )}

                {/* Invoice Name + Number */}
                <div className="grid grid-cols-3 gap-4">
                  <FormField
                    control={form.control}
                    name="name"
                    render={({ field }) => (
                      <FormItem className="col-span-2">
                        <FormLabel>Invoice Name*</FormLabel>
                        <FormControl>
                          <Input {...field} data-testid="input-name" />
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
                        <FormLabel className="flex items-center gap-1.5">
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
                        <FormLabel>Invoice Date</FormLabel>
                        <Popover>
                          <PopoverTrigger asChild>
                            <FormControl>
                              <Button
                                variant="outline"
                                className={cn(
                                  "justify-start text-left font-normal",
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
                    control={form.control}
                    name="dueDate"
                    render={({ field }) => (
                      <FormItem className="flex flex-col">
                        <FormLabel>Due Date</FormLabel>
                        <Popover>
                          <PopoverTrigger asChild>
                            <FormControl>
                              <Button
                                variant="outline"
                                className={cn(
                                  "justify-start text-left font-normal",
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
                  <div />
                </div>

                {/* Introduction Text (collapsible) */}
                <FormField
                  control={form.control}
                  name="introductionText"
                  render={({ field }) => (
                    <FormItem>
                      <div
                        className="flex items-center justify-between cursor-pointer py-1"
                        onClick={() => setIntroCollapsed((v) => !v)}
                      >
                        <FormLabel className="cursor-pointer text-sm font-medium">
                          Introduction
                        </FormLabel>
                        {introCollapsed ? (
                          <ChevronDown className="h-4 w-4 text-muted-foreground" />
                        ) : (
                          <ChevronUp className="h-4 w-4 text-muted-foreground" />
                        )}
                      </div>
                      {!introCollapsed && (
                        <FormControl>
                          <RichTextEditor
                            content={field.value || ""}
                            onChange={(html) => field.onChange(html)}
                            placeholder="Enter introduction text..."
                            data-testid="editor-introduction"
                          />
                        </FormControl>
                      )}
                      <FormMessage />
                    </FormItem>
                  )}
                />

                {/* ── Progress Payments sections ── */}
                {currentProject?.invoicingMethod === "progress_payments" && (
                  <>
                    {/* Contract Price Section */}
                    <Card data-testid="section-contract-price">
                      <CardHeader className="flex flex-row items-center justify-between gap-4 space-y-0 pb-3">
                        <CardTitle className="text-base flex items-center gap-2">
                          <div className="w-2 h-2 rounded-full flex-shrink-0 bg-blue-400/70" />
                          Contract Price
                          {isEstimateLocked() && (
                            <Tooltip>
                              <TooltipTrigger>
                                <Badge variant="secondary" className="flex items-center gap-1 text-xs">
                                  <Lock className="w-2.5 h-2.5" />
                                  Locked
                                </Badge>
                              </TooltipTrigger>
                              <TooltipContent>
                                Contract price is locked because the estimate is approved
                              </TooltipContent>
                            </Tooltip>
                          )}
                        </CardTitle>
                        <div className="flex items-center gap-2">
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
                      </CardHeader>

                      <CardContent className="space-y-4">
                        {/* Estimate + progress selector */}
                        <div className="grid grid-cols-2 gap-4">
                          <Select
                            value={selectedEstimateId}
                            onValueChange={(value) => {
                              setSelectedEstimateId(value);
                              setLockedContractPrice(null);
                              setIsCustomProgress(false);
                              setCustomProgressPercent("");
                            }}
                          >
                            <SelectTrigger data-testid="select-estimate">
                              <SelectValue placeholder="Select estimate" />
                            </SelectTrigger>
                            <SelectContent>
                              {estimates.map((estimate) => (
                                <SelectItem
                                  key={estimate.id}
                                  value={estimate.id}
                                  data-testid={`select-estimate-${estimate.id}`}
                                >
                                  {estimate.name}
                                  {(estimate.status === "approved" || estimate.isLocked) && (
                                    <Lock className="inline ml-1 h-3 w-3 text-muted-foreground" />
                                  )}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>

                          {selectedEstimateId && (
                            <Select
                              value={isCustomProgress ? "custom" : progressPercent?.toString() || ""}
                              onValueChange={(value) => {
                                if (value === "custom") {
                                  setIsCustomProgress(true);
                                  setProgressPercent(undefined);
                                } else {
                                  setIsCustomProgress(false);
                                  setCustomProgressPercent("");
                                  setProgressPercent(parseInt(value));
                                }
                              }}
                            >
                              <SelectTrigger data-testid="select-progress-percent">
                                <SelectValue placeholder="Claim %" />
                              </SelectTrigger>
                              <SelectContent>
                                <SelectItem value="10">10%</SelectItem>
                                <SelectItem value="25">25%</SelectItem>
                                <SelectItem value="50">50%</SelectItem>
                                <SelectItem value="75">75%</SelectItem>
                                <SelectItem value="100">100%</SelectItem>
                                <SelectItem value="custom">Custom</SelectItem>
                              </SelectContent>
                            </Select>
                          )}
                        </div>

                        {selectedEstimateId && isCustomProgress && (
                          <Input
                            type="number"
                            placeholder="Enter custom %"
                            value={customProgressPercent}
                            onChange={(e) => setCustomProgressPercent(e.target.value)}
                            min="0"
                            max="100"
                            data-testid="input-custom-progress"
                          />
                        )}

                        {/* Contract price line item table */}
                        {selectedEstimateId && (
                          <>
                            <Table>
                              <TableHeader>
                                {renderLineTableHeader(true)}
                              </TableHeader>
                              <TableBody>
                                <TableRow>
                                  {isColVisible("name") && (
                                    <TableCell className="font-medium text-sm">
                                      Contract Price
                                    </TableCell>
                                  )}
                                  {isColVisible("description") && (
                                    <TableCell className="text-muted-foreground text-sm">
                                      {getSelectedEstimate()?.name}
                                    </TableCell>
                                  )}
                                  {isColVisible("contractTotal") && (
                                    <TableCell className="text-right text-sm">
                                      {formatCurrency(contractTotal)}
                                    </TableCell>
                                  )}
                                  {isColVisible("remaining") && (
                                    <TableCell className="text-right text-sm">
                                      {formatCurrency(contractTotal)}
                                    </TableCell>
                                  )}
                                  {isColVisible("claimPercent") && (
                                    <TableCell className="text-right text-sm">
                                      {progressPercent !== undefined ? `${progressPercent}%` : "100%"}
                                    </TableCell>
                                  )}
                                  {isColVisible("claimAmount") && (
                                    <TableCell className="text-right text-sm font-medium">
                                      {formatCurrency(calculateContractPrice() / 100)}
                                    </TableCell>
                                  )}
                                  {isColVisible("amountExTax") && (
                                    <TableCell className="text-right text-sm">
                                      {formatCurrency(
                                        calculateContractPrice() / 100 / (1 + GST_RATE)
                                      )}
                                    </TableCell>
                                  )}
                                  {isColVisible("amountTax") && (
                                    <TableCell className="text-right text-sm">
                                      {formatCurrency(
                                        (calculateContractPrice() / 100) -
                                          calculateContractPrice() / 100 / (1 + GST_RATE)
                                      )}
                                    </TableCell>
                                  )}
                                  {isColVisible("amountIncTax") && (
                                    <TableCell className="text-right text-sm font-medium">
                                      {formatCurrency(calculateContractPrice() / 100)}
                                    </TableCell>
                                  )}
                                </TableRow>
                              </TableBody>
                            </Table>

                            {/* Section footer */}
                            <div className="flex items-center justify-end gap-6 pt-2 border-t text-sm">
                              <span className="text-muted-foreground">
                                {showAmountsIncTax ? "Amount ex Tax:" : ""}
                              </span>
                              {!showAmountsIncTax && (
                                <span className="font-medium">
                                  {formatCurrency(
                                    calculateContractPrice() / 100 / (1 + GST_RATE)
                                  )}
                                </span>
                              )}
                              <span className="text-muted-foreground">
                                {showAmountsIncTax
                                  ? `Amount inc Tax:`
                                  : `GST:`}
                              </span>
                              <span className="font-semibold">
                                {showAmountsIncTax
                                  ? formatCurrency(calculateContractPrice() / 100)
                                  : formatCurrency(
                                      (calculateContractPrice() / 100) -
                                        calculateContractPrice() / 100 / (1 + GST_RATE)
                                    )}
                              </span>
                            </div>
                          </>
                        )}

                        {!selectedEstimateId && (
                          <p className="text-sm text-muted-foreground text-center py-4">
                            Select an estimate above to set the contract price
                          </p>
                        )}
                      </CardContent>
                    </Card>

                    {/* Variations Section */}
                    <Card data-testid="section-variations">
                      <CardHeader className="flex flex-row items-center justify-between gap-4 space-y-0 pb-3">
                        <CardTitle className="text-base flex items-center gap-2">
                          <div className="w-2 h-2 rounded-full flex-shrink-0 bg-amber-400/70" />
                          Variations
                        </CardTitle>
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          onClick={() => setVariationsModalOpen(true)}
                          data-testid="button-select-variations"
                        >
                          <Plus className="h-4 w-4 mr-1" />
                          Select Variations
                        </Button>
                      </CardHeader>

                      <CardContent>
                        {selectedVariationIds.length === 0 ? (
                          <p className="text-sm text-muted-foreground text-center py-4">
                            No variations added. Click "Select Variations" to add approved variations.
                          </p>
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
                                    <TableRow key={variation.id}>
                                      {isColVisible("name") && (
                                        <TableCell className="text-sm font-medium">
                                          <div className="flex items-center gap-2">
                                            {variation.variationNumber}
                                            <button
                                              type="button"
                                              onClick={() => {
                                                setSelectedVariationIds((prev) =>
                                                  prev.filter((id) => id !== variation.id)
                                                );
                                              }}
                                              className="text-muted-foreground hover:text-destructive ml-auto"
                                            >
                                              <X className="h-3 w-3" />
                                            </button>
                                          </div>
                                        </TableCell>
                                      )}
                                      {isColVisible("description") && (
                                        <TableCell className="text-sm text-muted-foreground">
                                          {variation.name}
                                        </TableCell>
                                      )}
                                      {isColVisible("contractTotal") && (
                                        <TableCell className="text-right text-sm">
                                          {formatCurrency(variation.totalAmount / 100)}
                                        </TableCell>
                                      )}
                                      {isColVisible("remaining") && (
                                        <TableCell className="text-right text-sm">
                                          {formatCurrency(variation.totalAmount / 100)}
                                        </TableCell>
                                      )}
                                      {isColVisible("claimPercent") && (
                                        <TableCell className="text-right">
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
                                            className="h-7 w-16 text-right text-sm"
                                          />
                                        </TableCell>
                                      )}
                                      {isColVisible("claimAmount") && (
                                        <TableCell className="text-right text-sm font-medium">
                                          {formatCurrency(claimAmt)}
                                        </TableCell>
                                      )}
                                      {isColVisible("amountExTax") && (
                                        <TableCell className="text-right text-sm">
                                          {formatCurrency(exTax)}
                                        </TableCell>
                                      )}
                                      {isColVisible("amountTax") && (
                                        <TableCell className="text-right text-sm">
                                          {formatCurrency(tax)}
                                        </TableCell>
                                      )}
                                      {isColVisible("amountIncTax") && (
                                        <TableCell className="text-right text-sm font-medium">
                                          {formatCurrency(claimAmt)}
                                        </TableCell>
                                      )}
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
                          </>
                        )}
                      </CardContent>
                    </Card>

                    {/* Allowances Section */}
                    <Card data-testid="section-allowances">
                      <CardHeader className="flex flex-row items-center justify-between gap-4 space-y-0 pb-3">
                        <CardTitle className="text-base flex items-center gap-2">
                          <div className="w-2 h-2 rounded-full flex-shrink-0 bg-emerald-400/70" />
                          Allowances
                        </CardTitle>
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          onClick={() => setAllowancesModalOpen(true)}
                          disabled={!selectedEstimateId}
                          data-testid="button-select-allowances"
                        >
                          <Plus className="h-4 w-4 mr-1" />
                          Select Allowances
                        </Button>
                      </CardHeader>

                      <CardContent>
                        {!selectedEstimateId ? (
                          <p className="text-sm text-muted-foreground text-center py-4">
                            Select an estimate above to access allowances.
                          </p>
                        ) : selectedAllowanceIds.length === 0 ? (
                          <p className="text-sm text-muted-foreground text-center py-4">
                            No allowances added. Click "Select Allowances" to add finalized allowances.
                          </p>
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
                                    <TableRow key={item.id}>
                                      {isColVisible("name") && (
                                        <TableCell className="text-sm font-medium">
                                          <div className="flex items-center gap-2">
                                            {item.name}
                                            <Badge variant="outline" className="text-[10px]">
                                              {item.allowance}
                                            </Badge>
                                            <button
                                              type="button"
                                              onClick={() =>
                                                setSelectedAllowanceIds((prev) =>
                                                  prev.filter((id) => id !== item.id)
                                                )
                                              }
                                              className="text-muted-foreground hover:text-destructive ml-auto"
                                            >
                                              <X className="h-3 w-3" />
                                            </button>
                                          </div>
                                        </TableCell>
                                      )}
                                      {isColVisible("description") && (
                                        <TableCell className="text-sm text-muted-foreground">
                                          {item.description}
                                        </TableCell>
                                      )}
                                      {isColVisible("contractTotal") && (
                                        <TableCell className="text-right text-sm">
                                          {formatCurrency(totalCents / 100)}
                                        </TableCell>
                                      )}
                                      {isColVisible("remaining") && (
                                        <TableCell className="text-right text-sm">
                                          {formatCurrency(totalCents / 100)}
                                        </TableCell>
                                      )}
                                      {isColVisible("claimPercent") && (
                                        <TableCell className="text-right">
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
                                            className="h-7 w-16 text-right text-sm"
                                          />
                                        </TableCell>
                                      )}
                                      {isColVisible("claimAmount") && (
                                        <TableCell className="text-right text-sm font-medium">
                                          {formatCurrency(claimAmt)}
                                        </TableCell>
                                      )}
                                      {isColVisible("amountExTax") && (
                                        <TableCell className="text-right text-sm">
                                          {formatCurrency(exTax)}
                                        </TableCell>
                                      )}
                                      {isColVisible("amountTax") && (
                                        <TableCell className="text-right text-sm">
                                          {formatCurrency(tax)}
                                        </TableCell>
                                      )}
                                      {isColVisible("amountIncTax") && (
                                        <TableCell className="text-right text-sm font-medium">
                                          {formatCurrency(claimAmt)}
                                        </TableCell>
                                      )}
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
                          </>
                        )}
                      </CardContent>
                    </Card>
                  </>
                )}

                {/* ── Cost Plus sections ── */}
                {currentProject?.invoicingMethod === "cost_plus" && (
                  <>
                    <Card data-testid="section-bills">
                      <CardHeader>
                        <CardTitle className="text-base">Bills</CardTitle>
                      </CardHeader>
                      <CardContent className="space-y-4">
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
                      </CardContent>
                    </Card>

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

                {/* Custom Lines */}
                <Card data-testid="section-custom-lines">
                  <CardHeader className="flex flex-row items-center justify-between gap-4 space-y-0 pb-3">
                    <CardTitle className="text-base flex items-center gap-2">
                      <div className="w-2 h-2 rounded-full flex-shrink-0 bg-violet-400/70" />
                      Custom Lines
                    </CardTitle>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={addCustomLine}
                      data-testid="button-add-custom-line"
                    >
                      <Plus className="h-4 w-4 mr-1" />
                      Add Line
                    </Button>
                  </CardHeader>
                  <CardContent>
                    {customLines.length === 0 ? (
                      <p className="text-sm text-muted-foreground text-center py-4">
                        No custom lines. Click "Add Line" to add a custom line item.
                      </p>
                    ) : (
                      <Table>
                        <TableHeader>
                          <TableRow>
                            {isColVisible("name") && <TableHead className="w-36">Name</TableHead>}
                            {isColVisible("description") && <TableHead>Description</TableHead>}
                            <TableHead className="text-right w-16">Qty</TableHead>
                            <TableHead className="text-right w-24">Price</TableHead>
                            {isColVisible("claimAmount") && (
                              <TableHead className="text-right w-28">Claim $</TableHead>
                            )}
                            {isColVisible("amountExTax") && (
                              <TableHead className="text-right w-24">Ex Tax</TableHead>
                            )}
                            {isColVisible("amountTax") && (
                              <TableHead className="text-right w-20">Tax</TableHead>
                            )}
                            {isColVisible("amountIncTax") && (
                              <TableHead className="text-right w-28">Inc Tax</TableHead>
                            )}
                            <TableHead className="w-8" />
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {customLines.map((line, index) => {
                            const exTax = line.totalPrice / (1 + GST_RATE);
                            const tax = line.totalPrice - exTax;
                            return (
                              <TableRow key={index} data-testid={`custom-line-${index}`}>
                                {isColVisible("name") && (
                                  <TableCell>
                                    <Input
                                      value={line.name}
                                      onChange={(e) =>
                                        updateCustomLine(index, "name", e.target.value)
                                      }
                                      placeholder="Name"
                                      className="h-7 text-sm"
                                    />
                                  </TableCell>
                                )}
                                {isColVisible("description") && (
                                  <TableCell>
                                    <Input
                                      value={line.description}
                                      onChange={(e) =>
                                        updateCustomLine(index, "description", e.target.value)
                                      }
                                      placeholder="Description"
                                      className="h-7 text-sm"
                                    />
                                  </TableCell>
                                )}
                                <TableCell>
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
                                    className="h-7 w-14 text-right text-sm"
                                  />
                                </TableCell>
                                <TableCell>
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
                                    className="h-7 w-20 text-right text-sm"
                                  />
                                </TableCell>
                                {isColVisible("claimAmount") && (
                                  <TableCell className="text-right text-sm font-medium">
                                    {formatCurrency(line.totalPrice)}
                                  </TableCell>
                                )}
                                {isColVisible("amountExTax") && (
                                  <TableCell className="text-right text-sm">
                                    {line.taxable ? formatCurrency(exTax) : formatCurrency(line.totalPrice)}
                                  </TableCell>
                                )}
                                {isColVisible("amountTax") && (
                                  <TableCell className="text-right text-sm">
                                    {line.taxable ? formatCurrency(tax) : formatCurrency(0)}
                                  </TableCell>
                                )}
                                {isColVisible("amountIncTax") && (
                                  <TableCell className="text-right text-sm font-medium">
                                    {formatCurrency(line.totalPrice)}
                                  </TableCell>
                                )}
                                <TableCell>
                                  <Button
                                    type="button"
                                    variant="ghost"
                                    size="icon"
                                    onClick={() => deleteCustomLine(index)}
                                    data-testid={`button-delete-custom-line-${index}`}
                                  >
                                    <Trash2 className="h-3 w-3" />
                                  </Button>
                                </TableCell>
                              </TableRow>
                            );
                          })}
                        </TableBody>
                      </Table>
                    )}
                  </CardContent>
                </Card>

                {/* Payments History */}
                {isEditMode && (
                  <Card data-testid="section-payments-history">
                    <CardHeader className="flex flex-row items-center justify-between gap-4 space-y-0">
                      <CardTitle className="text-base flex items-center gap-2">
                        <div className="w-2 h-2 rounded-full flex-shrink-0 bg-green-500/70" />
                        Payments ({payments.length})
                      </CardTitle>
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={() => setPaymentDialogOpen(true)}
                        data-testid="button-record-payment"
                      >
                        <Plus className="h-4 w-4 mr-1" />
                        Record Payment
                      </Button>
                    </CardHeader>
                    <CardContent>
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
                        <p className="text-sm text-muted-foreground text-center py-4">
                          No payments recorded
                        </p>
                      )}
                    </CardContent>
                  </Card>
                )}

                {/* Closing Text (collapsible card) */}
                <Card>
                  <CardHeader
                    className="flex flex-row items-center justify-between gap-4 space-y-0 pb-3 cursor-pointer"
                    onClick={() => setClosingCollapsed((v) => !v)}
                  >
                    <CardTitle className="text-base flex items-center gap-2">
                      <div className="w-2 h-2 rounded-full flex-shrink-0 bg-slate-400/60" />
                      Closing Text
                    </CardTitle>
                    {closingCollapsed ? (
                      <ChevronDown className="h-4 w-4 text-muted-foreground flex-shrink-0" />
                    ) : (
                      <ChevronUp className="h-4 w-4 text-muted-foreground flex-shrink-0" />
                    )}
                  </CardHeader>
                  {!closingCollapsed && (
                    <CardContent>
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
                    </CardContent>
                  )}
                </Card>

                {/* Terms & Conditions — read from company settings */}
                <Card>
                  <CardHeader
                    className="flex flex-row items-center justify-between gap-4 space-y-0 pb-3 cursor-pointer"
                    onClick={() => setTermsCollapsed((v) => !v)}
                  >
                    <CardTitle className="text-base flex items-center gap-2">
                      <div className="w-2 h-2 rounded-full flex-shrink-0 bg-slate-400/60" />
                      Terms & Conditions
                    </CardTitle>
                    {termsCollapsed ? (
                      <ChevronDown className="h-4 w-4 text-muted-foreground flex-shrink-0" />
                    ) : (
                      <ChevronUp className="h-4 w-4 text-muted-foreground flex-shrink-0" />
                    )}
                  </CardHeader>
                  {!termsCollapsed && (
                    <CardContent>
                      {companySettings?.termsAndConditions ? (
                        <p className="text-sm text-muted-foreground whitespace-pre-wrap">
                          {companySettings.termsAndConditions}
                        </p>
                      ) : (
                        <p className="text-sm text-muted-foreground italic">
                          No terms set — go to Company Settings &rsaquo; Templates &rsaquo; Terms &amp; Conditions to add your standard terms.
                        </p>
                      )}
                    </CardContent>
                  )}
                </Card>

                {/* Attachments stub */}
                <Card data-testid="section-attachments">
                  <CardHeader>
                    <CardTitle className="text-base flex items-center gap-2">
                      <div className="w-2 h-2 rounded-full flex-shrink-0 bg-slate-400/60" />
                      <Paperclip className="h-4 w-4" />
                      Attachments
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <p className="text-sm text-muted-foreground text-center py-4">
                      No attachments
                    </p>
                  </CardContent>
                </Card>

                {/* Invoice Summary Card */}
                <Card data-testid="summary-panel">
                  <CardHeader className="flex flex-row items-center justify-between gap-4 space-y-0 pb-3">
                    <CardTitle className="text-base flex items-center gap-2">
                      <div className="w-2 h-2 rounded-full flex-shrink-0 bg-primary/50" />
                      Invoice Summary
                    </CardTitle>
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
                  </CardHeader>
                  <CardContent>
                    <div className="grid grid-cols-5 gap-6">
                      {/* Left: Breakdown */}
                      <div className="col-span-3 space-y-1.5">
                        {currentProject?.invoicingMethod === "progress_payments" && selectedEstimateId && (
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
                        <div className="border-t pt-2 mt-2 space-y-1.5">
                          <div className="flex justify-between text-sm">
                            <span className="text-muted-foreground">Amount ex GST</span>
                            <span className="font-medium tabular-nums">{formatCurrency(amountExTax())}</span>
                          </div>
                          <div className="flex justify-between text-sm">
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
                          <div className="mt-4 space-y-1.5">
                            {paid > 0 && (
                              <div className="flex justify-between text-sm">
                                <span className="text-muted-foreground">Paid</span>
                                <span className="font-medium text-emerald-600 dark:text-emerald-400 tabular-nums">
                                  {formatCurrency(paid)}
                                </span>
                              </div>
                            )}
                            <div className="flex justify-between text-sm font-semibold">
                              <span>Balance Due</span>
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
                                {formatCurrency(due)}
                              </span>
                            </div>
                          </div>
                        )}
                      </div>
                    </div>
                  </CardContent>
                </Card>

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
