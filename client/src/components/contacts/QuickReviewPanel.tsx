import { useState, useEffect, useCallback, useMemo } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation, useQuery } from "@tanstack/react-query";
import { X, ChevronLeft, ChevronRight, Trash2, Check, Building2, User, Briefcase, Keyboard, SkipForward } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
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
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { insertContactSchema, type InsertContact, type Contact, type CostCode } from "@shared/schema";
import { z } from "zod";

const quickReviewSchema = z.object({
  name: z.string().min(1, "Name is required"),
  firstName: z.string().optional(),
  lastName: z.string().optional(),
  email: z.string().optional(),
  phone: z.string().optional(),
  mobile: z.string().optional(),
  company: z.string().optional(),
  contactType: z.enum(["team", "supplier", "client"]),
  defaultCostCodeId: z.string().optional(),
  paymentTerms: z.string().optional(),
  role: z.string().optional(),
  notes: z.string().optional(),
});

type QuickReviewFormData = z.infer<typeof quickReviewSchema>;

type QuickReviewPanelProps = {
  open: boolean;
  onClose: () => void;
  contacts: Contact[];
  contactTypeFilter?: "team" | "supplier" | "client" | null;
};

export default function QuickReviewPanel({
  open,
  onClose,
  contacts,
  contactTypeFilter,
}: QuickReviewPanelProps) {
  const { toast } = useToast();
  const [currentIndex, setCurrentIndex] = useState(0);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);

  const eligibleContacts = useMemo(() => {
    return contacts.filter(c => 
      !c.isArchived && 
      (!contactTypeFilter || c.contactType === contactTypeFilter)
    );
  }, [contacts, contactTypeFilter]);

  const unreviewedContacts = useMemo(() => {
    return eligibleContacts.filter(c => c.reviewStatus !== "reviewed");
  }, [eligibleContacts]);

  const currentContact = unreviewedContacts[currentIndex];
  const totalEligible = eligibleContacts.length;
  const reviewedCount = eligibleContacts.filter(c => c.reviewStatus === "reviewed").length;
  const progressPercent = totalEligible > 0 ? (reviewedCount / totalEligible) * 100 : 100;
  const unreviewedCount = unreviewedContacts.length;

  const { data: costCodes = [] } = useQuery<CostCode[]>({
    queryKey: ["/api/cost-codes"],
    enabled: open,
  });

  const form = useForm<QuickReviewFormData>({
    resolver: zodResolver(quickReviewSchema),
    defaultValues: {
      name: "",
      firstName: "",
      lastName: "",
      email: "",
      phone: "",
      mobile: "",
      company: "",
      contactType: "supplier",
      defaultCostCodeId: "__none__",
      paymentTerms: "",
      role: "",
      notes: "",
    },
  });

  useEffect(() => {
    if (currentContact) {
      form.reset({
        name: currentContact.name || "",
        firstName: currentContact.firstName || "",
        lastName: currentContact.lastName || "",
        email: currentContact.email || "",
        phone: currentContact.phone || "",
        mobile: currentContact.mobile || "",
        company: currentContact.company || "",
        contactType: currentContact.contactType,
        defaultCostCodeId: currentContact.defaultCostCodeId || "__none__",
        paymentTerms: currentContact.paymentTerms || "__none__",
        role: currentContact.role || "",
        notes: currentContact.notes || "",
      });
    }
  }, [currentContact, form]);

  useEffect(() => {
    if (currentIndex >= unreviewedContacts.length && unreviewedContacts.length > 0) {
      setCurrentIndex(unreviewedContacts.length - 1);
    } else if (unreviewedContacts.length === 0 && open) {
      setCurrentIndex(0);
    }
  }, [unreviewedContacts.length, currentIndex, open]);

  const updateMutation = useMutation({
    mutationFn: async (data: QuickReviewFormData & { reviewStatus: string; lastReviewedAt: string }) => {
      if (!currentContact) return;
      const patchData: Record<string, unknown> = {
        reviewStatus: data.reviewStatus,
        lastReviewedAt: data.lastReviewedAt,
      };
      
      if (data.name !== currentContact.name) patchData.name = data.name;
      if (data.firstName !== (currentContact.firstName || "")) patchData.firstName = data.firstName || null;
      if (data.lastName !== (currentContact.lastName || "")) patchData.lastName = data.lastName || null;
      if (data.email !== (currentContact.email || "")) patchData.email = data.email || null;
      if (data.phone !== (currentContact.phone || "")) patchData.phone = data.phone || null;
      if (data.mobile !== (currentContact.mobile || "")) patchData.mobile = data.mobile || null;
      if (data.company !== (currentContact.company || "")) patchData.company = data.company || null;
      if (data.role !== (currentContact.role || "")) patchData.role = data.role || null;
      if (data.notes !== (currentContact.notes || "")) patchData.notes = data.notes || null;
      
      const formCostCode = data.defaultCostCodeId === "__none__" ? null : data.defaultCostCodeId;
      if (formCostCode !== (currentContact.defaultCostCodeId || null)) {
        patchData.defaultCostCodeId = formCostCode;
      }
      
      const formPaymentTerms = data.paymentTerms === "__none__" ? null : data.paymentTerms;
      if (formPaymentTerms !== (currentContact.paymentTerms || null)) {
        patchData.paymentTerms = formPaymentTerms;
      }
      
      return await apiRequest(`/api/contacts/${currentContact.id}`, "PATCH", patchData);
    },
    onMutate: async () => {
      await queryClient.cancelQueries({ queryKey: ["/api/contacts"] });
      const previousContacts = queryClient.getQueryData<Contact[]>(["/api/contacts"]);
      if (currentContact && previousContacts) {
        queryClient.setQueryData<Contact[]>(["/api/contacts"], 
          previousContacts.map(c => 
            c.id === currentContact.id 
              ? { ...c, reviewStatus: "reviewed" as const }
              : c
          )
        );
      }
      return { previousContacts };
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/contacts"] });
      toast({ title: "Contact saved & marked as reviewed" });
    },
    onError: (error: Error, _, context) => {
      if (context?.previousContacts) {
        queryClient.setQueryData(["/api/contacts"], context.previousContacts);
      }
      toast({
        title: "Failed to save contact",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const skipMutation = useMutation({
    mutationFn: async () => {
      if (!currentContact) return;
      return await apiRequest(`/api/contacts/${currentContact.id}`, "PATCH", {
        reviewStatus: "skipped",
        lastReviewedAt: new Date().toISOString(),
      });
    },
    onMutate: async () => {
      await queryClient.cancelQueries({ queryKey: ["/api/contacts"] });
      const previousContacts = queryClient.getQueryData<Contact[]>(["/api/contacts"]);
      if (currentContact && previousContacts) {
        queryClient.setQueryData<Contact[]>(["/api/contacts"], 
          previousContacts.map(c => 
            c.id === currentContact.id 
              ? { ...c, reviewStatus: "skipped" as const }
              : c
          )
        );
      }
      return { previousContacts };
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/contacts"] });
    },
    onError: (_, __, context) => {
      if (context?.previousContacts) {
        queryClient.setQueryData(["/api/contacts"], context.previousContacts);
      }
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async () => {
      if (!currentContact) return;
      return await apiRequest(`/api/contacts/${currentContact.id}`, "DELETE");
    },
    onMutate: async () => {
      await queryClient.cancelQueries({ queryKey: ["/api/contacts"] });
      const previousContacts = queryClient.getQueryData<Contact[]>(["/api/contacts"]);
      if (currentContact && previousContacts) {
        queryClient.setQueryData<Contact[]>(["/api/contacts"], 
          previousContacts.filter(c => c.id !== currentContact.id)
        );
      }
      return { previousContacts };
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/contacts"] });
      toast({ title: "Contact deleted" });
      setDeleteDialogOpen(false);
    },
    onError: (error: Error, _, context) => {
      if (context?.previousContacts) {
        queryClient.setQueryData(["/api/contacts"], context.previousContacts);
      }
      toast({
        title: "Failed to delete contact",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const moveToPrevious = useCallback(() => {
    if (currentIndex > 0) {
      setCurrentIndex(prev => prev - 1);
    } else if (unreviewedCount > 1) {
      setCurrentIndex(unreviewedCount - 1);
    }
  }, [currentIndex, unreviewedCount]);

  const moveToNextManual = useCallback(() => {
    if (currentIndex < unreviewedCount - 1) {
      setCurrentIndex(prev => prev + 1);
    } else if (unreviewedCount > 1) {
      setCurrentIndex(0);
    }
  }, [currentIndex, unreviewedCount]);

  const onSubmit = (data: QuickReviewFormData) => {
    updateMutation.mutate({
      ...data,
      reviewStatus: "reviewed",
      lastReviewedAt: new Date().toISOString(),
    });
  };

  const handleSkip = useCallback(() => {
    skipMutation.mutate();
  }, [skipMutation]);

  useEffect(() => {
    if (!open) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (deleteDialogOpen) return;
      
      const target = e.target as HTMLElement;
      const isFormElement = 
        target.tagName === "INPUT" || 
        target.tagName === "TEXTAREA" || 
        target.tagName === "SELECT" ||
        target.isContentEditable ||
        target.closest('[role="listbox"]') ||
        target.closest('[role="combobox"]');
      
      if (isFormElement) {
        if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
          e.preventDefault();
          form.handleSubmit(onSubmit)();
        } else if (e.key === "s" && (e.metaKey || e.ctrlKey)) {
          e.preventDefault();
          handleSkip();
        } else if (e.key === "Escape") {
          e.preventDefault();
          (target as HTMLElement).blur();
        }
        return;
      }
      
      if (e.key === "ArrowLeft" && !e.metaKey && !e.ctrlKey) {
        e.preventDefault();
        moveToPrevious();
      } else if (e.key === "ArrowRight" && !e.metaKey && !e.ctrlKey) {
        e.preventDefault();
        moveToNextManual();
      } else if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
        e.preventDefault();
        form.handleSubmit(onSubmit)();
      } else if (e.key === "Delete" || (e.key === "Backspace" && e.metaKey)) {
        e.preventDefault();
        setDeleteDialogOpen(true);
      } else if (e.key === "Escape") {
        e.preventDefault();
        onClose();
      } else if (e.key === "s" && (e.metaKey || e.ctrlKey)) {
        e.preventDefault();
        handleSkip();
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [open, deleteDialogOpen, moveToPrevious, moveToNextManual, form, onClose, handleSkip]);

  if (!open) return null;

  const contactType = form.watch("contactType");
  const isSupplier = contactType === "supplier";
  const isTeam = contactType === "team";

  const getContactIcon = () => {
    if (isSupplier) return <Building2 className="h-4 w-4" />;
    if (isTeam) return <Briefcase className="h-4 w-4" />;
    return <User className="h-4 w-4" />;
  };

  const getContactTypeLabel = () => {
    if (isSupplier) return "Supplier";
    if (isTeam) return "Team Member";
    return "Client";
  };

  if (unreviewedCount === 0) {
    return (
      <div className="fixed inset-0 z-50 bg-background flex items-center justify-center" data-testid="quick-review-empty">
        <div className="text-center space-y-4">
          <Check className="h-16 w-16 text-green-500 mx-auto" />
          <h2 className="text-2xl font-semibold">All Done!</h2>
          <p className="text-muted-foreground">All contacts have been reviewed.</p>
          <Button onClick={onClose} data-testid="button-close-review">
            Close
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 z-50 bg-background flex flex-col" data-testid="quick-review-panel">
      <div className="flex items-center justify-between px-3 py-2 border-b bg-muted/30">
        <div className="flex items-center gap-3">
          <Button
            variant="ghost"
            size="icon"
            className="h-7 w-7"
            onClick={onClose}
            data-testid="button-close-review"
          >
            <X className="h-4 w-4" />
          </Button>
          <div>
            <h1 className="text-sm font-semibold">Quick Review</h1>
            <p className="text-[11px] text-muted-foreground">
              {currentIndex + 1} of {unreviewedCount} remaining
            </p>
          </div>
        </div>

        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2 w-40">
            <span className="text-[11px] text-muted-foreground whitespace-nowrap">
              {reviewedCount}/{totalEligible}
            </span>
            <Progress value={progressPercent} className="h-1.5" />
          </div>
          
          <Tooltip>
            <TooltipTrigger asChild>
              <Button variant="ghost" size="icon" className="h-7 w-7">
                <Keyboard className="h-3.5 w-3.5" />
              </Button>
            </TooltipTrigger>
            <TooltipContent side="bottom" className="max-w-xs">
              <div className="space-y-0.5 text-[10px]">
                <p><kbd className="px-1 bg-muted rounded">←</kbd> <kbd className="px-1 bg-muted rounded">→</kbd> Navigate</p>
                <p><kbd className="px-1 bg-muted rounded">⌘</kbd>+<kbd className="px-1 bg-muted rounded">Enter</kbd> Save & Next</p>
                <p><kbd className="px-1 bg-muted rounded">⌘</kbd>+<kbd className="px-1 bg-muted rounded">S</kbd> Skip</p>
                <p><kbd className="px-1 bg-muted rounded">Delete</kbd> Remove contact</p>
                <p><kbd className="px-1 bg-muted rounded">Esc</kbd> Close</p>
              </div>
            </TooltipContent>
          </Tooltip>
        </div>
      </div>

      <div className="flex-1 overflow-auto">
        <div className="max-w-2xl mx-auto p-4">
          <div className="flex items-center gap-2 mb-4">
            <Badge variant="secondary" className="gap-1 text-[11px] h-6">
              {getContactIcon()}
              {getContactTypeLabel()}
            </Badge>
            {currentContact?.labels && (currentContact.labels as string[]).length > 0 && (
              <div className="flex gap-1">
                {(currentContact.labels as string[]).slice(0, 3).map(label => (
                  <Badge key={label} variant="outline" className="text-[10px] h-5 bg-[#bba7db]/10 text-[#bba7db] border-[#bba7db]/20">
                    {label}
                  </Badge>
                ))}
              </div>
            )}
          </div>

          <Form {...form}>
            <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-3">
              {isSupplier ? (
                <>
                  <FormField
                    control={form.control}
                    name="company"
                    render={({ field }) => (
                      <FormItem className="space-y-1">
                        <FormLabel className="text-[11px]">Company Name *</FormLabel>
                        <FormControl>
                          <Input 
                            {...field} 
                            value={field.value || ""} 
                            className="h-7 text-[11px]"
                            autoFocus
                            data-testid="input-company"
                          />
                        </FormControl>
                        <FormMessage className="text-[10px]" />
                      </FormItem>
                    )}
                  />

                  <div className="grid grid-cols-2 gap-2">
                    <FormField
                      control={form.control}
                      name="firstName"
                      render={({ field }) => (
                        <FormItem className="space-y-1">
                          <FormLabel className="text-[11px]">Contact First Name</FormLabel>
                          <FormControl>
                            <Input {...field} value={field.value || ""} className="h-7 text-[11px]" data-testid="input-first-name" />
                          </FormControl>
                          <FormMessage className="text-[10px]" />
                        </FormItem>
                      )}
                    />
                    <FormField
                      control={form.control}
                      name="lastName"
                      render={({ field }) => (
                        <FormItem className="space-y-1">
                          <FormLabel className="text-[11px]">Contact Last Name</FormLabel>
                          <FormControl>
                            <Input {...field} value={field.value || ""} className="h-7 text-[11px]" data-testid="input-last-name" />
                          </FormControl>
                          <FormMessage className="text-[10px]" />
                        </FormItem>
                      )}
                    />
                  </div>

                  <div className="grid grid-cols-2 gap-2">
                    <FormField
                      control={form.control}
                      name="phone"
                      render={({ field }) => (
                        <FormItem className="space-y-1">
                          <FormLabel className="text-[11px]">Phone</FormLabel>
                          <FormControl>
                            <Input {...field} value={field.value || ""} className="h-7 text-[11px]" data-testid="input-phone" />
                          </FormControl>
                          <FormMessage className="text-[10px]" />
                        </FormItem>
                      )}
                    />
                    <FormField
                      control={form.control}
                      name="email"
                      render={({ field }) => (
                        <FormItem className="space-y-1">
                          <FormLabel className="text-[11px]">Email</FormLabel>
                          <FormControl>
                            <Input type="email" {...field} value={field.value || ""} className="h-7 text-[11px]" data-testid="input-email" />
                          </FormControl>
                          <FormMessage className="text-[10px]" />
                        </FormItem>
                      )}
                    />
                  </div>

                  <div className="border-t pt-3 space-y-2">
                    <h3 className="text-[11px] font-medium text-muted-foreground">Essential Defaults</h3>
                    
                    <div className="grid grid-cols-2 gap-2">
                      <FormField
                        control={form.control}
                        name="defaultCostCodeId"
                        render={({ field }) => (
                          <FormItem className="space-y-1">
                            <FormLabel className="text-[11px]">Default Cost Code</FormLabel>
                            <Select onValueChange={field.onChange} value={field.value || "__none__"}>
                              <FormControl>
                                <SelectTrigger className="h-7 text-[11px]" data-testid="select-cost-code">
                                  <SelectValue placeholder="Select cost code" />
                                </SelectTrigger>
                              </FormControl>
                              <SelectContent>
                                <SelectItem value="__none__">None</SelectItem>
                                {costCodes.map(cc => (
                                  <SelectItem key={cc.id} value={cc.id}>
                                    {cc.code} - {cc.name}
                                  </SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                            <FormMessage className="text-[10px]" />
                          </FormItem>
                        )}
                      />

                      <FormField
                        control={form.control}
                        name="paymentTerms"
                        render={({ field }) => (
                          <FormItem className="space-y-1">
                            <FormLabel className="text-[11px]">Payment Terms</FormLabel>
                            <Select onValueChange={field.onChange} value={field.value || "__none__"}>
                              <FormControl>
                                <SelectTrigger className="h-7 text-[11px]" data-testid="select-payment-terms">
                                  <SelectValue placeholder="Select terms" />
                                </SelectTrigger>
                              </FormControl>
                              <SelectContent>
                                <SelectItem value="__none__">Not Set</SelectItem>
                                <SelectItem value="COD">COD (Cash on Delivery)</SelectItem>
                                <SelectItem value="Net 7">Net 7</SelectItem>
                                <SelectItem value="Net 14">Net 14</SelectItem>
                                <SelectItem value="Net 30">Net 30</SelectItem>
                                <SelectItem value="Net 60">Net 60</SelectItem>
                                <SelectItem value="EOM">EOM (End of Month)</SelectItem>
                              </SelectContent>
                            </Select>
                            <FormMessage className="text-[10px]" />
                          </FormItem>
                        )}
                      />
                    </div>
                  </div>
                </>
              ) : (
                <>
                  <div className="grid grid-cols-2 gap-2">
                    <FormField
                      control={form.control}
                      name="firstName"
                      render={({ field }) => (
                        <FormItem className="space-y-1">
                          <FormLabel className="text-[11px]">First Name *</FormLabel>
                          <FormControl>
                            <Input 
                              {...field} 
                              value={field.value || ""} 
                              className="h-7 text-[11px]"
                              autoFocus
                              data-testid="input-first-name"
                            />
                          </FormControl>
                          <FormMessage className="text-[10px]" />
                        </FormItem>
                      )}
                    />
                    <FormField
                      control={form.control}
                      name="lastName"
                      render={({ field }) => (
                        <FormItem className="space-y-1">
                          <FormLabel className="text-[11px]">Last Name</FormLabel>
                          <FormControl>
                            <Input 
                              {...field} 
                              value={field.value || ""} 
                              className="h-7 text-[11px]"
                              data-testid="input-last-name"
                            />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                  </div>

                  <div className="grid grid-cols-2 gap-2">
                    <FormField
                      control={form.control}
                      name="phone"
                      render={({ field }) => (
                        <FormItem className="space-y-1">
                          <FormLabel className="text-[11px]">Phone</FormLabel>
                          <FormControl>
                            <Input {...field} value={field.value || ""} className="h-7 text-[11px]" data-testid="input-phone" />
                          </FormControl>
                          <FormMessage className="text-[10px]" />
                        </FormItem>
                      )}
                    />
                    <FormField
                      control={form.control}
                      name="email"
                      render={({ field }) => (
                        <FormItem className="space-y-1">
                          <FormLabel className="text-[11px]">Email</FormLabel>
                          <FormControl>
                            <Input type="email" {...field} value={field.value || ""} className="h-7 text-[11px]" data-testid="input-email" />
                          </FormControl>
                          <FormMessage className="text-[10px]" />
                        </FormItem>
                      )}
                    />
                  </div>

                  {isTeam && (
                    <FormField
                      control={form.control}
                      name="role"
                      render={({ field }) => (
                        <FormItem className="space-y-1">
                          <FormLabel className="text-[11px]">Role / Position</FormLabel>
                          <FormControl>
                            <Input {...field} value={field.value || ""} className="h-7 text-[11px]" data-testid="input-role" />
                          </FormControl>
                          <FormMessage className="text-[10px]" />
                        </FormItem>
                      )}
                    />
                  )}
                </>
              )}
            </form>
          </Form>
        </div>
      </div>

      <div className="flex items-center justify-between px-4 py-2 border-t bg-muted/30">
        <div className="flex items-center gap-1">
          <Button
            variant="ghost"
            size="icon"
            className="h-7 w-7"
            onClick={moveToPrevious}
            disabled={unreviewedCount <= 1}
            data-testid="button-previous"
          >
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            className="h-7 w-7"
            onClick={moveToNextManual}
            disabled={unreviewedCount <= 1}
            data-testid="button-next"
          >
            <ChevronRight className="h-4 w-4" />
          </Button>
          <span className="text-[11px] text-muted-foreground ml-1">
            {currentIndex + 1} / {unreviewedCount}
          </span>
        </div>

        <div className="flex items-center gap-1.5">
          <Button
            variant="ghost"
            size="sm"
            className="h-7 text-[11px] text-destructive hover:text-destructive hover:bg-destructive/10"
            onClick={() => setDeleteDialogOpen(true)}
            data-testid="button-delete"
          >
            <Trash2 className="h-3.5 w-3.5 mr-1" />
            Delete
          </Button>
          
          <Button
            variant="outline"
            size="sm"
            className="h-7 text-[11px]"
            onClick={handleSkip}
            disabled={skipMutation.isPending}
            data-testid="button-skip"
          >
            <SkipForward className="h-3.5 w-3.5 mr-1" />
            Skip
          </Button>
          
          <Button
            size="sm"
            className="h-7 text-[11px] bg-[#bba7db] hover:bg-[#bba7db]/90 text-white"
            onClick={form.handleSubmit(onSubmit)}
            disabled={updateMutation.isPending}
            data-testid="button-save-next"
          >
            <Check className="h-3.5 w-3.5 mr-1" />
            Save & Next
          </Button>
        </div>
      </div>

      <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <AlertDialogContent data-testid="dialog-confirm-delete">
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Contact?</AlertDialogTitle>
            <AlertDialogDescription>
              This will permanently delete "{currentContact?.name || currentContact?.company}". This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel data-testid="button-cancel-delete">Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => deleteMutation.mutate()}
              className="bg-destructive hover:bg-destructive/90"
              data-testid="button-confirm-delete"
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
