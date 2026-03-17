import { useState, useMemo } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { format } from "date-fns";
import { CalendarIcon, Upload, X, FileText, Search, UserPlus } from "lucide-react";
import type { EstimateItem, Contact } from "@shared/schema";
import { useQuery } from "@tanstack/react-query";
import AddContactDialog from "@/components/AddContactDialog";

// RFQ Form Schema
const rfqFormSchema = z.object({
  title: z.string().min(1, "Title is required"),
  description: z.string().optional(),
  supplierIds: z.array(z.string()).min(1, "At least one supplier is required"),
  scope: z.string().min(10, "Scope must be at least 10 characters"),
  dueDate: z.date().optional(),
});

type RFQFormValues = z.infer<typeof rfqFormSchema>;

interface CreateRFQDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  estimateId: string;
  projectId: string;
  selectedItemIds: Set<string>;
  estimateItems: EstimateItem[];
  estimateName: string;
}

export function CreateRFQDialog({
  open,
  onOpenChange,
  estimateId,
  projectId,
  selectedItemIds,
  estimateItems,
  estimateName,
}: CreateRFQDialogProps) {
  const { toast } = useToast();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [attachments, setAttachments] = useState<File[]>([]);
  const [supplierSearch, setSupplierSearch] = useState("");
  const [showAddSupplier, setShowAddSupplier] = useState(false);

  // Fetch all contacts and filter suppliers client-side so invalidation works after adding
  const { data: allContacts = [] } = useQuery<Contact[]>({
    queryKey: ["/api/contacts"],
  });
  const suppliers = useMemo(() => allContacts.filter((c) => c.contactType === "supplier" || c.contactType === "trade"), [allContacts]);

  const filteredSuppliers = useMemo(() => {
    const search = supplierSearch.toLowerCase();
    return suppliers.filter((s) => (s.name ?? "").toLowerCase().includes(search));
  }, [suppliers, supplierSearch]);

  // Get selected items
  const selectedItems = estimateItems.filter(item => selectedItemIds.has(item.id));

  // Form
  const form = useForm<RFQFormValues>({
    resolver: zodResolver(rfqFormSchema),
    defaultValues: {
      title: `RFQ - ${estimateName}`,
      description: "",
      supplierIds: [],
      scope: "",
    },
  });

  const handleSubmit = async (values: RFQFormValues) => {
    setIsSubmitting(true);
    try {
      // Get supplier names from IDs
      const selectedSuppliers = suppliers.filter(s => values.supplierIds.includes(s.id));
      const supplierNames = selectedSuppliers.map(s => s.name);

      // Create RFQ
      const rfq = await apiRequest("/api/rfqs", "POST", {
        projectId,
        title: values.title,
        description: values.description || "",
        scope: values.scope,
        dueDate: values.dueDate?.toISOString(),
        supplierIds: values.supplierIds,
        supplierNames: supplierNames,
        attachmentUrls: [], // TODO: Upload attachments
      });

      // Create RFQ items from selected estimate items
      const rfqItemPromises = selectedItems.map((item, index) =>
        apiRequest("/api/rfq-items", "POST", {
          rfqId: rfq.id,
          estimateItemId: item.id,
          description: item.name || "",
          quantity: item.quantity || 0,
          unit: item.unitType || "",
          notes: "",
          displayOrder: index,
        })
      );

      await Promise.all(rfqItemPromises);
      
      queryClient.invalidateQueries({ queryKey: ["/api/rfqs"] });
      
      toast({
        title: "RFQ Created",
        description: `Created RFQ "${rfq.title}" with ${selectedItems.length} items`,
      });

      onOpenChange(false);
      form.reset();
      setAttachments([]);
    } catch (error: any) {
      toast({
        title: "Error",
        description: error.message || "Failed to create RFQ",
        variant: "destructive",
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files) {
      setAttachments(Array.from(e.target.files));
    }
  };

  const removeAttachment = (index: number) => {
    setAttachments(attachments.filter((_, i) => i !== index));
  };

  return (
    <>
    <AddContactDialog
      open={showAddSupplier}
      onOpenChange={setShowAddSupplier}
      defaultContactType="supplier"
    />
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Create RFQ from Estimate</DialogTitle>
        </DialogHeader>

        <form onSubmit={form.handleSubmit(handleSubmit)} className="space-y-6">
          {/* RFQ Title */}
          <div className="space-y-2">
            <Label htmlFor="title">RFQ Title</Label>
            <Input
              id="title"
              {...form.register("title")}
              placeholder="e.g., Concrete Pour - Slab"
              data-testid="input-rfq-title"
            />
            {form.formState.errors.title && (
              <p className="text-sm text-destructive">{form.formState.errors.title.message}</p>
            )}
          </div>

          {/* Description */}
          <div className="space-y-2">
            <Label htmlFor="description">Description (Optional)</Label>
            <Input
              id="description"
              {...form.register("description")}
              placeholder="Brief description of the RFQ"
              data-testid="input-rfq-description"
            />
          </div>

          {/* Multi-Supplier Selection */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <Label>Suppliers &amp; Trades</Label>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="h-7 gap-1 text-xs text-muted-foreground"
                onClick={() => setShowAddSupplier(true)}
              >
                <UserPlus className="h-3.5 w-3.5" />
                Add new contact
              </Button>
            </div>
            <div className="relative mb-2">
              <Search className="absolute left-2 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
              <Input
                value={supplierSearch}
                onChange={(e) => setSupplierSearch(e.target.value)}
                placeholder="Search suppliers & trades..."
                className="h-8 pl-7 text-sm"
              />
            </div>
            <div className="space-y-2 max-h-[200px] overflow-y-auto border rounded-md p-2">
              {suppliers.length === 0 ? (
                <p className="text-xs text-muted-foreground text-center py-4">
                  No suppliers or trades found. Use "Add new contact" above to create one.
                </p>
              ) : filteredSuppliers.length === 0 ? (
                <p className="text-xs text-muted-foreground text-center py-2">
                  No contacts match your search.
                </p>
              ) : (
                filteredSuppliers.map((supplier) => (
                <div key={supplier.id} className="flex items-center space-x-2">
                  <input
                    type="checkbox"
                    id={`supplier-${supplier.id}`}
                    checked={form.watch("supplierIds").includes(supplier.id)}
                    onChange={(e) => {
                      const currentIds = form.watch("supplierIds");
                      if (e.target.checked) {
                        form.setValue("supplierIds", [...currentIds, supplier.id]);
                      } else {
                        form.setValue("supplierIds", currentIds.filter(id => id !== supplier.id));
                      }
                    }}
                    className="h-4 w-4"
                  />
                  <label htmlFor={`supplier-${supplier.id}`} className="text-sm cursor-pointer">
                    {supplier.name}
                  </label>
                </div>
              )))}
            </div>
            {form.formState.errors.supplierIds && (
              <p className="text-sm text-destructive">{form.formState.errors.supplierIds.message}</p>
            )}
          </div>

          {/* Wunderbuild-style Scope Box */}
          <div className="space-y-2">
            <Label htmlFor="scope">Scope of Work</Label>
            <Textarea
              id="scope"
              {...form.register("scope")}
              placeholder="Describe the scope of work in detail..."
              className="min-h-[150px] resize-none"
              data-testid="textarea-scope"
            />
            <p className="text-xs text-muted-foreground">
              Provide detailed specifications, requirements, and expectations
            </p>
            {form.formState.errors.scope && (
              <p className="text-sm text-destructive">{form.formState.errors.scope.message}</p>
            )}
          </div>

          {/* Due Date */}
          <div className="space-y-2">
            <Label>Due Date (Optional)</Label>
            <Popover>
              <PopoverTrigger asChild>
                <Button
                  variant="outline"
                  className="w-full justify-start text-left font-normal"
                  data-testid="button-due-date"
                >
                  <CalendarIcon className="mr-2 h-4 w-4" />
                  {form.watch("dueDate") ? (
                    format(form.watch("dueDate")!, "PPP")
                  ) : (
                    <span>Pick a date</span>
                  )}
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-auto p-0">
                <Calendar
                  mode="single"
                  selected={form.watch("dueDate")}
                  onSelect={(date) => form.setValue("dueDate", date)}
                  initialFocus
                />
              </PopoverContent>
            </Popover>
          </div>

          {/* File Attachments */}
          <div className="space-y-2">
            <Label htmlFor="attachments">Attachments (Plans, Specs)</Label>
            <Input
              id="attachments"
              type="file"
              multiple
              onChange={handleFileChange}
              className="cursor-pointer"
              data-testid="input-attachments"
            />
            {attachments.length > 0 && (
              <div className="space-y-1 mt-2">
                {attachments.map((file, index) => (
                  <div
                    key={index}
                    className="flex items-center justify-between bg-muted/50 rounded-md px-3 py-2"
                  >
                    <div className="flex items-center gap-2">
                      <FileText className="h-4 w-4 text-muted-foreground" />
                      <span className="text-sm">{file.name}</span>
                      <span className="text-xs text-muted-foreground">
                        ({(file.size / 1024).toFixed(1)} KB)
                      </span>
                    </div>
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      onClick={() => removeAttachment(index)}
                      data-testid={`button-remove-attachment-${index}`}
                    >
                      <X className="h-4 w-4" />
                    </Button>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Selected Items Preview */}
          <div className="space-y-2">
            <Label>Selected Items ({selectedItems.length})</Label>
            <div className="border rounded-md p-3 bg-muted/20 max-h-40 overflow-y-auto">
              {selectedItems.map((item) => (
                <div
                  key={item.id}
                  className="text-sm py-1 flex items-center justify-between"
                >
                  <span>{item.name}</span>
                  <span className="text-muted-foreground">
                    {item.quantity} {item.unitType}
                  </span>
                </div>
              ))}
            </div>
          </div>

          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
              disabled={isSubmitting}
              data-testid="button-cancel"
            >
              Cancel
            </Button>
            <Button
              type="submit"
              disabled={isSubmitting}
              data-testid="button-create-rfq"
            >
              {isSubmitting ? "Creating..." : "Create RFQ"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
    </>
  );
}
