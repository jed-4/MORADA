import { useState, useMemo } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { usePageTitle } from "@/hooks/usePageTitle";
import { Button } from "@/components/ui/button";
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
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { useToast } from "@/hooks/use-toast";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { insertSupplierSchema, type Supplier, type InsertSupplier, type CostCode, type SupplierContact, type SupplierInsurance, type SupplierLabel } from "@shared/schema";
import { Plus, MoreHorizontal, Pencil, Trash2, Store, Search, X, Building2, Users, Shield, Tag, Calendar, AlertTriangle, ChevronRight } from "lucide-react";
import { z } from "zod";
import { format } from "date-fns";

const PAYMENT_TERMS_OPTIONS = [
  { value: "on_receipt", label: "On Receipt" },
  { value: "net_7", label: "Net 7" },
  { value: "net_14", label: "Net 14" },
  { value: "net_30", label: "Net 30" },
  { value: "eom", label: "End of Month" },
  { value: "end_of_next_month", label: "End of Next Month" },
] as const;

const formSchema = insertSupplierSchema.extend({
  name: z.string().min(1, "Name is required"),
  supplierType: z.literal("supplier").default("supplier"),
  email: z.string().optional(),
  phone: z.string().optional(),
  abn: z.string().optional(),
  businessNumber: z.string().optional(),
  address: z.string().optional(),
  paymentTerms: z.string().optional(),
  defaultCostCodeId: z.string().optional(),
  xeroContactId: z.string().optional(),
  xeroDefaultAccount: z.string().optional(),
  notes: z.string().optional(),
});

type FormValues = z.infer<typeof formSchema>;

const contactFormSchema = z.object({
  firstName: z.string().min(1, "First name is required"),
  lastName: z.string().optional(),
  email: z.string().optional(),
  phone: z.string().optional(),
  mobile: z.string().optional(),
  position: z.string().optional(),
  isPrimary: z.boolean().default(false),
});

type ContactFormValues = z.infer<typeof contactFormSchema>;

const insuranceFormSchema = z.object({
  insuranceType: z.enum(["public_liability", "workers_compensation", "other"]),
  policyNumber: z.string().optional(),
  insurer: z.string().optional(),
  expiryDate: z.string().optional(),
  coverageAmount: z.string().optional(),
});

type InsuranceFormValues = z.infer<typeof insuranceFormSchema>;

