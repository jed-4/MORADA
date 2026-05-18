import { useState, useRef } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { CostCodeSelect } from "@/components/CostCodeSelect";
import { Switch } from "@/components/ui/switch";
import { useUpload } from "@/hooks/use-upload";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { Camera, ImageIcon, Loader2, AlertCircle } from "lucide-react";
import { cn } from "@/lib/utils";
import type { Contact } from "@shared/schema";

interface CaptureReceiptDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  projectId?: string;
}

export function CaptureReceiptDialog({ open, onOpenChange, projectId }: CaptureReceiptDialogProps) {
  const { toast } = useToast();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [photoFile, setPhotoFile] = useState<File | null>(null);
  const [photoPreview, setPhotoPreview] = useState<string | null>(null);
  const [amount, setAmount] = useState("");
  const [description, setDescription] = useState("");
  const [costCodeId, setCostCodeId] = useState("");
  const [supplierName, setSupplierName] = useState("");
  const [paidByMe, setPaidByMe] = useState(false);

  const { uploadFile, isUploading } = useUpload();

  const { data: contacts = [] } = useQuery<Contact[]>({
    queryKey: ["/api/contacts"],
  });

  const submitMutation = useMutation({
    mutationFn: async () => {
      let objectPath: string | undefined;
      if (photoFile) {
        const result = await uploadFile(photoFile);
        if (result) objectPath = result.objectPath;
      }

      const totalCents = Math.round(parseFloat(amount) * 100);
      await apiRequest("/api/bills", "POST", {
        billType: "receipt",
        projectId: projectId || undefined,
        billDate: new Date().toISOString(),
        status: "draft",
        total: totalCents,
        subtotal: totalCents,
        tax: 0,
        notes: description.trim(),
        costCodeId: costCodeId || undefined,
        supplierName: supplierName.trim() || undefined,
        paidByEmployee: paidByMe,
        ...(objectPath ? { objectPath } : {}),
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/bills"] });
      toast({ title: "Receipt submitted", description: "Your receipt has been saved." });
      handleReset();
      onOpenChange(false);
    },
    onError: (err: any) => {
      toast({ title: "Failed to submit receipt", description: err?.message || "Please try again.", variant: "destructive" });
    },
  });

  const handleReset = () => {
    setPhotoFile(null);
    setPhotoPreview(null);
    setAmount("");
    setDescription("");
    setCostCodeId("");
    setSupplierName("");
    setPaidByMe(false);
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setPhotoFile(file);
    const url = URL.createObjectURL(file);
    setPhotoPreview(url);
    e.target.value = "";
  };

  const canSubmit = amount && !isNaN(parseFloat(amount)) && parseFloat(amount) > 0 && description.trim() && costCodeId;
  const isPending = submitMutation.isPending || isUploading;

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!isPending) { onOpenChange(o); if (!o) handleReset(); } }}>
      <DialogContent className="max-w-[min(480px,94vw)] max-h-[90vh] flex flex-col overflow-hidden">
        <DialogHeader>
          <DialogTitle>Capture Receipt</DialogTitle>
        </DialogHeader>

        <div className="flex-1 overflow-y-auto space-y-4 pr-1">

          {/* Photo picker */}
          <div className="space-y-2">
            <Label>Receipt Photo</Label>
            {photoPreview ? (
              <div className="relative rounded-md overflow-hidden border border-border">
                <img src={photoPreview} alt="Receipt" className="w-full max-h-48 object-cover" />
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  className="absolute bottom-2 right-2 h-7 text-xs bg-background/90"
                  onClick={() => fileInputRef.current?.click()}
                >
                  Change
                </Button>
              </div>
            ) : (
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                className="w-full h-28 rounded-md border-2 border-dashed border-border flex flex-col items-center justify-center gap-2 text-muted-foreground hover-elevate active-elevate-2 transition-colors"
              >
                <Camera className="h-7 w-7" />
                <span className="text-xs">Tap to take a photo or choose from library</span>
              </button>
            )}
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              capture="environment"
              className="hidden"
              onChange={handleFileChange}
            />
          </div>

          {/* Amount */}
          <div className="space-y-1.5">
            <Label htmlFor="receipt-amount">Amount (inc. GST) <span className="text-destructive">*</span></Label>
            <div className="relative">
              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground text-sm font-medium">$</span>
              <Input
                id="receipt-amount"
                type="number"
                step="0.01"
                min="0"
                placeholder="0.00"
                value={amount}
                onChange={e => setAmount(e.target.value)}
                className="pl-7 text-lg font-semibold"
                data-testid="input-receipt-amount"
              />
            </div>
          </div>

          {/* Description */}
          <div className="space-y-1.5">
            <Label htmlFor="receipt-description">Description <span className="text-destructive">*</span></Label>
            <Textarea
              id="receipt-description"
              value={description}
              onChange={e => setDescription(e.target.value)}
              placeholder="What did you buy and what is it for? e.g. 'Sand and cement for slab patch — Level 1 bathroom'"
              className="min-h-[72px] resize-none"
              data-testid="input-receipt-description"
            />
          </div>

          {/* Cost Code */}
          <div className="space-y-1.5">
            <Label>Cost Code <span className="text-destructive">*</span></Label>
            <CostCodeSelect
              value={costCodeId}
              onValueChange={setCostCodeId}
              placeholder="Select cost code…"
              allowNone={false}
              data-testid="select-receipt-cost-code"
            />
          </div>

          {/* Supplier */}
          <div className="space-y-1.5">
            <Label htmlFor="receipt-supplier">Supplier <span className="text-muted-foreground font-normal text-xs">(optional)</span></Label>
            <Input
              id="receipt-supplier"
              value={supplierName}
              onChange={e => setSupplierName(e.target.value)}
              placeholder="e.g. Bunnings Kiama"
              data-testid="input-receipt-supplier"
            />
          </div>

          {/* Paid by me toggle */}
          <div className="space-y-2">
            <div className="flex items-center justify-between gap-3">
              <div>
                <p className="text-sm font-medium">Paid by me — need reimbursement</p>
                <p className="text-xs text-muted-foreground">I paid for this out of my own pocket</p>
              </div>
              <Switch
                checked={paidByMe}
                onCheckedChange={setPaidByMe}
                data-testid="switch-paid-by-me"
              />
            </div>
            {paidByMe && (
              <div className="flex items-start gap-2 rounded-md border border-amber-500/30 bg-amber-500/10 px-3 py-2">
                <AlertCircle className="h-4 w-4 text-amber-600 mt-0.5 shrink-0" />
                <p className="text-xs text-amber-700 dark:text-amber-400">
                  This receipt will be sent to your manager for reimbursement approval.
                </p>
              </div>
            )}
          </div>

        </div>

        <DialogFooter className="pt-2 flex-shrink-0">
          <Button variant="outline" onClick={() => { onOpenChange(false); handleReset(); }} disabled={isPending}>
            Cancel
          </Button>
          <Button
            onClick={() => submitMutation.mutate()}
            disabled={!canSubmit || isPending}
            data-testid="button-submit-receipt"
          >
            {isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
            {isPending ? "Submitting…" : "Submit Receipt"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
