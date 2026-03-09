import { useEffect, useState, useRef } from "react";
import { useParams, useLocation } from "wouter";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { format } from "date-fns";
import { pdf } from "@react-pdf/renderer";
import { 
  ArrowLeft, 
  Plus, 
  Trash2,
  FileText,
  Calendar as CalendarIcon,
  Loader2,
  Check,
  X,
  Send,
  AlertCircle,
  Clock,
  CheckCircle,
  XCircle,
  ChevronDown,
  ChevronUp,
  Search,
  Paperclip,
  Eye,
  EyeOff,
  Download,
  Mail,
  Upload,
  ExternalLink,
} from "lucide-react";
import { VariationPreviewContent } from "@/components/variations/VariationPreviewContent";
import { VariationDocument } from "@/components/variations/pdf/VariationDocument";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormMessage,
} from "@/components/ui/form";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { Calendar } from "@/components/ui/calendar";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/hooks/use-auth";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { cn } from "@/lib/utils";
import { logActivity } from "@/lib/activityLogger";
import type { Variation, VariationItem, Project } from "@shared/schema";

const variationFormSchema = z.object({
  variationNumber: z.string().min(1, "Variation number is required"),
  projectId: z.string().min(1, "Project is required"),
  name: z.string().min(1, "Name is required"),
  approvalDeadline: z.date().optional(),
  daysChanged: z.number().optional(),
  introductionText: z.string().optional(),
  closingText: z.string().optional(),
  termsAndConditions: z.string().optional(),
  status: z.enum(["draft", "action", "pending", "approved", "rejected"]).default("draft"),
});

type VariationFormData = z.infer<typeof variationFormSchema>;

type CostLine = {
  id?: string;
  name: string;
  description: string;
  type: string;
  unitType: string;
  costCode: string;
  quantity: number;
  unitCostExTax: number;
  markupPercent: number | null;
  taxable: boolean;
  sortOrder: number;
  showInPdf: boolean;
};

type AllowanceLine = {
  id?: string;
  description: string;
  amount: number;
  sortOrder: number;
};

const labelCls = "h-4 leading-none flex items-center text-[11px] text-muted-foreground/70 uppercase tracking-wide font-medium";