export default function Suppliers() {
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [editingSupplier, setEditingSupplier] = useState<Supplier | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedSupplier, setSelectedSupplier] = useState<Supplier | null>(null);
  const [isContactDialogOpen, setIsContactDialogOpen] = useState(false);
  const [editingContact, setEditingContact] = useState<SupplierContact | null>(null);
  const [isInsuranceDialogOpen, setIsInsuranceDialogOpen] = useState(false);
  const [editingInsurance, setEditingInsurance] = useState<SupplierInsurance | null>(null);
  const { toast } = useToast();
  usePageTitle({ pageName: "Suppliers" });

  const form = useForm<FormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      name: "",
      supplierType: "supplier",
      email: "",
      phone: "",
      abn: "",
      businessNumber: "",
      address: "",
      paymentTerms: "",
      defaultCostCodeId: "",
      xeroContactId: "",
      xeroDefaultAccount: "",
      notes: "",
    },
  });

  const contactForm = useForm<ContactFormValues>({
    resolver: zodResolver(contactFormSchema),
    defaultValues: {
      firstName: "",
      lastName: "",
      email: "",
      phone: "",
      mobile: "",
      position: "",
      isPrimary: false,
    },
  });

  const insuranceForm = useForm<InsuranceFormValues>({
    resolver: zodResolver(insuranceFormSchema),
    defaultValues: {
      insuranceType: "public_liability",
      policyNumber: "",
      insurer: "",
      expiryDate: "",
      coverageAmount: "",
    },
  });

  const { data: allSuppliers = [], isLoading } = useQuery<Supplier[]>({
    queryKey: ["/api/suppliers"],
  });

  const { data: costCodes = [] } = useQuery<CostCode[]>({
    queryKey: ["/api/cost-codes"],
  });

  const { data: supplierLabels = [] } = useQuery<SupplierLabel[]>({
    queryKey: ["/api/supplier-labels"],
  });

  const { data: selectedSupplierContacts = [] } = useQuery<SupplierContact[]>({
    queryKey: ["/api/suppliers", selectedSupplier?.id, "contacts"],
    enabled: !!selectedSupplier?.id,
    queryFn: async () => {
      const response = await fetch(`/api/suppliers/${selectedSupplier?.id}/contacts`);
      if (!response.ok) throw new Error("Failed to fetch contacts");
      return response.json();
    },
  });

  const { data: selectedSupplierInsurances = [] } = useQuery<SupplierInsurance[]>({
    queryKey: ["/api/suppliers", selectedSupplier?.id, "insurances"],
    enabled: !!selectedSupplier?.id,
    queryFn: async () => {
      const response = await fetch(`/api/suppliers/${selectedSupplier?.id}/insurances`);
      if (!response.ok) throw new Error("Failed to fetch insurances");
      return response.json();
    },
  });

  const suppliers = useMemo(() => {
    const hardwareSuppliers = allSuppliers.filter(s => s.supplierType === "supplier" || !s.supplierType);
    
    if (!searchQuery.trim()) return hardwareSuppliers;
    
    const query = searchQuery.toLowerCase();
    return hardwareSuppliers.filter(s => 
      s.name.toLowerCase().includes(query) ||
      s.email?.toLowerCase().includes(query) ||
      s.phone?.toLowerCase().includes(query) ||
      s.abn?.toLowerCase().includes(query)
    );
  }, [allSuppliers, searchQuery]);

  const createMutation = useMutation({
    mutationFn: async (data: InsertSupplier) => {
      return await apiRequest("/api/suppliers", "POST", data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/suppliers"] });
      toast({
        title: "Success",
        description: "Supplier created successfully",
      });
      handleCloseDialog();
    },
    onError: () => {
      toast({
        title: "Error",
        description: "Failed to create supplier",
        variant: "destructive",
      });
    },
  });

  const updateMutation = useMutation({
    mutationFn: async ({ id, data }: { id: string; data: Partial<InsertSupplier> }) => {
      return await apiRequest(`/api/suppliers/${id}`, "PATCH", data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/suppliers"] });
      toast({
        title: "Success",
        description: "Supplier updated successfully",
      });
      handleCloseDialog();
    },
    onError: () => {
      toast({
        title: "Error",
        description: "Failed to update supplier",
        variant: "destructive",
      });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      await apiRequest(`/api/suppliers/${id}`, "DELETE");
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/suppliers"] });
      toast({
        title: "Success",
        description: "Supplier deleted successfully",
      });
      setSelectedSupplier(null);
    },
    onError: () => {
      toast({
        title: "Error",
        description: "Failed to delete supplier",
        variant: "destructive",
      });
    },
  });

  const createContactMutation = useMutation({
    mutationFn: async (data: ContactFormValues) => {
      return await apiRequest(`/api/suppliers/${selectedSupplier?.id}/contacts`, "POST", data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/suppliers", selectedSupplier?.id, "contacts"] });
      toast({ title: "Success", description: "Contact added successfully" });
      setIsContactDialogOpen(false);
      contactForm.reset();
    },
    onError: () => {
      toast({ title: "Error", description: "Failed to add contact", variant: "destructive" });
    },
  });

  const updateContactMutation = useMutation({
    mutationFn: async ({ id, data }: { id: string; data: Partial<ContactFormValues> }) => {
      return await apiRequest(`/api/supplier-contacts/${id}`, "PATCH", data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/suppliers", selectedSupplier?.id, "contacts"] });
      toast({ title: "Success", description: "Contact updated successfully" });
      setIsContactDialogOpen(false);
      setEditingContact(null);
      contactForm.reset();
    },
    onError: () => {
      toast({ title: "Error", description: "Failed to update contact", variant: "destructive" });
    },
  });

  const deleteContactMutation = useMutation({
    mutationFn: async (id: string) => {
      await apiRequest(`/api/supplier-contacts/${id}`, "DELETE");
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/suppliers", selectedSupplier?.id, "contacts"] });
      toast({ title: "Success", description: "Contact deleted successfully" });
    },
    onError: () => {
      toast({ title: "Error", description: "Failed to delete contact", variant: "destructive" });
    },
  });

  const createInsuranceMutation = useMutation({
    mutationFn: async (data: InsuranceFormValues) => {
      return await apiRequest(`/api/suppliers/${selectedSupplier?.id}/insurances`, "POST", {
        ...data,
        expiryDate: data.expiryDate ? new Date(data.expiryDate).toISOString() : null,
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/suppliers", selectedSupplier?.id, "insurances"] });
      toast({ title: "Success", description: "Insurance added successfully" });
      setIsInsuranceDialogOpen(false);
      insuranceForm.reset();
    },
    onError: () => {
      toast({ title: "Error", description: "Failed to add insurance", variant: "destructive" });
    },
  });

  const updateInsuranceMutation = useMutation({
    mutationFn: async ({ id, data }: { id: string; data: Partial<InsuranceFormValues> }) => {
      return await apiRequest(`/api/supplier-insurances/${id}`, "PATCH", {
        ...data,
        expiryDate: data.expiryDate ? new Date(data.expiryDate).toISOString() : null,
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/suppliers", selectedSupplier?.id, "insurances"] });
      toast({ title: "Success", description: "Insurance updated successfully" });
      setIsInsuranceDialogOpen(false);
      setEditingInsurance(null);
      insuranceForm.reset();
    },
    onError: () => {
      toast({ title: "Error", description: "Failed to update insurance", variant: "destructive" });
    },
  });

  const deleteInsuranceMutation = useMutation({
    mutationFn: async (id: string) => {
      await apiRequest(`/api/supplier-insurances/${id}`, "DELETE");
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/suppliers", selectedSupplier?.id, "insurances"] });
      toast({ title: "Success", description: "Insurance deleted successfully" });
    },
    onError: () => {
      toast({ title: "Error", description: "Failed to delete insurance", variant: "destructive" });
    },
  });

  const onSubmit = (data: FormValues) => {
    const cleanedData = {
      ...data,
      paymentTerms: data.paymentTerms || null,
      defaultCostCodeId: data.defaultCostCodeId || null,
    };
    if (editingSupplier) {
      updateMutation.mutate({ id: editingSupplier.id, data: cleanedData });
    } else {
      createMutation.mutate(cleanedData);
    }
  };

  const onContactSubmit = (data: ContactFormValues) => {
    if (editingContact) {
      updateContactMutation.mutate({ id: editingContact.id, data });
    } else {
      createContactMutation.mutate(data);
    }
  };

  const onInsuranceSubmit = (data: InsuranceFormValues) => {
    if (editingInsurance) {
      updateInsuranceMutation.mutate({ id: editingInsurance.id, data });
    } else {
      createInsuranceMutation.mutate(data);
    }
  };

  const handleAddSupplier = () => {
    setEditingSupplier(null);
    form.reset({
      name: "",
      supplierType: "supplier",
      email: "",
      phone: "",
      abn: "",
      businessNumber: "",
      address: "",
      paymentTerms: "",
      defaultCostCodeId: "",
      xeroContactId: "",
      xeroDefaultAccount: "",
      notes: "",
    });
    setIsDialogOpen(true);
  };

  const handleEditSupplier = (supplier: Supplier) => {
    setEditingSupplier(supplier);
    form.reset({
      name: supplier.name,
      supplierType: "supplier",
      email: supplier.email ?? "",
      phone: supplier.phone ?? "",
      abn: supplier.abn ?? "",
      businessNumber: supplier.businessNumber ?? "",
      address: supplier.address ?? "",
      paymentTerms: supplier.paymentTerms ?? "",
      defaultCostCodeId: supplier.defaultCostCodeId ?? "",
      xeroContactId: supplier.xeroContactId ?? "",
      xeroDefaultAccount: supplier.xeroDefaultAccount ?? "",
      notes: supplier.notes ?? "",
    });
    setIsDialogOpen(true);
  };

  const handleDeleteSupplier = (id: string) => {
    if (confirm("Are you sure you want to delete this supplier?")) {
      deleteMutation.mutate(id);
    }
  };

  const handleCloseDialog = () => {
    setIsDialogOpen(false);
    setEditingSupplier(null);
    form.reset();
  };

  const handleAddContact = () => {
    setEditingContact(null);
    contactForm.reset({
      firstName: "",
      lastName: "",
      email: "",
      phone: "",
      mobile: "",
      position: "",
      isPrimary: false,
    });
    setIsContactDialogOpen(true);
  };

  const handleEditContact = (contact: SupplierContact) => {
    setEditingContact(contact);
    contactForm.reset({
      firstName: contact.firstName,
      lastName: contact.lastName ?? "",
      email: contact.email ?? "",
      phone: contact.phone ?? "",
      mobile: contact.mobile ?? "",
      position: contact.position ?? "",
      isPrimary: contact.isPrimary ?? false,
    });
    setIsContactDialogOpen(true);
  };

  const handleAddInsurance = () => {
    setEditingInsurance(null);
    insuranceForm.reset({
      insuranceType: "public_liability",
      policyNumber: "",
      insurer: "",
      expiryDate: "",
      coverageAmount: "",
    });
    setIsInsuranceDialogOpen(true);
  };

  const handleEditInsurance = (insurance: SupplierInsurance) => {
    setEditingInsurance(insurance);
    insuranceForm.reset({
      insuranceType: insurance.insuranceType as "public_liability" | "workers_compensation" | "other",
      policyNumber: insurance.policyNumber ?? "",
      insurer: insurance.insurer ?? "",
      expiryDate: insurance.expiryDate ? format(new Date(insurance.expiryDate), "yyyy-MM-dd") : "",
      coverageAmount: insurance.coverageAmount ?? "",
    });
    setIsInsuranceDialogOpen(true);
  };

  const getInsuranceStatusBadge = (expiryDate: string | null | undefined) => {
    if (!expiryDate) return <Badge variant="outline">No Expiry</Badge>;
    const expiry = new Date(expiryDate);
    const now = new Date();
    const daysUntilExpiry = Math.ceil((expiry.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
    
    if (daysUntilExpiry < 0) {
      return <Badge variant="destructive">Expired</Badge>;
    } else if (daysUntilExpiry <= 7) {
      return <Badge variant="destructive" className="bg-orange-500">Expires Soon</Badge>;
    } else if (daysUntilExpiry <= 30) {
      return <Badge variant="secondary" className="bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200">Expires in {daysUntilExpiry} days</Badge>;
    }
    return <Badge variant="secondary" className="bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200">Valid</Badge>;
  };

  const getPaymentTermsLabel = (value: string | null | undefined) => {
    if (!value) return "-";
    return PAYMENT_TERMS_OPTIONS.find(opt => opt.value === value)?.label || value;
  };

  return (
    <div className="flex h-full flex-col">
      {/* Row 1 - Page Title + Action Button (36px) */}
      <div className="h-9 bg-background flex items-center justify-between px-3 gap-4 flex-shrink-0 border-b">
        <div className="flex items-center gap-3">
          <h2 className="text-sm font-semibold" data-testid="text-page-title">
            Suppliers
          </h2>
          <Badge variant="secondary" className="text-xs" data-testid="text-supplier-count">
            {suppliers.length} {suppliers.length === 1 ? 'supplier' : 'suppliers'}
          </Badge>
        </div>

        <div className="flex items-center gap-1.5">
          <Button
            size="sm"
            className="h-6 px-2 text-xs bg-[#bba7db] hover:bg-[#bba7db]/90 text-white border-[#bba7db]/20"
            onClick={handleAddSupplier}
            data-testid="button-add-supplier"
          >
            <Plus className="w-3 h-3 mr-0.5" />
            Add Supplier
          </Button>
        </div>
      </div>

      {/* Row 2 - Search (36px) */}
      <div className="h-9 bg-background flex items-center px-3 gap-2 flex-shrink-0 border-b">
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
          <Input
            type="text"
            placeholder="Search suppliers..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="h-7 pl-7 pr-7 text-xs"
            data-testid="input-search-suppliers"
          />
          {searchQuery && (
            <Button
              variant="ghost"
              size="icon"
              onClick={() => setSearchQuery("")}
              className="absolute right-1 top-1/2 -translate-y-1/2 h-5 w-5"
              data-testid="button-clear-search"
            >
              <X className="h-3 w-3" />
            </Button>
          )}
        </div>
      </div>

      {/* Content Area */}
      <div className="flex-1 overflow-auto">
        {isLoading ? (
          <div className="text-center py-12 text-muted-foreground">Loading suppliers...</div>
        ) : suppliers.length === 0 ? (
          <div className="text-center py-12">
            <Store className="h-12 w-12 mx-auto text-muted-foreground mb-3" />
            <p className="text-muted-foreground">
              {searchQuery ? "No suppliers match your search" : "No suppliers yet"}
            </p>
            <p className="text-sm text-muted-foreground">
              {searchQuery ? "Try a different search term" : "Add hardware stores and material suppliers"}
            </p>
          </div>
        ) : (
          <Table>
            <TableHeader>
              <TableRow className="hover:bg-transparent">
                <TableHead className="text-xs font-medium">Name</TableHead>
                <TableHead className="text-xs font-medium">Email</TableHead>
                <TableHead className="text-xs font-medium">Phone</TableHead>
                <TableHead className="text-xs font-medium">ABN</TableHead>
                <TableHead className="text-xs font-medium">Payment Terms</TableHead>
                <TableHead className="text-xs font-medium">Xero Status</TableHead>
                <TableHead className="w-[50px]"></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {suppliers.map((supplier) => (
                <TableRow 
                  key={supplier.id} 
                  className="hover-elevate cursor-pointer"
                  onClick={() => setSelectedSupplier(supplier)}
                  data-testid={`row-supplier-${supplier.id}`}
                >
                  <TableCell className="text-sm font-medium py-2" data-testid={`text-supplier-name-${supplier.id}`}>
                    <div className="flex items-center gap-2">
                      {supplier.name}
                      <ChevronRight className="h-3 w-3 text-muted-foreground" />
                    </div>
                  </TableCell>
                  <TableCell className="text-sm py-2" data-testid={`text-supplier-email-${supplier.id}`}>
                    {supplier.email || <span className="text-muted-foreground">-</span>}
                  </TableCell>
                  <TableCell className="text-sm py-2" data-testid={`text-supplier-phone-${supplier.id}`}>
                    {supplier.phone || <span className="text-muted-foreground">-</span>}
                  </TableCell>
                  <TableCell className="text-sm py-2" data-testid={`text-supplier-abn-${supplier.id}`}>
                    {supplier.abn || <span className="text-muted-foreground">-</span>}
                  </TableCell>
                  <TableCell className="text-sm py-2" data-testid={`text-supplier-payment-terms-${supplier.id}`}>
                    {getPaymentTermsLabel(supplier.paymentTerms)}
                  </TableCell>
                  <TableCell className="py-2" data-testid={`text-supplier-xero-status-${supplier.id}`}>
                    {supplier.xeroContactId ? (
                      <Badge variant="secondary" className="text-xs bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200">
                        Linked
                      </Badge>
                    ) : (
                      <Badge variant="outline" className="text-xs">Not Linked</Badge>
                    )}
                  </TableCell>
                  <TableCell className="py-2">
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button 
                          variant="ghost" 
                          size="icon"
                          className="h-7 w-7"
                          onClick={(e) => e.stopPropagation()}
                          data-testid={`button-actions-${supplier.id}`}
                        >
                          <MoreHorizontal className="h-4 w-4" />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        <DropdownMenuItem
                          onClick={(e) => {
                            e.stopPropagation();
                            handleEditSupplier(supplier);
                          }}
                          data-testid={`button-edit-${supplier.id}`}
                        >
                          <Pencil className="h-4 w-4 mr-2" />
                          Edit
                        </DropdownMenuItem>
                        <DropdownMenuItem
                          onClick={(e) => {
                            e.stopPropagation();
                            handleDeleteSupplier(supplier.id);
                          }}
                          className="text-destructive"
                          data-testid={`button-delete-${supplier.id}`}
                        >
                          <Trash2 className="h-4 w-4 mr-2" />
                          Delete
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </div>

      {/* Add/Edit Supplier Dialog */}
      <Dialog open={isDialogOpen} onOpenChange={handleCloseDialog}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto" data-testid="dialog-supplier-form">
          <DialogHeader>
            <DialogTitle>
              {editingSupplier ? "Edit Supplier" : "Add Supplier"}
            </DialogTitle>
            <DialogDescription>
              {editingSupplier 
                ? "Update the supplier's information below" 
                : "Add a new supplier to your database"}
            </DialogDescription>
          </DialogHeader>

          <Form {...form}>
            <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <FormField
                  control={form.control}
                  name="name"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Name *</FormLabel>
                      <FormControl>
                        <Input 
                          placeholder="Supplier name" 
                          {...field} 
                          data-testid="input-supplier-name"
                        />
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
                        <Input 
                          type="email"
                          placeholder="supplier@example.com" 
                          {...field} 
                          data-testid="input-supplier-email"
                        />
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
                        <Input 
                          placeholder="Phone number" 
                          {...field} 
                          data-testid="input-supplier-phone"
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="abn"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>ABN</FormLabel>
                      <FormControl>
                        <Input 
                          placeholder="Australian Business Number" 
                          {...field} 
                          data-testid="input-supplier-abn"
                        />
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
                        <Input 
                          placeholder="Business registration number" 
                          {...field} 
                          data-testid="input-supplier-business-number"
                        />
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
                          {PAYMENT_TERMS_OPTIONS.map((option) => (
                            <SelectItem key={option.value} value={option.value}>
                              {option.label}
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
                      <Select onValueChange={(val) => field.onChange(val === "none" ? null : val)} value={field.value || "none"}>
                        <FormControl>
                          <SelectTrigger data-testid="select-default-cost-code">
                            <SelectValue placeholder="Select cost code" />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          <SelectItem value="none">None</SelectItem>
                          {costCodes.map((code) => (
                            <SelectItem key={code.id} value={code.id}>
                              {code.code} - {code.name}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <p className="text-xs text-muted-foreground">Auto-applies to bill line items</p>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="xeroDefaultAccount"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Xero Default Account</FormLabel>
                      <FormControl>
                        <Input 
                          placeholder="Xero account code" 
                          {...field} 
                          data-testid="input-supplier-xero-account"
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>

              <FormField
                control={form.control}
                name="address"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Address</FormLabel>
                    <FormControl>
                      <Textarea 
                        placeholder="Business address" 
                        {...field} 
                        data-testid="input-supplier-address"
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="notes"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Notes</FormLabel>
                    <FormControl>
                      <Textarea 
                        placeholder="Additional notes about this supplier" 
                        {...field} 
                        data-testid="input-supplier-notes"
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="xeroContactId"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Xero Contact ID</FormLabel>
                    <FormControl>
                      <Input 
                        placeholder="Synced from Xero" 
                        {...field} 
                        readOnly
                        disabled
                        className="bg-muted cursor-not-allowed"
                        data-testid="input-supplier-xero-id"
                      />
                    </FormControl>
                    <p className="text-xs text-muted-foreground">This field is automatically synced from Xero</p>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <div className="flex justify-end gap-3">
                <Button 
                  type="button" 
                  variant="outline" 
                  onClick={handleCloseDialog}
                  data-testid="button-cancel"
                >
                  Cancel
                </Button>
                <Button 
                  type="submit" 
                  disabled={createMutation.isPending || updateMutation.isPending}
                  className="bg-[#bba7db] hover:bg-[#bba7db]/90 text-white"
                  data-testid="button-submit"
                >
                  {createMutation.isPending || updateMutation.isPending
                    ? "Saving..."
                    : editingSupplier
                    ? "Update Supplier"
                    : "Add Supplier"}
                </Button>
              </div>
            </form>
          </Form>
        </DialogContent>
      </Dialog>

      {/* Supplier Detail Sheet */}
      <Sheet open={!!selectedSupplier} onOpenChange={(open) => !open && setSelectedSupplier(null)}>
        <SheetContent className="w-[600px] sm:max-w-[600px] overflow-y-auto" data-testid="sheet-supplier-detail">
          {selectedSupplier && (
            <>
              <SheetHeader>
                <div className="flex items-center justify-between">
                  <SheetTitle className="flex items-center gap-2">
                    <Building2 className="h-5 w-5 text-[#bba7db]" />
                    {selectedSupplier.name}
                  </SheetTitle>
                  <div className="flex items-center gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => handleEditSupplier(selectedSupplier)}
                      data-testid="button-edit-supplier-detail"
                    >
                      <Pencil className="h-4 w-4 mr-1" />
                      Edit
                    </Button>
                  </div>
                </div>
                <SheetDescription>
                  {selectedSupplier.email && <span>{selectedSupplier.email}</span>}
                  {selectedSupplier.phone && <span> | {selectedSupplier.phone}</span>}
                </SheetDescription>
              </SheetHeader>

              <Tabs defaultValue="details" className="mt-4">
                <TabsList className="grid w-full grid-cols-3">
                  <TabsTrigger value="details" className="text-xs">
                    <Building2 className="h-3.5 w-3.5 mr-1.5" />
                    Details
                  </TabsTrigger>
                  <TabsTrigger value="contacts" className="text-xs">
                    <Users className="h-3.5 w-3.5 mr-1.5" />
                    Contacts ({selectedSupplierContacts.length})
                  </TabsTrigger>
                  <TabsTrigger value="insurance" className="text-xs">
                    <Shield className="h-3.5 w-3.5 mr-1.5" />
                    Insurance ({selectedSupplierInsurances.length})
                  </TabsTrigger>
                </TabsList>

                <TabsContent value="details" className="mt-4 space-y-4">
                  <Card>
                    <CardHeader className="pb-2">
                      <CardTitle className="text-sm">Basic Information</CardTitle>
                    </CardHeader>
                    <CardContent className="grid grid-cols-2 gap-4 text-sm">
                      <div>
                        <p className="text-muted-foreground text-xs">ABN</p>
                        <p>{selectedSupplier.abn || "-"}</p>
                      </div>
                      <div>
                        <p className="text-muted-foreground text-xs">Business Number</p>
                        <p>{selectedSupplier.businessNumber || "-"}</p>
                      </div>
                      <div className="col-span-2">
                        <p className="text-muted-foreground text-xs">Address</p>
                        <p>{selectedSupplier.address || "-"}</p>
                      </div>
                    </CardContent>
                  </Card>

                  <Card>
                    <CardHeader className="pb-2">
                      <CardTitle className="text-sm">Payment & Accounting</CardTitle>
                    </CardHeader>
                    <CardContent className="grid grid-cols-2 gap-4 text-sm">
                      <div>
                        <p className="text-muted-foreground text-xs">Payment Terms</p>
                        <p>{getPaymentTermsLabel(selectedSupplier.paymentTerms)}</p>
                      </div>
                      <div>
                        <p className="text-muted-foreground text-xs">Default Cost Code</p>
                        <p>
                          {selectedSupplier.defaultCostCodeId 
                            ? costCodes.find(c => c.id === selectedSupplier.defaultCostCodeId)?.name || "-"
                            : "-"}
                        </p>
                      </div>
                      <div>
                        <p className="text-muted-foreground text-xs">Xero Status</p>
                        <p>{selectedSupplier.xeroContactId ? "Linked" : "Not Linked"}</p>
                      </div>
                      <div>
                        <p className="text-muted-foreground text-xs">Xero Default Account</p>
                        <p>{selectedSupplier.xeroDefaultAccount || "-"}</p>
                      </div>
                    </CardContent>
                  </Card>

                  {selectedSupplier.notes && (
                    <Card>
                      <CardHeader className="pb-2">
                        <CardTitle className="text-sm">Notes</CardTitle>
                      </CardHeader>
                      <CardContent>
                        <p className="text-sm whitespace-pre-wrap">{selectedSupplier.notes}</p>
                      </CardContent>
                    </Card>
                  )}
                </TabsContent>

                <TabsContent value="contacts" className="mt-4">
                  <div className="flex items-center justify-between mb-4">
                    <h3 className="text-sm font-medium">Contact People</h3>
                    <Button
                      size="sm"
                      className="h-7 bg-[#bba7db] hover:bg-[#bba7db]/90 text-white"
                      onClick={handleAddContact}
                      data-testid="button-add-contact"
                    >
                      <Plus className="h-3 w-3 mr-1" />
                      Add Contact
                    </Button>
                  </div>

                  {selectedSupplierContacts.length === 0 ? (
                    <Card>
                      <CardContent className="py-8 text-center">
                        <Users className="h-8 w-8 mx-auto text-muted-foreground mb-2" />
                        <p className="text-sm text-muted-foreground">No contacts added yet</p>
                      </CardContent>
                    </Card>
                  ) : (
                    <div className="space-y-2">
                      {selectedSupplierContacts.map((contact) => (
                        <Card key={contact.id} className="hover-elevate">
                          <CardContent className="p-3 flex items-center justify-between">
                            <div>
                              <div className="flex items-center gap-2">
                                <p className="font-medium text-sm">
                                  {contact.firstName} {contact.lastName}
                                </p>
                                {contact.isPrimary && (
                                  <Badge variant="secondary" className="text-xs bg-[#bba7db]/20 text-[#bba7db]">
                                    Primary
                                  </Badge>
                                )}
                              </div>
                              {contact.position && (
                                <p className="text-xs text-muted-foreground">{contact.position}</p>
                              )}
                              <div className="flex gap-3 mt-1 text-xs text-muted-foreground">
                                {contact.email && <span>{contact.email}</span>}
                                {contact.phone && <span>{contact.phone}</span>}
                                {contact.mobile && <span>{contact.mobile}</span>}
                              </div>
                            </div>
                            <DropdownMenu>
                              <DropdownMenuTrigger asChild>
                                <Button variant="ghost" size="icon" className="h-7 w-7">
                                  <MoreHorizontal className="h-4 w-4" />
                                </Button>
                              </DropdownMenuTrigger>
                              <DropdownMenuContent align="end">
                                <DropdownMenuItem onClick={() => handleEditContact(contact)}>
                                  <Pencil className="h-4 w-4 mr-2" />
                                  Edit
                                </DropdownMenuItem>
                                <DropdownMenuItem 
                                  onClick={() => {
                                    if (confirm("Delete this contact?")) {
                                      deleteContactMutation.mutate(contact.id);
                                    }
                                  }}
                                  className="text-destructive"
                                >
                                  <Trash2 className="h-4 w-4 mr-2" />
                                  Delete
                                </DropdownMenuItem>
                              </DropdownMenuContent>
                            </DropdownMenu>
                          </CardContent>
                        </Card>
                      ))}
                    </div>
                  )}
                </TabsContent>

                <TabsContent value="insurance" className="mt-4">
                  <div className="flex items-center justify-between mb-4">
                    <h3 className="text-sm font-medium">Insurance Documents</h3>
                    <Button
                      size="sm"
                      className="h-7 bg-[#bba7db] hover:bg-[#bba7db]/90 text-white"
                      onClick={handleAddInsurance}
                      data-testid="button-add-insurance"
                    >
                      <Plus className="h-3 w-3 mr-1" />
                      Add Insurance
                    </Button>
                  </div>

                  {selectedSupplierInsurances.length === 0 ? (
                    <Card>
                      <CardContent className="py-8 text-center">
                        <Shield className="h-8 w-8 mx-auto text-muted-foreground mb-2" />
                        <p className="text-sm text-muted-foreground">No insurance documents added yet</p>
                      </CardContent>
                    </Card>
                  ) : (
                    <div className="space-y-2">
                      {selectedSupplierInsurances.map((insurance) => (
                        <Card key={insurance.id} className="hover-elevate">
                          <CardContent className="p-3 flex items-center justify-between">
                            <div>
                              <div className="flex items-center gap-2">
                                <p className="font-medium text-sm capitalize">
                                  {insurance.insuranceType.replace(/_/g, ' ')}
                                </p>
                                {getInsuranceStatusBadge(insurance.expiryDate)}
                              </div>
                              <div className="flex gap-3 mt-1 text-xs text-muted-foreground">
                                {insurance.insurer && <span>Insurer: {insurance.insurer}</span>}
                                {insurance.policyNumber && <span>Policy: {insurance.policyNumber}</span>}
                              </div>
                              {insurance.expiryDate && (
                                <p className="text-xs mt-1 flex items-center gap-1">
                                  <Calendar className="h-3 w-3" />
                                  Expires: {format(new Date(insurance.expiryDate), "dd MMM yyyy")}
                                </p>
                              )}
                            </div>
                            <DropdownMenu>
                              <DropdownMenuTrigger asChild>
                                <Button variant="ghost" size="icon" className="h-7 w-7">
                                  <MoreHorizontal className="h-4 w-4" />
                                </Button>
                              </DropdownMenuTrigger>
                              <DropdownMenuContent align="end">
                                <DropdownMenuItem onClick={() => handleEditInsurance(insurance)}>
                                  <Pencil className="h-4 w-4 mr-2" />
                                  Edit
                                </DropdownMenuItem>
                                <DropdownMenuItem 
                                  onClick={() => {
                                    if (confirm("Delete this insurance record?")) {
                                      deleteInsuranceMutation.mutate(insurance.id);
                                    }
                                  }}
                                  className="text-destructive"
                                >
                                  <Trash2 className="h-4 w-4 mr-2" />
                                  Delete
                                </DropdownMenuItem>
                              </DropdownMenuContent>
                            </DropdownMenu>
                          </CardContent>
                        </Card>
                      ))}
                    </div>
                  )}
                </TabsContent>
              </Tabs>
            </>
          )}
        </SheetContent>
      </Sheet>

      {/* Add/Edit Contact Dialog */}
      <Dialog open={isContactDialogOpen} onOpenChange={(open) => {
        if (!open) {
          setIsContactDialogOpen(false);
          setEditingContact(null);
          contactForm.reset();
        }
      }}>
        <DialogContent data-testid="dialog-contact-form">
          <DialogHeader>
            <DialogTitle>{editingContact ? "Edit Contact" : "Add Contact"}</DialogTitle>
            <DialogDescription>
              {editingContact ? "Update contact details" : "Add a new contact person for this supplier"}
            </DialogDescription>
          </DialogHeader>

          <Form {...contactForm}>
            <form onSubmit={contactForm.handleSubmit(onContactSubmit)} className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <FormField
                  control={contactForm.control}
                  name="firstName"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>First Name *</FormLabel>
                      <FormControl>
                        <Input placeholder="First name" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={contactForm.control}
                  name="lastName"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Last Name</FormLabel>
                      <FormControl>
                        <Input placeholder="Last name" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={contactForm.control}
                  name="email"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Email</FormLabel>
                      <FormControl>
                        <Input type="email" placeholder="Email address" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={contactForm.control}
                  name="position"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Position</FormLabel>
                      <FormControl>
                        <Input placeholder="Job title" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={contactForm.control}
                  name="phone"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Phone</FormLabel>
                      <FormControl>
                        <Input placeholder="Phone number" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={contactForm.control}
                  name="mobile"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Mobile</FormLabel>
                      <FormControl>
                        <Input placeholder="Mobile number" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>

              <FormField
                control={contactForm.control}
                name="isPrimary"
                render={({ field }) => (
                  <FormItem className="flex flex-row items-center space-x-2 space-y-0">
                    <FormControl>
                      <input
                        type="checkbox"
                        checked={field.value}
                        onChange={field.onChange}
                        className="h-4 w-4"
                      />
                    </FormControl>
                    <FormLabel className="font-normal">Primary contact</FormLabel>
                  </FormItem>
                )}
              />

              <div className="flex justify-end gap-3">
                <Button type="button" variant="outline" onClick={() => setIsContactDialogOpen(false)}>
                  Cancel
                </Button>
                <Button 
                  type="submit" 
                  disabled={createContactMutation.isPending || updateContactMutation.isPending}
                  className="bg-[#bba7db] hover:bg-[#bba7db]/90 text-white"
                >
                  {createContactMutation.isPending || updateContactMutation.isPending ? "Saving..." : editingContact ? "Update" : "Add"}
                </Button>
              </div>
            </form>
          </Form>
        </DialogContent>
      </Dialog>

      {/* Add/Edit Insurance Dialog */}
      <Dialog open={isInsuranceDialogOpen} onOpenChange={(open) => {
        if (!open) {
          setIsInsuranceDialogOpen(false);
          setEditingInsurance(null);
          insuranceForm.reset();
        }
      }}>
        <DialogContent data-testid="dialog-insurance-form">
          <DialogHeader>
            <DialogTitle>{editingInsurance ? "Edit Insurance" : "Add Insurance"}</DialogTitle>
            <DialogDescription>
              {editingInsurance ? "Update insurance details" : "Add insurance documentation for this supplier"}
            </DialogDescription>
          </DialogHeader>

          <Form {...insuranceForm}>
            <form onSubmit={insuranceForm.handleSubmit(onInsuranceSubmit)} className="space-y-4">
              <FormField
                control={insuranceForm.control}
                name="insuranceType"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Insurance Type *</FormLabel>
                    <Select onValueChange={field.onChange} value={field.value}>
                      <FormControl>
                        <SelectTrigger>
                          <SelectValue placeholder="Select type" />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        <SelectItem value="public_liability">Public Liability</SelectItem>
                        <SelectItem value="workers_compensation">Workers Compensation</SelectItem>
                        <SelectItem value="other">Other</SelectItem>
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <div className="grid grid-cols-2 gap-4">
                <FormField
                  control={insuranceForm.control}
                  name="insurer"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Insurer</FormLabel>
                      <FormControl>
                        <Input placeholder="Insurance company" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={insuranceForm.control}
                  name="policyNumber"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Policy Number</FormLabel>
                      <FormControl>
                        <Input placeholder="Policy number" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={insuranceForm.control}
                  name="expiryDate"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Expiry Date</FormLabel>
                      <FormControl>
                        <Input type="date" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={insuranceForm.control}
                  name="coverageAmount"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Coverage Amount</FormLabel>
                      <FormControl>
                        <Input placeholder="e.g. $10,000,000" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>

              <div className="flex justify-end gap-3">
                <Button type="button" variant="outline" onClick={() => setIsInsuranceDialogOpen(false)}>
                  Cancel
                </Button>
                <Button 
                  type="submit" 
                  disabled={createInsuranceMutation.isPending || updateInsuranceMutation.isPending}
                  className="bg-[#bba7db] hover:bg-[#bba7db]/90 text-white"
                >
                  {createInsuranceMutation.isPending || updateInsuranceMutation.isPending ? "Saving..." : editingInsurance ? "Update" : "Add"}
                </Button>
              </div>
            </form>
          </Form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
