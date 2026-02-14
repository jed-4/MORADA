import { useState, useEffect } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation, useQuery } from "@tanstack/react-query";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Separator } from "@/components/ui/separator";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { X } from "lucide-react";
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
import { insertContactSchema, type InsertContact, type PaymentTermsOption } from "@shared/schema";
import { CostCodeSelect } from "@/components/CostCodeSelect";

const DEFAULT_GREY = "#64748b";

// Helper to get initials from form values
function getFormInitials(firstName?: string, lastName?: string, company?: string): string {
  if (firstName || lastName) {
    return `${(firstName || "").charAt(0)}${(lastName || "").charAt(0)}`.toUpperCase();
  }
  return (company || "").substring(0, 2).toUpperCase() || "??";
}

type AddContactDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  defaultContactType?: "trade" | "supplier" | "client";
};

export default function AddContactDialog({
  open,
  onOpenChange,
  defaultContactType,
}: AddContactDialogProps) {
  const { toast } = useToast();
  const [selectedType, setSelectedType] = useState<"trade" | "supplier" | "client">("trade");

  const { data: paymentTermsOptions = [] } = useQuery<PaymentTermsOption[]>({
    queryKey: ["/api/payment-terms-options"],
  });

  const form = useForm<InsertContact>({
    resolver: zodResolver(insertContactSchema),
    defaultValues: {
      name: "",
      firstName: "",
      lastName: "",
      email: "",
      phone: "",
      mobile: "",
      company: "",
      position: "",
      contactType: defaultContactType || "trade",
      spouseName: "",
      spousePhone: "",
      spouseEmail: "",
      primaryContact: undefined,
      abn: "",
      businessNumber: "",
      address: "",
      paymentTerms: "",
      defaultCostCodeId: "__none__",
      role: "",
      hourlyRate: "",
      hourlyPrice: "",
      notes: "",
      labels: [],
      projectIds: [],
      avatarColor: DEFAULT_GREY,
      portalEnabled: false,
      isArchived: false,
    },
  });

  useEffect(() => {
    if (defaultContactType) {
      form.setValue("contactType", defaultContactType);
      setSelectedType(defaultContactType);
    }
  }, [defaultContactType, form]);

  useEffect(() => {
    const subscription = form.watch((value, { name }) => {
      if (name === "contactType") {
        setSelectedType(value.contactType as "trade" | "supplier" | "client");
      }
    });
    return () => subscription.unsubscribe();
  }, [form]);

  const createContactMutation = useMutation({
    mutationFn: async (data: InsertContact) => {
      // Clean up empty strings - convert to undefined to prevent backend from treating them as defined
      const cleanData = { ...data };
      if (cleanData.firstName === "") cleanData.firstName = undefined;
      if (cleanData.lastName === "") cleanData.lastName = undefined;
      if (cleanData.spouseName === "") cleanData.spouseName = undefined;
      if (cleanData.spousePhone === "") cleanData.spousePhone = undefined;
      if (cleanData.spouseEmail === "") cleanData.spouseEmail = undefined;
      
      // Convert null to empty string for hourlyRate and hourlyPrice (schema expects strings)
      if (cleanData.hourlyRate === null) cleanData.hourlyRate = "";
      if (cleanData.hourlyPrice === null) cleanData.hourlyPrice = "";
      
      // Convert "__none__" to undefined for defaultCostCodeId (no cost code selected)
      if (cleanData.defaultCostCodeId === "__none__") cleanData.defaultCostCodeId = undefined;
      
      // Auto-generate full name from firstName and lastName, or fall back to company name
      const personName = `${cleanData.firstName || ""} ${cleanData.lastName || ""}`.trim();
      const fullName = personName || cleanData.company || cleanData.name || "Unnamed Contact";
      const payload = { ...cleanData, name: fullName };
      return await apiRequest("/api/contacts", "POST", payload);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/contacts"] });
      toast({
        title: "Contact created",
        description: "Contact has been added successfully.",
      });
      form.reset();
      onOpenChange(false);
    },
    onError: () => {
      toast({
        title: "Failed to create contact",
        variant: "destructive",
      });
    },
  });

  const onSubmit = (data: InsertContact) => {
    createContactMutation.mutate(data);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] flex flex-col overflow-hidden">
        <DialogHeader>
          <DialogTitle>Add Contact</DialogTitle>
        </DialogHeader>

        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="flex flex-col flex-1 overflow-hidden">
            <div className="flex-1 overflow-y-auto space-y-6 pr-2">
            {/* Contact Type */}
            <FormField
              control={form.control}
              name="contactType"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Contact Type *</FormLabel>
                  <Select onValueChange={field.onChange} value={field.value}>
                    <FormControl>
                      <SelectTrigger data-testid="select-contact-type">
                        <SelectValue placeholder="Select contact type" />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      <SelectItem value="trade">Trade</SelectItem>
                      <SelectItem value="supplier">Supplier</SelectItem>
                      <SelectItem value="client">Client</SelectItem>
                    </SelectContent>
                  </Select>
                  <FormMessage />
                </FormItem>
              )}
            />

            <Separator />

            {/* Trade/Supplier Layout: Company First, Then Primary Contact */}
            {(selectedType === "trade" || selectedType === "supplier") ? (
              <>
                {/* Company Name with Avatar */}
                <div className="flex items-end gap-3">
                  <FormField
                    control={form.control}
                    name="company"
                    render={({ field }) => (
                      <FormItem className="flex-1">
                        <FormLabel>Company Name *</FormLabel>
                        <FormControl>
                          <Input {...field} data-testid="input-company" />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  
                  {/* Compact Avatar Preview */}
                  <Avatar 
                    className="h-9 w-9 border border-border"
                    style={{ backgroundColor: form.watch("avatarColor") || DEFAULT_GREY }}
                  >
                    <AvatarFallback 
                      className="text-white text-xs font-medium" 
                      style={{ backgroundColor: "transparent" }}
                    >
                      {getFormInitials(form.watch("firstName"), form.watch("lastName"), form.watch("company"))}
                    </AvatarFallback>
                  </Avatar>
                </div>

                {/* Primary Contact Section */}
                <div className="space-y-4 border-t pt-4">
                  <h3 className="text-sm font-medium">Primary Contact</h3>
                  <div className="grid grid-cols-2 gap-4">
                    <FormField
                      control={form.control}
                      name="firstName"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>First Name</FormLabel>
                          <FormControl>
                            <Input {...field} value={field.value || ""} data-testid="input-first-name" />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />

                    <FormField
                      control={form.control}
                      name="lastName"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Last Name</FormLabel>
                          <FormControl>
                            <Input {...field} value={field.value || ""} data-testid="input-last-name" />
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
                          <FormLabel>Position</FormLabel>
                          <FormControl>
                            <Input {...field} data-testid="input-position" />
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
                            <Input {...field} type="email" data-testid="input-email" />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />

                    <FormField
                      control={form.control}
                      name="phone"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Phone</FormLabel>
                          <FormControl>
                            <Input {...field} data-testid="input-phone" />
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
                            <Input {...field} data-testid="input-mobile" />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                  </div>

                  {/* Contact Color */}
                  <FormField
                    control={form.control}
                    name="avatarColor"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Contact Color</FormLabel>
                        <FormControl>
                          <div className="flex items-center gap-3">
                            <Input
                              type="color"
                              className="w-12 h-9 p-1 border rounded cursor-pointer"
                              value={field.value || DEFAULT_GREY}
                              onChange={field.onChange}
                              data-testid="input-contact-color"
                            />
                            <Input
                              type="text"
                              placeholder="#64748b"
                              className="flex-1"
                              value={field.value || ""}
                              onChange={field.onChange}
                              data-testid="input-contact-color-hex"
                            />
                          </div>
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  {/* Schedule Colour - for trade/supplier */}
                  <FormField
                    control={form.control}
                    name="scheduleColor"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Schedule Colour</FormLabel>
                        <FormControl>
                          <div className="space-y-2">
                            <div className="flex flex-wrap gap-1.5">
                              {[
                                "#ef4444", "#f97316", "#f59e0b", "#eab308",
                                "#22c55e", "#14b8a6", "#06b6d4", "#3b82f6",
                                "#6366f1", "#8b5cf6", "#d946ef", "#ec4899",
                              ].map((color) => (
                                <button
                                  key={color}
                                  type="button"
                                  className="w-7 h-7 rounded-md border-2 transition-transform"
                                  style={{
                                    backgroundColor: color,
                                    borderColor: field.value === color ? "white" : "transparent",
                                    boxShadow: field.value === color ? `0 0 0 2px ${color}` : "none",
                                  }}
                                  onClick={() => field.onChange(color)}
                                />
                              ))}
                              {field.value && (
                                <button
                                  type="button"
                                  className="w-7 h-7 rounded-md border border-dashed border-muted-foreground flex items-center justify-center text-muted-foreground text-xs"
                                  onClick={() => field.onChange(null)}
                                  title="Clear colour"
                                >
                                  <X className="w-3 h-3" />
                                </button>
                              )}
                            </div>
                            <div className="flex items-center gap-2">
                              <Input
                                type="color"
                                className="w-9 h-9 p-1 border rounded cursor-pointer"
                                value={field.value || "#9ca3af"}
                                onChange={field.onChange}
                              />
                              <Input
                                type="text"
                                placeholder="#hex colour"
                                className="flex-1"
                                value={field.value || ""}
                                onChange={field.onChange}
                                data-testid="input-schedule-color-hex"
                              />
                            </div>
                          </div>
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </div>
              </>
            ) : (
              /* Team/Client Layout: Name Fields First */
              <>
                {/* Name Row with Avatar */}
                <div className="flex items-end gap-3">
                  <div className="grid grid-cols-2 gap-4 flex-1">
                    <FormField
                      control={form.control}
                      name="firstName"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>First Name</FormLabel>
                          <FormControl>
                            <Input {...field} value={field.value || ""} data-testid="input-first-name" />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />

                    <FormField
                      control={form.control}
                      name="lastName"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Last Name</FormLabel>
                          <FormControl>
                            <Input {...field} value={field.value || ""} data-testid="input-last-name" />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                  </div>
                  
                  {/* Compact Avatar Preview */}
                  <Avatar 
                    className="h-9 w-9 border border-border"
                    style={{ backgroundColor: form.watch("avatarColor") || DEFAULT_GREY }}
                  >
                    <AvatarFallback 
                      className="text-white text-xs font-medium" 
                      style={{ backgroundColor: "transparent" }}
                    >
                      {getFormInitials(form.watch("firstName"), form.watch("lastName"), form.watch("company"))}
                    </AvatarFallback>
                  </Avatar>
                </div>

                <div className="grid grid-cols-2 gap-4">

                <FormField
                  control={form.control}
                  name="email"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Email</FormLabel>
                      <FormControl>
                        <Input {...field} type="email" data-testid="input-email" />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="phone"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Phone</FormLabel>
                      <FormControl>
                        <Input {...field} data-testid="input-phone" />
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
                        <Input {...field} data-testid="input-mobile" />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                {selectedType === "client" ? (
                  <FormField
                    control={form.control}
                    name="address"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Address</FormLabel>
                        <FormControl>
                          <Input {...field} data-testid="input-address" />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                ) : (
                  <FormField
                    control={form.control}
                    name="company"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Company</FormLabel>
                        <FormControl>
                          <Input {...field} data-testid="input-company" />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                )}

                {selectedType === "team" ? (
                  <FormField
                    control={form.control}
                    name="role"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Role</FormLabel>
                        <FormControl>
                          <Input {...field} placeholder="e.g. Project Manager" data-testid="input-role" />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                ) : selectedType === "client" ? null : (
                  <FormField
                    control={form.control}
                    name="position"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Position</FormLabel>
                        <FormControl>
                          <Input {...field} data-testid="input-position" />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                )}
                </div>

                {/* Contact Color */}
                <FormField
                  control={form.control}
                  name="avatarColor"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Contact Color</FormLabel>
                      <FormControl>
                        <div className="flex items-center gap-3">
                          <Input
                            type="color"
                            className="w-12 h-9 p-1 border rounded cursor-pointer"
                            value={field.value || DEFAULT_GREY}
                            onChange={field.onChange}
                            data-testid="input-contact-color"
                          />
                          <Input
                            type="text"
                            placeholder="#64748b"
                            className="flex-1"
                            value={field.value || ""}
                            onChange={field.onChange}
                            data-testid="input-contact-color-hex"
                          />
                        </div>
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </>
            )}

            {/* Business Fields (Suppliers) */}
            {(selectedType === "trade" || selectedType === "supplier") && (
              <div className="space-y-4 border-t pt-4">
                <h3 className="text-sm font-medium">Business Information</h3>
                <div className="grid grid-cols-2 gap-4">
                  <FormField
                    control={form.control}
                    name="abn"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>ABN</FormLabel>
                        <FormControl>
                          <Input {...field} placeholder="Australian Business Number" data-testid="input-abn" />
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
                          <Input {...field} placeholder="ACN or other" data-testid="input-business-number" />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <FormField
                    control={form.control}
                    name="paymentTerms"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Payment Terms</FormLabel>
                        <Select onValueChange={field.onChange} value={field.value || ""}>
                          <FormControl>
                            <SelectTrigger data-testid="select-payment-terms">
                              <SelectValue placeholder="Select payment terms" />
                            </SelectTrigger>
                          </FormControl>
                          <SelectContent>
                            <SelectItem value="">None</SelectItem>
                            {paymentTermsOptions.map((option) => (
                              <SelectItem key={option.id} value={option.name}>
                                {option.name}
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
                    name="defaultCostCodeId"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Default Cost Code</FormLabel>
                        <FormControl>
                          <CostCodeSelect
                            value={field.value === "__none__" ? "" : (field.value || "")}
                            onValueChange={(val) => field.onChange(val || "__none__")}
                            placeholder="Select cost code..."
                            allowNone={true}
                            data-testid="select-cost-code"
                          />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </div>
              </div>
            )}

            {/* Employment Fields (Team) */}
            {selectedType === "team" && (
              <div className="space-y-4 border-t pt-4">
                <h3 className="text-sm font-medium">Employment Information</h3>
                <div className="grid grid-cols-2 gap-4">
                  <FormField
                    control={form.control}
                    name="hourlyRate"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Hourly Rate (Cost)</FormLabel>
                        <FormControl>
                          <Input {...field} value={field.value || ""} type="number" step="0.01" placeholder="Cost to company" data-testid="input-hourly-rate" />
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
                          <Input {...field} value={field.value || ""} type="number" step="0.01" placeholder="Billable rate" data-testid="input-hourly-price" />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </div>
              </div>
            )}

            {/* Client Spouse Information */}
            {selectedType === "client" && (
              <div className="space-y-4 border-t pt-4">
                <h3 className="text-sm font-medium">Spouse Information (Optional)</h3>
                <div className="grid grid-cols-2 gap-4">
                  <FormField
                    control={form.control}
                    name="spouseName"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Spouse Name</FormLabel>
                        <FormControl>
                          <Input {...field} value={field.value || ""} placeholder="Spouse's full name" data-testid="input-spouse-name" />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <FormField
                    control={form.control}
                    name="primaryContact"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Primary Contact</FormLabel>
                        <Select onValueChange={field.onChange} value={field.value || "__none__"}>
                          <FormControl>
                            <SelectTrigger data-testid="select-primary-contact">
                              <SelectValue placeholder="Select primary contact" />
                            </SelectTrigger>
                          </FormControl>
                          <SelectContent>
                            <SelectItem value="__none__">Not specified</SelectItem>
                            <SelectItem value="self">Client (Self)</SelectItem>
                            <SelectItem value="spouse">Spouse</SelectItem>
                          </SelectContent>
                        </Select>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <FormField
                    control={form.control}
                    name="spousePhone"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Spouse Phone</FormLabel>
                        <FormControl>
                          <Input {...field} value={field.value || ""} placeholder="Spouse's phone number" data-testid="input-spouse-phone" />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <FormField
                    control={form.control}
                    name="spouseEmail"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Spouse Email</FormLabel>
                        <FormControl>
                          <Input {...field} value={field.value || ""} type="email" placeholder="Spouse's email address" data-testid="input-spouse-email" />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </div>
              </div>
            )}

            {/* Address (for non-client types) */}
            {selectedType !== "client" && (
              <FormField
                control={form.control}
                name="address"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Address</FormLabel>
                    <FormControl>
                      <Input {...field} data-testid="input-address" />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            )}

            {/* Notes */}
            <FormField
              control={form.control}
              name="notes"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Notes</FormLabel>
                  <FormControl>
                    <Textarea {...field} rows={3} data-testid="textarea-notes" />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            </div>

            {/* Sticky Actions Footer */}
            <div className="flex justify-end gap-2 pt-4 mt-4 border-t bg-background sticky bottom-0">
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
                disabled={createContactMutation.isPending}
                data-testid="button-save"
              >
                {createContactMutation.isPending ? "Saving..." : "Save Contact"}
              </Button>
            </div>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}
