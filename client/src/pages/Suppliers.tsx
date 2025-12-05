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
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { insertSupplierSchema, type Supplier, type InsertSupplier } from "@shared/schema";
import { Plus, MoreHorizontal, Pencil, Trash2, Store, Search, X } from "lucide-react";
import { z } from "zod";

const formSchema = insertSupplierSchema.extend({
  name: z.string().min(1, "Name is required"),
  supplierType: z.literal("supplier").default("supplier"),
  email: z.string().optional(),
  phone: z.string().optional(),
  abn: z.string().optional(),
  address: z.string().optional(),
  xeroContactId: z.string().optional(),
});

type FormValues = z.infer<typeof formSchema>;

export default function Suppliers() {
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [editingSupplier, setEditingSupplier] = useState<Supplier | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
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
      address: "",
      xeroContactId: "",
    },
  });

  const { data: allSuppliers = [], isLoading } = useQuery<Supplier[]>({
    queryKey: ["/api/suppliers"],
  });

  // Filter to show only hardware suppliers (not trades) and apply search
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
    },
    onError: () => {
      toast({
        title: "Error",
        description: "Failed to delete supplier",
        variant: "destructive",
      });
    },
  });

  const onSubmit = (data: FormValues) => {
    if (editingSupplier) {
      updateMutation.mutate({ id: editingSupplier.id, data });
    } else {
      createMutation.mutate(data);
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
      address: "",
      xeroContactId: "",
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
      address: supplier.address ?? "",
      xeroContactId: supplier.xeroContactId ?? "",
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
                <TableHead className="text-xs font-medium">Xero Status</TableHead>
                <TableHead className="w-[50px]"></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {suppliers.map((supplier) => (
                <TableRow 
                  key={supplier.id} 
                  className="hover-elevate cursor-pointer"
                  data-testid={`row-supplier-${supplier.id}`}
                >
                  <TableCell className="text-sm font-medium py-2" data-testid={`text-supplier-name-${supplier.id}`}>
                    {supplier.name}
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
                          data-testid={`button-actions-${supplier.id}`}
                        >
                          <MoreHorizontal className="h-4 w-4" />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        <DropdownMenuItem
                          onClick={() => handleEditSupplier(supplier)}
                          data-testid={`button-edit-${supplier.id}`}
                        >
                          <Pencil className="h-4 w-4 mr-2" />
                          Edit
                        </DropdownMenuItem>
                        <DropdownMenuItem
                          onClick={() => handleDeleteSupplier(supplier.id)}
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

      <Dialog open={isDialogOpen} onOpenChange={handleCloseDialog}>
        <DialogContent data-testid="dialog-supplier-form">
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
    </div>
  );
}
