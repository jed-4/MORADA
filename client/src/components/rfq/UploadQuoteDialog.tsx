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
import { Loader2, Upload, X } from "lucide-react";
import { useUpload } from "@/hooks/use-upload";
import type { Rfq } from "@shared/schema";

const uploadQuoteFormSchema = z.object({
  supplierId: z.string().optional(),
  supplierName: z.string().min(1, "Supplier name is required"),
  totalAmount: z.string().min(1, "Total amount is required"),
  // Australian supplier quotes are inconsistent about whether the headline
  // figure includes GST, and the PO converter assumes ex — so make the user
  // say which it is rather than guessing and being 10% out.
  gstMode: z.enum(["inclusive", "exclusive"]).default("inclusive"),
  leadTime: z.string().optional(),
  validUntil: z.string().optional(),
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
  const { uploadFile } = useUpload();

  const form = useForm<UploadQuoteFormValues>({
    resolver: zodResolver(uploadQuoteFormSchema),
    defaultValues: {
      supplierId: "",
      supplierName: "",
      totalAmount: "",
      gstMode: "inclusive",
      leadTime: "",
      validUntil: "",
      notes: "",
    },
  });

  const uploadMutation = useMutation({
    mutationFn: async (values: UploadQuoteFormValues) => {
      // Files are uploaded for real now. This used to synthesise
      // `/uploads/quotes/<name>` — a path that does not exist — and persist it,
      // so the RFQ list rendered those as genuine attachments and the preview
      // showed a broken frame.
      const attachments: { name: string; url: string; size: number }[] = [];
      for (const file of selectedFiles) {
        const result = await uploadFile(file);
        if (!result) {
          throw new Error(`Could not upload ${file.name}`);
        }
        attachments.push({ name: file.name, url: result.objectPath, size: file.size });
      }

      // Stored inc GST, matching the app-wide convention. A supplier quoting
      // ex GST is grossed up here so downstream comparison and PO conversion
      // are apples to apples.
      const entered = parseFloat(values.totalAmount);
      const totalCents = Math.round(
        (values.gstMode === "exclusive" ? entered * 1.1 : entered) * 100,
      );

      return apiRequest("/api/rfq-quotes", "POST", {
        rfqId: rfq.id,
        supplierId: values.supplierId || null,
        supplierName: values.supplierName,
        totalAmount: totalCents,
        leadTime: values.leadTime || null,
        validUntil: values.validUntil || null,
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
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="gstMode"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Is that figure inc or ex GST?</FormLabel>
                  <Select value={field.value} onValueChange={field.onChange}>
                    <FormControl>
                      <SelectTrigger data-testid="select-quote-gst-mode">
                        <SelectValue />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      <SelectItem value="inclusive">Includes GST</SelectItem>
                      <SelectItem value="exclusive">Excludes GST (add 10%)</SelectItem>
                    </SelectContent>
                  </Select>
                  <FormDescription>
                    Quotes are stored inc GST so suppliers can be compared like for like.
                  </FormDescription>
                  <FormMessage />
                </FormItem>
              )}
            />

            <div className="grid grid-cols-2 gap-4">
              <FormField
                control={form.control}
                name="leadTime"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Lead time (optional)</FormLabel>
                    <FormControl>
                      <Input {...field} placeholder="e.g. 2-3 weeks" data-testid="input-quote-lead-time" />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="validUntil"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Valid until (optional)</FormLabel>
                    <FormControl>
                      <Input {...field} type="date" data-testid="input-quote-valid-until" />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>

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