export default function VariationDetail() {
  const { id, variationId, projectId: projectIdFromParams } = useParams<{ 
    id?: string; 
    variationId?: string; 
    projectId?: string 
  }>();
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const { user } = useAuth();
  
  const effectiveVariationId = variationId || id;
  const isEditMode = !!(effectiveVariationId && effectiveVariationId !== "new");

  // Cost lines state
  const [costLines, setCostLines] = useState<CostLine[]>([]);
  const [allowanceLines, setAllowanceLines] = useState<AllowanceLine[]>([]);

  // Dialog state
  const [rejectDialogOpen, setRejectDialogOpen] = useState(false);
  const [rejectReason, setRejectReason] = useState("");
  const [approveDialogOpen, setApproveDialogOpen] = useState(false);

  // Bills state
  const [selectedBillIds, setSelectedBillIds] = useState<string[]>([]);
  const [modalBillIds, setModalBillIds] = useState<string[]>([]);
  const [billsModalOpen, setBillsModalOpen] = useState(false);
  const [billsSearch, setBillsSearch] = useState("");

  // Labour state
  const [selectedTimesheetIds, setSelectedTimesheetIds] = useState<string[]>([]);
  const [modalTimesheetIds, setModalTimesheetIds] = useState<string[]>([]);
  const [labourModalOpen, setLabourModalOpen] = useState(false);
  const [labourSearch, setLabourSearch] = useState("");

  // Allowances modal state
  const [allowancesModalOpen, setAllowancesModalOpen] = useState(false);
  const [allowancesSearch, setAllowancesSearch] = useState("");

  // Section collapse state
  const [billsCollapsed, setBillsCollapsed] = useState(true);
  const [labourCollapsed, setLabourCollapsed] = useState(true);
  const [allowancesCollapsed, setAllowancesCollapsed] = useState(true);
  const [closingCollapsed, setClosingCollapsed] = useState(true);
  const [termsCollapsed, setTermsCollapsed] = useState(true);
  const [selectedTemplateId, setSelectedTemplateId] = useState("");

  // T002: Attachments state
  const [attachments, setAttachments] = useState<Array<{ name: string; url: string; size?: number; type?: string }>>([]);
  const [uploadingAttachment, setUploadingAttachment] = useState(false);
  const attachmentInputRef = useRef<HTMLInputElement>(null);

  // T003: Preview / PDF / Send state
  const [previewOpen, setPreviewOpen] = useState(false);
  const [sendModalOpen, setSendModalOpen] = useState(false);
  const [sendTo, setSendTo] = useState("");
  const [sendSubject, setSendSubject] = useState("");
  const [sendBody, setSendBody] = useState("");
  const [sendAttachPdf, setSendAttachPdf] = useState(true);
  const [pdfGenerating, setPdfGenerating] = useState(false);

  // ── Queries ──────────────────────────────────────────────────────────────

  const { data: variation, isLoading: variationLoading } = useQuery<Variation>({
    queryKey: [`/api/variations/${effectiveVariationId}`],
    enabled: isEditMode,
  });

  const { data: existingCostLines = [] } = useQuery<VariationItem[]>({
    queryKey: [`/api/variations/${effectiveVariationId}/items`],
    enabled: isEditMode,
  });

  const { data: existingVariationBills = [] } = useQuery<any[]>({
    queryKey: [`/api/variations/${effectiveVariationId}/bills`],
    enabled: isEditMode,
  });

  const { data: existingVariationTimesheets = [] } = useQuery<any[]>({
    queryKey: [`/api/variations/${effectiveVariationId}/timesheets`],
    enabled: isEditMode,
  });

  const { data: projects = [] } = useQuery<Project[]>({
    queryKey: ["/api/projects"],
  });

  const { data: users = [] } = useQuery<any[]>({
    queryKey: ["/api/users"],
  });

  const { data: companySettings } = useQuery<{
    termsAndConditions?: string;
    termsTemplates?: Array<{ id: string; name: string; content: string }>;
    brandColor?: string;
  }>({
    queryKey: ["/api/company-settings"],
  });

  const { data: companyInfo } = useQuery<{
    id: string; name: string; abn?: string; phone?: string; email?: string; logo?: string;
  }>({
    queryKey: ["/api/company"],
  });

  const form = useForm<VariationFormData>({
    resolver: zodResolver(variationFormSchema),
    defaultValues: {
      variationNumber: "",
      projectId: "",
      name: "",
      approvalDeadline: undefined,
      daysChanged: undefined,
      introductionText: "",
      closingText: "",
      termsAndConditions: "",
      status: "draft",
    },
  });

  const watchedProjectId = form.watch("projectId");

  const { data: projectBills = [] } = useQuery<any[]>({
    queryKey: [`/api/bills?projectId=${watchedProjectId}`],
    enabled: !!watchedProjectId,
  });

  const { data: projectTimesheets = [] } = useQuery<any[]>({
    queryKey: [`/api/projects/${watchedProjectId}/timesheets`],
    enabled: !!watchedProjectId,
  });

  const { data: projectAllowances = [] } = useQuery<any[]>({
    queryKey: [`/api/projects/${watchedProjectId}/allowances`],
    enabled: !!watchedProjectId,
  });

  // ── Effects ───────────────────────────────────────────────────────────────

  useEffect(() => {
    if (variation && isEditMode) {
      form.reset({
        variationNumber: variation.variationNumber,
        projectId: variation.projectId,
        name: variation.name,
        approvalDeadline: variation.approvalDeadline ? new Date(variation.approvalDeadline) : undefined,
        daysChanged: variation.daysChanged || undefined,
        introductionText: variation.introductionText || "",
        closingText: variation.closingText || "",
        termsAndConditions: (variation as any).termsAndConditions || "",
        status: variation.status as "draft" | "action" | "pending" | "approved" | "rejected",
      });
      // T002: Load attachments
      const storedAttachments = (variation as any).attachments;
      if (Array.isArray(storedAttachments) && storedAttachments.length > 0) {
        setAttachments(storedAttachments);
      }
    }
  }, [variation, isEditMode, form]);

  useEffect(() => {
    if (existingCostLines.length > 0 && isEditMode) {
      const costItems = existingCostLines.filter((item) => (item as any).itemType !== "allowance");
      const allowanceItems = existingCostLines.filter((item) => (item as any).itemType === "allowance");

      setCostLines(
        costItems.map((item: any) => ({
          id: item.id,
          name: item.name ?? "",
          description: item.description,
          type: item.type || "Material",
          unitType: item.unitType || "each",
          costCode: item.costCode || "",
          quantity: item.quantity,
          unitCostExTax: item.unitCostExTax ?? (item.unitPrice / 100),
          markupPercent: item.markupPercent ?? null,
          taxable: item.taxable,
          sortOrder: item.sortOrder,
          showInPdf: item.showInPdf !== false,
        }))
      );

      setAllowanceLines(
        allowanceItems.map((item) => ({
          id: item.id,
          description: item.description,
          amount: item.totalPrice / 100,
          sortOrder: item.sortOrder,
        }))
      );

      if (allowanceItems.length > 0) setAllowancesCollapsed(false);
    }
  }, [existingCostLines, isEditMode]);

  useEffect(() => {
    if (existingVariationBills.length > 0 && isEditMode) {
      setSelectedBillIds(existingVariationBills.map((vb: any) => vb.billId));
      setBillsCollapsed(false);
    }
  }, [existingVariationBills, isEditMode]);

  useEffect(() => {
    if (existingVariationTimesheets.length > 0 && isEditMode) {
      setSelectedTimesheetIds(existingVariationTimesheets.map((vt: any) => vt.timesheetId));
      setLabourCollapsed(false);
    }
  }, [existingVariationTimesheets, isEditMode]);

  useEffect(() => {
    if (!isEditMode && projects.length > 0) {
      const projectIdToUse = projectIdFromParams || projects[0]?.id;
      if (projectIdToUse) {
        form.setValue("projectId", projectIdToUse);
        form.setValue("variationNumber", "Auto-generated");
      }
    }
  }, [projects, isEditMode, form, projectIdFromParams]);

  // ── Helpers ───────────────────────────────────────────────────────────────

  const getUserName = (userId: string) => {
    const u = users.find((usr: any) => usr.id === userId);
    return u ? `${u.firstName || ""} ${u.lastName || ""}`.trim() || u.email || userId : userId;
  };

  const getSelectedBills = () => projectBills.filter((b: any) => selectedBillIds.includes(b.id));
  const getSelectedTimesheets = () => projectTimesheets.filter((t: any) => selectedTimesheetIds.includes(t.id));

  const filteredBills = projectBills.filter((b: any) => {
    if (!billsSearch) return true;
    const q = billsSearch.toLowerCase();
    return (b.billNumber || "").toLowerCase().includes(q) || (b.supplierName || "").toLowerCase().includes(q);
  });

  const filteredTimesheets = projectTimesheets.filter((t: any) => {
    if (!labourSearch) return true;
    const q = labourSearch.toLowerCase();
    const name = getUserName(t.userId).toLowerCase();
    const dateStr = t.date ? format(new Date(t.date), "d MMM yy").toLowerCase() : "";
    return name.includes(q) || dateStr.includes(q);
  });

  // ── Allowance line handlers ────────────────────────────────────────────────

  const addAllowanceLine = (prefill?: { description?: string; amount?: number }) => {
    setAllowanceLines([
      ...allowanceLines,
      { description: prefill?.description ?? "", amount: prefill?.amount ?? 0, sortOrder: allowanceLines.length },
    ]);
  };

  const updateAllowanceLine = (index: number, field: keyof AllowanceLine, value: any) => {
    const updated = [...allowanceLines];
    updated[index] = { ...updated[index], [field]: value };
    setAllowanceLines(updated);
  };

  const deleteAllowanceLine = (index: number) => {
    setAllowanceLines(allowanceLines.filter((_, i) => i !== index));
  };

  // ── Cost line mutations ───────────────────────────────────────────────────

  const getCostLineAmountExTax = (line: CostLine) => {
    const markup = (line.markupPercent ?? 0) / 100;
    return line.quantity * line.unitCostExTax * (1 + markup);
  };

  const addCostLine = () => {
    setCostLines([
      ...costLines,
      { name: "", description: "", type: "Material", unitType: "each", costCode: "", quantity: 1, unitCostExTax: 0, markupPercent: null, taxable: true, sortOrder: costLines.length, showInPdf: true },
    ]);
  };

  const updateCostLine = (index: number, field: keyof CostLine, value: any) => {
    const updated = [...costLines];
    updated[index] = { ...updated[index], [field]: value };
    setCostLines(updated);
  };

  const deleteCostLine = (index: number) => {
    setCostLines(costLines.filter((_, i) => i !== index));
  };

  // ── Financial calculations ─────────────────────────────────────────────────

  const calculateCostLinesSubtotal = () =>
    costLines.reduce((sum, item) => sum + getCostLineAmountExTax(item), 0);

  const calculateAllowancesTotal = () =>
    allowanceLines.reduce((sum, item) => sum + item.amount, 0);

  const calculateBillsTotal = () =>
    getSelectedBills().reduce((sum: number, b: any) => sum + (b.total || 0) / 100, 0);

  const calculateLabourTotal = () =>
    getSelectedTimesheets().reduce((sum: number, t: any) => sum + (t.total || 0) / 100, 0);

  const calculateSubtotal = () =>
    calculateCostLinesSubtotal() + calculateAllowancesTotal() + calculateBillsTotal() + calculateLabourTotal();

  const calculateGST = () => {
    const taxableAmount = costLines
      .filter((item) => item.taxable)
      .reduce((sum, item) => sum + getCostLineAmountExTax(item), 0);
    return taxableAmount * 0.1;
  };

  const calculateTotal = () => calculateSubtotal() + calculateGST();

  const formatCurrency = (amount: number) => {
    const isWholeNumber = amount % 1 === 0;
    return new Intl.NumberFormat("en-AU", {
      style: "currency",
      currency: "AUD",
      minimumFractionDigits: isWholeNumber ? 0 : 2,
      maximumFractionDigits: 2,
    }).format(amount);
  };

  // ── Save bills/timesheets helper ──────────────────────────────────────────

  const saveBillsAndTimesheets = async (varId: string) => {
    await apiRequest(`/api/variations/${varId}/bills`, "POST", { billIds: selectedBillIds });
    await apiRequest(`/api/variations/${varId}/timesheets`, "POST", { timesheetIds: selectedTimesheetIds });
  };

  // ── Mutations ─────────────────────────────────────────────────────────────

  const createMutation = useMutation({
    mutationFn: async (data: VariationFormData) => {
      const variationData = {
        ...data,
        approvalDeadline: data.approvalDeadline || undefined,
        daysChanged: data.daysChanged || undefined,
        subtotal: Math.round(calculateSubtotal() * 100),
        gstAmount: Math.round(calculateGST() * 100),
        totalAmount: Math.round(calculateTotal() * 100),
        paidAmount: 0,
        balanceAmount: Math.round(calculateTotal() * 100),
      };

      const variationRes = await apiRequest("/api/variations", "POST", variationData);
      const newVariation = await variationRes.json() as Variation;

      for (let i = 0; i < costLines.length; i++) {
        const item = costLines[i];
        const amountExTax = getCostLineAmountExTax(item);
        const markupFactor = 1 + (item.markupPercent ?? 0) / 100;
        await apiRequest(`/api/variations/${newVariation.id}/items`, "POST", {
          variationId: newVariation.id,
          name: item.name || null,
          description: item.description,
          type: item.type,
          unitType: item.unitType,
          costCode: item.costCode || null,
          quantity: item.quantity,
          unitCostExTax: item.unitCostExTax,
          markupPercent: item.markupPercent ?? null,
          unitPrice: Math.round(item.unitCostExTax * markupFactor * 100),
          totalPrice: Math.round(amountExTax * 100),
          taxable: item.taxable,
          sortOrder: i,
          itemType: "cost_line",
          showInPdf: item.showInPdf,
        });
      }

      for (let i = 0; i < allowanceLines.length; i++) {
        const item = allowanceLines[i];
        await apiRequest(`/api/variations/${newVariation.id}/items`, "POST", {
          variationId: newVariation.id,
          description: item.description,
          quantity: 1,
          unitPrice: Math.round(item.amount * 100),
          totalPrice: Math.round(item.amount * 100),
          taxable: false,
          sortOrder: i,
          itemType: "allowance",
        });
      }

      await saveBillsAndTimesheets(newVariation.id);
      return newVariation;
    },
    onSuccess: (newVariation) => {
      queryClient.invalidateQueries({ queryKey: ["/api/variations"] });
      toast({ title: "Success", description: "Variation created successfully" });
      if (user?.id) {
        logActivity({
          projectId: newVariation.projectId,
          userId: user.id,
          activityType: "variation",
          action: "created",
          description: `User created variation '${newVariation.name}'`,
          entityId: newVariation.id,
          entityName: newVariation.name,
          metadata: {},
        });
      }
      handleCancel();
    },
    onError: (error: Error) => {
      toast({ title: "Error", description: error.message || "Failed to create variation", variant: "destructive" });
    },
  });

  const updateMutation = useMutation({
    mutationFn: async (data: VariationFormData) => {
      const variationData = {
        ...data,
        approvalDeadline: data.approvalDeadline || undefined,
        daysChanged: data.daysChanged || undefined,
        subtotal: Math.round(calculateSubtotal() * 100),
        gstAmount: Math.round(calculateGST() * 100),
        totalAmount: Math.round(calculateTotal() * 100),
        paidAmount: 0,
        balanceAmount: Math.round(calculateTotal() * 100),
      };

      const variationRes = await apiRequest(`/api/variations/${effectiveVariationId}`, "PATCH", variationData);
      const updatedVariation = await variationRes.json() as Variation;

      const existingCostLineItems = existingCostLines.filter((item) => (item as any).itemType !== "allowance");
      const existingAllowanceItems = existingCostLines.filter((item) => (item as any).itemType === "allowance");

      // Delete removed cost lines
      const existingCostIds = existingCostLineItems.map((item) => item.id);
      const currentCostIds = costLines.map((item) => item.id).filter(Boolean);
      for (const itemId of existingCostIds.filter((id) => !currentCostIds.includes(id))) {
        await apiRequest(`/api/variation-items/${itemId}`, "DELETE");
      }

      // Delete removed allowance lines
      const existingAllowanceIds = existingAllowanceItems.map((item) => item.id);
      const currentAllowanceIds = allowanceLines.map((item) => item.id).filter(Boolean);
      for (const itemId of existingAllowanceIds.filter((id) => !currentAllowanceIds.includes(id))) {
        await apiRequest(`/api/variation-items/${itemId}`, "DELETE");
      }

      // Save cost lines
      for (let i = 0; i < costLines.length; i++) {
        const item = costLines[i];
        const amountExTax = getCostLineAmountExTax(item);
        const markupFactor = 1 + (item.markupPercent ?? 0) / 100;
        const itemData = {
          variationId: effectiveVariationId,
          name: item.name || null,
          description: item.description,
          type: item.type,
          unitType: item.unitType,
          costCode: item.costCode || null,
          quantity: item.quantity,
          unitCostExTax: item.unitCostExTax,
          markupPercent: item.markupPercent ?? null,
          unitPrice: Math.round(item.unitCostExTax * markupFactor * 100),
          totalPrice: Math.round(amountExTax * 100),
          taxable: item.taxable,
          sortOrder: i,
          itemType: "cost_line",
          showInPdf: item.showInPdf,
        };
        if (item.id) {
          await apiRequest(`/api/variation-items/${item.id}`, "PATCH", itemData);
        } else {
          await apiRequest(`/api/variations/${effectiveVariationId}/items`, "POST", itemData);
        }
      }

      // Save allowance lines
      for (let i = 0; i < allowanceLines.length; i++) {
        const item = allowanceLines[i];
        const itemData = {
          variationId: effectiveVariationId,
          description: item.description,
          quantity: 1,
          unitPrice: Math.round(item.amount * 100),
          totalPrice: Math.round(item.amount * 100),
          taxable: false,
          sortOrder: i,
          itemType: "allowance",
        };
        if (item.id) {
          await apiRequest(`/api/variation-items/${item.id}`, "PATCH", itemData);
        } else {
          await apiRequest(`/api/variations/${effectiveVariationId}/items`, "POST", itemData);
        }
      }

      await saveBillsAndTimesheets(effectiveVariationId!);
      return updatedVariation;
    },
    onSuccess: (updatedVariation) => {
      queryClient.invalidateQueries({ queryKey: ["/api/variations"] });
      queryClient.invalidateQueries({ queryKey: [`/api/variations/${effectiveVariationId}`] });
      queryClient.invalidateQueries({ queryKey: [`/api/variations/${effectiveVariationId}/bills`] });
      queryClient.invalidateQueries({ queryKey: [`/api/variations/${effectiveVariationId}/timesheets`] });
      toast({ title: "Success", description: "Variation updated successfully" });
      if (user?.id) {
        logActivity({
          projectId: updatedVariation.projectId,
          userId: user.id,
          activityType: "variation",
          action: "updated",
          description: `User updated variation '${updatedVariation.name}'`,
          entityId: updatedVariation.id,
          entityName: updatedVariation.name,
          metadata: {},
        });
      }
      handleCancel();
    },
    onError: (error: Error) => {
      toast({ title: "Error", description: error.message || "Failed to update variation", variant: "destructive" });
    },
  });

  const moveToActionMutation = useMutation({
    mutationFn: async () => {
      const response = await apiRequest(`/api/variations/${effectiveVariationId}`, "PATCH", { status: "action" });
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/variations"] });
      queryClient.invalidateQueries({ queryKey: [`/api/variations/${effectiveVariationId}`] });
      toast({ title: "Success", description: "Variation moved to Action" });
    },
    onError: (error: Error) => {
      toast({ title: "Error", description: error.message || "Failed to move variation to Action", variant: "destructive" });
    },
  });

  const sendForApprovalMutation = useMutation({
    mutationFn: async () => {
      const response = await apiRequest(`/api/variations/${effectiveVariationId}`, "PATCH", { status: "pending" });
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/variations"] });
      queryClient.invalidateQueries({ queryKey: [`/api/variations/${effectiveVariationId}`] });
      toast({ title: "Success", description: "Variation sent for approval" });
    },
    onError: (error: Error) => {
      toast({ title: "Error", description: error.message || "Failed to send variation for approval", variant: "destructive" });
    },
  });

  const approveMutation = useMutation({
    mutationFn: async () => {
      const response = await apiRequest(`/api/variations/${effectiveVariationId}`, "PATCH", {
        status: "approved",
        approvedBy: user?.id || "unknown-user",
        approvedDate: new Date().toISOString(),
      });
      return response.json();
    },
    onSuccess: (approvedVariation) => {
      queryClient.invalidateQueries({ queryKey: ["/api/variations"] });
      queryClient.invalidateQueries({ queryKey: [`/api/variations/${effectiveVariationId}`] });
      setApproveDialogOpen(false);
      toast({ title: "Variation approved", description: "Variation approved successfully" });
      // T005: Show EOT toast if project end date was extended
      if (approvedVariation.scheduleExtended) {
        const { days, newEndDate } = approvedVariation.scheduleExtended;
        const formatted = new Date(newEndDate).toLocaleDateString("en-AU", { day: "numeric", month: "long", year: "numeric" });
        toast({ title: "Project end date extended", description: `Extended by ${days} working day${days !== 1 ? "s" : ""} to ${formatted}` });
      }
      if (user?.id) {
        logActivity({
          projectId: approvedVariation.projectId,
          userId: user.id,
          activityType: "variation",
          action: "approved",
          description: `User approved variation '${approvedVariation.name}'`,
          entityId: approvedVariation.id,
          entityName: approvedVariation.name,
          metadata: {},
        });
      }
    },
    onError: (error: Error) => {
      toast({ title: "Error", description: error.message || "Failed to approve variation", variant: "destructive" });
    },
  });

  const rejectMutation = useMutation({
    mutationFn: async (reason: string) => {
      const response = await apiRequest(`/api/variations/${effectiveVariationId}`, "PATCH", {
        status: "rejected",
        rejectionReason: reason,
      });
      return response.json();
    },
    onSuccess: (rejectedVariation) => {
      queryClient.invalidateQueries({ queryKey: ["/api/variations"] });
      queryClient.invalidateQueries({ queryKey: [`/api/variations/${effectiveVariationId}`] });
      setRejectDialogOpen(false);
      setRejectReason("");
      toast({ title: "Success", description: "Variation rejected" });
      if (user?.id) {
        logActivity({
          projectId: rejectedVariation.projectId,
          userId: user.id,
          activityType: "variation",
          action: "rejected",
          description: `User rejected variation '${rejectedVariation.name}'`,
          entityId: rejectedVariation.id,
          entityName: rejectedVariation.name,
          metadata: {},
        });
      }
    },
    onError: (error: Error) => {
      toast({ title: "Error", description: error.message || "Failed to reject variation", variant: "destructive" });
    },
  });

  // T002: Attachment upload handler
  const handleUploadAttachment = async (file: File) => {
    if (!effectiveVariationId) return;
    setUploadingAttachment(true);
    try {
      // Request presigned URL
      const urlRes = await apiRequest("/api/uploads/request-url", "POST", {
        name: file.name,
        size: file.size,
        contentType: file.type,
      });
      const { uploadURL, objectPath } = await urlRes.json();

      // Upload to object storage
      await fetch(uploadURL, {
        method: "PUT",
        body: file,
        headers: { "Content-Type": file.type },
      });

      const newAttachment = {
        name: file.name,
        url: objectPath,
        size: file.size,
        type: file.type,
      };

      const updated = [...attachments, newAttachment];
      setAttachments(updated);

      // Persist to variation
      await apiRequest(`/api/variations/${effectiveVariationId}`, "PATCH", {
        attachments: updated,
      });
      queryClient.invalidateQueries({ queryKey: [`/api/variations/${effectiveVariationId}`] });
      toast({ title: "File uploaded", description: file.name });
    } catch (err) {
      toast({ title: "Upload failed", description: "Failed to upload file", variant: "destructive" });
    } finally {
      setUploadingAttachment(false);
    }
  };

  const handleDeleteAttachment = async (index: number) => {
    if (!effectiveVariationId) return;
    const updated = attachments.filter((_, i) => i !== index);
    setAttachments(updated);
    await apiRequest(`/api/variations/${effectiveVariationId}`, "PATCH", { attachments: updated });
    queryClient.invalidateQueries({ queryKey: [`/api/variations/${effectiveVariationId}`] });
  };

  // T003: Download PDF
  const handleDownloadPdf = async () => {
    setPdfGenerating(true);
    try {
      const blob = await pdf(
        <VariationDocument
          variation={variation as any}
          items={existingCostLines}
          bills={existingVariationBills}
          company={companyInfo}
          project={projects.find((p) => p.id === form.watch("projectId")) as any}
          brandColor={companySettings?.brandColor || "#6d28d9"}
        />
      ).toBlob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `variation-${variation?.variationNumber || "export"}.pdf`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (err) {
      toast({ title: "PDF generation failed", variant: "destructive" });
    } finally {
      setPdfGenerating(false);
    }
  };

  // T003: Open send modal (pre-fill and get portal token)
  const handleOpenSendModal = async () => {
    if (!effectiveVariationId) return;
    try {
      const res = await apiRequest(`/api/variations/${effectiveVariationId}/portal-token`, "POST", {});
      const { portalUrl } = await res.json();
      const fullUrl = `${window.location.origin}${portalUrl}`;
      setSendTo("");
      setSendSubject(`Variation ${variation?.variationNumber || ""} — ${variation?.name || ""}`);
      setSendBody(`Hi,\n\nPlease review the variation below.\n\nYou can view and approve it online at:\n${fullUrl}\n\nKind regards,\n${user?.firstName || ""} ${user?.lastName || ""}`);
      setSendModalOpen(true);
    } catch {
      toast({ title: "Failed to prepare email", variant: "destructive" });
    }
  };

  // T003: Send email
  const sendEmailMutation = useMutation({
    mutationFn: async () => {
      let pdfBase64: string | undefined;
      if (sendAttachPdf) {
        const blob = await pdf(
          <VariationDocument
            variation={variation as any}
            items={existingCostLines}
            bills={existingVariationBills}
            company={companyInfo}
            project={projects.find((p) => p.id === form.watch("projectId")) as any}
            brandColor={companySettings?.brandColor || "#6d28d9"}
          />
        ).toBlob();
        const arrayBuf = await blob.arrayBuffer();
        pdfBase64 = btoa(String.fromCharCode(...new Uint8Array(arrayBuf)));
      }
      const res = await apiRequest(`/api/variations/${effectiveVariationId}/send`, "POST", {
        to: sendTo,
        subject: sendSubject,
        body: sendBody,
        pdfBase64,
        pdfFilename: `variation-${variation?.variationNumber || "export"}.pdf`,
      });
      if (!res.ok) throw new Error("Send failed");
      return res.json();
    },
    onSuccess: () => {
      setSendModalOpen(false);
      toast({ title: "Email sent", description: `Variation sent to ${sendTo}` });
      queryClient.invalidateQueries({ queryKey: [`/api/variations/${effectiveVariationId}`] });
    },
    onError: () => {
      toast({ title: "Failed to send email", variant: "destructive" });
    },
  });

  const onSubmit = (data: VariationFormData) => {
    if (isEditMode) {
      updateMutation.mutate(data);
    } else {
      createMutation.mutate(data);
    }
  };

  const handleCancel = () => {
    if (projectIdFromParams) {
      setLocation(`/projects/${projectIdFromParams}/variations`);
    } else {
      setLocation("/variations");
    }
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case "draft":
        return <Badge variant="secondary" data-testid="badge-status-draft"><FileText className="w-3 h-3 mr-1" />Draft</Badge>;
      case "action":
        return <Badge variant="destructive" data-testid="badge-status-action"><AlertCircle className="w-3 h-3 mr-1" />Action</Badge>;
      case "pending":
        return <Badge variant="default" data-testid="badge-status-pending"><Clock className="w-3 h-3 mr-1" />Pending</Badge>;
      case "approved":
        return <Badge variant="outline" className="border-green-500 text-green-700" data-testid="badge-status-approved"><CheckCircle className="w-3 h-3 mr-1" />Approved</Badge>;
      case "rejected":
        return <Badge variant="outline" className="border-red-500 text-red-700" data-testid="badge-status-rejected"><XCircle className="w-3 h-3 mr-1" />Rejected</Badge>;
      default:
        return <Badge variant="outline" data-testid={`badge-status-${status}`}>{status}</Badge>;
    }
  };

  if (variationLoading) {
    return (
      <div className="flex items-center justify-center h-full">
        <Loader2 className="h-8 w-8 animate-spin" data-testid="loading-spinner" />
      </div>
    );
  }

  const projectName = projects.find((p) => p.id === form.watch("projectId"))?.name || "";

  // ── Sub-section header component ─────────────────────────────────────────
  const SubHeader = ({
    dotColor,
    label,
    rightEl,
    collapsible,
    collapsed,
    onToggle,
  }: {
    dotColor: string;
    label: string;
    rightEl?: React.ReactNode;
    collapsible?: boolean;
    collapsed?: boolean;
    onToggle?: () => void;
  }) => (
    <div
      className={cn(
        "h-8 flex items-center justify-between px-3 gap-2 border-b border-border/50 bg-muted/40",
        collapsible && "cursor-pointer"
      )}
      onClick={collapsible ? onToggle : undefined}
    >
      <div className="flex items-center gap-2">
        <div className={cn("w-1.5 h-1.5 rounded-full flex-shrink-0", dotColor)} />
        <span className="text-xs font-medium text-muted-foreground uppercase tracking-wide">{label}</span>
      </div>
        <div className="flex items-center gap-2">
        {rightEl}
        {collapsible && (
          collapsed ? <ChevronDown className="h-3.5 w-3.5 text-muted-foreground flex-shrink-0" /> : <ChevronUp className="h-3.5 w-3.5 text-muted-foreground flex-shrink-0" />
        )}
      </div>
    </div>
  );

  // ── Compact label ─────────────────────────────────────────────────────────
  const FieldLabel = ({ children }: { children: React.ReactNode }) => (
    <div className={labelCls}>{children}</div>
  );

  return (
    <div className="flex h-full flex-col" data-testid="page-variation-detail">

      {/* ── Unified header card ── */}
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
              {isEditMode ? form.watch("variationNumber") : "New Variation"}
            </h2>
            {isEditMode && variation?.status && getStatusBadge(variation.status)}
            {projectName && (
              <span className="text-xs text-muted-foreground ml-1" data-testid="text-project-name">
                {projectName}
              </span>
            )}
          </div>

          <div className="flex items-center gap-1.5">
            {isEditMode && variationLoading && <Loader2 className="w-3 h-3 animate-spin text-muted-foreground" />}
            {isEditMode && (
              <>
                <button
                  type="button"
                  onClick={() => setPreviewOpen(true)}
                  className="h-6 w-auto px-2 text-xs border rounded-md hover-elevate active-elevate-2 flex items-center gap-1"
                  data-testid="button-preview-variation"
                >
                  <Eye className="w-3 h-3" />
                  <span>Preview</span>
                </button>
                <button
                  type="button"
                  onClick={handleDownloadPdf}
                  disabled={pdfGenerating}
                  className="h-6 w-auto px-2 text-xs border rounded-md hover-elevate active-elevate-2 flex items-center gap-1"
                  data-testid="button-download-pdf"
                >
                  {pdfGenerating ? <Loader2 className="w-3 h-3 animate-spin" /> : <Download className="w-3 h-3" />}
                  <span>PDF</span>
                </button>
                <button
                  type="button"
                  onClick={handleOpenSendModal}
                  className="h-6 w-auto px-2 text-xs border rounded-md hover-elevate active-elevate-2 flex items-center gap-1"
                  data-testid="button-send-to-client"
                >
                  <Mail className="w-3 h-3" />
                  <span>Send</span>
                </button>
              </>
            )}
            {isEditMode && variation?.status === "draft" && (
              <button
                type="button"
                onClick={() => moveToActionMutation.mutate()}
                disabled={moveToActionMutation.isPending}
                className="h-6 w-auto px-2 text-xs border rounded-md hover-elevate active-elevate-2 flex items-center gap-1"
                data-testid="button-move-to-action"
              >
                {moveToActionMutation.isPending ? <Loader2 className="w-3 h-3 animate-spin" /> : <Send className="w-3 h-3" />}
                <span>Move to Action</span>
              </button>
            )}
            {isEditMode && variation?.status === "action" && (
              <button
                type="button"
                onClick={() => sendForApprovalMutation.mutate()}
                disabled={sendForApprovalMutation.isPending}
                className="h-6 w-auto px-2 text-xs border rounded-md bg-[#bba7db] text-white border-[#bba7db]/20 hover:bg-[#bba7db]/90 active-elevate-2 flex items-center gap-1"
                data-testid="button-send-for-approval"
              >
                {sendForApprovalMutation.isPending ? <Loader2 className="w-3 h-3 animate-spin" /> : <Send className="w-3 h-3" />}
                <span>Send for Approval</span>
              </button>
            )}
            {isEditMode && variation?.status === "pending" && (
              <>
                <button
                  type="button"
                  onClick={() => setRejectDialogOpen(true)}
                  disabled={rejectMutation.isPending}
                  className="h-6 w-auto px-2 text-xs border rounded-md hover-elevate active-elevate-2 flex items-center gap-1"
                  data-testid="button-reject"
                >
                  <X className="w-3 h-3" />
                  <span>Reject</span>
                </button>
                <button
                  type="button"
                  onClick={() => setApproveDialogOpen(true)}
                  disabled={approveMutation.isPending}
                  className="h-6 w-auto px-2 text-xs border rounded-md bg-emerald-600 text-white border-emerald-600/20 hover:bg-emerald-600/90 active-elevate-2 flex items-center gap-1"
                  data-testid="button-approve"
                >
                  <Check className="w-3 h-3" />
                  <span>Approve</span>
                </button>
              </>
            )}
            <button
              type="button"
              onClick={form.handleSubmit(onSubmit)}
              disabled={createMutation.isPending || updateMutation.isPending}
              className="h-6 w-auto px-2 text-xs border rounded-md bg-[#bba7db] text-white border-[#bba7db]/20 hover:bg-[#bba7db]/90 active-elevate-2 flex items-center gap-0.5"
              data-testid="button-save"
            >
              {(createMutation.isPending || updateMutation.isPending) ? (
                <Loader2 className="w-3 h-3 animate-spin" />
              ) : (
                <FileText className="w-3 h-3" />
              )}
              <span>{isEditMode ? "Save Changes" : "Create Variation"}</span>
            </button>
          </div>
        </div>

        {/* Row 2 — Live financial summary strip */}
        <div className="bg-[#bba7db]/10 flex items-center px-4 py-2 gap-5 text-xs">
          <div className="flex items-center gap-1.5" data-testid="header-summary-subtotal">
            <span className="text-muted-foreground">Subtotal</span>
            <span className="font-semibold tabular-nums">{formatCurrency(calculateSubtotal())}</span>
          </div>
          <div className="w-px h-3.5 bg-[#bba7db]/40" />
          <div className="flex items-center gap-1.5" data-testid="header-summary-gst">
            <span className="text-muted-foreground">GST</span>
            <span className="font-semibold tabular-nums">{formatCurrency(calculateGST())}</span>
          </div>
          <div className="w-px h-3.5 bg-[#bba7db]/40" />
          <div className="flex items-center gap-1.5" data-testid="header-summary-total">
            <span className="text-muted-foreground">Total</span>
            <span className="font-semibold tabular-nums text-[#bba7db]">{formatCurrency(calculateTotal())}</span>
          </div>
        </div>

      </div>

      <div className="flex-1 overflow-auto">
        <div className="max-w-6xl mx-auto px-3 py-3">
          <Form {...form}>
            <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-3">

                {/* ── General Info ── */}
                <div className="rounded-lg border border-border bg-card overflow-hidden">
                  <div className="h-8 flex items-center px-3 gap-2 border-b border-border/50 bg-muted/40">
                    <div className="w-1.5 h-1.5 rounded-full bg-[#bba7db]/80 flex-shrink-0" />
                    <span className="text-xs font-medium text-muted-foreground uppercase tracking-wide">General Info</span>
                  </div>
                  <div className="p-4 space-y-3">

                    {/* Row 1: Name (col-span-2) + Variation Number */}
                    <div className="grid grid-cols-3 gap-3">
                      <div className="col-span-2 space-y-1">
                        <FieldLabel>Name *</FieldLabel>
                        <FormField
                          control={form.control}
                          name="name"
                          render={({ field }) => (
                            <FormItem>
                              <FormControl>
                                <Input className="h-8 text-sm" placeholder="Enter variation name" {...field} data-testid="input-name" />
                              </FormControl>
                              <FormMessage />
                            </FormItem>
                          )}
                        />
                      </div>
                      <div className="space-y-1">
                        <FieldLabel>Variation No.</FieldLabel>
                        <FormField
                          control={form.control}
                          name="variationNumber"
                          render={({ field }) => (
                            <FormItem>
                              <FormControl>
                                <Input className="h-8 text-sm" placeholder="Auto-generated" {...field} data-testid="input-variation-number" />
                              </FormControl>
                              <FormMessage />
                            </FormItem>
                          )}
                        />
                      </div>
                    </div>

                    {/* Row 2: Approval Deadline + Days Changed */}
                    <div className="grid grid-cols-2 gap-3">
                      <div className="space-y-1">
                        <FieldLabel>Approval Deadline</FieldLabel>
                        <FormField
                          control={form.control}
                          name="approvalDeadline"
                          render={({ field }) => (
                            <FormItem>
                              <Popover>
                                <PopoverTrigger asChild>
                                  <FormControl>
                                    <Button
                                      variant="outline"
                                      size="sm"
                                      className={cn(
                                        "w-full h-8 justify-start text-left font-normal text-sm",
                                        !field.value && "text-muted-foreground"
                                      )}
                                      data-testid="button-approval-deadline"
                                    >
                                      <CalendarIcon className="mr-2 h-3.5 w-3.5" />
                                      {field.value ? format(field.value, "d MMM yyyy") : "Pick a date"}
                                    </Button>
                                  </FormControl>
                                </PopoverTrigger>
                                <PopoverContent className="w-auto p-0" align="start">
                                  <Calendar mode="single" selected={field.value} onSelect={field.onChange} initialFocus />
                                </PopoverContent>
                              </Popover>
                              <FormMessage />
                            </FormItem>
                          )}
                        />
                      </div>
                      <div className="space-y-1">
                        <FieldLabel>Days Changed</FieldLabel>
                        <FormField
                          control={form.control}
                          name="daysChanged"
                          render={({ field }) => (
                            <FormItem>
                              <FormControl>
                                <Input
                                  type="number"
                                  className="h-8 text-sm"
                                  placeholder="0"
                                  {...field}
                                  onChange={(e) => field.onChange(e.target.value ? parseInt(e.target.value) : undefined)}
                                  value={field.value || ""}
                                  data-testid="input-days-changed"
                                />
                              </FormControl>
                              <FormMessage />
                            </FormItem>
                          )}
                        />
                      </div>
                    </div>

                    {/* Row 3: Introduction Text */}
                    <div className="space-y-1">
                      <FieldLabel>Introduction Text</FieldLabel>
                      <FormField
                        control={form.control}
                        name="introductionText"
                        render={({ field }) => (
                          <FormItem>
                            <FormControl>
                              <Textarea
                                placeholder="Enter introduction text"
                                className="resize-none min-h-[72px] text-sm"
                                {...field}
                                data-testid="textarea-introduction"
                              />
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                    </div>

                  </div>
                </div>

                {/* ── Financials ── */}
                <div className="rounded-lg border border-border bg-card overflow-hidden" data-testid="section-financials">

                  {/* Cost Lines sub-section */}
                  <div>
                    <SubHeader
                      dotColor="bg-amber-400/70"
                      label={costLines.length > 0 ? `Cost Lines · ${formatCurrency(calculateCostLinesSubtotal())}` : "Cost Lines"}
                      rightEl={
                        <button
                          type="button"
                          onClick={addCostLine}
                          className="h-6 w-auto px-2 text-xs border rounded-md hover-elevate active-elevate-2 flex items-center gap-1"
                          data-testid="button-add-cost-line"
                        >
                          <Plus className="h-3 w-3" />
                          <span>Add Item</span>
                        </button>
                      }
                    />
                    <div className="px-4 py-3 overflow-x-auto">
                      {costLines.length === 0 ? (
                        <div className="py-1.5 flex items-center gap-3">
                          <button
                            type="button"
                            onClick={addCostLine}
                            className="h-7 px-3 text-xs border rounded-md hover-elevate active-elevate-2 flex items-center gap-1.5"
                            data-testid="empty-cost-lines"
                          >
                            <Plus className="w-3 h-3" />
                            Add first item
                          </button>
                          <span className="text-xs text-muted-foreground/50">Items added here appear as a mini estimate</span>
                        </div>
                      ) : (
                        <div>
                          <table className="w-full text-sm border-collapse min-w-[1050px]">
                            <thead>
                              <tr className="h-6 bg-muted/30">
                                <th className="w-[72px] text-left text-[10px] uppercase tracking-wide text-muted-foreground/50 font-normal py-0 px-2">Type</th>
                                <th className="w-28 text-left text-[10px] uppercase tracking-wide text-muted-foreground/50 font-normal py-0 px-2">Name</th>
                                <th className="text-left text-[10px] uppercase tracking-wide text-muted-foreground/50 font-normal py-0 px-2">Description</th>
                                <th className="w-[72px] text-left text-[10px] uppercase tracking-wide text-muted-foreground/50 font-normal py-0 px-2">Cost Code</th>
                                <th className="w-14 text-right text-[10px] uppercase tracking-wide text-muted-foreground/50 font-normal py-0 px-2">Qty</th>
                                <th className="w-12 text-left text-[10px] uppercase tracking-wide text-muted-foreground/50 font-normal py-0 px-2">Unit</th>
                                <th className="w-24 text-right text-[10px] uppercase tracking-wide text-muted-foreground/50 font-normal py-0 px-2">Unit Cost</th>
                                <th className="w-16 text-right text-[10px] uppercase tracking-wide text-muted-foreground/50 font-normal py-0 px-2">Mkup %</th>
                                <th className="w-24 text-right text-[10px] uppercase tracking-wide text-muted-foreground/50 font-normal py-0 px-2">Amt ex Tax</th>
                                <th className="w-24 text-right text-[10px] uppercase tracking-wide text-muted-foreground/50 font-normal py-0 px-2">Amt inc Tax</th>
                                <th className="w-16 text-center text-[10px] uppercase tracking-wide text-muted-foreground/50 font-normal py-0 px-2">Visible</th>
                                <th className="w-8" />
                              </tr>
                            </thead>
                            <tbody>
                              {costLines.map((line, index) => {
                                const typeColors: Record<string, string> = {
                                  Material: "bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300",
                                  Labour: "bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-300",
                                  Subcontractor: "bg-orange-100 text-orange-700 dark:bg-orange-900/40 dark:text-orange-300",
                                  Fee: "bg-purple-100 text-purple-700 dark:bg-purple-900/40 dark:text-purple-300",
                                };
                                const amtExTax = getCostLineAmountExTax(line);
                                const amtIncTax = line.taxable ? amtExTax * 1.1 : amtExTax;
                                return (
                                  <tr key={index} className={cn("h-9 border-b border-border/30 last:border-0 transition-opacity", !line.showInPdf && "opacity-40")} data-testid={`row-cost-line-${index}`}>
                                    <td className="px-2 py-1">
                                      <Select
                                        value={line.type}
                                        onValueChange={(val) => updateCostLine(index, "type", val)}
                                      >
                                        <SelectTrigger className="h-6 text-xs border-0 bg-transparent shadow-none px-1 rounded-sm focus:ring-1 focus:ring-ring w-full">
                                          <span className={cn("inline-flex items-center rounded px-1.5 py-0.5 text-[10px] font-medium", typeColors[line.type] || typeColors.Material)}>
                                            {line.type}
                                          </span>
                                        </SelectTrigger>
                                        <SelectContent>
                                          <SelectItem value="Material">Material</SelectItem>
                                          <SelectItem value="Labour">Labour</SelectItem>
                                          <SelectItem value="Subcontractor">Subcontractor</SelectItem>
                                          <SelectItem value="Fee">Fee</SelectItem>
                                        </SelectContent>
                                      </Select>
                                    </td>
                                    <td className="px-2 py-1">
                                      <Input value={line.name} onChange={(e) => updateCostLine(index, "name", e.target.value)} placeholder="Item name" className={cn("h-7 text-sm border-0 bg-transparent shadow-none focus-visible:ring-1 focus-visible:ring-ring px-1 rounded-sm font-medium", !line.showInPdf && "line-through")} data-testid={`input-name-${index}`} />
                                    </td>
                                    <td className="px-2 py-1">
                                      <Input value={line.description} onChange={(e) => updateCostLine(index, "description", e.target.value)} placeholder="Client-facing notes" className="h-7 text-sm border-0 bg-transparent shadow-none focus-visible:ring-1 focus-visible:ring-ring px-1 rounded-sm text-muted-foreground" data-testid={`input-description-${index}`} />
                                    </td>
                                    <td className="px-2 py-1">
                                      <Input value={line.costCode} onChange={(e) => updateCostLine(index, "costCode", e.target.value)} placeholder="—" className="h-7 text-xs border-0 bg-transparent shadow-none focus-visible:ring-1 focus-visible:ring-ring px-1 rounded-sm text-muted-foreground" data-testid={`input-cost-code-${index}`} />
                                    </td>
                                    <td className="px-2 py-1">
                                      <Input type="number" value={line.quantity} onChange={(e) => updateCostLine(index, "quantity", parseFloat(e.target.value) || 0)} min="0" step="any" className="h-7 text-sm text-right border-0 bg-transparent shadow-none focus-visible:ring-1 focus-visible:ring-ring px-1 rounded-sm" data-testid={`input-quantity-${index}`} />
                                    </td>
                                    <td className="px-2 py-1">
                                      <Input value={line.unitType} onChange={(e) => updateCostLine(index, "unitType", e.target.value)} placeholder="each" className="h-7 text-xs border-0 bg-transparent shadow-none focus-visible:ring-1 focus-visible:ring-ring px-1 rounded-sm text-muted-foreground" data-testid={`input-unit-type-${index}`} />
                                    </td>
                                    <td className="px-2 py-1">
                                      <Input type="number" value={line.unitCostExTax} onChange={(e) => updateCostLine(index, "unitCostExTax", parseFloat(e.target.value) || 0)} min="0" step="0.01" className="h-7 text-sm text-right border-0 bg-transparent shadow-none focus-visible:ring-1 focus-visible:ring-ring px-1 rounded-sm" data-testid={`input-unit-cost-${index}`} />
                                    </td>
                                    <td className="px-2 py-1">
                                      <Input type="number" value={line.markupPercent ?? ""} onChange={(e) => updateCostLine(index, "markupPercent", e.target.value === "" ? null : parseFloat(e.target.value) || 0)} min="0" step="1" placeholder="0" className="h-7 text-sm text-right border-0 bg-transparent shadow-none focus-visible:ring-1 focus-visible:ring-ring px-1 rounded-sm" data-testid={`input-markup-${index}`} />
                                    </td>
                                    <td className="px-2 py-1 text-right">
                                      <span className="text-sm font-medium tabular-nums" data-testid={`text-amt-ex-tax-${index}`}>{formatCurrency(amtExTax)}</span>
                                    </td>
                                    <td className="px-2 py-1 text-right">
                                      <span className="text-sm tabular-nums text-muted-foreground" data-testid={`text-amt-inc-tax-${index}`}>{formatCurrency(amtIncTax)}</span>
                                    </td>
                                    <td className="px-2 py-1 text-center">
                                      <button
                                        type="button"
                                        onClick={() => updateCostLine(index, "showInPdf", !line.showInPdf)}
                                        className={cn("h-6 w-6 flex items-center justify-center rounded-md hover-elevate active-elevate-2 mx-auto", line.showInPdf ? "text-muted-foreground" : "text-muted-foreground/40")}
                                        title={line.showInPdf ? "Visible in PDF — click to hide" : "Hidden from PDF — click to show"}
                                        data-testid={`button-toggle-visibility-${index}`}
                                      >
                                        {line.showInPdf ? <Eye className="h-3.5 w-3.5" /> : <EyeOff className="h-3.5 w-3.5" />}
                                      </button>
                                    </td>
                                    <td className="px-2 py-1">
                                      <button type="button" onClick={() => deleteCostLine(index)} className="h-6 w-6 flex items-center justify-center rounded-md hover-elevate active-elevate-2 text-muted-foreground" data-testid={`button-delete-${index}`}>
                                        <Trash2 className="h-3.5 w-3.5" />
                                      </button>
                                    </td>
                                  </tr>
                                );
                              })}
                            </tbody>
                          </table>
                          <div className="flex items-center justify-end gap-6 pt-2 border-t border-border/30 text-sm">
                            <span className="text-muted-foreground">Ex Tax:</span>
                            <span className="font-semibold tabular-nums">{formatCurrency(calculateCostLinesSubtotal())}</span>
                            <span className="text-muted-foreground">Inc Tax:</span>
                            <span className="font-semibold tabular-nums">{formatCurrency(costLines.filter(l => l.taxable).reduce((s, l) => s + getCostLineAmountExTax(l) * 1.1, 0) + costLines.filter(l => !l.taxable).reduce((s, l) => s + getCostLineAmountExTax(l), 0))}</span>
                          </div>
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Bills sub-section */}
                  <div className="border-t border-border/50" data-testid="section-bills">
                    <SubHeader
                      dotColor="bg-orange-400/70"
                      label={selectedBillIds.length > 0 ? `Bills · ${formatCurrency(calculateBillsTotal())}` : "Bills"}
                      collapsible
                      collapsed={billsCollapsed}
                      onToggle={() => setBillsCollapsed((v) => !v)}
                      rightEl={
                        <button
                          type="button"
                          onClick={(e) => { e.stopPropagation(); setModalBillIds([...selectedBillIds]); setBillsModalOpen(true); }}
                          className="h-6 px-2 text-xs border rounded-md hover-elevate active-elevate-2 flex items-center gap-1"
                          data-testid="button-import-bills"
                        >
                          <Plus className="w-3 h-3" />
                          Import Bills
                        </button>
                      }
                    />
                    {!billsCollapsed && (
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
                              <TableHead className="text-right text-[10px] uppercase tracking-wide text-muted-foreground/50 font-normal py-0 px-2 w-28">Total</TableHead>
                              <TableHead className="w-8 py-0" />
                            </TableRow>
                          </TableHeader>
                          <TableBody>
                            {getSelectedBills().map((b: any) => (
                              <TableRow key={b.id} className="h-9">
                                <TableCell className="text-sm font-medium py-1 px-2">{b.billNumber}</TableCell>
                                <TableCell className="text-sm text-muted-foreground py-1 px-2">{b.supplierName || "—"}</TableCell>
                                <TableCell className="text-sm text-muted-foreground py-1 px-2">{b.billDate ? format(new Date(b.billDate), "d MMM yyyy") : "—"}</TableCell>
                                <TableCell className="text-right text-sm font-medium py-1 px-2">{formatCurrency(b.total / 100)}</TableCell>
                                <TableCell className="py-1 px-2 w-8">
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
                    )}
                  </div>

                  {/* Labour sub-section */}
                  <div className="border-t border-border/50" data-testid="section-labour">
                    <SubHeader
                      dotColor="bg-indigo-400/70"
                      label={selectedTimesheetIds.length > 0 ? `Labour · ${formatCurrency(calculateLabourTotal())}` : "Labour"}
                      collapsible
                      collapsed={labourCollapsed}
                      onToggle={() => setLabourCollapsed((v) => !v)}
                      rightEl={
                        <button
                          type="button"
                          onClick={(e) => { e.stopPropagation(); setModalTimesheetIds([...selectedTimesheetIds]); setLabourModalOpen(true); }}
                          className="h-6 px-2 text-xs border rounded-md hover-elevate active-elevate-2 flex items-center gap-1"
                          data-testid="button-import-labour"
                        >
                          <Plus className="w-3 h-3" />
                          Import Labour
                        </button>
                      }
                    />
                    {!labourCollapsed && (
                    <div className="px-4 py-3">
                      {selectedTimesheetIds.length === 0 ? (
                        <p className="text-sm text-muted-foreground text-center py-2">No labour selected.</p>
                      ) : (
                        <Table>
                          <TableHeader>
                            <TableRow className="h-6 bg-muted/30">
                              <TableHead className="text-[10px] uppercase tracking-wide text-muted-foreground/50 font-normal py-0 px-2">Date</TableHead>
                              <TableHead className="text-[10px] uppercase tracking-wide text-muted-foreground/50 font-normal py-0 px-2">Staff</TableHead>
                              <TableHead className="text-right text-[10px] uppercase tracking-wide text-muted-foreground/50 font-normal py-0 px-2">Hours</TableHead>
                              <TableHead className="text-right text-[10px] uppercase tracking-wide text-muted-foreground/50 font-normal py-0 px-2 w-28">Total</TableHead>
                              <TableHead className="w-8 py-0" />
                            </TableRow>
                          </TableHeader>
                          <TableBody>
                            {getSelectedTimesheets().map((t: any) => (
                              <TableRow key={t.id} className="h-9">
                                <TableCell className="text-sm text-muted-foreground py-1 px-2">{t.date ? format(new Date(t.date), "d MMM yyyy") : "—"}</TableCell>
                                <TableCell className="text-sm font-medium py-1 px-2">{getUserName(t.userId)}</TableCell>
                                <TableCell className="text-right text-sm tabular-nums py-1 px-2">{Number(t.duration).toFixed(1)}</TableCell>
                                <TableCell className="text-right text-sm font-medium py-1 px-2">{formatCurrency((t.total || 0) / 100)}</TableCell>
                                <TableCell className="py-1 px-2 w-8">
                                  <button type="button" onClick={() => setSelectedTimesheetIds(prev => prev.filter(id => id !== t.id))} className="text-muted-foreground hover:text-destructive">
                                    <X className="w-3.5 h-3.5" />
                                  </button>
                                </TableCell>
                              </TableRow>
                            ))}
                          </TableBody>
                        </Table>
                      )}
                    </div>
                    )}
                  </div>

                  {/* Allowances sub-section */}
                  <div className="border-t border-border/50" data-testid="section-allowances">
                    <SubHeader
                      dotColor="bg-teal-400/70"
                      label={allowanceLines.length > 0 ? `Allowances · ${formatCurrency(calculateAllowancesTotal())}` : "Allowances"}
                      collapsible
                      collapsed={allowancesCollapsed}
                      onToggle={() => setAllowancesCollapsed((v) => !v)}
                      rightEl={
                        <div className="flex items-center gap-1.5">
                          <button
                            type="button"
                            onClick={(e) => { e.stopPropagation(); setAllowancesModalOpen(true); }}
                            className="h-6 px-2 text-xs border rounded-md hover-elevate active-elevate-2 flex items-center gap-1"
                            data-testid="button-import-allowance"
                          >
                            <Plus className="w-3 h-3" />
                            Import Allowance
                          </button>
                          <button
                            type="button"
                            onClick={addAllowanceLine}
                            className="h-6 px-2 text-xs border rounded-md hover-elevate active-elevate-2 flex items-center gap-1"
                            data-testid="button-add-allowance"
                          >
                            <Plus className="w-3 h-3" />
                            Add Manual
                          </button>
                        </div>
                      }
                    />
                    {!allowancesCollapsed && (
                    <div className="px-4 py-3">
                      {allowanceLines.length === 0 ? (
                        <div className="py-1.5 flex items-center gap-3">
                          <button
                            type="button"
                            onClick={() => setAllowancesModalOpen(true)}
                            className="h-7 px-3 text-xs border rounded-md hover-elevate active-elevate-2 flex items-center gap-1.5"
                            data-testid="button-select-allowances-empty"
                          >
                            <Plus className="w-3 h-3" />
                            Import from Project Allowances
                          </button>
                          <span className="text-xs text-muted-foreground/50">or add a manual adjustment above</span>
                        </div>
                      ) : (
                        <>
                          <Table>
                            <TableHeader>
                              <TableRow className="h-6 bg-muted/30">
                                <TableHead className="text-[10px] uppercase tracking-wide text-muted-foreground/50 font-normal py-0 px-2">Description</TableHead>
                                <TableHead className="w-36 text-right text-[10px] uppercase tracking-wide text-muted-foreground/50 font-normal py-0 px-2">Adjustment ($)</TableHead>
                                <TableHead className="w-8 py-0" />
                              </TableRow>
                            </TableHeader>
                            <TableBody>
                              {allowanceLines.map((line, index) => (
                                <TableRow key={index} className="h-9" data-testid={`row-allowance-${index}`}>
                                  <TableCell className="px-2 py-1">
                                    <Input
                                      value={line.description}
                                      onChange={(e) => updateAllowanceLine(index, "description", e.target.value)}
                                      placeholder="e.g. Kitchen allowance adjustment"
                                      className="h-7 text-sm border-0 bg-transparent shadow-none focus-visible:ring-1 focus-visible:ring-ring px-1 rounded-sm"
                                      data-testid={`input-allowance-description-${index}`}
                                    />
                                  </TableCell>
                                  <TableCell className="px-2 py-1">
                                    <Input
                                      type="number"
                                      value={line.amount}
                                      onChange={(e) => updateAllowanceLine(index, "amount", parseFloat(e.target.value) || 0)}
                                      step="0.01"
                                      className="h-7 text-sm text-right border-0 bg-transparent shadow-none focus-visible:ring-1 focus-visible:ring-ring px-1 rounded-sm"
                                      data-testid={`input-allowance-amount-${index}`}
                                    />
                                  </TableCell>
                                  <TableCell className="px-2 py-1">
                                    <button
                                      type="button"
                                      onClick={() => deleteAllowanceLine(index)}
                                      className="h-6 w-6 flex items-center justify-center rounded-md hover-elevate active-elevate-2 text-muted-foreground"
                                      data-testid={`button-delete-allowance-${index}`}
                                    >
                                      <Trash2 className="h-3.5 w-3.5" />
                                    </button>
                                  </TableCell>
                                </TableRow>
                              ))}
                            </TableBody>
                          </Table>
                          <div className="flex items-center justify-end gap-2 pt-2 border-t text-sm">
                            <span className="text-muted-foreground">Total Adjustments:</span>
                            <span className={cn("font-semibold tabular-nums", calculateAllowancesTotal() < 0 ? "text-red-500" : "")}>
                              {formatCurrency(calculateAllowancesTotal())}
                            </span>
                          </div>
                        </>
                      )}
                    </div>
                    )}
                  </div>

                  {/* ── Variation Summary panel ── */}
                  <div className="border-t border-border/50" data-testid="summary-panel">
                    <div className="bg-[#bba7db]/10 px-4 py-3 flex items-center justify-between gap-4 border-b border-border/50">
                      <div className="flex items-center gap-2">
                        <div className="w-1.5 h-1.5 rounded-full flex-shrink-0 bg-[#bba7db]/80" />
                        <span className="text-xs font-medium">Variation Summary</span>
                      </div>
                    </div>
                    <div className="px-4 py-3">
                      <div className="grid grid-cols-5 gap-6">
                        {/* Left: Breakdown */}
                        <div className="col-span-3 space-y-1.5">
                          <div className="flex justify-between text-sm">
                            <span className="text-muted-foreground">Cost Lines</span>
                            <span className="font-medium tabular-nums">{formatCurrency(calculateCostLinesSubtotal())}</span>
                          </div>
                          {calculateBillsTotal() > 0 && (
                            <div className="flex justify-between text-sm">
                              <span className="text-muted-foreground">Bills ({selectedBillIds.length})</span>
                              <span className="font-medium tabular-nums">{formatCurrency(calculateBillsTotal())}</span>
                            </div>
                          )}
                          {calculateLabourTotal() > 0 && (
                            <div className="flex justify-between text-sm">
                              <span className="text-muted-foreground">Labour ({selectedTimesheetIds.length})</span>
                              <span className="font-medium tabular-nums">{formatCurrency(calculateLabourTotal())}</span>
                            </div>
                          )}
                          {calculateAllowancesTotal() !== 0 && (
                            <div className="flex justify-between text-sm">
                              <span className="text-muted-foreground">Allowances ({allowanceLines.length})</span>
                              <span className={cn("font-medium tabular-nums", calculateAllowancesTotal() < 0 ? "text-red-500" : "")}>{formatCurrency(calculateAllowancesTotal())}</span>
                            </div>
                          )}
                          <div className="flex justify-between text-sm pt-1 border-t border-border/50">
                            <span className="text-muted-foreground" data-testid="text-label-subtotal">Subtotal</span>
                            <span className="font-medium tabular-nums" data-testid="text-subtotal">{formatCurrency(calculateSubtotal())}</span>
                          </div>
                          <div className="flex justify-between text-sm">
                            <span className="text-muted-foreground" data-testid="text-label-gst">GST (10%)</span>
                            <span className="font-medium tabular-nums" data-testid="text-gst">{formatCurrency(calculateGST())}</span>
                          </div>
                        </div>
                        {/* Right: Total callout */}
                        <div className="col-span-2 flex flex-col items-end justify-end gap-1">
                          <span className="text-xs text-muted-foreground uppercase tracking-wide">Total</span>
                          <span className="text-2xl font-bold tabular-nums text-[#bba7db]" data-testid="text-total">{formatCurrency(calculateTotal())}</span>
                        </div>
                      </div>
                    </div>
                  </div>

                </div>

                {/* ── Documentation Card ── */}
                <div className="rounded-lg border border-border bg-card overflow-hidden" data-testid="section-documentation">

                  {/* Closing Text sub-section */}
                  <div>
                    <SubHeader
                      dotColor="bg-amber-400/70"
                      label="Closing Text"
                      collapsible
                      collapsed={closingCollapsed}
                      onToggle={() => setClosingCollapsed((v) => !v)}
                    />
                    {!closingCollapsed && (
                      <div className="px-4 py-3">
                        <FormField
                          control={form.control}
                          name="closingText"
                          render={({ field }) => (
                            <FormItem>
                              <FormControl>
                                <Textarea
                                  placeholder="Enter closing text"
                                  className="resize-none min-h-[80px] text-sm"
                                  {...field}
                                  data-testid="textarea-closing"
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
                    <SubHeader
                      dotColor="bg-slate-400/60"
                      label="Terms & Conditions"
                      collapsible
                      collapsed={termsCollapsed}
                      onToggle={() => setTermsCollapsed((v) => !v)}
                    />
                    {!termsCollapsed && (
                      <div className="px-4 py-3 space-y-2">
                        {companySettings?.termsTemplates && companySettings.termsTemplates.length > 0 && (
                          <div className="flex items-center gap-2">
                            <span className="text-xs text-muted-foreground flex-shrink-0">Load template:</span>
                            <Select
                              value={selectedTemplateId}
                              onValueChange={(id) => {
                                setSelectedTemplateId(id);
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
                                      : "Type the terms and conditions for this variation..."
                                  }
                                  className="text-sm resize-y"
                                  data-testid="textarea-terms-and-conditions"
                                />
                              </FormControl>
                              <FormMessage />
                            </FormItem>
                          )}
                        />
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
                  <div className="border-t border-border/50">
                    <div className="h-8 flex items-center px-3 gap-2 border-b border-border/50 bg-muted/40">
                      <div className="w-1.5 h-1.5 rounded-full bg-slate-400/70 flex-shrink-0" />
                      <span className="text-xs font-medium text-muted-foreground uppercase tracking-wide" data-testid="text-attachments-title">
                        Attachments {attachments.length > 0 && `· ${attachments.length}`}
                      </span>
                      <Paperclip className="h-3 w-3 text-muted-foreground/50 ml-0.5" />
                      {isEditMode && (
                        <button
                          type="button"
                          onClick={() => attachmentInputRef.current?.click()}
                          disabled={uploadingAttachment}
                          className="ml-auto h-5 px-1.5 text-[10px] border rounded flex items-center gap-1 hover-elevate active-elevate-2 text-muted-foreground"
                          data-testid="button-upload-attachment"
                        >
                          {uploadingAttachment ? <Loader2 className="w-2.5 h-2.5 animate-spin" /> : <Upload className="w-2.5 h-2.5" />}
                          Upload
                        </button>
                      )}
                    </div>
                    <input
                      ref={attachmentInputRef}
                      type="file"
                      className="hidden"
                      onChange={(e) => { const f = e.target.files?.[0]; if (f) { handleUploadAttachment(f); e.target.value = ""; } }}
                    />
                    <div className="px-4 py-3">
                      {attachments.length === 0 ? (
                        <p className="text-sm text-muted-foreground text-center py-1" data-testid="attachments-empty">No attachments added.</p>
                      ) : (
                        <div className="space-y-1.5">
                          {attachments.map((att, idx) => (
                            <div key={idx} className="flex items-center gap-2 text-sm group">
                              <Paperclip className="w-3 h-3 text-muted-foreground flex-shrink-0" />
                              <span className="flex-1 truncate text-foreground">{att.name}</span>
                              {att.size && (
                                <span className="text-xs text-muted-foreground flex-shrink-0">
                                  {(att.size / 1024).toFixed(0)}KB
                                </span>
                              )}
                              <a
                                href={att.url}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="opacity-0 group-hover:opacity-100 transition-opacity"
                              >
                                <ExternalLink className="w-3 h-3 text-muted-foreground hover:text-foreground" />
                              </a>
                              {isEditMode && (
                                <button
                                  type="button"
                                  onClick={() => handleDeleteAttachment(idx)}
                                  className="opacity-0 group-hover:opacity-100 transition-opacity"
                                  data-testid={`button-delete-attachment-${idx}`}
                                >
                                  <Trash2 className="w-3 h-3 text-muted-foreground hover:text-destructive" />
                                </button>
                              )}
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>

                </div>

                {/* Schedule Impact card */}
                {isEditMode && variation?.daysChanged && variation.daysChanged !== 0 && (
                  <div className="rounded-lg border border-border bg-card overflow-hidden">
                    <div className="h-8 flex items-center px-3 gap-2 border-b border-border/50 bg-muted/40">
                      <div className="w-1.5 h-1.5 rounded-full bg-orange-400/70 flex-shrink-0" />
                      <span className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Schedule Impact</span>
                    </div>
                    <div className="p-4">
                      <div className="flex items-center gap-2">
                        <CalendarIcon className="w-3.5 h-3.5 text-muted-foreground" />
                        <span className="text-sm">
                          {variation.daysChanged > 0 ? "+" : ""}{variation.daysChanged} day{Math.abs(variation.daysChanged) !== 1 ? "s" : ""}
                        </span>
                      </div>
                    </div>
                  </div>
                )}

                {/* Deadline card */}
                {isEditMode && variation?.approvalDeadline && (
                  <div className="rounded-lg border border-border bg-card overflow-hidden">
                    <div className="h-8 flex items-center px-3 gap-2 border-b border-border/50 bg-muted/40">
                      <div className="w-1.5 h-1.5 rounded-full bg-rose-400/70 flex-shrink-0" />
                      <span className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Deadline</span>
                    </div>
                    <div className="p-4">
                      <div className="flex items-center gap-2">
                        <Clock className="w-3.5 h-3.5 text-muted-foreground" />
                        <span className="text-sm">{format(new Date(variation.approvalDeadline), "PPP")}</span>
                      </div>
                    </div>
                  </div>
                )}

              </form>
            </Form>
        </div>
      </div>

      {/* ── Import Bills Modal ── */}
      <Dialog open={billsModalOpen} onOpenChange={setBillsModalOpen}>
        <DialogContent className="max-w-3xl" data-testid="dialog-bills">
          <DialogHeader>
            <DialogTitle>Import Bills</DialogTitle>
            <DialogDescription>Select bills to include in this variation.</DialogDescription>
          </DialogHeader>
          <div className="relative">
            <Search className="absolute left-2.5 top-2.5 h-3.5 w-3.5 text-muted-foreground" />
            <Input
              placeholder="Search by bill number or supplier..."
              value={billsSearch}
              onChange={(e) => setBillsSearch(e.target.value)}
              className="pl-8 h-8 text-sm"
            />
          </div>
          <div className="rounded-md border overflow-hidden">
            <div className="max-h-[360px] overflow-y-auto">
              <Table>
                <TableHeader>
                  <TableRow className="h-6 bg-muted/30 hover:bg-muted/30">
                    <TableHead className="w-8 py-0 px-2" />
                    <TableHead className="text-[10px] uppercase tracking-wide text-muted-foreground/50 font-normal py-0 px-2">Bill No.</TableHead>
                    <TableHead className="text-[10px] uppercase tracking-wide text-muted-foreground/50 font-normal py-0 px-2">Supplier</TableHead>
                    <TableHead className="text-[10px] uppercase tracking-wide text-muted-foreground/50 font-normal py-0 px-2">Date</TableHead>
                    <TableHead className="text-right text-[10px] uppercase tracking-wide text-muted-foreground/50 font-normal py-0 px-2">Total</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredBills.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={5} className="text-center text-sm text-muted-foreground py-8">No bills found for this project.</TableCell>
                    </TableRow>
                  ) : filteredBills.map((b: any) => {
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
                        <TableCell className="text-sm font-medium py-1 px-2">{b.billNumber}</TableCell>
                        <TableCell className="text-sm text-muted-foreground py-1 px-2">{b.supplierName || "—"}</TableCell>
                        <TableCell className="text-sm text-muted-foreground py-1 px-2">{b.billDate ? format(new Date(b.billDate), "d MMM yyyy") : "—"}</TableCell>
                        <TableCell className="text-right text-sm font-medium py-1 px-2">{formatCurrency((b.total || 0) / 100)}</TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
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
            >
              Add {modalBillIds.length > 0 ? `${modalBillIds.length} ` : ""}to Variation
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Import Labour Modal ── */}
      <Dialog open={labourModalOpen} onOpenChange={setLabourModalOpen}>
        <DialogContent className="max-w-3xl" data-testid="dialog-labour">
          <DialogHeader>
            <DialogTitle>Import Labour</DialogTitle>
            <DialogDescription>Select approved timesheets to include in this variation.</DialogDescription>
          </DialogHeader>
          <div className="relative">
            <Search className="absolute left-2.5 top-2.5 h-3.5 w-3.5 text-muted-foreground" />
            <Input
              placeholder="Search by staff name or date..."
              value={labourSearch}
              onChange={(e) => setLabourSearch(e.target.value)}
              className="pl-8 h-8 text-sm"
            />
          </div>
          <div className="rounded-md border overflow-hidden">
            <div className="max-h-[360px] overflow-y-auto">
              <Table>
                <TableHeader>
                  <TableRow className="h-6 bg-muted/30 hover:bg-muted/30">
                    <TableHead className="w-8 py-0 px-2" />
                    <TableHead className="text-[10px] uppercase tracking-wide text-muted-foreground/50 font-normal py-0 px-2">Date</TableHead>
                    <TableHead className="text-[10px] uppercase tracking-wide text-muted-foreground/50 font-normal py-0 px-2">Staff</TableHead>
                    <TableHead className="text-[10px] uppercase tracking-wide text-muted-foreground/50 font-normal py-0 px-2">Status</TableHead>
                    <TableHead className="text-right text-[10px] uppercase tracking-wide text-muted-foreground/50 font-normal py-0 px-2">Hours</TableHead>
                    <TableHead className="text-right text-[10px] uppercase tracking-wide text-muted-foreground/50 font-normal py-0 px-2">Total</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredTimesheets.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={6} className="text-center text-sm text-muted-foreground py-8">No timesheets found for this project.</TableCell>
                    </TableRow>
                  ) : filteredTimesheets.filter((t: any) => t.status === "approved" || t.status === "submitted").map((t: any) => {
                    const isApproved = t.status === "approved";
                    const isChecked = modalTimesheetIds.includes(t.id);
                    return (
                      <TableRow
                        key={t.id}
                        className={cn("h-9", isApproved ? "hover-elevate cursor-pointer" : "opacity-40 cursor-not-allowed")}
                        onClick={() => {
                          if (!isApproved) return;
                          setModalTimesheetIds(prev => isChecked ? prev.filter(id => id !== t.id) : [...prev, t.id]);
                        }}
                      >
                        <TableCell className="w-8 py-1 px-2">
                          <div className={cn("w-4 h-4 rounded border flex items-center justify-center", isChecked && isApproved ? "bg-primary border-primary" : "border-input")}>
                            {isChecked && isApproved && <Check className="h-3 w-3 text-primary-foreground" />}
                          </div>
                        </TableCell>
                        <TableCell className="text-sm tabular-nums py-1 px-2">{t.date ? format(new Date(t.date), "d MMM yy") : "—"}</TableCell>
                        <TableCell className="text-sm font-medium py-1 px-2">{getUserName(t.userId)}</TableCell>
                        <TableCell className="py-1 px-2">
                          {isApproved
                            ? <span className="flex items-center gap-1 text-xs"><div className="w-1.5 h-1.5 rounded-full bg-emerald-400 flex-shrink-0" />Approved</span>
                            : <span className="flex items-center gap-1 text-xs"><div className="w-1.5 h-1.5 rounded-full bg-amber-400 flex-shrink-0" />Pending</span>}
                        </TableCell>
                        <TableCell className="text-right text-sm tabular-nums py-1 px-2">{Number(t.duration).toFixed(1)}</TableCell>
                        <TableCell className="text-right text-sm font-medium py-1 px-2">{formatCurrency((t.total || 0) / 100)}</TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
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
              Add {modalTimesheetIds.length > 0 ? `${modalTimesheetIds.length} ` : ""}to Variation
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Import Allowances Modal ── */}
      <Dialog open={allowancesModalOpen} onOpenChange={setAllowancesModalOpen}>
        <DialogContent className="max-w-2xl" data-testid="dialog-allowances">
          <DialogHeader>
            <DialogTitle>Import Project Allowances</DialogTitle>
            <DialogDescription>
              Select a finalized allowance (PC/PS item) to include the cost difference in this variation.
            </DialogDescription>
          </DialogHeader>
          <div className="relative">
            <Search className="absolute left-2.5 top-2.5 h-3.5 w-3.5 text-muted-foreground" />
            <Input
              placeholder="Search allowances..."
              value={allowancesSearch}
              onChange={(e) => setAllowancesSearch(e.target.value)}
              className="pl-8 h-8 text-sm"
            />
          </div>
          <div className="space-y-2 max-h-96 overflow-y-auto">
            {projectAllowances.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-8">
                No allowance items (PC/PS) found for this project.
              </p>
            ) : (
              projectAllowances
                .filter((a: any) => {
                  const name = a.item?.name || "";
                  const desc = a.item?.description || "";
                  const q = allowancesSearch.toLowerCase();
                  return !q || name.toLowerCase().includes(q) || desc.toLowerCase().includes(q);
                })
                .map((a: any) => {
                  const item = a.item;
                  const isFinalized = item?.allowanceStatus === "finalized";
                  const budgeted = (item?.priceIncTax || 0) * (item?.quantity || 1);
                  const actual = (a.actualCost || 0) / 100;
                  const variance = actual - budgeted;
                  return (
                    <div
                      key={item.id}
                      className={cn(
                        "flex items-center gap-3 p-3 rounded-md border",
                        isFinalized ? "hover-elevate cursor-pointer" : "opacity-40 cursor-not-allowed"
                      )}
                      onClick={() => {
                        if (!isFinalized) return;
                        addAllowanceLine({
                          description: `${item.name} — allowance adjustment`,
                          amount: variance,
                        });
                        setAllowancesModalOpen(false);
                        setAllowancesSearch("");
                      }}
                      data-testid={`allowance-option-${item.id}`}
                    >
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="text-sm font-medium truncate">{item.name}</span>
                          <Badge variant="outline" className="text-[10px] flex-shrink-0">{item.allowance}</Badge>
                        </div>
                        {item.description && (
                          <p className="text-xs text-muted-foreground truncate mt-0.5">{item.description}</p>
                        )}
                      </div>
                      <div className="flex items-center gap-4 flex-shrink-0 text-right">
                        <div>
                          <p className="text-xs text-muted-foreground">Budgeted</p>
                          <p className="text-sm font-medium tabular-nums">{formatCurrency(budgeted)}</p>
                        </div>
                        <div>
                          <p className="text-xs text-muted-foreground">Actual</p>
                          <p className="text-sm font-medium tabular-nums">{formatCurrency(actual)}</p>
                        </div>
                        <div>
                          <p className="text-xs text-muted-foreground">Variance</p>
                          <p className={cn("text-sm font-semibold tabular-nums", variance < 0 ? "text-red-500" : variance > 0 ? "text-green-600" : "")}>
                            {variance >= 0 ? "+" : ""}{formatCurrency(variance)}
                          </p>
                        </div>
                        <Badge variant={isFinalized ? "default" : "secondary"} className="text-xs capitalize">
                          {item.allowanceStatus || "pending"}
                        </Badge>
                      </div>
                    </div>
                  );
                })
            )}
          </div>
        </DialogContent>
      </Dialog>

      {/* ── Approve Dialog ── */}
      <Dialog open={approveDialogOpen} onOpenChange={setApproveDialogOpen}>
        <DialogContent data-testid="dialog-approve-variation">
          <DialogHeader>
            <DialogTitle>Approve Variation</DialogTitle>
            <DialogDescription>Are you sure you want to approve this variation?</DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setApproveDialogOpen(false)} data-testid="button-cancel-approve">Cancel</Button>
            <Button type="button" variant="default" onClick={() => approveMutation.mutate()} disabled={approveMutation.isPending} data-testid="button-confirm-approve">
              {approveMutation.isPending ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" />Approving...</> : <><Check className="mr-2 h-4 w-4" />Approve Variation</>}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Reject Dialog ── */}
      <Dialog open={rejectDialogOpen} onOpenChange={setRejectDialogOpen}>
        <DialogContent data-testid="dialog-reject-variation">
          <DialogHeader>
            <DialogTitle>Reject Variation</DialogTitle>
            <DialogDescription>Please provide a reason for rejecting this variation.</DialogDescription>
          </DialogHeader>
          <Textarea
            value={rejectReason}
            onChange={(e) => setRejectReason(e.target.value)}
            placeholder="Enter rejection reason..."
            rows={4}
            data-testid="textarea-reject-reason"
          />
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => { setRejectDialogOpen(false); setRejectReason(""); }} data-testid="button-cancel-reject">Cancel</Button>
            <Button type="button" variant="destructive" onClick={() => rejectMutation.mutate(rejectReason)} disabled={!rejectReason.trim() || rejectMutation.isPending} data-testid="button-confirm-reject">
              {rejectMutation.isPending ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" />Rejecting...</> : <><X className="mr-2 h-4 w-4" />Reject Variation</>}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Preview Modal ── */}
      <Dialog open={previewOpen} onOpenChange={setPreviewOpen}>
        <DialogContent className="max-w-4xl w-full max-h-[90vh] overflow-y-auto p-0" data-testid="dialog-variation-preview">
          <DialogHeader className="px-6 pt-5 pb-0">
            <DialogTitle>Variation Preview</DialogTitle>
          </DialogHeader>
          <div className="px-6 pb-6">
            <VariationPreviewContent
              variation={variation as any}
              items={existingCostLines}
              bills={existingVariationBills}
              company={companyInfo}
              project={projects.find((p) => p.id === form.watch("projectId")) as any}
              brandColor={companySettings?.brandColor || "#6d28d9"}
              mode="preview"
            />
          </div>
        </DialogContent>
      </Dialog>

      {/* ── Send to Client Modal ── */}
      <Dialog open={sendModalOpen} onOpenChange={setSendModalOpen}>
        <DialogContent className="max-w-lg" data-testid="dialog-send-variation">
          <DialogHeader>
            <DialogTitle>Send Variation to Client</DialogTitle>
            <DialogDescription>Email the client a link to view and approve this variation online.</DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div>
              <label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">To</label>
              <Input
                value={sendTo}
                onChange={(e) => setSendTo(e.target.value)}
                placeholder="client@example.com"
                className="mt-1"
                data-testid="input-send-to"
              />
            </div>
            <div>
              <label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Subject</label>
              <Input
                value={sendSubject}
                onChange={(e) => setSendSubject(e.target.value)}
                className="mt-1"
                data-testid="input-send-subject"
              />
            </div>
            <div>
              <label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Message</label>
              <Textarea
                value={sendBody}
                onChange={(e) => setSendBody(e.target.value)}
                rows={6}
                className="mt-1"
                data-testid="textarea-send-body"
              />
            </div>
            <div className="flex items-center gap-2">
              <input
                id="attach-pdf"
                type="checkbox"
                checked={sendAttachPdf}
                onChange={(e) => setSendAttachPdf(e.target.checked)}
                className="h-3.5 w-3.5"
              />
              <label htmlFor="attach-pdf" className="text-sm text-muted-foreground">Attach PDF copy</label>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setSendModalOpen(false)} data-testid="button-cancel-send">Cancel</Button>
            <Button
              onClick={() => sendEmailMutation.mutate()}
              disabled={!sendTo.trim() || sendEmailMutation.isPending}
              data-testid="button-confirm-send"
            >
              {sendEmailMutation.isPending ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" />Sending...</> : <><Mail className="mr-2 h-4 w-4" />Send</>}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

    </div>
  );
}
