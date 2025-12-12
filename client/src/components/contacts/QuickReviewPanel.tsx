import { useState, useEffect, useCallback, useMemo } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation, useQuery } from "@tanstack/react-query";
import { ChevronLeft, ChevronRight, Trash2, Check, Building2, User, Briefcase, SkipForward, Users, Keyboard } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
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
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { type Contact, type CostCode } from "@shared/schema";
import { z } from "zod";

const quickReviewSchema = z.object({
  name: z.string().min(1, "Business name is required"),
  firstName: z.string().optional(),
  lastName: z.string().optional(),
  email: z.string().optional(),
  phone: z.string().optional(),
  mobile: z.string().optional(),
  company: z.string().optional(),
  contactType: z.enum(["team", "trade", "supplier", "client"]),
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
  contactTypeFilter?: "team" | "trade" | "supplier" | "client" | null;
};

function findSimilarContacts(current: Contact, allContacts: Contact[]): Contact[] {
  if (!current) return [];
  const name = (current.name || current.company || "").toLowerCase().trim();
  if (!name || name.length < 3) return [];
  
  return allContacts.filter(c => {
    if (c.id === current.id || c.isArchived) return false;
    const otherName = (c.name || c.company || "").toLowerCase().trim();
    if (!otherName || otherName.length < 3) return false;
    
    // Check for substring match or similar words
    if (name.includes(otherName) || otherName.includes(name)) return true;
    
    // Check first word match (for company names)
    const nameWords = name.split(/\s+/);
    const otherWords = otherName.split(/\s+/);
    if (nameWords[0] && otherWords[0] && nameWords[0].length > 2 && 
        (nameWords[0] === otherWords[0] || nameWords[0].includes(otherWords[0]) || otherWords[0].includes(nameWords[0]))) {
      return true;
    }
    
    return false;
  }).slice(0, 5);
}

export default function QuickReviewPanel({
  open,
  onClose,
  contacts,
  contactTypeFilter,
}: QuickReviewPanelProps) {
  const { toast } = useToast();
  const [currentIndex, setCurrentIndex] = useState(0);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [mergeTargetId, setMergeTargetId] = useState<string | null>(null);

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

  const similarContacts = useMemo(() => {
    return currentContact ? findSimilarContacts(currentContact, contacts) : [];
  }, [currentContact, contacts]);

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
        mobile: currentContact.mobile || currentContact.phone || "",
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
      if (data.contactType !== currentContact.contactType) patchData.contactType = data.contactType;
      
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

  const mergeMutation = useMutation({
    mutationFn: async (targetId: string) => {
      if (!currentContact) return;
      return await apiRequest("/api/contacts/merge", "POST", {
        sourceId: currentContact.id,
        targetId,
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/contacts"] });
      toast({ title: "Contacts merged successfully" });
      setMergeTargetId(null);
      // Reset to first contact after merge since current contact was archived
      setCurrentIndex(0);
    },
    onError: (error: Error) => {
      toast({
        title: "Failed to merge contacts",
        description: error.message,
        variant: "destructive",
      });
      setMergeTargetId(null);
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

  if (unreviewedCount === 0 && open) {
    return (
      <Dialog open={open} onOpenChange={(next) => { if (!next) onClose(); }}>
        <DialogContent className="max-w-md" data-testid="quick-review-empty">
          <div className="text-center py-8 space-y-4">
            <Check className="h-16 w-16 text-green-500 mx-auto" />
            <h2 className="text-xl font-semibold">All Done!</h2>
            <p className="text-muted-foreground">All contacts have been reviewed.</p>
            <Button onClick={onClose} data-testid="button-close-review">
              Close
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    );
  }

  return (
    <>
      <Dialog open={open} onOpenChange={(next) => { if (!next) onClose(); }}>
        <DialogContent className="max-w-lg h-[80vh] flex flex-col" data-testid="quick-review-panel">
          <DialogHeader className="pb-2 flex-shrink-0">
            <div className="flex items-center justify-between">
              <DialogTitle className="text-sm font-semibold">Quick Review</DialogTitle>
              <div className="flex items-center gap-3">
                <div className="flex items-center gap-2">
                  <span className="text-[11px] text-muted-foreground">
                    {reviewedCount}/{totalEligible}
                  </span>
                  <Progress value={progressPercent} className="h-1.5 w-20" />
                </div>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button variant="ghost" size="icon" className="h-6 w-6">
                      <Keyboard className="h-3.5 w-3.5" />
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent side="bottom" className="max-w-xs">
                    <div className="space-y-0.5 text-[10px]">
                      <p><kbd className="px-1 bg-muted rounded">←</kbd> <kbd className="px-1 bg-muted rounded">→</kbd> Navigate</p>
                      <p><kbd className="px-1 bg-muted rounded">Esc</kbd> Close</p>
                    </div>
                  </TooltipContent>
                </Tooltip>
              </div>
            </div>
            <p className="text-[11px] text-muted-foreground">
              {currentIndex + 1} of {unreviewedCount} remaining
            </p>
          </DialogHeader>

          <div className="flex-1 overflow-y-auto space-y-4">
            <div className="flex items-center gap-2">
              <FormField
                control={form.control}
                name="contactType"
                render={({ field }) => (
                  <Select onValueChange={field.onChange} value={field.value}>
                    <SelectTrigger className="h-7 w-auto min-w-[100px] text-[11px] gap-1" data-testid="select-contact-type">
                      {field.value === "supplier" && <Building2 className="h-3 w-3" />}
                      {field.value === "trade" && <Briefcase className="h-3 w-3" />}
                      {field.value === "client" && <User className="h-3 w-3" />}
                      {field.value === "team" && <Users className="h-3 w-3" />}
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="team">Team</SelectItem>
                      <SelectItem value="trade">Trade</SelectItem>
                      <SelectItem value="supplier">Supplier</SelectItem>
                      <SelectItem value="client">Client</SelectItem>
                    </SelectContent>
                  </Select>
                )}
              />
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
                {/* Business Name */}
                <FormField
                  control={form.control}
                  name="name"
                  render={({ field }) => (
                    <FormItem className="space-y-1">
                      <FormLabel className="text-[11px]">Business Name *</FormLabel>
                      <FormControl>
                        <Input 
                          {...field} 
                          value={field.value || ""} 
                          className="h-7 text-[11px]"
                          autoFocus
                          data-testid="input-name"
                        />
                      </FormControl>
                      <FormMessage className="text-[10px]" />
                    </FormItem>
                  )}
                />

                {isSupplier && (
                  <>
                    <div className="grid grid-cols-2 gap-2">
                      <FormField
                        control={form.control}
                        name="firstName"
                        render={({ field }) => (
                          <FormItem className="space-y-1">
                            <FormLabel className="text-[11px]">Key Person First Name</FormLabel>
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
                            <FormLabel className="text-[11px]">Key Person Last Name</FormLabel>
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
                        name="mobile"
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
                      <h3 className="text-[11px] font-medium text-muted-foreground">Defaults</h3>
                      
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
                                  <SelectItem value="COD">COD</SelectItem>
                                  <SelectItem value="Net 7">Net 7</SelectItem>
                                  <SelectItem value="Net 14">Net 14</SelectItem>
                                  <SelectItem value="Net 30">Net 30</SelectItem>
                                  <SelectItem value="Net 60">Net 60</SelectItem>
                                  <SelectItem value="EOM">EOM</SelectItem>
                                </SelectContent>
                              </Select>
                              <FormMessage className="text-[10px]" />
                            </FormItem>
                          )}
                        />
                      </div>
                    </div>
                  </>
                )}

                {!isSupplier && (
                  <>
                    <div className="grid grid-cols-2 gap-2">
                      <FormField
                        control={form.control}
                        name="firstName"
                        render={({ field }) => (
                          <FormItem className="space-y-1">
                            <FormLabel className="text-[11px]">First Name *</FormLabel>
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
                            <FormLabel className="text-[11px]">Last Name</FormLabel>
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
                        name="mobile"
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

            {/* Similar Contacts Section */}
            {similarContacts.length > 0 && (
              <div className="border-t pt-3 space-y-2">
                <div className="flex items-center gap-2">
                  <Users className="h-3.5 w-3.5 text-amber-500" />
                  <h3 className="text-[11px] font-medium text-amber-600 dark:text-amber-400">
                    Possible Duplicates ({similarContacts.length})
                  </h3>
                </div>
                <div className="space-y-1.5">
                  {similarContacts.map(similar => (
                    <div 
                      key={similar.id} 
                      className="flex items-center justify-between p-2 bg-muted/50 rounded-md"
                    >
                      <div className="flex-1 min-w-0">
                        <p className="text-[11px] font-medium truncate">
                          {similar.name || similar.company || "Unnamed"}
                        </p>
                        <p className="text-[10px] text-muted-foreground truncate">
                          {similar.email || similar.phone || "No contact info"}
                        </p>
                      </div>
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        className="h-6 px-2 text-[10px] ml-2"
                        onClick={() => setMergeTargetId(similar.id)}
                        disabled={mergeMutation.isPending}
                        data-testid={`button-merge-${similar.id}`}
                      >
                        Merge Into
                      </Button>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* Footer with navigation and actions */}
          <div className="flex-shrink-0 flex items-center justify-between pt-3 border-t bg-background sticky bottom-0">
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
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation */}
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

      {/* Merge Confirmation */}
      <AlertDialog open={!!mergeTargetId} onOpenChange={() => setMergeTargetId(null)}>
        <AlertDialogContent data-testid="dialog-confirm-merge">
          <AlertDialogHeader>
            <AlertDialogTitle>Merge Contacts?</AlertDialogTitle>
            <AlertDialogDescription>
              This will merge "{currentContact?.name || currentContact?.company}" into the selected contact. 
              All linked records will be transferred and the current contact will be archived.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel data-testid="button-cancel-merge">Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => mergeTargetId && mergeMutation.mutate(mergeTargetId)}
              className="bg-[#bba7db] hover:bg-[#bba7db]/90"
              data-testid="button-confirm-merge"
            >
              Merge
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
