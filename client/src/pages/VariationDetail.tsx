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
import { Card, CardContent } from "@/components/ui/card";
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
      <div className="flex-none border-b bg-background">
        <div className="h-12 px-4 flex items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <Button
              variant="ghost"
              size="icon"
              onClick={handleCancel}
              data-testid="button-back"
            >
              <ArrowLeft className="w-4 h-4" />
            </Button>

            <div className="flex items-center gap-2">
              <h1 className="text-lg font-semibold" data-testid="text-page-title">
                {isEditMode ? form.watch("variationNumber") : "New Variation"}
              </h1>
              {isEditMode && variation?.status && getStatusBadge(variation.status)}
            </div>
            
            {projectName && (
              <span className="text-sm text-muted-foreground" data-testid="text-project-name">
                {projectName}
              </span>
            )}
          </div>

          <div className="flex items-center gap-2">
            {isEditMode && variationLoading && (
              <Loader2 className="w-4 h-4 animate-spin text-muted-foreground" />
            )}
            {isEditMode && variation?.status === "draft" && (
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => moveToActionMutation.mutate()}
                disabled={moveToActionMutation.isPending}
                data-testid="button-move-to-action"
              >
                {moveToActionMutation.isPending ? (
                  <Loader2 className="w-4 h-4 animate-spin mr-1" />
                ) : (
                  <Send className="w-4 h-4 mr-1" />
                )}
                Move to Action
              </Button>
            )}
            {isEditMode && variation?.status === "action" && (
              <Button
                type="button"
                size="sm"
                className="bg-[#bba7db] hover:bg-[#bba7db]/90 text-white"
                onClick={() => sendForApprovalMutation.mutate()}
                disabled={sendForApprovalMutation.isPending}
                data-testid="button-send-for-approval"
              >
                {sendForApprovalMutation.isPending ? (
                  <Loader2 className="w-4 h-4 animate-spin mr-1" />
                ) : (
                  <Send className="w-4 h-4 mr-1" />
                )}
                Send for Approval
              </Button>
            )}
            {isEditMode && variation?.status === "pending" && (
              <>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => setRejectDialogOpen(true)}
                  disabled={rejectMutation.isPending}
                  data-testid="button-reject"
                >
                  <X className="w-4 h-4 mr-1" />
                  Reject
                </Button>
                <Button
                  type="button"
                  size="sm"
                  className="bg-green-600 hover:bg-green-600/90 text-white"
                  onClick={() => setApproveDialogOpen(true)}
                  disabled={approveMutation.isPending}
                  data-testid="button-approve"
                >
                  <Check className="w-4 h-4 mr-1" />
                  Approve
                </Button>
              </>
            )}
          </div>
        </div>
      </div>

      <div className="flex-1 overflow-auto">
        <div className="max-w-7xl mx-auto p-6 grid grid-cols-3 gap-6">
          <div className="col-span-2">
            <Form {...form}>
              <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
                <Card>
                  <CardContent className="pt-6 space-y-4">
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
                  </CardContent>
                </Card>

              <Card>
                <CardContent className="pt-6">
                  <div className="space-y-4">
                    <div className="flex items-center justify-between">
                      <h3 className="text-lg font-medium" data-testid="text-cost-lines-title">Cost Lines</h3>
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={addCostLine}
                        data-testid="button-add-cost-line"
                      >
                        <Plus className="h-4 w-4 mr-2" />
                        Add Item
                      </Button>
                    </div>

                    {costLines.length === 0 ? (
                      <div className="text-center py-12 border rounded-lg border-dashed" data-testid="empty-cost-lines">
                        <FileText className="h-12 w-12 mx-auto text-muted-foreground mb-3" />
                        <p className="text-muted-foreground">There are no cost lines added yet</p>
                      </div>
                    ) : (
                      <div className="border rounded-lg">
                        <Table>
                          <TableHeader>
                            <TableRow>
                              <TableHead className="w-[40%]" data-testid="table-header-description">Description</TableHead>
                              <TableHead className="w-[15%]" data-testid="table-header-quantity">Quantity</TableHead>
                              <TableHead className="w-[20%]" data-testid="table-header-unit-price">Unit Price</TableHead>
                              <TableHead className="w-[20%]" data-testid="table-header-total">Total</TableHead>
                              <TableHead className="w-[5%]"></TableHead>
                            </TableRow>
                          </TableHeader>
                          <TableBody>
                            {costLines.map((line, index) => (
                              <TableRow key={index} data-testid={`row-cost-line-${index}`}>
                                <TableCell>
                                  <Input
                                    value={line.description}
                                    onChange={(e) => updateCostLine(index, "description", e.target.value)}
                                    placeholder="Description"
                                    data-testid={`input-description-${index}`}
                                  />
                                </TableCell>
                                <TableCell>
                                  <Input
                                    type="number"
                                    value={line.quantity}
                                    onChange={(e) => updateCostLine(index, "quantity", parseFloat(e.target.value) || 0)}
                                    min="0"
                                    step="1"
                                    data-testid={`input-quantity-${index}`}
                                  />
                                </TableCell>
                                <TableCell>
                                  <Input
                                    type="number"
                                    value={line.unitPrice}
                                    onChange={(e) => updateCostLine(index, "unitPrice", parseFloat(e.target.value) || 0)}
                                    min="0"
                                    step="0.01"
                                    data-testid={`input-unit-price-${index}`}
                                  />
                                </TableCell>
                                <TableCell>
                                  <div className="font-medium" data-testid={`text-total-${index}`}>
                                    {formatCurrency(line.totalPrice)}
                                  </div>
                                </TableCell>
                                <TableCell>
                                  <Button
                                    type="button"
                                    variant="ghost"
                                    size="icon"
                                    onClick={() => deleteCostLine(index)}
                                    data-testid={`button-delete-${index}`}
                                  >
                                    <Trash2 className="h-4 w-4" />
                                  </Button>
                                </TableCell>
                              </TableRow>
                            ))}
                          </TableBody>
                        </Table>
                      </div>
                    )}

                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardContent className="pt-6">
                  <FormField
                    control={form.control}
                    name="closingText"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Closing Text</FormLabel>
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
                </CardContent>
              </Card>

              <Card>
                <CardContent className="pt-6">
                  <div className="space-y-4">
                    <h3 className="text-base font-medium" data-testid="text-attachments-title">Attachments</h3>
                    <div className="text-center py-8 border rounded-lg border-dashed" data-testid="attachments-stub">
                      <p className="text-muted-foreground text-sm">Attachments section coming soon</p>
                    </div>
                  </div>
                </CardContent>
              </Card>

              <div className="flex justify-end items-center gap-3 pb-6">
                <Button
                  type="button"
                  variant="outline"
                  onClick={handleCancel}
                  data-testid="button-cancel"
                >
                  Cancel
                </Button>
                <Button
                  type="submit"
                  className="bg-[#bba7db] hover:bg-[#bba7db]/90 text-white"
                  disabled={createMutation.isPending || updateMutation.isPending}
                  data-testid="button-save"
                >
                  {(createMutation.isPending || updateMutation.isPending) && (
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  )}
                  {isEditMode ? "Save Changes" : "Create Variation"}
                </Button>
              </div>
              </form>
            </Form>
          </div>

          <div className="col-span-1">
            <div className="sticky top-6 space-y-6">
              <Card>
                <CardContent className="pt-6">
                  <h3 className="text-base font-medium mb-4">Summary</h3>
                  <div className="space-y-3">
                    <div className="flex justify-between text-sm">
                      <span className="text-muted-foreground" data-testid="text-label-subtotal">Subtotal</span>
                      <span className="font-medium" data-testid="text-subtotal">
                        {formatCurrency(calculateSubtotal())}
                      </span>
                    </div>
                    <div className="flex justify-between text-sm">
                      <span className="text-muted-foreground" data-testid="text-label-gst">GST (10%)</span>
                      <span className="font-medium" data-testid="text-gst">
                        {formatCurrency(calculateGST())}
                      </span>
                    </div>
                    <div className="flex justify-between text-lg font-semibold pt-3 border-t">
                      <span data-testid="text-label-total">Total</span>
                      <span className="text-[#bba7db]" data-testid="text-total">
                        {formatCurrency(calculateTotal())}
                      </span>
                    </div>
                  </div>
                </CardContent>
              </Card>

              {isEditMode && variation?.daysChanged && variation.daysChanged !== 0 && (
                <Card>
                  <CardContent className="pt-6">
                    <h3 className="text-base font-medium mb-4">Schedule Impact</h3>
                    <div className="flex items-center gap-2">
                      <CalendarIcon className="w-4 h-4 text-muted-foreground" />
                      <span className="text-sm">
                        {variation.daysChanged > 0 ? "+" : ""}{variation.daysChanged} day{Math.abs(variation.daysChanged) !== 1 ? "s" : ""}
                      </span>
                    </div>
                  </CardContent>
                </Card>
              )}

              {isEditMode && variation?.approvalDeadline && (
                <Card>
                  <CardContent className="pt-6">
                    <h3 className="text-base font-medium mb-4">Deadline</h3>
                    <div className="flex items-center gap-2">
                      <Clock className="w-4 h-4 text-muted-foreground" />
                      <span className="text-sm">
                        {format(new Date(variation.approvalDeadline), "PPP")}
                      </span>
                    </div>
                  </CardContent>
                </Card>
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
