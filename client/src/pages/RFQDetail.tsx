import { useParams, useLocation } from "wouter";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useState, useEffect, useRef } from "react";
import { pdf } from "@react-pdf/renderer";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
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
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { 
  ArrowLeft,
  FileText, 
  Download, 
  Send, 
  Eye,
  EyeOff,
  Calendar as CalendarIcon,
  Building2,
  Users,
  Save,
  Loader2,
  Plus,
  Trash2,
  Paperclip,
  Upload,
  X,
  Clock,
  Bell,
  ExternalLink,
  CheckCircle2,
  AlertCircle,
} from "lucide-react";
import { RFQDocument } from "@/components/rfq/pdf/RFQDocument";
import { SendRFQDialog } from "@/components/rfq/SendRFQDialog";
import { UploadQuoteDialog } from "@/components/rfq/UploadQuoteDialog";
import { QuoteComparisonView } from "@/components/rfq/QuoteComparisonView";
import type { Rfq, RfqItem, RfqQuote, Supplier, RfqTemplate } from "@shared/schema";
import { format } from "date-fns";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";

export default function RFQDetail() {
  const { id } = useParams<{ id: string }>();
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  
  const [pdfUrl, setPdfUrl] = useState<string | null>(null);
  const [pdfBlob, setPdfBlob] = useState<Blob | null>(null);
  const [isGenerating, setIsGenerating] = useState(false);
  const [showPreview, setShowPreview] = useState(false);
  const [showSendDialog, setShowSendDialog] = useState(false);
  const [showUploadQuoteDialog, setShowUploadQuoteDialog] = useState(false);
  const [showAddItemDialog, setShowAddItemDialog] = useState(false);
  const [editingItem, setEditingItem] = useState<RfqItem | null>(null);
  const [hasChanges, setHasChanges] = useState(false);
  const pdfUrlRef = useRef<string | null>(null);

  const [formData, setFormData] = useState({
    title: "",
    description: "",
    scope: "",
    dueDate: null as Date | null,
    deadline: null as Date | null,
    supplierIds: [] as string[],
    supplierNames: [] as string[],
    termsTemplateId: "",
    customTerms: "",
    internalNotes: "",
    isExternal: false,
    externalNotes: "",
    followUpEnabled: false,
    followUpDaysBefore: 3,
  });

  const [newItem, setNewItem] = useState({
    description: "",
    quantity: "",
    unit: "each",
    notes: "",
  });

  const { data: rfq, isLoading: rfqLoading } = useQuery<Rfq>({
    queryKey: ["/api/rfqs", id],
    enabled: !!id,
  });

  const { data: items = [], isLoading: itemsLoading } = useQuery<RfqItem[]>({
    queryKey: ["/api/rfq-items", id],
    enabled: !!id,
  });

  const { data: quotes = [], isLoading: quotesLoading } = useQuery<RfqQuote[]>({
    queryKey: ["/api/rfqs", id, "quotes"],
    enabled: !!id,
  });

  const { data: suppliers = [] } = useQuery<Supplier[]>({
    queryKey: ["/api/suppliers"],
  });

  const { data: rfqTemplates = [] } = useQuery<RfqTemplate[]>({
    queryKey: ["/api/rfq-templates"],
  });

  const { data: companySettings } = useQuery({
    queryKey: ["/api/company-settings"],
  });

  useEffect(() => {
    if (rfq) {
      setFormData({
        title: rfq.title || "",
        description: rfq.description || "",
        scope: rfq.scope || "",
        dueDate: rfq.dueDate ? new Date(rfq.dueDate) : null,
        deadline: rfq.deadline ? new Date(rfq.deadline) : null,
        supplierIds: rfq.supplierIds || [],
        supplierNames: rfq.supplierNames || [],
        termsTemplateId: rfq.termsTemplateId || "",
        customTerms: rfq.customTerms || "",
        internalNotes: rfq.internalNotes || "",
        isExternal: rfq.isExternal || false,
        externalNotes: rfq.externalNotes || "",
        followUpEnabled: rfq.followUpEnabled || false,
        followUpDaysBefore: rfq.followUpDaysBefore || 3,
      });
    }
  }, [rfq]);

  const updateRfqMutation = useMutation({
    mutationFn: async (data: Partial<typeof formData>) => {
      return await apiRequest(`/api/rfqs/${id}`, "PATCH", {
        ...data,
        dueDate: data.dueDate?.toISOString(),
        deadline: data.deadline?.toISOString(),
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/rfqs", id] });
      setHasChanges(false);
      toast({ title: "RFQ saved" });
    },
    onError: (error: any) => {
      toast({ title: "Failed to save", description: error.message, variant: "destructive" });
    },
  });

  const createItemMutation = useMutation({
    mutationFn: async (data: typeof newItem) => {
      return await apiRequest("/api/rfq-items", "POST", {
        rfqId: id,
        description: data.description,
        quantity: parseFloat(data.quantity) || 0,
        unit: data.unit,
        notes: data.notes,
        displayOrder: items.length,
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/rfq-items", id] });
      setShowAddItemDialog(false);
      setNewItem({ description: "", quantity: "", unit: "each", notes: "" });
      toast({ title: "Item added" });
    },
  });

  const updateItemMutation = useMutation({
    mutationFn: async ({ itemId, data }: { itemId: string; data: Partial<RfqItem> }) => {
      return await apiRequest(`/api/rfq-items/${itemId}`, "PATCH", data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/rfq-items", id] });
      setEditingItem(null);
      toast({ title: "Item updated" });
    },
  });

  const deleteItemMutation = useMutation({
    mutationFn: async (itemId: string) => {
      return await apiRequest(`/api/rfq-items/${itemId}`, "DELETE");
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/rfq-items", id] });
      toast({ title: "Item deleted" });
    },
  });

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

  const handleSave = () => {
    updateRfqMutation.mutate(formData);
  };

  const handleFieldChange = (field: string, value: any) => {
    setFormData(prev => ({ ...prev, [field]: value }));
    setHasChanges(true);
  };

  const toggleSupplier = (supplierId: string, supplierName: string) => {
    const isSelected = formData.supplierIds.includes(supplierId);
    if (isSelected) {
      handleFieldChange("supplierIds", formData.supplierIds.filter(id => id !== supplierId));
      handleFieldChange("supplierNames", formData.supplierNames.filter(n => n !== supplierName));
    } else {
      handleFieldChange("supplierIds", [...formData.supplierIds, supplierId]);
      handleFieldChange("supplierNames", [...formData.supplierNames, supplierName]);
    }
  };

  const handleTermsTemplateChange = (templateId: string) => {
    if (templateId === "custom") {
      handleFieldChange("termsTemplateId", "");
      return;
    }
    handleFieldChange("termsTemplateId", templateId);
    const template = rfqTemplates.find(t => t.id === templateId);
    if (template?.termsAndConditions) {
      handleFieldChange("customTerms", template.termsAndConditions);
    }
  };

  const formatDate = (date: Date | string | null | undefined) => {
    if (!date) return "Not set";
    const d = typeof date === "string" ? new Date(date) : date;
    return format(d, "MMM d, yyyy");
  };

  const getStatusBadge = (status: string) => {
    const statusMap: Record<string, { label: string; variant: "default" | "secondary" | "outline"; className?: string }> = {
      draft: { label: "Draft", variant: "secondary" },
      sent: { label: "Sent", variant: "default", className: "bg-blue-500" },
      confirmed: { label: "Confirmed", variant: "default", className: "bg-green-500" },
      quoted: { label: "Quoted", variant: "default", className: "bg-amber-500" },
      accepted: { label: "Accepted", variant: "default", className: "bg-green-600" },
      declined: { label: "Declined", variant: "outline", className: "text-red-500 border-red-500" },
      expired: { label: "Expired", variant: "outline", className: "text-muted-foreground" },
    };
    const config = statusMap[status] || { label: status, variant: "outline" };
    return <Badge variant={config.variant} className={config.className}>{config.label}</Badge>;
  };

  const goBack = () => {
    setLocation("/rfqs");
  };

  if (rfqLoading || itemsLoading) {
    return (
      <div className="flex items-center justify-center h-full">
        <Loader2 className="w-8 h-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!rfq) {
    return (
      <div className="flex flex-col items-center justify-center h-full gap-4">
        <AlertCircle className="w-12 h-12 text-muted-foreground" />
        <p className="text-muted-foreground">RFQ not found</p>
        <Button variant="outline" onClick={goBack}>
          <ArrowLeft className="w-4 h-4 mr-2" />
          Back to RFQs
        </Button>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full">
      {/* Header Row */}
      <div className="h-10 px-3 flex items-center justify-between border-b bg-background shrink-0">
        <div className="flex items-center gap-3">
          <button
            onClick={goBack}
            className="h-6 w-6 rounded-md hover-elevate active-elevate-2 flex items-center justify-center"
            data-testid="button-back"
          >
            <ArrowLeft className="w-4 h-4" />
          </button>
          <div className="flex items-center gap-2">
            <Input
              value={formData.title}
              onChange={(e) => handleFieldChange("title", e.target.value)}
              className="h-7 text-sm font-semibold border-transparent hover:border-input focus:border-input w-[200px]"
              data-testid="input-rfq-title"
            />
            <Badge variant="outline" className="text-xs font-mono">
              {rfq.rfqNumber}
            </Badge>
            {getStatusBadge(rfq.status)}
            {rfq.isExternal && (
              <Badge variant="outline" className="text-xs gap-1">
                <ExternalLink className="w-3 h-3" />
                External
              </Badge>
            )}
          </div>
        </div>

        <div className="flex items-center gap-2">
          {hasChanges && (
            <Button
              size="sm"
              variant="outline"
              onClick={handleSave}
              disabled={updateRfqMutation.isPending}
              className="h-7 text-xs"
              data-testid="button-save"
            >
              <Save className="w-3 h-3 mr-1" />
              {updateRfqMutation.isPending ? "Saving..." : "Save"}
            </Button>
          )}
          <Button
            size="sm"
            variant="outline"
            onClick={() => setShowPreview(!showPreview)}
            className="h-7 text-xs"
            data-testid="button-preview-pdf"
          >
            {showPreview ? <EyeOff className="w-3 h-3 mr-1" /> : <Eye className="w-3 h-3 mr-1" />}
            {showPreview ? "Hide" : "Preview"}
          </Button>
          <Button
            size="sm"
            variant="outline"
            onClick={handleDownloadPdf}
            disabled={!pdfBlob}
            className="h-7 text-xs"
            data-testid="button-download-pdf"
          >
            <Download className="w-3 h-3 mr-1" />
            PDF
          </Button>
          <Button
            size="sm"
            onClick={() => setShowSendDialog(true)}
            className="h-7 text-xs bg-[#bba7db] hover:bg-[#bba7db]/90 text-white"
            data-testid="button-send-rfq"
          >
            <Send className="w-3 h-3 mr-1" />
            Send
          </Button>
        </div>
      </div>

      {/* Content - Two Column Layout */}
      <div className="flex-1 overflow-hidden flex">
        {/* Main Content (Left) */}
        <div className="flex-1 overflow-auto p-4 space-y-4">
          {/* Supplier & Date Row */}
          <Card className="p-4">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              {/* Suppliers */}
              <div className="space-y-2">
                <Label className="text-xs text-muted-foreground">Suppliers</Label>
                <Popover>
                  <PopoverTrigger asChild>
                    <Button variant="outline" className="w-full h-8 justify-start text-sm font-normal">
                      <Building2 className="w-4 h-4 mr-2 text-muted-foreground" />
                      {formData.supplierIds.length > 0 
                        ? `${formData.supplierIds.length} selected`
                        : "Select suppliers"}
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-64 p-2" align="start">
                    <div className="space-y-1 max-h-[200px] overflow-y-auto">
                      {suppliers.map((supplier) => (
                        <label
                          key={supplier.id}
                          className="flex items-center gap-2 p-2 rounded hover-elevate cursor-pointer"
                        >
                          <input
                            type="checkbox"
                            checked={formData.supplierIds.includes(supplier.id)}
                            onChange={() => toggleSupplier(supplier.id, supplier.name)}
                            className="rounded"
                          />
                          <span className="text-sm">{supplier.name}</span>
                        </label>
                      ))}
                    </div>
                  </PopoverContent>
                </Popover>
                {formData.supplierNames.length > 0 && (
                  <div className="flex flex-wrap gap-1">
                    {formData.supplierNames.map((name, i) => (
                      <Badge key={i} variant="secondary" className="text-xs">
                        {name}
                        <button
                          onClick={() => toggleSupplier(formData.supplierIds[i], name)}
                          className="ml-1 hover:text-destructive"
                        >
                          <X className="w-3 h-3" />
                        </button>
                      </Badge>
                    ))}
                  </div>
                )}
              </div>

              {/* Due Date */}
              <div className="space-y-2">
                <Label className="text-xs text-muted-foreground">Response Due</Label>
                <Popover>
                  <PopoverTrigger asChild>
                    <Button variant="outline" className="w-full h-8 justify-start text-sm font-normal">
                      <CalendarIcon className="w-4 h-4 mr-2 text-muted-foreground" />
                      {formData.dueDate ? format(formData.dueDate, "MMM d, yyyy") : "Set due date"}
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-auto p-0" align="start">
                    <Calendar
                      mode="single"
                      selected={formData.dueDate || undefined}
                      onSelect={(date) => handleFieldChange("dueDate", date)}
                      initialFocus
                    />
                  </PopoverContent>
                </Popover>
              </div>

              {/* Deadline */}
              <div className="space-y-2">
                <Label className="text-xs text-muted-foreground">Work Deadline</Label>
                <Popover>
                  <PopoverTrigger asChild>
                    <Button variant="outline" className="w-full h-8 justify-start text-sm font-normal">
                      <Clock className="w-4 h-4 mr-2 text-muted-foreground" />
                      {formData.deadline ? format(formData.deadline, "MMM d, yyyy") : "Set deadline"}
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-auto p-0" align="start">
                    <Calendar
                      mode="single"
                      selected={formData.deadline || undefined}
                      onSelect={(date) => handleFieldChange("deadline", date)}
                      initialFocus
                    />
                  </PopoverContent>
                </Popover>
              </div>
            </div>
          </Card>

          {/* Description */}
          <Card className="p-4 space-y-2">
            <Label className="text-xs text-muted-foreground">Description</Label>
            <Textarea
              value={formData.description}
              onChange={(e) => handleFieldChange("description", e.target.value)}
              placeholder="Brief description of the request..."
              className="min-h-[60px] text-sm"
              data-testid="input-description"
            />
          </Card>

          {/* Scope of Work */}
          <Card className="p-4 space-y-2">
            <Label className="text-xs text-muted-foreground">Scope of Work</Label>
            <Textarea
              value={formData.scope}
              onChange={(e) => handleFieldChange("scope", e.target.value)}
              placeholder="Detailed scope including specifications, quantities, delivery requirements..."
              className="min-h-[120px] text-sm"
              data-testid="input-scope"
            />
          </Card>

          {/* Line Items */}
          <Card className="p-4 space-y-3">
            <div className="flex items-center justify-between">
              <Label className="text-xs text-muted-foreground">Line Items ({items.length})</Label>
              <Button
                size="sm"
                variant="outline"
                onClick={() => setShowAddItemDialog(true)}
                className="h-6 text-xs"
                data-testid="button-add-item"
              >
                <Plus className="w-3 h-3 mr-1" />
                Add Item
              </Button>
            </div>
            {items.length === 0 ? (
              <div className="text-center py-8 text-muted-foreground text-sm">
                No line items yet. Add items to specify what you need quoted.
              </div>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow className="h-8">
                    <TableHead className="text-xs">Description</TableHead>
                    <TableHead className="text-xs w-24">Quantity</TableHead>
                    <TableHead className="text-xs w-20">Unit</TableHead>
                    <TableHead className="text-xs w-10"></TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {items.map((item) => (
                    <TableRow key={item.id} className="h-10">
                      <TableCell className="text-sm">{item.description}</TableCell>
                      <TableCell className="text-sm">
                        {item.quantity ? parseFloat(item.quantity.toString()).toFixed(2) : "-"}
                      </TableCell>
                      <TableCell className="text-sm">{item.unit || "-"}</TableCell>
                      <TableCell>
                        <Button
                          size="icon"
                          variant="ghost"
                          className="h-6 w-6"
                          onClick={() => deleteItemMutation.mutate(item.id)}
                        >
                          <Trash2 className="w-3 h-3 text-destructive" />
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </Card>

          {/* Attachments */}
          <Card className="p-4 space-y-3">
            <div className="flex items-center justify-between">
              <Label className="text-xs text-muted-foreground">
                Attachments ({rfq.attachmentUrls?.length || 0})
              </Label>
              <Button size="sm" variant="outline" className="h-6 text-xs" data-testid="button-add-attachment">
                <Upload className="w-3 h-3 mr-1" />
                Upload
              </Button>
            </div>
            {(!rfq.attachmentUrls || rfq.attachmentUrls.length === 0) ? (
              <div className="border-2 border-dashed rounded-lg p-8 text-center text-muted-foreground text-sm">
                <Paperclip className="w-8 h-8 mx-auto mb-2 opacity-50" />
                <p>Drag files here or click Upload</p>
                <p className="text-xs mt-1">Plans, specs, drawings</p>
              </div>
            ) : (
              <div className="space-y-2">
                {rfq.attachmentFileNames?.map((name, i) => (
                  <div key={i} className="flex items-center gap-2 p-2 rounded bg-muted/30">
                    <Paperclip className="w-4 h-4 text-muted-foreground" />
                    <span className="text-sm flex-1">{name}</span>
                    <Button size="icon" variant="ghost" className="h-6 w-6">
                      <Download className="w-3 h-3" />
                    </Button>
                  </div>
                ))}
              </div>
            )}
          </Card>

          {/* Terms */}
          <Card className="p-4 space-y-3">
            <div className="flex items-center justify-between">
              <Label className="text-xs text-muted-foreground">Terms & Conditions</Label>
              <Select value={formData.termsTemplateId || "custom"} onValueChange={handleTermsTemplateChange}>
                <SelectTrigger className="w-[180px] h-7 text-xs">
                  <SelectValue placeholder="Select template" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="custom">Custom</SelectItem>
                  {rfqTemplates.filter(t => t.termsAndConditions).map((template) => (
                    <SelectItem key={template.id} value={template.id}>
                      {template.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <Textarea
              value={formData.customTerms}
              onChange={(e) => handleFieldChange("customTerms", e.target.value)}
              placeholder="Terms and conditions to include in the RFQ..."
              className="min-h-[80px] text-sm"
              data-testid="input-terms"
            />
          </Card>

          {/* PDF Preview */}
          {showPreview && (
            <Card className="p-4 space-y-3">
              <Label className="text-xs text-muted-foreground">PDF Preview</Label>
              {isGenerating ? (
                <div className="flex items-center justify-center h-[500px] bg-muted/20 rounded">
                  <Loader2 className="w-8 h-8 animate-spin text-muted-foreground" />
                </div>
              ) : pdfUrl ? (
                <iframe
                  src={pdfUrl}
                  className="w-full h-[500px] border rounded"
                  title="RFQ PDF Preview"
                />
              ) : (
                <div className="flex items-center justify-center h-[500px] bg-muted/20 rounded text-muted-foreground">
                  Failed to generate preview
                </div>
              )}
            </Card>
          )}

          {/* Quotes Tab */}
          <Card className="p-4 space-y-3">
            <div className="flex items-center justify-between">
              <Label className="text-xs text-muted-foreground">Quotes Received ({quotes.length})</Label>
              <Button
                size="sm"
                variant="outline"
                onClick={() => setShowUploadQuoteDialog(true)}
                className="h-6 text-xs"
              >
                <Upload className="w-3 h-3 mr-1" />
                Upload Quote
              </Button>
            </div>
            {quotes.length === 0 ? (
              <div className="text-center py-8 text-muted-foreground text-sm">
                No quotes received yet
              </div>
            ) : (
              <QuoteComparisonView rfqId={rfq.id} quotes={quotes} rfq={rfq} />
            )}
          </Card>
        </div>

        {/* Sidebar (Right) */}
        <div className="w-80 border-l overflow-auto p-4 space-y-4 bg-muted/10">
          {/* External/Track Only Toggle */}
          <Card className="p-3 space-y-3">
            <div className="flex items-center justify-between">
              <div>
                <Label className="text-xs font-medium">Track Only Mode</Label>
                <p className="text-[10px] text-muted-foreground">
                  Track RFQ sent outside BuildPro
                </p>
              </div>
              <Switch
                checked={formData.isExternal}
                onCheckedChange={(checked) => handleFieldChange("isExternal", checked)}
              />
            </div>
            {formData.isExternal && (
              <Textarea
                value={formData.externalNotes}
                onChange={(e) => handleFieldChange("externalNotes", e.target.value)}
                placeholder="Where was this RFQ sent? (email, phone, etc.)"
                className="text-xs min-h-[60px]"
              />
            )}
          </Card>

          {/* Follow-up Reminders */}
          <Card className="p-3 space-y-3">
            <div className="flex items-center justify-between">
              <div>
                <Label className="text-xs font-medium">Auto Follow-up</Label>
                <p className="text-[10px] text-muted-foreground">
                  Send reminder before due date
                </p>
              </div>
              <Switch
                checked={formData.followUpEnabled}
                onCheckedChange={(checked) => handleFieldChange("followUpEnabled", checked)}
              />
            </div>
            {formData.followUpEnabled && (
              <div className="space-y-2">
                <Label className="text-xs text-muted-foreground">Days before due date</Label>
                <Select
                  value={formData.followUpDaysBefore.toString()}
                  onValueChange={(v) => handleFieldChange("followUpDaysBefore", parseInt(v))}
                >
                  <SelectTrigger className="h-7 text-xs">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="1">1 day before</SelectItem>
                    <SelectItem value="3">3 days before</SelectItem>
                    <SelectItem value="5">5 days before</SelectItem>
                    <SelectItem value="7">7 days before</SelectItem>
                  </SelectContent>
                </Select>
                {rfq.followUpSentAt && (
                  <p className="text-[10px] text-green-600 flex items-center gap-1">
                    <CheckCircle2 className="w-3 h-3" />
                    Sent {format(new Date(rfq.followUpSentAt), "MMM d")}
                  </p>
                )}
              </div>
            )}
          </Card>

          {/* Internal Notes */}
          <Card className="p-3 space-y-2">
            <Label className="text-xs font-medium">Internal Notes</Label>
            <p className="text-[10px] text-muted-foreground">
              Only visible to your team
            </p>
            <Textarea
              value={formData.internalNotes}
              onChange={(e) => handleFieldChange("internalNotes", e.target.value)}
              placeholder="Notes for your team..."
              className="text-xs min-h-[100px]"
              data-testid="input-internal-notes"
            />
          </Card>

          {/* Activity */}
          <Card className="p-3 space-y-3">
            <Label className="text-xs font-medium">Activity</Label>
            <div className="space-y-3">
              <div className="flex items-start gap-2">
                <CheckCircle2 className="w-4 h-4 text-muted-foreground mt-0.5" />
                <div>
                  <p className="text-xs">Created</p>
                  <p className="text-[10px] text-muted-foreground">
                    {rfq.createdByName} - {formatDate(rfq.createdAt)}
                  </p>
                </div>
              </div>
              {rfq.sentAt && (
                <div className="flex items-start gap-2">
                  <Send className="w-4 h-4 text-muted-foreground mt-0.5" />
                  <div>
                    <p className="text-xs">Sent to suppliers</p>
                    <p className="text-[10px] text-muted-foreground">
                      {formatDate(rfq.sentAt)}
                    </p>
                  </div>
                </div>
              )}
            </div>
          </Card>
        </div>
      </div>

      {/* Add Item Dialog */}
      <Dialog open={showAddItemDialog} onOpenChange={setShowAddItemDialog}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Add Line Item</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label className="text-xs">Description</Label>
              <Input
                value={newItem.description}
                onChange={(e) => setNewItem(prev => ({ ...prev, description: e.target.value }))}
                placeholder="Item description"
                data-testid="input-new-item-description"
              />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label className="text-xs">Quantity</Label>
                <Input
                  type="number"
                  value={newItem.quantity}
                  onChange={(e) => setNewItem(prev => ({ ...prev, quantity: e.target.value }))}
                  placeholder="0"
                />
              </div>
              <div className="space-y-2">
                <Label className="text-xs">Unit</Label>
                <Select value={newItem.unit} onValueChange={(v) => setNewItem(prev => ({ ...prev, unit: v }))}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="each">each</SelectItem>
                    <SelectItem value="m">m</SelectItem>
                    <SelectItem value="m2">m²</SelectItem>
                    <SelectItem value="m3">m³</SelectItem>
                    <SelectItem value="lm">lm</SelectItem>
                    <SelectItem value="kg">kg</SelectItem>
                    <SelectItem value="hr">hr</SelectItem>
                    <SelectItem value="lot">lot</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="space-y-2">
              <Label className="text-xs">Notes</Label>
              <Textarea
                value={newItem.notes}
                onChange={(e) => setNewItem(prev => ({ ...prev, notes: e.target.value }))}
                placeholder="Additional notes..."
                className="min-h-[60px]"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowAddItemDialog(false)}>Cancel</Button>
            <Button
              onClick={() => createItemMutation.mutate(newItem)}
              disabled={!newItem.description || createItemMutation.isPending}
              className="bg-[#bba7db] hover:bg-[#bba7db]/90 text-white"
            >
              {createItemMutation.isPending ? "Adding..." : "Add Item"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Send RFQ Dialog */}
      {rfq && (
        <SendRFQDialog
          open={showSendDialog}
          onOpenChange={setShowSendDialog}
          rfq={rfq}
          pdfBlob={pdfBlob}
        />
      )}

      {/* Upload Quote Dialog */}
      {rfq && (
        <UploadQuoteDialog
          open={showUploadQuoteDialog}
          onOpenChange={setShowUploadQuoteDialog}
          rfq={rfq}
        />
      )}
    </div>
  );
}
