import { useParams, useLocation } from "wouter";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useState, useEffect, useRef, useMemo, useCallback } from "react";
import { pdf } from "@react-pdf/renderer";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/EmptyState";
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
  Loader2,
  Plus,
  Trash2,
  Pencil,
  Paperclip,
  Upload,
  X,
  Clock,
  Bell,
  ExternalLink,
  CheckCircle2,
  AlertCircle,
  ChevronDown,
  ChevronRight,
} from "lucide-react";
import { RFQDocument } from "@/components/rfq/pdf/RFQDocument";
import { SendRFQDialog } from "@/components/rfq/SendRFQDialog";
import { UploadQuoteDialog } from "@/components/rfq/UploadQuoteDialog";
import { QuoteComparisonView } from "@/components/rfq/QuoteComparisonView";
import type { Rfq, RfqItem, RfqQuote, RfqTemplate, CostCode, EstimateItem, Project, User, RfqRecipient, RfqReminderTemplate } from "@shared/schema";
import { format } from "date-fns";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { dollarsToCents } from "@shared/money";
import { useToast } from "@/hooks/use-toast";
import { StatusBadge } from "@/components/StatusBadge";
import { CostCodeSelect } from "@/components/CostCodeSelect";
import { SectionCard, SectionSubHeader } from "@/components/detail/SectionCard";
import { DetailPageHeader } from "@/components/detail/DetailPageHeader";
import { DetailLayout } from "@/components/detail/DetailLayout";
import { RfqRecipientsPanel } from "@/components/rfq/RfqRecipientsPanel";
import { RFQ_STATUS_LABEL } from "@shared/rfqStatus";
import { RfqActivityFeed } from "@/components/rfq/RfqActivityFeed";
import { RfqRemindersDialog } from "@/components/rfq/RfqRemindersDialog";
import { RfqAttachments } from "@/components/rfq/RfqAttachments";
import { reminderDueAt } from "@shared/rfqReminders";

