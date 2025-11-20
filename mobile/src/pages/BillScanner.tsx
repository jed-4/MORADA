import { useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { MobileHeader } from "@/components/MobileHeader";
import { MobileButton } from "@/components/ui/MobileButton";
import { MobileInput } from "@/components/ui/MobileInput";
import { BottomSheet } from "@/components/BottomSheet";
import { Camera as CameraIcon, Image, FileText, Check, X, AlertCircle } from "lucide-react";
import { Camera, CameraResultType, CameraSource } from "@capacitor/camera";
import { Haptics, ImpactStyle, NotificationType } from "@capacitor/haptics";
import { apiRequest } from "@shared/api";
import { queryClient } from "@lib/queryClient";
import type { Project } from "@shared/schema";

interface OCRResult {
  invoiceNumber?: string;
  invoiceDate?: string;
  dueDate?: string;
  supplierName?: string;
  supplierAddress?: string;
  totalAmount?: number;
  totalTax?: number;
  subtotalAmount?: number;
  lineItems: Array<{
    description: string;
    quantity: number;
    unitPrice: number;
    totalAmount: number;
    taxAmount: number;
  }>;
  currency: string;
  confidence: number;
}

export function BillScanner() {
  const [capturedImage, setCapturedImage] = useState<string | null>(null);
  const [ocrResult, setOcrResult] = useState<OCRResult | null>(null);
  const [isReviewSheetOpen, setIsReviewSheetOpen] = useState(false);
  const [selectedProjectId, setSelectedProjectId] = useState("");
  const [error, setError] = useState<string | null>(null);

  const { data: projects = [] } = useQuery<Project[]>({
    queryKey: ["/api/projects"],
    enabled: true,
  });

  const processOCRMutation = useMutation({
    mutationFn: async (imageData: string) => {
      setError(null);
      Haptics.impact({ style: ImpactStyle.Medium });
      return await apiRequest<OCRResult>("/api/ocr/process-invoice", "POST", {
        fileData: imageData,
        fileName: `invoice_${Date.now()}.jpg`,
      });
    },
    onSuccess: (data) => {
      setOcrResult(data);
      setIsReviewSheetOpen(true);
      Haptics.notification({ type: NotificationType.Success });
    },
    onError: (err: any) => {
      setError(err.message || "Failed to process invoice. Please try again.");
      Haptics.notification({ type: NotificationType.Error });
    },
  });

  const createBillMutation = useMutation({
    mutationFn: async (data: {
      projectId: string;
      ocrData: OCRResult;
      imageData: string;
    }) => {
      setError(null);
      return await apiRequest("/api/bills", "POST", {
        projectId: data.projectId,
        invoiceNumber: data.ocrData.invoiceNumber || "",
        invoiceDate: data.ocrData.invoiceDate || new Date().toISOString(),
        dueDate: data.ocrData.dueDate || new Date().toISOString(),
        supplierName: data.ocrData.supplierName || "",
        totalAmount: data.ocrData.totalAmount || 0,
        ocrProcessed: true,
        ocrData: data.ocrData,
        attachments: [{ url: data.imageData, type: "image" }],
        status: "draft",
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/bills"] });
      setIsReviewSheetOpen(false);
      setCapturedImage(null);
      setOcrResult(null);
      setSelectedProjectId("");
      setError(null);
      Haptics.notification({ type: NotificationType.Success });
    },
    onError: (err: any) => {
      setError(err.message || "Failed to create bill. Please try again.");
      Haptics.notification({ type: NotificationType.Error });
    },
  });

  const handleTakePhoto = async () => {
    try {
      const photo = await Camera.getPhoto({
        resultType: CameraResultType.Base64,
        source: CameraSource.Camera,
        quality: 90,
        correctOrientation: true,
      });

      if (photo.base64String) {
        const imageData = `data:image/jpeg;base64,${photo.base64String}`;
        setCapturedImage(imageData);
        setError(null);
        processOCRMutation.mutate(imageData);
      }
    } catch (error: any) {
      console.error("Camera error:", error);
      setError(error.message || "Failed to access camera. Please check permissions.");
      Haptics.notification({ type: NotificationType.Error });
    }
  };

  const handleSelectFromGallery = async () => {
    try {
      const photo = await Camera.getPhoto({
        resultType: CameraResultType.Base64,
        source: CameraSource.Photos,
        quality: 90,
      });

      if (photo.base64String) {
        const imageData = `data:image/jpeg;base64,${photo.base64String}`;
        setCapturedImage(imageData);
        setError(null);
        processOCRMutation.mutate(imageData);
      }
    } catch (error: any) {
      console.error("Gallery error:", error);
      setError(error.message || "Failed to select photo. Please try again.");
      Haptics.notification({ type: NotificationType.Error });
    }
  };

  const handleCreateBill = () => {
    if (!selectedProjectId || !ocrResult || !capturedImage) return;
    createBillMutation.mutate({
      projectId: selectedProjectId,
      ocrData: ocrResult,
      imageData: capturedImage,
    });
  };

  const formatCurrency = (cents: number) => {
    return `$${(cents / 100).toFixed(2)}`;
  };

  return (
    <div className="flex flex-col h-full">
      <MobileHeader title="Scan Bill" showBack={true} showMore={false} showNotifications={false} />

      <main className="flex-1 overflow-y-auto p-4">
        {/* Instructions */}
        <div className="bg-card rounded-xl p-4 border mb-4">
          <h3 className="font-semibold mb-2">How to scan a bill</h3>
          <ol className="text-sm text-muted-foreground space-y-1 list-decimal list-inside">
            <li>Take a clear photo of the invoice or bill</li>
            <li>Make sure all text is visible and in focus</li>
            <li>Our AI will extract the details automatically</li>
            <li>Review and save to your project</li>
          </ol>
        </div>

        {/* Scan Options */}
        <div className="space-y-3">
          <MobileButton
            onClick={handleTakePhoto}
            variant="default"
            className="w-full flex items-center justify-center gap-2"
            data-testid="button-take-photo"
          >
            <CameraIcon className="w-5 h-5" />
            Take Photo
          </MobileButton>

          <MobileButton
            onClick={handleSelectFromGallery}
            variant="outline"
            className="w-full flex items-center justify-center gap-2"
            data-testid="button-select-photo"
          >
            <Image className="w-5 h-5" />
            Choose from Gallery
          </MobileButton>
        </div>

        {/* Error State */}
        {error && (
          <div className="mt-6 bg-destructive/10 rounded-xl p-4 border border-destructive/20">
            <div className="flex items-start gap-3">
              <AlertCircle className="w-5 h-5 text-destructive mt-0.5" />
              <div className="flex-1">
                <h3 className="font-semibold text-destructive mb-1">Error</h3>
                <p className="text-sm text-destructive/90">{error}</p>
              </div>
            </div>
          </div>
        )}

        {/* Processing State */}
        {processOCRMutation.isPending && (
          <div className="mt-6 bg-card rounded-xl p-6 border text-center">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary mx-auto mb-3" />
            <h3 className="font-semibold mb-1">Processing Invoice</h3>
            <p className="text-sm text-muted-foreground">
              Extracting data from your invoice...
            </p>
          </div>
        )}

        {/* Preview */}
        {capturedImage && !processOCRMutation.isPending && (
          <div className="mt-6 bg-card rounded-xl p-4 border">
            <h3 className="font-semibold mb-3 flex items-center gap-2">
              <FileText className="w-5 h-5" />
              Scanned Invoice
            </h3>
            <img
              src={capturedImage}
              alt="Captured invoice"
              className="w-full rounded-lg border"
            />
          </div>
        )}
      </main>

      {/* Review OCR Results Bottom Sheet */}
      <BottomSheet
        isOpen={isReviewSheetOpen}
        onClose={() => setIsReviewSheetOpen(false)}
        title="Review Invoice Details"
      >
        {ocrResult && (
          <div className="space-y-4">
            <div className="bg-muted/50 rounded-lg p-3">
              <div className="flex items-center justify-between mb-2">
                <span className="text-sm font-medium">Supplier</span>
                <span className="text-sm">{ocrResult.supplierName || "Not detected"}</span>
              </div>
              <div className="flex items-center justify-between mb-2">
                <span className="text-sm font-medium">Invoice #</span>
                <span className="text-sm">{ocrResult.invoiceNumber || "Not detected"}</span>
              </div>
              <div className="flex items-center justify-between mb-2">
                <span className="text-sm font-medium">Invoice Date</span>
                <span className="text-sm">
                  {ocrResult.invoiceDate
                    ? new Date(ocrResult.invoiceDate).toLocaleDateString()
                    : "Not detected"}
                </span>
              </div>
              <div className="flex items-center justify-between mb-2">
                <span className="text-sm font-medium">Total Amount</span>
                <span className="text-lg font-bold text-primary">
                  {ocrResult.totalAmount
                    ? formatCurrency(ocrResult.totalAmount)
                    : "Not detected"}
                </span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-sm font-medium">OCR Confidence</span>
                <span className="text-sm text-muted-foreground">
                  {(ocrResult.confidence * 100).toFixed(0)}%
                </span>
              </div>
            </div>

            {ocrResult.lineItems && ocrResult.lineItems.length > 0 && (
              <div>
                <h4 className="text-sm font-semibold mb-2">Line Items ({ocrResult.lineItems.length})</h4>
                <div className="space-y-2 max-h-40 overflow-y-auto">
                  {ocrResult.lineItems.map((item, index) => (
                    <div key={index} className="bg-muted/50 rounded p-2 text-xs">
                      <div className="font-medium">{item.description || `Item ${index + 1}`}</div>
                      <div className="text-muted-foreground">
                        Qty: {item.quantity} × {formatCurrency(item.unitPrice)} = {formatCurrency(item.totalAmount)}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            <div>
              <label className="block text-sm font-medium mb-2">Assign to Project</label>
              <select
                value={selectedProjectId}
                onChange={(e) => setSelectedProjectId(e.target.value)}
                className="w-full h-11 px-3 rounded-md border bg-background text-sm"
                data-testid="select-project"
              >
                <option value="">Select a project...</option>
                {projects.map((project) => (
                  <option key={project.id} value={project.id}>
                    {project.name}
                  </option>
                ))}
              </select>
            </div>

            {error && (
              <div className="bg-destructive/10 rounded-lg p-3 border border-destructive/20">
                <div className="flex items-start gap-2">
                  <AlertCircle className="w-4 h-4 text-destructive mt-0.5" />
                  <p className="text-sm text-destructive">{error}</p>
                </div>
              </div>
            )}

            <div className="flex gap-2 pt-4">
              <MobileButton
                onClick={() => {
                  setIsReviewSheetOpen(false);
                  setCapturedImage(null);
                  setOcrResult(null);
                  setError(null);
                }}
                variant="ghost"
                className="flex-1 flex items-center justify-center gap-2"
                disabled={createBillMutation.isPending}
                data-testid="button-cancel-bill"
              >
                <X className="w-4 h-4" />
                Cancel
              </MobileButton>
              <MobileButton
                onClick={handleCreateBill}
                variant="default"
                className="flex-1 flex items-center justify-center gap-2"
                disabled={!selectedProjectId || createBillMutation.isPending}
                data-testid="button-create-bill"
              >
                {createBillMutation.isPending ? (
                  <>
                    <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-current" />
                    Creating...
                  </>
                ) : (
                  <>
                    <Check className="w-4 h-4" />
                    Create Bill
                  </>
                )}
              </MobileButton>
            </div>
          </div>
        )}
      </BottomSheet>
    </div>
  );
}
