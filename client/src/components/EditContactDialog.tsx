import { useState, useEffect } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation, useQuery } from "@tanstack/react-query";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
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
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { insertContactSchema, type InsertContact, type Contact, type CostCode } from "@shared/schema";

type EditContactDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  contact: Contact;
};

export default function EditContactDialog({
  open,
  onOpenChange,
  contact,
}: EditContactDialogProps) {
  const { toast } = useToast();

  const { data: costCodes = [] } = useQuery<CostCode[]>({
    queryKey: ["/api/cost-codes"],
  });

  const form = useForm<InsertContact>({
    resolver: zodResolver(insertContactSchema),
    defaultValues: {
      name: contact.name || "",
      email: contact.email || "",
      phone: contact.phone || "",
      mobile: contact.mobile || "",
      company: contact.company || "",
      position: contact.position || "",
      contactType: contact.contactType,
      abn: contact.abn || "",
      businessNumber: contact.businessNumber || "",
      address: contact.address || "",
      paymentTerms: contact.paymentTerms || "",
      defaultCostCodeId: contact.defaultCostCodeId || "",
      role: contact.role || "",
      hourlyRate: contact.hourlyRate?.toString() || "",
      hourlyPrice: contact.hourlyPrice?.toString() || "",
      notes: contact.notes || "",
      labels: (contact.labels as string[]) || [],
      projectIds: (contact.projectIds as string[]) || [],
      avatarColor: contact.avatarColor || "",
      portalEnabled: contact.portalEnabled || false,
      isArchived: contact.isArchived || false,
    },
  });

  // Reset form when contact changes
  useEffect(() => {
    if (contact) {
      form.reset({
        name: contact.name || "",
        email: contact.email || "",
        phone: contact.phone || "",
        mobile: contact.mobile || "",
        company: contact.company || "",
        position: contact.position || "",
        contactType: contact.contactType,
        abn: contact.abn || "",
        businessNumber: contact.businessNumber || "",
        address: contact.address || "",
        paymentTerms: contact.paymentTerms || "",
        defaultCostCodeId: contact.defaultCostCodeId || "",
        role: contact.role || "",
        hourlyRate: contact.hourlyRate?.toString() || "",
        hourlyPrice: contact.hourlyPrice?.toString() || "",
        notes: contact.notes || "",
        labels: (contact.labels as string[]) || [],
        projectIds: (contact.projectIds as string[]) || [],
        avatarColor: contact.avatarColor || "",
        portalEnabled: contact.portalEnabled || false,
        isArchived: contact.isArchived || false,
      });
    }
  }, [contact, form]);

  const updateMutation = useMutation({
    mutationFn: async (data: InsertContact) => {
      return await apiRequest("PATCH", `/api/contacts/${contact.id}`, data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/contacts"] });
      toast({ title: "Contact updated successfully" });
      onOpenChange(false);
    },
    onError: (error: Error) => {
      toast({
        title: "Failed to update contact",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const onSubmit = (data: InsertContact) => {
    updateMutation.mutate(data);
  };

  const selectedType = form.watch("contactType");
  const isTeam = selectedType === "team";
  const isSupplier = selectedType === "supplier";
  const isClient = selectedType === "client";

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto" data-testid="dialog-edit-contact">
        <DialogHeader>
          <DialogTitle>Edit Contact</DialogTitle>
        </DialogHeader>
        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
            {/* Contact Type */}
            <FormField
              control={form.control}
              name="contactType"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Contact Type</FormLabel>
                  <Select onValueChange={field.onChange} value={field.value}>
                    <FormControl>
                      <SelectTrigger data-testid="select-contact-type">
                        <SelectValue placeholder="Select contact type" />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      <SelectItem value="team">Team Member</SelectItem>
                      <SelectItem value="supplier">Supplier</SelectItem>
                      <SelectItem value="client">Client</SelectItem>
                    </SelectContent>
                  </Select>
                  <FormMessage />
                </FormItem>
              )}
            />

            {/* Basic Information */}
            <div className="grid grid-cols-2 gap-4">
              <FormField
                control={form.control}
                name="name"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Name *</FormLabel>
                    <FormControl>
                      <Input {...field} data-testid="input-name" />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="email"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Email</FormLabel>
                    <FormControl>
                      <Input type="email" {...field} value={field.value || ""} data-testid="input-email" />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>

            {/* Contact Details */}
            <div className="grid grid-cols-2 gap-4">
              <FormField
                control={form.control}
                name="phone"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Phone</FormLabel>
                    <FormControl>
                      <Input {...field} value={field.value || ""} data-testid="input-phone" />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="mobile"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Mobile</FormLabel>
                    <FormControl>
                      <Input {...field} value={field.value || ""} data-testid="input-mobile" />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>

            {/* Company & Position */}
            <div className="grid grid-cols-2 gap-4">
              <FormField
                control={form.control}
                name="company"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Company</FormLabel>
                    <FormControl>
                      <Input {...field} value={field.value || ""} data-testid="input-company" />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="position"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>{isTeam ? "Role" : "Position"}</FormLabel>
                    <FormControl>
                      <Input placeholder={isTeam ? "e.g., Carpenter, Plumber" : ""} {...field} value={field.value || ""} data-testid="input-position" />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>

            {/* Team-specific fields */}
            {isTeam && (
              <div className="grid grid-cols-2 gap-4">
                <FormField
                  control={form.control}
                  name="hourlyRate"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Hourly Rate (Cost)</FormLabel>
                      <FormControl>
                        <Input type="number" step="0.01" placeholder="0.00" {...field} value={field.value || ""} data-testid="input-hourly-rate" />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="hourlyPrice"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Hourly Price (Billable)</FormLabel>
                      <FormControl>
                        <Input type="number" step="0.01" placeholder="0.00" {...field} value={field.value || ""} data-testid="input-hourly-price" />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>
            )}

            {/* Supplier-specific fields */}
            {isSupplier && (
              <>
                <div className="grid grid-cols-2 gap-4">
                  <FormField
                    control={form.control}
                    name="abn"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>ABN</FormLabel>
                        <FormControl>
                          <Input placeholder="XX XXX XXX XXX" {...field} value={field.value || ""} data-testid="input-abn" />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <FormField
                    control={form.control}
                    name="businessNumber"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Business Number</FormLabel>
                        <FormControl>
                          <Input placeholder="ACN or other" {...field} value={field.value || ""} data-testid="input-business-number" />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </div>

                <FormField
                  control={form.control}
                  name="paymentTerms"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Payment Terms</FormLabel>
                      <FormControl>
                        <Input placeholder="e.g., Net 30, COD, EOM" {...field} value={field.value || ""} data-testid="input-payment-terms" />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="defaultCostCodeId"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Default Cost Code</FormLabel>
                      <Select onValueChange={field.onChange} value={field.value || "__none__"}>
                        <FormControl>
                          <SelectTrigger data-testid="select-cost-code">
                            <SelectValue placeholder="Select cost code" />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          <SelectItem value="__none__">None</SelectItem>
                          {costCodes
                            .filter(cc => !cc.isArchived)
                            .map((cc) => (
                              <SelectItem key={cc.id} value={cc.id}>
                                {cc.code} - {cc.title}
                              </SelectItem>
                            ))}
                        </SelectContent>
                      </Select>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </>
            )}

            {/* Client-specific fields */}
            {isClient && (
              <FormField
                control={form.control}
                name="portalEnabled"
                render={({ field }) => (
                  <FormItem className="flex items-center justify-between rounded-md border-2 border-input p-4">
                    <div className="space-y-0.5">
                      <FormLabel className="text-base">Portal Access</FormLabel>
                      <div className="text-sm text-muted-foreground">
                        Allow this client to access the project portal
                      </div>
                    </div>
                    <FormControl>
                      <Switch
                        checked={field.value}
                        onCheckedChange={field.onChange}
                        data-testid="switch-portal-enabled"
                      />
                    </FormControl>
                  </FormItem>
                )}
              />
            )}

            {/* Address */}
            <FormField
              control={form.control}
              name="address"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Address</FormLabel>
                  <FormControl>
                    <Input {...field} value={field.value || ""} data-testid="input-address" />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            {/* Notes */}
            <FormField
              control={form.control}
              name="notes"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Notes</FormLabel>
                  <FormControl>
                    <Textarea rows={3} {...field} value={field.value || ""} data-testid="textarea-notes" />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            {/* Actions */}
            <div className="flex justify-end gap-2 pt-4">
              <Button
                type="button"
                variant="outline"
                onClick={() => onOpenChange(false)}
                data-testid="button-cancel"
              >
                Cancel
              </Button>
              <Button
                type="submit"
                disabled={updateMutation.isPending}
                data-testid="button-save"
              >
                {updateMutation.isPending ? "Saving..." : "Save Changes"}
              </Button>
            </div>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}
