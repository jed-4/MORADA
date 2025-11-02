import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useMutation } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Form, FormControl, FormDescription, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { Upload, X } from "lucide-react";
import type { Rfq } from "@shared/schema";

const uploadQuoteFormSchema = z.object({
  supplierId: z.string().optional(),
  supplierName: z.string().min(1, "Supplier name is required"),
  totalAmount: z.string().min(1, "Total amount is required"),
  notes: z.string().optional(),
});

type UploadQuoteFormValues = z.infer<typeof uploadQuoteFormSchema>;

interface UploadQuoteDialogProps {
  rfq: Rfq;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function UploadQuoteDialog({ rfq, open, onOpenChange }: UploadQuoteDialogProps) {
  const { toast } = useToast();
  const [selectedFiles, setSelectedFiles] = useState<File[]>([]);

  const form = useForm<UploadQuoteFormValues>({
    resolver: zodResolver(uploadQuoteFormSchema),
    defaultValues: {
      supplierId: "",
      supplierName: "",
      totalAmount: "",
      notes: "",
    },
  });

  const uploadMutation = useMutation({
    mutationFn: async (values: UploadQuoteFormValues) => {
      // Convert dollar amount to cents
      const totalCents = Math.round(parseFloat(values.totalAmount) * 100);

      // TODO: Upload files to storage and get URLs
      // For now, we'll create placeholder attachment objects
      const attachments = selectedFiles.map(file => ({
        name: file.name,
        url: `/uploads/quotes/${file.name}`, // Placeholder
        size: file.size,
      }));

      return apiRequest("/api/rfq-quotes", "POST", {
        rfqId: rfq.id,
        supplierId: values.supplierId || null,
        supplierName: values.supplierName,
        totalAmount: totalCents,
        notes: values.notes || "",
        attachments,
        status: "pending",
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/rfqs", rfq.id, "quotes"] });
      queryClient.invalidateQueries({ queryKey: ["/api/rfqs", rfq.id] });
      toast({
        title: "Quote uploaded",
        description: "The supplier quote has been uploaded successfully.",
      });
      onOpenChange(false);
      form.reset();
      setSelectedFiles([]);
    },
    onError: (error: any) => {
      toast({
        title: "Error uploading quote",
        description: error.message || "Failed to upload quote. Please try again.",
        variant: "destructive",
      });
    },
  });

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    setSelectedFiles(prev => [...prev, ...files]);
  };

  const removeFile = (index: number) => {
    setSelectedFiles(prev => prev.filter((_, i) => i !== index));
  };

  const onSubmit = (values: UploadQuoteFormValues) => {
    uploadMutation.mutate(values);
  };

  // Get supplier list from RFQ
  const suppliers = rfq.supplierNames?.map((name, index) => ({
    id: rfq.supplierIds?.[index] || "",
    name: name,
  })) || [];

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto" data-testid="dialog-upload-quote">
        <DialogHeader>
          <DialogTitle>Upload Supplier Quote</DialogTitle>
          <DialogDescription>
            Upload a quote response for {rfq.rfqNumber}
          </DialogDescription>
        </DialogHeader>

        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
            <FormField
              control={form.control}
              name="supplierName"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Supplier</FormLabel>
                  <Select
                    value={field.value}
                    onValueChange={(value) => {
                      const supplier = suppliers.find(s => s.name === value);
                      field.onChange(value);
                      if (supplier) {
                        form.setValue("supplierId", supplier.id);
                      }
                    }}
                  >
                    <FormControl>
                      <SelectTrigger data-testid="select-supplier">
                        <SelectValue placeholder="Select supplier" />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      {suppliers.map((supplier) => (
                        <SelectItem key={supplier.name} value={supplier.name}>
                          {supplier.name}
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
              name="totalAmount"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Total Quote Amount</FormLabel>
                  <FormControl>
                    <div className="relative">
                      <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground">$</span>
                      <Input
                        {...field}
                        type="number"
                        step="0.01"
                        min="0"
                        placeholder="0.00"
                        className="pl-7"
                        data-testid="input-quote-amount"
                      />
                    </div>
                  </FormControl>
                  <FormDescription>
                    Enter the total amount quoted by the supplier
                  </FormDescription>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="notes"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Notes (Optional)</FormLabel>
                  <FormControl>
                    <Textarea
                      {...field}
                      placeholder="Add any notes about this quote..."
                      rows={3}
                      data-testid="textarea-quote-notes"
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <div className="space-y-2">
              <FormLabel>Attachments</FormLabel>
              <div className="flex items-center gap-2">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => document.getElementById("quote-file-input")?.click()}
                  data-testid="button-upload-file"
                >
                  <Upload className="h-4 w-4 mr-2" />
                  Upload Files
                </Button>
                <input
                  id="quote-file-input"
                  type="file"
                  multiple
                  accept=".pdf,.doc,.docx,.xls,.xlsx,.jpg,.jpeg,.png"
                  onChange={handleFileSelect}
                  className="hidden"
                />
              </div>
              
              {selectedFiles.length > 0 && (
                <div className="space-y-2 mt-3">
                  {selectedFiles.map((file, index) => (
                    <div
                      key={index}
                      className="flex items-center justify-between p-2 bg-muted rounded-md"
                      data-testid={`file-item-${index}`}
                    >
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium truncate">{file.name}</p>
                        <p className="text-xs text-muted-foreground">
                          {(file.size / 1024).toFixed(1)} KB
                        </p>
                      </div>
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        onClick={() => removeFile(index)}
                        data-testid={`button-remove-file-${index}`}
                      >
                        <X className="h-4 w-4" />
                      </Button>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <DialogFooter>
              <Button
                type="button"
                variant="outline"
                onClick={() => onOpenChange(false)}
                disabled={uploadMutation.isPending}
                data-testid="button-cancel"
              >
                Cancel
              </Button>
              <Button
                type="submit"
                disabled={uploadMutation.isPending}
                data-testid="button-submit"
              >
                {uploadMutation.isPending ? "Uploading..." : "Upload Quote"}
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}
