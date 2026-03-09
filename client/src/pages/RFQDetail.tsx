import { useParams, useLocation } from "wouter";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useState, useEffect, useRef, useMemo } from "react";
import { pdf } from "@react-pdf/renderer";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
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
  Search,
  ChevronDown,
  ChevronRight,
} from "lucide-react";
import { RFQDocument } from "@/components/rfq/pdf/RFQDocument";
import { SendRFQDialog } from "@/components/rfq/SendRFQDialog";
import { UploadQuoteDialog } from "@/components/rfq/UploadQuoteDialog";
import { QuoteComparisonView } from "@/components/rfq/QuoteComparisonView";
import type { Rfq, RfqItem, RfqQuote, Contact, RfqTemplate, CostCode, EstimateItem } from "@shared/schema";
import { format } from "date-fns";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";
import { CostCodeSelect } from "@/components/CostCodeSelect";

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
  const [descOpen, setDescOpen] = useState(true);
  const [termsOpen, setTermsOpen] = useState(false);
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
    unitPrice: "",
    costCodeId: "",
    notes: "",
  });
  const [showImportDialog, setShowImportDialog] = useState(false);
  const [selectedEstimateItems, setSelectedEstimateItems] = useState<string[]>([]);
  const [supplierSearch, setSupplierSearch] = useState("");

  const { data: rfq, isLoading: rfqLoading } = useQuery<Rfq>({
    queryKey: ["/api/rfqs", id],
    enabled: !!id,
  });

  const { data: items = [], isLoading: itemsLoading } = useQuery<RfqItem[]>({
    queryKey: ["/api/rfq-items", id],
    enabled: !!id,
  });

  const { data: quotes = [] } = useQuery<RfqQuote[]>({
    queryKey: ["/api/rfqs", id, "quotes"],
    enabled: !!id,
  });

  const { data: suppliers = [] } = useQuery<Contact[]>({
    queryKey: ["/api/contacts?contactType=supplier"],
  });

  const filteredSuppliers = useMemo(() => {
    const search = supplierSearch.toLowerCase();
    return suppliers.filter((s) => (s.name ?? "").toLowerCase().includes(search));
  }, [suppliers, supplierSearch]);

  const { data: rfqTemplates = [] } = useQuery<RfqTemplate[]>({
    queryKey: ["/api/rfq-templates"],
  });

  const { data: companySettings } = useQuery({
    queryKey: ["/api/company-settings"],
  });

  const { data: costCodes = [] } = useQuery<CostCode[]>({
    queryKey: ["/api/cost-codes"],
  });

  const { data: estimateItems = [] } = useQuery<EstimateItem[]>({
    queryKey: ["/api/projects", rfq?.projectId, "estimate-items"],
    enabled: !!rfq?.projectId,
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
        unitPrice: data.unitPrice ? Math.round(parseFloat(data.unitPrice) * 100) : null,
        costCodeId: data.costCodeId || null,
        notes: data.notes,
        displayOrder: items.length,
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/rfq-items", id] });
      setShowAddItemDialog(false);
      setNewItem({ description: "", quantity: "", unit: "each", unitPrice: "", costCodeId: "", notes: "" });
      toast({ title: "Item added" });
    },
  });

  const importItemsMutation = useMutation({
    mutationFn: async (estimateItemIds: string[]) => {
      const selectedItems = estimateItems.filter(ei => estimateItemIds.includes(ei.id));
      const promises = selectedItems.map((ei, index) =>
        apiRequest("/api/rfq-items", "POST", {
          rfqId: id,
          estimateItemId: ei.id,
          costCodeId: ei.costCodeId || null,
          description: ei.description || ei.itemDescription || "",
          quantity: ei.quantity || 0,
          unit: ei.unit || "each",
          unitPrice: ei.unitPrice || null,
          notes: "",
          displayOrder: items.length + index,
        })
      );
      return Promise.all(promises);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/rfq-items", id] });
      setShowImportDialog(false);
      setSelectedEstimateItems([]);
      toast({ title: `${selectedEstimateItems.length} items imported` });
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
    const configs: Record<string, { label: string; className: string }> = {
      draft: {
        label: "Draft",
        className: "bg-muted text-muted-foreground border-border",
      },
      sent: {
        label: "Sent",
        className:
          "bg-blue-100 text-blue-700 border-blue-200 dark:bg-blue-900/30 dark:text-blue-400 dark:border-blue-800",
      },
      pending: {
        label: "Pending",
        className:
          "bg-amber-100 text-amber-700 border-amber-200 dark:bg-amber-900/30 dark:text-amber-400 dark:border-amber-800",
      },
      confirmed: {
        label: "Confirmed",
        className:
          "bg-emerald-100 text-emerald-700 border-emerald-200 dark:bg-emerald-900/30 dark:text-emerald-400 dark:border-emerald-800",
      },
      quoted: {
        label: "Quoted",
        className:
          "bg-emerald-100 text-emerald-700 border-emerald-200 dark:bg-emerald-900/30 dark:text-emerald-400 dark:border-emerald-800",
      },
      accepted: {
        label: "Accepted",
        className:
          "bg-emerald-100 text-emerald-800 border-emerald-300 dark:bg-emerald-900/40 dark:text-emerald-300 dark:border-emerald-700",
      },
      declined: {
        label: "Declined",
        className:
          "bg-red-100 text-red-700 border-red-200 dark:bg-red-900/30 dark:text-red-400 dark:border-red-800",
      },
      expired: {
        label: "Expired",
        className: "bg-muted text-muted-foreground border-border",
      },
    };
    const config = configs[status] || {
      label: status,
      className: "bg-muted text-muted-foreground border-border",
    };
    return (
      <Badge variant="outline" className={cn("text-xs", config.className)}>
        {config.label}
      </Badge>
    );
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
      <div className="h-9 px-3 flex items-center justify-between border-b bg-background shrink-0">
        <div className="flex items-center gap-3">
          <button
            onClick={goBack}
            className="h-6 w-6 rounded-md hover-elevate active-elevate-2 flex items-center justify-center"
            data-testid="button-back"
          >
            <ArrowLeft className="w-4 h-4" />
          </button>
          <div className="flex items-center gap-2 flex-wrap">
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
        <div className="flex-1 overflow-auto p-3 space-y-2">

          {/* RFQ Info Card — suppliers/dates + collapsible description + collapsible T&C */}
          <Card className="overflow-hidden">
            {/* Card header */}
            <div className="h-8 flex items-center px-3 gap-2 border-b border-border/50 bg-muted/40">
              <div className="w-1.5 h-1.5 rounded-full flex-shrink-0 bg-[#bba7db]/80" />
              <span className="text-xs font-medium">RFQ Info</span>
            </div>

            {/* Suppliers & Dates — always visible */}
            <div className="p-3">
              <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                {/* Suppliers */}
                <div className="space-y-1.5">
                  <Label className="text-xs text-muted-foreground">Suppliers</Label>
                  <Popover>
                    <PopoverTrigger asChild>
                      <Button variant="outline" className="w-full justify-start text-sm font-normal">
                        <Building2 className="w-4 h-4 mr-2 text-muted-foreground" />
                        {formData.supplierIds.length > 0
                          ? `${formData.supplierIds.length} selected`
                          : "Select suppliers"}
                      </Button>
                    </PopoverTrigger>
                    <PopoverContent className="w-64 p-2" align="start">
                      <div className="relative mb-2">
                        <Search className="absolute left-2 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
                        <Input
                          value={supplierSearch}
                          onChange={(e) => setSupplierSearch(e.target.value)}
                          placeholder="Search suppliers..."
                          className="h-7 pl-7 text-sm"
                        />
                      </div>
                      <div className="space-y-1 max-h-[200px] overflow-y-auto">
                        {suppliers.length === 0 ? (
                          <p className="text-xs text-muted-foreground text-center py-4">
                            No suppliers found. Add suppliers first.
                          </p>
                        ) : filteredSuppliers.length === 0 ? (
                          <p className="text-xs text-muted-foreground text-center py-2">
                            No suppliers match your search.
                          </p>
                        ) : (
                          filteredSuppliers.map((supplier) => (
                            <label
                              key={supplier.id}
                              className="flex items-center gap-2 p-2 rounded hover-elevate cursor-pointer"
                            >
                              <input
                                type="checkbox"
                                checked={formData.supplierIds.includes(supplier.id)}
                                onChange={() => toggleSupplier(supplier.id, supplier.name ?? "")}
                                className="rounded"
                              />
                              <span className="text-sm">{supplier.name}</span>
                            </label>
                          ))
                        )}
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
                <div className="space-y-1.5">
                  <Label className="text-xs text-muted-foreground">Response Due</Label>
                  <Popover>
                    <PopoverTrigger asChild>
                      <Button variant="outline" className="w-full justify-start text-sm font-normal">
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
                <div className="space-y-1.5">
                  <Label className="text-xs text-muted-foreground">Work Deadline</Label>
                  <Popover>
                    <PopoverTrigger asChild>
                      <Button variant="outline" className="w-full justify-start text-sm font-normal">
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
            </div>

            {/* Description — collapsible sub-section */}
            <div className="border-t border-border/50">
              <button
                type="button"
                onClick={() => setDescOpen((o) => !o)}
                className="h-7 w-full flex items-center gap-1.5 px-3 hover-elevate"
              >
                {descOpen
                  ? <ChevronDown className="w-3 h-3 text-muted-foreground flex-shrink-0" />
                  : <ChevronRight className="w-3 h-3 text-muted-foreground flex-shrink-0" />}
                <span className="text-xs text-muted-foreground">Description</span>
              </button>
              {descOpen && (
                <div className="px-3 pb-3">
                  <Textarea
                    value={formData.description}
                    onChange={(e) => handleFieldChange("description", e.target.value)}
                    placeholder="Brief description of the request..."
                    className="min-h-[60px] text-sm"
                    data-testid="input-description"
                  />
                </div>
              )}
            </div>

            {/* Terms & Conditions — collapsible sub-section */}
            <div className="border-t border-border/50">
              <button
                type="button"
                onClick={() => setTermsOpen((o) => !o)}
                className="h-7 w-full flex items-center gap-1.5 px-3 hover-elevate"
              >
                {termsOpen
                  ? <ChevronDown className="w-3 h-3 text-muted-foreground flex-shrink-0" />
                  : <ChevronRight className="w-3 h-3 text-muted-foreground flex-shrink-0" />}
                <span className="text-xs text-muted-foreground">Terms & Conditions</span>
              </button>
              {termsOpen && (
                <div className="px-3 pb-3 space-y-2">
                  <Select value={formData.termsTemplateId || "custom"} onValueChange={handleTermsTemplateChange}>
                    <SelectTrigger className="h-7 text-xs">
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
                  <Textarea
                    value={formData.customTerms}
                    onChange={(e) => handleFieldChange("customTerms", e.target.value)}
                    placeholder="Terms and conditions to include in the RFQ..."
                    className="min-h-[80px] text-sm"
                    data-testid="input-terms"
                  />
                </div>
              )}
            </div>
          </Card>

          {/* Scope of Work */}
          <Card className="overflow-hidden">
            <div className="h-8 flex items-center px-3 gap-2 border-b border-border/50 bg-muted/40">
              <div className="w-1.5 h-1.5 rounded-full flex-shrink-0 bg-slate-400/60" />
              <span className="text-xs font-medium">Scope of Work</span>
            </div>
            <div className="p-3">
              <Textarea
                value={formData.scope}
                onChange={(e) => handleFieldChange("scope", e.target.value)}
                placeholder="Detailed scope including specifications, quantities, delivery requirements..."
                className="min-h-[100px] text-sm"
                data-testid="input-scope"
              />
            </div>
          </Card>

          {/* Line Items */}
          <Card className="overflow-hidden">
            <div className="h-8 flex items-center justify-between px-3 gap-2 border-b border-border/50 bg-muted/40">
              <div className="flex items-center gap-2">
                <div className="w-1.5 h-1.5 rounded-full flex-shrink-0 bg-amber-400/70" />
                <span className="text-xs font-medium">Line Items</span>
                {items.length > 0 && (
                  <Badge variant="secondary" className="text-xs h-4 px-1.5">{items.length}</Badge>
                )}
              </div>
              <div className="flex items-center gap-1.5">
                {estimateItems.length > 0 && (
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => setShowImportDialog(true)}
                    className="h-6 text-xs"
                    data-testid="button-import-items"
                  >
                    <FileText className="w-3 h-3 mr-1" />
                    Import
                  </Button>
                )}
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => setShowAddItemDialog(true)}
                  className="h-6 text-xs"
                  data-testid="button-add-item"
                >
                  <Plus className="w-3 h-3 mr-1" />
                  Add
                </Button>
              </div>
            </div>
            {items.length === 0 ? (
              <div className="text-center py-8 text-muted-foreground text-sm">
                No line items yet. Add items or import from the estimate.
              </div>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow className="h-8">
                    <TableHead className="text-xs">Cost Code</TableHead>
                    <TableHead className="text-xs">Description</TableHead>
                    <TableHead className="text-xs w-20 text-right">Qty</TableHead>
                    <TableHead className="text-xs w-16">Unit</TableHead>
                    <TableHead className="text-xs w-24 text-right">Unit Price</TableHead>
                    <TableHead className="text-xs w-24 text-right">Total</TableHead>
                    <TableHead className="text-xs w-10"></TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {items.map((item) => {
                    const costCode = costCodes.find(cc => cc.id === item.costCodeId);
                    const qty = item.quantity ? parseFloat(item.quantity.toString()) : 0;
                    const price = item.unitPrice ? item.unitPrice / 100 : 0;
                    const total = qty * price;
                    return (
                      <TableRow key={item.id} className="h-10">
                        <TableCell className="text-sm text-muted-foreground">
                          {costCode ? `${costCode.code}` : "-"}
                        </TableCell>
                        <TableCell className="text-sm">{item.description}</TableCell>
                        <TableCell className="text-sm text-right">
                          {qty > 0 ? qty.toFixed(2) : "-"}
                        </TableCell>
                        <TableCell className="text-sm">{item.unit || "-"}</TableCell>
                        <TableCell className="text-sm text-right">
                          {price > 0 ? `$${price.toFixed(2)}` : "-"}
                        </TableCell>
                        <TableCell className="text-sm text-right font-medium">
                          {total > 0 ? `$${total.toFixed(2)}` : "-"}
                        </TableCell>
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
                    );
                  })}
                  {items.length > 0 && items.some(i => i.unitPrice) && (
                    <TableRow className="bg-muted/30">
                      <TableCell colSpan={5} className="text-sm font-medium text-right">
                        Total (ex GST):
                      </TableCell>
                      <TableCell className="text-sm font-bold text-right">
                        ${items.reduce((sum, item) => {
                          const qty = item.quantity ? parseFloat(item.quantity.toString()) : 0;
                          const price = item.unitPrice ? item.unitPrice / 100 : 0;
                          return sum + (qty * price);
                        }, 0).toFixed(2)}
                      </TableCell>
                      <TableCell></TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            )}
          </Card>

          {/* Attachments */}
          <Card className="overflow-hidden">
            <div className="h-8 flex items-center justify-between px-3 gap-2 border-b border-border/50 bg-muted/40">
              <div className="flex items-center gap-2">
                <div className="w-1.5 h-1.5 rounded-full flex-shrink-0 bg-orange-400/70" />
                <span className="text-xs font-medium">Attachments</span>
                {(rfq.attachmentUrls?.length ?? 0) > 0 && (
                  <Badge variant="secondary" className="text-xs h-4 px-1.5">{rfq.attachmentUrls!.length}</Badge>
                )}
              </div>
              <Button size="sm" variant="outline" className="h-6 text-xs" data-testid="button-add-attachment">
                <Upload className="w-3 h-3 mr-1" />
                Upload
              </Button>
            </div>
            {(!rfq.attachmentUrls || rfq.attachmentUrls.length === 0) ? (
              <div className="border-2 border-dashed rounded-lg m-3 p-6 text-center text-muted-foreground text-sm">
                <Paperclip className="w-6 h-6 mx-auto mb-2 opacity-50" />
                <p>Drag files here or click Upload</p>
                <p className="text-xs mt-1 text-muted-foreground/60">Plans, specs, drawings</p>
              </div>
            ) : (
              <div className="p-3 space-y-1.5">
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

          {/* Quotes Received */}
          <Card className="overflow-hidden">
            <div className="h-8 flex items-center justify-between px-3 gap-2 border-b border-border/50 bg-muted/40">
              <div className="flex items-center gap-2">
                <div className="w-1.5 h-1.5 rounded-full flex-shrink-0 bg-emerald-400/70" />
                <span className="text-xs font-medium">Quotes Received</span>
                {quotes.length > 0 && (
                  <Badge variant="secondary" className="text-xs h-4 px-1.5">{quotes.length}</Badge>
                )}
              </div>
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

          {/* PDF Preview */}
          {showPreview && (
            <Card className="overflow-hidden">
              <div className="h-8 flex items-center px-3 gap-2 border-b border-border/50 bg-muted/40">
                <div className="w-1.5 h-1.5 rounded-full flex-shrink-0 bg-slate-400/60" />
                <span className="text-xs font-medium">PDF Preview</span>
              </div>
              {isGenerating ? (
                <div className="flex items-center justify-center h-[500px] bg-muted/20">
                  <Loader2 className="w-8 h-8 animate-spin text-muted-foreground" />
                </div>
              ) : pdfUrl ? (
                <iframe
                  src={pdfUrl}
                  className="w-full h-[500px]"
                  title="RFQ PDF Preview"
                />
              ) : (
                <div className="flex items-center justify-center h-[500px] bg-muted/20 text-muted-foreground">
                  Failed to generate preview
                </div>
              )}
            </Card>
          )}
        </div>

        {/* Sidebar (Right) */}
        <div className="w-72 border-l overflow-auto p-3 space-y-2 bg-muted/10">

          {/* Track Only Mode */}
          <Card className="overflow-hidden">
            <div className="h-8 flex items-center justify-between px-3 gap-2 border-b border-border/50 bg-muted/40">
              <div className="flex items-center gap-2">
                <div className="w-1.5 h-1.5 rounded-full flex-shrink-0 bg-slate-400/60" />
                <span className="text-xs font-medium">Track Only Mode</span>
              </div>
              <Switch
                checked={formData.isExternal}
                onCheckedChange={(checked) => handleFieldChange("isExternal", checked)}
              />
            </div>
            {formData.isExternal && (
              <div className="p-3">
                <Textarea
                  value={formData.externalNotes}
                  onChange={(e) => handleFieldChange("externalNotes", e.target.value)}
                  placeholder="Where was this RFQ sent? (email, phone, etc.)"
                  className="text-xs min-h-[60px]"
                />
              </div>
            )}
            {!formData.isExternal && (
              <p className="text-[10px] text-muted-foreground px-3 py-2">
                Track RFQ sent outside BuildPro
              </p>
            )}
          </Card>

          {/* Auto Follow-up */}
          <Card className="overflow-hidden">
            <div className="h-8 flex items-center justify-between px-3 gap-2 border-b border-border/50 bg-muted/40">
              <div className="flex items-center gap-2">
                <div className="w-1.5 h-1.5 rounded-full flex-shrink-0 bg-amber-400/70" />
                <span className="text-xs font-medium">Auto Follow-up</span>
              </div>
              <Switch
                checked={formData.followUpEnabled}
                onCheckedChange={(checked) => handleFieldChange("followUpEnabled", checked)}
              />
            </div>
            {formData.followUpEnabled ? (
              <div className="p-3 space-y-2">
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
                  <p className="text-[10px] text-emerald-600 dark:text-emerald-400 flex items-center gap-1">
                    <CheckCircle2 className="w-3 h-3" />
                    Sent {format(new Date(rfq.followUpSentAt), "MMM d")}
                  </p>
                )}
              </div>
            ) : (
              <p className="text-[10px] text-muted-foreground px-3 py-2">
                Send reminder before due date
              </p>
            )}
          </Card>

          {/* Internal Notes */}
          <Card className="overflow-hidden">
            <div className="h-8 flex items-center px-3 gap-2 border-b border-border/50 bg-muted/40">
              <div className="w-1.5 h-1.5 rounded-full flex-shrink-0 bg-slate-400/60" />
              <span className="text-xs font-medium">Internal Notes</span>
            </div>
            <div className="p-3">
              <p className="text-[10px] text-muted-foreground mb-2">
                Only visible to your team
              </p>
              <Textarea
                value={formData.internalNotes}
                onChange={(e) => handleFieldChange("internalNotes", e.target.value)}
                placeholder="Notes for your team..."
                className="text-xs min-h-[80px]"
                data-testid="input-internal-notes"
              />
            </div>
          </Card>

          {/* Activity */}
          <Card className="overflow-hidden">
            <div className="h-8 flex items-center px-3 gap-2 border-b border-border/50 bg-muted/40">
              <div className="w-1.5 h-1.5 rounded-full flex-shrink-0 bg-slate-400/60" />
              <span className="text-xs font-medium">Activity</span>
            </div>
            <div className="p-3 space-y-3">
              <div className="flex items-start gap-2">
                <CheckCircle2 className="w-3.5 h-3.5 text-muted-foreground mt-0.5 flex-shrink-0" />
                <div>
                  <p className="text-xs">Created</p>
                  <p className="text-[10px] text-muted-foreground">
                    {rfq.createdByName} · {formatDate(rfq.createdAt)}
                  </p>
                </div>
              </div>
              {rfq.sentAt && (
                <div className="flex items-start gap-2">
                  <Send className="w-3.5 h-3.5 text-muted-foreground mt-0.5 flex-shrink-0" />
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
              <Label className="text-xs">Cost Code</Label>
              <CostCodeSelect
                value={newItem.costCodeId}
                onValueChange={(v) => setNewItem(prev => ({ ...prev, costCodeId: v }))}
                placeholder="Select cost code..."
                allowNone
                data-testid="select-new-item-cost-code"
              />
            </div>
            <div className="space-y-2">
              <Label className="text-xs">Description</Label>
              <Input
                value={newItem.description}
                onChange={(e) => setNewItem(prev => ({ ...prev, description: e.target.value }))}
                placeholder="Item description"
                data-testid="input-new-item-description"
              />
            </div>
            <div className="grid grid-cols-3 gap-4">
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
              <div className="space-y-2">
                <Label className="text-xs">Unit Price ($)</Label>
                <Input
                  type="number"
                  step="0.01"
                  value={newItem.unitPrice}
                  onChange={(e) => setNewItem(prev => ({ ...prev, unitPrice: e.target.value }))}
                  placeholder="0.00"
                />
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

      {/* Import from Estimate Dialog */}
      <Dialog open={showImportDialog} onOpenChange={setShowImportDialog}>
        <DialogContent className="max-w-2xl max-h-[80vh]">
          <DialogHeader>
            <DialogTitle>Import Line Items from Estimate</DialogTitle>
          </DialogHeader>
          <div className="py-4">
            <p className="text-sm text-muted-foreground mb-4">
              Select estimate items to import as RFQ line items. Cost codes and pricing will be copied.
            </p>
            <div className="border rounded-lg max-h-[400px] overflow-y-auto">
              <Table>
                <TableHeader>
                  <TableRow className="h-8 sticky top-0 bg-background">
                    <TableHead className="w-10">
                      <input
                        type="checkbox"
                        checked={selectedEstimateItems.length === estimateItems.length && estimateItems.length > 0}
                        onChange={(e) => {
                          if (e.target.checked) {
                            setSelectedEstimateItems(estimateItems.map(i => i.id));
                          } else {
                            setSelectedEstimateItems([]);
                          }
                        }}
                        className="rounded"
                      />
                    </TableHead>
                    <TableHead className="text-xs">Description</TableHead>
                    <TableHead className="text-xs w-24 text-right">Qty</TableHead>
                    <TableHead className="text-xs w-20">Unit</TableHead>
                    <TableHead className="text-xs w-28 text-right">Unit Price</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {estimateItems.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={5} className="text-center py-8 text-muted-foreground">
                        No estimate items available for this project
                      </TableCell>
                    </TableRow>
                  ) : (
                    estimateItems.map((item) => (
                      <TableRow key={item.id} className="h-10">
                        <TableCell>
                          <input
                            type="checkbox"
                            checked={selectedEstimateItems.includes(item.id)}
                            onChange={(e) => {
                              if (e.target.checked) {
                                setSelectedEstimateItems(prev => [...prev, item.id]);
                              } else {
                                setSelectedEstimateItems(prev => prev.filter(id => id !== item.id));
                              }
                            }}
                            className="rounded"
                          />
                        </TableCell>
                        <TableCell className="text-sm">
                          {item.description || item.itemDescription || "Untitled item"}
                        </TableCell>
                        <TableCell className="text-sm text-right">
                          {item.quantity || "-"}
                        </TableCell>
                        <TableCell className="text-sm">{item.unit || "-"}</TableCell>
                        <TableCell className="text-sm text-right">
                          {item.unitPrice ? `$${(item.unitPrice / 100).toFixed(2)}` : "-"}
                        </TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowImportDialog(false)}>Cancel</Button>
            <Button
              onClick={() => importItemsMutation.mutate(selectedEstimateItems)}
              disabled={selectedEstimateItems.length === 0 || importItemsMutation.isPending}
              className="bg-[#bba7db] hover:bg-[#bba7db]/90 text-white"
            >
              {importItemsMutation.isPending ? "Importing..." : `Import ${selectedEstimateItems.length} Items`}
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
