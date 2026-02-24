import { useEffect, useState } from "react";
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
  Paperclip
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
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
  Bill
} from "@shared/schema";

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
  paymentMethod: z.enum(["Bank Transfer", "Credit Card", "Cash", "Cheque", "Other"]).optional(),
  reference: z.string().optional(),
  notes: z.string().optional(),
});

type InvoiceFormData = z.infer<typeof invoiceFormSchema>;
type PaymentFormData = z.infer<typeof paymentFormSchema>;

type CustomLine = {
  id?: string;
  description: string;
  quantity: number;
  unitPrice: number;
  totalPrice: number;
  taxable: boolean;
  sortOrder: number;
};

export default function ClientInvoiceDetail() {
  const { id, invoiceId, projectId: projectIdFromParams } = useParams<{ 
    id?: string; 
    invoiceId?: string; 
    projectId?: string 
  }>();
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const { user } = useAuth();
  
  const effectiveInvoiceId = invoiceId || id;
  const isEditMode = !!(effectiveInvoiceId && effectiveInvoiceId !== "new");

  const [customLines, setCustomLines] = useState<CustomLine[]>([]);
  const [selectedEstimateId, setSelectedEstimateId] = useState<string>("");
  const [progressPercent, setProgressPercent] = useState<number | undefined>(undefined);
  const [isCustomProgress, setIsCustomProgress] = useState(false);
  const [customProgressPercent, setCustomProgressPercent] = useState<string>("");
  const [selectedVariationIds, setSelectedVariationIds] = useState<string[]>([]);
  const [selectedBillIds, setSelectedBillIds] = useState<string[]>([]);
  const [paymentDialogOpen, setPaymentDialogOpen] = useState(false);
  const [xeroPushing, setXeroPushing] = useState(false);

  const { data: xeroStatus } = useQuery<{ connected: boolean }>({
    queryKey: ["/api/xero/status"],
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

  useEffect(() => {
    if (invoice && isEditMode) {
      form.reset({
        invoiceNumber: invoice.invoiceNumber,
        projectId: invoice.projectId,
        name: invoice.name,
        invoiceDate: invoice.invoiceDate ? new Date(invoice.invoiceDate) : new Date(),
        dueDate: invoice.dueDate ? new Date(invoice.dueDate) : undefined,
        introductionText: invoice.introductionText || "",
        closingText: invoice.closingText || "",
        termsAndConditions: invoice.termsAndConditions || "",
        markupPercent: invoice.markupPercent || undefined,
      });
    }
  }, [invoice, isEditMode, form]);

  useEffect(() => {
    if (existingCustomLines.length > 0 && isEditMode) {
      setCustomLines(
        existingCustomLines.map((item) => ({
          id: item.id,
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
        form.setValue("name", `Invoice ${format(new Date(), 'MMM yyyy')}`);
      }
    }
  }, [projects, isEditMode, form, projectIdFromParams]);

  useEffect(() => {
    if (linkedEstimates.length > 0 && isEditMode) {
      const estimate = linkedEstimates[0];
      setSelectedEstimateId(estimate.estimateId);
      setProgressPercent(estimate.progressPercent || undefined);
    }
  }, [linkedEstimates, isEditMode]);

  useEffect(() => {
    if (linkedVariations.length > 0 && isEditMode) {
      setSelectedVariationIds(linkedVariations.map(v => v.variationId));
    }
  }, [linkedVariations, isEditMode]);

  useEffect(() => {
    if (linkedBills.length > 0 && isEditMode) {
      setSelectedBillIds(linkedBills.map(b => b.billId));
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

  const addCustomLine = () => {
    setCustomLines([
      ...customLines,
      {
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

  const getSelectedEstimate = () => {
    return estimates.find(e => e.id === selectedEstimateId);
  };

  const getSelectedVariations = () => {
    return variations.filter(v => selectedVariationIds.includes(v.id));
  };

  const getSelectedBills = () => {
    return bills.filter(b => selectedBillIds.includes(b.id));
  };

  const calculateContractPrice = () => {
    const estimate = getSelectedEstimate();
    if (!estimate) return 0;
    
    // Calculate total from estimate items (prices are per-unit in cents, multiply by quantity for line totals)
    const estimateTotal = estimateItems.reduce((sum, item) => sum + (item.priceIncTax * item.quantity), 0);
    
    if (progressPercent !== undefined) {
      return Math.round(estimateTotal * (progressPercent / 100));
    }
    
    return estimateTotal;
  };

  const calculateVariationsTotal = () => {
    return getSelectedVariations().reduce((sum, v) => sum + v.totalAmount, 0);
  };

  const calculateBillsTotal = () => {
    return getSelectedBills().reduce((sum, b) => sum + b.total, 0);
  };

  const calculateCustomLinesSubtotal = () => {
    return customLines.reduce((sum, item) => sum + item.totalPrice, 0);
  };

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
      const contractPrice = calculateContractPrice() / 100;
      const variations = calculateVariationsTotal() / 100;
      const customLines = calculateCustomLinesSubtotal();
      return contractPrice + variations + customLines;
    } else {
      const bills = calculateBillsTotal() / 100;
      const customLines = calculateCustomLinesSubtotal();
      return bills + customLines;
    }
  };

  const calculateGST = () => {
    const taxableCustom = customLines
      .filter((item) => item.taxable)
      .reduce((sum, item) => sum + item.totalPrice, 0);
    
    const taxableFromItems = currentProject?.invoicingMethod === "progress_payments"
      ? (calculateVariationsTotal() / 100)
      : (calculateBillsTotal() / 100);
    
    return (taxableCustom + taxableFromItems) * 0.1;
  };

  const calculateTotal = () => {
    const subtotal = calculateSubtotal();
    const markup = calculateMarkup();
    const gst = calculateGST();
    return subtotal + markup + gst;
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
    mutationFn: async (data: InvoiceFormData) => {
      const invoiceData = {
        projectId: data.projectId,
        invoiceDate: data.invoiceDate,
        dueDate: data.dueDate,
        invoicingMethod: currentProject?.invoicingMethod || "progress_payments",
        markupPercent: data.markupPercent,
        introductionText: data.introductionText,
        closingText: data.closingText,
        termsAndConditions: data.termsAndConditions,
        subtotal: Math.round(calculateSubtotal() * 100),
        markupAmount: Math.round(calculateMarkup() * 100),
        gstAmount: Math.round(calculateGST() * 100),
        totalAmount: Math.round(calculateTotal() * 100),
        paidAmount: 0,
        balanceAmount: Math.round(calculateTotal() * 100),
        status: "draft",
      };

      const invoiceRes = await apiRequest("/api/client-invoices", "POST", invoiceData);
      const newInvoice = await invoiceRes.json() as ClientInvoice;

      // Create custom line items
      for (let i = 0; i < customLines.length; i++) {
        const item = customLines[i];
        await apiRequest(`/api/client-invoices/${newInvoice.id}/items`, "POST", {
          invoiceId: newInvoice.id,
          description: item.description,
          quantity: item.quantity,
          unitPrice: Math.round(item.unitPrice * 100),
          totalPrice: Math.round(item.totalPrice * 100),
          taxable: item.taxable,
          sortOrder: i,
        });
      }

      // Link estimate if progress payments
      if (selectedEstimateId && currentProject?.invoicingMethod === "progress_payments") {
        await apiRequest(`/api/client-invoices/${newInvoice.id}/estimates`, "POST", {
          invoiceId: newInvoice.id,
          estimateId: selectedEstimateId,
          progressPercent: progressPercent,
        });
      }

      // Link variations
      for (const variationId of selectedVariationIds) {
        await apiRequest(`/api/client-invoices/${newInvoice.id}/variations`, "POST", {
          invoiceId: newInvoice.id,
          variationId,
        });
      }

      // Link bills if cost plus
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
    onSuccess: (invoice) => {
      queryClient.invalidateQueries({ queryKey: ["/api/client-invoices"] });
      
      // Log activity
      if (user?.id) {
        logActivity({
          projectId: invoice.projectId,
          userId: user.id,
          activityType: "invoice",
          action: "created",
          description: `User created invoice '${invoice.invoiceNumber}'`,
          entityId: invoice.id,
          entityName: invoice.invoiceNumber || `INV-${invoice.id.slice(0, 8)}`,
          metadata: {},
        });
      }
      
      toast({
        title: "Success",
        description: "Invoice created successfully",
      });
      handleCancel();
    },
    onError: (error: Error) => {
      toast({
        title: "Error",
        description: error.message || "Failed to create invoice",
        variant: "destructive",
      });
    },
  });

  const updateMutation = useMutation({
    mutationFn: async (data: InvoiceFormData) => {
      const invoiceData = {
        projectId: data.projectId,
        invoiceDate: data.invoiceDate,
        dueDate: data.dueDate,
        invoicingMethod: currentProject?.invoicingMethod || "progress_payments",
        markupPercent: data.markupPercent,
        introductionText: data.introductionText,
        closingText: data.closingText,
        termsAndConditions: data.termsAndConditions,
        subtotal: Math.round(calculateSubtotal() * 100),
        markupAmount: Math.round(calculateMarkup() * 100),
        gstAmount: Math.round(calculateGST() * 100),
        totalAmount: Math.round(calculateTotal() * 100),
        paidAmount: invoice?.paidAmount || 0,
        balanceAmount: Math.round(calculateTotal() * 100) - (invoice?.paidAmount || 0),
      };

      const invoiceRes = await apiRequest(`/api/client-invoices/${effectiveInvoiceId}`, "PATCH", invoiceData);
      const updatedInvoice = await invoiceRes.json() as ClientInvoice;

      // Handle custom line items
      const existingIds = existingCustomLines.map((item) => item.id);
      const currentIds = customLines.map((item) => item.id).filter(Boolean);
      
      const toDelete = existingIds.filter((id) => !currentIds.includes(id));
      for (const itemId of toDelete) {
        await apiRequest(`/api/client-invoice-items/${itemId}`, "DELETE");
      }

      for (let i = 0; i < customLines.length; i++) {
        const item = customLines[i];
        const itemData = {
          invoiceId: effectiveInvoiceId,
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
          await apiRequest(`/api/client-invoices/${effectiveInvoiceId}/items`, "POST", itemData);
        }
      }

      return updatedInvoice;
    },
    onSuccess: (invoice) => {
      queryClient.invalidateQueries({ queryKey: ["/api/client-invoices"] });
      queryClient.invalidateQueries({ queryKey: [`/api/client-invoices/${effectiveInvoiceId}`] });
      
      // Log activity
      if (user?.id) {
        logActivity({
          projectId: invoice.projectId,
          userId: user.id,
          activityType: "invoice",
          action: "updated",
          description: `User updated invoice '${invoice.invoiceNumber}'`,
          entityId: invoice.id,
          entityName: invoice.invoiceNumber || `INV-${invoice.id.slice(0, 8)}`,
          metadata: {},
        });
      }
      
      toast({
        title: "Success",
        description: "Invoice updated successfully",
      });
      handleCancel();
    },
    onError: (error: Error) => {
      toast({
        title: "Error",
        description: error.message || "Failed to update invoice",
        variant: "destructive",
      });
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

      const paymentRes = await apiRequest(`/api/client-invoices/${effectiveInvoiceId}/payments`, "POST", paymentData);
      const newPayment = await paymentRes.json() as ClientInvoicePayment;

      const currentPaidAmount = invoice?.paidAmount || 0;
      const newPaidAmount = currentPaidAmount + Math.round(data.amount * 100);
      const totalAmount = invoice?.totalAmount || 0;
      const newBalanceAmount = totalAmount - newPaidAmount;

      let newStatus = invoice?.status || "draft";
      if (newBalanceAmount <= 0) {
        newStatus = "paid";
      } else if (newPaidAmount > 0) {
        newStatus = "partial";
      }

      await apiRequest(`/api/client-invoices/${effectiveInvoiceId}`, "PATCH", {
        paidAmount: newPaidAmount,
        balanceAmount: newBalanceAmount,
        status: newStatus,
      });

      return newPayment;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [`/api/client-invoices/${effectiveInvoiceId}`] });
      queryClient.invalidateQueries({ queryKey: [`/api/client-invoices/${effectiveInvoiceId}/payments`] });
      queryClient.invalidateQueries({ queryKey: ["/api/client-invoices"] });
      
      // Log activity when invoice is fully paid
      if (invoice) {
        const currentPaidAmount = invoice.paidAmount || 0;
        const newPaidAmount = currentPaidAmount + Math.round(paymentForm.getValues().amount * 100);
        const totalAmount = invoice.totalAmount || 0;
        const newBalanceAmount = totalAmount - newPaidAmount;
        
        if (newBalanceAmount <= 0 && user?.id) {
          logActivity({
            projectId: invoice.projectId,
            userId: user.id,
            activityType: "invoice",
            action: "paid",
            description: `User marked invoice '${invoice.invoiceNumber}' as paid`,
            entityId: invoice.id,
            entityName: invoice.invoiceNumber || `INV-${invoice.id.slice(0, 8)}`,
            metadata: {},
          });
        }
      }
      
      toast({
        title: "Success",
        description: "Payment recorded successfully",
      });
      setPaymentDialogOpen(false);
      paymentForm.reset();
    },
    onError: (error: Error) => {
      toast({
        title: "Error",
        description: error.message || "Failed to record payment",
        variant: "destructive",
      });
    },
  });

  const sendInvoiceMutation = useMutation({
    mutationFn: async () => {
      await apiRequest(`/api/client-invoices/${effectiveInvoiceId}`, "PATCH", {
        status: "sent",
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [`/api/client-invoices/${effectiveInvoiceId}`] });
      queryClient.invalidateQueries({ queryKey: ["/api/client-invoices"] });
      
      // Log activity
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
      
      toast({
        title: "Success",
        description: "Invoice sent successfully",
      });
      handleCancel();
    },
    onError: (error: Error) => {
      toast({
        title: "Error",
        description: error.message || "Failed to send invoice",
        variant: "destructive",
      });
    },
  });

  const onSubmit = (data: InvoiceFormData) => {
    if (isEditMode) {
      updateMutation.mutate(data);
    } else {
      createMutation.mutate(data);
    }
  };

  const onPaymentSubmit = (data: PaymentFormData) => {
    recordPaymentMutation.mutate(data);
  };

  const handleSendInvoice = () => {
    sendInvoiceMutation.mutate();
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
        queryClient.invalidateQueries({ queryKey: [`/api/client-invoices/${effectiveInvoiceId}`] });
      }
    } catch (error: any) {
      const errData = error?.response ? await error.response.json().catch(() => ({})) : {};
      toast({
        title: "Failed to send to Xero",
        description: errData.message || error.message || "Could not push invoice to Xero",
        variant: "destructive",
      });
    } finally {
      setXeroPushing(false);
    }
  };

  const handleCancel = () => {
    if (projectIdFromParams) {
      setLocation(`/projects/${projectIdFromParams}/client-invoices`);
    } else {
      setLocation("/client-invoices");
    }
  };

  if (invoiceLoading) {
    return (
      <div className="flex items-center justify-center h-full">
        <Loader2 className="w-8 h-8 animate-spin text-muted-foreground" data-testid="loader-invoice" />
      </div>
    );
  }

  const total = calculateTotal();
  const paid = invoice?.paidAmount ? invoice.paidAmount / 100 : 0;
  const due = total - paid;

  return (
    <div className="flex flex-col h-full" data-testid="page-client-invoice-detail">
      <Form {...form}>
        <form onSubmit={form.handleSubmit(onSubmit)} className="flex flex-col h-full">
          {/* Row 1 - Title & Actions (36px) */}
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
                <FileText className="w-3 h-3" />
                <span>{isEditMode ? "Update" : "Create"} Invoice</span>
              </button>
            </div>
          </div>

          {/* Row 2 - Summary Info (36px) */}
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
                  onClick={handleSendInvoice}
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
                  {xeroPushing ? <Loader2 className="w-3 h-3 animate-spin" /> : <Send className="w-3 h-3" />}
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
            <div className="flex gap-6 p-6">
              {/* Left Column - Form Fields */}
              <div className="flex-1 space-y-6">
                {/* Row 1: Invoice Name + Invoice Number */}
                <div className="grid grid-cols-3 gap-4">
                  {/* Invoice Name */}
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

                  {/* Invoice Number */}
                  <FormField
                    control={form.control}
                    name="invoiceNumber"
                    render={({ field }) => (
                      <FormItem className="col-span-1">
                        <FormLabel>Invoice Number</FormLabel>
                        <FormControl>
                          <Input {...field} data-testid="input-invoice-number" />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </div>

                {/* Row 2: Invoice Date + Due Date */}
                <div className="grid grid-cols-3 gap-4">
                  {/* Invoice Date */}
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

                  {/* Due Date */}
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

                  {/* Empty third column for spacing */}
                  <div></div>
                </div>

                {/* Introduction Text */}
                <FormField
                  control={form.control}
                  name="introductionText"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Introduction Text</FormLabel>
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

                {/* Dynamic Sections based on Invoicing Method */}
                {currentProject?.invoicingMethod === "progress_payments" && (
                  <>
                    {/* Contract Price Section */}
                    <Card data-testid="section-contract-price">
                      <CardHeader>
                        <CardTitle className="text-base">Contract Price</CardTitle>
                      </CardHeader>
                      <CardContent className="space-y-4">
                        {/* Estimate and Progress Selector Row */}
                        <div className="grid grid-cols-2 gap-4">
                          <Select
                            value={selectedEstimateId}
                            onValueChange={(value) => {
                              setSelectedEstimateId(value);
                              setProgressPercent(undefined);
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
                                  setCustomProgressPercent("");
                                } else {
                                  setCustomProgressPercent("");
                                  setIsCustomProgress(false);
                                  setProgressPercent(parseInt(value));
                                }
                              }}
                            >
                              <SelectTrigger data-testid="select-progress-percent">
                                <SelectValue placeholder="Select progress %" />
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

                        {/* Custom Progress Input */}
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

                        {/* Summary Cards */}
                        <div className="grid grid-cols-3 gap-3">
                          <Card>
                            <CardContent className="p-3">
                              <div className="text-xs text-muted-foreground mb-1">Total</div>
                              <div className="text-sm font-semibold" data-testid="text-contract-price">
                                {formatCurrency(calculateContractPrice() / 100)}
                              </div>
                            </CardContent>
                          </Card>
                          <Card>
                            <CardContent className="p-3">
                              <div className="text-xs text-muted-foreground mb-1">Paid</div>
                              <div className="text-sm font-semibold" data-testid="text-contract-paid">
                                {formatCurrency(0)}
                              </div>
                            </CardContent>
                          </Card>
                          <Card>
                            <CardContent className="p-3">
                              <div className="text-xs text-muted-foreground mb-1">Remaining</div>
                              <div className="text-sm font-semibold" data-testid="text-contract-remaining">
                                {formatCurrency(calculateContractPrice() / 100)}
                              </div>
                            </CardContent>
                          </Card>
                        </div>
                      </CardContent>
                    </Card>

                    {/* Variations Section */}
                    <Card data-testid="section-variations">
                      <CardHeader>
                        <CardTitle className="text-base">Variations</CardTitle>
                      </CardHeader>
                      <CardContent className="space-y-4">
                        {/* Variations Selector */}
                        <Select
                          value={selectedVariationIds[0] || ""}
                          onValueChange={(value) => {
                            if (value && !selectedVariationIds.includes(value)) {
                              setSelectedVariationIds([...selectedVariationIds, value]);
                            }
                          }}
                        >
                          <SelectTrigger data-testid="select-variations">
                            <SelectValue placeholder="Select variations" />
                          </SelectTrigger>
                          <SelectContent>
                            {variations.map((variation) => (
                              <SelectItem 
                                key={variation.id} 
                                value={variation.id}
                                data-testid={`select-variation-${variation.id}`}
                              >
                                {variation.name}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>

                        {/* Selected Variations */}
                        {selectedVariationIds.length > 0 && (
                          <div className="space-y-2">
                            {getSelectedVariations().map((v) => (
                              <div key={v.id} className="flex items-center justify-between text-sm p-2 bg-muted rounded">
                                <span>{v.name}</span>
                                <Button
                                  type="button"
                                  variant="ghost"
                                  size="sm"
                                  onClick={() => setSelectedVariationIds(selectedVariationIds.filter(id => id !== v.id))}
                                  data-testid={`button-remove-variation-${v.id}`}
                                >
                                  <Trash2 className="h-3 w-3" />
                                </Button>
                              </div>
                            ))}
                          </div>
                        )}

                        {/* Summary Cards */}
                        <div className="grid grid-cols-3 gap-3">
                          <Card>
                            <CardContent className="p-3">
                              <div className="text-xs text-muted-foreground mb-1">Total</div>
                              <div className="text-sm font-semibold" data-testid="text-variations-total">
                                {formatCurrency(calculateVariationsTotal() / 100)}
                              </div>
                            </CardContent>
                          </Card>
                          <Card>
                            <CardContent className="p-3">
                              <div className="text-xs text-muted-foreground mb-1">Paid</div>
                              <div className="text-sm font-semibold" data-testid="text-variations-paid">
                                {formatCurrency(0)}
                              </div>
                            </CardContent>
                          </Card>
                          <Card>
                            <CardContent className="p-3">
                              <div className="text-xs text-muted-foreground mb-1">Remaining</div>
                              <div className="text-sm font-semibold" data-testid="text-variations-remaining">
                                {formatCurrency(calculateVariationsTotal() / 100)}
                              </div>
                            </CardContent>
                          </Card>
                        </div>
                      </CardContent>
                    </Card>

                    {/* Allowances Section (Stub) */}
                    <Card data-testid="section-allowances">
                      <CardHeader>
                        <CardTitle className="text-base">Allowances</CardTitle>
                      </CardHeader>
                      <CardContent className="space-y-4">
                        {/* Allowances Selector */}
                        <Select disabled>
                          <SelectTrigger data-testid="select-allowances">
                            <SelectValue placeholder="Coming soon" />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="placeholder">No allowances</SelectItem>
                          </SelectContent>
                        </Select>

                        {/* Summary Cards */}
                        <div className="grid grid-cols-3 gap-3">
                          <Card>
                            <CardContent className="p-3">
                              <div className="text-xs text-muted-foreground mb-1">Total</div>
                              <div className="text-sm font-semibold" data-testid="text-allowances-diff">
                                {formatCurrency(0)}
                              </div>
                            </CardContent>
                          </Card>
                          <Card>
                            <CardContent className="p-3">
                              <div className="text-xs text-muted-foreground mb-1">Paid</div>
                              <div className="text-sm font-semibold" data-testid="text-allowances-paid">
                                {formatCurrency(0)}
                              </div>
                            </CardContent>
                          </Card>
                          <Card>
                            <CardContent className="p-3">
                              <div className="text-xs text-muted-foreground mb-1">Remaining</div>
                              <div className="text-sm font-semibold" data-testid="text-allowances-remaining">
                                {formatCurrency(0)}
                              </div>
                            </CardContent>
                          </Card>
                        </div>
                      </CardContent>
                    </Card>
                  </>
                )}

                {currentProject?.invoicingMethod === "cost_plus" && (
                  <>
                    {/* Bills Section */}
                    <Card data-testid="section-bills">
                      <CardHeader>
                        <CardTitle className="text-base">Bills</CardTitle>
                      </CardHeader>
                      <CardContent className="space-y-4">
                        <div>
                          <FormLabel>Select Bills</FormLabel>
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
                                <SelectItem 
                                  key={bill.id} 
                                  value={bill.id}
                                  data-testid={`select-bill-${bill.id}`}
                                >
                                  {bill.billNumber}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </div>
                        {selectedBillIds.length > 0 && (
                          <div className="space-y-2">
                            {getSelectedBills().map((b) => (
                              <div key={b.id} className="flex items-center justify-between text-sm p-2 bg-muted rounded">
                                <span>{b.billNumber}</span>
                                <Button
                                  type="button"
                                  variant="ghost"
                                  size="sm"
                                  onClick={() => setSelectedBillIds(selectedBillIds.filter(id => id !== b.id))}
                                  data-testid={`button-remove-bill-${b.id}`}
                                >
                                  <Trash2 className="h-3 w-3" />
                                </Button>
                              </div>
                            ))}
                          </div>
                        )}
                        <div className="flex justify-between text-sm">
                          <span className="text-muted-foreground">Bills:</span>
                          <span className="font-medium" data-testid="text-bills-total">
                            {formatCurrency(calculateBillsTotal() / 100)}
                          </span>
                        </div>
                        <div className="flex justify-between text-sm">
                          <span className="text-muted-foreground">Paid:</span>
                          <span className="font-medium" data-testid="text-bills-paid">
                            {formatCurrency(0)}
                          </span>
                        </div>
                        <div className="flex justify-between text-sm">
                          <span className="text-muted-foreground">Remaining:</span>
                          <span className="font-medium" data-testid="text-bills-remaining">
                            {formatCurrency(calculateBillsTotal() / 100)}
                          </span>
                        </div>
                      </CardContent>
                    </Card>

                    {/* Timesheets Section (Stub) */}
                    <Card data-testid="section-timesheets">
                      <CardHeader>
                        <CardTitle className="text-base">Timesheets</CardTitle>
                      </CardHeader>
                      <CardContent>
                        <div>
                          <FormLabel>Select Timesheets</FormLabel>
                          <Select disabled>
                            <SelectTrigger className="mt-2" data-testid="select-timesheets">
                              <SelectValue placeholder="Coming soon" />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="placeholder">No timesheets</SelectItem>
                            </SelectContent>
                          </Select>
                        </div>
                      </CardContent>
                    </Card>

                    {/* Markup Field */}
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
                              onChange={(e) => field.onChange(e.target.value ? parseFloat(e.target.value) : undefined)}
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
                  <CardHeader className="flex flex-row items-center justify-between gap-4 space-y-0">
                    <CardTitle className="text-base">Custom Lines</CardTitle>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={addCustomLine}
                      data-testid="button-add-custom-line"
                    >
                      <Plus className="h-4 w-4 mr-2" />
                      Add Line
                    </Button>
                  </CardHeader>
                  <CardContent>
                    {customLines.length > 0 ? (
                      <Table>
                        <TableHeader>
                          <TableRow>
                            <TableHead>Description</TableHead>
                            <TableHead>Qty</TableHead>
                            <TableHead>Price</TableHead>
                            <TableHead>Total</TableHead>
                            <TableHead></TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {customLines.map((line, index) => (
                            <TableRow key={index} data-testid={`custom-line-${index}`}>
                              <TableCell>
                                <Input
                                  value={line.description}
                                  onChange={(e) => updateCustomLine(index, "description", e.target.value)}
                                  data-testid={`input-custom-description-${index}`}
                                />
                              </TableCell>
                              <TableCell className="w-24">
                                <Input
                                  type="number"
                                  value={line.quantity}
                                  onChange={(e) => updateCustomLine(index, "quantity", parseFloat(e.target.value) || 0)}
                                  data-testid={`input-custom-quantity-${index}`}
                                />
                              </TableCell>
                              <TableCell className="w-32">
                                <Input
                                  type="number"
                                  step="0.01"
                                  value={line.unitPrice}
                                  onChange={(e) => updateCustomLine(index, "unitPrice", parseFloat(e.target.value) || 0)}
                                  data-testid={`input-custom-price-${index}`}
                                />
                              </TableCell>
                              <TableCell className="w-32">
                                <span data-testid={`text-custom-total-${index}`}>
                                  {formatCurrency(line.totalPrice)}
                                </span>
                              </TableCell>
                              <TableCell className="w-12">
                                <Button
                                  type="button"
                                  variant="ghost"
                                  size="icon"
                                  onClick={() => deleteCustomLine(index)}
                                  data-testid={`button-delete-custom-${index}`}
                                >
                                  <Trash2 className="h-4 w-4" />
                                </Button>
                              </TableCell>
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                    ) : (
                      <div className="text-sm text-muted-foreground text-center py-4" data-testid="text-no-custom-lines">
                        No custom lines added
                      </div>
                    )}
                  </CardContent>
                </Card>

                {/* Payments History Section */}
                {isEditMode && (
                  <Card data-testid="section-payments-history">
                    <CardHeader>
                      <div className="flex items-center justify-between">
                        <CardTitle className="text-base">
                          Payments History ({payments.length})
                        </CardTitle>
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          onClick={() => setPaymentDialogOpen(true)}
                          data-testid="button-record-payment"
                        >
                          <Plus className="h-4 w-4 mr-2" />
                          Record Payment
                        </Button>
                      </div>
                    </CardHeader>
                    <CardContent>
                      {payments.length > 0 ? (
                        <Table>
                          <TableHeader>
                            <TableRow>
                              <TableHead data-testid="header-payment-date">Date</TableHead>
                              <TableHead data-testid="header-payment-amount">Amount</TableHead>
                              <TableHead data-testid="header-payment-method">Payment Method</TableHead>
                              <TableHead data-testid="header-payment-reference">Reference</TableHead>
                              <TableHead data-testid="header-payment-recorded-by">Recorded By</TableHead>
                            </TableRow>
                          </TableHeader>
                          <TableBody>
                            {payments.map((payment) => (
                              <TableRow key={payment.id} data-testid={`row-payment-${payment.id}`}>
                                <TableCell data-testid={`text-payment-date-${payment.id}`}>
                                  {payment.paymentDate ? format(new Date(payment.paymentDate), "PPP") : "-"}
                                </TableCell>
                                <TableCell data-testid={`text-payment-amount-${payment.id}`}>
                                  {formatCurrency(payment.amount / 100)}
                                </TableCell>
                                <TableCell data-testid={`text-payment-method-${payment.id}`}>
                                  {payment.paymentMethod || "-"}
                                </TableCell>
                                <TableCell data-testid={`text-payment-reference-${payment.id}`}>
                                  {payment.reference || "-"}
                                </TableCell>
                                <TableCell data-testid={`text-payment-recorded-by-${payment.id}`}>
                                  {payment.recordedBy || "-"}
                                </TableCell>
                              </TableRow>
                            ))}
                          </TableBody>
                        </Table>
                      ) : (
                        <div className="text-sm text-muted-foreground text-center py-4" data-testid="text-no-payments">
                          No payments recorded
                        </div>
                      )}
                    </CardContent>
                  </Card>
                )}

                {/* Closing Text */}
                <FormField
                  control={form.control}
                  name="closingText"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Closing Text</FormLabel>
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

                {/* Terms & Conditions */}
                <FormField
                  control={form.control}
                  name="termsAndConditions"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Terms & Conditions</FormLabel>
                      <Select onValueChange={field.onChange} value={field.value}>
                        <FormControl>
                          <SelectTrigger data-testid="select-terms-conditions">
                            <SelectValue placeholder="Select terms and conditions" />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          <SelectItem value="standard">Standard Terms</SelectItem>
                          <SelectItem value="residential">Residential Building Terms</SelectItem>
                          <SelectItem value="commercial">Commercial Building Terms</SelectItem>
                          <SelectItem value="custom">Custom</SelectItem>
                        </SelectContent>
                      </Select>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                {/* Attachments Section (Stub) */}
                <Card data-testid="section-attachments">
                  <CardHeader>
                    <CardTitle className="text-base flex items-center gap-2">
                      <Paperclip className="h-4 w-4" />
                      Attachments
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="text-sm text-muted-foreground text-center py-4" data-testid="text-no-attachments">
                      No attachments
                    </div>
                  </CardContent>
                </Card>
              </div>

              {/* Right Column - Summary Panel */}
              <div className="w-80 flex-none">
                <Card className="sticky top-6" data-testid="summary-panel">
                  <CardHeader>
                    <CardTitle className="text-base">Summary</CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-3">
                    {currentProject?.invoicingMethod === "cost_plus" && (
                      <div className="flex justify-between text-sm">
                        <span className="text-muted-foreground">Markup:</span>
                        <span className="font-medium" data-testid="text-summary-markup">
                          {formatCurrency(calculateMarkup())}
                        </span>
                      </div>
                    )}
                    <div className="flex justify-between text-sm">
                      <span className="text-muted-foreground">Total ex. tax:</span>
                      <span className="font-medium" data-testid="text-summary-subtotal">
                        {formatCurrency(calculateSubtotal())}
                      </span>
                    </div>
                    <div className="flex justify-between text-sm">
                      <span className="text-muted-foreground">Tax (GST):</span>
                      <span className="font-medium" data-testid="text-summary-tax">
                        {formatCurrency(calculateGST())}
                      </span>
                    </div>
                    <div className="flex justify-between text-base font-semibold pt-3 border-t">
                      <span>Total inc. tax:</span>
                      <span data-testid="text-summary-total">
                        {formatCurrency(total)}
                      </span>
                    </div>
                    <div className="flex justify-between text-base font-semibold">
                      <span>Due:</span>
                      <span data-testid="text-summary-due">
                        {formatCurrency(due)}
                      </span>
                    </div>
                  </CardContent>
                </Card>
              </div>
            </div>
          </div>

          {/* Footer with Additional Actions - only shown for sent/partial invoices */}
          {isEditMode && (invoice?.status === "sent" || invoice?.status === "partial") && (
            <div className="h-9 bg-background flex items-center justify-end px-2 border-t border-border flex-shrink-0">
              <button
                type="button"
                onClick={() => setPaymentDialogOpen(true)}
                className="h-6 w-auto px-2 text-xs border rounded-md bg-[#bba7db] text-white border-[#bba7db]/20 hover:bg-[#bba7db]/90 active-elevate-2 flex items-center gap-1"
                data-testid="button-record-payment-footer"
              >
                <DollarSign className="w-3 h-3" />
                <span>Record Payment</span>
              </button>
            </div>
          )}
        </form>
      </Form>

      {/* Record Payment Dialog */}
      <Dialog open={paymentDialogOpen} onOpenChange={setPaymentDialogOpen}>
        <DialogContent data-testid="dialog-record-payment">
          <DialogHeader>
            <DialogTitle>Record Payment</DialogTitle>
            <DialogDescription>
              Record a payment for this invoice. The invoice status will be automatically updated.
            </DialogDescription>
          </DialogHeader>
          
          <Form {...paymentForm}>
            <form onSubmit={paymentForm.handleSubmit(onPaymentSubmit)} className="space-y-4">
              {/* Amount */}
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

              {/* Payment Date */}
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

              {/* Payment Method */}
              <FormField
                control={paymentForm.control}
                name="paymentMethod"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Payment Method</FormLabel>
                    <Select onValueChange={field.onChange} value={field.value}>
                      <FormControl>
                        <SelectTrigger data-testid="select-payment-method">
                          <SelectValue placeholder="Select payment method" />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        <SelectItem value="Bank Transfer" data-testid="option-bank-transfer">Bank Transfer</SelectItem>
                        <SelectItem value="Credit Card" data-testid="option-credit-card">Credit Card</SelectItem>
                        <SelectItem value="Cash" data-testid="option-cash">Cash</SelectItem>
                        <SelectItem value="Cheque" data-testid="option-cheque">Cheque</SelectItem>
                        <SelectItem value="Other" data-testid="option-other">Other</SelectItem>
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />

              {/* Reference */}
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

              {/* Notes */}
              <FormField
                control={paymentForm.control}
                name="notes"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Notes</FormLabel>
                    <FormControl>
                      <Textarea 
                        {...field} 
                        rows={3} 
                        data-testid="textarea-payment-notes"
                      />
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
                  data-testid="button-cancel-payment"
                >
                  Cancel
                </Button>
                <Button
                  type="submit"
                  disabled={recordPaymentMutation.isPending}
                  data-testid="button-submit-payment"
                >
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
