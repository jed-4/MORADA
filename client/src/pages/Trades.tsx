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
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { insertSupplierSchema, type Supplier, type InsertSupplier } from "@shared/schema";
import { Plus, MoreHorizontal, Pencil, Trash2, HardHat, AlertTriangle, Search, X } from "lucide-react";
import { z } from "zod";
import { format, isPast, addDays } from "date-fns";

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

const formSchema = insertSupplierSchema.extend({
  name: z.string().min(1, "Business name is required"),
  supplierType: z.literal("trade").default("trade"),
  tradeCategory: z.string().min(1, "Trade category is required"),
  email: z.string().optional(),
  phone: z.string().optional(),
  abn: z.string().optional(),
  address: z.string().optional(),
  licenseNumber: z.string().optional(),
  insuranceExpiry: z.string().optional(),
  contactPerson: z.string().optional(),
  xeroContactId: z.string().optional(),
});

type FormValues = z.infer<typeof formSchema>;

export default function Trades() {
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [editingTrade, setEditingTrade] = useState<Supplier | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
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
      address: "",
      licenseNumber: "",
      insuranceExpiry: "",
      contactPerson: "",
      xeroContactId: "",
    },
  });

  const { data: allSuppliers = [], isLoading } = useQuery<Supplier[]>({
    queryKey: ["/api/suppliers"],
  });

  // Filter to show only trades (subcontractors) and apply search
  const trades = useMemo(() => {
    const tradeSuppliers = allSuppliers.filter(s => s.supplierType === "trade");
    
    if (!searchQuery.trim()) return tradeSuppliers;
    
    const query = searchQuery.toLowerCase();
    return tradeSuppliers.filter(s => 
      s.name.toLowerCase().includes(query) ||
      s.tradeCategory?.toLowerCase().includes(query) ||
      s.contactPerson?.toLowerCase().includes(query) ||
      s.phone?.toLowerCase().includes(query) ||
      s.email?.toLowerCase().includes(query)
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
    },
    onError: () => {
      toast({
        title: "Error",
        description: "Failed to delete trade",
        variant: "destructive",
      });
    },
  });

  const onSubmit = (data: FormValues) => {
    const submitData = {
      ...data,
      insuranceExpiry: data.insuranceExpiry ? new Date(data.insuranceExpiry) : undefined,
    };
    
    if (editingTrade) {
      updateMutation.mutate({ id: editingTrade.id, data: submitData as any });
    } else {
      createMutation.mutate(submitData as any);
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
      address: "",
      licenseNumber: "",
      insuranceExpiry: "",
      contactPerson: "",
      xeroContactId: "",
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
      address: trade.address ?? "",
      licenseNumber: trade.licenseNumber ?? "",
      insuranceExpiry: trade.insuranceExpiry ? format(new Date(trade.insuranceExpiry), "yyyy-MM-dd") : "",
      contactPerson: trade.contactPerson ?? "",
      xeroContactId: trade.xeroContactId ?? "",
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

  const getInsuranceStatus = (expiryDate: Date | string | null | undefined) => {
    if (!expiryDate) return null;
    const expiry = new Date(expiryDate);
    const now = new Date();
    const warningDate = addDays(now, 30);
    
    if (isPast(expiry)) {
      return { status: "expired", label: "Expired", variant: "destructive" as const };
    } else if (expiry <= warningDate) {
      return { status: "expiring", label: "Expiring Soon", variant: "secondary" as const };
    }
    return { status: "valid", label: "Valid", variant: "outline" as const };
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
              {searchQuery ? "Try a different search term" : "Add subcontractors and trade partners"}
            </p>
          </div>
        ) : (
          <Table>
            <TableHeader>
              <TableRow className="hover:bg-transparent">
                <TableHead className="text-xs font-medium">Business Name</TableHead>
                <TableHead className="text-xs font-medium">Trade</TableHead>
                <TableHead className="text-xs font-medium">Contact</TableHead>
                <TableHead className="text-xs font-medium">Phone</TableHead>
                <TableHead className="text-xs font-medium">License</TableHead>
                <TableHead className="text-xs font-medium">Insurance</TableHead>
                <TableHead className="w-[50px]"></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {trades.map((trade) => {
                const insuranceStatus = getInsuranceStatus(trade.insuranceExpiry);
                return (
                  <TableRow 
                    key={trade.id} 
                    className="hover-elevate cursor-pointer"
                    data-testid={`row-trade-${trade.id}`}
                  >
                    <TableCell className="text-sm font-medium py-2" data-testid={`text-trade-name-${trade.id}`}>
                      {trade.name}
                    </TableCell>
                    <TableCell className="py-2" data-testid={`text-trade-category-${trade.id}`}>
                      <Badge variant="secondary" className="text-xs">{trade.tradeCategory || "-"}</Badge>
                    </TableCell>
                    <TableCell className="text-sm py-2" data-testid={`text-trade-contact-${trade.id}`}>
                      {trade.contactPerson || <span className="text-muted-foreground">-</span>}
                    </TableCell>
                    <TableCell className="text-sm py-2" data-testid={`text-trade-phone-${trade.id}`}>
                      {trade.phone || <span className="text-muted-foreground">-</span>}
                    </TableCell>
                    <TableCell className="text-sm py-2" data-testid={`text-trade-license-${trade.id}`}>
                      {trade.licenseNumber || <span className="text-muted-foreground">-</span>}
                    </TableCell>
                    <TableCell className="py-2" data-testid={`text-trade-insurance-${trade.id}`}>
                      {insuranceStatus ? (
                        <div className="flex items-center gap-2">
                          {insuranceStatus.status === "expired" && (
                            <AlertTriangle className="h-3.5 w-3.5 text-destructive" />
                          )}
                          <Badge variant={insuranceStatus.variant} className="text-xs">
                            {insuranceStatus.label}
                          </Badge>
                          <span className="text-xs text-muted-foreground">
                            {format(new Date(trade.insuranceExpiry!), "dd/MM/yyyy")}
                          </span>
                        </div>
                      ) : (
                        <span className="text-muted-foreground">-</span>
                      )}
                    </TableCell>
                    <TableCell className="py-2">
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button 
                            variant="ghost" 
                            size="icon"
                            className="h-7 w-7"
                            data-testid={`button-actions-${trade.id}`}
                          >
                            <MoreHorizontal className="h-4 w-4" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          <DropdownMenuItem
                            onClick={() => handleEditTrade(trade)}
                            data-testid={`button-edit-${trade.id}`}
                          >
                            <Pencil className="h-4 w-4 mr-2" />
                            Edit
                          </DropdownMenuItem>
                          <DropdownMenuItem
                            onClick={() => handleDeleteTrade(trade.id)}
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
                );
              })}
            </TableBody>
          </Table>
        )}
      </div>

      <Dialog open={isDialogOpen} onOpenChange={handleCloseDialog}>
        <DialogContent className="max-w-2xl" data-testid="dialog-trade-form">
          <DialogHeader>
            <DialogTitle>
              {editingTrade ? "Edit Trade" : "Add Trade"}
            </DialogTitle>
            <DialogDescription>
              {editingTrade 
                ? "Update the subcontractor's information below" 
                : "Add a new subcontractor or trade partner"}
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
                          placeholder="Company name" 
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
              </div>

              <div className="grid grid-cols-2 gap-4">
                <FormField
                  control={form.control}
                  name="contactPerson"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Contact Person</FormLabel>
                      <FormControl>
                        <Input 
                          placeholder="Primary contact name" 
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
              </div>

              <div className="grid grid-cols-2 gap-4">
                <FormField
                  control={form.control}
                  name="email"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Email</FormLabel>
                      <FormControl>
                        <Input 
                          type="email"
                          placeholder="contact@company.com" 
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
              </div>

              <div className="grid grid-cols-2 gap-4">
                <FormField
                  control={form.control}
                  name="licenseNumber"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>License Number</FormLabel>
                      <FormControl>
                        <Input 
                          placeholder="Trade license/registration" 
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
                  name="insuranceExpiry"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Insurance Expiry</FormLabel>
                      <FormControl>
                        <Input 
                          type="date"
                          {...field} 
                          data-testid="input-trade-insurance"
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
                        data-testid="input-trade-address"
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
    </div>
  );
}
