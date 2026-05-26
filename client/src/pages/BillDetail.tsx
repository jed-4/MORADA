import { useEffect, useState, useRef, lazy, Suspense } from "react";
import { useParams, useLocation } from "wouter";
import { XeroContactLinkModal } from "@/components/invoices/XeroContactLinkModal";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { format, addDays, endOfMonth, addMonths } from "date-fns";
import { 
  ArrowLeft, 
  Copy, 
  Plus, 
  Trash2, 
  Paperclip,
  MessageSquare,
  Check,
  X,
  Upload,
  FileText,
  Loader2,
  ChevronDown,
  Settings2,
  Maximize2,
  RefreshCw,
  ChevronsUpDown,
  Send,
  Settings,
  Link2,
  ClipboardList,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { LineItemTable, type LineItemColumn } from "@/components/LineItemTable";
import { Card } from "@/components/ui/card";
import { ToastAction } from "@/components/ui/toast";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
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
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import { matchSupplier, type SupplierMatch } from "@shared/supplierMatcher";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import { useToast } from "@/hooks/use-toast";
import { useUpload } from "@/hooks/use-upload";
import { Badge } from "@/components/ui/badge";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { CostCodeSelect } from "@/components/CostCodeSelect";
import type { Bill, Supplier, Project, CostCode, BillLineItem, BillApproval, BillLineItemAllowance, EstimateItem, PurchaseOrder } from "@shared/schema";

const DocumentPreview = lazy(() => import("@/components/DocumentPreview"));

const billFormSchema = z.object({
  billNumber: z.string().min(1, "Bill number is required"),
  projectId: z.string().min(1, "Project is required"),
  supplierId: z.string().min(1, "Supplier is required"),
  billType: z.enum(["bill", "credit"]).default("bill"),
  status: z.enum(["draft", "needs_review", "awaiting_approval", "awaiting_payment", "paid"]).default("draft"),
  billDate: z.string().min(1, "Bill date is required"),
  dueDate: z.string().optional(),
  billReference: z.string().optional(),
  notes: z.string().optional(),
  reminders: z.string().optional(),
  paidAmount: z.number().default(0),
  sendToXero: z.boolean().default(false),
});

type BillFormData = z.infer<typeof billFormSchema>;

const addSupplierSchema = z.object({
  name: z.string().min(1, "Name is required"),
  email: z.string().email().optional().or(z.literal("")),
  phone: z.string().optional(),
  supplierType: z.enum(["trade", "supplier", "subcontractor"]).default("supplier"),
});

type AddSupplierFormData = z.infer<typeof addSupplierSchema>;

type LineItem = {
  id?: string;
  lineType: "estimate" | "item" | "custom";
  description: string;
  costCodeId?: string;
  quantity: number;
  unitPrice: number;
  unit: string;
  tax: "GST on expenses" | "No GST";
  account: string;
  total: number;
  order: number;
  appliesToAllowances: boolean;
  allowanceItemId?: string;
};

type XeroValidationIssue = {
  scope: "invoice" | "lineItem" | "contact" | "unknown";
  lineIndex?: number;
  message: string;
};

/** Error thrown by bill push handlers; may carry parsed Xero validation issues. */
type XeroPushError = Error & { validationErrors?: XeroValidationIssue[] };

function isXeroPushError(e: unknown): e is XeroPushError {
  return e instanceof Error;
}

/**
 * Build a human-readable description for a failed Xero push. When the server
 * returned a structured `validationErrors` list (XeroValidationException, or
 * pre-flight rejection), we join the messages so the user can see all issues
 * at once instead of a generic "Xero sync failed" toast.
 */
function formatXeroErrorDescription(e: unknown): string {
  const err = isXeroPushError(e) ? e : undefined;
  const issues = err?.validationErrors;
  if (Array.isArray(issues) && issues.length > 0) {
    return issues
      .slice(0, 3)
      .map((iss) => {
        // Prepend a "Line N:" prefix when the issue is scoped to a line item
        // and the message doesn't already begin with one. This guarantees
        // line-numbered guidance regardless of whether the message string
        // happens to include the index itself.
        const prefix =
          iss.scope === "lineItem" && typeof iss.lineIndex === "number" && !/^line\s*\d+/i.test(iss.message)
            ? `Line ${iss.lineIndex + 1}: `
            : "";
        return prefix + iss.message;
      })
      .join(" • ") + (issues.length > 3 ? ` • (+${issues.length - 3} more)` : "");
  }
  return e?.message || "Could not push to Xero. Check your Xero connection in Settings.";
}

export default function BillDetail() {
  const { id, projectId } = useParams<{ id: string; projectId?: string }>();
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const isEditMode = !!(id && id !== "new");

  const [lineItems, setLineItems] = useState<LineItem[]>([]);
  const [taxMode, setTaxMode] = useState<"inclusive" | "exclusive">("exclusive");
  const [rejectDialogOpen, setRejectDialogOpen] = useState(false);
  const [rejectComments, setRejectComments] = useState("");
  const [uploadedFile, setUploadedFile] = useState<File | null>(null);
  const [ocrResults, setOcrResults] = useState<any>(null);
  const [ocrPreviewOpen, setOcrPreviewOpen] = useState(false);
  const [addSupplierDialogOpen, setAddSupplierDialogOpen] = useState(false);
  const [attachmentUrls, setAttachmentUrls] = useState<string[]>([]);
  const [attachmentMeta, setAttachmentMeta] = useState<Record<string, { filename: string; mimeType?: string }>>({});
  const [sheetPreviewUrl, setSheetPreviewUrl] = useState<string | null>(null);
  const [sheetPreviewFilename, setSheetPreviewFilename] = useState<string>("");
  const [duplicateWarning, setDuplicateWarning] = useState<{ existingBillNumber: string; reference: string } | null>(null);
  const pendingSubmitDataRef = useRef<BillFormData | null>(null);
  const [unmatchedSupplierDialogOpen, setUnmatchedSupplierDialogOpen] = useState(false);
  const [ocrSupplierData, setOcrSupplierData] = useState<{ name: string; email?: string; phone?: string } | null>(null);
  const [unmatchedSupplierSelection, setUnmatchedSupplierSelection] = useState<string>("");
  const [supplierPickerOpen, setSupplierPickerOpen] = useState(false);
  const [supplierSearchText, setSupplierSearchText] = useState("");
  const [unmatchedPickerOpen, setUnmatchedPickerOpen] = useState(false);
  const [unmatchedSearchText, setUnmatchedSearchText] = useState("");
  const [ocrSupplierSuggestion, setOcrSupplierSuggestion] = useState<
    | { id: string; name: string; confidence: number }
    | null
  >(null);
  const [accountPickerOpenIndex, setAccountPickerOpenIndex] = useState<number | null>(null);
  const [accountPickerSearch, setAccountPickerSearch] = useState("");
  const [ocrFilePreviewUrl, setOcrFilePreviewUrl] = useState<string | null>(null);
  const [ocrFileIsImage, setOcrFileIsImage] = useState(false);
  const [previewAttachment, setPreviewAttachment] = useState<string | null>(null);
  const [fullscreenPreview, setFullscreenPreview] = useState(false);
  const dueDateManuallySet = useRef(false);
  // Tracks which bill ID we have already auto-triggered OCR for, so we only
  // fire once per bill even if the component re-renders.
  const autoOcrTriggeredForRef = useRef<string | null>(null);
  const [visibleAmountCols, setVisibleAmountCols] = useState<{ exTax: boolean; tax: boolean; incTax: boolean }>({ exTax: false, tax: false, incTax: false });
  const [colMenuOpen, setColMenuOpen] = useState(false);
  const [unmappedContactDialogOpen, setUnmappedContactDialogOpen] = useState(false);
  const [unmappedSupplierName, setUnmappedSupplierName] = useState("");
  const [unmappedSupplierId, setUnmappedSupplierId] = useState<string | null>(null);
  const [pendingXeroBillId, setPendingXeroBillId] = useState<string | null>(null);
  const [selectedLineIndices, setSelectedLineIndices] = useState<Set<number>>(new Set());
  const [bulkCostCodeOpen, setBulkCostCodeOpen] = useState(false);
  const [bulkCostCodeValue, setBulkCostCodeValue] = useState<string>("");
  const [supplierDefaultsOpen, setSupplierDefaultsOpen] = useState(false);
  const [supplierDefaultsCostCode, setSupplierDefaultsCostCode] = useState<string>("");
  const [supplierDefaultsAccount, setSupplierDefaultsAccount] = useState<string>("");
  const [defaultsAccountPickerOpen, setDefaultsAccountPickerOpen] = useState(false);
  const [defaultsAccountSearch, setDefaultsAccountSearch] = useState("");
  const [defaultsPromptDismissed, setDefaultsPromptDismissed] = useState(false);
  const [showUpdateDefaultsPrompt, setShowUpdateDefaultsPrompt] = useState(false);

  const { data: bill, isLoading: billLoading } = useQuery<Bill>({
    queryKey: ["/api/bills", id],
    enabled: isEditMode,
  });

  const { data: existingLineItemsData, isLoading: existingLineItemsLoading } = useQuery<BillLineItem[]>({
    queryKey: ["/api/bills", id, "line-items"],
    enabled: isEditMode,
  });
  const existingLineItems = existingLineItemsData ?? [];

  const { data: projects = [] } = useQuery<Project[]>({
    queryKey: ["/api/projects"],
  });

  const { data: businessProject } = useQuery<Project>({
    queryKey: ["/api/projects/business"],
  });

  const { data: suppliers = [] } = useQuery<any[]>({
    queryKey: ["/api/contacts", { contactTypes: "supplier,trade" }],
    queryFn: async () => {
      const [suppliersRes, tradesRes] = await Promise.all([
        fetch("/api/contacts?contactType=supplier", { credentials: "include" }),
        fetch("/api/contacts?contactType=trade", { credentials: "include" }),
      ]);
      if (!suppliersRes.ok || !tradesRes.ok) throw new Error("Failed to fetch contacts");
      const [supplierList, tradeList] = await Promise.all([suppliersRes.json(), tradesRes.json()]);
      const combined = [...supplierList, ...tradeList];
      // Deduplicate by ID first, then by normalised name — contacts can exist as
      // both "supplier" and "trade" type records, prefer the supplier record.
      const byId = Array.from(new Map(combined.map((c: any) => [c.id, c])).values());
      const byName = new Map<string, any>();
      for (const c of byId) {
        const key = (c.name ?? "").trim().toLowerCase();
        const existing = byName.get(key);
        if (!existing || existing.contactType !== "supplier") {
          byName.set(key, c);
        }
      }
      const deduped = Array.from(byName.values());
      return deduped.sort((a: any, b: any) => a.name.localeCompare(b.name));
    },
  });

  const { data: costCodes = [] } = useQuery<CostCode[]>({
    queryKey: ["/api/cost-codes"],
  });

  const { data: xeroAccounts = [] } = useQuery<Array<{ code: string; name: string; type: string; accountId: string }>>({
    queryKey: ["/api/xero/accounts"],
  });

  const { data: xeroStatus } = useQuery<{ connected: boolean }>({
    queryKey: ["/api/xero/status"],
  });

  const { data: approvals = [] } = useQuery<BillApproval[]>({
    queryKey: ["/api/bills", id, "approvals"],
    enabled: isEditMode,
  });

  const { data: canApprove = false } = useQuery<boolean>({
    queryKey: ["/api/user/can-approve-bills"],
    enabled: isEditMode,
  });

  const { data: nextBillNumberData } = useQuery<{ billNumber: string }>({
    queryKey: ["/api/bills/next-number"],
    enabled: !isEditMode,
  });

  const form = useForm<BillFormData>({
    resolver: zodResolver(billFormSchema),
    defaultValues: {
      billNumber: "",
      projectId: "",
      supplierId: "",
      billType: "bill",
      status: "draft",
      billDate: format(new Date(), "yyyy-MM-dd"),
      dueDate: "",
      billReference: "",
      notes: "",
      reminders: "",
      paidAmount: 0,
      sendToXero: false,
    },
  });

  const supplierForm = useForm<AddSupplierFormData>({
    resolver: zodResolver(addSupplierSchema),
    defaultValues: {
      name: "",
      email: "",
      phone: "",
      supplierType: "supplier",
    },
  });

  // Prefill the supplier dialog with OCR-extracted data when opened from
  // either the unmatched-supplier flow or the supplier-picker create button.
  useEffect(() => {
    if (addSupplierDialogOpen) {
      if (ocrSupplierData) {
        supplierForm.reset({
          name: ocrSupplierData.name || "",
          email: ocrSupplierData.email || "",
          phone: ocrSupplierData.phone || "",
          supplierType: "supplier",
        });
      }
    }
  }, [addSupplierDialogOpen, ocrSupplierData, supplierForm]);

  const currentProjectId = form.watch("projectId") || bill?.projectId;

  const { data: allowances = [], isLoading: allowancesLoading } = useQuery<any[]>({
    queryKey: ["/api/projects", currentProjectId, "allowances"],
    queryFn: async () => {
      if (!currentProjectId) return [];
      const response = await fetch(`/api/projects/${currentProjectId}/allowances`);
      if (!response.ok) throw new Error("Failed to fetch allowances");
      const data = await response.json();
      return data
        .filter((item: any) => item.item.allowance === "Prime Cost" || item.item.allowance === "Provisional Sum")
        .map((item: any) => ({ ...item.item, itemType: item.item.allowance }));
    },
    enabled: !!currentProjectId,
  });

  const { data: existingAllowancesData, isLoading: existingAllowancesLoading } = useQuery<any[]>({
    queryKey: ["/api/bills", id, "line-item-allowances"],
    enabled: isEditMode,
  });
  const existingAllowances = existingAllowancesData ?? [];

  useEffect(() => {
    if (bill && isEditMode) {
      form.reset({
        billNumber: bill.billNumber,
        projectId: bill.projectId,
        // Bills imported from Xero (or created before a supplier link) may
        // have a null supplierId. The form schema requires a non-empty
        // string; coerce to "" so the page still renders (unsaved bills
        // already use "" as their default).
        supplierId: bill.supplierId || "",
        billType: bill.billType as "bill" | "credit",
        status: bill.status as "draft" | "needs_review" | "awaiting_approval" | "awaiting_payment" | "paid",
        billDate: bill.billDate ? format(new Date(bill.billDate), "yyyy-MM-dd") : "",
        dueDate: bill.dueDate ? format(new Date(bill.dueDate), "yyyy-MM-dd") : "",
        billReference: bill.billReference || "",
        notes: bill.notes || "",
        reminders: bill.reminders || "",
        paidAmount: (bill.paidAmount || 0) / 100,
        sendToXero: !!bill.sendToXero,
      });
      // Hydrate the persisted tax mode so reopening a bill calculates totals
      // the same way the user originally entered them.
      const persistedTaxMode = (bill as any).taxMode;
      if (persistedTaxMode === "inclusive" || persistedTaxMode === "exclusive") {
        setTaxMode(persistedTaxMode);
      }
      // attachmentUrls may now contain either legacy string entries or rich
      // attachment record objects ({objectPath, filename, mimeType, ...}).
      // Normalize down to a string[] of object paths for the existing UI;
      // richer metadata is rendered as a follow-up.
      type AttachmentEntry = string | { objectPath?: string; filename?: string; mimeType?: string };
      const raw: AttachmentEntry[] = Array.isArray(bill.attachmentUrls) ? (bill.attachmentUrls as AttachmentEntry[]) : [];
      const paths = raw
        .map((a) => (typeof a === "string" ? a : a?.objectPath))
        .filter((p): p is string => typeof p === "string" && p.length > 0);
      setAttachmentUrls(paths);
      const meta: Record<string, { filename: string; mimeType?: string }> = {};
      raw.forEach((a) => {
        if (typeof a === "object" && a?.objectPath) {
          meta[a.objectPath] = { filename: a.filename || "", mimeType: a.mimeType };
        }
      });
      setAttachmentMeta(meta);
    }
  }, [bill, isEditMode]);

  // Force-reapply projectId once the projects list loads — the Radix Select only picks up its
  // selected state at render time, so if options arrive after form.reset the select shows blank.
  useEffect(() => {
    if (bill && isEditMode && projects.length > 0 && bill.projectId) {
      form.setValue("projectId", bill.projectId, { shouldValidate: false });
    }
  }, [projects.length, bill?.id, isEditMode]);

  // Force-reapply supplierId once the suppliers list loads — same reason as above
  useEffect(() => {
    if (bill && isEditMode && suppliers.length > 0 && bill.supplierId) {
      form.setValue("supplierId", bill.supplierId, { shouldValidate: false });
    }
  }, [suppliers.length, bill?.id, isEditMode]);

  useEffect(() => {
    if (existingLineItemsLoading || existingAllowancesLoading) return;
    if (existingLineItems.length > 0 && isEditMode) {
      setLineItems(
        existingLineItems.map((item) => {
          const allowance = existingAllowances.find(a => a.billLineItemId === item.id);
          return {
            id: item.id,
            lineType: item.lineType as "estimate" | "item" | "custom",
            description: item.description,
            costCodeId: item.costCodeId || undefined,
            quantity: item.quantity,
            unitPrice: item.unitPrice / 100,
            unit: "",
            tax: item.tax as "GST on expenses" | "No GST",
            account: item.account || "",
            total: item.total / 100,
            order: item.order,
            appliesToAllowances: !!allowance,
            allowanceItemId: allowance?.estimateItemId,
          };
        })
      );
    }
  }, [existingLineItemsLoading, existingAllowancesLoading, existingLineItems, existingAllowances, isEditMode]);

  useEffect(() => {
    if (!isEditMode && projects.length > 0) {
      const projectIdToUse = projectId || projects[0]?.id;
      if (projectIdToUse) {
        form.setValue("projectId", projectIdToUse);
      }
    }
  }, [projects.length, isEditMode, projectId]);

  useEffect(() => {
    if (!isEditMode && nextBillNumberData?.billNumber) {
      form.setValue("billNumber", nextBillNumberData.billNumber);
    }
  }, [nextBillNumberData, isEditMode]);

  useEffect(() => {
    if (!colMenuOpen) return;
    const handler = (e: MouseEvent) => {
      const target = e.target as HTMLElement;
      if (!target.closest("[data-testid='button-column-visibility']") && !target.closest("[data-col-menu]")) {
        setColMenuOpen(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [colMenuOpen]);

  const watchedSupplierId = form.watch("supplierId");
  const watchedBillDate = form.watch("billDate");

  // Manage object URL for OCR file preview (image/PDF)
  useEffect(() => {
    if (!uploadedFile) {
      setOcrFilePreviewUrl(null);
      setOcrFileIsImage(false);
      return;
    }
    const url = URL.createObjectURL(uploadedFile);
    setOcrFilePreviewUrl(url);
    setOcrFileIsImage(uploadedFile.type.startsWith("image/"));
    return () => {
      URL.revokeObjectURL(url);
    };
  }, [uploadedFile]);

  const { data: companySettings } = useQuery<any>({
    queryKey: ["/api/company-settings"],
  });

  // For new (unsaved) bills we collect rich attachment metadata locally so the
  // create payload can persist objects (objectPath/filename/mimeType/size/source)
  // instead of bare strings. Existing bills go through the dedicated endpoint.
  type LocalAttachment = { objectPath: string; filename?: string; mimeType?: string; size?: number; source?: "manual" | "ai_reader" };
  const [pendingAttachments, setPendingAttachments] = useState<LocalAttachment[]>([]);

  const { uploadFile, isUploading: isUploadingAttachment } = useUpload({
    onSuccess: (response) => {
      setAttachmentUrls(prev => [...prev, response.objectPath]);
    },
  });

  // Helper: record a rich attachment for unsaved bills so the create payload
  // can persist the new object shape (objectPath/filename/mimeType/size/source).
  const recordPendingAttachment = (objectPath: string, file: File, source: "manual" | "ai_reader") => {
    if (isEditMode) return;
    setPendingAttachments(prev => [...prev, {
      objectPath,
      filename: file.name,
      mimeType: file.type,
      size: file.size,
      source,
    }]);
  };

  useEffect(() => {
    if (!watchedSupplierId || !watchedBillDate) return;
    if (isEditMode || dueDateManuallySet.current) return;
    
    const supplier = suppliers.find(s => s.id === watchedSupplierId);
    const terms = supplier?.paymentTerms || companySettings?.defaultPaymentTerms || "net_30";
    const billDate = new Date(watchedBillDate);
    
    if (isNaN(billDate.getTime())) return;
    
    let dueDate: Date;
    const termsLower = terms.toLowerCase().replace(/\s+/g, "_");
    
    if (termsLower === "on_receipt" || termsLower === "cod") {
      dueDate = billDate;
    } else if (termsLower === "net_7" || termsLower === "net 7") {
      dueDate = addDays(billDate, 7);
    } else if (termsLower === "net_14" || termsLower === "net 14") {
      dueDate = addDays(billDate, 14);
    } else if (termsLower === "net_30" || termsLower === "net 30") {
      dueDate = addDays(billDate, 30);
    } else if (termsLower === "eom") {
      dueDate = endOfMonth(billDate);
    } else if (termsLower === "end_of_next_month") {
      dueDate = endOfMonth(addMonths(billDate, 1));
    } else {
      dueDate = addDays(billDate, 30);
    }
    
    form.setValue("dueDate", format(dueDate, "yyyy-MM-dd"));
  }, [watchedSupplierId, watchedBillDate, suppliers, companySettings, isEditMode]);

  useEffect(() => {
    if (!watchedSupplierId || isEditMode) return;
    const supplier = suppliers.find(s => s.id === watchedSupplierId);
    const defaultAccount = supplier?.xeroDefaultAccountCode || supplier?.xeroDefaultAccount || "";
    const defaultCostCode = supplier?.defaultCostCodeId || "";
    if (defaultAccount || defaultCostCode) {
      setLineItems(prev => prev.map(item => ({
        ...item,
        account: !item.account && defaultAccount ? defaultAccount : item.account,
        costCodeId: !item.costCodeId && defaultCostCode ? defaultCostCode : item.costCodeId,
      })));
    }
  }, [watchedSupplierId, suppliers, isEditMode]);

  // Reset per-bill dismissals whenever the supplier changes.
  useEffect(() => {
    setDefaultsPromptDismissed(false);
    setShowUpdateDefaultsPrompt(false);
  }, [watchedSupplierId]);

  // Auto-apply supplier defaults to empty line items when opening an existing bill (edit mode).
  // New bills are handled by the effect above (line ~576).
  useEffect(() => {
    if (!isEditMode) return;
    if (!currentSupplier) return;
    const defaultCostCode = currentSupplier.defaultCostCodeId || "";
    const defaultAccount = currentSupplier.xeroDefaultAccountCode || (currentSupplier as any).xeroDefaultAccount || "";
    if (!defaultCostCode && !defaultAccount) return;
    setLineItems(prev => {
      const updated = prev.map(item => ({
        ...item,
        costCodeId: item.costCodeId || defaultCostCode || item.costCodeId,
        account: item.account || defaultAccount || item.account,
      }));
      const changed = updated.some((item, i) =>
        item.costCodeId !== prev[i].costCodeId || item.account !== prev[i].account
      );
      return changed ? updated : prev;
    });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentSupplier?.id, isEditMode]);

  const getSupplierDefaultAccount = () => {
    const supplierId = form.getValues("supplierId");
    if (!supplierId) return "";
    const supplier = suppliers.find(s => s.id === supplierId);
    return supplier?.xeroDefaultAccountCode || supplier?.xeroDefaultAccount || "";
  };

  const getSupplierDefaultCostCode = () => {
    const supplierId = form.getValues("supplierId");
    if (!supplierId) return "";
    const supplier = suppliers.find(s => s.id === supplierId);
    return supplier?.defaultCostCodeId || "";
  };

  const updateSupplierDefaultsMutation = useMutation({
    mutationFn: async (payload: {
      supplierId: string;
      defaultCostCodeId?: string | null;
      xeroDefaultAccountCode?: string | null;
      suppressDefaultsPrompt?: boolean;
    }) => {
      const { supplierId, ...patch } = payload;
      return await apiRequest(`/api/contacts/${supplierId}`, "PATCH", patch);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/contacts", { contactTypes: "supplier,trade" }] });
      queryClient.invalidateQueries({ queryKey: ["/api/contacts"] });
    },
    onError: (err: Error) => {
      toast({ title: "Failed to save supplier defaults", description: err.message, variant: "destructive" });
    },
  });

  const currentSupplier = suppliers.find(s => s.id === watchedSupplierId);
  const supplierDefaultCostCode = currentSupplier?.defaultCostCodeId || "";
  const supplierDefaultAccountCode = currentSupplier?.xeroDefaultAccountCode || currentSupplier?.xeroDefaultAccount || "";

  // Compute the "save as defaults" suggestion: most-used non-empty value
  // across the current line items, ignoring values that already match the
  // supplier's saved default.
  const mostUsed = (vals: string[]): string => {
    const counts: Record<string, number> = {};
    for (const v of vals) {
      if (!v) continue;
      counts[v] = (counts[v] || 0) + 1;
    }
    let best = ""; let bestN = 0;
    for (const [k, n] of Object.entries(counts)) {
      if (n > bestN) { best = k; bestN = n; }
    }
    return best;
  };
  const mostUsedCostCode = mostUsed(lineItems.map(li => li.costCodeId || ""));
  const mostUsedAccount = mostUsed(lineItems.map(li => li.account || ""));
  // Suggest whenever the bill has a value that differs from (or fills in) the stored default.
  const suggestedCostCode = (mostUsedCostCode && mostUsedCostCode !== supplierDefaultCostCode) ? mostUsedCostCode : "";
  const suggestedAccount = (mostUsedAccount && mostUsedAccount !== supplierDefaultAccountCode) ? mostUsedAccount : "";
  const showDefaultsPrompt = !!currentSupplier
    && !defaultsPromptDismissed
    && !currentSupplier.suppressDefaultsPrompt
    && (!!suggestedCostCode || !!suggestedAccount);

  const addLineItem = () => {
    setLineItems([
      ...lineItems,
      {
        lineType: "custom",
        description: "",
        quantity: 1,
        unitPrice: 0,
        unit: "",
        tax: "GST on expenses",
        account: getSupplierDefaultAccount(),
        costCodeId: getSupplierDefaultCostCode() || undefined,
        total: 0,
        order: lineItems.length,
        appliesToAllowances: false,
        allowanceItemId: undefined,
      },
    ]);
  };

  const updateLineItem = (index: number, field: keyof LineItem, value: any) => {
    const updated = [...lineItems];
    updated[index] = { ...updated[index], [field]: value };
    
    if (field === "quantity" || field === "unitPrice") {
      const qty = field === "quantity" ? value : updated[index].quantity;
      const price = field === "unitPrice" ? value : updated[index].unitPrice;
      updated[index].total = qty * price;
    }
    
    setLineItems(updated);
  };

  const deleteLineItem = (index: number) => {
    setLineItems(lineItems.filter((_, i) => i !== index));
  };

  const calculateSubtotal = () => {
    if (taxMode === "inclusive") {
      return lineItems.reduce((sum, item) => {
        if (item.tax === "GST on expenses") {
          return sum + (item.total - item.total / 11);
        }
        return sum + item.total;
      }, 0);
    }
    return lineItems.reduce((sum, item) => sum + item.total, 0);
  };

  const calculateTax = () => {
    const taxableItems = lineItems.filter((item) => item.tax === "GST on expenses");
    
    const gstRate = Number(companySettings?.taxRate ?? 10) / 100;
    if (taxMode === "inclusive") {
      const taxableTotal = taxableItems.reduce((sum, item) => sum + item.total, 0);
      return taxableTotal * gstRate / (1 + gstRate);
    }
    
    const taxableAmount = taxableItems.reduce((sum, item) => sum + item.total, 0);
    return taxableAmount * gstRate;
  };

  const calculateTotal = () => {
    const subtotal = calculateSubtotal();
    const tax = calculateTax();
    return subtotal + tax;
  };

  const calculateDue = () => {
    const total = calculateTotal();
    const paid = form.watch("paidAmount") || 0;
    return total - paid;
  };

  const formatCurrency = (amount: number) => {
    const isWholeNumber = amount % 1 === 0;
    
    return new Intl.NumberFormat("en-AU", {
      style: "currency",
      currency: "AUD",
      minimumFractionDigits: isWholeNumber ? 0 : 2,
      maximumFractionDigits: 2
    }).format(amount);
  };

  const getLineExTax = (item: LineItem) => {
    const gstRate = Number(companySettings?.taxRate ?? 10) / 100;
    if (taxMode === "inclusive" && item.tax === "GST on expenses") {
      return item.total / (1 + gstRate);
    }
    return item.total;
  };

  const getLineTax = (item: LineItem) => {
    const gstRate = Number(companySettings?.taxRate ?? 10) / 100;
    if (item.tax !== "GST on expenses") return 0;
    if (taxMode === "inclusive") return item.total * gstRate / (1 + gstRate);
    return item.total * gstRate;
  };

  const getLineIncTax = (item: LineItem) => {
    return getLineExTax(item) + getLineTax(item);
  };

  // Column widths for the line-item grid. Resize handles were removed in #169
  // when this table was migrated to the shared LineItemTable primitive.
  const defaultColWidths: Record<string, number> = {
    description: 140,
    costCode: 130,
    qty: 65,
    unit: 60,
    tax: 110,
    account: 80,
    unitCost: 120,
    allowance: 140,
    exTax: 90,
    amtTax: 80,
    incTax: 90,
  };

  const getColWidth = (key: string) => defaultColWidths[key] || 100;

  const createMutation = useMutation({
    mutationFn: async (data: BillFormData) => {
      // Safety net: include any pending attachments (e.g. uploaded via OCR
      // during this session) that haven't yet propagated into attachmentUrls
      // state — guarantees the file persists with the new bill even if a
      // setState batch lagged behind the user clicking Save.
      const mergedPaths: string[] = [...attachmentUrls];
      for (const p of pendingAttachments) {
        if (p?.objectPath && !mergedPaths.includes(p.objectPath)) {
          mergedPaths.push(p.objectPath);
        }
      }
      const billData = {
        ...data,
        billDate: new Date(data.billDate),
        dueDate: data.dueDate ? new Date(data.dueDate) : undefined,
        subtotal: Math.round(calculateSubtotal() * 100),
        tax: Math.round(calculateTax() * 100),
        total: Math.round(calculateTotal() * 100),
        paidAmount: Math.round((data.paidAmount || 0) * 100),
        taxMode,
        // Persist rich attachment objects when we have them (for files uploaded
        // in this session); fall back to bare object-path strings otherwise.
        // Server schema accepts a union of either shape.
        attachmentUrls: mergedPaths.map((url) => {
          const rich = pendingAttachments.find((p) => p.objectPath === url);
          return rich
            ? { ...rich, uploadedAt: new Date().toISOString() }
            : url;
        }),
      };

      const newBill = await apiRequest("/api/bills", "POST", billData) as Bill;

      for (let i = 0; i < lineItems.length; i++) {
        const item = lineItems[i];
        const createdLineItem = await apiRequest(`/api/bills/${newBill.id}/line-items`, "POST", {
          billId: newBill.id,
          lineType: item.lineType,
          description: item.description,
          costCodeId: item.costCodeId,
          quantity: item.quantity,
          unitPrice: Math.round(item.unitPrice * 100),
          tax: item.tax,
          account: item.account,
          total: Math.round(item.total * 100),
          order: i,
        });

        if (item.appliesToAllowances && item.allowanceItemId) {
          await apiRequest("/api/bill-line-item-allowances", "POST", {
            billLineItemId: createdLineItem.id,
            estimateItemId: item.allowanceItemId,
            amount: Math.round(item.total * 100),
          });
        }
      }

      return newBill;
    },
    onSuccess: async (newBill) => {
      queryClient.invalidateQueries({ queryKey: ["/api/bills"] });
      queryClient.invalidateQueries({ queryKey: ["/api/projects", form.getValues("projectId"), "allowances"] });

      if (form.getValues("sendToXero") && newBill?.id) {
        try {
          const pushRes = await fetch("/api/xero/push-bill", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            credentials: "include",
            body: JSON.stringify({ billId: newBill.id }),
          });
          if (!pushRes.ok) {
            const errData = await pushRes.json().catch(() => ({}));
            if (errData.error === "UNMAPPED_CONTACT") {
              setUnmappedSupplierName(errData.supplierName || "Unknown Supplier");
              setUnmappedSupplierId(errData.supplierId || null);
              setPendingXeroBillId(newBill.id);
              setUnmappedContactDialogOpen(true);
              toast({ title: "Bill created", description: "Supplier not linked to Xero — select the matching contact below to complete the sync." });
              return; // stay on page for mapping
            }
            const err: XeroPushError = Object.assign(
              new Error(errData.message || errData.error || "Xero sync failed"),
              { validationErrors: errData.validationErrors as XeroValidationIssue[] | undefined },
            );
            throw err;
          }
          toast({ title: "Bill created & synced to Xero", description: "New bill created in Xero." });
        } catch (e) {
          const desc = formatXeroErrorDescription(e);
          toast({
            title: "Bill created — Xero sync failed",
            description: desc,
            variant: "destructive",
          });
          return; // stay on page so user can see the error
        }
      } else {
        toast({ title: "Success", description: "Bill created successfully" });
      }
      setLocation(projectId ? `/projects/${projectId}/bills` : "/bills");
    },
    onError: (error: Error) => {
      toast({
        title: "Error",
        description: error.message || "Failed to create bill",
        variant: "destructive",
      });
    },
  });

  const createSupplierMutation = useMutation({
    mutationFn: async (data: AddSupplierFormData) => {
      return await apiRequest("/api/contacts", "POST", { ...data, contactType: "supplier" });
    },
    onSuccess: (newSupplier: any) => {
      queryClient.invalidateQueries({ queryKey: ["/api/contacts"] });
      form.setValue("supplierId", newSupplier.id);
      setAddSupplierDialogOpen(false);
      supplierForm.reset();
      toast({
        title: "Success",
        description: "Supplier added successfully",
      });
    },
    onError: (error: Error) => {
      toast({
        title: "Error",
        description: error.message || "Failed to create supplier",
        variant: "destructive",
      });
    },
  });

  const updateMutation = useMutation({
    mutationFn: async (data: BillFormData) => {
      const billData = {
        ...data,
        billDate: new Date(data.billDate),
        dueDate: data.dueDate ? new Date(data.dueDate) : undefined,
        subtotal: Math.round(calculateSubtotal() * 100),
        tax: Math.round(calculateTax() * 100),
        total: Math.round(calculateTotal() * 100),
        paidAmount: Math.round((data.paidAmount || 0) * 100),
        taxMode,
        // attachmentUrls is intentionally omitted — attachments are managed
        // through the dedicated POST /api/bills/:id/attachments endpoint to
        // preserve richer metadata and avoid overwriting concurrent uploads.
      };

      const updatedBill = await apiRequest(`/api/bills/${id}`, "PATCH", billData) as Bill;

      const existingIds = existingLineItems.map((item) => item.id);
      const currentIds = lineItems.map((item) => item.id).filter(Boolean);
      
      const toDelete = existingIds.filter((id) => !currentIds.includes(id));
      for (const itemId of toDelete) {
        await apiRequest(`/api/bills/${id}/line-items/${itemId}`, "DELETE");
      }

      for (let i = 0; i < lineItems.length; i++) {
        const item = lineItems[i];
        const itemData = {
          billId: id,
          lineType: item.lineType,
          description: item.description,
          costCodeId: item.costCodeId,
          quantity: item.quantity,
          unitPrice: Math.round(item.unitPrice * 100),
          tax: item.tax,
          account: item.account,
          total: Math.round(item.total * 100),
          order: i,
        };

        let lineItemId = item.id;
        if (item.id) {
          await apiRequest(`/api/bills/${id}/line-items/${item.id}`, "PATCH", itemData);
        } else {
          const createdLineItem = await apiRequest(`/api/bills/${id}/line-items`, "POST", itemData);
          lineItemId = createdLineItem.id;
        }

        const existingAllowance = existingAllowances.find(a => a.billLineItemId === lineItemId);
        
        if (item.appliesToAllowances && item.allowanceItemId) {
          if (existingAllowance) {
            await apiRequest(`/api/bill-line-item-allowances/${existingAllowance.id}`, "PATCH", {
              estimateItemId: item.allowanceItemId,
              amount: Math.round(item.total * 100),
            });
          } else {
            await apiRequest("/api/bill-line-item-allowances", "POST", {
              billLineItemId: lineItemId,
              estimateItemId: item.allowanceItemId,
              amount: Math.round(item.total * 100),
            });
          }
        } else if (existingAllowance) {
          await apiRequest(`/api/bill-line-item-allowances/${existingAllowance.id}`, "DELETE");
        }
      }

      return updatedBill;
    },
    onSuccess: async () => {
      queryClient.invalidateQueries({ queryKey: ["/api/bills"] });
      queryClient.invalidateQueries({ queryKey: ["/api/bills", id] });
      queryClient.invalidateQueries({ queryKey: ["/api/bills", id, "line-item-allowances"] });
      queryClient.invalidateQueries({ queryKey: ["/api/projects", form.getValues("projectId"), "allowances"] });

      if (form.getValues("sendToXero") && id) {
        try {
          const pushRes = await fetch("/api/xero/push-bill", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            credentials: "include",
            body: JSON.stringify({ billId: id }),
          });
          if (!pushRes.ok) {
            const errData = await pushRes.json().catch(() => ({}));
            if (errData.error === "UNMAPPED_CONTACT") {
              setUnmappedSupplierName(errData.supplierName || "Unknown Supplier");
              setUnmappedSupplierId(errData.supplierId || null);
              setPendingXeroBillId(id || null);
              setUnmappedContactDialogOpen(true);
              toast({ title: "Bill saved", description: "Supplier not linked to Xero — select the matching contact below to complete the sync." });
              return; // stay on page so user can complete the mapping
            }
            const err: XeroPushError = Object.assign(
              new Error(errData.message || errData.error || "Xero sync failed"),
              { validationErrors: errData.validationErrors as XeroValidationIssue[] | undefined },
            );
            throw err;
          }
          const result = await pushRes.json();
          toast({
            title: "Bill saved & synced to Xero",
            description: result.updated ? "Existing Xero bill updated." : "New bill created in Xero.",
          });
        } catch (e) {
          // Stay on page so user can see the error and retry
          toast({
            title: "Bill saved — Xero sync failed",
            description: formatXeroErrorDescription(e),
            variant: "destructive",
          });
          return; // don't navigate away so they can see the error
        }
      } else {
        toast({ title: "Success", description: "Bill updated successfully" });
      }
      // If supplier defaults are stored but the user coded this bill differently,
      // stay on the page so they can decide whether to update the defaults.
      if (currentSupplier && !currentSupplier.suppressDefaultsPrompt && !defaultsPromptDismissed) {
        const billCostCode = mostUsed(lineItems.map(li => li.costCodeId || ""));
        const billAccount = mostUsed(lineItems.map(li => li.account || ""));
        const hasSomeDefault = !!(supplierDefaultCostCode || supplierDefaultAccountCode);
        const costCodeDiffers = !!billCostCode && billCostCode !== supplierDefaultCostCode;
        const accountDiffers = !!billAccount && billAccount !== supplierDefaultAccountCode;
        if (hasSomeDefault && (costCodeDiffers || accountDiffers)) {
          setShowUpdateDefaultsPrompt(true);
          return; // stay on page — user must dismiss the update prompt before leaving
        }
      }
      setLocation(projectId ? `/projects/${projectId}/bills` : "/bills");
    },
    onError: (error: Error) => {
      toast({
        title: "Error",
        description: error.message || "Failed to update bill",
        variant: "destructive",
      });
    },
  });

  const submitForApprovalMutation = useMutation({
    mutationFn: async () => {
      const currentSupplierId = form.getValues('supplierId');
      
      if (!currentSupplierId) {
        throw new Error("Please select a supplier");
      }
      
      if (lineItems.length === 0) {
        throw new Error("Please add line items");
      }
      
      const missingCostCodes = lineItems.some((item) => !item.costCodeId);
      if (missingCostCodes) {
        throw new Error("Please set cost codes for all line items");
      }
      
      const response = await apiRequest(`/api/bills/${id}`, "PATCH", {
        status: "awaiting_approval"
      });
      return response;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/bills"] });
      queryClient.invalidateQueries({ queryKey: ["/api/bills", id] });
      toast({
        title: "Success",
        description: "Bill submitted for approval",
      });
    },
    onError: (error: Error) => {
      toast({
        title: "Error",
        description: error.message || "Failed to submit bill for approval",
        variant: "destructive",
      });
    },
  });

  const syncBillPaymentMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest(`/api/xero/sync-bill-payment/${id}`, "POST");
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error((err as any).error || "Failed to sync from Xero");
      }
      return res.json() as Promise<{ synced: boolean; xeroStatus: string; amountPaidCents: number }>;
    },
    onSuccess: (data: any) => {
      queryClient.invalidateQueries({ queryKey: ["/api/bills", id] });
      queryClient.invalidateQueries({ queryKey: ["/api/bills"] });
      queryClient.invalidateQueries({ queryKey: ["/api/bills", id, "line-items"] });
      const lineMsg = data.lineItemsSynced > 0 ? ` ${data.lineItemsSynced} line item${data.lineItemsSynced !== 1 ? "s" : ""} updated.` : "";
      toast({ title: "Synced from Xero", description: `Status: ${data.xeroStatus}.${lineMsg}` });
    },
    onError: (error: Error) => {
      toast({ title: "Sync failed", description: error.message, variant: "destructive" });
    },
  });

  const approveMutation = useMutation({
    mutationFn: async (comments?: string) => {
      const response = await apiRequest(`/api/bills/${id}/approve`, "POST", {
        comments: comments || null,
      });
      return response;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/bills"] });
      queryClient.invalidateQueries({ queryKey: ["/api/bills", id] });
      queryClient.invalidateQueries({ queryKey: ["/api/bills", id, "approvals"] });
      toast({
        title: "Success",
        description: "Bill approved successfully",
      });
    },
    onError: (error: Error) => {
      toast({
        title: "Error",
        description: error.message || "Failed to approve bill",
        variant: "destructive",
      });
    },
  });

  const rejectMutation = useMutation({
    mutationFn: async (comments: string) => {
      const response = await apiRequest(`/api/bills/${id}/reject`, "POST", {
        comments,
      });
      return response;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/bills"] });
      queryClient.invalidateQueries({ queryKey: ["/api/bills", id] });
      queryClient.invalidateQueries({ queryKey: ["/api/bills", id, "approvals"] });
      setRejectDialogOpen(false);
      setRejectComments("");
      toast({
        title: "Success",
        description: "Bill rejected",
      });
    },
    onError: (error: Error) => {
      toast({
        title: "Error",
        description: error.message || "Failed to reject bill",
        variant: "destructive",
      });
    },
  });

  const duplicateMutation = useMutation({
    mutationFn: async () => {
      return await apiRequest(`/api/bills/${id}/duplicate`, "POST");
    },
    onSuccess: (data: any) => {
      queryClient.invalidateQueries({ queryKey: ["/api/bills"] });
      toast({
        title: "Success",
        description: "Bill duplicated successfully",
      });
      setLocation(`/bills/${data.id}`);
    },
    onError: (error: Error) => {
      toast({
        title: "Error",
        description: error.message || "Failed to duplicate bill",
        variant: "destructive",
      });
    },
  });

  // Persist the attachment returned by the file-first OCR endpoint.
  // The server uploads the file BEFORE running AI, so we always have an
  // attachment record even if AI extraction fails. For unsaved bills we tuck
  // it into pendingAttachments + attachmentUrls (the create payload picks it
  // up); for existing bills we POST it through the dedicated endpoint.
  const persistOcrAttachment = async (
    attachment: { objectPath: string; filename?: string; mimeType?: string; size?: number },
    file: File | null,
  ): Promise<{ ok: boolean }> => {
    const filename = attachment.filename || file?.name || "invoice";
    const mimeType = attachment.mimeType || file?.type;
    const size = attachment.size ?? file?.size;
    if (isEditMode && id) {
      try {
        await apiRequest(`/api/bills/${id}/attachments`, "POST", {
          objectPath: attachment.objectPath,
          filename,
          mimeType,
          size,
          source: "ai_reader",
        });
        queryClient.invalidateQueries({ queryKey: ["/api/bills", id] });
        return { ok: true };
      } catch (patchErr) {
        console.error("Failed to persist attachment to bill:", patchErr);
        return { ok: false };
      }
    }
    setAttachmentUrls((prev) => (prev.includes(attachment.objectPath) ? prev : [...prev, attachment.objectPath]));
    if (filename) setAttachmentMeta(prev => ({ ...prev, [attachment.objectPath]: { filename, mimeType } }));
    setPendingAttachments((prev) =>
      prev.some((p) => p.objectPath === attachment.objectPath)
        ? prev
        : [...prev, { objectPath: attachment.objectPath, filename, mimeType, size, source: "ai_reader" }],
    );
    return { ok: true };
  };

  const ocrMutation = useMutation({
    mutationFn: async (file: File) => {
      const reader = new FileReader();
      const base64Data = await new Promise<string>((resolve, reject) => {
        reader.onloadend = () => {
          if (reader.result) {
            resolve(reader.result as string);
          } else {
            reject(new Error("Failed to read file"));
          }
        };
        reader.onerror = reject;
        reader.readAsDataURL(file);
      });

      const response = await apiRequest("/api/ocr/process-invoice", "POST", {
        fileData: base64Data,
        fileName: file.name,
      });
      return response;
    },
    onSuccess: async (data: any) => {
      setOcrResults(data);
      setOcrPreviewOpen(true);
      let attachedOk = false;
      if (data?.attachment?.objectPath) {
        const result = await persistOcrAttachment(data.attachment, uploadedFile);
        attachedOk = result.ok;
      }
      toast({
        title: "Invoice processed",
        description: attachedOk
          ? "Extracted invoice data — review and confirm before approval."
          : "Extracted invoice data, but the file couldn't be attached. Try uploading manually from the Attachments tab.",
        variant: attachedOk ? undefined : "destructive",
      });
    },
    onError: async (error: any) => {
      // The file-first endpoint may still return the saved attachment even
      // when AI extraction fails (HTTP 502). Salvage it so the source isn't
      // lost.
      const attachment = error?.payload?.attachment || error?.attachment;
      if (attachment?.objectPath) {
        await persistOcrAttachment(attachment, uploadedFile);
        toast({
          title: "AI extraction failed",
          description:
            "We saved the file as an attachment, but couldn't extract the invoice details. Fill the bill in manually.",
          variant: "destructive",
        });
        return;
      }
      toast({
        title: "Error",
        description: error?.message || "Failed to process invoice with OCR",
        variant: "destructive",
      });
    },
  });

  // OCR from an attachment already stored in object storage (e.g. email-imported draft)
  const ocrFromAttachmentMutation = useMutation({
    mutationFn: async (objectPath: string) => {
      if (id) {
        return await apiRequest(`/api/bills/${id}/ocr-from-attachment`, "POST", { objectPath });
      }
      const meta = attachmentMeta[objectPath];
      return await apiRequest(`/api/bills/ocr-from-path`, "POST", {
        objectPath,
        mimeType: meta?.mimeType,
        filename: meta?.filename,
      });
    },
    onSuccess: (data: any) => {
      if (data.billReference || data.invoiceNumber) {
        form.setValue("billReference", data.billReference || data.invoiceNumber);
      }
      if (data.billDate || data.invoiceDate) {
        const dateStr = data.billDate || data.invoiceDate;
        form.setValue("billDate", format(new Date(dateStr), "yyyy-MM-dd"));
      }
      if (data.dueDate) {
        form.setValue("dueDate", format(new Date(data.dueDate), "yyyy-MM-dd"));
      }
      if (data.supplierName) {
        const candidates = (suppliers as any[]).map((s) => ({
          id: s.id,
          names: [s.company, s.name, `${s.firstName || ""} ${s.lastName || ""}`.trim()],
          raw: s,
        }));
        const result = matchSupplier(data.supplierName, candidates);
        if (result.match) {
          form.setValue("supplierId", result.match.candidate.id);
        } else {
          const top: SupplierMatch<typeof candidates[number]> | undefined = result.nearMatches[0];
          setOcrSupplierData({
            name: data.supplierName,
            email: data.supplierEmail,
            phone: data.supplierPhone,
          });
          if (top) {
            setOcrSupplierSuggestion({
              id: top.candidate.id,
              name: (top.candidate as any).raw?.name || data.supplierName,
              confidence: top.confidence,
            });
            setUnmatchedSupplierSelection(top.candidate.id);
          } else {
            setOcrSupplierSuggestion(null);
            setUnmatchedSupplierSelection("");
          }
          setUnmatchedSupplierDialogOpen(true);
        }
      }
      if (data.lineItems && data.lineItems.length > 0) {
        const firstCostCode = costCodes[0]?.id;
        const defaultAccount = getSupplierDefaultAccount();
        setTaxMode("inclusive");
        const newLineItems = data.lineItems.map((item: any, index: number) => ({
          lineType: "custom" as const,
          description: item.description || "",
          costCodeId: firstCostCode,
          quantity: item.quantity || 1,
          unitPrice: item.unitPrice ? item.unitPrice / 100 : 0,
          unit: "",
          tax: "GST on expenses" as const,
          account: defaultAccount,
          total: item.totalAmount ? item.totalAmount / 100 : 0,
          order: index,
          appliesToAllowances: false,
          allowanceItemId: undefined,
        }));
        setLineItems(newLineItems);
      }
      form.setValue("status", "needs_review");
      if (isEditMode && id && bill?.status === "draft") {
        apiRequest(`/api/bills/${id}`, "PATCH", { status: "needs_review" })
          .then(() => {
            queryClient.invalidateQueries({ queryKey: ["/api/bills", id] });
            queryClient.invalidateQueries({ queryKey: ["/api/bills"] });
          })
          .catch((err) => console.error("Failed to set bill status to needs_review:", err));
      }
      toast({
        title: "Bill updated",
        description: "AI has populated the bill fields. Review and save when ready.",
      });
    },
    onError: (error: any) => {
      toast({
        title: "AI extraction failed",
        description: error?.message || "Couldn't extract invoice details. Fill the bill in manually.",
        variant: "destructive",
      });
    },
  });

  // Auto-trigger the AI reader for email-imported bills that landed without
  // AI extraction (server-side OCR may have failed or timed out). We fire once
  // per bill the moment the attachment list is populated and the bill is in
  // draft state with ocrProcessed = false.
  useEffect(() => {
    if (!isEditMode || !bill || !id) return;
    // Already processed by AI — nothing to do.
    if ((bill as any).ocrProcessed) return;
    // Already fired for this bill in this session.
    if (autoOcrTriggeredForRef.current === id) return;
    // Wait until at least one attachment is available.
    if (attachmentUrls.length === 0) return;
    // Find the first attachment we can actually OCR (PDF or image).
    const firstProcessable = attachmentUrls.find((u) => {
      const pathClean = u.split("?")[0].split("#")[0];
      const extFromPath = pathClean.split(".").pop()?.toLowerCase() || "";
      const meta = attachmentMeta[u];
      const extFromMeta = meta?.filename?.split(".").pop()?.toLowerCase() || "";
      const mimeOk = /^(application\/pdf|image\/(jpeg|jpg|png|webp))/.test(meta?.mimeType || "");
      return (
        ["pdf", "jpg", "jpeg", "png", "webp"].includes(extFromPath) ||
        ["pdf", "jpg", "jpeg", "png", "webp"].includes(extFromMeta) ||
        mimeOk
      );
    });
    if (!firstProcessable) return;
    // Guard: don't double-fire.
    autoOcrTriggeredForRef.current = id;
    ocrFromAttachmentMutation.mutate(firstProcessable);
  }, [bill, attachmentUrls, isEditMode, id]);

  const performSubmit = (data: BillFormData) => {
    if (isEditMode) {
      updateMutation.mutate(data);
    } else {
      createMutation.mutate(data);
    }
  };

  const onSubmit = async (data: BillFormData) => {
    if (data.billReference) {
      try {
        const checkRes = await fetch(`/api/bills/check-reference?reference=${encodeURIComponent(data.billReference)}${isEditMode ? `&excludeBillId=${id}` : ''}`, { credentials: "include" });
        const checkData = await checkRes.json();
        if (checkData.exists) {
          pendingSubmitDataRef.current = data;
          setDuplicateWarning({
            existingBillNumber: checkData.existingBillNumber || "",
            reference: data.billReference,
          });
          return;
        }
      } catch (e) {
      }
    }
    performSubmit(data);
  };

  const handleAttachmentUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files) return;
    for (let i = 0; i < files.length; i++) {
      const file = files[i];
      try {
        const uploadResult = await uploadFile(file);
        if (uploadResult?.objectPath) {
          recordPendingAttachment(uploadResult.objectPath, file, "manual");
          setAttachmentMeta(prev => ({ ...prev, [uploadResult.objectPath]: { filename: file.name, mimeType: file.type } }));
        }
        if (uploadResult?.objectPath && isEditMode && id) {
          // Persist immediately on existing bills via the dedicated endpoint
          // so the manual upload survives a page refresh and avoids racing
          // any concurrent bill edits.
          try {
            await apiRequest(`/api/bills/${id}/attachments`, "POST", {
              objectPath: uploadResult.objectPath,
              filename: file.name,
              mimeType: file.type,
              size: file.size,
              source: "manual",
            });
            queryClient.invalidateQueries({ queryKey: ["/api/bills", id] });
          } catch (postErr: unknown) {
            const msg = postErr instanceof Error ? postErr.message : "Please try again from the Attachments tab.";
            toast({ variant: "destructive", title: "Attachment not saved", description: msg });
          }
        }
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : "Upload failed";
        toast({ variant: "destructive", title: "Upload failed", description: msg });
      }
    }
    e.target.value = '';
  };

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const validTypes = [
        "application/pdf",
        "image/jpeg",
        "image/jpg",
        "image/png",
      ];
      if (!validTypes.includes(file.type)) {
        toast({
          title: "Invalid file type",
          description: "Please upload a PDF or image file (JPG, JPEG, PNG)",
          variant: "destructive",
        });
        return;
      }
      setUploadedFile(file);
      setOcrResults(null);
      setOcrPreviewOpen(false);
    }
  };

  const handleDrop = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    const file = e.dataTransfer.files?.[0];
    if (file) {
      const validTypes = [
        "application/pdf",
        "image/jpeg",
        "image/jpg",
        "image/png",
      ];
      if (!validTypes.includes(file.type)) {
        toast({
          title: "Invalid file type",
          description: "Please upload a PDF or image file (JPG, JPEG, PNG)",
          variant: "destructive",
        });
        return;
      }
      setUploadedFile(file);
      setOcrResults(null);
      setOcrPreviewOpen(false);
    }
  };

  const handleProcessOCR = () => {
    if (uploadedFile) {
      ocrMutation.mutate(uploadedFile);
    }
  };

  const handleApplyOCR = () => {
    if (!ocrResults) return;

    if (ocrResults.billReference || ocrResults.invoiceNumber) {
      form.setValue("billReference", ocrResults.billReference || ocrResults.invoiceNumber);
    }

    if (ocrResults.billDate || ocrResults.invoiceDate) {
      const dateStr = ocrResults.billDate || ocrResults.invoiceDate;
      form.setValue("billDate", format(new Date(dateStr), "yyyy-MM-dd"));
    }

    if (ocrResults.dueDate) {
      form.setValue("dueDate", format(new Date(ocrResults.dueDate), "yyyy-MM-dd"));
    }

    if (ocrResults.supplierName) {
      const candidates = (suppliers as any[]).map((s) => ({
        id: s.id,
        names: [s.company, s.name, `${s.firstName || ""} ${s.lastName || ""}`.trim()],
        raw: s,
      }));
      const result = matchSupplier(ocrResults.supplierName, candidates);
      if (result.match) {
        form.setValue("supplierId", result.match.candidate.id);
      } else {
        // No confident match — open the unmatched-supplier dialog so the user
        // can pick an existing one or create a new one seeded with OCR data.
        const top: SupplierMatch<typeof candidates[number]> | undefined = result.nearMatches[0];
        setOcrSupplierData({
          name: ocrResults.supplierName,
          email: ocrResults.supplierEmail,
          phone: ocrResults.supplierPhone,
        });
        if (top) {
          setOcrSupplierSuggestion({
            id: top.candidate.id,
            name: (top.candidate as any).raw?.name || ocrResults.supplierName,
            confidence: top.confidence,
          });
          setUnmatchedSupplierSelection(top.candidate.id);
        } else {
          setOcrSupplierSuggestion(null);
          setUnmatchedSupplierSelection("");
        }
        setUnmatchedSupplierDialogOpen(true);
      }
    }

    if (ocrResults.lineItems && ocrResults.lineItems.length > 0) {
      const firstCostCode = costCodes[0]?.id;
      const defaultAccount = getSupplierDefaultAccount();
      // OCR returns inc-GST line totals (see INVOICE_EXTRACTION_PROMPT). Force
      // the form into Tax Inclusive mode so the calculator strips GST correctly
      // instead of adding 10% on top.
      setTaxMode("inclusive");
      const newLineItems = ocrResults.lineItems.map((item: any, index: number) => ({
        lineType: "custom" as const,
        description: item.description || "",
        costCodeId: firstCostCode,
        quantity: item.quantity || 1,
        unitPrice: item.unitPrice ? item.unitPrice / 100 : 0,
        unit: "",
        tax: "GST on expenses" as const,
        account: defaultAccount,
        total: item.totalAmount ? item.totalAmount / 100 : 0,
        order: index,
        appliesToAllowances: false,
        allowanceItemId: undefined,
      }));
      setLineItems(newLineItems);
    }

    // AI-extracted data must be reviewed by a human before reaching the
    // approver's queue. Set the bill status to `needs_review` for both
    // unsaved bills (form value picked up by the create payload) and
    // existing bills (PATCH so refresh keeps it).
    form.setValue("status", "needs_review");
    if (isEditMode && id && bill?.status === "draft") {
      apiRequest(`/api/bills/${id}`, "PATCH", { status: "needs_review" })
        .then(() => {
          queryClient.invalidateQueries({ queryKey: ["/api/bills", id] });
          queryClient.invalidateQueries({ queryKey: ["/api/bills"] });
        })
        .catch((err) => console.error("Failed to set bill status to needs_review:", err));
    }

    toast({
      title: "Success",
      description: "OCR data applied — review and confirm before approval.",
    });
  };

  const confirmExtractionMutation = useMutation({
    mutationFn: async () => {
      return await apiRequest(`/api/bills/${id}/confirm-extraction`, "POST");
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/bills"] });
      queryClient.invalidateQueries({ queryKey: ["/api/bills", id] });
      toast({
        title: "Sent for approval",
        description: "Bill has been confirmed and is now awaiting approval.",
      });
    },
    onError: (error: Error) => {
      toast({
        title: "Error",
        description: error.message || "Failed to confirm extraction",
        variant: "destructive",
      });
    },
  });

  const formatFileSize = (bytes: number) => {
    if (bytes < 1024) return bytes + " B";
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + " KB";
    return (bytes / (1024 * 1024)).toFixed(1) + " MB";
  };

  const getCostCodeName = (costCodeId?: string) => {
    if (!costCodeId) return "";
    const code = costCodes.find((c) => c.id === costCodeId);
    return code ? `${code.code} - ${code.title}` : "";
  };

  const getSubmitForApprovalValidation = () => {
    const currentSupplierId = form.watch('supplierId');
    const errors: string[] = [];
    
    if (!currentSupplierId) {
      errors.push("Please select a supplier");
    }
    
    if (lineItems.length === 0) {
      errors.push("Please add line items");
    }
    
    const missingCostCodes = lineItems.some((item) => !item.costCodeId);
    if (missingCostCodes) {
      errors.push("Please set cost codes for all line items");
    }
    
    return {
      isValid: errors.length === 0,
      errors,
    };
  };

  // ── Site PO suggestion banner ──────────────────────────────────────────────
  const billAny = bill as any;
  const matchedSitePOId: string | null = billAny?.matchedSitePOId ?? null;
  const suggestedSitePOIds: string[] = Array.isArray(billAny?.suggestedSitePOIds)
    ? (billAny.suggestedSitePOIds as string[])
    : [];

  const { data: suggestedSitePOs = [] } = useQuery<PurchaseOrder[]>({
    queryKey: ["/api/purchase-orders/suggestions", suggestedSitePOIds],
    queryFn: async () => {
      if (!suggestedSitePOIds.length) return [];
      const results = await Promise.all(
        suggestedSitePOIds.map(poId =>
          fetch(`/api/purchase-orders/${poId}`, { credentials: "include" })
            .then(r => r.ok ? r.json() as Promise<PurchaseOrder> : null)
        )
      );
      return results.filter(Boolean) as PurchaseOrder[];
    },
    enabled: !!(suggestedSitePOIds.length && !matchedSitePOId && isEditMode),
  });

  const { data: matchedSitePO } = useQuery<PurchaseOrder | null>({
    queryKey: ["/api/purchase-orders", matchedSitePOId],
    queryFn: async () => {
      if (!matchedSitePOId) return null;
      const r = await fetch(`/api/purchase-orders/${matchedSitePOId}`, { credentials: "include" });
      return r.ok ? (r.json() as Promise<PurchaseOrder>) : null;
    },
    enabled: !!(matchedSitePOId && isEditMode),
  });

  const linkSitePOMutation = useMutation({
    mutationFn: async (purchaseOrderId: string) => {
      await apiRequest(`/api/bills/${id}/link-po`, "POST", { purchaseOrderId });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/bills"] });
      queryClient.invalidateQueries({ queryKey: ["/api/purchase-orders"] });
    },
    onError: () => {
      toast({ title: "Failed to link PO", variant: "destructive" });
    },
  });

  const unlinkSitePOMutation = useMutation({
    mutationFn: async () => {
      await apiRequest(`/api/bills/${id}/unlink-po`, "POST");
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/bills"] });
      queryClient.invalidateQueries({ queryKey: ["/api/purchase-orders"] });
    },
    onError: () => {
      toast({ title: "Failed to unlink PO", variant: "destructive" });
    },
  });

  // Pickable POs: any non-draft, non-cancelled PO for the bill's supplier.
  const billSupplierId = form.watch('supplierId') as string | undefined;
  const { data: pickablePOs = [] } = useQuery<PurchaseOrder[]>({
    queryKey: ["/api/purchase-orders", { supplierId: billSupplierId }],
    queryFn: async () => {
      const r = await fetch(`/api/purchase-orders`, { credentials: "include" });
      if (!r.ok) return [];
      const all = (await r.json()) as PurchaseOrder[];
      return all.filter((po: any) => {
        if (!billSupplierId) return false;
        if (po.supplierId !== billSupplierId) return false;
        if (po.status === "draft" || po.status === "cancelled" || po.status === "paid") return false;
        return true;
      });
    },
    enabled: !!(isEditMode && !matchedSitePOId && billSupplierId),
  });

  const dismissSuggestionsMutation = useMutation({
    mutationFn: async () => {
      await apiRequest(`/api/bills/${id}`, "PATCH", { suggestedSitePOIds: [] });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/bills"] });
    },
  });

  if (billLoading) {
    return <div className="p-6">Loading...</div>;
  }

  const total = calculateTotal();
  const paid = form.watch("paidAmount") || 0;
  const due = calculateDue();

  return (
    <div className="flex flex-col h-full overflow-hidden" data-testid="page-bill-detail">
      <div className="flex-none px-4 py-2 border-b">
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <div className="flex items-center gap-2">
            <Button
              variant="ghost"
              size="icon"
              onClick={() => setLocation(projectId ? `/projects/${projectId}/bills` : "/bills")}
              data-testid="button-back"
            >
              <ArrowLeft className="h-4 w-4" />
            </Button>
            <h1 className="text-lg font-semibold" data-testid="text-page-title">
              {isEditMode
                ? (form.watch("billType") === "credit" ? "Edit Vendor Credit" : "Edit Bill")
                : (form.watch("billType") === "credit" ? "Create Vendor Credit" : "Create Bill")}
            </h1>
          </div>
          <div className="flex items-center gap-4 flex-wrap">
            <div className="flex items-center gap-1.5 text-xs">
              <span className="text-muted-foreground">Total:</span>
              <span className="font-semibold" data-testid="text-header-total">
                {formatCurrency(total)}
              </span>
            </div>
            <div className="flex items-center gap-1.5 text-xs">
              <span className="text-muted-foreground">Paid:</span>
              <span className="font-semibold" data-testid="text-header-paid">
                {formatCurrency(paid)}
              </span>
            </div>
            <div className="flex items-center gap-1.5 text-xs">
              <span className="text-muted-foreground">Due:</span>
              <span className="font-semibold" data-testid="text-header-due">
                {formatCurrency(due)}
              </span>
            </div>
            {isEditMode && bill?.status === "awaiting_approval" && canApprove && (
              <>
                <Button
                  variant="default"
                  size="sm"
                  onClick={() => approveMutation.mutate(undefined)}
                  disabled={approveMutation.isPending}
                  data-testid="button-approve"
                  className="gap-1"
                >
                  <Check className="h-3.5 w-3.5" />
                  {approveMutation.isPending ? "Approving..." : "Approve"}
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setRejectDialogOpen(true)}
                  disabled={rejectMutation.isPending}
                  data-testid="button-reject"
                  className="gap-1"
                >
                  <X className="h-3.5 w-3.5" />
                  Reject
                </Button>
              </>
            )}
            {isEditMode && (
              <Button 
                variant="ghost" 
                size="icon" 
                data-testid="button-duplicate"
                onClick={() => duplicateMutation.mutate()}
                disabled={duplicateMutation.isPending}
              >
                <Copy className="h-3.5 w-3.5" />
              </Button>
            )}
          </div>
        </div>
      </div>

      {/* ── Site PO matched banner ──────────────────────────────────────── */}
      {isEditMode && matchedSitePOId && matchedSitePO && (
        <div className="flex-none border-b bg-green-50 dark:bg-green-900/20 border-green-200 dark:border-green-800 px-4 py-2">
          <div className="flex items-center justify-between gap-2 text-sm text-green-800 dark:text-green-300">
            <div className="flex items-center gap-2 min-w-0">
              <Link2 className="w-4 h-4 flex-shrink-0 text-green-600 dark:text-green-400" />
              <span className="font-medium">Matched to Purchase Order</span>
              <button
                type="button"
                onClick={() => setLocation(`/purchase-orders/${matchedSitePO.id}`)}
                className="font-mono font-semibold hover:underline"
                data-testid="link-matched-po"
              >
                {matchedSitePO.poNumber}
              </button>
              {matchedSitePO.description && (
                <span className="text-green-700/70 dark:text-green-400/70 truncate">— {matchedSitePO.description}</span>
              )}
            </div>
            <Button
              size="sm"
              variant="ghost"
              className="h-7 px-2 text-xs text-green-800 dark:text-green-300"
              onClick={() => unlinkSitePOMutation.mutate()}
              disabled={unlinkSitePOMutation.isPending}
              data-testid="button-unlink-po"
            >
              {unlinkSitePOMutation.isPending ? <Loader2 className="w-3 h-3 animate-spin" /> : "Unlink"}
            </Button>
          </div>
        </div>
      )}

      {/* ── PO picker (any open PO from the bill's supplier) ──────────────── */}
      {isEditMode && !matchedSitePOId && billSupplierId && pickablePOs.length > 0 && suggestedSitePOs.length === 0 && (
        <div className="flex-none border-b bg-blue-50/80 dark:bg-blue-900/20 border-blue-200 dark:border-blue-800 px-4 py-2">
          <div className="flex items-center gap-2 text-sm">
            <Link2 className="w-4 h-4 flex-shrink-0 text-blue-600 dark:text-blue-400" />
            <span className="font-medium text-blue-800 dark:text-blue-300">Link this bill to a PO:</span>
            <Select onValueChange={(v) => v && linkSitePOMutation.mutate(v)} disabled={linkSitePOMutation.isPending}>
              <SelectTrigger className="h-8 w-[320px] text-xs" data-testid="select-link-po">
                <SelectValue placeholder={`Choose from ${pickablePOs.length} open PO${pickablePOs.length === 1 ? "" : "s"}…`} />
              </SelectTrigger>
              <SelectContent>
                {pickablePOs.map((po: any) => (
                  <SelectItem key={po.id} value={po.id}>
                    <span className="font-mono">{po.poNumber}</span>
                    {po.description ? ` — ${po.description}` : ""}
                    {" · "}{formatCurrency(po.total || 0)}
                    {" · "}{(po.status || "").replace(/_/g, " ")}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>
      )}

      {/* ── PO suggestion banner ────────────────────────────────────────── */}
      {isEditMode && !matchedSitePOId && suggestedSitePOs.length > 0 && (
        <div className="flex-none border-b bg-amber-50/80 dark:bg-amber-900/20 border-amber-200 dark:border-amber-800 px-4 py-3">
          <div className="flex items-start justify-between gap-3">
            <div className="flex items-start gap-2 min-w-0">
              <ClipboardList className="w-4 h-4 flex-shrink-0 text-amber-600 dark:text-amber-400 mt-0.5" />
              <div className="min-w-0">
                <p className="text-sm font-medium text-amber-800 dark:text-amber-300 mb-1.5">
                  Possible PO match{suggestedSitePOs.length > 1 ? "es" : ""}
                </p>
                <div className="flex flex-wrap gap-2">
                  {suggestedSitePOs.map(po => (
                    <div
                      key={po.id}
                      className="flex items-center gap-2 bg-white dark:bg-amber-900/30 border border-amber-200 dark:border-amber-700 rounded-md px-2.5 py-1.5 text-xs"
                    >
                      <span className="font-mono font-semibold text-amber-700 dark:text-amber-300">{po.poNumber}</span>
                      {po.description && (
                        <span className="text-muted-foreground truncate max-w-[180px]">{po.description}</span>
                      )}
                      <Button
                        size="sm"
                        variant="outline"
                        className="h-6 px-2 text-xs border-amber-300 dark:border-amber-600 text-amber-800 dark:text-amber-300 ml-1"
                        onClick={() => linkSitePOMutation.mutate(po.id)}
                        disabled={linkSitePOMutation.isPending}
                        data-testid={`button-link-site-po-${po.id}`}
                      >
                        {linkSitePOMutation.isPending ? (
                          <Loader2 className="w-3 h-3 animate-spin" />
                        ) : (
                          <>
                            <Link2 className="w-3 h-3 mr-1" />
                            Link
                          </>
                        )}
                      </Button>
                    </div>
                  ))}
                </div>
              </div>
            </div>
            <Button
              size="icon"
              variant="ghost"
              className="flex-shrink-0 h-6 w-6 text-amber-600 dark:text-amber-400"
              onClick={() => dismissSuggestionsMutation.mutate()}
              disabled={dismissSuggestionsMutation.isPending}
              data-testid="button-dismiss-site-po-suggestions"
            >
              <X className="w-3.5 h-3.5" />
            </Button>
          </div>
        </div>
      )}

      <div className="flex-1 flex overflow-hidden">
        <div className="flex-1 overflow-auto p-4">
        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-3">
            <div className={`grid grid-cols-1 gap-3 ${sheetPreviewUrl ? 'lg:grid-cols-[1fr_140px]' : 'lg:grid-cols-[1fr_280px]'}`}>
              <Card className="p-4">
                <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
                  <FormField
                    control={form.control}
                    name="billNumber"
                    render={({ field }) => (
                      <FormItem className="space-y-1">
                        <FormLabel className="text-[10px] uppercase tracking-wider font-semibold text-muted-foreground">Bill ID</FormLabel>
                        <FormControl>
                          <Input
                            {...field}
                            readOnly
                            className="bg-muted/50 border border-border text-sm"
                            data-testid="input-bill-number"
                          />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <FormField
                    control={form.control}
                    name="billType"
                    render={({ field }) => (
                      <FormItem className="space-y-1">
                        <FormLabel className="text-[10px] uppercase tracking-wider font-semibold text-muted-foreground">Type</FormLabel>
                        <Select
                          onValueChange={field.onChange}
                          value={field.value}
                        >
                          <FormControl>
                            <SelectTrigger className="h-9 border border-border bg-muted/30 text-sm font-normal" data-testid="select-bill-type">
                              <SelectValue placeholder="Select type..." />
                            </SelectTrigger>
                          </FormControl>
                          <SelectContent>
                            <SelectItem value="bill">Bill</SelectItem>
                            <SelectItem value="credit">Vendor Credit</SelectItem>
                          </SelectContent>
                        </Select>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <FormField
                    control={form.control}
                    name="projectId"
                    render={({ field }) => {
                      const allProjects = businessProject ? [businessProject, ...projects.filter(p => !(p as any).isBusiness)] : projects.filter(p => !(p as any).isBusiness);
                      const selectedProject = allProjects.find(p => p.id === field.value);
                      return (
                      <FormItem className="space-y-1">
                        <FormLabel className="text-[10px] uppercase tracking-wider font-semibold text-muted-foreground">Project *</FormLabel>
                        <Select
                          key={`project-${field.value}-${projects.length}-${businessProject?.id ?? ''}`}
                          onValueChange={field.onChange}
                          value={field.value}
                          disabled={!isEditMode && !!projectId}
                        >
                          <FormControl>
                            <SelectTrigger
                              className="border border-border bg-muted/30 text-sm font-normal text-left"
                              style={{ height: '36px', overflow: 'hidden', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '4px' }}
                              data-testid="select-project"
                            >
                              <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flex: '1 1 0%', minWidth: 0, overflow: 'hidden', textAlign: 'left' }}>
                                {selectedProject?.color && (
                                  <span
                                    className="rounded-full"
                                    style={{ width: '10px', height: '10px', flexShrink: 0, backgroundColor: selectedProject.color }}
                                  />
                                )}
                                <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', minWidth: 0, flex: 1 }}>
                                  {selectedProject
                                    ? selectedProject.name + ((selectedProject as any).isBusiness ? ' (Business)' : '')
                                    : <span className="text-muted-foreground">Select project...</span>}
                                </span>
                              </div>
                            </SelectTrigger>
                          </FormControl>
                          <SelectContent>
                            {businessProject && (
                              <>
                                <SelectItem key={businessProject.id} value={businessProject.id}>
                                  <span className="flex items-center gap-2">
                                    {(businessProject as any).color && (
                                      <span className="h-2.5 w-2.5 rounded-full shrink-0" style={{ backgroundColor: (businessProject as any).color }} />
                                    )}
                                    {businessProject.name} (Business)
                                  </span>
                                </SelectItem>
                                <div className="border-b border-border my-1" />
                              </>
                            )}
                            {projects.filter(p => !(p as any).isBusiness).map((project) => (
                              <SelectItem key={project.id} value={project.id}>
                                <span className="flex items-center gap-2">
                                  {(project as any).color && (
                                    <span className="h-2.5 w-2.5 rounded-full shrink-0" style={{ backgroundColor: (project as any).color }} />
                                  )}
                                  {project.name}
                                </span>
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                        <FormMessage />
                      </FormItem>
                      );
                    }}
                  />

                  <FormField
                    control={form.control}
                    name="supplierId"
                    render={({ field }) => {
                      const selected = suppliers.find((s: any) => s.id === field.value);
                      return (
                      <FormItem className="space-y-1 relative">
                        <FormLabel className="text-[10px] uppercase tracking-wider font-semibold text-muted-foreground">Pay to *</FormLabel>
                        {selected && (
                          <button
                            type="button"
                            className="absolute top-0 right-0 text-data text-muted-foreground hover:text-foreground inline-flex items-center gap-0.5"
                            onClick={() => {
                              setSupplierDefaultsCostCode(selected.defaultCostCodeId || "");
                              setSupplierDefaultsAccount(selected.xeroDefaultAccountCode || selected.xeroDefaultAccount || "");
                              setSupplierDefaultsOpen(true);
                            }}
                            data-testid="button-open-supplier-defaults"
                          >
                            <Settings className="h-3 w-3" /> Defaults
                          </button>
                        )}
                        <Popover
                          open={supplierPickerOpen}
                          onOpenChange={(open) => {
                            setSupplierPickerOpen(open);
                            if (!open) setSupplierSearchText("");
                          }}
                        >
                          <PopoverTrigger asChild>
                            <FormControl>
                              <Button
                                type="button"
                                variant="outline"
                                role="combobox"
                                className="w-full h-9 justify-between border border-border bg-muted/30 text-sm font-normal overflow-hidden"
                                data-testid="select-supplier"
                              >
                                <span className={`truncate flex-1 min-w-0 text-left ${selected ? "" : "text-muted-foreground"}`}>
                                  {selected?.name || "Select supplier..."}
                                </span>
                                <ChevronsUpDown className="h-3.5 w-3.5 opacity-50 shrink-0 ml-1" />
                              </Button>
                            </FormControl>
                          </PopoverTrigger>
                          <PopoverContent
                            className="p-0 w-[--radix-popover-trigger-width] min-w-[320px]"
                            align="start"
                            data-testid="select-supplier-content"
                          >
                            <Command shouldFilter={true}>
                              <CommandInput
                                placeholder="Search suppliers..."
                                value={supplierSearchText}
                                onValueChange={setSupplierSearchText}
                                data-testid="input-supplier-search"
                              />
                              <CommandList className="max-h-[280px]">
                                <CommandEmpty>No suppliers found.</CommandEmpty>
                                <CommandGroup>
                                  {suppliers.map((supplier: any) => (
                                    <CommandItem
                                      key={supplier.id}
                                      value={supplier.name}
                                      onSelect={() => {
                                        field.onChange(supplier.id);
                                        setSupplierPickerOpen(false);
                                        setSupplierSearchText("");
                                      }}
                                      data-testid={`option-supplier-${supplier.id}`}
                                    >
                                      <span className="truncate">{supplier.name}</span>
                                    </CommandItem>
                                  ))}
                                </CommandGroup>
                              </CommandList>
                              <div className="border-t p-1 bg-popover sticky bottom-0">
                                <button
                                  type="button"
                                  onMouseDown={(e) => {
                                    e.preventDefault();
                                    // Seed prefill from typed search text when no
                                    // OCR data is currently set.
                                    if (!ocrSupplierData && supplierSearchText.trim()) {
                                      setOcrSupplierData({ name: supplierSearchText.trim() });
                                    }
                                    setSupplierPickerOpen(false);
                                    setAddSupplierDialogOpen(true);
                                  }}
                                  className="w-full flex items-center gap-2 px-2 py-1.5 text-xs text-primary hover-elevate rounded-sm"
                                  data-testid="button-add-supplier"
                                >
                                  <Plus className="h-3 w-3" />
                                  {supplierSearchText.trim()
                                    ? `Create "${supplierSearchText.trim()}"`
                                    : "Create new contact"}
                                </button>
                              </div>
                            </Command>
                          </PopoverContent>
                        </Popover>
                        <FormMessage />
                      </FormItem>
                      );
                    }}
                  />

                  <FormField
                    control={form.control}
                    name="billDate"
                    render={({ field }) => (
                      <FormItem className="space-y-1">
                        <FormLabel className="text-[10px] uppercase tracking-wider font-semibold text-muted-foreground">Date *</FormLabel>
                        <FormControl>
                          <Input
                            type="date"
                            {...field}
                            className="bg-muted/30 border border-border text-sm"
                            data-testid="input-bill-date"
                          />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <FormField
                    control={form.control}
                    name="dueDate"
                    render={({ field }) => (
                      <FormItem className="space-y-1">
                        <FormLabel className="text-[10px] uppercase tracking-wider font-semibold text-muted-foreground">Due date</FormLabel>
                        <FormControl>
                          <Input
                            type="date"
                            {...field}
                            onChange={(e) => {
                              dueDateManuallySet.current = true;
                              field.onChange(e);
                            }}
                            className="bg-muted/30 border border-border text-sm"
                            data-testid="input-due-date"
                          />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <FormField
                    control={form.control}
                    name="billReference"
                    render={({ field }) => (
                      <FormItem className="space-y-1">
                        <FormLabel className="text-[10px] uppercase tracking-wider font-semibold text-muted-foreground">Reference</FormLabel>
                        <FormControl>
                          <Input
                            {...field}
                            placeholder="Enter reference..."
                            className="bg-muted/30 border border-border text-sm"
                            data-testid="input-bill-reference"
                          />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <FormField
                    control={form.control}
                    name="sendToXero"
                    render={({ field }) => (
                      <FormItem className="flex items-center gap-2 space-y-0 self-end pb-1">
                        <FormControl>
                          <Checkbox
                            checked={field.value}
                            onCheckedChange={field.onChange}
                            data-testid="checkbox-send-to-xero"
                          />
                        </FormControl>
                        <FormLabel className="!mt-0 text-[10px] uppercase tracking-wider font-semibold text-muted-foreground">Sync with Xero</FormLabel>
                      </FormItem>
                    )}
                  />
                </div>

                {form.watch("sendToXero") && (
                  <div className="text-xs text-destructive space-y-0.5 mt-2">
                    {!form.watch("supplierId") && (
                      <div data-testid="text-xero-validation-supplier">Fill in Pay to field</div>
                    )}
                    {lineItems.some((item) => !item.costCodeId) && (
                      <div data-testid="text-xero-validation-cost-codes">Set the Cost Codes</div>
                    )}
                  </div>
                )}

                <div className="grid grid-cols-1 lg:grid-cols-2 gap-3 mt-3 pt-3 border-t">
                  <FormField
                    control={form.control}
                    name="notes"
                    render={({ field }) => (
                      <FormItem className="space-y-1">
                        <FormLabel className="text-[10px] uppercase tracking-wider font-semibold text-muted-foreground">Notes</FormLabel>
                        <FormControl>
                          <Textarea
                            {...field}
                            placeholder="Add notes..."
                            rows={2}
                            className="bg-muted/30 border border-border text-sm resize-none"
                            data-testid="textarea-notes"
                          />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={form.control}
                    name="reminders"
                    render={({ field }) => (
                      <FormItem className="space-y-1">
                        <FormLabel className="text-[10px] uppercase tracking-wider font-semibold text-muted-foreground">Reminders</FormLabel>
                        <FormControl>
                          <Textarea
                            {...field}
                            placeholder="Add reminders..."
                            rows={2}
                            className="bg-muted/30 border border-border text-sm resize-none"
                            data-testid="textarea-reminders"
                          />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </div>
              </Card>

              <div className="space-y-3">
                <Card className="p-3">
                  <div className="space-y-3">
                    <div>
                      <div className="flex items-center justify-between mb-1.5">
                        <div className="flex items-center gap-1.5">
                          <Paperclip className="h-3.5 w-3.5 text-muted-foreground" />
                          <span className="text-xs font-medium">Attachments</span>
                        </div>
                        <label className="cursor-pointer">
                          <input
                            type="file"
                            multiple
                            className="hidden"
                            onChange={handleAttachmentUpload}
                            accept=".pdf,.jpg,.jpeg,.png,.doc,.docx,.xls,.xlsx"
                            data-testid="input-attachments"
                          />
                          <Button variant="ghost" size="sm" asChild disabled={isUploadingAttachment}>
                            <span>
                              {isUploadingAttachment ? <Loader2 className="h-3 w-3 mr-1 animate-spin" /> : <Plus className="h-3 w-3 mr-1" />}
                              Add
                            </span>
                          </Button>
                        </label>
                      </div>
                      {attachmentUrls.length > 0 ? (
                        <div className="space-y-1">
                          {attachmentUrls.map((url, idx) => {
                            const path = url.split('?')[0].split('#')[0];
                            const meta = attachmentMeta[url];
                            const fileName = meta?.filename || path.split('/').pop() || `Attachment ${idx + 1}`;
                            const extFromPath = path.split('.').pop()?.toLowerCase() || '';
                            const extFromMeta = meta?.filename?.split('.').pop()?.toLowerCase() || '';
                            const mimeFromMeta = meta?.mimeType || '';
                            const isImage = /\.(jpe?g|png|gif|webp|bmp|tiff?)$/i.test(path) || /^(jpe?g|png|gif|webp|bmp|tiff?)$/i.test(extFromMeta) || mimeFromMeta.startsWith('image/');
                            const isPdf = /\.(pdf)$/i.test(path) || extFromMeta === 'pdf' || mimeFromMeta === 'application/pdf';
                            const canPreview = isImage || isPdf;
                            return (
                              <div key={idx} className="flex items-center justify-between gap-1.5 p-1.5 rounded-md border text-table">
                                <button
                                  type="button"
                                  onClick={() => canPreview ? (setSheetPreviewUrl(url), setSheetPreviewFilename(fileName)) : window.open(url, '_blank')}
                                  className="flex items-center gap-1.5 text-foreground hover:underline truncate text-left"
                                >
                                  {isImage ? (
                                    <img src={url} alt="" className="h-5 w-5 rounded-sm object-cover shrink-0" />
                                  ) : (
                                    <FileText className="h-3 w-3 text-muted-foreground shrink-0" />
                                  )}
                                  <span className="truncate">{decodeURIComponent(fileName)}</span>
                                </button>
                                <div className="flex items-center gap-0.5 shrink-0">
                                  <Button
                                    variant="ghost"
                                    size="icon"
                                    onClick={async () => {
                                      const prev = attachmentUrls;
                                      setAttachmentUrls(curr => curr.filter((_, i) => i !== idx));
                                      if (sheetPreviewUrl === url) setSheetPreviewUrl(null);
                                      if (isEditMode && id) {
                                        try {
                                          await apiRequest(
                                            `/api/bills/${id}/attachments?objectPath=${encodeURIComponent(url)}`,
                                            "DELETE",
                                          );
                                          queryClient.invalidateQueries({ queryKey: ["/api/bills", id] });
                                        } catch (err: unknown) {
                                          setAttachmentUrls(prev);
                                          const msg = err instanceof Error ? err.message : "Could not remove attachment";
                                          toast({ variant: "destructive", title: "Remove failed", description: msg });
                                        }
                                      }
                                    }}
                                    data-testid={`button-remove-attachment-${idx}`}
                                  >
                                    <X className="h-3 w-3" />
                                  </Button>
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      ) : (
                        <p className="text-data text-muted-foreground">No attachments</p>
                      )}
                    </div>

                    <div className="border-t pt-2">
                      <div className="flex items-center gap-1.5 mb-2">
                        <RefreshCw className="h-3.5 w-3.5 text-muted-foreground" />
                        <span className="text-xs font-medium">AI Bill Reader</span>
                      </div>
                      <div className="space-y-2">
                        {(() => {
                          const firstProcessable = attachmentUrls.find((u) => {
                            const path = u.split("?")[0].split("#")[0];
                            const extFromPath = path.split(".").pop()?.toLowerCase() || "";
                            const meta = attachmentMeta[u];
                            const extFromMeta = meta?.filename?.split(".").pop()?.toLowerCase() || "";
                            const mimeOk = /^(application\/pdf|image\/)/.test(meta?.mimeType || "");
                            return ["pdf","jpg","jpeg","png","webp"].includes(extFromPath)
                              || ["pdf","jpg","jpeg","png","webp"].includes(extFromMeta)
                              || mimeOk;
                          });
                          return (
                            <Button
                              className="w-full"
                              size="sm"
                              disabled={!firstProcessable || ocrFromAttachmentMutation.isPending}
                              onClick={() => firstProcessable && ocrFromAttachmentMutation.mutate(firstProcessable)}
                              data-testid="button-read-attachment-ai"
                            >
                              {ocrFromAttachmentMutation.isPending ? (
                                <>
                                  <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" />
                                  Reading...
                                </>
                              ) : (
                                <>
                                  <RefreshCw className="h-3.5 w-3.5 mr-1.5" />
                                  Read & Apply
                                </>
                              )}
                            </Button>
                          );
                        })()}
                        {ocrResults && (
                          <Collapsible open={ocrPreviewOpen} onOpenChange={setOcrPreviewOpen}>
                            <CollapsibleTrigger asChild>
                              <Button
                                variant="outline"
                                size="sm"
                                className="w-full justify-between"
                                data-testid="button-toggle-ocr-preview"
                              >
                                <span className="text-xs">AI Extracted Data</span>
                                <ChevronDown className={`h-3.5 w-3.5 transition-transform ${ocrPreviewOpen ? 'rotate-180' : ''}`} />
                              </Button>
                            </CollapsibleTrigger>
                            <CollapsibleContent className="mt-2 space-y-2" data-testid="card-ocr-results">
                              <div className="border rounded-md p-2 space-y-1.5 text-table">
                                <div className="grid grid-cols-2 gap-1.5">
                                  <div>
                                    <p className="text-muted-foreground">Supplier</p>
                                    <p className="font-medium" data-testid="text-ocr-supplier">
                                      {ocrResults.supplierName || "Not detected"}
                                    </p>
                                  </div>
                                  <div>
                                    <p className="text-muted-foreground">Invoice #</p>
                                    <p className="font-medium" data-testid="text-ocr-invoice-number">
                                      {ocrResults.invoiceNumber || "Not detected"}
                                    </p>
                                  </div>
                                  <div>
                                    <p className="text-muted-foreground">Date</p>
                                    <p className="font-medium" data-testid="text-ocr-invoice-date">
                                      {ocrResults.invoiceDate ? format(new Date(ocrResults.invoiceDate), "dd/MM/yyyy") : "Not detected"}
                                    </p>
                                  </div>
                                  <div>
                                    <p className="text-muted-foreground">Due</p>
                                    <p className="font-medium" data-testid="text-ocr-due-date">
                                      {ocrResults.dueDate ? format(new Date(ocrResults.dueDate), "dd/MM/yyyy") : "Not detected"}
                                    </p>
                                  </div>
                                </div>
                                <div className="border-t pt-1.5">
                                  <div className="grid grid-cols-3 gap-1.5">
                                    <div>
                                      <p className="text-muted-foreground">Subtotal</p>
                                      <p className="font-medium" data-testid="text-ocr-subtotal">
                                        {ocrResults.subtotalAmount ? formatCurrency(ocrResults.subtotalAmount / 100) : "—"}
                                      </p>
                                    </div>
                                    <div>
                                      <p className="text-muted-foreground">Tax</p>
                                      <p className="font-medium" data-testid="text-ocr-tax">
                                        {ocrResults.totalTax ? formatCurrency(ocrResults.totalTax / 100) : "—"}
                                      </p>
                                    </div>
                                    <div>
                                      <p className="text-muted-foreground">Total</p>
                                      <p className="font-medium" data-testid="text-ocr-total">
                                        {ocrResults.totalAmount ? formatCurrency(ocrResults.totalAmount / 100) : "—"}
                                      </p>
                                    </div>
                                  </div>
                                </div>
                                {ocrResults.lineItems && ocrResults.lineItems.length > 0 && (
                                  <div className="border-t pt-1.5">
                                    <p className="font-medium mb-1">Line Items</p>
                                    <div className="space-y-0.5">
                                      {ocrResults.lineItems.map((item: any, idx: number) => (
                                        <div key={idx} className="flex justify-between p-1 bg-muted/50 rounded text-data" data-testid={`text-ocr-line-item-${idx}`}>
                                          <span className="truncate mr-2">{item.description || "Unknown"}</span>
                                          <span className="font-medium shrink-0">
                                            {item.totalAmount ? formatCurrency(item.totalAmount / 100) : "—"}
                                          </span>
                                        </div>
                                      ))}
                                    </div>
                                  </div>
                                )}
                              </div>
                              <Button
                                onClick={handleApplyOCR}
                                className="w-full"
                                size="sm"
                                data-testid="button-apply-ocr"
                              >
                                Apply to Bill
                              </Button>
                            </CollapsibleContent>
                          </Collapsible>
                        )}
                      </div>
                    </div>

                    <div className="border-t pt-2">
                      <div className="flex items-center gap-1.5 mb-1.5">
                        <MessageSquare className="h-3.5 w-3.5 text-muted-foreground" />
                        <span className="text-xs font-medium">Comments</span>
                      </div>
                      {isEditMode ? (
                        <Textarea
                          placeholder="Add a comment..."
                          rows={2}
                          className="text-xs resize-none"
                          data-testid="textarea-comments"
                        />
                      ) : (
                        <div
                          className="text-data text-muted-foreground"
                          data-testid="text-comments-unavailable"
                        >
                          Available after create
                        </div>
                      )}
                    </div>
                  </div>
                </Card>
              </div>
            </div>

            <Card className="p-0 overflow-hidden">
              <div className="flex items-center justify-between px-3 py-2 border-b bg-muted/30">
                <h3 className="text-xs font-semibold">Cost Lines</h3>
                <div className="flex items-center gap-2">
                  <div className="relative">
                    <Button
                      type="button"
                      size="icon"
                      variant="ghost"
                      onClick={() => setColMenuOpen(!colMenuOpen)}
                      data-testid="button-column-visibility"
                    >
                      <Settings2 className="h-3.5 w-3.5" />
                    </Button>
                    {colMenuOpen && (
                      <div data-col-menu className="absolute right-0 top-full mt-1 z-50 bg-popover border rounded-md shadow-md p-2 min-w-[160px]">
                        <div className="text-table font-medium text-muted-foreground mb-1.5 px-1">Show columns</div>
                        {[
                          { key: "exTax" as const, label: "Amount ex Tax" },
                          { key: "tax" as const, label: "Amount Tax" },
                          { key: "incTax" as const, label: "Amount inc Tax" },
                        ].map(({ key, label }) => (
                          <label key={key} className="flex items-center gap-2 px-1 py-1 text-table cursor-pointer rounded-sm hover-elevate">
                            <Checkbox
                              checked={visibleAmountCols[key]}
                              onCheckedChange={(checked) =>
                                setVisibleAmountCols((prev) => ({ ...prev, [key]: checked === true }))
                              }
                              className="h-3.5 w-3.5"
                            />
                            {label}
                          </label>
                        ))}
                      </div>
                    )}
                  </div>
                  <div className="flex items-center gap-1.5">
                    <span className="text-table text-muted-foreground">Amounts are</span>
                    <div className="inline-flex rounded-md border bg-muted/30 p-0.5" data-testid="select-tax-mode">
                      <button
                        type="button"
                        onClick={() => setTaxMode("exclusive")}
                        className={`px-2.5 py-0.5 text-table rounded-sm transition-colors ${taxMode === "exclusive" ? "bg-background shadow-sm font-medium text-foreground" : "text-muted-foreground"}`}
                      >
                        Exclusive
                      </button>
                      <button
                        type="button"
                        onClick={() => setTaxMode("inclusive")}
                        className={`px-2.5 py-0.5 text-table rounded-sm transition-colors ${taxMode === "inclusive" ? "bg-background shadow-sm font-medium text-foreground" : "text-muted-foreground"}`}
                      >
                        Inclusive
                      </button>
                    </div>
                    <span className="text-table text-muted-foreground">of tax</span>
                  </div>
                </div>
              </div>

              {showDefaultsPrompt && (
                <div className="flex flex-wrap items-center gap-2 px-3 py-2 border-b bg-muted/20 text-table" data-testid="prompt-save-supplier-defaults">
                  <span className="text-muted-foreground">
                    Save{" "}
                    {suggestedCostCode && (
                      <>
                        cost code{" "}
                        <span className="font-medium text-foreground">
                          {(costCodes.find(c => c.id === suggestedCostCode)?.code) || ""} {(costCodes.find(c => c.id === suggestedCostCode)?.name) || ""}
                        </span>
                      </>
                    )}
                    {suggestedCostCode && suggestedAccount && " and "}
                    {suggestedAccount && xeroAccounts.length > 0 && (
                      <>
                        Xero account{" "}
                        <span className="font-medium text-foreground">
                          {(() => {
                            const a = xeroAccounts.find(x => x.code === suggestedAccount);
                            return a ? `${a.code} - ${a.name}` : suggestedAccount;
                          })()}
                        </span>
                      </>
                    )}
                    {" "}as defaults for {currentSupplier?.name || "this supplier"}?
                  </span>
                  <div className="flex items-center gap-1 ml-auto">
                    <Button
                      type="button"
                      size="sm"
                      variant="default"
                      className="h-6 text-table px-2"
                      disabled={updateSupplierDefaultsMutation.isPending}
                      onClick={() => {
                        if (!currentSupplier) return;
                        const payload: {
                          supplierId: string;
                          defaultCostCodeId?: string | null;
                          xeroDefaultAccountCode?: string | null;
                        } = { supplierId: currentSupplier.id };
                        if (suggestedCostCode) payload.defaultCostCodeId = suggestedCostCode;
                        if (suggestedAccount && xeroAccounts.length > 0) payload.xeroDefaultAccountCode = suggestedAccount;
                        updateSupplierDefaultsMutation.mutate(payload, {
                          onSuccess: () => {
                            setDefaultsPromptDismissed(true);
                            toast({ title: "Defaults saved", description: `Future bills for ${currentSupplier.name} will use these.` });
                          },
                        });
                      }}
                      data-testid="button-save-supplier-defaults"
                    >
                      Save
                    </Button>
                    <Button
                      type="button"
                      size="sm"
                      variant="ghost"
                      className="h-6 text-table px-2"
                      onClick={() => setDefaultsPromptDismissed(true)}
                      data-testid="button-defer-supplier-defaults"
                    >
                      Not now
                    </Button>
                    <Button
                      type="button"
                      size="sm"
                      variant="ghost"
                      className="h-6 text-table px-2 text-muted-foreground"
                      disabled={updateSupplierDefaultsMutation.isPending}
                      onClick={() => {
                        if (!currentSupplier) return;
                        updateSupplierDefaultsMutation.mutate({
                          supplierId: currentSupplier.id,
                          suppressDefaultsPrompt: true,
                        }, {
                          onSuccess: () => setDefaultsPromptDismissed(true),
                        });
                      }}
                      data-testid="button-suppress-supplier-defaults"
                    >
                      Don't ask for this supplier
                    </Button>
                  </div>
                </div>
              )}

              {showUpdateDefaultsPrompt && currentSupplier && (
                <div className="flex flex-wrap items-center gap-2 px-3 py-2 border-b bg-muted/20 text-table" data-testid="prompt-update-supplier-defaults">
                  <span className="text-muted-foreground">
                    You changed the coding for{" "}
                    <span className="font-medium text-foreground">{currentSupplier.name}</span>.
                    Update the saved default?
                  </span>
                  <div className="flex items-center gap-1 ml-auto">
                    <Button
                      type="button"
                      size="sm"
                      variant="default"
                      className="h-6 text-table px-2"
                      disabled={updateSupplierDefaultsMutation.isPending}
                      onClick={() => {
                        const billCostCode = mostUsed(lineItems.map(li => li.costCodeId || ""));
                        const billAccount = mostUsed(lineItems.map(li => li.account || ""));
                        const patch: { supplierId: string; defaultCostCodeId?: string; xeroDefaultAccountCode?: string } = {
                          supplierId: currentSupplier.id,
                        };
                        if (billCostCode && billCostCode !== supplierDefaultCostCode) patch.defaultCostCodeId = billCostCode;
                        if (billAccount && billAccount !== supplierDefaultAccountCode && xeroAccounts.length > 0) patch.xeroDefaultAccountCode = billAccount;
                        updateSupplierDefaultsMutation.mutate(patch, {
                          onSuccess: () => {
                            toast({ title: "Default updated", description: `${currentSupplier.name} will use the new coding next time.` });
                            setShowUpdateDefaultsPrompt(false);
                            setLocation(projectId ? `/projects/${projectId}/bills` : "/bills");
                          },
                        });
                      }}
                      data-testid="button-update-supplier-defaults"
                    >
                      Update default
                    </Button>
                    <Button
                      type="button"
                      size="sm"
                      variant="ghost"
                      className="h-6 text-table px-2"
                      onClick={() => {
                        setShowUpdateDefaultsPrompt(false);
                        setLocation(projectId ? `/projects/${projectId}/bills` : "/bills");
                      }}
                      data-testid="button-keep-supplier-defaults"
                    >
                      Keep existing
                    </Button>
                  </div>
                </div>
              )}

              {selectedLineIndices.size > 0 && (
                <div className="flex items-center gap-2 px-3 py-1.5 bg-muted/30 border-b text-table">
                  <span className="text-muted-foreground">{selectedLineIndices.size} selected</span>
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    className="h-6 text-table px-2"
                    onClick={() => setBulkCostCodeOpen(true)}
                    data-testid="button-bulk-change-cost-code"
                  >
                    Change Cost Code
                  </Button>
                  <button
                    type="button"
                    className="text-muted-foreground hover:text-foreground ml-auto text-table"
                    onClick={() => setSelectedLineIndices(new Set())}
                  >
                    Clear selection
                  </button>
                </div>
              )}

              <div className="overflow-x-auto">
                <LineItemTable
                  fixedLayout
                  data={lineItems}
                  rowKey={(_item, index) => index}
                  rowTestId={(_item, index) => `row-line-item-${index}`}
                  rowCheckboxTestId={(_item, index) => `checkbox-line-${index}`}
                  selectAllTestId="checkbox-select-all-lines"
                  selection={{
                    selectedKeys: selectedLineIndices as Set<string | number>,
                    onChange: (next) => setSelectedLineIndices(new Set(Array.from(next).map((k) => Number(k)))),
                  }}
                  columns={(() => {
                    const cols: LineItemColumn<LineItem>[] = [
                      {
                        key: "description", header: "Description", width: getColWidth("description"), truncate: false,
                        cell: (item, index) => (
                          <input
                            value={item.description}
                            onChange={(e) => updateLineItem(index, "description", e.target.value)}
                            placeholder="Description..."
                            className="w-full h-7 px-1.5 text-table bg-transparent border-0 outline-none focus:ring-1 focus:ring-ring rounded-sm"
                            data-testid={`input-description-${index}`}
                          />
                        ),
                      },
                      {
                        key: "costCode", header: "Cost Code", width: getColWidth("costCode"), truncate: false,
                        cell: (item, index) => (
                          <div className="flex items-center gap-1">
                            <div className="flex-1 min-w-0">
                              <CostCodeSelect
                                value={item.costCodeId || ""}
                                onValueChange={(value) => updateLineItem(index, "costCodeId", value)}
                                placeholder="Select..."
                                triggerClassName="border-0 shadow-none bg-transparent text-table"
                                data-testid={`select-cost-code-${index}`}
                              />
                            </div>
                            {supplierDefaultCostCode && item.costCodeId === supplierDefaultCostCode && (
                              <span className="text-label text-muted-foreground px-1 py-px rounded bg-muted/40 shrink-0" title="Supplier default" data-testid={`badge-cost-code-default-${index}`}>default</span>
                            )}
                          </div>
                        ),
                      },
                      {
                        key: "qty", header: "Qty", align: "right", width: getColWidth("qty"), truncate: false,
                        cell: (item, index) => (
                          <input
                            type="number"
                            value={item.quantity}
                            onChange={(e) => updateLineItem(index, "quantity", parseFloat(e.target.value) || 0)}
                            className="w-full h-7 px-1.5 text-table text-right bg-transparent border-0 outline-none focus:ring-1 focus:ring-ring rounded-sm"
                            data-testid={`input-quantity-${index}`}
                          />
                        ),
                      },
                      {
                        key: "unit", header: "Unit", width: getColWidth("unit"), truncate: false,
                        cell: (item, index) => (
                          <input
                            value={item.unit}
                            onChange={(e) => updateLineItem(index, "unit", e.target.value)}
                            placeholder="Unit"
                            className="w-full h-7 px-1.5 text-table bg-transparent border-0 outline-none focus:ring-1 focus:ring-ring rounded-sm"
                            data-testid={`input-unit-${index}`}
                          />
                        ),
                      },
                      {
                        key: "tax", header: "Tax", width: getColWidth("tax"), truncate: false,
                        cell: (item, index) => (
                          <Select value={item.tax} onValueChange={(value) => updateLineItem(index, "tax", value)}>
                            <SelectTrigger className="text-table border-0 shadow-none bg-transparent" data-testid={`select-tax-${index}`}>
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="GST on expenses">GST on Expenses</SelectItem>
                              <SelectItem value="No GST">GST Free Expenses</SelectItem>
                            </SelectContent>
                          </Select>
                        ),
                      },
                      {
                        key: "account", header: "Account", width: getColWidth("account"), truncate: false,
                        cell: (item, index) => (
                          <div className="flex items-center gap-1">
                            <div className="flex-1 min-w-0">
                              {xeroAccounts.length > 0 ? (
                                <Popover
                                  open={accountPickerOpenIndex === index}
                                  onOpenChange={(open) => {
                                    setAccountPickerOpenIndex(open ? index : null);
                                    if (!open) setAccountPickerSearch("");
                                  }}
                                >
                                  <PopoverTrigger asChild>
                                    <button
                                      type="button"
                                      className="w-full h-7 px-1.5 text-table bg-transparent border-0 outline-none focus:ring-1 focus:ring-ring rounded-sm text-left truncate hover-elevate"
                                      data-testid={`select-account-${index}`}
                                    >
                                      {(() => {
                                        const acc = xeroAccounts.find((a) => a.code === item.account);
                                        if (acc) return `${acc.code} - ${acc.name}`;
                                        return item.account || (
                                          <span className="text-muted-foreground">Select account...</span>
                                        );
                                      })()}
                                    </button>
                                  </PopoverTrigger>
                                  <PopoverContent className="p-0 w-[--radix-popover-trigger-width] min-w-[280px]" align="start">
                                    <Command shouldFilter={true}>
                                      <CommandInput
                                        placeholder="Search accounts..."
                                        value={accountPickerSearch}
                                        onValueChange={setAccountPickerSearch}
                                        data-testid={`input-account-search-${index}`}
                                      />
                                      <CommandList className="max-h-[260px]">
                                        <CommandEmpty>No accounts found.</CommandEmpty>
                                        <CommandGroup>
                                          <CommandItem
                                            value="__none__ none clear"
                                            onSelect={() => {
                                              updateLineItem(index, "account", "");
                                              setAccountPickerOpenIndex(null);
                                              setAccountPickerSearch("");
                                            }}
                                            data-testid={`option-account-${index}-none`}
                                          >
                                            <span className="text-muted-foreground">None</span>
                                          </CommandItem>
                                          {xeroAccounts.map((acc) => (
                                            <CommandItem
                                              key={acc.code}
                                              value={`${acc.code} ${acc.name}`}
                                              onSelect={() => {
                                                updateLineItem(index, "account", acc.code);
                                                setAccountPickerOpenIndex(null);
                                                setAccountPickerSearch("");
                                              }}
                                              data-testid={`option-account-${index}-${acc.code}`}
                                            >
                                              <span className="truncate">{acc.code} - {acc.name}</span>
                                            </CommandItem>
                                          ))}
                                        </CommandGroup>
                                      </CommandList>
                                    </Command>
                                  </PopoverContent>
                                </Popover>
                              ) : (
                                <input
                                  value={item.account}
                                  onChange={(e) => updateLineItem(index, "account", e.target.value)}
                                  placeholder="Account"
                                  className="w-full h-7 px-1.5 text-table bg-transparent border-0 outline-none focus:ring-1 focus:ring-ring rounded-sm"
                                  data-testid={`input-account-${index}`}
                                />
                              )}
                            </div>
                            {supplierDefaultAccountCode && item.account === supplierDefaultAccountCode && (
                              <span className="text-label text-muted-foreground px-1 py-px rounded bg-muted/40 shrink-0" title="Supplier default" data-testid={`badge-account-default-${index}`}>default</span>
                            )}
                          </div>
                        ),
                      },
                      {
                        key: "unitCost",
                        header: taxMode === "inclusive" ? "Unit Cost (inc GST)" : "Unit Cost (ex GST)",
                        align: "right", width: getColWidth("unitCost"), truncate: false,
                        cell: (item, index) => (
                          <input
                            type="number"
                            value={item.unitPrice}
                            onChange={(e) => updateLineItem(index, "unitPrice", parseFloat(e.target.value) || 0)}
                            className="w-full h-7 px-1.5 text-table text-right bg-transparent border-0 outline-none focus:ring-1 focus:ring-ring rounded-sm"
                            data-testid={`input-amount-${index}`}
                          />
                        ),
                      },
                    ];
                    if (visibleAmountCols.exTax) {
                      cols.push({
                        key: "exTax", header: "Amt ex Tax", align: "right", width: getColWidth("exTax"),
                        className: "text-muted-foreground",
                        cell: (item) => formatCurrency(getLineExTax(item)),
                      });
                    }
                    if (visibleAmountCols.tax) {
                      cols.push({
                        key: "amtTax", header: "Amt Tax", align: "right", width: getColWidth("amtTax"),
                        className: "text-muted-foreground",
                        cell: (item) => formatCurrency(getLineTax(item)),
                      });
                    }
                    if (visibleAmountCols.incTax) {
                      cols.push({
                        key: "incTax", header: "Amt inc Tax", align: "right", width: getColWidth("incTax"),
                        className: "text-muted-foreground",
                        cell: (item) => formatCurrency(getLineIncTax(item)),
                      });
                    }
                    cols.push({
                      key: "allowance", header: "Allowance", width: getColWidth("allowance"), truncate: false,
                      cell: (item, index) => (
                        <Select
                          value={item.allowanceItemId || "none"}
                          onValueChange={(value) => {
                            if (value === "none") {
                              updateLineItem(index, "appliesToAllowances", false);
                              updateLineItem(index, "allowanceItemId", undefined);
                            } else {
                              updateLineItem(index, "appliesToAllowances", true);
                              updateLineItem(index, "allowanceItemId", value);
                            }
                          }}
                        >
                          <SelectTrigger className="text-table border-0 shadow-none bg-transparent" data-testid={`select-allowance-${index}`}>
                            <SelectValue placeholder="None" />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="none">None</SelectItem>
                            {allowances.map((allowance) => (
                              <SelectItem key={allowance.id} value={allowance.id}>
                                {allowance.description} ({allowance.itemType})
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      ),
                    });
                    return cols;
                  })()}
                  actions={(_item, index) => (
                    <button
                      type="button"
                      onClick={() => deleteLineItem(index)}
                      className="p-1 rounded-sm text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-colors"
                      data-testid={`button-delete-line-${index}`}
                    >
                      <Trash2 className="h-3 w-3" />
                    </button>
                  )}
                />
              </div>

              <div className="px-3 py-1.5 border-t">
                <button
                  type="button"
                  onClick={addLineItem}
                  className="flex items-center gap-1 text-table text-muted-foreground hover:text-foreground transition-colors py-1"
                  data-testid="button-add-line"
                >
                  <Plus className="h-3 w-3" />
                  Add line
                </button>
              </div>

              <div className="border-t px-3 py-2">
                <div className="flex justify-end">
                  <div className="w-60 space-y-1">
                    <div className="flex justify-between gap-4 text-xs">
                      <span className="text-muted-foreground">Subtotal</span>
                      <span className="font-medium" data-testid="text-subtotal">
                        {formatCurrency(calculateSubtotal())}
                      </span>
                    </div>
                    <div className="flex justify-between gap-4 text-xs">
                      <span className="text-muted-foreground">Tax (GST)</span>
                      <span className="font-medium" data-testid="text-tax">
                        {formatCurrency(calculateTax())}
                      </span>
                    </div>
                    <div className="flex justify-between gap-4 border-t pt-1">
                      <span className="text-sm font-bold">Total</span>
                      <span className="text-sm font-bold" data-testid="text-total">
                        {formatCurrency(total)}
                      </span>
                    </div>
                    <FormField
                      control={form.control}
                      name="paidAmount"
                      render={({ field }) => (
                        <FormItem>
                          <div className="flex justify-between items-center gap-4">
                            <FormLabel className="text-xs">Paid</FormLabel>
                            <FormControl>
                              <input
                                type="number"
                                value={field.value}
                                onChange={(e) =>
                                  field.onChange(parseFloat(e.target.value) || 0)
                                }
                                className="w-28 h-7 px-1.5 text-xs text-right bg-transparent border rounded-sm outline-none focus:ring-1 focus:ring-ring"
                                data-testid="input-paid"
                              />
                            </FormControl>
                          </div>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                    <div className="flex justify-between gap-4 text-sm font-bold text-primary border-t pt-1">
                      <span>Due</span>
                      <span data-testid="text-due">{formatCurrency(due)}</span>
                    </div>
                  </div>
                </div>
              </div>
            </Card>

                {isEditMode && approvals.length > 0 && (
                  <Card className="p-3">
                    <h3 className="text-xs font-semibold mb-2">Approval History</h3>
                    <div className="space-y-1.5">
                      {approvals.map((approval) => (
                        <div
                          key={approval.id}
                          className="flex items-start gap-2 p-2 border rounded-md"
                          data-testid={`approval-history-${approval.id}`}
                        >
                          <div className="flex-1">
                            <div className="flex items-center gap-1.5">
                              <span className="text-xs font-medium">
                                {approval.approvedById}
                              </span>
                              <span
                                className={`inline-flex items-center px-1.5 py-0.5 rounded-full text-data font-medium ${
                                  approval.status === "approved"
                                    ? "bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200"
                                    : "bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200"
                                }`}
                              >
                                {approval.status === "approved" ? "Approved" : "Rejected"}
                              </span>
                            </div>
                            {approval.comments && (
                              <p className="text-table text-muted-foreground mt-0.5">
                                {approval.comments}
                              </p>
                            )}
                            <p className="text-data text-muted-foreground mt-0.5">
                              {format(new Date(approval.createdAt), "PPp")}
                            </p>
                          </div>
                        </div>
                      ))}
                    </div>
                  </Card>
                )}

                <div className="flex items-center justify-between gap-3">
                  <div>
                    {isEditMode && bill?.status === "draft" && (() => {
                      const validation = getSubmitForApprovalValidation();
                      return !validation.isValid ? (
                        <div className="text-table text-destructive space-y-0.5" data-testid="text-submit-validation-errors">
                          {validation.errors.map((error, index) => (
                            <div key={index}>{error}</div>
                          ))}
                        </div>
                      ) : null;
                    })()}
                  </div>
                  <div className="flex items-center gap-2">
                    {isEditMode && (bill as any)?.xeroInvoiceId && (
                      <div className="text-table text-muted-foreground" data-testid="text-xero-sync-status">
                        {(bill as any)?.xeroLastSyncStatus === "success" && (bill as any)?.xeroLastSyncAt && (
                          <span>Synced {format(new Date((bill as any).xeroLastSyncAt), "dd MMM HH:mm")}</span>
                        )}
                        {(bill as any)?.xeroLastSyncStatus === "failed" && (
                          <span className="text-destructive" title={(bill as any)?.xeroLastSyncError || ""}>
                            Sync error: {((bill as any)?.xeroLastSyncError || "unknown").slice(0, 60)}
                          </span>
                        )}
                      </div>
                    )}
                    {isEditMode && (bill as any)?.xeroInvoiceId && xeroStatus?.connected && bill?.status !== "paid" && (
                      <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        onClick={() => syncBillPaymentMutation.mutate()}
                        disabled={syncBillPaymentMutation.isPending}
                        className="gap-1.5"
                        data-testid="button-sync-bill-from-xero"
                      >
                        {syncBillPaymentMutation.isPending ? (
                          <Loader2 className="w-3.5 h-3.5 animate-spin" />
                        ) : (
                          <RefreshCw className="w-3.5 h-3.5" />
                        )}
                        Sync from Xero
                      </Button>
                    )}
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() => setLocation(projectId ? `/projects/${projectId}/bills` : "/bills")}
                      data-testid="button-cancel"
                    >
                      Cancel
                    </Button>
                    {isEditMode && (bill?.status === "draft" || bill?.status === "needs_review") && (() => {
                      const validation = getSubmitForApprovalValidation();
                      const isNeedsReview = bill?.status === "needs_review";
                      const handler = () =>
                        isNeedsReview
                          ? confirmExtractionMutation.mutate()
                          : submitForApprovalMutation.mutate();
                      const pending =
                        isNeedsReview
                          ? confirmExtractionMutation.isPending
                          : submitForApprovalMutation.isPending;
                      return (
                        <Button
                          type="button"
                          variant="default"
                          size="sm"
                          onClick={handler}
                          disabled={!validation.isValid || pending}
                          data-testid={isNeedsReview ? "button-confirm-extraction" : "button-submit-for-approval"}
                          className="gap-1"
                        >
                          <Send className="h-3.5 w-3.5" />
                          {pending
                            ? (isNeedsReview ? "Confirming..." : "Submitting...")
                            : (isNeedsReview ? "Confirm & Send for Approval" : "Submit for Approval")}
                        </Button>
                      );
                    })()}
                    <Button
                      type="submit"
                      size="sm"
                      disabled={
                        createMutation.isPending ||
                        updateMutation.isPending ||
                        ocrMutation.isPending ||
                        isUploadingAttachment
                      }
                      data-testid="button-save"
                    >
                      {createMutation.isPending || updateMutation.isPending
                        ? "Saving..."
                        : ocrMutation.isPending
                        ? "Processing invoice..."
                        : isUploadingAttachment
                        ? "Uploading..."
                        : "Save"}
                    </Button>
                  </div>
                </div>
          </form>
        </Form>
        </div>
        {sheetPreviewUrl && (
          <div className="w-[31vw] shrink-0 flex flex-col border-l bg-background">
            <div className="flex items-center justify-between px-3 py-2 border-b shrink-0 gap-2">
              <span className="text-sm font-medium truncate flex-1">{sheetPreviewFilename || "Attachment"}</span>
              <div className="flex items-center gap-1 shrink-0">
                <Button variant="ghost" size="icon" onClick={() => window.open(sheetPreviewUrl, '_blank')}>
                  <Maximize2 className="h-4 w-4" />
                </Button>
                <Button variant="ghost" size="icon" onClick={() => setSheetPreviewUrl(null)}>
                  <X className="h-4 w-4" />
                </Button>
              </div>
            </div>
            <div className="flex-1 overflow-hidden">
              <Suspense fallback={<div className="flex items-center justify-center h-full"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /></div>}>
                <DocumentPreview
                  src={sheetPreviewUrl}
                  mimeType={attachmentMeta[sheetPreviewUrl]?.mimeType}
                  filename={sheetPreviewFilename}
                  height="100%"
                  className="w-full h-full"
                />
              </Suspense>
            </div>
          </div>
        )}
      </div>

      <Dialog open={rejectDialogOpen} onOpenChange={setRejectDialogOpen}>
        <DialogContent data-testid="dialog-reject-bill">
          <DialogHeader>
            <DialogTitle>Reject Bill</DialogTitle>
            <DialogDescription>
              Please provide a reason for rejecting this bill.
            </DialogDescription>
          </DialogHeader>
          <Textarea
            value={rejectComments}
            onChange={(e) => setRejectComments(e.target.value)}
            placeholder="Enter rejection comments..."
            rows={4}
            data-testid="textarea-reject-comments"
          />
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => {
                setRejectDialogOpen(false);
                setRejectComments("");
              }}
              data-testid="button-cancel-reject"
            >
              Cancel
            </Button>
            <Button
              type="button"
              variant="destructive"
              onClick={() => rejectMutation.mutate(rejectComments)}
              disabled={!rejectComments.trim() || rejectMutation.isPending}
              data-testid="button-confirm-reject"
            >
              {rejectMutation.isPending ? "Rejecting..." : "Reject Bill"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog
        open={addSupplierDialogOpen}
        onOpenChange={(open) => {
          setAddSupplierDialogOpen(open);
          if (!open) {
            setOcrSupplierData(null);
          }
        }}
      >
        <DialogContent data-testid="dialog-add-supplier">
          <DialogHeader>
            <DialogTitle>Add Supplier</DialogTitle>
            <DialogDescription>
              Create a new supplier to use in this bill.
            </DialogDescription>
          </DialogHeader>
          <Form {...supplierForm}>
            <form onSubmit={supplierForm.handleSubmit((data) => createSupplierMutation.mutate(data))} className="space-y-4">
              <FormField
                control={supplierForm.control}
                name="name"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Name *</FormLabel>
                    <FormControl>
                      <Input {...field} placeholder="Supplier name" data-testid="input-supplier-name" />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={supplierForm.control}
                name="email"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Email</FormLabel>
                    <FormControl>
                      <Input {...field} type="email" placeholder="supplier@example.com" data-testid="input-supplier-email" />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={supplierForm.control}
                name="phone"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Phone</FormLabel>
                    <FormControl>
                      <Input {...field} placeholder="Phone number" data-testid="input-supplier-phone" />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={supplierForm.control}
                name="supplierType"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Type</FormLabel>
                    <Select onValueChange={field.onChange} value={field.value}>
                      <FormControl>
                        <SelectTrigger data-testid="select-supplier-type">
                          <SelectValue placeholder="Select type..." />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        <SelectItem value="supplier">Supplier</SelectItem>
                        <SelectItem value="trade">Trade</SelectItem>
                        <SelectItem value="subcontractor">Subcontractor</SelectItem>
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <DialogFooter>
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => {
                    setAddSupplierDialogOpen(false);
                    setOcrSupplierData(null);
                    supplierForm.reset();
                  }}
                  data-testid="button-cancel-add-supplier"
                >
                  Cancel
                </Button>
                <Button
                  type="submit"
                  disabled={createSupplierMutation.isPending}
                  data-testid="button-save-supplier"
                >
                  {createSupplierMutation.isPending ? "Adding..." : "Add Supplier"}
                </Button>
              </DialogFooter>
            </form>
          </Form>
        </DialogContent>
      </Dialog>

      <XeroContactLinkModal
        open={unmappedContactDialogOpen}
        onClose={() => {
          setUnmappedContactDialogOpen(false);
          setPendingXeroBillId(null);
          setUnmappedSupplierId(null);
        }}
        clientId={unmappedSupplierId}
        clientName={unmappedSupplierName}
        title="Link Supplier to Xero Contact"
        description={
          <>
            <span className="font-medium text-foreground">{unmappedSupplierName}</span> is not linked to a Xero contact. Pick the matching Xero contact (or create a new one) to continue sending this bill to Xero.
          </>
        }
        successMessage="Supplier linked. Sending bill to Xero…"
        onLinked={async (xeroContactId) => {
          const billIdToUse = pendingXeroBillId || id;
          if (!billIdToUse) {
            setUnmappedContactDialogOpen(false);
            setPendingXeroBillId(null);
            setUnmappedSupplierId(null);
            return;
          }
          try {
            await apiRequest("/api/xero/push-bill", "POST", {
              billId: billIdToUse,
              xeroContactId,
            });
            toast({ title: "Success", description: "Bill sent to Xero" });
            setUnmappedContactDialogOpen(false);
            setPendingXeroBillId(null);
            setUnmappedSupplierId(null);
            queryClient.invalidateQueries({ queryKey: ["/api/bills"] });
            queryClient.invalidateQueries({ queryKey: ["/api/bills", id] });
            setLocation(projectId ? `/projects/${projectId}/bills` : "/bills");
          } catch (e) {
            toast({
              title: "Error",
              description: formatXeroErrorDescription(e),
              variant: "destructive",
            });
          }
        }}
      />

      <Dialog open={bulkCostCodeOpen} onOpenChange={(open) => { setBulkCostCodeOpen(open); if (!open) setBulkCostCodeValue(""); }}>
        <DialogContent className="max-w-sm" data-testid="dialog-bulk-cost-code">
          <DialogHeader>
            <DialogTitle>Change Cost Code</DialogTitle>
            <DialogDescription>
              Apply a cost code to the {selectedLineIndices.size} selected item{selectedLineIndices.size !== 1 ? 's' : ''}.
            </DialogDescription>
          </DialogHeader>
          <div className="py-2">
            <CostCodeSelect
              value={bulkCostCodeValue}
              onValueChange={(v) => setBulkCostCodeValue(v || "")}
              placeholder="Select cost code..."
              data-testid="select-bulk-cost-code"
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => { setBulkCostCodeOpen(false); setBulkCostCodeValue(""); }}>Cancel</Button>
            <Button
              disabled={!bulkCostCodeValue}
              onClick={() => {
                const indices = Array.from(selectedLineIndices);
                setLineItems(prev => prev.map((item, i) =>
                  indices.includes(i) ? { ...item, costCodeId: bulkCostCodeValue } : item
                ));
                toast({
                  title: "Cost code updated",
                  description: `Cost code updated on ${indices.length} item${indices.length !== 1 ? 's' : ''}. Save the bill to persist.`,
                });
                setBulkCostCodeOpen(false);
                setBulkCostCodeValue("");
                setSelectedLineIndices(new Set());
              }}
              data-testid="button-apply-bulk-cost-code"
            >
              Apply
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={supplierDefaultsOpen} onOpenChange={setSupplierDefaultsOpen}>
        <DialogContent className="max-w-md" data-testid="dialog-supplier-defaults">
          <DialogHeader>
            <DialogTitle>Defaults for {currentSupplier?.name || "supplier"}</DialogTitle>
            <DialogDescription>
              These values will be auto-filled on new bill lines for this supplier. Existing values are never overwritten.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3 py-2">
            <div className="space-y-1">
              <label className="text-xs font-medium">Default Cost Code</label>
              <CostCodeSelect
                value={supplierDefaultsCostCode}
                onValueChange={(v) => setSupplierDefaultsCostCode(v || "")}
                placeholder="Select cost code..."
                allowNone={true}
                data-testid="select-supplier-defaults-cost-code"
              />
            </div>
            <div className="space-y-1">
              <label className="text-xs font-medium">Default Xero Account</label>
              {xeroAccounts.length > 0 ? (
                <Popover open={defaultsAccountPickerOpen} onOpenChange={(o) => { setDefaultsAccountPickerOpen(o); if (!o) setDefaultsAccountSearch(""); }}>
                  <PopoverTrigger asChild>
                    <Button type="button" variant="outline" size="sm" className="w-full justify-between text-xs font-normal" data-testid="select-supplier-defaults-account">
                      <span className={supplierDefaultsAccount ? "" : "text-muted-foreground"}>
                        {(() => {
                          const a = xeroAccounts.find(x => x.code === supplierDefaultsAccount);
                          return a ? `${a.code} - ${a.name}` : (supplierDefaultsAccount || "Select account...");
                        })()}
                      </span>
                      <ChevronsUpDown className="h-3.5 w-3.5 opacity-50 shrink-0" />
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="p-0 w-[--radix-popover-trigger-width] min-w-[280px]" align="start">
                    <Command shouldFilter={true}>
                      <CommandInput placeholder="Search accounts..." value={defaultsAccountSearch} onValueChange={setDefaultsAccountSearch} />
                      <CommandList className="max-h-[260px]">
                        <CommandEmpty>No accounts found.</CommandEmpty>
                        <CommandGroup>
                          <CommandItem value="__none__ none clear" onSelect={() => { setSupplierDefaultsAccount(""); setDefaultsAccountPickerOpen(false); setDefaultsAccountSearch(""); }}>
                            <span className="text-muted-foreground">None</span>
                          </CommandItem>
                          {xeroAccounts.map((acc) => (
                            <CommandItem key={acc.code} value={`${acc.code} ${acc.name}`} onSelect={() => { setSupplierDefaultsAccount(acc.code); setDefaultsAccountPickerOpen(false); setDefaultsAccountSearch(""); }}>
                              <span className="truncate">{acc.code} - {acc.name}</span>
                            </CommandItem>
                          ))}
                        </CommandGroup>
                      </CommandList>
                    </Command>
                  </PopoverContent>
                </Popover>
              ) : (
                <Input
                  value={supplierDefaultsAccount}
                  onChange={(e) => setSupplierDefaultsAccount(e.target.value)}
                  placeholder="Account code"
                  className="text-xs"
                />
              )}
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setSupplierDefaultsOpen(false)}>Cancel</Button>
            <Button
              disabled={!currentSupplier || updateSupplierDefaultsMutation.isPending}
              onClick={() => {
                if (!currentSupplier) return;
                updateSupplierDefaultsMutation.mutate({
                  supplierId: currentSupplier.id,
                  defaultCostCodeId: supplierDefaultsCostCode || null,
                  xeroDefaultAccountCode: supplierDefaultsAccount || null,
                }, {
                  onSuccess: () => {
                    toast({ title: "Defaults saved" });
                    setSupplierDefaultsOpen(false);
                  },
                });
              }}
              data-testid="button-save-defaults"
            >
              Save defaults
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>


      <AlertDialog
        open={!!duplicateWarning}
        onOpenChange={(open) => {
          if (!open) {
            setDuplicateWarning(null);
            pendingSubmitDataRef.current = null;
          }
        }}
      >
        <AlertDialogContent data-testid="dialog-duplicate-bill-warning">
          <AlertDialogHeader>
            <AlertDialogTitle>Possible duplicate bill</AlertDialogTitle>
            <AlertDialogDescription>
              A bill with reference{" "}
              <span className="font-medium">"{duplicateWarning?.reference}"</span>
              {duplicateWarning?.existingBillNumber
                ? <> already exists ({duplicateWarning.existingBillNumber}).</>
                : <> already exists.</>}
              {" "}This is likely a duplicate. Do you still want to save it?
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel
              onClick={() => {
                pendingSubmitDataRef.current = null;
              }}
              data-testid="button-duplicate-cancel"
            >
              Cancel
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                const data = pendingSubmitDataRef.current;
                pendingSubmitDataRef.current = null;
                setDuplicateWarning(null);
                if (data) performSubmit(data);
              }}
              data-testid="button-duplicate-confirm"
            >
              Save anyway
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <Dialog
        open={unmatchedSupplierDialogOpen}
        onOpenChange={(open) => {
          setUnmatchedSupplierDialogOpen(open);
          if (!open) {
            setUnmatchedSupplierSelection("");
            setUnmatchedSearchText("");
            setUnmatchedPickerOpen(false);
            setOcrSupplierSuggestion(null);
          }
        }}
      >
        <DialogContent data-testid="dialog-unmatched-supplier">
          <DialogHeader>
            <DialogTitle>Supplier not found</DialogTitle>
            <DialogDescription>
              We couldn't confidently match the supplier on this invoice to one of your existing contacts. Pick an existing supplier or create a new one.
            </DialogDescription>
          </DialogHeader>
          {ocrSupplierData && (
            <div className="rounded-md border bg-muted/30 p-3 text-xs space-y-1" data-testid="card-ocr-supplier-details">
              <div className="text-muted-foreground uppercase tracking-wide text-data mb-1">From invoice</div>
              <div><span className="text-muted-foreground">Name:</span> <span className="font-medium">{ocrSupplierData.name}</span></div>
              {ocrSupplierData.email && (
                <div><span className="text-muted-foreground">Email:</span> <span>{ocrSupplierData.email}</span></div>
              )}
              {ocrSupplierData.phone && (
                <div><span className="text-muted-foreground">Phone:</span> <span>{ocrSupplierData.phone}</span></div>
              )}
            </div>
          )}
          <div className="space-y-3 py-2">
            <div>
              <label className="text-xs font-medium mb-1 block">Existing supplier</label>
              <Popover
                open={unmatchedPickerOpen}
                onOpenChange={(open) => {
                  setUnmatchedPickerOpen(open);
                  if (!open) setUnmatchedSearchText("");
                }}
              >
                <PopoverTrigger asChild>
                  <Button
                    type="button"
                    variant="outline"
                    role="combobox"
                    className="w-full justify-between font-normal"
                    data-testid="select-unmatched-supplier"
                  >
                    <span className={unmatchedSupplierSelection ? "" : "text-muted-foreground"}>
                      {suppliers.find((s: any) => s.id === unmatchedSupplierSelection)?.name || "Select supplier..."}
                    </span>
                    <ChevronsUpDown className="h-3.5 w-3.5 opacity-50 shrink-0" />
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="p-0 w-[--radix-popover-trigger-width] min-w-[320px]" align="start">
                  <Command shouldFilter={true}>
                    <CommandInput
                      placeholder="Search suppliers..."
                      value={unmatchedSearchText}
                      onValueChange={setUnmatchedSearchText}
                      data-testid="input-unmatched-supplier-search"
                    />
                    <CommandList className="max-h-[260px]">
                      <CommandEmpty>No suppliers found.</CommandEmpty>
                      {ocrSupplierSuggestion && !unmatchedSearchText.trim() && (
                        <CommandGroup heading="Best guess">
                          <CommandItem
                            value={`__suggest__ ${ocrSupplierSuggestion.name}`}
                            onSelect={() => {
                              setUnmatchedSupplierSelection(ocrSupplierSuggestion.id);
                              setUnmatchedPickerOpen(false);
                              setUnmatchedSearchText("");
                            }}
                            data-testid="option-unmatched-supplier-suggestion"
                          >
                            <span className="truncate flex-1">{ocrSupplierSuggestion.name}</span>
                            <span className="ml-2 text-data text-muted-foreground shrink-0">
                              {Math.round(ocrSupplierSuggestion.confidence * 100)}%
                            </span>
                          </CommandItem>
                        </CommandGroup>
                      )}
                      <CommandGroup heading="All suppliers">
                        {suppliers.map((s: any) => (
                          <CommandItem
                            key={s.id}
                            value={s.name}
                            onSelect={() => {
                              setUnmatchedSupplierSelection(s.id);
                              setUnmatchedPickerOpen(false);
                              setUnmatchedSearchText("");
                            }}
                            data-testid={`option-unmatched-supplier-${s.id}`}
                          >
                            <span className="truncate">{s.name}</span>
                          </CommandItem>
                        ))}
                      </CommandGroup>
                    </CommandList>
                    <div className="border-t p-1 bg-popover sticky bottom-0">
                      <button
                        type="button"
                        onMouseDown={(e) => {
                          e.preventDefault();
                          // Prefer typed search text over OCR seed if user has typed
                          if (unmatchedSearchText.trim()) {
                            setOcrSupplierData({
                              ...(ocrSupplierData || {}),
                              name: unmatchedSearchText.trim(),
                            });
                          }
                          setUnmatchedPickerOpen(false);
                          setUnmatchedSupplierDialogOpen(false);
                          setAddSupplierDialogOpen(true);
                        }}
                        className="w-full flex items-center gap-2 px-2 py-1.5 text-xs text-primary hover-elevate rounded-sm"
                        data-testid="button-unmatched-create-inline"
                      >
                        <Plus className="h-3 w-3" />
                        {unmatchedSearchText.trim()
                          ? `Create "${unmatchedSearchText.trim()}"`
                          : ocrSupplierData?.name
                          ? `Create "${ocrSupplierData.name}"`
                          : "Create new contact"}
                      </button>
                    </div>
                  </Command>
                </PopoverContent>
              </Popover>
            </div>
          </div>
          <DialogFooter className="gap-2 sm:gap-2 flex-wrap">
            <Button
              variant="outline"
              onClick={() => {
                setUnmatchedSupplierDialogOpen(false);
                setUnmatchedSupplierSelection("");
              }}
              data-testid="button-unmatched-skip"
            >
              Skip
            </Button>
            <Button
              variant="secondary"
              onClick={() => {
                setUnmatchedSupplierDialogOpen(false);
                setAddSupplierDialogOpen(true);
              }}
              data-testid="button-unmatched-create"
            >
              <Plus className="h-3.5 w-3.5 mr-1" />
              Create new contact
            </Button>
            <Button
              onClick={async () => {
                if (unmatchedSupplierSelection) {
                  form.setValue("supplierId", unmatchedSupplierSelection);
                  // Save the name mapping so future invoices with the same name auto-match
                  if (ocrSupplierData?.name) {
                    try {
                      await fetch("/api/supplier-name-mappings", {
                        method: "POST",
                        headers: { "Content-Type": "application/json" },
                        body: JSON.stringify({
                          invoiceNameString: ocrSupplierData.name,
                          supplierId: unmatchedSupplierSelection,
                        }),
                      });
                    } catch {
                      // Non-fatal — mapping save failure shouldn't block the user
                    }
                  }
                }
                setUnmatchedSupplierDialogOpen(false);
                setUnmatchedSupplierSelection("");
              }}
              disabled={!unmatchedSupplierSelection}
              data-testid="button-unmatched-use-existing"
            >
              Use selected
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
