import { useEffect, useState, useRef } from "react";
import { useParams, useLocation } from "wouter";
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
  Send,
  Upload,
  FileText,
  Loader2,
  ChevronDown,
  Settings2,
  Eye,
  Maximize2
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
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
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import { useToast } from "@/hooks/use-toast";
import { useUpload } from "@/hooks/use-upload";
import { Badge } from "@/components/ui/badge";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { CostCodeSelect } from "@/components/CostCodeSelect";
import type { Bill, Supplier, Project, CostCode, BillLineItem, BillApproval, BillLineItemAllowance, EstimateItem } from "@shared/schema";

const billFormSchema = z.object({
  billNumber: z.string().min(1, "Bill number is required"),
  projectId: z.string().min(1, "Project is required"),
  supplierId: z.string().min(1, "Supplier is required"),
  billType: z.enum(["bill", "credit"]).default("bill"),
  status: z.enum(["draft", "awaiting_approval", "awaiting_payment", "paid"]).default("draft"),
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
  const [previewAttachment, setPreviewAttachment] = useState<string | null>(null);
  const [fullscreenPreview, setFullscreenPreview] = useState(false);
  const dueDateManuallySet = useRef(false);
  const [visibleAmountCols, setVisibleAmountCols] = useState<{ exTax: boolean; tax: boolean; incTax: boolean }>({ exTax: false, tax: false, incTax: false });
  const [columnWidths, setColumnWidths] = useState<Record<string, number>>({});
  const [colMenuOpen, setColMenuOpen] = useState(false);
  const resizingCol = useRef<{ key: string; startX: number; startW: number } | null>(null);
  const [unmappedContactDialogOpen, setUnmappedContactDialogOpen] = useState(false);
  const [unmappedSupplierName, setUnmappedSupplierName] = useState("");
  const [selectedXeroContactId, setSelectedXeroContactId] = useState("");
  const [pendingXeroBillId, setPendingXeroBillId] = useState<number | null>(null);

  const { data: bill, isLoading: billLoading } = useQuery<Bill>({
    queryKey: ["/api/bills", id],
    enabled: isEditMode,
  });

  const { data: existingLineItems = [] } = useQuery<BillLineItem[]>({
    queryKey: ["/api/bills", id, "line-items"],
    enabled: isEditMode,
  });

  const { data: projects = [] } = useQuery<Project[]>({
    queryKey: ["/api/projects"],
  });

  const { data: businessProject } = useQuery<Project>({
    queryKey: ["/api/projects/business"],
  });

  const { data: suppliers = [] } = useQuery<any[]>({
    queryKey: ["/api/contacts", { contactType: "supplier" }],
    queryFn: async () => {
      const res = await fetch("/api/contacts?contactType=supplier", { credentials: "include" });
      if (!res.ok) throw new Error("Failed to fetch suppliers");
      return res.json();
    },
  });

  const { data: costCodes = [] } = useQuery<CostCode[]>({
    queryKey: ["/api/cost-codes"],
  });

  const { data: xeroContacts = [] } = useQuery<Array<{ contactId: string; name: string; emailAddress?: string }>>({
    queryKey: ["/api/xero/contacts"],
    enabled: unmappedContactDialogOpen,
  });

  const { data: xeroAccounts = [] } = useQuery<Array<{ code: string; name: string; type: string; accountId: string }>>({
    queryKey: ["/api/xero/accounts"],
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

  const { data: existingAllowances = [] } = useQuery<any[]>({
    queryKey: ["/api/bills", id, "line-item-allowances"],
    enabled: isEditMode,
  });

  useEffect(() => {
    if (bill && isEditMode) {
      form.reset({
        billNumber: bill.billNumber,
        projectId: bill.projectId,
        supplierId: bill.supplierId,
        billType: bill.billType as "bill" | "credit",
        status: bill.status as "draft" | "awaiting_approval" | "awaiting_payment" | "paid",
        billDate: bill.billDate ? format(new Date(bill.billDate), "yyyy-MM-dd") : "",
        dueDate: bill.dueDate ? format(new Date(bill.dueDate), "yyyy-MM-dd") : "",
        billReference: bill.billReference || "",
        notes: bill.notes || "",
        reminders: bill.reminders || "",
        paidAmount: bill.paidAmount / 100,
        sendToXero: bill.sendToXero,
      });
      setAttachmentUrls(Array.isArray(bill.attachmentUrls) ? (bill.attachmentUrls as string[]) : []);
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
  }, [existingLineItems, existingAllowances, isEditMode]);

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

  const { data: companySettings } = useQuery<any>({
    queryKey: ["/api/company-settings"],
  });

  const { uploadFile, isUploading: isUploadingAttachment } = useUpload({
    onSuccess: (response) => {
      setAttachmentUrls(prev => [...prev, response.objectPath]);
    },
  });

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
    if (defaultAccount) {
      setLineItems(prev => prev.map(item => 
        !item.account ? { ...item, account: defaultAccount } : item
      ));
    }
  }, [watchedSupplierId, suppliers, isEditMode]);

  const getSupplierDefaultAccount = () => {
    const supplierId = form.getValues("supplierId");
    if (!supplierId) return "";
    const supplier = suppliers.find(s => s.id === supplierId);
    return supplier?.xeroDefaultAccountCode || supplier?.xeroDefaultAccount || "";
  };

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
    
    if (taxMode === "inclusive") {
      const taxableTotal = taxableItems.reduce((sum, item) => sum + item.total, 0);
      return taxableTotal / 11;
    }
    
    const taxableAmount = taxableItems.reduce((sum, item) => sum + item.total, 0);
    return taxableAmount * 0.1;
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
    if (taxMode === "inclusive" && item.tax === "GST on expenses") {
      return item.total - item.total / 11;
    }
    return item.total;
  };

  const getLineTax = (item: LineItem) => {
    if (item.tax !== "GST on expenses") return 0;
    if (taxMode === "inclusive") return item.total / 11;
    return item.total * 0.1;
  };

  const getLineIncTax = (item: LineItem) => {
    return getLineExTax(item) + getLineTax(item);
  };

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

  const getColWidth = (key: string) => columnWidths[key] || defaultColWidths[key] || 100;

  const onResizeStart = (key: string, e: React.MouseEvent) => {
    e.preventDefault();
    const startX = e.clientX;
    const startW = getColWidth(key);
    resizingCol.current = { key, startX, startW };

    const onMouseMove = (ev: MouseEvent) => {
      if (!resizingCol.current) return;
      const diff = ev.clientX - resizingCol.current.startX;
      const newW = Math.max(40, resizingCol.current.startW + diff);
      setColumnWidths((prev) => ({ ...prev, [resizingCol.current!.key]: newW }));
    };

    const onMouseUp = () => {
      resizingCol.current = null;
      document.removeEventListener("mousemove", onMouseMove);
      document.removeEventListener("mouseup", onMouseUp);
    };

    document.addEventListener("mousemove", onMouseMove);
    document.addEventListener("mouseup", onMouseUp);
  };

  const createMutation = useMutation({
    mutationFn: async (data: BillFormData) => {
      const billData = {
        ...data,
        billDate: new Date(data.billDate),
        dueDate: data.dueDate ? new Date(data.dueDate) : undefined,
        subtotal: Math.round(calculateSubtotal() * 100),
        tax: Math.round(calculateTax() * 100),
        total: Math.round(calculateTotal() * 100),
        paidAmount: Math.round((data.paidAmount || 0) * 100),
        
        attachmentUrls,
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
              setPendingXeroBillId(newBill.id);
              setUnmappedContactDialogOpen(true);
              queryClient.invalidateQueries({ queryKey: ["/api/bills"] });
              toast({ title: "Bill created", description: "Please link the supplier to a Xero contact to complete the sync." });
              return;
            }
            throw new Error(errData.message || "Failed to push to Xero");
          }
          toast({ title: "Success", description: "Bill created and sent to Xero" });
        } catch (e: any) {
          toast({ title: "Bill created", description: e.message || "Bill saved but failed to send to Xero. You can retry from the bill.", variant: "destructive" });
        }
      } else {
        toast({ title: "Success", description: "Bill created successfully" });
      }
      queryClient.invalidateQueries({ queryKey: ["/api/bills"] });
      queryClient.invalidateQueries({ queryKey: ["/api/projects", form.getValues("projectId"), "allowances"] });
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
      queryClient.invalidateQueries({ queryKey: ["/api/contacts", { contactType: "supplier" }] });
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
        attachmentUrls,
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
              setPendingXeroBillId(Number(id));
              setUnmappedContactDialogOpen(true);
              queryClient.invalidateQueries({ queryKey: ["/api/bills"] });
              queryClient.invalidateQueries({ queryKey: ["/api/bills", id] });
              toast({ title: "Bill saved", description: "Please link the supplier to a Xero contact to complete the sync." });
              return;
            }
            throw new Error(errData.message || "Failed to push to Xero");
          }
          toast({ title: "Success", description: "Bill updated and sent to Xero" });
        } catch (e: any) {
          toast({ title: "Bill updated", description: e.message || "Bill saved but failed to send to Xero. You can retry later.", variant: "destructive" });
        }
      } else {
        toast({ title: "Success", description: "Bill updated successfully" });
      }
      queryClient.invalidateQueries({ queryKey: ["/api/bills"] });
      queryClient.invalidateQueries({ queryKey: ["/api/bills", id] });
      queryClient.invalidateQueries({ queryKey: ["/api/bills", id, "line-item-allowances"] });
      queryClient.invalidateQueries({ queryKey: ["/api/projects", form.getValues("projectId"), "allowances"] });
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
    onSuccess: async (data) => {
      setOcrResults(data);
      setOcrPreviewOpen(true);
      if (uploadedFile) {
        try {
          await uploadFile(uploadedFile);
        } catch (e) {
          console.error("Failed to auto-save attachment:", e);
        }
      }
      toast({
        title: "Success",
        description: "Invoice data extracted and saved as attachment",
      });
    },
    onError: (error: Error) => {
      toast({
        title: "Error",
        description: error.message || "Failed to process invoice with OCR",
        variant: "destructive",
      });
    },
  });

  const onSubmit = async (data: BillFormData) => {
    if (data.billReference) {
      try {
        const checkRes = await fetch(`/api/bills/check-reference?reference=${encodeURIComponent(data.billReference)}${isEditMode ? `&excludeBillId=${id}` : ''}`, { credentials: "include" });
        const checkData = await checkRes.json();
        if (checkData.exists) {
          const proceed = window.confirm(
            `A bill with reference "${data.billReference}" already exists (${checkData.existingBillNumber}). This is likely a duplicate. Do you still want to save?`
          );
          if (!proceed) return;
        }
      } catch (e) {
      }
    }

    if (isEditMode) {
      updateMutation.mutate(data);
    } else {
      createMutation.mutate(data);
    }
  };

  const handleAttachmentUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files) return;
    for (let i = 0; i < files.length; i++) {
      await uploadFile(files[i]);
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
      const searchName = ocrResults.supplierName.toLowerCase().trim();
      const matchedSupplier = suppliers.find((s: any) => {
        const company = (s.company || "").toLowerCase().trim();
        const name = (s.name || "").toLowerCase().trim();
        const fullName = `${s.firstName || ""} ${s.lastName || ""}`.toLowerCase().trim();
        return company === searchName || name === searchName || fullName === searchName
          || company.includes(searchName) || searchName.includes(company)
          || name.includes(searchName) || searchName.includes(name);
      });
      if (matchedSupplier) {
        form.setValue("supplierId", matchedSupplier.id);
      }
    }

    if (ocrResults.lineItems && ocrResults.lineItems.length > 0) {
      const firstCostCode = costCodes[0]?.id;
      const defaultAccount = getSupplierDefaultAccount();
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
      }));
      setLineItems(newLineItems);
    }

    toast({
      title: "Success",
      description: "OCR data applied to bill",
    });
  };

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

      <div className="flex-1 overflow-auto p-4">
        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-3">
            <div className="grid grid-cols-1 lg:grid-cols-[1fr_280px] gap-3">
              <Card className="p-4">
                <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
                  <FormField
                    control={form.control}
                    name="billNumber"
                    render={({ field }) => (
                      <FormItem className="space-y-1">
                        <FormLabel className="text-xs">Bill ID</FormLabel>
                        <FormControl>
                          <Input
                            {...field}
                            readOnly
                            className="bg-muted text-xs"
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
                        <FormLabel className="text-xs">Type</FormLabel>
                        <Select
                          onValueChange={field.onChange}
                          value={field.value}
                        >
                          <FormControl>
                            <SelectTrigger className="text-xs" data-testid="select-bill-type">
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
                    render={({ field }) => (
                      <FormItem className="space-y-1">
                        <FormLabel className="text-xs">Project *</FormLabel>
                        <Select
                          onValueChange={field.onChange}
                          value={field.value}
                          disabled={!isEditMode && !!projectId}
                        >
                          <FormControl>
                            <SelectTrigger className="text-xs" data-testid="select-project">
                              <SelectValue placeholder="Select project..." />
                            </SelectTrigger>
                          </FormControl>
                          <SelectContent>
                            {businessProject && (
                              <>
                                <SelectItem key={businessProject.id} value={businessProject.id}>
                                  {businessProject.name} (Business)
                                </SelectItem>
                                <div className="border-b border-border my-1" />
                              </>
                            )}
                            {projects.filter(p => !(p as any).isBusiness).map((project) => (
                              <SelectItem key={project.id} value={project.id}>
                                {project.name}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <FormField
                    control={form.control}
                    name="supplierId"
                    render={({ field }) => (
                      <FormItem className="space-y-1">
                        <FormLabel className="text-xs">Pay to *</FormLabel>
                        <Select
                          onValueChange={field.onChange}
                          value={field.value}
                        >
                          <FormControl>
                            <SelectTrigger className="text-xs" data-testid="select-supplier">
                              <SelectValue placeholder="Select supplier..." />
                            </SelectTrigger>
                          </FormControl>
                          <SelectContent>
                            {suppliers.map((supplier) => (
                              <SelectItem key={supplier.id} value={supplier.id}>
                                {supplier.name}
                              </SelectItem>
                            ))}
                            <div className="border-t mt-1 pt-1">
                              <button
                                type="button"
                                onClick={(e) => {
                                  e.preventDefault();
                                  e.stopPropagation();
                                  setAddSupplierDialogOpen(true);
                                }}
                                className="w-full flex items-center gap-2 px-2 py-1.5 text-xs text-primary hover:bg-accent rounded-sm"
                                data-testid="button-add-supplier"
                              >
                                <Plus className="h-3 w-3" />
                                Add
                              </button>
                            </div>
                          </SelectContent>
                        </Select>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <FormField
                    control={form.control}
                    name="billDate"
                    render={({ field }) => (
                      <FormItem className="space-y-1">
                        <FormLabel className="text-xs">Date *</FormLabel>
                        <FormControl>
                          <Input
                            type="date"
                            {...field}
                            className="text-xs"
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
                        <FormLabel className="text-xs">Due date</FormLabel>
                        <FormControl>
                          <Input
                            type="date"
                            {...field}
                            onChange={(e) => {
                              dueDateManuallySet.current = true;
                              field.onChange(e);
                            }}
                            className="text-xs"
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
                        <FormLabel className="text-xs">Reference</FormLabel>
                        <FormControl>
                          <Input
                            {...field}
                            placeholder="Enter reference..."
                            className="text-xs"
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
                        <FormLabel className="!mt-0 text-xs">Send to Xero</FormLabel>
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
                        <FormLabel className="text-xs">Notes</FormLabel>
                        <FormControl>
                          <Textarea
                            {...field}
                            placeholder="Add notes..."
                            rows={2}
                            className="text-xs resize-none"
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
                        <FormLabel className="text-xs">Reminders</FormLabel>
                        <FormControl>
                          <Textarea
                            {...field}
                            placeholder="Add reminders..."
                            rows={2}
                            className="text-xs resize-none"
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
                  <h3 className="text-xs font-semibold mb-2">Upload Invoice (OCR)</h3>
                  <div className="space-y-2">
                    {!uploadedFile ? (
                      <div
                        className="border-2 border-dashed rounded-md p-3 text-center hover-elevate cursor-pointer transition-colors"
                        onDrop={handleDrop}
                        onDragOver={(e) => e.preventDefault()}
                        onClick={() => document.getElementById('file-upload')?.click()}
                        data-testid="dropzone-upload"
                      >
                        <Upload className="h-5 w-5 mx-auto mb-1 text-muted-foreground" />
                        <p className="text-[10px] text-muted-foreground">
                          Drop or click to browse (PDF, JPG, PNG)
                        </p>
                        <input
                          id="file-upload"
                          type="file"
                          accept=".pdf,.jpg,.jpeg,.png"
                          onChange={handleFileUpload}
                          className="hidden"
                          data-testid="input-file-upload"
                        />
                      </div>
                    ) : (
                      <div className="space-y-2">
                        <div className="flex items-center justify-between p-2 border rounded-md" data-testid="card-uploaded-file">
                          <div className="flex items-center gap-1.5 min-w-0">
                            <FileText className="h-4 w-4 text-muted-foreground shrink-0" />
                            <div className="min-w-0">
                              <p className="text-xs font-medium truncate" data-testid="text-filename">{uploadedFile.name}</p>
                              <p className="text-[10px] text-muted-foreground" data-testid="text-filesize">
                                {formatFileSize(uploadedFile.size)}
                              </p>
                            </div>
                          </div>
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => {
                              setUploadedFile(null);
                              setOcrResults(null);
                              setOcrPreviewOpen(false);
                            }}
                            data-testid="button-remove-file"
                          >
                            <X className="h-3.5 w-3.5" />
                          </Button>
                        </div>

                        {!ocrResults && (
                          <Button
                            onClick={handleProcessOCR}
                            disabled={ocrMutation.isPending}
                            className="w-full"
                            size="sm"
                            data-testid="button-process-ocr"
                          >
                            {ocrMutation.isPending ? (
                              <>
                                <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" />
                                Reading bill...
                              </>
                            ) : (
                              <>
                                <Upload className="h-3.5 w-3.5 mr-1.5" />
                                Read with AI
                              </>
                            )}
                          </Button>
                        )}

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
                              <div className="border rounded-md p-2 space-y-1.5 text-[11px]">
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
                                        <div key={idx} className="flex justify-between p-1 bg-muted/50 rounded text-[10px]" data-testid={`text-ocr-line-item-${idx}`}>
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
                    )}
                  </div>
                </Card>

                <Card className="p-3">
                  <div className="space-y-3">
                    <div>
                      <div className="flex items-center justify-between mb-1.5">
                        <div className="flex items-center gap-1.5">
                          <Paperclip className="h-3.5 w-3.5 text-muted-foreground" />
                          <span className="text-xs font-medium">Attachments</span>
                          {attachmentUrls.length > 0 && (
                            <Badge variant="secondary" className="text-[10px] px-1">{attachmentUrls.length}</Badge>
                          )}
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
                          {previewAttachment && (
                            <div className="relative rounded-md border overflow-hidden bg-muted/20 mb-2">
                              <div className="flex items-center justify-between px-2 py-1 border-b bg-muted/30">
                                <span className="text-[10px] text-muted-foreground truncate">
                                  {decodeURIComponent(previewAttachment.split('/').pop() || 'Preview')}
                                </span>
                                <div className="flex items-center gap-0.5">
                                  <Button
                                    variant="ghost"
                                    size="icon"
                                    onClick={() => setFullscreenPreview(true)}
                                  >
                                    <Maximize2 className="h-3 w-3" />
                                  </Button>
                                  <Button
                                    variant="ghost"
                                    size="icon"
                                    onClick={() => setPreviewAttachment(null)}
                                  >
                                    <X className="h-3 w-3" />
                                  </Button>
                                </div>
                              </div>
                              {/\.(pdf)$/i.test(previewAttachment) ? (
                                <iframe
                                  src={previewAttachment}
                                  className="w-full h-[300px] border-0"
                                  title="PDF Preview"
                                />
                              ) : /\.(jpe?g|png|gif|webp|bmp|tiff?)$/i.test(previewAttachment) ? (
                                <img
                                  src={previewAttachment}
                                  alt="Attachment preview"
                                  className="w-full max-h-[300px] object-contain"
                                />
                              ) : (
                                <div className="flex items-center justify-center h-20 text-[11px] text-muted-foreground">
                                  Preview not available for this file type
                                </div>
                              )}
                            </div>
                          )}
                          {attachmentUrls.map((url, idx) => {
                            const fileName = url.split('/').pop() || `Attachment ${idx + 1}`;
                            const isImage = /\.(jpe?g|png|gif|webp|bmp|tiff?)$/i.test(url);
                            const isPdf = /\.(pdf)$/i.test(url);
                            const canPreview = isImage || isPdf;
                            const isActive = previewAttachment === url;
                            return (
                              <div key={idx} className={`flex items-center justify-between gap-1.5 p-1.5 rounded-md border text-[11px] ${isActive ? 'border-primary bg-primary/5' : ''}`}>
                                <button
                                  type="button"
                                  onClick={() => canPreview ? setPreviewAttachment(isActive ? null : url) : window.open(url, '_blank')}
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
                                  {canPreview && (
                                    <Button
                                      variant="ghost"
                                      size="icon"
                                      onClick={() => setPreviewAttachment(isActive ? null : url)}
                                    >
                                      <Eye className="h-3 w-3" />
                                    </Button>
                                  )}
                                  <Button
                                    variant="ghost"
                                    size="icon"
                                    onClick={() => {
                                      setAttachmentUrls(prev => prev.filter((_, i) => i !== idx));
                                      if (previewAttachment === url) setPreviewAttachment(null);
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
                        <p className="text-[10px] text-muted-foreground">No attachments</p>
                      )}
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
                          className="text-[10px] text-muted-foreground"
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
                        <div className="text-[11px] font-medium text-muted-foreground mb-1.5 px-1">Show columns</div>
                        {[
                          { key: "exTax" as const, label: "Amount ex Tax" },
                          { key: "tax" as const, label: "Amount Tax" },
                          { key: "incTax" as const, label: "Amount inc Tax" },
                        ].map(({ key, label }) => (
                          <label key={key} className="flex items-center gap-2 px-1 py-1 text-[11px] cursor-pointer rounded-sm hover-elevate">
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
                    <span className="text-[11px] text-muted-foreground">Amounts are</span>
                    <div className="inline-flex rounded-md border bg-muted/30 p-0.5" data-testid="select-tax-mode">
                      <button
                        type="button"
                        onClick={() => setTaxMode("exclusive")}
                        className={`px-2.5 py-0.5 text-[11px] rounded-sm transition-colors ${taxMode === "exclusive" ? "bg-background shadow-sm font-medium text-foreground" : "text-muted-foreground"}`}
                      >
                        Exclusive
                      </button>
                      <button
                        type="button"
                        onClick={() => setTaxMode("inclusive")}
                        className={`px-2.5 py-0.5 text-[11px] rounded-sm transition-colors ${taxMode === "inclusive" ? "bg-background shadow-sm font-medium text-foreground" : "text-muted-foreground"}`}
                      >
                        Inclusive
                      </button>
                    </div>
                    <span className="text-[11px] text-muted-foreground">of tax</span>
                  </div>
                </div>
              </div>

              <div className="overflow-x-auto">
                <table className="w-full text-[11px]" style={{ tableLayout: "fixed" }}>
                  <thead>
                    <tr className="border-b bg-muted/20">
                      {[
                        { key: "description", label: "Description", align: "left" },
                        { key: "costCode", label: "Cost Code", align: "left" },
                        { key: "qty", label: "Qty", align: "right" },
                        { key: "unit", label: "Unit", align: "left" },
                        { key: "tax", label: "Tax", align: "left" },
                        { key: "account", label: "Account", align: "left" },
                        { key: "unitCost", label: taxMode === "inclusive" ? "Unit Cost (inc GST)" : "Unit Cost (ex GST)", align: "right" },
                        ...(visibleAmountCols.exTax ? [{ key: "exTax", label: "Amt ex Tax", align: "right" as const }] : []),
                        ...(visibleAmountCols.tax ? [{ key: "amtTax", label: "Amt Tax", align: "right" as const }] : []),
                        ...(visibleAmountCols.incTax ? [{ key: "incTax", label: "Amt inc Tax", align: "right" as const }] : []),
                        { key: "allowance", label: "Allowance", align: "left" },
                      ].map((col) => (
                        <th
                          key={col.key}
                          className={`relative font-medium text-muted-foreground px-2 py-1.5 select-none group ${col.align === "right" ? "text-right" : "text-left"}`}
                          style={{ width: getColWidth(col.key), minWidth: col.key === "description" ? 100 : 40 }}
                        >
                          {col.label}
                          <div
                            className="absolute right-0 top-0 bottom-0 w-[5px] cursor-col-resize invisible group-hover:visible bg-primary/20"
                            onMouseDown={(e) => onResizeStart(col.key, e)}
                            data-testid={`resize-${col.key}`}
                          />
                        </th>
                      ))}
                      <th className="w-[32px] px-1 py-1.5"></th>
                    </tr>
                  </thead>
                  <tbody>
                    {lineItems.map((item, index) => (
                      <tr key={index} className="border-b last:border-b-0 hover:bg-muted/10" data-testid={`row-line-item-${index}`}>
                        <td className="px-1 py-0.5" style={{ width: getColWidth("description") }}>
                          <input
                            value={item.description}
                            onChange={(e) =>
                              updateLineItem(index, "description", e.target.value)
                            }
                            placeholder="Description..."
                            className="w-full h-7 px-1.5 text-[11px] bg-transparent border-0 outline-none focus:ring-1 focus:ring-ring rounded-sm"
                            data-testid={`input-description-${index}`}
                          />
                        </td>
                        <td className="px-1 py-0.5" style={{ width: getColWidth("costCode") }}>
                          <CostCodeSelect
                            value={item.costCodeId || ""}
                            onValueChange={(value) =>
                              updateLineItem(index, "costCodeId", value)
                            }
                            placeholder="Select..."
                            triggerClassName="border-0 shadow-none bg-transparent text-[11px]"
                            data-testid={`select-cost-code-${index}`}
                          />
                        </td>
                        <td className="px-1 py-0.5" style={{ width: getColWidth("qty") }}>
                          <input
                            type="number"
                            value={item.quantity}
                            onChange={(e) =>
                              updateLineItem(
                                index,
                                "quantity",
                                parseFloat(e.target.value) || 0
                              )
                            }
                            className="w-full h-7 px-1.5 text-[11px] text-right bg-transparent border-0 outline-none focus:ring-1 focus:ring-ring rounded-sm"
                            data-testid={`input-quantity-${index}`}
                          />
                        </td>
                        <td className="px-1 py-0.5" style={{ width: getColWidth("unit") }}>
                          <input
                            value={item.unit}
                            onChange={(e) =>
                              updateLineItem(index, "unit", e.target.value)
                            }
                            placeholder="Unit"
                            className="w-full h-7 px-1.5 text-[11px] bg-transparent border-0 outline-none focus:ring-1 focus:ring-ring rounded-sm"
                            data-testid={`input-unit-${index}`}
                          />
                        </td>
                        <td className="px-1 py-0.5" style={{ width: getColWidth("tax") }}>
                          <Select
                            value={item.tax}
                            onValueChange={(value) =>
                              updateLineItem(index, "tax", value)
                            }
                          >
                            <SelectTrigger className="text-[11px] border-0 shadow-none bg-transparent" data-testid={`select-tax-${index}`}>
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="GST on expenses">
                                GST on expenses
                              </SelectItem>
                              <SelectItem value="No GST">No GST</SelectItem>
                            </SelectContent>
                          </Select>
                        </td>
                        <td className="px-1 py-0.5" style={{ width: getColWidth("account") }}>
                          {xeroAccounts.length > 0 ? (
                            <Select
                              value={item.account || "__none__"}
                              onValueChange={(val) => updateLineItem(index, "account", val === "__none__" ? "" : val)}
                            >
                              <SelectTrigger className="text-[11px] border-0 shadow-none bg-transparent" data-testid={`select-account-${index}`}>
                                <SelectValue placeholder="Select account..." />
                              </SelectTrigger>
                              <SelectContent>
                                <SelectItem value="__none__">None</SelectItem>
                                {xeroAccounts.map((acc) => (
                                  <SelectItem key={acc.code} value={acc.code}>
                                    {acc.code} - {acc.name}
                                  </SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                          ) : (
                            <input
                              value={item.account}
                              onChange={(e) =>
                                updateLineItem(index, "account", e.target.value)
                              }
                              placeholder="Account"
                              className="w-full h-7 px-1.5 text-[11px] bg-transparent border-0 outline-none focus:ring-1 focus:ring-ring rounded-sm"
                              data-testid={`input-account-${index}`}
                            />
                          )}
                        </td>
                        <td className="px-1 py-0.5" style={{ width: getColWidth("unitCost") }}>
                          <input
                            type="number"
                            value={item.unitPrice}
                            onChange={(e) =>
                              updateLineItem(
                                index,
                                "unitPrice",
                                parseFloat(e.target.value) || 0
                              )
                            }
                            className="w-full h-7 px-1.5 text-[11px] text-right bg-transparent border-0 outline-none focus:ring-1 focus:ring-ring rounded-sm"
                            data-testid={`input-amount-${index}`}
                          />
                        </td>
                        {visibleAmountCols.exTax && (
                          <td className="px-1 py-0.5 text-right text-[11px] text-muted-foreground" style={{ width: getColWidth("exTax") }}>
                            {formatCurrency(getLineExTax(item))}
                          </td>
                        )}
                        {visibleAmountCols.tax && (
                          <td className="px-1 py-0.5 text-right text-[11px] text-muted-foreground" style={{ width: getColWidth("amtTax") }}>
                            {formatCurrency(getLineTax(item))}
                          </td>
                        )}
                        {visibleAmountCols.incTax && (
                          <td className="px-1 py-0.5 text-right text-[11px] text-muted-foreground" style={{ width: getColWidth("incTax") }}>
                            {formatCurrency(getLineIncTax(item))}
                          </td>
                        )}
                        <td className="px-1 py-0.5" style={{ width: getColWidth("allowance") }}>
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
                            <SelectTrigger className="text-[11px] border-0 shadow-none bg-transparent" data-testid={`select-allowance-${index}`}>
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
                        </td>
                        <td className="px-0.5 py-0.5 text-center">
                          <button
                            type="button"
                            onClick={() => deleteLineItem(index)}
                            className="p-1 rounded-sm text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-colors"
                            data-testid={`button-delete-line-${index}`}
                          >
                            <Trash2 className="h-3 w-3" />
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              <div className="px-3 py-1.5 border-t">
                <button
                  type="button"
                  onClick={addLineItem}
                  className="flex items-center gap-1 text-[11px] text-muted-foreground hover:text-foreground transition-colors py-1"
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
                                className={`inline-flex items-center px-1.5 py-0.5 rounded-full text-[10px] font-medium ${
                                  approval.status === "approved"
                                    ? "bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200"
                                    : "bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200"
                                }`}
                              >
                                {approval.status === "approved" ? "Approved" : "Rejected"}
                              </span>
                            </div>
                            {approval.comments && (
                              <p className="text-[11px] text-muted-foreground mt-0.5">
                                {approval.comments}
                              </p>
                            )}
                            <p className="text-[10px] text-muted-foreground mt-0.5">
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
                        <div className="text-[11px] text-destructive space-y-0.5" data-testid="text-submit-validation-errors">
                          {validation.errors.map((error, index) => (
                            <div key={index}>{error}</div>
                          ))}
                        </div>
                      ) : null;
                    })()}
                  </div>
                  <div className="flex items-center gap-2">
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() => setLocation(projectId ? `/projects/${projectId}/bills` : "/bills")}
                      data-testid="button-cancel"
                    >
                      Cancel
                    </Button>
                    {isEditMode && bill?.status === "draft" && (() => {
                      const validation = getSubmitForApprovalValidation();
                      return (
                        <Button
                          type="button"
                          variant="default"
                          size="sm"
                          onClick={() => submitForApprovalMutation.mutate()}
                          disabled={!validation.isValid || submitForApprovalMutation.isPending}
                          data-testid="button-submit-for-approval"
                          className="gap-1"
                        >
                          <Send className="h-3.5 w-3.5" />
                          {submitForApprovalMutation.isPending ? "Submitting..." : "Submit for Approval"}
                        </Button>
                      );
                    })()}
                    <Button
                      type="submit"
                      size="sm"
                      disabled={createMutation.isPending || updateMutation.isPending}
                      data-testid="button-save"
                    >
                      {createMutation.isPending || updateMutation.isPending
                        ? "Saving..."
                        : "Save"}
                    </Button>
                  </div>
                </div>
          </form>
        </Form>
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

      <Dialog open={addSupplierDialogOpen} onOpenChange={setAddSupplierDialogOpen}>
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

      <Dialog open={unmappedContactDialogOpen} onOpenChange={(open) => {
        setUnmappedContactDialogOpen(open);
        if (!open) {
          setSelectedXeroContactId("");
          setPendingXeroBillId(null);
        }
      }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Link Supplier to Xero Contact</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">
            "{unmappedSupplierName}" is not linked to a Xero contact. Select the matching Xero contact below to continue sending this bill to Xero.
          </p>
          <Select value={selectedXeroContactId} onValueChange={setSelectedXeroContactId}>
            <SelectTrigger>
              <SelectValue placeholder="Select Xero contact..." />
            </SelectTrigger>
            <SelectContent>
              {xeroContacts.map((c) => (
                <SelectItem key={c.contactId} value={c.contactId}>
                  {c.name}{c.emailAddress ? ` (${c.emailAddress})` : ""}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <DialogFooter>
            <Button variant="outline" onClick={() => setUnmappedContactDialogOpen(false)}>
              Cancel
            </Button>
            <Button
              disabled={!selectedXeroContactId}
              onClick={async () => {
                const billIdToUse = pendingXeroBillId || id;
                if (!selectedXeroContactId || !billIdToUse) return;
                try {
                  const res = await apiRequest("/api/xero/push-bill", "POST", {
                    billId: billIdToUse,
                    xeroContactId: selectedXeroContactId,
                  });
                  toast({ title: "Success", description: "Bill sent to Xero" });
                  setUnmappedContactDialogOpen(false);
                  setSelectedXeroContactId("");
                  setPendingXeroBillId(null);
                  queryClient.invalidateQueries({ queryKey: ["/api/bills"] });
                  queryClient.invalidateQueries({ queryKey: ["/api/bills", id] });
                  setLocation(projectId ? `/projects/${projectId}/bills` : "/bills");
                } catch (e: any) {
                  toast({ title: "Error", description: e.message || "Failed to send bill to Xero", variant: "destructive" });
                }
              }}
            >
              Link & Send to Xero
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {fullscreenPreview && previewAttachment && (
        <div className="fixed inset-0 z-50 bg-black/80 flex items-center justify-center" onClick={() => setFullscreenPreview(false)}>
          <div className="relative w-[90vw] h-[90vh]" onClick={(e) => e.stopPropagation()}>
            <Button
              variant="ghost"
              size="icon"
              className="absolute top-2 right-2 z-10 bg-black/50 text-white"
              onClick={() => setFullscreenPreview(false)}
            >
              <X className="h-5 w-5" />
            </Button>
            {/\.(pdf)$/i.test(previewAttachment) ? (
              <iframe
                src={previewAttachment}
                className="w-full h-full border-0 rounded-md"
                title="PDF Preview Fullscreen"
              />
            ) : /\.(jpe?g|png|gif|webp|bmp|tiff?)$/i.test(previewAttachment) ? (
              <img
                src={previewAttachment}
                alt="Attachment preview fullscreen"
                className="w-full h-full object-contain"
              />
            ) : null}
          </div>
        </div>
      )}
    </div>
  );
}
