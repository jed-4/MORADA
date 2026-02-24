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
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useToast } from "@/hooks/use-toast";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { insertSupplierSchema, type Supplier, type InsertSupplier, type CostCode, type SupplierContact, type SupplierInsurance } from "@shared/schema";
import { Plus, MoreHorizontal, Pencil, Trash2, HardHat, Search, X, Building2, Users, Shield, Calendar, ChevronRight } from "lucide-react";
import { z } from "zod";
import { format } from "date-fns";

const TRADE_CATEGORIES = [
  "Electrician",
  "Plumber",
  "Carpenter",
  "Bricklayer",
  "Plasterer",
  "Painter",
  "Tiler",
  "Roofer",
  "Concreter",
  "Landscaper",
  "Fencer",
  "Glazier",
  "HVAC",
  "Scaffolder",
  "Demolition",
  "Excavation",
  "Steel Fixer",
  "Formwork",
  "Waterproofer",
  "Insulation",
  "Cabinet Maker",
  "Flooring",
  "Renderer",
  "Other",
];

const PAYMENT_TERMS_OPTIONS = [
  { value: "on_receipt", label: "On Receipt" },
  { value: "net_7", label: "Net 7" },
  { value: "net_14", label: "Net 14" },
  { value: "net_30", label: "Net 30" },
  { value: "eom", label: "End of Month" },
  { value: "end_of_next_month", label: "End of Next Month" },
] as const;

