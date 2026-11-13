import { useState, useEffect, useMemo, useRef } from "react";
import { useParams, useLocation } from "wouter";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { pdf } from "@react-pdf/renderer";
import { PurchaseOrderDocument } from "@/components/purchase-orders/pdf/PurchaseOrderDocument";
import { SendPurchaseOrderDialog } from "@/components/purchase-orders/SendPurchaseOrderDialog";
import { DocumentPreviewModal } from "@/components/ui/DocumentPreviewModal";
import { format, formatDistanceToNow } from "date-fns";
import { computePOTotalsCents, hasPricedLine } from "@shared/poTotals";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { useUpload } from "@/hooks/use-upload";
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  DragStartEvent,
  DragEndEvent,
} from "@dnd-kit/core";
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import {
  Save,
  Send,
  Eye,
  FileText,
  Trash2,
  GripVertical,
  X,
  Mail,
  Phone,
  Copy,
  MoreVertical,
  CheckCircle2,
  Link2,
  Calendar as CalendarIcon,
  Download,
  Loader2,
  AlertCircle,
  Package,
  Search,
  Paperclip,
  Clock,
  ArrowUp,
  Building2,
  RefreshCw,
  CreditCard,
  Pencil,
  Lock,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/EmptyState";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogDescription,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Calendar } from "@/components/ui/calendar";
import { RichTextEditor } from "@/components/RichTextEditor";
import { CostCodeSelect } from "@/components/CostCodeSelect";
import { PODocumentFields, PODocumentLines } from "@/components/purchase-orders/PODocumentView";
import { XeroContactLinkModal } from "@/components/invoices/XeroContactLinkModal";
import { SiXero } from "react-icons/si";
import { DocumentHeader } from "@/components/detail/DocumentHeader";
import { DocumentSection, DocumentCard } from "@/components/detail/DocumentSection";
import { MoneySummary } from "@/components/detail/MoneySummary";
import { AddLineRow } from "@/components/detail/AddLineRow";
import { StatusBadge } from "@/components/StatusBadge";
import { ImportProjectScopeDialog } from "@/components/purchase-orders/ImportProjectScopeDialog";
import type {
  PurchaseOrder,
  PurchaseOrderItem,
  InsertPurchaseOrderItem,
  PurchaseOrderAttachment,
  Project,
  Contact,
  CostCode,
} from "@shared/schema";

// Same field label as the variation page.
const labelCls = "h-4 leading-none flex items-center text-table text-muted-foreground/70 uppercase tracking-wide font-medium";

interface RouteParams {
  id?: string;
  poId?: string;
  projectId?: string;
}

// ---------- design tokens ----------
// The app's own colours, so the page follows the theme (and dark mode).
const TOKENS = {
  purple: "hsl(var(--primary))",
  green: "hsl(var(--sage))",
  amber: "hsl(var(--amber))",
  coral: "hsl(var(--coral))",
  blue: "hsl(var(--teal))",
  muted: "hsl(var(--muted-foreground))",
  pageBg: "hsl(var(--muted) / 0.4)",
  cardBg: "hsl(var(--card))",
  border: "hsl(var(--border))",
  ghost: "hsl(var(--muted) / 0.5)",
  darkGreen: "hsl(var(--sage))",
};

// Accepted only shows for POs a trade can accept (not site or sub POs).
const stepsFor = (withAccepted: boolean) =>
  withAccepted ? ["Draft", "Sent", "Accepted", "Invoiced", "Paid"] : ["Draft", "Sent", "Invoiced", "Paid"];
const STEP_KEYS: Record<string, string> = {
  draft: "Draft",
  sent: "Sent",
  accepted: "Accepted",
  invoiced: "Invoiced",
  partially_paid: "Invoiced",
  paid: "Paid",
};

const htmlToText = (html: string) =>
  new DOMParser().parseFromString(html || "", "text/html").body.textContent || "";
const plainText = (s: string) => s.replace(/\s+/g, " ").trim();

function formatCurrency(cents: number): string {
  return new Intl.NumberFormat("en-AU", {
    style: "currency",
    currency: "AUD",
    minimumFractionDigits: 2,
  }).format(cents / 100);
}

function parseCurrency(value: string): number {
  const clean = value.replace(/[^0-9.-]/g, "");
  return Math.round(parseFloat(clean || "0") * 100);
}

/**
 * Numeric cell that keeps the typed characters until the field is left.
 *
 * These cells used to render a formatted value straight out of state — the
 * unit price was `value={(cents / 100).toFixed(2)}` — so every keystroke
 * rewrote the field and threw the caret to the end. Typing "65" gave "6.00",
 * then "6.005", which rounded to 601 cents and showed "6.01": the number
 * could never be entered. Holding a draft until blur also turns one PATCH per
 * keystroke into one per edit.
 *
 * Enter commits, Escape reverts.
 */
function DraftNumberInput({
  value,
  onCommit,
  disabled,
  className,
  placeholder,
  testId,
}: {
  value: string;
  onCommit: (raw: string) => void;
  disabled?: boolean;
  className?: string;
  placeholder?: string;
  testId?: string;
}) {
  const [draft, setDraft] = useState<string | null>(null);
  const cancelled = useRef(false);

  const commit = () => {
    if (cancelled.current) {
      cancelled.current = false;
      setDraft(null);
      return;
    }
    if (draft !== null && draft !== value) onCommit(draft);
    setDraft(null);
  };

  return (
    <Input
      type="text"
      inputMode="decimal"
      value={draft ?? value}
      onChange={(e) => setDraft(e.target.value)}
      onFocus={(e) => {
        setDraft(value);
        e.currentTarget.select();
      }}
      onBlur={commit}
      onKeyDown={(e) => {
        if (e.key === "Enter") {
          e.currentTarget.blur();
        } else if (e.key === "Escape") {
          cancelled.current = true;
          e.currentTarget.blur();
        }
      }}
      placeholder={placeholder}
      className={className}
      disabled={disabled}
      data-testid={testId}
    />
  );
}

function getInitials(name: string): string {
  if (!name) return "?";
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((n) => n[0]?.toUpperCase() || "")
    .join("");
}

// ---------- Status stepper ----------
interface StatusStepperProps {
  status: string;
  withAccepted: boolean;
}
function StatusStepper({ status, withAccepted }: StatusStepperProps) {
  if (status === "cancelled") {
    return (
      <Badge
        className="text-white"
        style={{ backgroundColor: TOKENS.coral }}
        data-testid="badge-status-cancelled"
      >
        CANCELLED
      </Badge>
    );
  }
  const steps = stepsFor(withAccepted || status === "accepted");
  const idx = Math.max(0, steps.indexOf(STEP_KEYS[status] ?? "Draft"));
  return (
    <div className="flex items-center gap-2" data-testid="status-stepper">
      {steps.map((label, i) => {
        const isActive = i === idx;
        const isPast = i < idx;
        const dotColor = isActive
          ? TOKENS.amber
          : isPast
          ? TOKENS.purple
          : TOKENS.border;
        const labelColor = isActive || isPast ? "hsl(var(--foreground))" : TOKENS.muted;
        return (
          <div key={label} className="flex items-center gap-2">
            <div className="flex items-center gap-1.5">
              <span
                className="inline-block rounded-full"
                style={{
                  width: 8,
                  height: 8,
                  backgroundColor: dotColor,
                }}
                data-testid={`step-dot-${label.toLowerCase()}`}
              />
              <span
                className="text-xs font-medium"
                style={{ color: labelColor }}
              >
                {label}
              </span>
            </div>
            {i < steps.length - 1 && (
              <span
                className="inline-block"
                style={{
                  width: 24,
                  height: 2,
                  backgroundColor: i < idx ? TOKENS.purple : TOKENS.border,
                }}
              />
            )}
          </div>
        );
      })}
    </div>
  );
}

// ---------- Sortable line-item row ----------
interface SortableItemRowProps {
  item: PurchaseOrderItem;
  index: number;
  onUpdate: (id: string, updates: Partial<PurchaseOrderItem>) => void;
  onDelete: (id: string) => void;
  costCodes: CostCode[];
  disabled?: boolean;
}
function SortableItemRow({
  item,
  index,
  onUpdate,
  onDelete,
  costCodes,
  disabled,
}: SortableItemRowProps) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: item.id, disabled });

  const style: React.CSSProperties = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
    zIndex: isDragging ? 1000 : "auto",
  };

  const quantity = parseFloat(item.quantity || "1");
  const unitPrice = item.unitPrice || 0;
  const lineTotal = Math.round(quantity * unitPrice);

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={`grid grid-cols-[40px_1fr_80px_80px_100px_100px_80px_120px_40px] gap-2 items-center px-3 py-2 group transition-colors ${
        isDragging ? "shadow-lg" : ""
      }`}
      data-testid={`po-item-row-${item.id}`}
      onMouseEnter={(e) => {
        (e.currentTarget as HTMLDivElement).style.backgroundColor =
          TOKENS.pageBg;
      }}
      onMouseLeave={(e) => {
        (e.currentTarget as HTMLDivElement).style.backgroundColor =
          isDragging ? TOKENS.ghost : "transparent";
      }}
    >
      <div className="flex items-center justify-center">
        <button
          {...attributes}
          {...listeners}
          className="p-1 opacity-0 group-hover:opacity-100 cursor-grab active:cursor-grabbing transition-opacity"
          disabled={disabled}
          data-testid={`po-item-drag-${item.id}`}
        >
          <GripVertical className="w-4 h-4 text-muted-foreground" />
        </button>
      </div>

      <Input
        value={item.description}
        onChange={(e) => onUpdate(item.id, { description: e.target.value })}
        placeholder="Item description"
        className="h-8 text-sm border-0 bg-transparent hover:bg-muted/50 focus:bg-card focus:border focus:border-border focus-visible:ring-0 rounded px-2"
        disabled={disabled}
        data-testid={`po-item-description-${item.id}`}
      />

      <DraftNumberInput
        value={item.quantity ?? ""}
        onCommit={(raw) => {
          const qty = parseFloat(raw.replace(/[^0-9.-]/g, "")) || 0;
          onUpdate(item.id, {
            quantity: String(qty),
            total: Math.round(qty * unitPrice),
          });
        }}
        placeholder="1"
        className="h-8 text-sm text-right border-0 bg-transparent hover:bg-muted/50 focus:bg-card focus:border focus:border-border focus-visible:ring-0 rounded px-2"
        disabled={disabled}
        testId={`po-item-qty-${item.id}`}
      />

      <Input
        value={item.unit || ""}
        onChange={(e) => onUpdate(item.id, { unit: e.target.value })}
        placeholder="each"
        className="h-8 text-sm border-0 bg-transparent hover:bg-muted/50 focus:bg-card focus:border focus:border-border focus-visible:ring-0 rounded px-2"
        disabled={disabled}
        data-testid={`po-item-unit-${item.id}`}
      />

      <DraftNumberInput
        value={(unitPrice / 100).toFixed(2)}
        onCommit={(raw) => {
          const price = parseCurrency(raw);
          onUpdate(item.id, {
            unitPrice: price,
            total: Math.round(quantity * price),
          });
        }}
        placeholder="0.00"
        className="h-8 text-sm text-right border-0 bg-transparent hover:bg-muted/50 focus:bg-card focus:border focus:border-border focus-visible:ring-0 rounded px-2"
        disabled={disabled}
        testId={`po-item-price-${item.id}`}
      />

      <div
        className="text-sm text-right font-semibold text-foreground"
        data-testid={`po-item-total-${item.id}`}
      >
        {formatCurrency(lineTotal)}
      </div>

      <div className="flex items-center justify-center">
        <Switch
          checked={item.isGstFree}
          onCheckedChange={(checked) =>
            onUpdate(item.id, { isGstFree: checked })
          }
          disabled={disabled}
          data-testid={`po-item-gstfree-${item.id}`}
        />
      </div>

      <div className="w-full">
        <CostCodeSelect
          value={item.costCodeId || ""}
          onValueChange={(value) =>
            onUpdate(item.id, { costCodeId: value || null })
          }
          placeholder="Cost code"
          className="h-8 text-xs"
          disabled={disabled}
          data-testid={`po-item-costcode-${item.id}`}
        />
      </div>

      <button
        onClick={() => onDelete(item.id)}
        className="p-1 opacity-0 group-hover:opacity-100 text-destructive hover:bg-destructive/10 rounded transition-opacity"
        disabled={disabled}
        data-testid={`po-item-delete-${item.id}`}
      >
        <Trash2 className="w-4 h-4" />
      </button>
    </div>
  );
}

