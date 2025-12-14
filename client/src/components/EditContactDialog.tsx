import { useState, useEffect, useRef } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation, useQuery } from "@tanstack/react-query";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Separator } from "@/components/ui/separator";
import { Switch } from "@/components/ui/switch";
import { Avatar, AvatarImage, AvatarFallback } from "@/components/ui/avatar";
import { Upload, X } from "lucide-react";
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
import { insertContactSchema, type InsertContact, type Contact, type CostCode, type PaymentTermsOption } from "@shared/schema";
import { ContactInsuranceSection } from "@/components/contacts/ContactInsuranceSection";

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
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [avatarPreview, setAvatarPreview] = useState<string | null>(null);
  const [isUploadingAvatar, setIsUploadingAvatar] = useState(false);

  const { data: costCodes = [] } = useQuery<CostCode[]>({
    queryKey: ["/api/cost-codes"],
  });

  const { data: paymentTermsOptions = [] } = useQuery<PaymentTermsOption[]>({
    queryKey: ["/api/payment-terms-options"],
  });

  const form = useForm<InsertContact>({
    resolver: zodResolver(insertContactSchema),
    defaultValues: {
      name: contact.name || "",
      firstName: contact.firstName || "",
      lastName: contact.lastName || "",
      email: contact.email || "",
      phone: contact.phone || "",
      mobile: contact.mobile || "",
      company: contact.company || "",
      position: contact.position || "",
      contactType: contact.contactType,
      spouseName: contact.spouseName || "",
      spousePhone: contact.spousePhone || "",
      spouseEmail: contact.spouseEmail || "",
      primaryContact: contact.primaryContact || undefined,
      abn: contact.abn || "",
      businessNumber: contact.businessNumber || "",
      address: contact.address || "",
      paymentTerms: contact.paymentTerms || "",
      defaultCostCodeId: contact.defaultCostCodeId || "__none__",
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

  // Reset form and avatar preview when contact changes
  useEffect(() => {
    if (contact) {
      form.reset({
        name: contact.name || "",
        firstName: contact.firstName || "",
        lastName: contact.lastName || "",
        email: contact.email || "",
        phone: contact.phone || "",
        mobile: contact.mobile || "",
        company: contact.company || "",
        position: contact.position || "",
        contactType: contact.contactType,
        spouseName: contact.spouseName || "",
        spousePhone: contact.spousePhone || "",
        spouseEmail: contact.spouseEmail || "",
        primaryContact: contact.primaryContact || undefined,
        abn: contact.abn || "",
        businessNumber: contact.businessNumber || "",
        address: contact.address || "",
        paymentTerms: contact.paymentTerms || "",
        defaultCostCodeId: contact.defaultCostCodeId || "__none__",
        role: contact.role || "",
        hourlyRate: contact.hourlyRate?.toString() || "",
        hourlyPrice: contact.hourlyPrice?.toString() || "",
        notes: contact.notes || "",
        labels: (contact.labels as string[]) || [],
        projectIds: (contact.projectIds as string[]) || [],
        avatarColor: contact.avatarColor || "#64748b",
        portalEnabled: contact.portalEnabled || false,
        isArchived: contact.isArchived || false,
      });
      setAvatarPreview(contact.avatarUrl || null);
    }
  }, [contact, form]);

  // Get initials for avatar fallback
  const getInitials = () => {
    const name = contact.name || contact.company || "";
    const firstName = contact.firstName || "";
    const lastName = contact.lastName || "";
    
    if (firstName || lastName) {
      return `${firstName.charAt(0)}${lastName.charAt(0)}`.toUpperCase();
    }
    return name.substring(0, 2).toUpperCase();
  };

  // Handle avatar file upload
  const handleAvatarUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    // Validate file type
    if (!file.type.startsWith("image/")) {
      toast({
        title: "Invalid file type",
        description: "Please upload an image file",
        variant: "destructive",
      });
      return;
    }

    // Validate file size (max 2MB)
    if (file.size > 2 * 1024 * 1024) {
      toast({
        title: "File too large",
        description: "Please upload an image smaller than 2MB",
        variant: "destructive",
      });
      return;
    }

    setIsUploadingAvatar(true);
    
    try {
      // Create form data for upload
      const formData = new FormData();
      formData.append("file", file);
      formData.append("contactId", contact.id);

      const response = await fetch("/api/contacts/avatar/upload", {
        method: "POST",
        body: formData,
      });

      if (!response.ok) {
        throw new Error("Failed to upload avatar");
      }

      const result = await response.json();
      setAvatarPreview(result.avatarUrl);
      
      // Update the contact with the new avatar URL
      await apiRequest(`/api/contacts/${contact.id}`, "PATCH", {
        avatarUrl: result.avatarUrl,
      });
      
      queryClient.invalidateQueries({ queryKey: ["/api/contacts"] });
      toast({ title: "Avatar uploaded successfully" });
    } catch (error) {
      toast({
        title: "Upload failed",
        description: "Failed to upload avatar image",
        variant: "destructive",
      });
    } finally {
      setIsUploadingAvatar(false);
    }
  };

  // Remove avatar
  const handleRemoveAvatar = async () => {
    try {
      await apiRequest(`/api/contacts/${contact.id}`, "PATCH", {
        avatarUrl: null,
      });
      setAvatarPreview(null);
      queryClient.invalidateQueries({ queryKey: ["/api/contacts"] });
      toast({ title: "Avatar removed" });
    } catch (error) {
      toast({
        title: "Failed to remove avatar",
        variant: "destructive",
      });
    }
  };

  const updateMutation = useMutation({
    mutationFn: async (data: InsertContact) => {
      // Clean up empty strings and special values - convert to proper format for schema
      const cleanData = { ...data };
      if (cleanData.firstName === "") cleanData.firstName = undefined;
      if (cleanData.lastName === "") cleanData.lastName = undefined;
      if (cleanData.spouseName === "") cleanData.spouseName = undefined;
      if (cleanData.spousePhone === "") cleanData.spousePhone = undefined;
      if (cleanData.spouseEmail === "") cleanData.spouseEmail = undefined;
      if (cleanData.defaultCostCodeId === "__none__") cleanData.defaultCostCodeId = null;
      // Schema expects string or "" - convert null to empty string
      if (cleanData.hourlyRate === null || cleanData.hourlyRate === undefined) cleanData.hourlyRate = "";
      if (cleanData.hourlyPrice === null || cleanData.hourlyPrice === undefined) cleanData.hourlyPrice = "";
      
      return await apiRequest(`/api/contacts/${contact.id}`, "PATCH", cleanData);
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
  const isTrade = selectedType === "trade";
  const isSupplier = selectedType === "supplier";
  const isClient = selectedType === "client";
  const isBusinessType = isTrade || isSupplier; // Both use company-first layout

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] flex flex-col overflow-hidden" data-testid="dialog-edit-contact">
        <DialogHeader className="flex-shrink-0">
          <DialogTitle>Edit Contact</DialogTitle>
        </DialogHeader>
        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="flex flex-col flex-1 min-h-0">
            <div className="flex-1 overflow-y-auto space-y-4 pr-2">
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
                      <SelectItem value="trade">Trade (Subcontractor)</SelectItem>
                      <SelectItem value="supplier">Supplier</SelectItem>
                      <SelectItem value="client">Client</SelectItem>
                      <SelectItem value="team">Team Member</SelectItem>
                    </SelectContent>
                  </Select>
                  <FormMessage />
                </FormItem>
              )}
            />

            <Separator />

            {/* Trade/Supplier Layout: Company First, Then Primary Contact */}
            {isBusinessType ? (
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
                          <Input {...field} value={field.value || ""} data-testid="input-company" />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  
                  {/* Compact Avatar with Upload */}
                  <div className="flex items-center gap-2">
                    <div className="relative">
                      <Avatar 
                        className="h-9 w-9 border border-border cursor-pointer"
                        style={{ backgroundColor: avatarPreview ? undefined : (form.watch("avatarColor") || "#64748b") }}
                        onClick={() => fileInputRef.current?.click()}
                      >
                        {avatarPreview ? (
                          <AvatarImage src={avatarPreview} alt="Avatar" />
                        ) : (
                          <AvatarFallback 
                            className="text-white text-xs font-medium" 
                            style={{ backgroundColor: "transparent" }}
                          >
                            {getInitials()}
                          </AvatarFallback>
                        )}
                      </Avatar>
                      {avatarPreview && (
                        <Button
                          type="button"
                          size="icon"
                          variant="destructive"
                          className="absolute -top-1 -right-1 h-4 w-4"
                          onClick={(e) => { e.stopPropagation(); handleRemoveAvatar(); }}
                          data-testid="button-remove-avatar"
                        >
                          <X className="h-2.5 w-2.5" />
                        </Button>
                      )}
                    </div>
                    <input
                      ref={fileInputRef}
                      type="file"
                      accept="image/*"
                      className="hidden"
                      onChange={handleAvatarUpload}
                    />
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      onClick={() => fileInputRef.current?.click()}
                      disabled={isUploadingAvatar}
                      data-testid="button-upload-avatar"
                      title="Upload photo"
                    >
                      <Upload className="h-4 w-4" />
                    </Button>
                  </div>
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
                            <Input {...field} value={field.value || ""} data-testid="input-position" />
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
                              value={field.value || "#64748b"}
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
                  
                  {/* Compact Avatar with Upload */}
                  <div className="flex items-center gap-2">
                    <div className="relative">
                      <Avatar 
                        className="h-9 w-9 border border-border cursor-pointer"
                        style={{ backgroundColor: avatarPreview ? undefined : (form.watch("avatarColor") || "#64748b") }}
                        onClick={() => fileInputRef.current?.click()}
                      >
                        {avatarPreview ? (
                          <AvatarImage src={avatarPreview} alt="Avatar" />
                        ) : (
                          <AvatarFallback 
                            className="text-white text-xs font-medium" 
                            style={{ backgroundColor: "transparent" }}
                          >
                            {getInitials()}
                          </AvatarFallback>
                        )}
                      </Avatar>
                      {avatarPreview && (
                        <Button
                          type="button"
                          size="icon"
                          variant="destructive"
                          className="absolute -top-1 -right-1 h-4 w-4"
                          onClick={(e) => { e.stopPropagation(); handleRemoveAvatar(); }}
                          data-testid="button-remove-avatar"
                        >
                          <X className="h-2.5 w-2.5" />
                        </Button>
                      )}
                    </div>
                    <input
                      ref={fileInputRef}
                      type="file"
                      accept="image/*"
                      className="hidden"
                      onChange={handleAvatarUpload}
                    />
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      onClick={() => fileInputRef.current?.click()}
                      disabled={isUploadingAvatar}
                      data-testid="button-upload-avatar"
                      title="Upload photo"
                    >
                      <Upload className="h-4 w-4" />
                    </Button>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-4">

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

                  {isClient ? (
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
                  ) : (
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
                  )}

                  {isTeam ? (
                    <FormField
                      control={form.control}
                      name="position"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Role</FormLabel>
                          <FormControl>
                            <Input placeholder="e.g., Carpenter, Plumber" {...field} value={field.value || ""} data-testid="input-position" />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                  ) : isClient ? null : (
                    <FormField
                      control={form.control}
                      name="position"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Position</FormLabel>
                          <FormControl>
                            <Input {...field} value={field.value || ""} data-testid="input-position" />
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
                            value={field.value || "#64748b"}
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

            {/* Trade/Supplier-specific fields */}
            {isBusinessType && (
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

                <Separator className="my-4" />
                
                <ContactInsuranceSection 
                  contactId={contact.id} 
                  contactName={contact.name || "Supplier"} 
                />
              </>
            )}

            {/* Client-specific fields */}
            {isClient && (
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
              </div>
            )}

            {/* Address (for non-client types) */}
            {!isClient && (
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
            )}

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

            </div>

            {/* Sticky Actions Footer */}
            <div className="flex justify-end gap-2 pt-4 mt-4 border-t bg-background flex-shrink-0">
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