const formSchema = insertSupplierSchema.extend({
  name: z.string().min(1, "Business name is required"),
  supplierType: z.literal("trade").default("trade"),
  tradeCategory: z.string().min(1, "Trade category is required"),
  email: z.string().optional(),
  phone: z.string().optional(),
  abn: z.string().optional(),
  businessNumber: z.string().optional(),
  address: z.string().optional(),
  licenseNumber: z.string().optional(),
  contactPerson: z.string().optional(),
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

export default function Trades() {
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [editingTrade, setEditingTrade] = useState<Supplier | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedTrade, setSelectedTrade] = useState<Supplier | null>(null);
  const [isContactDialogOpen, setIsContactDialogOpen] = useState(false);
  const [editingContact, setEditingContact] = useState<SupplierContact | null>(null);
  const [isInsuranceDialogOpen, setIsInsuranceDialogOpen] = useState(false);
  const [editingInsurance, setEditingInsurance] = useState<SupplierInsurance | null>(null);
  const { toast } = useToast();
  usePageTitle({ pageName: "Trades" });

  const form = useForm<FormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      name: "",
      supplierType: "trade",
      tradeCategory: "",
      email: "",
      phone: "",
      abn: "",
      businessNumber: "",
      address: "",
      licenseNumber: "",
      contactPerson: "",
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

  const { data: xeroAccounts = [] } = useQuery<Array<{ code: string; name: string; type: string; accountId: string }>>({
    queryKey: ["/api/xero/accounts"],
  });

  const { data: selectedTradeContacts = [] } = useQuery<SupplierContact[]>({
    queryKey: ["/api/suppliers", selectedTrade?.id, "contacts"],
    enabled: !!selectedTrade?.id,
    queryFn: async () => {
      const response = await fetch(`/api/suppliers/${selectedTrade?.id}/contacts`);
      if (!response.ok) throw new Error("Failed to fetch contacts");
      return response.json();
    },
  });

  const { data: selectedTradeInsurances = [] } = useQuery<SupplierInsurance[]>({
    queryKey: ["/api/suppliers", selectedTrade?.id, "insurances"],
    enabled: !!selectedTrade?.id,
    queryFn: async () => {
      const response = await fetch(`/api/suppliers/${selectedTrade?.id}/insurances`);
      if (!response.ok) throw new Error("Failed to fetch insurances");
      return response.json();
    },
  });

  const trades = useMemo(() => {
    const tradeSuppliers = allSuppliers.filter(s => s.supplierType === "trade");
    
    if (!searchQuery.trim()) return tradeSuppliers;
    
    const query = searchQuery.toLowerCase();
    return tradeSuppliers.filter(s => 
      s.name.toLowerCase().includes(query) ||
      s.email?.toLowerCase().includes(query) ||
      s.phone?.toLowerCase().includes(query) ||
      s.tradeCategory?.toLowerCase().includes(query) ||
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
        description: "Trade created successfully",
      });
      handleCloseDialog();
    },
    onError: () => {
      toast({
        title: "Error",
        description: "Failed to create trade",
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
        description: "Trade updated successfully",
      });
      handleCloseDialog();
    },
    onError: () => {
      toast({
        title: "Error",
        description: "Failed to update trade",
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
        description: "Trade deleted successfully",
      });
      setSelectedTrade(null);
    },
    onError: () => {
      toast({
        title: "Error",
        description: "Failed to delete trade",
        variant: "destructive",
      });
    },
  });

  const createContactMutation = useMutation({
    mutationFn: async (data: ContactFormValues) => {
      return await apiRequest(`/api/suppliers/${selectedTrade?.id}/contacts`, "POST", data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/suppliers", selectedTrade?.id, "contacts"] });
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
      queryClient.invalidateQueries({ queryKey: ["/api/suppliers", selectedTrade?.id, "contacts"] });
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
      queryClient.invalidateQueries({ queryKey: ["/api/suppliers", selectedTrade?.id, "contacts"] });
      toast({ title: "Success", description: "Contact deleted successfully" });
    },
    onError: () => {
      toast({ title: "Error", description: "Failed to delete contact", variant: "destructive" });
    },
  });

  const createInsuranceMutation = useMutation({
    mutationFn: async (data: InsuranceFormValues) => {
      return await apiRequest(`/api/suppliers/${selectedTrade?.id}/insurances`, "POST", {
        ...data,
        expiryDate: data.expiryDate ? new Date(data.expiryDate).toISOString() : null,
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/suppliers", selectedTrade?.id, "insurances"] });
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
      queryClient.invalidateQueries({ queryKey: ["/api/suppliers", selectedTrade?.id, "insurances"] });
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
      queryClient.invalidateQueries({ queryKey: ["/api/suppliers", selectedTrade?.id, "insurances"] });
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
    if (editingTrade) {
      updateMutation.mutate({ id: editingTrade.id, data: cleanedData });
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

  const handleAddTrade = () => {
    setEditingTrade(null);
    form.reset({
      name: "",
      supplierType: "trade",
      tradeCategory: "",
      email: "",
      phone: "",
      abn: "",
      businessNumber: "",
      address: "",
      licenseNumber: "",
      contactPerson: "",
      paymentTerms: "",
      defaultCostCodeId: "",
      xeroContactId: "",
      xeroDefaultAccount: "",
      notes: "",
    });
    setIsDialogOpen(true);
  };

  const handleEditTrade = (trade: Supplier) => {
    setEditingTrade(trade);
    form.reset({
      name: trade.name,
      supplierType: "trade",
      tradeCategory: trade.tradeCategory ?? "",
      email: trade.email ?? "",
      phone: trade.phone ?? "",
      abn: trade.abn ?? "",
      businessNumber: trade.businessNumber ?? "",
      address: trade.address ?? "",
      licenseNumber: trade.licenseNumber ?? "",
      contactPerson: trade.contactPerson ?? "",
      paymentTerms: trade.paymentTerms ?? "",
      defaultCostCodeId: trade.defaultCostCodeId ?? "",
      xeroContactId: trade.xeroContactId ?? "",
      xeroDefaultAccount: trade.xeroDefaultAccount ?? "",
      notes: trade.notes ?? "",
    });
    setIsDialogOpen(true);
  };

  const handleDeleteTrade = (id: string) => {
    if (confirm("Are you sure you want to delete this trade?")) {
      deleteMutation.mutate(id);
    }
  };

  const handleCloseDialog = () => {
    setIsDialogOpen(false);
    setEditingTrade(null);
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
            Trades
          </h2>
          <Badge variant="secondary" className="text-xs" data-testid="text-trade-count">
            {trades.length} {trades.length === 1 ? 'trade' : 'trades'}
          </Badge>
        </div>

        <div className="flex items-center gap-1.5">
          <Button
            size="sm"
            className="h-6 px-2 text-xs bg-[#bba7db] hover:bg-[#bba7db]/90 text-white border-[#bba7db]/20"
            onClick={handleAddTrade}
            data-testid="button-add-trade"
          >
            <Plus className="w-3 h-3 mr-0.5" />
            Add Trade
          </Button>
        </div>
      </div>

      {/* Row 2 - Search (36px) */}
      <div className="h-9 bg-background flex items-center px-3 gap-2 flex-shrink-0 border-b">
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
          <Input
            type="text"
            placeholder="Search trades..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="h-7 pl-7 pr-7 text-xs"
            data-testid="input-search-trades"
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
          <div className="text-center py-12 text-muted-foreground">Loading trades...</div>
        ) : trades.length === 0 ? (
          <div className="text-center py-12">
            <HardHat className="h-12 w-12 mx-auto text-muted-foreground mb-3" />
            <p className="text-muted-foreground">
              {searchQuery ? "No trades match your search" : "No trades yet"}
            </p>
            <p className="text-sm text-muted-foreground">
              {searchQuery ? "Try a different search term" : "Add subcontractors and tradespeople"}
            </p>
          </div>
        ) : (
          <Table>
            <TableHeader>
              <TableRow className="hover:bg-transparent">
                <TableHead className="text-xs font-medium">Name</TableHead>
                <TableHead className="text-xs font-medium">Category</TableHead>
                <TableHead className="text-xs font-medium">Phone</TableHead>
                <TableHead className="text-xs font-medium">License</TableHead>
                <TableHead className="text-xs font-medium">Payment Terms</TableHead>
                <TableHead className="text-xs font-medium">Xero Status</TableHead>
                <TableHead className="w-[50px]"></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {trades.map((trade) => (
                <TableRow 
                  key={trade.id} 
                  className="hover-elevate cursor-pointer"
                  onClick={() => setSelectedTrade(trade)}
                  data-testid={`row-trade-${trade.id}`}
                >
                  <TableCell className="text-sm font-medium py-2" data-testid={`text-trade-name-${trade.id}`}>
                    <div className="flex items-center gap-2">
                      {trade.name}
                      <ChevronRight className="h-3 w-3 text-muted-foreground" />
                    </div>
                  </TableCell>
                  <TableCell className="py-2" data-testid={`text-trade-category-${trade.id}`}>
                    <Badge 
                      variant="secondary" 
                      className="text-xs bg-[#bba7db]/20 text-[#bba7db] border-[#bba7db]/30"
                    >
                      {trade.tradeCategory || "Not Set"}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-sm py-2" data-testid={`text-trade-phone-${trade.id}`}>
                    {trade.phone || <span className="text-muted-foreground">-</span>}
                  </TableCell>
                  <TableCell className="text-sm py-2" data-testid={`text-trade-license-${trade.id}`}>
                    {trade.licenseNumber || <span className="text-muted-foreground">-</span>}
                  </TableCell>
                  <TableCell className="text-sm py-2" data-testid={`text-trade-payment-terms-${trade.id}`}>
                    {getPaymentTermsLabel(trade.paymentTerms)}
                  </TableCell>
                  <TableCell className="py-2" data-testid={`text-trade-xero-status-${trade.id}`}>
                    {trade.xeroContactId ? (
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
                          data-testid={`button-actions-${trade.id}`}
                        >
                          <MoreHorizontal className="h-4 w-4" />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        <DropdownMenuItem
                          onClick={(e) => {
                            e.stopPropagation();
                            handleEditTrade(trade);
                          }}
                          data-testid={`button-edit-${trade.id}`}
                        >
                          <Pencil className="h-4 w-4 mr-2" />
                          Edit
                        </DropdownMenuItem>
                        <DropdownMenuItem
                          onClick={(e) => {
                            e.stopPropagation();
                            handleDeleteTrade(trade.id);
                          }}
                          className="text-destructive"
                          data-testid={`button-delete-${trade.id}`}
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

      {/* Add/Edit Trade Dialog */}
      <Dialog open={isDialogOpen} onOpenChange={handleCloseDialog}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto" data-testid="dialog-trade-form">
          <DialogHeader>
            <DialogTitle>
              {editingTrade ? "Edit Trade" : "Add Trade"}
            </DialogTitle>
            <DialogDescription>
              {editingTrade 
                ? "Update the subcontractor's information below" 
                : "Add a new subcontractor or tradesperson"}
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
                      <FormLabel>Business Name *</FormLabel>
                      <FormControl>
                        <Input 
                          placeholder="Business or trading name" 
                          {...field} 
                          data-testid="input-trade-name"
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="tradeCategory"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Trade Category *</FormLabel>
                      <Select onValueChange={field.onChange} value={field.value}>
                        <FormControl>
                          <SelectTrigger data-testid="select-trade-category">
                            <SelectValue placeholder="Select trade" />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          {TRADE_CATEGORIES.map((category) => (
                            <SelectItem key={category} value={category}>
                              {category}
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
                  name="email"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Email</FormLabel>
                      <FormControl>
                        <Input 
                          type="email"
                          placeholder="business@example.com" 
                          {...field} 
                          data-testid="input-trade-email"
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
                          data-testid="input-trade-phone"
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
                          data-testid="input-trade-abn"
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="licenseNumber"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>License Number</FormLabel>
                      <FormControl>
                        <Input 
                          placeholder="Trade license number" 
                          {...field} 
                          data-testid="input-trade-license"
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="contactPerson"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Primary Contact</FormLabel>
                      <FormControl>
                        <Input 
                          placeholder="Main contact person" 
                          {...field} 
                          data-testid="input-trade-contact"
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
                      {xeroAccounts.length > 0 ? (
                        <Select
                          onValueChange={(val) => field.onChange(val === "__none__" ? "" : val)}
                          value={field.value || "__none__"}
                        >
                          <FormControl>
                            <SelectTrigger data-testid="input-trade-xero-account">
                              <SelectValue placeholder="Select Xero account..." />
                            </SelectTrigger>
                          </FormControl>
                          <SelectContent>
                            <SelectItem value="__none__">None</SelectItem>
                            {xeroAccounts.map((acc) => (
                              <SelectItem key={acc.code} value={acc.code}>
                                {acc.code} - {acc.name}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      ) : (
                        <FormControl>
                          <Input 
                            placeholder="Xero account code" 
                            {...field} 
                            data-testid="input-trade-xero-account"
                          />
                        </FormControl>
                      )}
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
                        data-testid="input-trade-address"
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
                        placeholder="Additional notes about this trade" 
                        {...field} 
                        data-testid="input-trade-notes"
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
                        data-testid="input-trade-xero-id"
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
                    : editingTrade
                    ? "Update Trade"
                    : "Add Trade"}
                </Button>
              </div>
            </form>
          </Form>
        </DialogContent>
      </Dialog>

      {/* Trade Detail Sheet */}
      <Sheet open={!!selectedTrade} onOpenChange={(open) => !open && setSelectedTrade(null)}>
        <SheetContent className="w-[600px] sm:max-w-[600px] overflow-y-auto" data-testid="sheet-trade-detail">
          {selectedTrade && (
            <>
              <SheetHeader>
                <div className="flex items-center justify-between">
                  <SheetTitle className="flex items-center gap-2">
                    <HardHat className="h-5 w-5 text-[#bba7db]" />
                    {selectedTrade.name}
                  </SheetTitle>
                  <div className="flex items-center gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => handleEditTrade(selectedTrade)}
                      data-testid="button-edit-trade-detail"
                    >
                      <Pencil className="h-4 w-4 mr-1" />
                      Edit
                    </Button>
                  </div>
                </div>
                <SheetDescription>
                  <Badge variant="secondary" className="mr-2 bg-[#bba7db]/20 text-[#bba7db]">
                    {selectedTrade.tradeCategory}
                  </Badge>
                  {selectedTrade.email && <span>{selectedTrade.email}</span>}
                  {selectedTrade.phone && <span> | {selectedTrade.phone}</span>}
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
                    Contacts ({selectedTradeContacts.length})
                  </TabsTrigger>
                  <TabsTrigger value="insurance" className="text-xs">
                    <Shield className="h-3.5 w-3.5 mr-1.5" />
                    Insurance ({selectedTradeInsurances.length})
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
                        <p>{selectedTrade.abn || "-"}</p>
                      </div>
                      <div>
                        <p className="text-muted-foreground text-xs">License Number</p>
                        <p>{selectedTrade.licenseNumber || "-"}</p>
                      </div>
                      <div>
                        <p className="text-muted-foreground text-xs">Primary Contact</p>
                        <p>{selectedTrade.contactPerson || "-"}</p>
                      </div>
                      <div className="col-span-2">
                        <p className="text-muted-foreground text-xs">Address</p>
                        <p>{selectedTrade.address || "-"}</p>
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
                        <p>{getPaymentTermsLabel(selectedTrade.paymentTerms)}</p>
                      </div>
                      <div>
                        <p className="text-muted-foreground text-xs">Default Cost Code</p>
                        <p>
                          {selectedTrade.defaultCostCodeId 
                            ? costCodes.find(c => c.id === selectedTrade.defaultCostCodeId)?.name || "-"
                            : "-"}
                        </p>
                      </div>
                      <div>
                        <p className="text-muted-foreground text-xs">Xero Status</p>
                        <p>{selectedTrade.xeroContactId ? "Linked" : "Not Linked"}</p>
                      </div>
                      <div>
                        <p className="text-muted-foreground text-xs">Xero Default Account</p>
                        <p>{selectedTrade.xeroDefaultAccount || "-"}</p>
                      </div>
                    </CardContent>
                  </Card>

                  {selectedTrade.notes && (
                    <Card>
                      <CardHeader className="pb-2">
                        <CardTitle className="text-sm">Notes</CardTitle>
                      </CardHeader>
                      <CardContent>
                        <p className="text-sm whitespace-pre-wrap">{selectedTrade.notes}</p>
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

                  {selectedTradeContacts.length === 0 ? (
                    <Card>
                      <CardContent className="py-8 text-center">
                        <Users className="h-8 w-8 mx-auto text-muted-foreground mb-2" />
                        <p className="text-sm text-muted-foreground">No contacts added yet</p>
                      </CardContent>
                    </Card>
                  ) : (
                    <div className="space-y-2">
                      {selectedTradeContacts.map((contact) => (
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

                  {selectedTradeInsurances.length === 0 ? (
                    <Card>
                      <CardContent className="py-8 text-center">
                        <Shield className="h-8 w-8 mx-auto text-muted-foreground mb-2" />
                        <p className="text-sm text-muted-foreground">No insurance documents added yet</p>
                      </CardContent>
                    </Card>
                  ) : (
                    <div className="space-y-2">
                      {selectedTradeInsurances.map((insurance) => (
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
              {editingContact ? "Update contact details" : "Add a new contact person for this trade"}
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
              {editingInsurance ? "Update insurance details" : "Add insurance documentation for this trade"}
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
