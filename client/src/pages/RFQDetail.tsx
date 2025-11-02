import { useParams } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { useState, useEffect, useRef } from "react";
import { pdf } from "@react-pdf/renderer";
import { Button } from "@/components/ui/button";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { 
  FileText, 
  Download, 
  Send, 
  Eye, 
  Calendar,
  Building2,
  Users,
  CheckCircle2,
  Clock,
} from "lucide-react";
import { RFQDocument } from "@/components/rfq/pdf/RFQDocument";
import { SendRFQDialog } from "@/components/rfq/SendRFQDialog";
import type { Rfq, RfqItem } from "@shared/schema";
import { format } from "date-fns";

export default function RFQDetail() {
  const { id } = useParams<{ id: string }>();
  const [pdfUrl, setPdfUrl] = useState<string | null>(null);
  const [pdfBlob, setPdfBlob] = useState<Blob | null>(null);
  const [isGenerating, setIsGenerating] = useState(false);
  const [showPreview, setShowPreview] = useState(false);
  const [showSendDialog, setShowSendDialog] = useState(false);
  const pdfUrlRef = useRef<string | null>(null);

  // Fetch RFQ
  const { data: rfq, isLoading: rfqLoading } = useQuery<Rfq>({
    queryKey: ["/api/rfqs", id],
    enabled: !!id,
  });

  // Fetch RFQ items
  const { data: items = [], isLoading: itemsLoading } = useQuery<RfqItem[]>({
    queryKey: ["/api/rfq-items", id],
    enabled: !!id,
  });

  // Fetch company settings for logo and branding
  const { data: companySettings } = useQuery({
    queryKey: ["/api/company-settings"],
  });

  // Generate PDF when preview is toggled
  useEffect(() => {
    if (!rfq || !items.length) return;

    let isCancelled = false;

    async function generatePdf() {
      if (!showPreview) {
        if (pdfUrlRef.current) {
          URL.revokeObjectURL(pdfUrlRef.current);
          pdfUrlRef.current = null;
        }
        setPdfUrl(null);
        setPdfBlob(null);
        return;
      }

      setIsGenerating(true);

      try {
        const blob = await pdf(
          <RFQDocument
            rfq={rfq}
            items={items}
            companyLogo={companySettings?.logo}
            companyName={companySettings?.companyName || "BuildPro"}
            companyEmail={companySettings?.email}
            companyPhone={companySettings?.phone}
            primaryColor="#215E35"
            confirmLink={`${window.location.origin}/rfqs/${rfq.id}/confirm`}
          />
        ).toBlob();

        if (!isCancelled) {
          if (pdfUrlRef.current) {
            URL.revokeObjectURL(pdfUrlRef.current);
          }

          const url = URL.createObjectURL(blob);
          pdfUrlRef.current = url;
          setPdfUrl(url);
          setPdfBlob(blob);
        }
      } catch (error) {
        console.error("Error generating PDF:", error);
      } finally {
        if (!isCancelled) {
          setIsGenerating(false);
        }
      }
    }

    generatePdf();

    return () => {
      isCancelled = true;
      if (pdfUrlRef.current) {
        URL.revokeObjectURL(pdfUrlRef.current);
        pdfUrlRef.current = null;
      }
    };
  }, [rfq, items, companySettings, showPreview]);

  const handleDownloadPdf = () => {
    if (!pdfBlob || !rfq) return;

    const link = document.createElement("a");
    link.href = URL.createObjectURL(pdfBlob);
    link.download = `RFQ-${rfq.rfqNumber}.pdf`;
    link.click();
  };

  const handleSendRfq = () => {
    // Generate PDF first if not already generated
    if (!pdfBlob && !showPreview) {
      setShowPreview(true);
    }
    setShowSendDialog(true);
  };

  if (rfqLoading || itemsLoading) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="text-muted-foreground">Loading RFQ...</div>
      </div>
    );
  }

  if (!rfq) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="text-muted-foreground">RFQ not found</div>
      </div>
    );
  }

  const formatDate = (date: Date | string | null | undefined) => {
    if (!date) return "N/A";
    const d = typeof date === "string" ? new Date(date) : date;
    return format(d, "MMM d, yyyy");
  };

  const getStatusBadge = (status: string) => {
    const statusMap: Record<string, { label: string; variant: "default" | "secondary" | "outline" }> = {
      draft: { label: "Draft", variant: "secondary" },
      sent: { label: "Sent", variant: "default" },
      responded: { label: "Responded", variant: "outline" },
      closed: { label: "Closed", variant: "outline" },
    };
    const config = statusMap[status] || { label: status, variant: "outline" };
    return <Badge variant={config.variant}>{config.label}</Badge>;
  };

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="border-b bg-background px-6 py-4">
        <div className="flex items-center justify-between">
          <div>
            <div className="flex items-center gap-3 mb-2">
              <h1 className="text-2xl font-semibold">{rfq.title}</h1>
              {getStatusBadge(rfq.status)}
            </div>
            <div className="flex items-center gap-4 text-sm text-muted-foreground">
              <span className="flex items-center gap-1">
                <FileText className="h-4 w-4" />
                RFQ #{rfq.rfqNumber}
              </span>
              <span className="flex items-center gap-1">
                <Calendar className="h-4 w-4" />
                Due {formatDate(rfq.dueDate)}
              </span>
              <span className="flex items-center gap-1">
                <Users className="h-4 w-4" />
                {rfq.supplierNames?.length || 0} Suppliers
              </span>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              onClick={() => setShowPreview(!showPreview)}
              data-testid="button-preview-pdf"
            >
              <Eye className="h-4 w-4 mr-2" />
              {showPreview ? "Hide" : "Preview"} PDF
            </Button>
            <Button
              variant="outline"
              onClick={handleDownloadPdf}
              disabled={!pdfBlob}
              data-testid="button-download-pdf"
            >
              <Download className="h-4 w-4 mr-2" />
              Download PDF
            </Button>
            <Button onClick={handleSendRfq} data-testid="button-send-rfq">
              <Send className="h-4 w-4 mr-2" />
              Send RFQ
            </Button>
          </div>
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-hidden p-6">
        <Tabs defaultValue="details" className="h-full flex flex-col">
          <TabsList>
            <TabsTrigger value="details">Details</TabsTrigger>
            <TabsTrigger value="items">Items ({items.length})</TabsTrigger>
            <TabsTrigger value="quotes">Quotes</TabsTrigger>
            <TabsTrigger value="activity">Activity</TabsTrigger>
          </TabsList>

          <TabsContent value="details" className="flex-1 overflow-auto space-y-6">
            {/* RFQ Info */}
            <Card>
              <CardHeader>
                <CardTitle>RFQ Information</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <div className="text-sm font-medium text-muted-foreground mb-1">Created By</div>
                    <div className="text-sm">{rfq.createdByName}</div>
                  </div>
                  <div>
                    <div className="text-sm font-medium text-muted-foreground mb-1">Created At</div>
                    <div className="text-sm">{formatDate(rfq.createdAt)}</div>
                  </div>
                  {rfq.sentAt && (
                    <div>
                      <div className="text-sm font-medium text-muted-foreground mb-1">Sent At</div>
                      <div className="text-sm">{formatDate(rfq.sentAt)}</div>
                    </div>
                  )}
                  <div>
                    <div className="text-sm font-medium text-muted-foreground mb-1">Due Date</div>
                    <div className="text-sm">{formatDate(rfq.dueDate)}</div>
                  </div>
                </div>

                {rfq.description && (
                  <div>
                    <div className="text-sm font-medium text-muted-foreground mb-1">Description</div>
                    <div className="text-sm">{rfq.description}</div>
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Suppliers */}
            <Card>
              <CardHeader>
                <CardTitle>Suppliers ({rfq.supplierNames?.length || 0})</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-2">
                  {rfq.supplierNames?.map((name, index) => (
                    <div
                      key={index}
                      className="flex items-center justify-between p-3 rounded-lg bg-muted/50"
                    >
                      <div className="flex items-center gap-2">
                        <Building2 className="h-4 w-4 text-muted-foreground" />
                        <span className="font-medium">{name}</span>
                      </div>
                      <Badge variant="outline">Pending</Badge>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>

            {/* Scope of Work */}
            {rfq.scope && (
              <Card>
                <CardHeader>
                  <CardTitle>Scope of Work</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="p-4 rounded-lg bg-muted/30 border">
                    <p className="text-sm whitespace-pre-wrap">{rfq.scope}</p>
                  </div>
                </CardContent>
              </Card>
            )}

            {/* PDF Preview */}
            {showPreview && (
              <Card>
                <CardHeader>
                  <CardTitle>PDF Preview</CardTitle>
                </CardHeader>
                <CardContent>
                  {isGenerating ? (
                    <div className="flex items-center justify-center h-[600px]">
                      <div className="text-muted-foreground">Generating PDF...</div>
                    </div>
                  ) : pdfUrl ? (
                    <iframe
                      src={pdfUrl}
                      className="w-full h-[600px] border rounded"
                      title="RFQ PDF Preview"
                    />
                  ) : (
                    <div className="flex items-center justify-center h-[600px]">
                      <div className="text-muted-foreground">Failed to generate PDF</div>
                    </div>
                  )}
                </CardContent>
              </Card>
            )}
          </TabsContent>

          <TabsContent value="items" className="flex-1 overflow-auto">
            <Card>
              <CardHeader>
                <CardTitle>Line Items</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-2">
                  {items.map((item) => (
                    <div
                      key={item.id}
                      className="flex items-start gap-4 p-4 rounded-lg border hover-elevate"
                    >
                      <div className="flex-1">
                        <div className="font-medium mb-1">{item.description}</div>
                        {item.notes && (
                          <div className="text-sm text-muted-foreground">{item.notes}</div>
                        )}
                      </div>
                      <div className="text-right">
                        <div className="text-sm font-medium">
                          {item.quantity ? parseFloat(item.quantity.toString()).toFixed(2) : "-"}{" "}
                          {item.unit || ""}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="quotes" className="flex-1 overflow-auto">
            <Card>
              <CardHeader>
                <CardTitle>Supplier Quotes</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-center py-12 text-muted-foreground">
                  No quotes received yet
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="activity" className="flex-1 overflow-auto">
            <Card>
              <CardHeader>
                <CardTitle>Activity Log</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  <div className="flex items-start gap-3">
                    <div className="mt-1">
                      <CheckCircle2 className="h-5 w-5 text-muted-foreground" />
                    </div>
                    <div className="flex-1">
                      <div className="text-sm font-medium">RFQ Created</div>
                      <div className="text-xs text-muted-foreground">
                        {rfq.createdByName} • {formatDate(rfq.createdAt)}
                      </div>
                    </div>
                  </div>
                  {rfq.sentAt && (
                    <div className="flex items-start gap-3">
                      <div className="mt-1">
                        <Send className="h-5 w-5 text-muted-foreground" />
                      </div>
                      <div className="flex-1">
                        <div className="text-sm font-medium">RFQ Sent</div>
                        <div className="text-xs text-muted-foreground">
                          Sent to {rfq.supplierNames?.length || 0} suppliers • {formatDate(rfq.sentAt)}
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </div>

      {/* Send RFQ Dialog */}
      {rfq && (
        <SendRFQDialog
          open={showSendDialog}
          onOpenChange={setShowSendDialog}
          rfq={rfq}
          pdfBlob={pdfBlob}
        />
      )}
    </div>
  );
}