// Radix Select cannot hold an empty string value, so "no selection" needs a
// sentinel rather than "".
const UNASSIGNED = "__unassigned__";

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
  const [showRemindersDialog, setShowRemindersDialog] = useState(false);
  const [showAddItemDialog, setShowAddItemDialog] = useState(false);
  const [editingItem, setEditingItem] = useState<RfqItem | null>(null);
  const [hasChanges, setHasChanges] = useState(false);
  const [descOpen, setDescOpen] = useState(true);
  const [tcCollapsed, setTcCollapsed] = useState(false);
  const [attachCollapsed, setAttachCollapsed] = useState(true);
  const pdfUrlRef = useRef<string | null>(null);

  const [formData, setFormData] = useState({
    title: "",
    description: "",
    scope: "",
    dueDate: null as Date | null,
    deadline: null as Date | null,
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

  const { data: rfq, isLoading: rfqLoading } = useQuery<Rfq>({
    queryKey: ["/api/rfqs", id],
    enabled: !!id,
  });

  const { data: items = [], isLoading: itemsLoading } = useQuery<RfqItem[]>({
    queryKey: ["/api/rfqs", id, "items"],
    enabled: !!id,
  });

  const { data: quotes = [] } = useQuery<RfqQuote[]>({
    queryKey: ["/api/rfqs", id, "quotes"],
    enabled: !!id,
  });

  const { data: rfqTemplates = [] } = useQuery<RfqTemplate[]>({
    queryKey: ["/api/rfq-templates"],
  });

  const { data: companySettings } = useQuery<{
    logo?: string | null;
    companyName?: string | null;
    email?: string | null;
    phone?: string | null;
  }>({
    queryKey: ["/api/company-settings"],
  });

  const { data: costCodes = [] } = useQuery<CostCode[]>({
    queryKey: ["/api/cost-codes"],
  });

  const { data: projects = [] } = useQuery<Project[]>({
    queryKey: ["/api/projects"],
  });

  const { data: teamUsers = [] } = useQuery<User[]>({
    queryKey: ["/api/users"],
  });

  const { data: reminderTemplates = [] } = useQuery<RfqReminderTemplate[]>({
    queryKey: ["/api/rfq-reminder-templates"],
  });

  const { data: recipients = [] } = useQuery<RfqRecipient[]>({
    queryKey: ["/api/rfqs", id, "recipients"],
    enabled: !!id,
  });

  // One line in the sidebar so you know what is coming without opening the
  // modal. Only suppliers still awaiting a response are ever chased.
  const nextReminderLabel = useMemo(() => {
    const awaiting = recipients.filter(
      (r) => !r.isExternal && (r.status === "sent" || r.status === "viewed"),
    );
    if (awaiting.length === 0) return "No suppliers are awaiting a response.";

    const upcoming = reminderTemplates
      .filter((t) => t.enabled)
      .flatMap((t) =>
        awaiting
          .map((r) => reminderDueAt(t, { sentAt: r.sentAt, dueDate: rfq?.dueDate }))
          .filter((d): d is Date => !!d && d > new Date()),
      )
      .sort((a, b) => a.getTime() - b.getTime());

    if (upcoming.length === 0) {
      return `Chasing ${awaiting.length} supplier${awaiting.length === 1 ? "" : "s"} — nothing scheduled.`;
    }
    return `Next: ${format(upcoming[0], "d MMM")} to ${awaiting.length} supplier${awaiting.length === 1 ? "" : "s"}.`;
  }, [recipients, reminderTemplates, rfq?.dueDate]);

  // Owner and project assignment save immediately rather than joining the
  // dirty-form Save flow — they're registry bookkeeping, not document edits,
  // and a half-saved owner is worse than no owner.
  const assignMutation = useMutation({
    mutationFn: async (patch: { ownerId?: string | null; projectId?: string }) =>
      apiRequest(`/api/rfqs/${id}`, "PATCH", patch),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/rfqs", id] });
      queryClient.invalidateQueries({ queryKey: ["/api/rfqs"] });
      toast({ title: "RFQ updated" });
    },
    onError: (error: any) =>
      toast({ title: "Failed to update", description: error.message, variant: "destructive" }),
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
      queryClient.invalidateQueries({ queryKey: ["/api/rfqs", id, "items"] });
      setShowAddItemDialog(false);
      setNewItem({ description: "", quantity: "", unit: "each", unitPrice: "", costCodeId: "", notes: "" });
      toast({ title: "Item added" });
    },
  });

  const importItemsMutation = useMutation({
    mutationFn: async (estimateItemIds: string[]) => {
      const selectedItems = estimateItems.filter(ei => estimateItemIds.includes(ei.id));
      const promises = selectedItems.map((ei, index) =>
        // Field names matter here: this read ei.costCodeId / ei.itemDescription
        // / ei.unit / ei.unitPrice, none of which exist on estimate_items. Every
        // import produced a blank description, unit forced to "each" and no
        // price. The real columns are name / unitType / unitCostExTax, and
        // costCode is a text code (not an id), so it can't populate costCodeId.
        apiRequest("/api/rfq-items", "POST", {
          rfqId: id,
          estimateItemId: ei.id,
          description: ei.name || ei.description || "Untitled item",
          quantity: ei.quantity ?? 0,
          unit: ei.unitType || null,
          // estimate_items prices are dollars ex tax (doublePrecision);
          // rfq_items.unitPrice is cents.
          unitPrice: ei.unitCostExTax ? dollarsToCents(ei.unitCostExTax) : null,
          notes: "",
          displayOrder: items.length + index,
        })
      );
      return Promise.all(promises);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/rfqs", id, "items"] });
      setShowImportDialog(false);
      setSelectedEstimateItems([]);
      toast({ title: `${selectedEstimateItems.length} items imported` });
    },
  });

  // The edit path the page has been missing: editingItem was declared and never
  // used, and PATCH /api/rfq-items/:id had no client caller at all — so you
  // could add and delete a line but never fix a typo in one.
  const updateItemMutation = useMutation({
    mutationFn: async ({ itemId, data }: { itemId: string; data: typeof newItem }) =>
      apiRequest(`/api/rfq-items/${itemId}`, "PATCH", {
        description: data.description,
        quantity: data.quantity === "" ? null : parseFloat(data.quantity),
        unit: data.unit || null,
        unitPrice: data.unitPrice ? Math.round(parseFloat(data.unitPrice) * 100) : null,
        costCodeId: data.costCodeId || null,
        notes: data.notes,
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/rfqs", id, "items"] });
      closeItemDialog();
      toast({ title: "Item updated" });
    },
    onError: (error: any) =>
      toast({ title: "Failed to update item", description: error.message, variant: "destructive" }),
  });

  const openItemDialog = (item?: RfqItem) => {
    if (item) {
      setEditingItem(item);
      setNewItem({
        description: item.description ?? "",
        quantity: item.quantity != null ? String(item.quantity) : "",
        unit: item.unit ?? "each",
        // rfq_items.unitPrice is cents; the form works in dollars.
        unitPrice: item.unitPrice != null ? (item.unitPrice / 100).toFixed(2) : "",
        costCodeId: item.costCodeId ?? "",
        notes: item.notes ?? "",
      });
    } else {
      setEditingItem(null);
      setNewItem({ description: "", quantity: "", unit: "each", unitPrice: "", costCodeId: "", notes: "" });
    }
    setShowAddItemDialog(true);
  };

  const closeItemDialog = () => {
    setShowAddItemDialog(false);
    setEditingItem(null);
    setNewItem({ description: "", quantity: "", unit: "each", unitPrice: "", costCodeId: "", notes: "" });
  };

  const deleteItemMutation = useMutation({
    mutationFn: async (itemId: string) => {
      return await apiRequest(`/api/rfq-items/${itemId}`, "DELETE");
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/rfqs", id, "items"] });
      toast({ title: "Item deleted" });
    },
  });

  // PDF generation, shared by Preview, Download and Send.
  //
  // Was gated on items.length, so an RFQ with a scope but no itemised lines
  // could never produce a PDF at all — and the blob only existed while Preview
  // was open, which is why Download sat disabled and Send refused to attach
  // anything until you had opened the preview first.
  const buildPdf = useCallback(async (): Promise<Blob | null> => {
    if (!rfq) return null;
    setIsGenerating(true);
    try {
      return await pdf(
        <RFQDocument
          rfq={rfq}
          items={items}
          companyLogo={companySettings?.logo ?? undefined}
          companyName={companySettings?.companyName || "Morada"}
          companyEmail={companySettings?.email ?? undefined}
          companyPhone={companySettings?.phone ?? undefined}
          primaryColor="#215E35"
        />
      ).toBlob();
    } catch (error) {
      console.error("Error generating PDF:", error);
      toast({ title: "Could not generate the PDF", variant: "destructive" });
      return null;
    } finally {
      setIsGenerating(false);
    }
  }, [rfq, items, companySettings, toast]);

  // Render for the inline preview only when it is open. Rendering eagerly on
  // every page load would make @react-pdf run for every RFQ anyone opens, which
  // is a lot of work for a panel most visits never expand.
  useEffect(() => {
    if (!rfq || !showPreview) return;
    let isCancelled = false;

    buildPdf().then((blob) => {
      if (isCancelled || !blob) return;
      setPdfBlob(blob);
      if (pdfUrlRef.current) URL.revokeObjectURL(pdfUrlRef.current);
      const url = URL.createObjectURL(blob);
      pdfUrlRef.current = url;
      setPdfUrl(url);
    });

    return () => {
      isCancelled = true;
    };
  }, [buildPdf, rfq, showPreview]);

  // Revoke only when the page goes away — regenerating swaps the URL above, and
  // revoking on every dependency change killed the live preview.
  useEffect(() => {
    return () => {
      if (pdfUrlRef.current) {
        URL.revokeObjectURL(pdfUrlRef.current);
        pdfUrlRef.current = null;
      }
    };
  }, []);

  // Download and Send both build on demand rather than depending on Preview
  // having been opened first — the old flow left Download disabled and Send
  // silently refusing to attach anything until you had.
  const handleDownloadPdf = async () => {
    if (!rfq) return;
    const blob = pdfBlob ?? (await buildPdf());
    if (!blob) return;
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `RFQ-${rfq.rfqNumber}.pdf`;
    link.click();
    // Revoke on a delay; revoking immediately can cancel the download.
    setTimeout(() => URL.revokeObjectURL(url), 10_000);
  };

  const handleSave = () => {
    updateRfqMutation.mutate(formData);
  };

  const handleFieldChange = (field: string, value: any) => {
    setFormData(prev => ({ ...prev, [field]: value }));
    setHasChanges(true);
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
      <DetailPageHeader
        backTo="/rfqs"
        projectId={rfq.projectId}
        title={formData.title}
        onTitleChange={(v) => handleFieldChange("title", v)}
        reference={rfq.rfqNumber}
        badges={
          <>
            <StatusBadge
              status={rfq.status}
              label={RFQ_STATUS_LABEL[rfq.status] ?? rfq.status}
              tone={rfq.status === "confirmed" ? "success" : undefined}
            />
            {rfq.isExternal && (
              <Badge variant="outline" className="text-xs gap-1">
                <ExternalLink className="w-3 h-3" />
                External
              </Badge>
            )}
          </>
        }
        dirty={hasChanges}
        saving={updateRfqMutation.isPending}
        onSave={handleSave}
        actions={
          <>
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
              disabled={isGenerating}
              className="h-7 text-xs"
              data-testid="button-download-pdf"
            >
              <Download className="w-3 h-3 mr-1" />
              PDF
            </Button>
            <Button
              size="sm"
              onClick={() => setShowSendDialog(true)}
              className="h-7 text-xs bg-primary hover:bg-primary/90 text-white"
              data-testid="button-send-rfq"
            >
              <Send className="w-3 h-3 mr-1" />
              Send
            </Button>
          </>
        }
      />

      <DetailLayout
        sidebar={
          <>
      <SectionCard title="Registry" accent="primary">
        <div className="p-3 space-y-3">
          <div className="space-y-1.5">
            <Label className="text-xs text-muted-foreground">Owner</Label>
            <Select
              value={rfq.ownerId ?? UNASSIGNED}
              onValueChange={(value) =>
                assignMutation.mutate({ ownerId: value === UNASSIGNED ? null : value })
              }
            >
              <SelectTrigger className="h-7 text-xs" data-testid="select-rfq-owner">
                <SelectValue placeholder="Unassigned" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={UNASSIGNED}>Unassigned</SelectItem>
                {teamUsers.map((user) => (
                  <SelectItem key={user.id} value={user.id}>
                    {`${user.firstName ?? ""} ${user.lastName ?? ""}`.trim() || user.email}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <p className="text-data text-muted-foreground">Who is chasing this</p>
          </div>

          <div className="space-y-1.5">
            <Label className="text-xs text-muted-foreground">Project</Label>
            {rfq.projectId ? (
              <p className="text-xs" data-testid="text-rfq-project">
                {projects.find((p) => p.id === rfq.projectId)?.name ?? "—"}
              </p>
            ) : (
              // Attach-once: a general enquiry can be pulled into a job when the
              // job becomes real, but an RFQ suppliers have already quoted
              // against is never re-parented.
              <Select
                value={UNASSIGNED}
                onValueChange={(value) => {
                  if (value !== UNASSIGNED) assignMutation.mutate({ projectId: value });
                }}
              >
                <SelectTrigger className="h-7 text-xs" data-testid="select-rfq-project">
                  <SelectValue placeholder="General — no project" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={UNASSIGNED}>General — no project</SelectItem>
                  {projects.map((project) => (
                    <SelectItem key={project.id} value={project.id}>
                      {project.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
          </div>
        </div>
      </SectionCard>

      <SectionCard
        title="Track Only Mode"
        accent="muted"
        actions={
          <Switch
            checked={formData.isExternal}
            onCheckedChange={(checked) => handleFieldChange("isExternal", checked)}
          />
        }
      >
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
              <p className="text-data text-muted-foreground px-3 py-2">
                Track RFQ sent outside Morada
              </p>
            )}
      </SectionCard>

      <SectionCard
        title="Reminders"
        accent="amber"
        actions={
          <Switch
            checked={formData.followUpEnabled}
            onCheckedChange={(checked) => handleFieldChange("followUpEnabled", checked)}
            aria-label="Chase suppliers who haven't responded"
          />
        }
      >
        <div className="p-3 space-y-2">
          {formData.followUpEnabled ? (
            <>
              <p className="text-data text-muted-foreground">
                {nextReminderLabel}
              </p>
              {/* The schedule and wording are company-level — every RFQ chases
                  the same way, so this is a link to the shared settings rather
                  than a per-RFQ copy of them. */}
              <Button
                size="sm"
                variant="outline"
                className="h-6 text-xs w-full"
                onClick={() => setShowRemindersDialog(true)}
                data-testid="button-manage-reminders"
              >
                <Bell className="w-3 h-3 mr-1" />
                Manage reminders
              </Button>
            </>
          ) : (
            <p className="text-data text-muted-foreground">
              Suppliers who don't respond won't be chased.
            </p>
          )}
        </div>
      </SectionCard>

      <SectionCard title="Internal Notes" accent="muted">
            <div className="p-3">
              <p className="text-data text-muted-foreground mb-2">
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
      </SectionCard>

      <SectionCard title="Activity" accent="muted">
        <RfqActivityFeed rfq={rfq} quotes={quotes} />
      </SectionCard>
          </>
        }
      >
        {/* Suppliers — the main event. One row per request, each with its own
            state, replacing the "3 selected" popover that hid them. */}
        <RfqRecipientsPanel rfqId={rfq.id} quotes={quotes} />

        <SectionCard title="RFQ Info" accent="primary">
            {/* Dates */}
            <div className="p-3">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
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

        </SectionCard>

        <SectionCard title="Scope & Items" accent="amber">
            {/* Scope of Work — always visible */}
            <div className="border-b border-border/50">
              <SectionSubHeader title="Scope of Work" />
              <div className="p-3">
                <Textarea
                  value={formData.scope}
                  onChange={(e) => handleFieldChange("scope", e.target.value)}
                  placeholder="Detailed scope including specifications, quantities, delivery requirements..."
                  className="min-h-[80px] text-sm"
                  data-testid="input-scope"
                />
              </div>
            </div>

            {/* Line Items — always visible */}
            <div>
              <div className="h-8 flex items-center justify-between px-3 gap-2 border-b border-border/30 bg-muted/20">
                <div className="flex items-center gap-2">
                  <span className="text-xs text-muted-foreground font-medium">Line Items</span>
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
                    onClick={() => openItemDialog()}
                    className="h-6 text-xs"
                    data-testid="button-add-item"
                  >
                    <Plus className="w-3 h-3 mr-1" />
                    Add
                  </Button>
                </div>
              </div>

            {/* Line Items table */}
            {items.length === 0 ? (
              <EmptyState
                variant="inline"
                title="No line items yet"
                description="Add items or import from the estimate."
                className="py-8"
              />
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
                        <TableCell
                          className="text-sm cursor-pointer"
                          onClick={() => openItemDialog(item)}
                        >
                          {item.description}
                        </TableCell>
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
                          <div className="flex items-center justify-end gap-0.5">
                            <Button
                              size="icon"
                              variant="ghost"
                              className="h-6 w-6"
                              onClick={() => openItemDialog(item)}
                              title="Edit item"
                              data-testid={`button-edit-item-${item.id}`}
                            >
                              <Pencil className="w-3 h-3 text-muted-foreground" />
                            </Button>
                            <Button
                              size="icon"
                              variant="ghost"
                              className="h-6 w-6"
                              onClick={() => deleteItemMutation.mutate(item.id)}
                              title="Delete item"
                              data-testid={`button-delete-item-${item.id}`}
                            >
                              <Trash2 className="w-3 h-3 text-destructive" />
                            </Button>
                          </div>
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
            </div>{/* end Line Items section */}
        </SectionCard>

        <SectionCard
          title="Terms & Conditions"
          accent="primary"
          collapsible
          collapsed={tcCollapsed}
          onCollapsedChange={setTcCollapsed}
          actions={
            <Select
              value={formData.termsTemplateId || "custom"}
              onValueChange={handleTermsTemplateChange}
            >
              <SelectTrigger className="w-[140px] h-6 text-xs">
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
          }
        >
            <div>
              {(
                <div className="p-3">
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

        </SectionCard>

        <SectionCard
          title="Attachments"
          accent="amber"
          count={rfq.attachmentUrls?.length ?? 0}
          collapsible
          collapsed={attachCollapsed}
          onCollapsedChange={setAttachCollapsed}
        >
          <RfqAttachments rfq={rfq} />
        </SectionCard>

        <SectionCard
          title="Quotes Received"
          accent="sage"
          count={quotes.length}
          actions={
            <Button
              size="sm"
              variant="outline"
              onClick={() => setShowUploadQuoteDialog(true)}
              className="h-6 text-xs"
              data-testid="button-upload-quote"
            >
              <Upload className="w-3 h-3 mr-1" />
              Upload Quote
            </Button>
          }
        >
            {quotes.length === 0 ? (
              <EmptyState variant="inline" title="No quotes received yet" className="py-8" />
            ) : (
              <QuoteComparisonView rfqId={rfq.id} quotes={quotes} rfq={rfq} />
            )}
        </SectionCard>

          {showPreview && (
            <SectionCard title="PDF Preview" accent="muted">
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
            </SectionCard>
          )}

        </DetailLayout>

      {/* Add Item Dialog */}
      <Dialog open={showAddItemDialog} onOpenChange={(o) => (o ? setShowAddItemDialog(true) : closeItemDialog())}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>{editingItem ? "Edit Line Item" : "Add Line Item"}</DialogTitle>
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
            <Button variant="outline" onClick={closeItemDialog}>Cancel</Button>
            <Button
              onClick={() =>
                editingItem
                  ? updateItemMutation.mutate({ itemId: editingItem.id, data: newItem })
                  : createItemMutation.mutate(newItem)
              }
              disabled={
                !newItem.description || createItemMutation.isPending || updateItemMutation.isPending
              }
              className="bg-primary hover:bg-primary/90 text-white"
              data-testid="button-save-item"
            >
              {createItemMutation.isPending || updateItemMutation.isPending ? (
                <><Loader2 className="w-4 h-4 mr-2 animate-spin" />Saving...</>
              ) : editingItem ? (
                "Save changes"
              ) : (
                "Add Item"
              )}
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
                          {item.name || item.description || "Untitled item"}
                        </TableCell>
                        <TableCell className="text-sm text-right">
                          {item.quantity || "-"}
                        </TableCell>
                        <TableCell className="text-sm">{item.unitType || "-"}</TableCell>
                        <TableCell className="text-sm text-right">
                          {/* estimate_items prices are dollars, not cents. */}
                          {item.unitCostExTax ? `$${item.unitCostExTax.toFixed(2)}` : "-"}
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
              className="bg-primary hover:bg-primary/90 text-white"
            >
              {importItemsMutation.isPending ? (<><Loader2 className="w-4 h-4 mr-2 animate-spin" />Importing...</>) : `Import ${selectedEstimateItems.length} Items`}
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
          getPdf={buildPdf}
        />
      )}

      <RfqRemindersDialog
        open={showRemindersDialog}
        onOpenChange={setShowRemindersDialog}
        rfq={rfq}
      />

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
