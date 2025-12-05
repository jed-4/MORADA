import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { usePageTitle } from "@/hooks/usePageTitle";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
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
import { Plus, MoreHorizontal, Pencil, Trash2, HardHat, AlertTriangle } from "lucide-react";
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
  const { toast } = useToast();
  const pageTitle = usePageTitle({ pageName: "Trades" });

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

  // Filter to show only trades (subcontractors)
  const trades = allSuppliers.filter(s => s.supplierType === "trade");

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
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">{pageTitle}</h1>
          <p className="text-muted-foreground">Manage subcontractors and trade partners</p>
        </div>
        <Button onClick={handleAddTrade} data-testid="button-add-trade">
          <Plus className="h-4 w-4 mr-2" />
          Add Trade
        </Button>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Subcontractors</CardTitle>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="text-center py-8 text-muted-foreground">Loading trades...</div>
          ) : trades.length === 0 ? (
            <div className="text-center py-8">
              <HardHat className="h-12 w-12 mx-auto text-muted-foreground mb-3" />
              <p className="text-muted-foreground">No trades yet</p>
              <p className="text-sm text-muted-foreground">Add subcontractors and trade partners</p>
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Business Name</TableHead>
                  <TableHead>Trade</TableHead>
                  <TableHead>Contact</TableHead>
                  <TableHead>Phone</TableHead>
                  <TableHead>License</TableHead>
                  <TableHead>Insurance</TableHead>
                  <TableHead className="w-[70px]">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {trades.map((trade) => {
                  const insuranceStatus = getInsuranceStatus(trade.insuranceExpiry);
                  return (
                    <TableRow key={trade.id} data-testid={`row-trade-${trade.id}`}>
                      <TableCell className="font-medium" data-testid={`text-trade-name-${trade.id}`}>
                        {trade.name}
                      </TableCell>
                      <TableCell data-testid={`text-trade-category-${trade.id}`}>
                        <Badge variant="secondary">{trade.tradeCategory || "-"}</Badge>
                      </TableCell>
                      <TableCell data-testid={`text-trade-contact-${trade.id}`}>
                        {trade.contactPerson || "-"}
                      </TableCell>
                      <TableCell data-testid={`text-trade-phone-${trade.id}`}>
                        {trade.phone || "-"}
                      </TableCell>
                      <TableCell data-testid={`text-trade-license-${trade.id}`}>
                        {trade.licenseNumber || "-"}
                      </TableCell>
                      <TableCell data-testid={`text-trade-insurance-${trade.id}`}>
                        {insuranceStatus ? (
                          <div className="flex items-center gap-2">
                            {insuranceStatus.status === "expired" && (
                              <AlertTriangle className="h-4 w-4 text-destructive" />
                            )}
                            <Badge variant={insuranceStatus.variant}>
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
                      <TableCell>
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button 
                              variant="ghost" 
                              size="icon"
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
        </CardContent>
      </Card>

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
