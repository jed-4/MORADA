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
  ChevronRight
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
  const [notesExpanded, setNotesExpanded] = useState(false);
  const [remindersExpanded, setRemindersExpanded] = useState(false);
  const dueDateManuallySet = useRef(false);

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
  }, [bill, isEditMode, form]);

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
  }, [projects, isEditMode, form, projectId]);

  useEffect(() => {
    if (!isEditMode && nextBillNumberData?.billNumber) {
      form.setValue("billNumber", nextBillNumberData.billNumber);
    }
  }, [nextBillNumberData, isEditMode, form]);

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
  }, [watchedSupplierId, watchedBillDate, suppliers, companySettings, isEditMode, form]);

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
        account: "",
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
    // Check if it's a whole number
    const isWholeNumber = amount % 1 === 0;
    
    return new Intl.NumberFormat("en-AU", {
      style: "currency",
      currency: "AUD",
      minimumFractionDigits: isWholeNumber ? 0 : 2,
      maximumFractionDigits: 2
    }).format(amount);
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
        createdById: "temp-user-id",
        attachmentUrls,
      };

      const billRes = await apiRequest("/api/bills", "POST", billData);
      const newBill = await billRes.json() as Bill;

      for (let i = 0; i < lineItems.length; i++) {
        const item = lineItems[i];
        const lineItemRes = await apiRequest(`/api/bills/${newBill.id}/line-items`, "POST", {
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
        const createdLineItem = await lineItemRes.json();

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
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/bills"] });
      queryClient.invalidateQueries({ queryKey: ["/api/projects", form.getValues("projectId"), "allowances"] });
      toast({
        title: "Success",
        description: "Bill created successfully",
      });
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

      const billRes = await apiRequest(`/api/bills/${id}`, "PATCH", billData);
      const updatedBill = await billRes.json() as Bill;

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
          const lineItemRes = await apiRequest(`/api/bills/${id}/line-items`, "POST", itemData);
          const createdLineItem = await lineItemRes.json();
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
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/bills"] });
      queryClient.invalidateQueries({ queryKey: ["/api/bills", id] });
      queryClient.invalidateQueries({ queryKey: ["/api/bills", id, "line-item-allowances"] });
      queryClient.invalidateQueries({ queryKey: ["/api/projects", form.getValues("projectId"), "allowances"] });
      toast({
        title: "Success",
        description: "Bill updated successfully",
      });
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
      return response.json();
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
      return response.json();
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
      return response.json();
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
      return response.json();
    },
    onSuccess: (data) => {
      setOcrResults(data);
      setOcrPreviewOpen(true);
      toast({
        title: "Success",
        description: "Invoice data extracted successfully",
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

  const onSubmit = (data: BillFormData) => {
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
      const matchedSupplier = suppliers.find(
        (s) => s.name.toLowerCase() === ocrResults.supplierName.toLowerCase()
      );
      if (matchedSupplier) {
        form.setValue("supplierId", matchedSupplier.id);
      }
    }

    if (ocrResults.lineItems && ocrResults.lineItems.length > 0) {
      const firstCostCode = costCodes[0]?.id;
      const newLineItems = ocrResults.lineItems.map((item: any, index: number) => ({
        lineType: "custom" as const,
        description: item.description || "",
        costCodeId: firstCostCode,
        quantity: item.quantity || 1,
        unitPrice: item.unitPrice ? item.unitPrice / 100 : 0,
        unit: "",
        tax: "GST on expenses" as const,
        account: "",
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
      <div className="flex-none p-6 border-b">
        <div className="flex items-center justify-between gap-4">
          <div className="flex items-center gap-4">
            <Button
              variant="ghost"
              size="icon"
              onClick={() => setLocation(projectId ? `/projects/${projectId}/bills` : "/bills")}
              data-testid="button-back"
            >
              <ArrowLeft className="h-5 w-5" />
            </Button>
            <h1 className="text-2xl font-bold" data-testid="text-page-title">
              {isEditMode
                ? (form.watch("billType") === "credit" ? "Edit Vendor Credit" : "Edit Bill")
                : (form.watch("billType") === "credit" ? "Create Vendor Credit" : "Create Bill")}
            </h1>
          </div>
          <div className="flex items-center gap-6">
            <div className="flex items-center gap-2 text-sm">
              <span className="text-muted-foreground">Total:</span>
              <span className="font-semibold" data-testid="text-header-total">
                {formatCurrency(total)}
              </span>
            </div>
            <div className="flex items-center gap-2 text-sm">
              <span className="text-muted-foreground">Paid:</span>
              <span className="font-semibold" data-testid="text-header-paid">
                {formatCurrency(paid)}
              </span>
            </div>
            <div className="flex items-center gap-2 text-sm">
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
                  className="gap-2"
                >
                  <Check className="h-4 w-4" />
                  {approveMutation.isPending ? "Approving..." : "Approve"}
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setRejectDialogOpen(true)}
                  disabled={rejectMutation.isPending}
                  data-testid="button-reject"
                  className="gap-2"
                >
                  <X className="h-4 w-4" />
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
                <Copy className="h-4 w-4" />
              </Button>
            )}
          </div>
        </div>
      </div>

      <div className="flex-1 overflow-auto p-6">
        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
            <div className="grid grid-cols-1 xl:grid-cols-[1fr_320px] gap-6">
              <Card className="p-6">
                <div className="grid grid-cols-2 gap-4">
                  <FormField
                    control={form.control}
                    name="billNumber"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Bill ID</FormLabel>
                        <FormControl>
                          <Input
                            {...field}
                            readOnly
                            className="bg-muted"
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
                      <FormItem>
                        <FormLabel>Type</FormLabel>
                        <Select
                          onValueChange={field.onChange}
                          value={field.value}
                        >
                          <FormControl>
                            <SelectTrigger data-testid="select-bill-type">
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
                      <FormItem>
                        <FormLabel>Project *</FormLabel>
                        <Select
                          onValueChange={field.onChange}
                          value={field.value}
                          disabled={!isEditMode && !!projectId}
                        >
                          <FormControl>
                            <SelectTrigger data-testid="select-project">
                              <SelectValue placeholder="Select project..." />
                            </SelectTrigger>
                          </FormControl>
                          <SelectContent>
                            {projects.map((project) => (
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
                      <FormItem>
                        <FormLabel>Pay to *</FormLabel>
                        <Select
                          onValueChange={field.onChange}
                          value={field.value}
                        >
                          <FormControl>
                            <SelectTrigger data-testid="select-supplier">
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
                                className="w-full flex items-center gap-2 px-2 py-1.5 text-sm text-primary hover:bg-accent rounded-sm"
                                data-testid="button-add-supplier"
                              >
                                <Plus className="h-4 w-4" />
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
                      <FormItem>
                        <FormLabel>Date *</FormLabel>
                        <FormControl>
                          <Input
                            type="date"
                            {...field}
                            data-testid="input-bill-date"
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
                      <FormItem>
                        <FormLabel>Bill reference</FormLabel>
                        <FormControl>
                          <Input
                            {...field}
                            placeholder="Enter reference..."
                            data-testid="input-bill-reference"
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
                      <FormItem>
                        <FormLabel>Due date</FormLabel>
                        <FormControl>
                          <Input
                            type="date"
                            {...field}
                            onChange={(e) => {
                              dueDateManuallySet.current = true;
                              field.onChange(e);
                            }}
                            data-testid="input-due-date"
                          />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                </div>
              </Card>

              <div className="space-y-4">
                <Card className="p-4">
                  <h3 className="text-sm font-semibold mb-3">Upload Invoice for OCR</h3>
                  <div className="space-y-3">
                    {!uploadedFile ? (
                      <div
                        className="border-2 border-dashed rounded-lg p-6 text-center hover-elevate cursor-pointer transition-colors"
                        onDrop={handleDrop}
                        onDragOver={(e) => e.preventDefault()}
                        onClick={() => document.getElementById('file-upload')?.click()}
                        data-testid="dropzone-upload"
                      >
                        <Upload className="h-8 w-8 mx-auto mb-2 text-muted-foreground" />
                        <p className="text-xs text-muted-foreground mb-1">
                          Drag and drop or click to browse
                        </p>
                        <p className="text-xs text-muted-foreground">
                          PDF, JPG, JPEG, PNG
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
                        <div className="flex items-center justify-between p-3 border rounded-lg" data-testid="card-uploaded-file">
                          <div className="flex items-center gap-2 min-w-0">
                            <FileText className="h-5 w-5 text-muted-foreground shrink-0" />
                            <div className="min-w-0">
                              <p className="text-sm font-medium truncate" data-testid="text-filename">{uploadedFile.name}</p>
                              <p className="text-xs text-muted-foreground" data-testid="text-filesize">
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
                            <X className="h-4 w-4" />
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
                                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                                Extracting...
                              </>
                            ) : (
                              <>
                                <Upload className="h-4 w-4 mr-2" />
                                Process with OCR
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
                                <span>OCR Results</span>
                                <ChevronDown className={`h-4 w-4 transition-transform ${ocrPreviewOpen ? 'rotate-180' : ''}`} />
                              </Button>
                            </CollapsibleTrigger>
                            <CollapsibleContent className="mt-3 space-y-3" data-testid="card-ocr-results">
                              <div className="border rounded-lg p-3 space-y-2 text-sm">
                                <div className="grid grid-cols-2 gap-2">
                                  <div>
                                    <p className="text-xs text-muted-foreground">Supplier</p>
                                    <p className="font-medium text-xs" data-testid="text-ocr-supplier">
                                      {ocrResults.supplierName || "Not detected"}
                                    </p>
                                  </div>
                                  <div>
                                    <p className="text-xs text-muted-foreground">Invoice #</p>
                                    <p className="font-medium text-xs" data-testid="text-ocr-invoice-number">
                                      {ocrResults.invoiceNumber || "Not detected"}
                                    </p>
                                  </div>
                                  <div>
                                    <p className="text-xs text-muted-foreground">Date</p>
                                    <p className="font-medium text-xs" data-testid="text-ocr-invoice-date">
                                      {ocrResults.invoiceDate ? format(new Date(ocrResults.invoiceDate), "dd/MM/yyyy") : "Not detected"}
                                    </p>
                                  </div>
                                  <div>
                                    <p className="text-xs text-muted-foreground">Due</p>
                                    <p className="font-medium text-xs" data-testid="text-ocr-due-date">
                                      {ocrResults.dueDate ? format(new Date(ocrResults.dueDate), "dd/MM/yyyy") : "Not detected"}
                                    </p>
                                  </div>
                                </div>

                                <div className="border-t pt-2">
                                  <div className="grid grid-cols-3 gap-2">
                                    <div>
                                      <p className="text-xs text-muted-foreground">Subtotal</p>
                                      <p className="font-medium text-xs" data-testid="text-ocr-subtotal">
                                        {ocrResults.subtotalAmount ? formatCurrency(ocrResults.subtotalAmount / 100) : "—"}
                                      </p>
                                    </div>
                                    <div>
                                      <p className="text-xs text-muted-foreground">Tax</p>
                                      <p className="font-medium text-xs" data-testid="text-ocr-tax">
                                        {ocrResults.totalTax ? formatCurrency(ocrResults.totalTax / 100) : "—"}
                                      </p>
                                    </div>
                                    <div>
                                      <p className="text-xs text-muted-foreground">Total</p>
                                      <p className="font-medium text-xs" data-testid="text-ocr-total">
                                        {ocrResults.totalAmount ? formatCurrency(ocrResults.totalAmount / 100) : "—"}
                                      </p>
                                    </div>
                                  </div>
                                </div>

                                {ocrResults.lineItems && ocrResults.lineItems.length > 0 && (
                                  <div className="border-t pt-2">
                                    <p className="text-xs font-medium mb-1">Line Items</p>
                                    <div className="space-y-1">
                                      {ocrResults.lineItems.map((item: any, idx: number) => (
                                        <div key={idx} className="flex justify-between text-xs p-1.5 bg-muted/50 rounded" data-testid={`text-ocr-line-item-${idx}`}>
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

                <Card className="p-4">
                  <div className="space-y-4">
                    <div>
                      <div className="flex items-center justify-between mb-2">
                        <div className="flex items-center gap-2">
                          <Paperclip className="h-4 w-4 text-muted-foreground" />
                          <span className="text-sm font-medium">Attachments</span>
                          {attachmentUrls.length > 0 && (
                            <Badge variant="secondary" className="text-xs">{attachmentUrls.length}</Badge>
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
                          {attachmentUrls.map((url, idx) => {
                            const fileName = url.split('/').pop() || `Attachment ${idx + 1}`;
                            return (
                              <div key={idx} className="flex items-center justify-between gap-2 p-2 rounded-md border text-xs">
                                <a
                                  href={url}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className="flex items-center gap-2 text-foreground hover:underline truncate"
                                >
                                  <FileText className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                                  <span className="truncate">{decodeURIComponent(fileName)}</span>
                                </a>
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  className="shrink-0"
                                  onClick={() => setAttachmentUrls(prev => prev.filter((_, i) => i !== idx))}
                                  data-testid={`button-remove-attachment-${idx}`}
                                >
                                  <X className="h-3 w-3" />
                                </Button>
                              </div>
                            );
                          })}
                        </div>
                      ) : (
                        <p className="text-xs text-muted-foreground">No attachments yet</p>
                      )}
                    </div>

                    <div className="border-t pt-3">
                      <div className="flex items-center gap-2 mb-2">
                        <MessageSquare className="h-4 w-4 text-muted-foreground" />
                        <span className="text-sm font-medium">Comments</span>
                      </div>
                      {isEditMode ? (
                        <Textarea
                          placeholder="Add a comment..."
                          rows={2}
                          data-testid="textarea-comments"
                        />
                      ) : (
                        <div
                          className="text-xs text-muted-foreground"
                          data-testid="text-comments-unavailable"
                        >
                          Comments will be available after create
                        </div>
                      )}
                    </div>

                    <div className="border-t pt-3">
                      <button
                        type="button"
                        className="flex items-center gap-2 w-full text-left text-sm font-medium mb-2"
                        onClick={() => setNotesExpanded(!notesExpanded)}
                      >
                        {notesExpanded ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronRight className="h-3.5 w-3.5" />}
                        Notes
                        {form.watch("notes") && <span className="text-xs text-muted-foreground ml-auto">has content</span>}
                      </button>
                      {notesExpanded && (
                        <FormField
                          control={form.control}
                          name="notes"
                          render={({ field }) => (
                            <FormItem>
                              <FormControl>
                                <Textarea
                                  {...field}
                                  placeholder="Add notes..."
                                  rows={3}
                                  data-testid="textarea-notes"
                                />
                              </FormControl>
                              <FormMessage />
                            </FormItem>
                          )}
                        />
                      )}
                    </div>

                    <div className="border-t pt-3">
                      <button
                        type="button"
                        className="flex items-center gap-2 w-full text-left text-sm font-medium mb-2"
                        onClick={() => setRemindersExpanded(!remindersExpanded)}
                      >
                        {remindersExpanded ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronRight className="h-3.5 w-3.5" />}
                        Reminders
                        {form.watch("reminders") && <span className="text-xs text-muted-foreground ml-auto">has content</span>}
                      </button>
                      {remindersExpanded && (
                        <FormField
                          control={form.control}
                          name="reminders"
                          render={({ field }) => (
                            <FormItem>
                              <FormControl>
                                <Textarea
                                  {...field}
                                  placeholder="Add reminders..."
                                  rows={2}
                                  data-testid="textarea-reminders"
                                />
                              </FormControl>
                              <FormMessage />
                            </FormItem>
                          )}
                        />
                      )}
                    </div>

                    <div className="border-t pt-3">
                      <FormField
                        control={form.control}
                        name="sendToXero"
                        render={({ field }) => (
                          <FormItem className="flex items-center gap-2 space-y-0">
                            <FormControl>
                              <Checkbox
                                checked={field.value}
                                onCheckedChange={field.onChange}
                                data-testid="checkbox-send-to-xero"
                              />
                            </FormControl>
                            <FormLabel className="!mt-0 text-sm">Send to Xero</FormLabel>
                          </FormItem>
                        )}
                      />
                      {form.watch("sendToXero") && (
                        <div className="text-xs text-muted-foreground space-y-1 mt-2">
                          {!form.watch("supplierId") && (
                            <div data-testid="text-xero-validation-supplier">
                              Fill in Pay to field
                            </div>
                          )}
                          {lineItems.some((item) => !item.costCodeId) && (
                            <div data-testid="text-xero-validation-cost-codes">
                              Set the Cost Codes
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  </div>
                </Card>
              </div>
            </div>

            <Card className="p-4">
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <h3 className="text-lg font-semibold">Cost Lines</h3>
                  <div className="flex items-center gap-2">
                    <span className="text-sm text-muted-foreground">Amounts are</span>
                    <Select
                      value={taxMode}
                      onValueChange={(value: "inclusive" | "exclusive") =>
                        setTaxMode(value)
                      }
                    >
                      <SelectTrigger className="w-32" data-testid="select-tax-mode">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="exclusive">Exclusive</SelectItem>
                        <SelectItem value="inclusive">Inclusive</SelectItem>
                      </SelectContent>
                    </Select>
                    <span className="text-sm text-muted-foreground">of tax</span>
                  </div>
                </div>

                <div className="overflow-x-auto">
                  <Table>
                        <TableHeader>
                          <TableRow>
                            <TableHead className="w-32">Type</TableHead>
                            <TableHead>Description</TableHead>
                            <TableHead>Cost Code</TableHead>
                            <TableHead className="w-24">Quantity</TableHead>
                            <TableHead className="w-24">Unit</TableHead>
                            <TableHead className="w-40">Tax</TableHead>
                            <TableHead className="w-32">Account</TableHead>
                            <TableHead className="w-32">Amount</TableHead>
                            <TableHead className="w-48">Allowance</TableHead>
                            <TableHead className="w-12"></TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {lineItems.map((item, index) => (
                            <TableRow key={index} data-testid={`row-line-item-${index}`}>
                              <TableCell>
                                <Select
                                  value={item.lineType}
                                  onValueChange={(value) =>
                                    updateLineItem(index, "lineType", value)
                                  }
                                >
                                  <SelectTrigger data-testid={`select-line-type-${index}`}>
                                    <SelectValue />
                                  </SelectTrigger>
                                  <SelectContent>
                                    <SelectItem value="estimate">Estimate</SelectItem>
                                    <SelectItem value="item">Item</SelectItem>
                                    <SelectItem value="custom">Custom</SelectItem>
                                  </SelectContent>
                                </Select>
                              </TableCell>
                              <TableCell>
                                <Input
                                  value={item.description}
                                  onChange={(e) =>
                                    updateLineItem(index, "description", e.target.value)
                                  }
                                  placeholder="Description..."
                                  data-testid={`input-description-${index}`}
                                />
                              </TableCell>
                              <TableCell>
                                <CostCodeSelect
                                  value={item.costCodeId || ""}
                                  onValueChange={(value) =>
                                    updateLineItem(index, "costCodeId", value)
                                  }
                                  placeholder="Select..."
                                  data-testid={`select-cost-code-${index}`}
                                />
                              </TableCell>
                              <TableCell>
                                <Input
                                  type="number"
                                  value={item.quantity}
                                  onChange={(e) =>
                                    updateLineItem(
                                      index,
                                      "quantity",
                                      parseFloat(e.target.value) || 0
                                    )
                                  }
                                  data-testid={`input-quantity-${index}`}
                                />
                              </TableCell>
                              <TableCell>
                                <Input
                                  value={item.unit}
                                  onChange={(e) =>
                                    updateLineItem(index, "unit", e.target.value)
                                  }
                                  placeholder="Unit"
                                  data-testid={`input-unit-${index}`}
                                />
                              </TableCell>
                              <TableCell>
                                <Select
                                  value={item.tax}
                                  onValueChange={(value) =>
                                    updateLineItem(index, "tax", value)
                                  }
                                >
                                  <SelectTrigger data-testid={`select-tax-${index}`}>
                                    <SelectValue />
                                  </SelectTrigger>
                                  <SelectContent>
                                    <SelectItem value="GST on expenses">
                                      GST on expenses
                                    </SelectItem>
                                    <SelectItem value="No GST">No GST</SelectItem>
                                  </SelectContent>
                                </Select>
                              </TableCell>
                              <TableCell>
                                <Input
                                  value={item.account}
                                  onChange={(e) =>
                                    updateLineItem(index, "account", e.target.value)
                                  }
                                  placeholder="Account"
                                  data-testid={`input-account-${index}`}
                                />
                              </TableCell>
                              <TableCell>
                                <Input
                                  type="number"
                                  value={item.unitPrice}
                                  onChange={(e) =>
                                    updateLineItem(
                                      index,
                                      "unitPrice",
                                      parseFloat(e.target.value) || 0
                                    )
                                  }
                                  data-testid={`input-amount-${index}`}
                                />
                              </TableCell>
                              <TableCell>
                                <div className="space-y-2">
                                  <div className="flex items-center gap-2">
                                    <Checkbox
                                      checked={item.appliesToAllowances}
                                      onCheckedChange={(checked) =>
                                        updateLineItem(index, "appliesToAllowances", checked === true)
                                      }
                                      data-testid={`checkbox-applies-to-allowances-${index}`}
                                    />
                                    <label className="text-sm">Applies to Allowances</label>
                                  </div>
                                  {item.appliesToAllowances && (
                                    <Select
                                      value={item.allowanceItemId || ""}
                                      onValueChange={(value) =>
                                        updateLineItem(index, "allowanceItemId", value)
                                      }
                                    >
                                      <SelectTrigger data-testid={`select-allowance-${index}`}>
                                        <SelectValue placeholder="Select allowance..." />
                                      </SelectTrigger>
                                      <SelectContent>
                                        {allowances.map((allowance) => (
                                          <SelectItem key={allowance.id} value={allowance.id}>
                                            {allowance.description} ({allowance.itemType})
                                          </SelectItem>
                                        ))}
                                      </SelectContent>
                                    </Select>
                                  )}
                                </div>
                              </TableCell>
                              <TableCell>
                                <Button
                                  type="button"
                                  variant="ghost"
                                  size="icon"
                                  onClick={() => deleteLineItem(index)}
                                  data-testid={`button-delete-line-${index}`}
                                >
                                  <Trash2 className="h-4 w-4" />
                                </Button>
                              </TableCell>
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                    </div>

                    <Button
                      type="button"
                      variant="outline"
                      onClick={addLineItem}
                      data-testid="button-add-line"
                    >
                      <Plus className="h-4 w-4 mr-2" />
                      Add new line
                    </Button>

                    <div className="border-t pt-4 mt-4">
                      <div className="flex justify-end">
                        <div className="w-72 space-y-2">
                          <div className="flex justify-between text-sm">
                            <span className="text-muted-foreground">Subtotal</span>
                            <span className="font-medium" data-testid="text-subtotal">
                              {formatCurrency(calculateSubtotal())}
                            </span>
                          </div>
                          <div className="flex justify-between text-sm">
                            <span className="text-muted-foreground">Tax (GST)</span>
                            <span className="font-medium" data-testid="text-tax">
                              {formatCurrency(calculateTax())}
                            </span>
                          </div>
                          <div className="flex justify-between border-t pt-2">
                            <span className="text-base font-bold">Total</span>
                            <span className="text-base font-bold" data-testid="text-total">
                              {formatCurrency(total)}
                            </span>
                          </div>
                          <FormField
                            control={form.control}
                            name="paidAmount"
                            render={({ field }) => (
                              <FormItem>
                                <div className="flex justify-between items-center">
                                  <FormLabel className="text-sm">Paid</FormLabel>
                                  <FormControl>
                                    <Input
                                      type="number"
                                      {...field}
                                      onChange={(e) =>
                                        field.onChange(parseFloat(e.target.value) || 0)
                                      }
                                      className="w-32 text-right"
                                      data-testid="input-paid"
                                    />
                                  </FormControl>
                                </div>
                                <FormMessage />
                              </FormItem>
                            )}
                          />
                          <div className="flex justify-between text-base font-bold text-primary border-t pt-2">
                            <span>Due</span>
                            <span data-testid="text-due">{formatCurrency(due)}</span>
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                </Card>

                {isEditMode && approvals.length > 0 && (
                  <Card className="p-6">
                    <h3 className="text-lg font-semibold mb-4">Approval History</h3>
                    <div className="space-y-3">
                      {approvals.map((approval) => (
                        <div
                          key={approval.id}
                          className="flex items-start gap-3 p-3 border rounded-lg"
                          data-testid={`approval-history-${approval.id}`}
                        >
                          <div className="flex-1">
                            <div className="flex items-center gap-2">
                              <span className="font-medium">
                                {approval.approvedById}
                              </span>
                              <span
                                className={`inline-flex items-center px-2 py-1 rounded-full text-xs font-medium ${
                                  approval.status === "approved"
                                    ? "bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200"
                                    : "bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200"
                                }`}
                              >
                                {approval.status === "approved" ? "Approved" : "Rejected"}
                              </span>
                            </div>
                            {approval.comments && (
                              <p className="text-sm text-muted-foreground mt-1">
                                {approval.comments}
                              </p>
                            )}
                            <p className="text-xs text-muted-foreground mt-1">
                              {format(new Date(approval.createdAt), "PPp")}
                            </p>
                          </div>
                        </div>
                      ))}
                    </div>
                  </Card>
                )}

                <div className="flex flex-col items-end gap-3">
                  {isEditMode && bill?.status === "draft" && (() => {
                    const validation = getSubmitForApprovalValidation();
                    return (
                      <>
                        {!validation.isValid && (
                          <div className="text-sm text-destructive space-y-1" data-testid="text-submit-validation-errors">
                            {validation.errors.map((error, index) => (
                              <div key={index}>• {error}</div>
                            ))}
                          </div>
                        )}
                      </>
                    );
                  })()}
                  <div className="flex items-center gap-3">
                    <Button
                      type="button"
                      variant="outline"
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
                          onClick={() => submitForApprovalMutation.mutate()}
                          disabled={!validation.isValid || submitForApprovalMutation.isPending}
                          data-testid="button-submit-for-approval"
                          className="gap-2"
                        >
                          <Send className="h-4 w-4" />
                          {submitForApprovalMutation.isPending ? "Submitting..." : "Submit for Approval"}
                        </Button>
                      );
                    })()}
                    <Button
                      type="submit"
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
    </div>
  );
}