// ---------- Change-supplier dialog ----------
type SupplierUser = {
  id: string;
  displayName?: string;
  firstName?: string | null;
  lastName?: string | null;
  email?: string | null;
  phone?: string | null;
  isSubcontractor?: boolean;
  userCategory?: string;
};
type SupplierPick =
  | { kind: "contact"; id: string }
  | { kind: "user"; id: string };

interface ChangeSupplierDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  contacts: Contact[];
  users: SupplierUser[];
  currentSupplierId: string | null | undefined;
  currentSupplierUserId: string | null | undefined;
  onSelect: (pick: SupplierPick) => void;
}
function ChangeSupplierDialog({
  open,
  onOpenChange,
  contacts,
  users,
  currentSupplierId,
  currentSupplierUserId,
  onSelect,
}: ChangeSupplierDialogProps) {
  const [search, setSearch] = useState("");
  const q = search.toLowerCase();
  const contactSuppliers = useMemo(() => {
    return contacts
      .filter(
        (c) =>
          c.contactType === "supplier" || c.contactType === "subcontractor",
      )
      .filter((c) => (q ? (c.name || "").toLowerCase().includes(q) : true))
      .slice(0, 100);
  }, [contacts, q]);
  const teamSubcontractors = useMemo(() => {
    return users
      .filter((u) => u.isSubcontractor)
      .filter((u) => {
        if (!q) return true;
        const name = (u.displayName || `${u.firstName || ""} ${u.lastName || ""}`).toLowerCase();
        return name.includes(q) || (u.email || "").toLowerCase().includes(q);
      })
      .slice(0, 100);
  }, [users, q]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md" data-testid="dialog-change-supplier">
        <DialogHeader>
          <DialogTitle>Change Supplier</DialogTitle>
          <DialogDescription>
            Pick a supplier or subcontractor for this purchase order.
          </DialogDescription>
        </DialogHeader>
        <div className="relative">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search suppliers..."
            className="pl-8"
            data-testid="input-supplier-search"
            autoFocus
          />
        </div>
        <div className="max-h-72 overflow-auto -mx-2">
          {contactSuppliers.length === 0 && teamSubcontractors.length === 0 ? (
            <p className="text-sm text-muted-foreground py-6 text-center">
              No suppliers found
            </p>
          ) : (
            <>
              {teamSubcontractors.length > 0 && (
                <p className="px-3 pt-1 pb-1 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                  Team subcontractors
                </p>
              )}
              {teamSubcontractors.map((u) => {
                const name =
                  u.displayName ||
                  `${u.firstName || ""} ${u.lastName || ""}`.trim() ||
                  u.email ||
                  "Team member";
                return (
                  <button
                    key={`u-${u.id}`}
                    onClick={() => onSelect({ kind: "user", id: u.id })}
                    className={`w-full text-left px-3 py-2 rounded hover-elevate flex items-center gap-3 ${
                      u.id === currentSupplierUserId ? "bg-muted/50" : ""
                    }`}
                    data-testid={`option-supplier-user-${u.id}`}
                  >
                    <div
                      className="w-8 h-8 rounded-full flex items-center justify-center text-xs font-semibold flex-shrink-0"
                      style={{
                        backgroundColor: "rgba(168,144,212,0.12)",
                        color: TOKENS.purple,
                      }}
                    >
                      {getInitials(name)}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium truncate">{name}</p>
                      {u.email && (
                        <p className="text-xs text-muted-foreground truncate">
                          {u.email}
                        </p>
                      )}
                    </div>
                    <Badge variant="outline" className="text-[10px]">
                      Team
                    </Badge>
                  </button>
                );
              })}
              {contactSuppliers.length > 0 && (
                <p className="px-3 pt-2 pb-1 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                  Contacts
                </p>
              )}
              {contactSuppliers.map((c) => (
                <button
                  key={`c-${c.id}`}
                  onClick={() => onSelect({ kind: "contact", id: c.id })}
                  className={`w-full text-left px-3 py-2 rounded hover-elevate flex items-center gap-3 ${
                    c.id === currentSupplierId ? "bg-muted/50" : ""
                  }`}
                  data-testid={`option-supplier-${c.id}`}
                >
                  <div
                    className="w-8 h-8 rounded-full flex items-center justify-center text-xs font-semibold flex-shrink-0"
                    style={{
                      backgroundColor: "rgba(168,144,212,0.12)",
                      color: TOKENS.purple,
                    }}
                  >
                    {getInitials(c.name || "?")}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium truncate">{c.name}</p>
                    {c.email && (
                      <p className="text-xs text-muted-foreground truncate">
                        {c.email}
                      </p>
                    )}
                  </div>
                  <Badge variant="outline" className="text-[10px] capitalize">
                    {c.contactType}
                  </Badge>
                </button>
              ))}
            </>
          )}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ---------- Import-timesheets dialog ----------
interface ImportTimesheetsDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onImport: (selected: any[]) => void;
  isPending: boolean;
}
function ImportTimesheetsDialog({
  open,
  onOpenChange,
  onImport,
  isPending,
}: ImportTimesheetsDialogProps) {
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

  const { data: timesheets = [], isLoading } = useQuery<any[]>({
    queryKey: ["/api/timesheets/subcontractor/awaiting-po"],
    enabled: open,
  });

  useEffect(() => {
    if (!open) setSelectedIds(new Set());
  }, [open]);

  const toggle = (id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const handleImport = () => {
    const selected = timesheets.filter((t) => selectedIds.has(t.id));
    onImport(selected);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className="sm:max-w-lg"
        data-testid="dialog-import-timesheets"
      >
        <DialogHeader>
          <DialogTitle>Import from Timesheets</DialogTitle>
          <DialogDescription>
            Pick the subcontractor timesheets to add as line items.
          </DialogDescription>
        </DialogHeader>
        <div className="max-h-80 overflow-auto -mx-2">
          {isLoading ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
            </div>
          ) : timesheets.length === 0 ? (
            <EmptyState variant="inline" title="No timesheets awaiting PO." className="py-6" />
          ) : (
            timesheets.map((ts) => (
              <label
                key={ts.id}
                className="flex items-start gap-3 px-3 py-2 rounded hover-elevate cursor-pointer"
                data-testid={`option-timesheet-${ts.id}`}
              >
                <Checkbox
                  checked={selectedIds.has(ts.id)}
                  onCheckedChange={() => toggle(ts.id)}
                  className="mt-0.5"
                />
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium truncate">
                    {ts.date ? format(new Date(ts.date), "dd MMM yyyy") : "—"}
                    {" — "}
                    {ts.duration || "0"} hrs
                  </p>
                  {ts.description && (
                    <p className="text-xs text-muted-foreground truncate">
                      {ts.description}
                    </p>
                  )}
                </div>
              </label>
            ))
          )}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button
            onClick={handleImport}
            disabled={selectedIds.size === 0 || isPending}
            style={{ backgroundColor: TOKENS.purple, borderColor: TOKENS.purple }}
            className="text-white hover:opacity-90"
            data-testid="button-confirm-import-timesheets"
          >
            {isPending && (
              <Loader2 className="w-4 h-4 animate-spin mr-1" />
            )}
            Add {selectedIds.size} item{selectedIds.size === 1 ? "" : "s"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// =====================================================================
// Main page
// =====================================================================
export default function PurchaseOrderDetail() {
  const params = useParams<RouteParams>();
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const rawPoId = params.id || params.poId;
  const projectIdFromUrl = params.projectId;
  const poId = rawPoId;

  // ---------- form state ----------
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [scope, setScope] = useState("");
  const [scopeText, setScopeText] = useState("");
  const [termsAndConditions, setTermsAndConditions] = useState("");
  const [requiredByDate, setRequiredByDate] = useState("");
  const [deliveryReference, setDeliveryReference] = useState("");
  const [deliveryAttention, setDeliveryAttention] = useState("");
  const [deliveryContact, setDeliveryContact] = useState("");
  const [deliveryAddress, setDeliveryAddress] = useState("");
  const [deliveryInstructions, setDeliveryInstructions] = useState("");
  const [items, setItems] = useState<PurchaseOrderItem[]>([]);
  const [activeItemId, setActiveItemId] = useState<string | null>(null);
  const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false);
  const [isSaving, setIsSaving] = useState(false);

  // ---------- dialog state ----------
  const [isImportScopeDialogOpen, setIsImportScopeDialogOpen] = useState(false);
  const [isSendDialogOpen, setIsSendDialogOpen] = useState(false);
  // Editing a SENT PO: Edit unlocks it, Done stamps it amended and offers to
  // resend. `editedWhileUnlocked` catches line edits too, which save as you go.
  const [editUnlocked, setEditUnlocked] = useState(false);
  const [editedWhileUnlocked, setEditedWhileUnlocked] = useState(false);
  const [resendPromptOpen, setResendPromptOpen] = useState(false);
  const [finishingEdit, setFinishingEdit] = useState(false);
  const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false);
  const [isChangeSupplierOpen, setIsChangeSupplierOpen] = useState(false);
  const [isImportTimesheetsOpen, setIsImportTimesheetsOpen] = useState(false);
  const [pdfGenerating, setPdfGenerating] = useState(false);
  const [poPreviewOpen, setPoPreviewOpen] = useState(false);
  const [unmappedSupplierName, setUnmappedSupplierName] = useState("");
  const [unmappedSupplierId, setUnmappedSupplierId] = useState<string | null>(
    null,
  );
  const [unmappedSupplierKind, setUnmappedSupplierKind] = useState<
    "contact" | "user"
  >("contact");
  const [unmappedDialogOpen, setUnmappedDialogOpen] = useState(false);

  // ---------- file upload ----------
  const fileInputRef = useRef<HTMLInputElement>(null);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    }),
  );

  // ---------- queries ----------
  const { data: purchaseOrder, isLoading: poLoading } = useQuery<PurchaseOrder>({
    queryKey: ["/api/purchase-orders", poId],
    enabled: !!poId,
    retry: false,
  });

  const { data: rawPoItems, isLoading: itemsLoading } = useQuery<
    PurchaseOrderItem[]
  >({
    queryKey: ["/api/purchase-orders", poId, "items"],
    enabled: !!poId,
    retry: false,
  });

  const { data: projects = [] } = useQuery<Project[]>({
    queryKey: ["/api/projects"],
  });

  const { data: contacts = [] } = useQuery<Contact[]>({
    queryKey: ["/api/contacts"],
  });

  const { data: costCodes = [] } = useQuery<CostCode[]>({
    queryKey: ["/api/cost-codes"],
  });

  const { data: attachments = [] } = useQuery<PurchaseOrderAttachment[]>({
    queryKey: ["/api/purchase-orders", poId, "attachments"],
    enabled: !!poId,
  });

  // acceptUrl is null for POs a trade doesn't accept (site and sub POs).
  const { data: acceptanceInfo } = useQuery<{
    acceptance: { name: string; email: string | null; acceptedAt: string } | null;
    acceptUrl: string | null;
  }>({
    queryKey: ["/api/purchase-orders", poId, "acceptance"],
    enabled: !!poId,
  });

  const project = useMemo(() => {
    const pid = purchaseOrder?.projectId || projectIdFromUrl;
    return projects.find((p) => p.id === pid);
  }, [purchaseOrder, projectIdFromUrl, projects]);

  const { data: assignableUsers = [] } = useQuery<SupplierUser[]>({
    queryKey: ["/api/users/assignable"],
  });

  const { data: companyInfo } = useQuery<{ id: string; name: string; abn?: string; phone?: string; email?: string; address?: string }>({
    queryKey: ["/api/company"],
  });

  const { data: companySettings } = useQuery<{ brandColor?: string; companyName?: string; documentStyle?: string; logoUrl?: string }>({
    queryKey: ["/api/company-settings"],
  });
  const poLogoUrl = companySettings?.logoUrl
    ? (companySettings.logoUrl.startsWith("http") ? companySettings.logoUrl : `${window.location.origin}${companySettings.logoUrl}`)
    : undefined;
  const poDocStyle = (companySettings?.documentStyle as "style1" | "style2" | undefined) || "style1";

  // Supplier may be a contact (supplierId) OR a team-member user marked as subcontractor (supplierUserId).
  // We normalize both cases into a single shape so the supplier hero & email logic can stay simple.
  const supplier = useMemo(() => {
    const po: any = purchaseOrder;
    if (!po) return null;
    if (po.supplierId) {
      const c = contacts.find((x) => x.id === po.supplierId);
      if (!c) return null;
      return {
        kind: "contact" as const,
        id: c.id,
        name: c.name || "",
        email: c.email || "",
        phone: (c as any).phone || "",
        address: (c as any).address || "",
        abn: (c as any).abn || "",
        paymentTerms: (c as any).paymentTerms || "",
      };
    }
    if (po.supplierUserId) {
      const u = assignableUsers.find((x) => x.id === po.supplierUserId);
      if (!u) return null;
      const name =
        u.displayName ||
        `${u.firstName || ""} ${u.lastName || ""}`.trim() ||
        u.email ||
        "Team member";
      return {
        kind: "user" as const,
        id: u.id,
        name,
        email: u.email || "",
        phone: u.phone || "",
        address: "",
        abn: "",
        paymentTerms: "",
      };
    }
    return null;
  }, [purchaseOrder, contacts, assignableUsers]);

  // ---------- hydrate state ----------
  useEffect(() => {
    if (purchaseOrder) {
      setTitle(purchaseOrder.title || "");
      setDescription(purchaseOrder.description || "");
      setScope(purchaseOrder.scope || "");
      setTermsAndConditions(purchaseOrder.termsAndConditions || "");
      setDeliveryReference(purchaseOrder.deliveryReference || "");
      setDeliveryAttention(purchaseOrder.deliveryAttention || "");
      setDeliveryContact(purchaseOrder.deliveryContact || "");
      setDeliveryAddress(purchaseOrder.deliveryAddress || "");
      setDeliveryInstructions(purchaseOrder.deliveryInstructions || "");
      // A date at or before epoch is a blank that was saved as 1 Jan 1970.
      const savedRequiredBy = purchaseOrder.requiredByDate
        ? new Date(purchaseOrder.requiredByDate)
        : null;
      setRequiredByDate(
        savedRequiredBy && savedRequiredBy.getTime() > 0
          ? savedRequiredBy.toISOString().split("T")[0]
          : "",
      );
    }
  }, [purchaseOrder]);


  useEffect(() => {
    setItems(rawPoItems ?? []);
  }, [rawPoItems]);

  // ---------- mutations ----------
  const gstModeMutation = useMutation({
    mutationFn: async (nextMode: string) => {
      return apiRequest(`/api/purchase-orders/${poId}`, "PATCH", { gstMode: nextMode });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/purchase-orders"] });
    },
    onError: (error: any) => {
      toast({
        title: "Failed to update GST",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const updatePoMutation = useMutation({
    mutationFn: async (data: Partial<PurchaseOrder>) => {
      return apiRequest(`/api/purchase-orders/${poId}`, "PATCH", data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: ["/api/purchase-orders", poId],
      });
      queryClient.invalidateQueries({ queryKey: ["/api/purchase-orders"] });
      // Stays on the page, like the variation page: the button turning to
      // "Saved" is the confirmation.
      setHasUnsavedChanges(false);
      toast({ title: "Purchase order saved" });
    },
    onError: (error: any) => {
      toast({
        title: "Error saving",
        description: error.message || "Failed to save purchase order",
        variant: "destructive",
      });
    },
  });

  const changeSupplierMutation = useMutation({
    mutationFn: async (pick: SupplierPick) => {
      const body =
        pick.kind === "user"
          ? { supplierUserId: pick.id, supplierId: null }
          : { supplierId: pick.id, supplierUserId: null };
      return apiRequest(`/api/purchase-orders/${poId}`, "PATCH", body);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: ["/api/purchase-orders", poId],
      });
      setIsChangeSupplierOpen(false);
      toast({ title: "Supplier updated" });
    },
    onError: (error: any) => {
      toast({
        title: "Failed to change supplier",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const updateItemMutation = useMutation({
    mutationFn: async ({
      itemId,
      data,
    }: {
      itemId: string;
      data: Partial<PurchaseOrderItem>;
    }) => {
      return apiRequest(
        `/api/purchase-orders/${poId}/items/${itemId}`,
        "PATCH",
        data,
      );
    },
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: ["/api/purchase-orders", poId, "items"],
      });
      queryClient.invalidateQueries({ queryKey: ["/api/purchase-orders"] });
    },
  });

  const deleteItemMutation = useMutation({
    mutationFn: async (itemId: string) => {
      return apiRequest(
        `/api/purchase-orders/${poId}/items/${itemId}`,
        "DELETE",
      );
    },
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: ["/api/purchase-orders", poId, "items"],
      });
      queryClient.invalidateQueries({ queryKey: ["/api/purchase-orders"] });
      toast({ title: "Item deleted" });
    },
  });

  const addItemMutation = useMutation({
    mutationFn: async (data: InsertPurchaseOrderItem) => {
      return apiRequest(`/api/purchase-orders/${poId}/items`, "POST", data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: ["/api/purchase-orders", poId, "items"],
      });
      queryClient.invalidateQueries({ queryKey: ["/api/purchase-orders"] });
      toast({ title: "Item added" });
    },
  });

  const bulkItemsMutation = useMutation({
    mutationFn: async (newItems: any[]) => {
      return apiRequest(
        `/api/purchase-orders/${poId}/items/bulk`,
        "POST",
        { items: newItems },
      );
    },
    onSuccess: (data: any) => {
      queryClient.invalidateQueries({
        queryKey: ["/api/purchase-orders", poId, "items"],
      });
      queryClient.invalidateQueries({ queryKey: ["/api/purchase-orders"] });
      const count = Array.isArray(data) ? data.length : 0;
      toast({ title: `${count} item${count === 1 ? "" : "s"} added` });
      setIsImportTimesheetsOpen(false);
    },
    onError: (error: any) => {
      toast({
        title: "Failed to import timesheets",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const reorderItemsMutation = useMutation({
    mutationFn: async (itemIds: string[]) => {
      return apiRequest(
        `/api/purchase-orders/${poId}/items/reorder`,
        "POST",
        { itemIds },
      );
    },
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: ["/api/purchase-orders", poId, "items"],
      });
    },
  });


  const deletePoMutation = useMutation({
    mutationFn: async () => {
      return apiRequest(`/api/purchase-orders/${poId}`, "DELETE");
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/purchase-orders"] });
      toast({ title: "Purchase order deleted" });
      handleGoBack();
    },
    onError: (error: any) => {
      toast({
        title: error?.payload?.error || "Failed to delete",
        description: error?.payload?.message || error.message,
        variant: "destructive",
      });
    },
  });

  const duplicatePoMutation = useMutation({
    mutationFn: async () => {
      return apiRequest(`/api/purchase-orders/${poId}/duplicate`, "POST");
    },
    onSuccess: (newPo: any) => {
      queryClient.invalidateQueries({ queryKey: ["/api/purchase-orders"] });
      toast({ title: "Purchase order duplicated" });
      setLocation(`/purchase-orders/${newPo.id}`);
    },
    onError: (error: any) => {
      toast({
        title: "Failed to duplicate",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const pushToXeroMutation = useMutation({
    mutationFn: async (xeroContactId?: string) => {
      const res = await fetch("/api/xero/push-purchase-order", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          purchaseOrderId: poId,
          ...(xeroContactId ? { xeroContactId } : {}),
        }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        const err: any = new Error(
          body?.message || body?.error || "Failed to push to Xero",
        );
        err.payload = body;
        throw err;
      }
      return body;
    },
    onSuccess: (data: any) => {
      queryClient.invalidateQueries({
        queryKey: ["/api/purchase-orders", poId],
      });
      queryClient.invalidateQueries({ queryKey: ["/api/purchase-orders"] });
      toast({
        title: "Pushed to Xero",
        description: data?.xeroPurchaseOrderNumber
          ? `Created ${data.xeroPurchaseOrderNumber} as DRAFT in Xero.`
          : "Purchase order created in Xero as DRAFT.",
      });
    },
    onError: (err: any) => {
      const payload = err?.payload || {};
      if (payload.error === "UNMAPPED_CONTACT") {
        // The PO supplier may be a contact or a user — choose the right link target.
        const isUserSupplier =
          !!payload.supplierUserId ||
          (!payload.supplierId && supplier?.kind === "user");
        setUnmappedSupplierKind(isUserSupplier ? "user" : "contact");
        setUnmappedSupplierName(
          payload.supplierName || supplier?.name || "Supplier",
        );
        setUnmappedSupplierId(
          isUserSupplier
            ? payload.supplierUserId || supplier?.id || null
            : payload.supplierId || supplier?.id || null,
        );
        setUnmappedDialogOpen(true);
        toast({
          title: "Supplier not linked to Xero",
          description: "Pick the matching Xero contact to complete the push.",
        });
        return;
      }
      const desc =
        Array.isArray(payload.validationErrors) &&
        payload.validationErrors[0]?.message
          ? payload.validationErrors[0].message
          : err?.message || "Failed to push to Xero";
      toast({
        title: "Xero push failed",
        description: desc,
        variant: "destructive",
      });
    },
  });

  const refreshFromXeroMutation = useMutation({
    mutationFn: async () => {
      const res = await fetch(`/api/xero/sync-purchase-order/${poId}`, {
        method: "POST",
        credentials: "include",
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(body?.message || body?.error || "Failed to refresh from Xero");
      }
      return body;
    },
    onSuccess: (data: any) => {
      queryClient.invalidateQueries({ queryKey: ["/api/purchase-orders", poId] });
      queryClient.invalidateQueries({ queryKey: ["/api/purchase-orders"] });
      const xeroLabel = data?.xeroStatus
        ? `${data.xeroStatus.charAt(0)}${data.xeroStatus.slice(1).toLowerCase()}`
        : "unknown";
      toast({
        title: data?.changed ? "Updated from Xero" : "Already in sync",
        description: data?.changed
          ? `Status updated to match Xero (${xeroLabel}).`
          : `Xero status: ${xeroLabel}.`,
      });
    },
    onError: (err: any) => {
      toast({
        title: "Refresh failed",
        description: err?.message || "Could not pull status from Xero",
        variant: "destructive",
      });
    },
  });

  // ── Bills linked to this PO ─────────────────────────────────────────────
  const { data: linkedBills = [] } = useQuery<Array<{
    id: string;
    billNumber: string | null;
    billReference: string | null;
    status: string;
    billDate: string | null;
    dueDate: string | null;
    total: number;
    paidAmount: number;
  }>>({
    queryKey: ["/api/purchase-orders", poId, "bills"],
    enabled: !!poId,
  });

  const unlinkBillMutation = useMutation({
    mutationFn: async (billId: string) => {
      return apiRequest(`/api/bills/${billId}/unlink-po`, "POST");
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/purchase-orders", poId] });
      queryClient.invalidateQueries({ queryKey: ["/api/purchase-orders", poId, "bills"] });
      queryClient.invalidateQueries({ queryKey: ["/api/purchase-orders"] });
      queryClient.invalidateQueries({ queryKey: ["/api/bills"] });
      toast({ title: "Bill unlinked" });
    },
    onError: (err: any) => {
      toast({ title: "Failed to unlink bill", description: err?.message, variant: "destructive" });
    },
  });

  // For when the trade accepts by phone or email instead of the link.
  const markAcceptedMutation = useMutation({
    mutationFn: async () => apiRequest(`/api/purchase-orders/${poId}`, "PATCH", { status: "accepted" }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/purchase-orders"] });
      toast({ title: "Marked as accepted" });
    },
    onError: (error: any) => {
      toast({ title: "Failed to update", description: error?.message, variant: "destructive" });
    },
  });

  const markInvoicedMutation = useMutation({
    mutationFn: async () => {
      return apiRequest(`/api/purchase-orders/${poId}`, "PATCH", {
        status: "invoiced",
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: ["/api/purchase-orders", poId],
      });
      queryClient.invalidateQueries({ queryKey: ["/api/purchase-orders"] });
      toast({ title: "Marked as invoiced", description: "Status updated to Invoiced" });
    },
    onError: (error: any) => {
      toast({
        title: "Failed to update",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const markPaidMutation = useMutation({
    mutationFn: async () => {
      return apiRequest(`/api/purchase-orders/${poId}`, "PATCH", {
        status: "paid",
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: ["/api/purchase-orders", poId],
      });
      queryClient.invalidateQueries({ queryKey: ["/api/purchase-orders"] });
      toast({ title: "Marked as paid", description: "Status updated to Paid" });
    },
    onError: (error: any) => {
      toast({
        title: "Failed to update",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const addAttachmentMutation = useMutation({
    mutationFn: async (data: {
      fileName: string;
      fileUrl: string;
      fileType?: string;
      fileSize?: number;
    }) => {
      return apiRequest(
        `/api/purchase-orders/${poId}/attachments`,
        "POST",
        data,
      );
    },
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: ["/api/purchase-orders", poId, "attachments"],
      });
      toast({ title: "File attached" });
    },
    onError: (error: any) => {
      toast({
        title: "Failed to attach file",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const deleteAttachmentMutation = useMutation({
    mutationFn: async (attachmentId: string) => {
      return apiRequest(
        `/api/purchase-order-attachments/${attachmentId}`,
        "DELETE",
      );
    },
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: ["/api/purchase-orders", poId, "attachments"],
      });
      toast({ title: "Attachment removed" });
    },
  });

  const { uploadFile, isUploading } = useUpload({
    onError: (err) => {
      toast({
        title: "Upload failed",
        description: err.message,
        variant: "destructive",
      });
    },
  });

  // ---------- handlers ----------
  const handleSave = async () => {
    if (!poId) return;
    setIsSaving(true);
    try {
      await updatePoMutation.mutateAsync({
        title,
        description,
        scope,
        termsAndConditions,
        deliveryReference,
        deliveryAttention,
        deliveryContact,
        deliveryAddress,
        deliveryInstructions,
        requiredByDate: requiredByDate ? new Date(requiredByDate) : null,
      });
    } finally {
      setIsSaving(false);
    }
  };

  const handleItemUpdate = (
    itemId: string,
    updates: Partial<PurchaseOrderItem>,
  ) => {
    if (!poId) return;
    if (editUnlocked) setEditedWhileUnlocked(true);
    setItems((prev) =>
      prev.map((item) => (item.id === itemId ? { ...item, ...updates } : item)),
    );
    updateItemMutation.mutate({ itemId, data: updates });
  };

  const handleItemDelete = (itemId: string) => {
    if (!poId) return;
    if (editUnlocked) setEditedWhileUnlocked(true);
    setItems((prev) => prev.filter((item) => item.id !== itemId));
    deleteItemMutation.mutate(itemId);
  };

  const handleAddItem = () => {
    if (!poId) return;
    if (editUnlocked) setEditedWhileUnlocked(true);
    addItemMutation.mutate({
      purchaseOrderId: poId,
      description: "",
      quantity: "1",
      unit: "each",
      unitPrice: 0,
      total: 0,
      gstAmount: 0,
      isGstFree: false,
      displayOrder: items.length,
    });
  };

  const handleDragStart = (event: DragStartEvent) => {
    setActiveItemId(String(event.active.id));
  };

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    setActiveItemId(null);
    if (!poId || !over || active.id === over.id) return;
    const oldIndex = items.findIndex((item) => item.id === active.id);
    const newIndex = items.findIndex((item) => item.id === over.id);
    if (oldIndex === -1 || newIndex === -1) return;
    const newItems = arrayMove(items, oldIndex, newIndex);
    setItems(newItems);
    reorderItemsMutation.mutate(newItems.map((item) => item.id));
  };

  const handleImportTimesheets = (selected: any[]) => {
    if (!poId || selected.length === 0) return;
    const baseOrder = items.length;
    const newItems = selected.map((ts, i) => {
      const hourlyRate = parseFloat(ts.hourlyRate || "0");
      const qty = parseFloat(ts.duration || "0");
      const unitPriceCents = Math.round(hourlyRate * 100);
      const totalCents = Math.round(qty * unitPriceCents);
      const dateStr = ts.date
        ? format(new Date(ts.date), "dd MMM")
        : "Timesheet";
      return {
        description: `${dateStr} — ${ts.description || "Timesheet"}`,
        quantity: ts.duration || "0",
        unit: "hours",
        unitPrice: unitPriceCents,
        total: totalCents,
        isGstFree: false,
        gstAmount: 0,
        sourceTimesheetId: ts.id,
        displayOrder: baseOrder + i,
      };
    });
    bulkItemsMutation.mutate(newItems);
  };

  const handleFileSelect = async (
    e: React.ChangeEvent<HTMLInputElement>,
  ) => {
    const files = Array.from(e.target.files || []);
    e.target.value = ""; // allow re-selecting the same file
    await uploadFiles(files);
  };

  const handleFileDrop = async (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    const files = Array.from(e.dataTransfer.files);
    await uploadFiles(files);
  };

  const uploadFiles = async (files: File[]) => {
    for (const file of files) {
      try {
        const result = await uploadFile(file);
        if (!result) continue;
        await addAttachmentMutation.mutateAsync({
          fileName: file.name,
          fileUrl: result.objectPath,
          fileType: file.type || "application/octet-stream",
          fileSize: file.size,
        });
      } catch {
        // toast handled in onError
      }
    }
  };

  // ---------- derived ----------
  const gstMode = purchaseOrder?.gstMode ?? "inclusive";
  const hasLineValue = hasPricedLine(items);
  const { subtotal, gstAmount, total } = useMemo(
    () => (hasLineValue
      ? computePOTotalsCents(items, gstMode)
      // Site and RFQ POs have no priced lines, so the header holds the amount.
      : {
          subtotal: purchaseOrder?.subtotal ?? 0,
          gstAmount: purchaseOrder?.gstAmount ?? 0,
          total: purchaseOrder?.total ?? 0,
        }),
    [items, gstMode, hasLineValue, purchaseOrder],
  );

  const totalHours = useMemo(() => {
    return items
      .filter((i) => (i.unit || "").toLowerCase() === "hours")
      .reduce((s, i) => s + parseFloat(i.quantity || "0"), 0);
  }, [items]);

  const activityItems = useMemo(() => {
    if (!purchaseOrder) return [] as Array<{ label: string; time: any; color: string }>;
    const list: Array<{ label: string; time: any; color: string }> = [];
    if (purchaseOrder.createdAt) {
      list.push({
        label: `${purchaseOrder.poNumber} created`,
        time: purchaseOrder.createdAt,
        color: TOKENS.purple,
      });
    }
    if ((purchaseOrder as any).sentAt) {
      list.push({
        label: "Sent to supplier",
        time: (purchaseOrder as any).sentAt,
        color: TOKENS.blue,
      });
    }
    if ((purchaseOrder as any).amendedAt) {
      const n = (purchaseOrder as any).amendmentCount ?? 1;
      list.push({
        label: n > 1 ? `Amended after sending (${n} times)` : "Amended after sending",
        time: (purchaseOrder as any).amendedAt,
        color: TOKENS.amber,
      });
    }
    if ((purchaseOrder as any).approvedAt) {
      list.push({
        label: "Acknowledged by supplier",
        time: (purchaseOrder as any).approvedAt,
        color: TOKENS.green,
      });
    }
    return list.reverse();
  }, [purchaseOrder]);

  const handleGoBack = () => {
    if (projectIdFromUrl) {
      setLocation(`/projects/${projectIdFromUrl}/purchase-orders`);
    } else {
      setLocation("/purchase-orders");
    }
  };

  // Adds the picked project scope items after whatever the PO already says.
  const handleImportProjectScope = (html: string, count: number) => {
    const current = scope && htmlToText(scope).trim() ? scope : "";
    setScope(current + html);
    setHasUnsavedChanges(true);
    setIsImportScopeDialogOpen(false);
    toast({ title: `Added ${count} scope item${count === 1 ? "" : "s"} from the project` });
  };

  const handleDownloadPdf = async () => {
    if (!purchaseOrder) return;
    setPdfGenerating(true);
    try {
      const blob = await pdf(
        <PurchaseOrderDocument
          purchaseOrder={purchaseOrder as any}
          items={items as any}
          company={companyInfo}
          supplier={supplier}
          project={project as any}
          brandColor={companySettings?.brandColor || "#6d28d9"}
          documentStyle={poDocStyle}
          logoUrl={poLogoUrl}
        />
      ).toBlob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `PO-${(purchaseOrder as any).poNumber || "export"}.pdf`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch {
      toast({ title: "PDF generation failed", variant: "destructive" });
    } finally {
      setPdfGenerating(false);
    }
  };

  // Billed (status, or a bill matched to it) = content frozen; the server
  // refuses edits then too (PO_LOCKED).
  const PO_BILLED_STATUSES = ["billed", "invoiced", "partially_paid", "paid", "completed", "cancelled"];
  const billedLock = !!purchaseOrder && (PO_BILLED_STATUSES.includes(purchaseOrder.status as string) || linkedBills.length > 0);
  const isLocked = purchaseOrder?.status !== "draft" && !editUnlocked;
  const canEditSent = !!purchaseOrder && purchaseOrder.status !== "draft" && !billedLock;

  const finishEditing = async () => {
    if (!poId) return;
    setFinishingEdit(true);
    try {
      if (hasUnsavedChanges) await handleSave();
      const changed = editedWhileUnlocked || hasUnsavedChanges;
      if (changed) {
        await apiRequest(`/api/purchase-orders/${poId}/amended`, "POST");
        queryClient.invalidateQueries({ queryKey: ["/api/purchase-orders", poId] });
      }
      setEditUnlocked(false);
      setEditedWhileUnlocked(false);
      if (changed) setResendPromptOpen(true);
    } catch {
      // handleSave's mutation has already toasted why.
    } finally {
      setFinishingEdit(false);
    }
  };

  // ---------- early returns ----------
  if (poLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="w-8 h-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!purchaseOrder) {
    return (
      <div className="flex flex-col items-center justify-center h-64 gap-4">
        <AlertCircle className="w-12 h-12 text-muted-foreground" />
        <p className="text-muted-foreground">Purchase order not found</p>
        <Button variant="outline" onClick={handleGoBack}>
          Go Back
        </Button>
      </div>
    );
  }

  // ---------- render ----------
  const isTimesheetPO = items.some((i) => !!(i as any).sourceTimesheetId);
  const headerStrip = [
    { label: "Supplier", value: supplier?.name || "—" },
    {
      label: "Required by",
      value: requiredByDate ? format(new Date(requiredByDate), "d MMM yyyy") : "—",
    },
    { label: "Subtotal ex GST", value: formatCurrency(subtotal) },
    { label: "GST (10%)", value: formatCurrency(gstAmount) },
  ];
  const btn = "h-7 px-2.5 text-xs border rounded-md flex items-center gap-1 whitespace-nowrap flex-shrink-0";
  const btnPrimary = `${btn} bg-primary text-white border-primary/20 hover:bg-primary/90 active-elevate-2`;
  const btnQuiet = `${btn} bg-card hover-elevate active-elevate-2`;

  return (
    <div className="flex h-full flex-col" data-testid="page-po-detail">
      {/* ── Header ── */}
      <div className="mx-3 mt-3 flex-shrink-0">
        <DocumentHeader
          onBack={handleGoBack}
          title={purchaseOrder.poNumber}
          status={
            <div className="flex items-center gap-1.5 flex-shrink-0">
              <StatusBadge status={purchaseOrder.status} />
              {purchaseOrder.poType === "site" && (
                <Badge variant="outline" className="text-xs">Site PO</Badge>
              )}
              {isTimesheetPO && (
                <Badge variant="outline" className="text-xs">Sub PO</Badge>
              )}
              {(purchaseOrder as any).xeroPurchaseOrderId && (
                <Badge variant="outline" className="text-xs gap-1" data-testid="badge-in-xero">
                  <SiXero className="w-3 h-3" />
                  In Xero
                </Badge>
              )}
            </div>
          }
          context={project?.name}
          strip={headerStrip}
          headline={{ label: "Total inc GST", value: formatCurrency(total) }}
          data-testid="header-po"
          actions={
            <>
              <button
                type="button"
                onClick={() => setPoPreviewOpen(true)}
                className={btnQuiet}
                data-testid="button-preview-po"
              >
                <Eye className="w-3 h-3" />
                <span>Preview</span>
              </button>
              {/* The next step is the one button that stands out. */}
              {purchaseOrder.status === "draft" && (
                <button
                  type="button"
                  onClick={() => setIsSendDialogOpen(true)}
                  className={btnQuiet}
                  data-testid="button-send-po"
                >
                  <Send className="w-3 h-3" />
                  <span>Send to Supplier</span>
                </button>
              )}
              {(purchaseOrder.status === "sent" || purchaseOrder.status === "accepted") && (
                <button
                  type="button"
                  onClick={() => markInvoicedMutation.mutate()}
                  disabled={markInvoicedMutation.isPending}
                  className={btnQuiet}
                  data-testid="button-mark-invoiced"
                >
                  {markInvoicedMutation.isPending ? <Loader2 className="w-3 h-3 animate-spin" /> : <Package className="w-3 h-3" />}
                  <span>Mark Invoiced</span>
                </button>
              )}
              {(purchaseOrder.status === "invoiced" || purchaseOrder.status === "partially_paid") && (
                <button
                  type="button"
                  onClick={() => markPaidMutation.mutate()}
                  disabled={markPaidMutation.isPending}
                  className={btnQuiet}
                  data-testid="button-mark-paid"
                >
                  {markPaidMutation.isPending ? <Loader2 className="w-3 h-3 animate-spin" /> : <CreditCard className="w-3 h-3" />}
                  <span>Mark Paid</span>
                </button>
              )}
            </>
          }
          primaryAction={
            <div className="flex items-center gap-1.5 flex-shrink-0">
              {/* A sent PO opens read-only, like an approved invoice. */}
              {purchaseOrder.status !== "draft" && !editUnlocked && canEditSent && (
                <button
                  type="button"
                  onClick={() => { setEditUnlocked(true); setEditedWhileUnlocked(false); }}
                  className={btnPrimary}
                  data-testid="button-edit-po"
                >
                  <Pencil className="w-3 h-3" />
                  <span>Edit</span>
                </button>
              )}
              {purchaseOrder.status !== "draft" && billedLock && (
                <span
                  className={`${btn} border-border text-muted-foreground bg-card cursor-default`}
                  title="A bill is matched to this PO (or it's billed/paid), so it can't be changed. Cancel it and raise a new one if it's wrong."
                  data-testid="text-po-billed-locked"
                >
                  <Lock className="w-3 h-3" />
                  <span>Billed — locked</span>
                </span>
              )}
              {editUnlocked && (
                <button
                  type="button"
                  onClick={finishEditing}
                  disabled={finishingEdit || isSaving}
                  className={btnPrimary}
                  data-testid="button-done-editing-po"
                >
                  {finishingEdit ? <Loader2 className="w-3 h-3 animate-spin" /> : <CheckCircle2 className="w-3 h-3" />}
                  <span>{hasUnsavedChanges ? "Save & finish" : "Done editing"}</span>
                </button>
              )}
              {/* Filled only when there is something to save. */}
              {!isLocked && !editUnlocked && (
                <button
                  type="button"
                  onClick={handleSave}
                  disabled={isSaving || !hasUnsavedChanges}
                  className={hasUnsavedChanges ? btnPrimary : `${btn} border-border text-muted-foreground bg-card cursor-default`}
                  data-testid="button-save-po"
                >
                  {isSaving ? <Loader2 className="w-3 h-3 animate-spin" /> : <Save className="w-3 h-3" />}
                  <span>{hasUnsavedChanges ? "Save Changes" : "Saved"}</span>
                </button>
              )}
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <button
                    type="button"
                    className="h-7 w-7 border rounded-md hover-elevate active-elevate-2 flex items-center justify-center flex-shrink-0"
                    aria-label="More actions"
                    data-testid="button-po-actions"
                  >
                    <MoreVertical className="w-3.5 h-3.5 text-muted-foreground" />
                  </button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-52">
                  <DropdownMenuItem onClick={handleDownloadPdf} disabled={pdfGenerating} data-testid="action-print-po">
                    {pdfGenerating ? <Loader2 className="w-3.5 h-3.5 mr-2 animate-spin" /> : <Download className="w-3.5 h-3.5 mr-2" />}
                    Download PDF
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={() => setIsSendDialogOpen(true)} data-testid="action-email-po">
                    <Mail className="w-3.5 h-3.5 mr-2" />
                    Email to Supplier
                  </DropdownMenuItem>
                  {acceptanceInfo?.acceptUrl && (purchaseOrder.status === "draft" || purchaseOrder.status === "sent") && (
                    <DropdownMenuItem
                      onClick={() => {
                        navigator.clipboard.writeText(acceptanceInfo.acceptUrl!);
                        toast({ title: "Accept link copied", description: "The trade can open it to accept this PO." });
                      }}
                      data-testid="action-copy-accept-link"
                    >
                      <Link2 className="w-3.5 h-3.5 mr-2" />
                      Copy accept link
                    </DropdownMenuItem>
                  )}
                  <DropdownMenuSeparator />
                  {acceptanceInfo?.acceptUrl && purchaseOrder.status === "sent" && (
                    <DropdownMenuItem onClick={() => markAcceptedMutation.mutate()} data-testid="action-mark-accepted">
                      <CheckCircle2 className="w-3.5 h-3.5 mr-2" />
                      Mark as Accepted
                    </DropdownMenuItem>
                  )}
                  {(purchaseOrder.status === "sent" || purchaseOrder.status === "accepted") && (
                    <DropdownMenuItem onClick={() => markInvoicedMutation.mutate()} data-testid="action-mark-invoiced">
                      <Package className="w-3.5 h-3.5 mr-2" />
                      Mark as Invoiced
                    </DropdownMenuItem>
                  )}
                  {(purchaseOrder.status === "invoiced" || purchaseOrder.status === "partially_paid") && (
                    <DropdownMenuItem onClick={() => markPaidMutation.mutate()} data-testid="action-mark-paid">
                      <CreditCard className="w-3.5 h-3.5 mr-2" />
                      Mark as Paid
                    </DropdownMenuItem>
                  )}
                  <DropdownMenuItem onClick={() => duplicatePoMutation.mutate()} data-testid="action-duplicate-po">
                    <Copy className="w-3.5 h-3.5 mr-2" />
                    Duplicate
                  </DropdownMenuItem>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem
                    onClick={() => pushToXeroMutation.mutate(undefined)}
                    disabled={pushToXeroMutation.isPending}
                    data-testid="action-push-po-to-xero"
                  >
                    {pushToXeroMutation.isPending ? <Loader2 className="w-3.5 h-3.5 mr-2 animate-spin" /> : <SiXero className="w-3.5 h-3.5 mr-2" />}
                    {(purchaseOrder as any).xeroPurchaseOrderId ? "Re-push to Xero" : "Push to Xero (Draft)"}
                  </DropdownMenuItem>
                  {(purchaseOrder as any).xeroPurchaseOrderId && (
                    <DropdownMenuItem
                      onClick={() => refreshFromXeroMutation.mutate()}
                      disabled={refreshFromXeroMutation.isPending}
                      data-testid="action-refresh-po-from-xero"
                    >
                      {refreshFromXeroMutation.isPending ? <Loader2 className="w-3.5 h-3.5 mr-2 animate-spin" /> : <RefreshCw className="w-3.5 h-3.5 mr-2" />}
                      Refresh status from Xero
                    </DropdownMenuItem>
                  )}
                  {purchaseOrder.status === "draft" && (
                    <>
                      <DropdownMenuSeparator />
                      <DropdownMenuItem
                        onClick={() => setIsDeleteDialogOpen(true)}
                        className="text-status-danger"
                        data-testid="action-delete-po"
                      >
                        <Trash2 className="w-3.5 h-3.5 mr-2" />
                        Delete
                      </DropdownMenuItem>
                    </>
                  )}
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          }
        />
      </div>

      {/* ── Body ── */}
      <div className="flex-1 overflow-auto">
        <div className="max-w-6xl mx-auto px-3 py-3 space-y-3">
          {/* ── Progress ── */}
          <DocumentCard data-testid="section-progress">
            <DocumentSection
              title="Progress"
              role={purchaseOrder.status === "cancelled" ? "exception" : "supplier"}
              collapsible={false}
              divider={false}
              tint
            >
              <div className="px-3.5 py-3 flex flex-wrap items-center gap-x-6 gap-y-2 border-t border-border/60">
                <StatusStepper status={purchaseOrder.status} withAccepted={!!acceptanceInfo?.acceptUrl} />
                <span className="flex-1" />
                {(purchaseOrder as any).sentAt && (
                  <span className="doc-body-muted" data-testid="text-sent-at">
                    Sent {format(new Date((purchaseOrder as any).sentAt), "d MMM yyyy")}
                    {(purchaseOrder as any).sentToEmail ? ` to ${(purchaseOrder as any).sentToEmail}` : ""}
                  </span>
                )}
                {acceptanceInfo?.acceptance && (
                  <span className="doc-body-muted" data-testid="text-accepted-by">
                    Accepted by <span className="text-foreground font-medium">{acceptanceInfo.acceptance.name}</span>
                    {" · "}
                    {format(new Date(acceptanceInfo.acceptance.acceptedAt), "d MMM yyyy, h:mm a")}
                  </span>
                )}
              </div>
            </DocumentSection>
          </DocumentCard>

          {/* ── Supplier + details ── */}
          <DocumentCard>
            <DocumentSection title="Supplier" role="supplier" collapsible={false} data-testid="section-supplier">
              <div className="px-3.5 py-3">
                {supplier ? (
                  <div className="flex items-start gap-3">
                    <div
                      className="h-10 w-10 rounded-full bg-primary/10 text-primary font-semibold text-sm flex items-center justify-center flex-shrink-0"
                      data-testid="supplier-avatar"
                    >
                      {getInitials(supplier.name || "?")}
                    </div>
                    <div className="flex-1 min-w-0 space-y-1">
                      <div className="flex items-center gap-2 min-w-0">
                        <span className="font-semibold truncate" data-testid="text-supplier-name">{supplier.name}</span>
                        {(supplier as any).abn && (
                          <span className="doc-body-muted">ABN {(supplier as any).abn}</span>
                        )}
                        {(supplier as any).paymentTerms && (
                          <Badge variant="secondary" className="text-[11px]" data-testid="badge-payment-terms">
                            {(supplier as any).paymentTerms}
                          </Badge>
                        )}
                      </div>
                      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm">
                        {supplier.email && (
                          <a href={`mailto:${supplier.email}`} className="inline-flex items-center gap-1.5 text-primary hover:underline" data-testid="link-supplier-email">
                            <Mail className="w-3.5 h-3.5" />
                            {supplier.email}
                          </a>
                        )}
                        {supplier.phone && (
                          <a href={`tel:${supplier.phone}`} className="inline-flex items-center gap-1.5 text-primary hover:underline" data-testid="link-supplier-phone">
                            <Phone className="w-3.5 h-3.5" />
                            {supplier.phone}
                          </a>
                        )}
                      </div>
                    </div>
                    {!isLocked && (
                      <button
                        type="button"
                        onClick={() => setIsChangeSupplierOpen(true)}
                        className="text-xs font-medium text-primary hover:underline flex-shrink-0"
                        data-testid="button-change-supplier"
                      >
                        Change
                      </button>
                    )}
                  </div>
                ) : (
                  <div className="flex items-center gap-3">
                    <Building2 className="w-5 h-5 text-muted-foreground" />
                    <span className="doc-body-muted flex-1">No supplier selected</span>
                    <button
                      type="button"
                      onClick={() => setIsChangeSupplierOpen(true)}
                      disabled={isLocked}
                      className={btnPrimary}
                      data-testid="button-select-supplier"
                    >
                      Select Supplier
                    </button>
                  </div>
                )}
              </div>
            </DocumentSection>

            <DocumentSection title="Details" role="manual" collapsible={false} divider={false} data-testid="section-details">
              {isLocked ? (
                <PODocumentFields
                  fields={[
                    { label: "PO name", value: title, testId: "text-po-title" },
                    { label: "Required by", value: requiredByDate ? format(new Date(requiredByDate), "d MMM yyyy") : null, testId: "text-required-by-date" },
                    { label: "Reference", value: deliveryReference, testId: "text-delivery-reference" },
                    { label: "Description", value: description, wide: true, testId: "text-po-description" },
                    { label: "Attention", value: deliveryAttention, testId: "text-delivery-attention" },
                    { label: "Site contact", value: deliveryContact, testId: "text-delivery-contact" },
                    { label: "GST", value: gstMode === "inclusive" ? "Prices include GST" : gstMode === "gst_free" ? "GST free" : "Prices exclude GST", testId: "text-gst-mode" },
                    { label: "Delivery address", value: deliveryAddress, wide: true, testId: "text-delivery-address" },
                    { label: "Delivery instructions", value: deliveryInstructions, wide: true, testId: "text-delivery-instructions" },
                  ]}
                />
              ) : (
              <div className="p-3.5 space-y-3 border-t border-border/60">
                <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                  <div className="md:col-span-2 space-y-1">
                    <div className={labelCls}>PO name</div>
                    <Input
                      className="doc-input"
                      value={title}
                      onChange={(e) => { setTitle(e.target.value); setHasUnsavedChanges(true); }}
                      placeholder="e.g. Kitchen materials"
                      disabled={isLocked}
                      data-testid="input-po-title"
                    />
                  </div>
                  <div className="space-y-1">
                    <div className={labelCls}>Required by</div>
                    <Popover>
                      <PopoverTrigger asChild>
                        <button
                          type="button"
                          disabled={isLocked}
                          className="doc-input w-full h-9 px-3 border rounded-md flex items-center justify-between gap-2 text-sm text-left bg-card disabled:opacity-60"
                          data-testid="input-required-by-date"
                        >
                          <span className={requiredByDate ? "" : "text-muted-foreground"}>
                            {requiredByDate ? format(new Date(requiredByDate), "d MMM yyyy") : "Pick a date"}
                          </span>
                          <CalendarIcon className="w-3.5 h-3.5 text-muted-foreground" />
                        </button>
                      </PopoverTrigger>
                      <PopoverContent className="w-auto p-0" align="end">
                        <Calendar
                          mode="single"
                          selected={requiredByDate ? new Date(requiredByDate) : undefined}
                          onSelect={(d) => {
                            if (d) {
                              setRequiredByDate(format(d, "yyyy-MM-dd"));
                              setHasUnsavedChanges(true);
                            }
                          }}
                        />
                      </PopoverContent>
                    </Popover>
                  </div>
                </div>
                <div className="space-y-1">
                  <div className={labelCls}>Description</div>
                  <Input
                    className="doc-input"
                    value={description}
                    onChange={(e) => { setDescription(e.target.value); setHasUnsavedChanges(true); }}
                    placeholder="Brief description"
                    disabled={isLocked}
                    data-testid="input-po-description"
                  />
                </div>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                  {[
                    { label: "Reference", value: deliveryReference, set: setDeliveryReference, placeholder: "Your reference", testid: "input-delivery-reference" },
                    { label: "Attention", value: deliveryAttention, set: setDeliveryAttention, placeholder: "Name or department", testid: "input-delivery-attention" },
                    { label: "Site contact", value: deliveryContact, set: setDeliveryContact, placeholder: "Phone / email", testid: "input-delivery-contact" },
                  ].map((row) => (
                    <div key={row.label} className="space-y-1">
                      <div className={labelCls}>{row.label}</div>
                      <Input
                        className="doc-input"
                        value={row.value}
                        onChange={(e) => { row.set(e.target.value); setHasUnsavedChanges(true); }}
                        placeholder={row.placeholder}
                        disabled={isLocked}
                        data-testid={row.testid}
                      />
                    </div>
                  ))}
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  <div className="space-y-1">
                    <div className={labelCls}>Delivery address</div>
                    <Textarea
                      className="doc-input min-h-[60px]"
                      value={deliveryAddress}
                      onChange={(e) => { setDeliveryAddress(e.target.value); setHasUnsavedChanges(true); }}
                      placeholder={project?.location || "Site address for delivery"}
                      rows={2}
                      disabled={isLocked}
                      data-testid="textarea-delivery-address"
                    />
                  </div>
                  <div className="space-y-1">
                    <div className={labelCls}>Delivery instructions</div>
                    <Textarea
                      className="doc-input min-h-[60px]"
                      value={deliveryInstructions}
                      onChange={(e) => { setDeliveryInstructions(e.target.value); setHasUnsavedChanges(true); }}
                      placeholder="Access, times, where to drop"
                      rows={2}
                      disabled={isLocked}
                      data-testid="textarea-delivery-instructions"
                    />
                  </div>
                </div>
              </div>
              )}
            </DocumentSection>
          </DocumentCard>

          {/* ── Line items + totals ── */}
          <DocumentCard>
            <DocumentSection
              title="Line Items"
              role="manual"
              count={items.length}
              summary={formatCurrency(subtotal)}
              collapsible={false}
              data-testid="section-line-items"
              actions={
                <>
                  {!!supplier && !isLocked && (
                    <button
                      type="button"
                      onClick={() => setIsImportTimesheetsOpen(true)}
                      className={btnQuiet}
                      data-testid="button-import-timesheets"
                    >
                      <ArrowUp className="w-3 h-3" />
                      <span>Import timesheets</span>
                    </button>
                  )}
                  {!isLocked && (
                  <Select
                    value={gstMode}
                    onValueChange={(value) => {
                      if (value && value !== gstMode) gstModeMutation.mutate(value);
                    }}
                  >
                    <SelectTrigger className="h-7 w-[170px] text-xs" data-testid="select-gst-mode">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="exclusive">Prices exclude GST</SelectItem>
                      <SelectItem value="inclusive">Prices include GST</SelectItem>
                      <SelectItem value="gst_free">GST free</SelectItem>
                    </SelectContent>
                  </Select>
                  )}
                </>
              }
            >
              <div className="border-t border-border/60">
                {isLocked ? (
                  <PODocumentLines
                    lines={items.map((item) => {
                      const qty = parseFloat(item.quantity || "1");
                      const price = item.unitPrice || 0;
                      const cc = costCodes.find((c) => c.id === item.costCodeId);
                      return {
                        key: String(item.id),
                        description: item.description || "",
                        quantity: qty,
                        unit: item.unit,
                        unitPriceCents: price,
                        totalCents: Math.round(qty * price),
                        gstFree: !!item.isGstFree,
                        costCode: cc ? `${cc.code} ${cc.title}` : null,
                      };
                    })}
                  />
                ) : (
                <>
                <div className="grid grid-cols-[40px_1fr_80px_80px_100px_100px_80px_120px_40px] gap-2 px-3 py-2 bg-muted/40 border-b border-border/60">
                  <div></div>
                  <div className={labelCls}>Description</div>
                  <div className={`${labelCls} justify-end`}>Qty</div>
                  <div className={labelCls}>Unit</div>
                  <div className={`${labelCls} justify-end`}>Price</div>
                  <div className={`${labelCls} justify-end`}>Total</div>
                  <div className={`${labelCls} justify-center`}>GST free</div>
                  <div className={labelCls}>Cost code</div>
                  <div></div>
                </div>

                {itemsLoading ? (
                  <div className="flex items-center justify-center py-8">
                    <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
                  </div>
                ) : (
                  items.length > 0 && (
                    <DndContext
                      sensors={sensors}
                      collisionDetection={closestCenter}
                      onDragStart={handleDragStart}
                      onDragEnd={handleDragEnd}
                    >
                      <SortableContext items={items.map((item) => item.id)} strategy={verticalListSortingStrategy}>
                        {items.map((item, index) => (
                          <SortableItemRow
                            key={item.id}
                            item={item}
                            index={index}
                            onUpdate={handleItemUpdate}
                            onDelete={handleItemDelete}
                            costCodes={costCodes}
                            disabled={isLocked}
                          />
                        ))}
                      </SortableContext>
                    </DndContext>
                  )
                )}

                {!isLocked && (
                  <AddLineRow
                    onClick={handleAddItem}
                    busy={addItemMutation.isPending}
                    data-testid="button-add-item"
                  />
                )}
                </>
                )}

                {totalHours > 0 && (
                  <div className="px-3.5 py-2 border-t border-border/60">
                    <span className="inline-flex items-center gap-1 text-[11px] font-semibold rounded-full px-2.5 py-1 bg-teal/10 text-foreground" data-testid="chip-total-hours">
                      <Clock className="w-3 h-3" />
                      {totalHours.toFixed(1)} hrs total
                    </span>
                  </div>
                )}
              </div>
            </DocumentSection>

            <DocumentSection title="Summary" role="supplier" collapsible={false} divider={false} tint data-testid="section-summary">
              <MoneySummary
                rows={[
                  { label: "Subtotal ex GST", cents: subtotal, testId: "text-subtotal" },
                  { label: "GST (10%)", cents: gstAmount, tone: gstAmount === 0 ? "zero" : "normal", testId: "text-gst" },
                ]}
                total={{ label: "Total inc GST", cents: total }}
                alwaysShowDecimals
              />
            </DocumentSection>
          </DocumentCard>

          {/* ── Everything else ── */}
          <DocumentCard>
            <DocumentSection
              title="Bills"
              role="supplier"
              count={linkedBills.length}
              summary={
                linkedBills.length > 0
                  ? `${formatCurrency(linkedBills.reduce((s, b) => s + b.paidAmount, 0))} of ${formatCurrency(linkedBills.reduce((s, b) => s + b.total, 0))} paid`
                  : undefined
              }
              defaultOpen={linkedBills.length > 0}
              isEmpty={linkedBills.length === 0}
              data-testid="card-attached-bills"
            >
              {linkedBills.length > 0 && (
                <div className="divide-y divide-border/60 border-t border-border/60">
                  {linkedBills.map((b) => {
                    const paidPct = b.total > 0 ? Math.min(100, Math.round((b.paidAmount / b.total) * 100)) : 0;
                    return (
                      <div key={b.id} className="flex items-center gap-3 px-3.5 py-2 hover-elevate" data-testid={`row-attached-bill-${b.id}`}>
                        <button
                          type="button"
                          onClick={() => setLocation(`/bills/${b.id}`)}
                          className="flex-1 min-w-0 text-left flex items-center gap-2"
                          data-testid={`button-open-bill-${b.id}`}
                        >
                          <FileText className="w-3.5 h-3.5 flex-shrink-0 text-muted-foreground" />
                          <span className="text-sm font-medium truncate">{b.billNumber || "—"}</span>
                          {b.billReference && <span className="doc-body-muted truncate">Ref {b.billReference}</span>}
                          <StatusBadge status={b.status} />
                          <span className="flex-1" />
                          <span className="doc-body-muted tabular-nums">
                            {formatCurrency(b.paidAmount)} of {formatCurrency(b.total)} · {paidPct}%
                          </span>
                        </button>
                        <button
                          type="button"
                          onClick={() => unlinkBillMutation.mutate(b.id)}
                          disabled={unlinkBillMutation.isPending}
                          className="h-6 w-6 rounded-md hover-elevate flex items-center justify-center"
                          data-testid={`button-unlink-bill-${b.id}`}
                          title="Unlink bill from PO"
                        >
                          <X className="w-3.5 h-3.5 text-muted-foreground" />
                        </button>
                      </div>
                    );
                  })}
                </div>
              )}
            </DocumentSection>

            <DocumentSection
              title="Scope of Work"
              role="client"
              defaultOpen={!!scopeText?.trim() || !isLocked}
              isEmpty={!scopeText?.trim() && isLocked}
              data-testid="section-scope"
              actions={
                !isLocked ? (
                  <button
                    type="button"
                    onClick={() => setIsImportScopeDialogOpen(true)}
                    className={btnQuiet}
                    data-testid="button-import-scope"
                  >
                    <Download className="w-3 h-3" />
                    <span>Add from project scope</span>
                  </button>
                ) : undefined
              }
            >
              <div className="p-3.5 border-t border-border/60">
                <RichTextEditor
                  content={scope}
                  onChange={(html, text) => {
                    setScope(html);
                    setScopeText(text);
                    // The editor re-emits its content after loading, with its
                    // own markup. Only a change to the words counts as an edit.
                    if (plainText(text) !== plainText(htmlToText(scope))) setHasUnsavedChanges(true);
                  }}
                  placeholder="Describe the scope of work for this order..."
                  disabled={isLocked}
                  data-testid="editor-po-scope"
                />
              </div>
            </DocumentSection>

            <DocumentSection
              title="Terms & Conditions"
              role="client"
              summary={termsAndConditions ? undefined : "None set"}
              isEmpty={!termsAndConditions}
              data-testid="section-terms"
            >
              <div className="p-3.5 border-t border-border/60">
                <Textarea
                  className="doc-input"
                  value={termsAndConditions}
                  onChange={(e) => { setTermsAndConditions(e.target.value); setHasUnsavedChanges(true); }}
                  placeholder="Standard terms and conditions for this purchase order..."
                  rows={5}
                  disabled={isLocked}
                  data-testid="textarea-po-terms"
                />
              </div>
            </DocumentSection>

            <DocumentSection
              title="Attachments"
              role="meta"
              count={attachments.length}
              defaultOpen={attachments.length > 0}
              isEmpty={attachments.length === 0 && isLocked}
              data-testid="section-attachments"
            >
              <div className="p-3.5 space-y-2 border-t border-border/60">
                {attachments.map((att) => (
                  <div key={att.id} className="flex items-center gap-2 px-2 py-1.5 rounded bg-muted/40 text-xs" data-testid={`attachment-${att.id}`}>
                    <FileText className="w-3.5 h-3.5 text-muted-foreground flex-shrink-0" />
                    <a href={att.fileUrl} target="_blank" rel="noreferrer" className="flex-1 truncate text-primary hover:underline">
                      {att.fileName}
                    </a>
                    {!isLocked && (
                      <button
                        type="button"
                        onClick={() => deleteAttachmentMutation.mutate(att.id)}
                        className="p-0.5 hover:bg-destructive/10 rounded text-destructive"
                        data-testid={`button-delete-attachment-${att.id}`}
                      >
                        <X className="w-3.5 h-3.5" />
                      </button>
                    )}
                  </div>
                ))}
                {!isLocked && (
                  <div
                    onDragOver={(e) => e.preventDefault()}
                    onDrop={handleFileDrop}
                    onClick={() => fileInputRef.current?.click()}
                    className="border-2 border-dashed border-border rounded-lg p-4 text-center cursor-pointer transition-colors hover:border-primary hover:bg-muted/40"
                    data-testid="dropzone-attachments"
                  >
                    {isUploading ? (
                      <div className="flex items-center justify-center gap-2 text-xs text-muted-foreground">
                        <Loader2 className="w-3.5 h-3.5 animate-spin" />
                        Uploading...
                      </div>
                    ) : (
                      <p className="text-xs text-muted-foreground inline-flex items-center gap-1.5">
                        <Paperclip className="w-3.5 h-3.5" />
                        Drop files or click to attach
                      </p>
                    )}
                    <input ref={fileInputRef} type="file" multiple className="hidden" onChange={handleFileSelect} data-testid="input-attachment-file" />
                  </div>
                )}
              </div>
            </DocumentSection>

            <DocumentSection
              title="Activity"
              role="meta"
              count={activityItems.length}
              divider={false}
              isEmpty={activityItems.length === 0}
              data-testid="section-activity"
            >
              {activityItems.length > 0 && (
                <ul className="p-3.5 space-y-2.5 border-t border-border/60">
                  {activityItems.map((a, i) => (
                    <li key={i} className="flex items-start gap-2.5" data-testid={`activity-item-${i}`}>
                      <span className="inline-block rounded-full mt-1.5 flex-shrink-0 w-2 h-2" style={{ backgroundColor: a.color }} />
                      <div className="flex-1 min-w-0">
                        <p className="text-sm leading-tight">{a.label}</p>
                        <p className="text-[11px] text-muted-foreground mt-0.5">
                          {a.time ? formatDistanceToNow(new Date(a.time), { addSuffix: true }) : ""}
                        </p>
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </DocumentSection>
          </DocumentCard>
        </div>
      </div>

      {/* ---------- Dialogs ---------- */}

      {/* Import Scope */}
      <ImportProjectScopeDialog
        open={isImportScopeDialogOpen}
        onOpenChange={setIsImportScopeDialogOpen}
        projectId={purchaseOrder.projectId}
        poCostCodeIds={Array.from(new Set(items.map((i) => i.costCodeId).filter((c): c is string => !!c)))}
        onImport={handleImportProjectScope}
      />

      {/* Preview PO PDF */}
      {purchaseOrder && (
        <DocumentPreviewModal
          open={poPreviewOpen}
          onOpenChange={setPoPreviewOpen}
          document={
            <PurchaseOrderDocument
              purchaseOrder={purchaseOrder as any}
              items={items as any}
              company={companyInfo}
              supplier={supplier}
              project={project as any}
              brandColor={companySettings?.brandColor || "#6d28d9"}
              documentStyle={poDocStyle}
              logoUrl={poLogoUrl}
            />
          }
          filename={`PO-${(purchaseOrder as any).poNumber || "export"}.pdf`}
          onSend={() => { setPoPreviewOpen(false); setIsSendDialogOpen(true); }}
        />
      )}

      {/* Send PO */}
      <SendPurchaseOrderDialog
        open={isSendDialogOpen}
        onOpenChange={setIsSendDialogOpen}
        purchaseOrder={purchaseOrder}
        items={items}
        supplier={supplier}
        company={companyInfo}
        project={project as any}
        brandColor={companySettings?.brandColor || "#6d28d9"}
        documentStyle={poDocStyle}
        logoUrl={poLogoUrl}
      />

      {/* After editing a sent PO: the supplier still has the old one. */}
      <Dialog open={resendPromptOpen} onOpenChange={setResendPromptOpen}>
        <DialogContent data-testid="dialog-resend-po">
          <DialogHeader>
            <DialogTitle>Send the updated PO?</DialogTitle>
            <DialogDescription>
              {supplier?.name ? `${supplier.name} still has` : "The supplier still has"} the version you sent before. Send them this one, marked as amended?
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setResendPromptOpen(false)} data-testid="button-resend-later">
              Not now
            </Button>
            <Button
              onClick={() => { setResendPromptOpen(false); setIsSendDialogOpen(true); }}
              data-testid="button-resend-po"
            >
              <Send className="w-3.5 h-3.5 mr-1.5" />
              Send updated PO
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete confirm */}
      <Dialog open={isDeleteDialogOpen} onOpenChange={setIsDeleteDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete Purchase Order</DialogTitle>
            <DialogDescription>
              Are you sure you want to delete {purchaseOrder?.poNumber}? This
              action cannot be undone.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setIsDeleteDialogOpen(false)}
            >
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={() => deletePoMutation.mutate()}
              disabled={deletePoMutation.isPending}
              data-testid="button-confirm-delete"
            >
              {deletePoMutation.isPending ? (
                <Loader2 className="w-4 h-4 animate-spin mr-1" />
              ) : (
                <Trash2 className="w-4 h-4 mr-1" />
              )}
              Delete
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Change supplier */}
      <ChangeSupplierDialog
        open={isChangeSupplierOpen}
        onOpenChange={setIsChangeSupplierOpen}
        contacts={contacts}
        users={assignableUsers}
        currentSupplierId={purchaseOrder.supplierId}
        currentSupplierUserId={(purchaseOrder as any).supplierUserId}
        onSelect={(pick) => changeSupplierMutation.mutate(pick)}
      />

      {/* Import timesheets */}
      <ImportTimesheetsDialog
        open={isImportTimesheetsOpen}
        onOpenChange={setIsImportTimesheetsOpen}
        onImport={handleImportTimesheets}
        isPending={bulkItemsMutation.isPending}
      />

      {/* Xero contact link */}
      <XeroContactLinkModal
        open={unmappedDialogOpen}
        onClose={() => {
          setUnmappedDialogOpen(false);
          setUnmappedSupplierId(null);
        }}
        clientId={unmappedSupplierId}
        clientName={unmappedSupplierName}
        targetType={unmappedSupplierKind}
        title="Link Supplier to Xero Contact"
        description={
          <>
            <span className="font-medium text-foreground">
              {unmappedSupplierName}
            </span>{" "}
            is not linked to a Xero contact. Pick the matching Xero contact (or
            create a new one) to push this purchase order.
          </>
        }
        successMessage="Supplier linked. Pushing PO to Xero…"
        onLinked={async (xeroContactId) => {
          setUnmappedDialogOpen(false);
          setUnmappedSupplierId(null);
          pushToXeroMutation.mutate(xeroContactId);
        }}
      />
    </div>
  );
}
