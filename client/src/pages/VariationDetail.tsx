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
  Check,
  X,
  Send,
  AlertCircle,
  Clock,
  CheckCircle,
  XCircle
} from "lucide-react";
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
  FormLabel,
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
  status: z.enum(["draft", "action", "pending", "approved", "rejected"]).default("draft"),
});

type VariationFormData = z.infer<typeof variationFormSchema>;

type CostLine = {
  id?: string;
  description: string;
  quantity: number;
  unitPrice: number;
  totalPrice: number;
  taxable: boolean;
  sortOrder: number;
};

export default function VariationDetail() {
  const { id, variationId, projectId: projectIdFromParams } = useParams<{ 
    id?: string; 
    variationId?: string; 
    projectId?: string 
  }>();
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const { user } = useAuth();
  
  // Normalize variation ID - prioritize variationId (from project-scoped routes), fall back to id (from global routes)
  const effectiveVariationId = variationId || id;
  const isEditMode = !!(effectiveVariationId && effectiveVariationId !== "new");

  const [costLines, setCostLines] = useState<CostLine[]>([]);
  const [rejectDialogOpen, setRejectDialogOpen] = useState(false);
  const [rejectReason, setRejectReason] = useState("");
  const [approveDialogOpen, setApproveDialogOpen] = useState(false);

  const { data: variation, isLoading: variationLoading } = useQuery<Variation>({
    queryKey: [`/api/variations/${effectiveVariationId}`],
    enabled: isEditMode,
  });

  const { data: existingCostLines = [] } = useQuery<VariationItem[]>({
    queryKey: [`/api/variations/${effectiveVariationId}/items`],
    enabled: isEditMode,
  });

  const { data: projects = [] } = useQuery<Project[]>({
    queryKey: ["/api/projects"],
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
      status: "draft",
    },
  });

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
        status: variation.status as "draft" | "action" | "pending" | "approved" | "rejected",
      });
    }
  }, [variation, isEditMode, form]);

  useEffect(() => {
    if (existingCostLines.length > 0 && isEditMode) {
      setCostLines(
        existingCostLines.map((item) => ({
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
  }, [existingCostLines, isEditMode]);

  useEffect(() => {
    if (!isEditMode && projects.length > 0) {
      const projectIdToUse = projectIdFromParams || projects[0]?.id;
      if (projectIdToUse) {
        form.setValue("projectId", projectIdToUse);
        
        // Variation number will be auto-generated on backend
        form.setValue("variationNumber", "Auto-generated");
      }
    }
  }, [projects, isEditMode, form, projectIdFromParams]);

  const addCostLine = () => {
    setCostLines([
      ...costLines,
      {
        description: "",
        quantity: 1,
        unitPrice: 0,
        totalPrice: 0,
        taxable: true,
        sortOrder: costLines.length,
      },
    ]);
  };

  const updateCostLine = (index: number, field: keyof CostLine, value: any) => {
    const updated = [...costLines];
    updated[index] = { ...updated[index], [field]: value };
    
    if (field === "quantity" || field === "unitPrice") {
      const qty = field === "quantity" ? value : updated[index].quantity;
      const price = field === "unitPrice" ? value : updated[index].unitPrice;
      updated[index].totalPrice = qty * price;
    }
    
    setCostLines(updated);
  };

  const deleteCostLine = (index: number) => {
    setCostLines(costLines.filter((_, i) => i !== index));
  };

  const calculateSubtotal = () => {
    return costLines.reduce((sum, item) => sum + item.totalPrice, 0);
  };

  const calculateGST = () => {
    const taxableAmount = costLines
      .filter((item) => item.taxable)
      .reduce((sum, item) => sum + item.totalPrice, 0);
    return taxableAmount * 0.1;
  };

  const calculateTotal = () => {
    const subtotal = calculateSubtotal();
    const gst = calculateGST();
    return subtotal + gst;
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
        await apiRequest(`/api/variations/${newVariation.id}/items`, "POST", {
          variationId: newVariation.id,
          description: item.description,
          quantity: item.quantity,
          unitPrice: Math.round(item.unitPrice * 100),
          totalPrice: Math.round(item.totalPrice * 100),
          taxable: item.taxable,
          sortOrder: i,
        });
      }

      return newVariation;
    },
    onSuccess: (newVariation) => {
      queryClient.invalidateQueries({ queryKey: ["/api/variations"] });
      toast({
        title: "Success",
        description: "Variation created successfully",
      });
      
      if (user?.id) {
        logActivity({
          projectId: newVariation.projectId,
          userId: user.id,
          activityType: "variation",
          action: "created",
          description: `User created variation '${newVariation.name}'`,
          entityId: newVariation.id,
          entityName: newVariation.name,
          metadata: {}
        });
      }
      
      handleCancel();
    },
    onError: (error: Error) => {
      toast({
        title: "Error",
        description: error.message || "Failed to create variation",
        variant: "destructive",
      });
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

      const existingIds = existingCostLines.map((item) => item.id);
      const currentIds = costLines.map((item) => item.id).filter(Boolean);
      
      const toDelete = existingIds.filter((id) => !currentIds.includes(id));
      for (const itemId of toDelete) {
        await apiRequest(`/api/variation-items/${itemId}`, "DELETE");
      }

      for (let i = 0; i < costLines.length; i++) {
        const item = costLines[i];
        const itemData = {
          variationId: effectiveVariationId,
          description: item.description,
          quantity: item.quantity,
          unitPrice: Math.round(item.unitPrice * 100),
          totalPrice: Math.round(item.totalPrice * 100),
          taxable: item.taxable,
          sortOrder: i,
        };

        if (item.id) {
          await apiRequest(`/api/variation-items/${item.id}`, "PATCH", itemData);
        } else {
          await apiRequest(`/api/variations/${effectiveVariationId}/items`, "POST", itemData);
        }
      }

      return updatedVariation;
    },
    onSuccess: (updatedVariation) => {
      queryClient.invalidateQueries({ queryKey: ["/api/variations"] });
      queryClient.invalidateQueries({ queryKey: [`/api/variations/${effectiveVariationId}`] });
      toast({
        title: "Success",
        description: "Variation updated successfully",
      });
      
      if (user?.id) {
        logActivity({
          projectId: updatedVariation.projectId,
          userId: user.id,
          activityType: "variation",
          action: "updated",
          description: `User updated variation '${updatedVariation.name}'`,
          entityId: updatedVariation.id,
          entityName: updatedVariation.name,
          metadata: {}
        });
      }
      
      handleCancel();
    },
    onError: (error: Error) => {
      toast({
        title: "Error",
        description: error.message || "Failed to update variation",
        variant: "destructive",
      });
    },
  });

  const moveToActionMutation = useMutation({
    mutationFn: async () => {
      const response = await apiRequest(`/api/variations/${effectiveVariationId}`, "PATCH", {
        status: "action"
      });
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/variations"] });
      queryClient.invalidateQueries({ queryKey: [`/api/variations/${effectiveVariationId}`] });
      toast({
        title: "Success",
        description: "Variation moved to Action",
      });
    },
    onError: (error: Error) => {
      toast({
        title: "Error",
        description: error.message || "Failed to move variation to Action",
        variant: "destructive",
      });
    },
  });

  const sendForApprovalMutation = useMutation({
    mutationFn: async () => {
      const response = await apiRequest(`/api/variations/${effectiveVariationId}`, "PATCH", {
        status: "pending"
      });
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/variations"] });
      queryClient.invalidateQueries({ queryKey: [`/api/variations/${effectiveVariationId}`] });
      toast({
        title: "Success",
        description: "Variation sent for approval",
      });
    },
    onError: (error: Error) => {
      toast({
        title: "Error",
        description: error.message || "Failed to send variation for approval",
        variant: "destructive",
      });
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
      toast({
        title: "Success",
        description: "Variation approved successfully",
      });
      
      if (user?.id) {
        logActivity({
          projectId: approvedVariation.projectId,
          userId: user.id,
          activityType: "variation",
          action: "approved",
          description: `User approved variation '${approvedVariation.name}'`,
          entityId: approvedVariation.id,
          entityName: approvedVariation.name,
          metadata: {}
        });
      }
    },
    onError: (error: Error) => {
      toast({
        title: "Error",
        description: error.message || "Failed to approve variation",
        variant: "destructive",
      });
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
      toast({
        title: "Success",
        description: "Variation rejected",
      });
      
      if (user?.id) {
        logActivity({
          projectId: rejectedVariation.projectId,
          userId: user.id,
          activityType: "variation",
          action: "rejected",
          description: `User rejected variation '${rejectedVariation.name}'`,
          entityId: rejectedVariation.id,
          entityName: rejectedVariation.name,
          metadata: {}
        });
      }
    },
    onError: (error: Error) => {
      toast({
        title: "Error",
        description: error.message || "Failed to reject variation",
        variant: "destructive",
      });
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
        return (
          <Badge variant="secondary" data-testid="badge-status-draft">
            <FileText className="w-3 h-3 mr-1" />
            Draft
          </Badge>
        );
      case "action":
        return (
          <Badge variant="destructive" data-testid="badge-status-action">
            <AlertCircle className="w-3 h-3 mr-1" />
            Action
          </Badge>
        );
      case "pending":
        return (
          <Badge variant="default" data-testid="badge-status-pending">
            <Clock className="w-3 h-3 mr-1" />
            Pending
          </Badge>
        );
      case "approved":
        return (
          <Badge variant="outline" className="border-green-500 text-green-700" data-testid="badge-status-approved">
            <CheckCircle className="w-3 h-3 mr-1" />
            Approved
          </Badge>
        );
      case "rejected":
        return (
          <Badge variant="outline" className="border-red-500 text-red-700" data-testid="badge-status-rejected">
            <XCircle className="w-3 h-3 mr-1" />
            Rejected
          </Badge>
        );
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
            {isEditMode && variationLoading && (
              <Loader2 className="w-3 h-3 animate-spin text-muted-foreground" />
            )}
            {isEditMode && variation?.status === "draft" && (
              <button
                type="button"
                onClick={() => moveToActionMutation.mutate()}
                disabled={moveToActionMutation.isPending}
                className="h-6 w-auto px-2 text-xs border rounded-md hover-elevate active-elevate-2 flex items-center gap-1"
                data-testid="button-move-to-action"
              >
                {moveToActionMutation.isPending ? (
                  <Loader2 className="w-3 h-3 animate-spin" />
                ) : (
                  <Send className="w-3 h-3" />
                )}
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
                {sendForApprovalMutation.isPending ? (
                  <Loader2 className="w-3 h-3 animate-spin" />
                ) : (
                  <Send className="w-3 h-3" />
                )}
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

      </div>{/* end unified header card */}

      <div className="flex-1 overflow-auto">
        <div className="max-w-5xl mx-auto px-3 py-3 grid grid-cols-3 gap-3">
          <div className="col-span-2">
            <Form {...form}>
              <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-3">

                {/* General Info section */}
                <div className="rounded-lg border border-border bg-card overflow-hidden">
                  <div className="h-8 flex items-center px-3 gap-2 border-b border-border/50 bg-muted/40">
                    <div className="w-1.5 h-1.5 rounded-full bg-[#bba7db]/80 flex-shrink-0" />
                    <span className="text-xs font-medium text-muted-foreground uppercase tracking-wide">General Info</span>
                  </div>
                  <div className="p-4 space-y-4">
                    <FormField
                      control={form.control}
                      name="name"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Name *</FormLabel>
                          <FormControl>
                            <Input
                              placeholder="Enter variation name"
                              {...field}
                              data-testid="input-name"
                            />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <FormField
                        control={form.control}
                        name="approvalDeadline"
                        render={({ field }) => (
                          <FormItem className="flex flex-col">
                            <FormLabel>Approval Deadline</FormLabel>
                            <Popover>
                              <PopoverTrigger asChild>
                                <FormControl>
                                  <Button
                                    variant="outline"
                                    className={cn(
                                      "justify-start text-left font-normal",
                                      !field.value && "text-muted-foreground"
                                    )}
                                    data-testid="button-approval-deadline"
                                  >
                                    <CalendarIcon className="mr-2 h-4 w-4" />
                                    {field.value ? format(field.value, "PPP") : "Pick a date"}
                                  </Button>
                                </FormControl>
                              </PopoverTrigger>
                              <PopoverContent className="w-auto p-0" align="start">
                                <Calendar
                                  mode="single"
                                  selected={field.value}
                                  onSelect={field.onChange}
                                  initialFocus
                                  data-testid="calendar-approval-deadline"
                                />
                              </PopoverContent>
                            </Popover>
                            <FormMessage />
                          </FormItem>
                        )}
                      />

                      <FormField
                        control={form.control}
                        name="daysChanged"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>Days Changed</FormLabel>
                            <FormControl>
                              <Input
                                type="number"
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

                    <FormField
                      control={form.control}
                      name="introductionText"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Introduction Text</FormLabel>
                          <FormControl>
                            <Textarea
                              placeholder="Enter introduction text"
                              className="resize-none min-h-[80px]"
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

                {/* Cost Lines section */}
                <div className="rounded-lg border border-border bg-card overflow-hidden">
                  <div className="h-8 flex items-center justify-between px-3 gap-2 border-b border-border/50 bg-muted/40">
                    <div className="flex items-center gap-2">
                      <div className="w-1.5 h-1.5 rounded-full bg-amber-400/70 flex-shrink-0" />
                      <span className="text-xs font-medium text-muted-foreground uppercase tracking-wide" data-testid="text-cost-lines-title">Cost Lines</span>
                    </div>
                    <button
                      type="button"
                      onClick={addCostLine}
                      className="h-6 w-auto px-2 text-xs border rounded-md hover-elevate active-elevate-2 flex items-center gap-1"
                      data-testid="button-add-cost-line"
                    >
                      <Plus className="h-3 w-3" />
                      <span>Add Item</span>
                    </button>
                  </div>
                  <div className="p-4">
                    {costLines.length === 0 ? (
                      <div className="text-center py-10 border rounded-md border-dashed" data-testid="empty-cost-lines">
                        <FileText className="h-8 w-8 mx-auto text-muted-foreground mb-2" />
                        <p className="text-muted-foreground text-sm">No cost lines added yet</p>
                      </div>
                    ) : (
                      <div className="border rounded-md overflow-hidden">
                        <Table>
                          <TableHeader>
                            <TableRow className="bg-muted/30 hover:bg-muted/30">
                              <TableHead className="w-[40%] text-[10px] uppercase tracking-wide text-muted-foreground/50 font-normal py-1.5 px-3" data-testid="table-header-description">Description</TableHead>
                              <TableHead className="w-[15%] text-[10px] uppercase tracking-wide text-muted-foreground/50 font-normal py-1.5 px-3" data-testid="table-header-quantity">Qty</TableHead>
                              <TableHead className="w-[20%] text-[10px] uppercase tracking-wide text-muted-foreground/50 font-normal py-1.5 px-3" data-testid="table-header-unit-price">Unit Price</TableHead>
                              <TableHead className="w-[20%] text-right text-[10px] uppercase tracking-wide text-muted-foreground/50 font-normal py-1.5 px-3" data-testid="table-header-total">Total</TableHead>
                              <TableHead className="w-[5%]" />
                            </TableRow>
                          </TableHeader>
                          <TableBody>
                            {costLines.map((line, index) => (
                              <TableRow key={index} data-testid={`row-cost-line-${index}`}>
                                <TableCell className="px-3 py-1.5">
                                  <Input
                                    value={line.description}
                                    onChange={(e) => updateCostLine(index, "description", e.target.value)}
                                    placeholder="Description"
                                    className="h-7 text-xs"
                                    data-testid={`input-description-${index}`}
                                  />
                                </TableCell>
                                <TableCell className="px-3 py-1.5">
                                  <Input
                                    type="number"
                                    value={line.quantity}
                                    onChange={(e) => updateCostLine(index, "quantity", parseFloat(e.target.value) || 0)}
                                    min="0"
                                    step="1"
                                    className="h-7 text-xs"
                                    data-testid={`input-quantity-${index}`}
                                  />
                                </TableCell>
                                <TableCell className="px-3 py-1.5">
                                  <Input
                                    type="number"
                                    value={line.unitPrice}
                                    onChange={(e) => updateCostLine(index, "unitPrice", parseFloat(e.target.value) || 0)}
                                    min="0"
                                    step="0.01"
                                    className="h-7 text-xs"
                                    data-testid={`input-unit-price-${index}`}
                                  />
                                </TableCell>
                                <TableCell className="px-3 py-1.5 text-right">
                                  <span className="text-xs font-medium tabular-nums" data-testid={`text-total-${index}`}>
                                    {formatCurrency(line.totalPrice)}
                                  </span>
                                </TableCell>
                                <TableCell className="px-2 py-1.5">
                                  <button
                                    type="button"
                                    onClick={() => deleteCostLine(index)}
                                    className="h-6 w-6 flex items-center justify-center rounded-md hover-elevate active-elevate-2 text-muted-foreground"
                                    data-testid={`button-delete-${index}`}
                                  >
                                    <Trash2 className="h-3.5 w-3.5" />
                                  </button>
                                </TableCell>
                              </TableRow>
                            ))}
                          </TableBody>
                        </Table>
                      </div>
                    )}
                  </div>
                </div>

                {/* Closing Text section */}
                <div className="rounded-lg border border-border bg-card overflow-hidden">
                  <div className="h-8 flex items-center px-3 gap-2 border-b border-border/50 bg-muted/40">
                    <div className="w-1.5 h-1.5 rounded-full bg-sky-400/70 flex-shrink-0" />
                    <span className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Closing Text</span>
                  </div>
                  <div className="p-4">
                    <FormField
                      control={form.control}
                      name="closingText"
                      render={({ field }) => (
                        <FormItem>
                          <FormControl>
                            <Textarea
                              placeholder="Enter closing text"
                              className="resize-none min-h-[80px]"
                              {...field}
                              data-testid="textarea-closing"
                            />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                  </div>
                </div>

                {/* Attachments section */}
                <div className="rounded-lg border border-border bg-card overflow-hidden">
                  <div className="h-8 flex items-center px-3 gap-2 border-b border-border/50 bg-muted/40">
                    <div className="w-1.5 h-1.5 rounded-full bg-slate-400/70 flex-shrink-0" />
                    <span className="text-xs font-medium text-muted-foreground uppercase tracking-wide" data-testid="text-attachments-title">Attachments</span>
                  </div>
                  <div className="p-4">
                    <div className="text-center py-8 border rounded-md border-dashed" data-testid="attachments-stub">
                      <p className="text-muted-foreground text-sm">Attachments coming soon</p>
                    </div>
                  </div>
                </div>

              </form>
            </Form>
          </div>

          {/* Right column */}
          <div className="col-span-1">
            <div className="sticky top-3 space-y-3">

              {/* Summary card */}
              <div className="rounded-lg border border-border bg-card overflow-hidden">
                <div className="h-8 flex items-center px-3 gap-2 border-b border-border/50 bg-muted/40">
                  <div className="w-1.5 h-1.5 rounded-full bg-emerald-400/70 flex-shrink-0" />
                  <span className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Summary</span>
                </div>
                <div className="p-4 space-y-2.5">
                  <div className="flex justify-between text-xs">
                    <span className="text-muted-foreground" data-testid="text-label-subtotal">Subtotal</span>
                    <span className="font-medium tabular-nums" data-testid="text-subtotal">{formatCurrency(calculateSubtotal())}</span>
                  </div>
                  <div className="flex justify-between text-xs">
                    <span className="text-muted-foreground" data-testid="text-label-gst">GST (10%)</span>
                    <span className="font-medium tabular-nums" data-testid="text-gst">{formatCurrency(calculateGST())}</span>
                  </div>
                  <div className="flex justify-between pt-2.5 border-t">
                    <span className="text-sm font-semibold" data-testid="text-label-total">Total</span>
                    <span className="text-sm font-semibold tabular-nums text-[#bba7db]" data-testid="text-total">{formatCurrency(calculateTotal())}</span>
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

            </div>
          </div>
        </div>
      </div>

      <Dialog open={approveDialogOpen} onOpenChange={setApproveDialogOpen}>
        <DialogContent data-testid="dialog-approve-variation">
          <DialogHeader>
            <DialogTitle>Approve Variation</DialogTitle>
            <DialogDescription>
              Are you sure you want to approve this variation?
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => setApproveDialogOpen(false)}
              data-testid="button-cancel-approve"
            >
              Cancel
            </Button>
            <Button
              type="button"
              variant="default"
              onClick={() => approveMutation.mutate()}
              disabled={approveMutation.isPending}
              data-testid="button-confirm-approve"
            >
              {approveMutation.isPending ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Approving...
                </>
              ) : (
                <>
                  <Check className="mr-2 h-4 w-4" />
                  Approve Variation
                </>
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={rejectDialogOpen} onOpenChange={setRejectDialogOpen}>
        <DialogContent data-testid="dialog-reject-variation">
          <DialogHeader>
            <DialogTitle>Reject Variation</DialogTitle>
            <DialogDescription>
              Please provide a reason for rejecting this variation.
            </DialogDescription>
          </DialogHeader>
          <Textarea
            value={rejectReason}
            onChange={(e) => setRejectReason(e.target.value)}
            placeholder="Enter rejection reason..."
            rows={4}
            data-testid="textarea-reject-reason"
          />
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => {
                setRejectDialogOpen(false);
                setRejectReason("");
              }}
              data-testid="button-cancel-reject"
            >
              Cancel
            </Button>
            <Button
              type="button"
              variant="destructive"
              onClick={() => rejectMutation.mutate(rejectReason)}
              disabled={!rejectReason.trim() || rejectMutation.isPending}
              data-testid="button-confirm-reject"
            >
              {rejectMutation.isPending ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Rejecting...
                </>
              ) : (
                <>
                  <X className="mr-2 h-4 w-4" />
                  Reject Variation
                </>
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
