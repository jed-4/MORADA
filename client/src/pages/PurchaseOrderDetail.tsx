import { useState, useEffect, useMemo, useRef } from "react";
import { useParams, useLocation } from "wouter";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { pdf } from "@react-pdf/renderer";
import { PurchaseOrderDocument } from "@/components/purchase-orders/pdf/PurchaseOrderDocument";
import { SendPurchaseOrderDialog } from "@/components/purchase-orders/SendPurchaseOrderDialog";
import { DocumentPreviewModal } from "@/components/ui/DocumentPreviewModal";
import { format, formatDistanceToNow } from "date-fns";
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
  ArrowLeft,
  Plus,
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
  Calendar as CalendarIcon,
  Download,
  ChevronDown,
  ChevronUp,
  MoreHorizontal,
  Loader2,
  AlertCircle,
  Package,
  Search,
  Paperclip,
  Clock,
  ArrowUp,
  Building2,
  RefreshCw,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
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
import { XeroContactLinkModal } from "@/components/invoices/XeroContactLinkModal";
import { SiXero } from "react-icons/si";
import type {
  PurchaseOrder,
  PurchaseOrderItem,
  InsertPurchaseOrderItem,
  PurchaseOrderAttachment,
  Project,
  Contact,
  CostCode,
} from "@shared/schema";

interface RouteParams {
  id?: string;
  poId?: string;
  projectId?: string;
}

// ---------- design tokens ----------
const TOKENS = {
  purple: "#a890d4",
  green: "#68b088",
  amber: "#e8952a",
  coral: "#e85b5b",
  blue: "#4a90d4",
  muted: "#9b9b9b",
  pageBg: "#fafaf8",
  cardBg: "#ffffff",
  border: "#eaeae8",
  ghost: "#f5f4f0",
  darkGreen: "#2d7a4f",
};

const STEPS = ["Draft", "Sent", "Acknowledged", "Complete"] as const;
const STEP_INDEX: Record<string, number> = {
  draft: 0,
  pending_approval: 0,
  sent: 1,
  acknowledged: 2,
  approved: 2,
  accepted: 3,
  completed: 3,
  delivered: 3,
  partially_delivered: 3,
  invoiced: 3,
  billed: 3,
  closed: 3,
};

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
}
function StatusStepper({ status }: StatusStepperProps) {
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
  const idx = STEP_INDEX[status] ?? 0;
  return (
    <div className="flex items-center gap-2" data-testid="status-stepper">
      {STEPS.map((label, i) => {
        const isActive = i === idx;
        const isPast = i < idx;
        const dotColor = isActive
          ? TOKENS.amber
          : isPast
          ? TOKENS.purple
          : TOKENS.border;
        const labelColor = isActive
          ? "#222"
          : isPast
          ? "#444"
          : TOKENS.muted;
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
            {i < STEPS.length - 1 && (
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
        className="h-8 text-sm border-0 bg-transparent hover:bg-[#f5f4f0] focus:bg-white focus:border focus:border-[#eaeae8] focus-visible:ring-0 rounded px-2"
        disabled={disabled}
        data-testid={`po-item-description-${item.id}`}
      />

      <Input
        type="number"
        value={item.quantity}
        onChange={(e) => {
          const qty = e.target.value;
          const newTotal = Math.round(parseFloat(qty || "0") * unitPrice);
          onUpdate(item.id, { quantity: qty, total: newTotal });
        }}
        placeholder="1"
        className="h-8 text-sm text-right border-0 bg-transparent hover:bg-[#f5f4f0] focus:bg-white focus:border focus:border-[#eaeae8] focus-visible:ring-0 rounded px-2"
        disabled={disabled}
        data-testid={`po-item-qty-${item.id}`}
      />

      <Input
        value={item.unit || ""}
        onChange={(e) => onUpdate(item.id, { unit: e.target.value })}
        placeholder="each"
        className="h-8 text-sm border-0 bg-transparent hover:bg-[#f5f4f0] focus:bg-white focus:border focus:border-[#eaeae8] focus-visible:ring-0 rounded px-2"
        disabled={disabled}
        data-testid={`po-item-unit-${item.id}`}
      />

      <Input
        type="text"
        value={(unitPrice / 100).toFixed(2)}
        onChange={(e) => {
          const price = parseCurrency(e.target.value);
          const newTotal = Math.round(quantity * price);
          onUpdate(item.id, { unitPrice: price, total: newTotal });
        }}
        placeholder="0.00"
        className="h-8 text-sm text-right border-0 bg-transparent hover:bg-[#f5f4f0] focus:bg-white focus:border focus:border-[#eaeae8] focus-visible:ring-0 rounded px-2"
        disabled={disabled}
        data-testid={`po-item-price-${item.id}`}
      />

      <div
        className="text-sm text-right font-semibold"
        style={{ color: "#111" }}
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
                      u.id === currentSupplierUserId ? "bg-[#f5f4f0]" : ""
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
                    c.id === currentSupplierId ? "bg-[#f5f4f0]" : ""
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
            <p className="text-sm text-muted-foreground py-6 text-center">
              No timesheets awaiting PO.
            </p>
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
  const [scopeSection, setScopeSection] = useState<
    "inclusions" | "exclusions" | "special"
  >("inclusions");
  const [termsAndConditions, setTermsAndConditions] = useState("");
  const [isTermsOpen, setIsTermsOpen] = useState(false);
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
      setRequiredByDate(
        purchaseOrder.requiredByDate
          ? new Date(purchaseOrder.requiredByDate).toISOString().split("T")[0]
          : "",
      );
    }
  }, [purchaseOrder]);


  useEffect(() => {
    setItems(rawPoItems ?? []);
  }, [rawPoItems]);

  // ---------- mutations ----------
  const updatePoMutation = useMutation({
    mutationFn: async (data: Partial<PurchaseOrder>) => {
      return apiRequest(`/api/purchase-orders/${poId}`, "PATCH", data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: ["/api/purchase-orders", poId],
      });
      queryClient.invalidateQueries({ queryKey: ["/api/purchase-orders"] });
      setHasUnsavedChanges(false);
      toast({ title: "Purchase order saved" });
      handleGoBack();
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
      queryClient.invalidateQueries({
        queryKey: ["/api/purchase-orders", poId],
      });
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
      queryClient.invalidateQueries({
        queryKey: ["/api/purchase-orders", poId],
      });
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
      queryClient.invalidateQueries({
        queryKey: ["/api/purchase-orders", poId],
      });
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
      queryClient.invalidateQueries({
        queryKey: ["/api/purchase-orders", poId],
      });
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
        title: "Failed to delete",
        description: error.message,
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

  const markReceivedMutation = useMutation({
    mutationFn: async () => {
      return apiRequest(`/api/purchase-orders/${poId}`, "PATCH", {
        status: "delivered",
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: ["/api/purchase-orders", poId],
      });
      queryClient.invalidateQueries({ queryKey: ["/api/purchase-orders"] });
      toast({ title: "Goods received", description: "Status updated to Received" });
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
    setItems((prev) =>
      prev.map((item) => (item.id === itemId ? { ...item, ...updates } : item)),
    );
    updateItemMutation.mutate({ itemId, data: updates });
  };

  const handleItemDelete = (itemId: string) => {
    if (!poId) return;
    setItems((prev) => prev.filter((item) => item.id !== itemId));
    deleteItemMutation.mutate(itemId);
  };

  const handleAddItem = () => {
    if (!poId) return;
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
  const subtotal = useMemo(() => {
    return items.reduce((sum, item) => {
      const qty = parseFloat(item.quantity || "0");
      const price = item.unitPrice || 0;
      return sum + Math.round(qty * price);
    }, 0);
  }, [items]);

  const gstAmount = useMemo(() => {
    return items.reduce((sum, item) => {
      if (item.isGstFree) return sum;
      const qty = parseFloat(item.quantity || "0");
      const price = item.unitPrice || 0;
      const lineTotal = Math.round(qty * price);
      return sum + Math.round(lineTotal * 0.1);
    }, 0);
  }, [items]);

  const total = subtotal + gstAmount;

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

  const handleImportProjectScope = () => {
    if (project?.scope) {
      setScope(project.scope);
      setHasUnsavedChanges(true);
      setIsImportScopeDialogOpen(false);
      toast({ title: "Scope imported from project" });
    }
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

  const isLocked = purchaseOrder?.status !== "draft";

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
  return (
    <div
      className="h-full flex flex-col"
      style={{ backgroundColor: TOKENS.pageBg }}
    >
      {/* Top bar */}
      <div
        className="flex-none border-b sticky top-0 z-10"
        style={{ backgroundColor: TOKENS.cardBg, borderColor: TOKENS.border }}
      >
        <div className="h-12 px-4 flex items-center justify-between gap-4">
          <div className="flex items-center gap-3 min-w-0">
            <Button
              variant="ghost"
              size="icon"
              onClick={handleGoBack}
              data-testid="button-back"
            >
              <ArrowLeft className="w-4 h-4" />
            </Button>

            <div className="flex items-center gap-3 min-w-0">
              <h1
                className="text-lg font-semibold truncate"
                data-testid="text-po-number"
              >
                {purchaseOrder.poNumber}
              </h1>
              {purchaseOrder.poType === "site" && (
                <Badge variant="outline" className="text-xs">
                  Site PO
                </Badge>
              )}
              {(purchaseOrder as any).xeroPurchaseOrderId && (
                <Badge
                  variant="outline"
                  className="text-xs gap-1"
                  data-testid="badge-in-xero"
                >
                  <SiXero className="w-3 h-3" />
                  In Xero
                </Badge>
              )}
              <div className="hidden md:flex">
                <StatusStepper status={purchaseOrder.status} />
              </div>
              <Badge
                variant="outline"
                className="md:hidden text-xs capitalize"
                data-testid="badge-status-mobile"
              >
                {purchaseOrder.status.replace(/_/g, " ")}
              </Badge>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={handleSave}
              disabled={isSaving || isLocked}
              data-testid="button-save-po"
            >
              {isSaving ? (
                <Loader2 className="w-4 h-4 animate-spin mr-1" />
              ) : (
                <Save className="w-4 h-4 mr-1" />
              )}
              Save
            </Button>

            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button
                  variant="outline"
                  size="sm"
                  data-testid="button-po-actions"
                >
                  <MoreHorizontal className="w-4 h-4" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem
                  onClick={() => setPoPreviewOpen(true)}
                  data-testid="action-preview-po"
                >
                  <Eye className="w-4 h-4 mr-2" />
                  Preview PDF
                </DropdownMenuItem>
                <DropdownMenuItem
                  onClick={handleDownloadPdf}
                  disabled={pdfGenerating}
                  data-testid="action-print-po"
                >
                  {pdfGenerating ? (
                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  ) : (
                    <Download className="w-4 h-4 mr-2" />
                  )}
                  Download PDF
                </DropdownMenuItem>
                <DropdownMenuItem
                  onClick={() => setIsSendDialogOpen(true)}
                  data-testid="action-email-po"
                >
                  <Mail className="w-4 h-4 mr-2" />
                  Email to Supplier
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                {purchaseOrder.status === "sent" && (
                  <DropdownMenuItem
                    onClick={() => markReceivedMutation.mutate()}
                    data-testid="action-receive-goods"
                  >
                    <Package className="w-4 h-4 mr-2" />
                    Mark as Received
                  </DropdownMenuItem>
                )}
                <DropdownMenuItem
                  onClick={() => duplicatePoMutation.mutate()}
                  data-testid="action-duplicate-po"
                >
                  <Copy className="w-4 h-4 mr-2" />
                  Duplicate
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem
                  onClick={() => pushToXeroMutation.mutate(undefined)}
                  disabled={pushToXeroMutation.isPending}
                  data-testid="action-push-po-to-xero"
                >
                  {pushToXeroMutation.isPending ? (
                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  ) : (
                    <SiXero className="w-4 h-4 mr-2" />
                  )}
                  {(purchaseOrder as any).xeroPurchaseOrderId
                    ? "Re-push to Xero"
                    : "Push to Xero (Draft)"}
                </DropdownMenuItem>
                {(purchaseOrder as any).xeroPurchaseOrderId && (
                  <DropdownMenuItem
                    onClick={() => refreshFromXeroMutation.mutate()}
                    disabled={refreshFromXeroMutation.isPending}
                    data-testid="action-refresh-po-from-xero"
                  >
                    {refreshFromXeroMutation.isPending ? (
                      <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                    ) : (
                      <RefreshCw className="w-4 h-4 mr-2" />
                    )}
                    Refresh status from Xero
                  </DropdownMenuItem>
                )}
                {purchaseOrder.status === "draft" && (
                  <>
                    <DropdownMenuSeparator />
                    <DropdownMenuItem
                      onClick={() => setIsDeleteDialogOpen(true)}
                      className="text-status-danger dark:text-red-400"
                      data-testid="action-delete-po"
                    >
                      <Trash2 className="w-4 h-4 mr-2" />
                      Delete
                    </DropdownMenuItem>
                  </>
                )}
              </DropdownMenuContent>
            </DropdownMenu>

            {purchaseOrder.status === "draft" && (
              <Button
                size="sm"
                className="text-white hover:opacity-90"
                style={{
                  backgroundColor: TOKENS.purple,
                  borderColor: TOKENS.purple,
                }}
                onClick={() => setIsSendDialogOpen(true)}
                data-testid="button-send-po"
              >
                <Send className="w-4 h-4 mr-1" />
                Send to Supplier
              </Button>
            )}

            {purchaseOrder.status === "sent" && (
              <Button
                size="sm"
                variant="outline"
                onClick={() => markReceivedMutation.mutate()}
                disabled={markReceivedMutation.isPending}
                data-testid="button-receive-goods"
              >
                <Package className="w-4 h-4 mr-1" />
                Receive Goods
              </Button>
            )}
          </div>
        </div>
      </div>

      {/* Body */}
      <div className="flex-1 overflow-auto">
        <div className="max-w-7xl mx-auto p-6 grid grid-cols-3 gap-6">
          {/* Left column */}
          <div className="col-span-2 space-y-6">
            {/* Supplier hero */}
            <Card style={{ borderColor: TOKENS.border }}>
              <CardContent className="p-5">
                {supplier ? (
                  <div className="flex items-start gap-4">
                    <div
                      className="rounded-full flex items-center justify-center font-bold flex-shrink-0"
                      style={{
                        width: 60,
                        height: 60,
                        backgroundColor: "rgba(168,144,212,0.12)",
                        color: TOKENS.purple,
                        fontSize: 18,
                      }}
                      data-testid="supplier-avatar"
                    >
                      {getInitials(supplier.name || "?")}
                    </div>
                    <div className="flex-1 min-w-0 space-y-1.5">
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <p
                            className="font-semibold truncate"
                            style={{ fontSize: 17 }}
                            data-testid="text-supplier-name"
                          >
                            {supplier.name}
                          </p>
                          {(supplier as any).abn && (
                            <p className="text-xs text-muted-foreground">
                              ABN {(supplier as any).abn}
                            </p>
                          )}
                        </div>
                        {!isLocked && (
                          <button
                            onClick={() => setIsChangeSupplierOpen(true)}
                            className="text-xs font-medium hover:underline flex-shrink-0"
                            style={{ color: TOKENS.purple }}
                            data-testid="button-change-supplier"
                          >
                            Change supplier
                          </button>
                        )}
                      </div>
                      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm">
                        {supplier.email && (
                          <a
                            href={`mailto:${supplier.email}`}
                            className="inline-flex items-center gap-1.5 hover:underline"
                            style={{ color: TOKENS.blue }}
                            data-testid="link-supplier-email"
                          >
                            <Mail className="w-3.5 h-3.5" />
                            {supplier.email}
                          </a>
                        )}
                        {supplier.phone && (
                          <a
                            href={`tel:${supplier.phone}`}
                            className="inline-flex items-center gap-1.5 hover:underline"
                            style={{ color: TOKENS.blue }}
                            data-testid="link-supplier-phone"
                          >
                            <Phone className="w-3.5 h-3.5" />
                            {supplier.phone}
                          </a>
                        )}
                      </div>
                      {(supplier as any).paymentTerms && (
                        <span
                          className="inline-block text-[11px] font-medium rounded-full px-2 py-0.5 mt-1"
                          style={{
                            backgroundColor: TOKENS.ghost,
                            color: "#444",
                          }}
                          data-testid="badge-payment-terms"
                        >
                          {(supplier as any).paymentTerms}
                        </span>
                      )}
                    </div>
                  </div>
                ) : (
                  <div className="flex flex-col items-center justify-center py-6 gap-3">
                    <Building2
                      className="w-8 h-8"
                      style={{ color: TOKENS.muted }}
                    />
                    <p className="text-sm text-muted-foreground">
                      No supplier selected
                    </p>
                    <Button
                      onClick={() => setIsChangeSupplierOpen(true)}
                      disabled={isLocked}
                      className="text-white hover:opacity-90"
                      style={{
                        backgroundColor: TOKENS.purple,
                        borderColor: TOKENS.purple,
                      }}
                      data-testid="button-select-supplier"
                    >
                      Select Supplier
                    </Button>
                  </div>
                )}
              </CardContent>
            </Card>

            {/* PO Details */}
            <Card style={{ borderColor: TOKENS.border }}>
              <CardHeader className="pb-2">
                <CardTitle className="text-base">PO Details</CardTitle>
              </CardHeader>
              <CardContent className="pt-2">
                <div className="flex items-center gap-2 py-1.5">
                  <Label
                    className="text-[11px] font-medium text-muted-foreground w-24 flex-shrink-0"
                  >
                    PO Name
                  </Label>
                  <Input
                    value={title}
                    onChange={(e) => {
                      setTitle(e.target.value);
                      setHasUnsavedChanges(true);
                    }}
                    placeholder="e.g., Kitchen Materials, Bathroom Fixtures"
                    disabled={isLocked}
                    className="border-0 bg-transparent hover:bg-[#f5f4f0] focus:bg-white focus:border focus:border-[#eaeae8] focus-visible:ring-0 rounded px-2 py-1 h-8 flex-1"
                    data-testid="input-po-title"
                  />
                </div>
                <Separator />
                <div className="flex items-center gap-2 py-1.5">
                  <Label
                    className="text-[11px] font-medium text-muted-foreground w-24 flex-shrink-0"
                  >
                    Description
                  </Label>
                  <Input
                    value={description}
                    onChange={(e) => {
                      setDescription(e.target.value);
                      setHasUnsavedChanges(true);
                    }}
                    placeholder="Brief description"
                    disabled={isLocked}
                    className="border-0 bg-transparent hover:bg-[#f5f4f0] focus:bg-white focus:border focus:border-[#eaeae8] focus-visible:ring-0 rounded px-2 py-1 h-8 flex-1"
                    data-testid="input-po-description"
                  />
                </div>
              </CardContent>
            </Card>

            {/* Scope of Work */}
            <Card style={{ borderColor: TOKENS.border }}>
              <CardHeader className="pb-3 flex flex-row items-center justify-between gap-2">
                <div className="flex items-center gap-3">
                  <CardTitle className="text-base">Scope of Work</CardTitle>
                  <div className="flex items-center gap-1">
                    {(
                      [
                        ["inclusions", "Inclusions"],
                        ["exclusions", "Exclusions"],
                        ["special", "Special Conditions"],
                      ] as const
                    ).map(([value, label]) => {
                      const active = scopeSection === value;
                      return (
                        <button
                          key={value}
                          onClick={() => setScopeSection(value)}
                          className={`rounded-md text-xs px-3 py-1.5 transition-colors ${
                            active
                              ? "font-medium"
                              : "text-muted-foreground hover:text-foreground"
                          }`}
                          style={
                            active
                              ? {
                                  backgroundColor: TOKENS.ghost,
                                  color: "#222",
                                }
                              : undefined
                          }
                          data-testid={`button-scope-${value}`}
                        >
                          {label}
                        </button>
                      );
                    })}
                  </div>
                </div>
                {project?.scope && (
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setIsImportScopeDialogOpen(true)}
                    disabled={isLocked}
                    data-testid="button-import-scope"
                  >
                    <Download className="w-3 h-3 mr-1" />
                    Import from Project
                  </Button>
                )}
              </CardHeader>
              <CardContent>
                <RichTextEditor
                  content={scope}
                  onChange={(html, text) => {
                    setScope(html);
                    setScopeText(text);
                    setHasUnsavedChanges(true);
                  }}
                  placeholder="Describe the scope of work for this order..."
                  disabled={isLocked}
                  data-testid="editor-po-scope"
                />
              </CardContent>
            </Card>

            {/* Line Items */}
            <Card style={{ borderColor: TOKENS.border }}>
              <CardHeader className="pb-3 flex flex-row items-center justify-between">
                <CardTitle className="text-base">Line Items</CardTitle>
                <Button
                  size="sm"
                  onClick={handleAddItem}
                  disabled={isLocked || addItemMutation.isPending}
                  data-testid="button-add-item"
                >
                  <Plus className="w-3 h-3 mr-1" />
                  Add Item
                </Button>
              </CardHeader>
              <CardContent className="p-0">
                <div
                  className="grid grid-cols-[40px_1fr_80px_80px_100px_100px_80px_120px_40px] gap-2 px-3 py-2 text-[11px] font-semibold text-muted-foreground"
                  style={{ backgroundColor: TOKENS.ghost }}
                >
                  <div></div>
                  <div>DESCRIPTION</div>
                  <div className="text-right">QTY</div>
                  <div>UNIT</div>
                  <div className="text-right">PRICE</div>
                  <div className="text-right">TOTAL</div>
                  <div className="text-center">GST FREE</div>
                  <div>COST CODE</div>
                  <div></div>
                </div>

                {itemsLoading ? (
                  <div className="flex items-center justify-center py-8">
                    <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
                  </div>
                ) : items.length === 0 ? (
                  <div className="flex flex-col items-center justify-center py-12 text-muted-foreground">
                    <FileText className="w-8 h-8 mb-2" />
                    <p className="text-sm">No items yet</p>
                    <Button
                      variant="outline"
                      size="sm"
                      className="mt-2"
                      onClick={handleAddItem}
                      disabled={isLocked}
                      data-testid="button-add-first-item"
                    >
                      <Plus className="w-3 h-3 mr-1" />
                      Add First Item
                    </Button>
                  </div>
                ) : (
                  <DndContext
                    sensors={sensors}
                    collisionDetection={closestCenter}
                    onDragStart={handleDragStart}
                    onDragEnd={handleDragEnd}
                  >
                    <SortableContext
                      items={items.map((item) => item.id)}
                      strategy={verticalListSortingStrategy}
                    >
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
                )}

                {/* Chips row */}
                {(totalHours > 0 || (!!supplier && !isLocked)) && (
                  <div
                    className="flex items-center gap-2 px-3 py-2 flex-wrap border-t"
                    style={{ borderColor: TOKENS.border }}
                  >
                    {totalHours > 0 && (
                      <span
                        className="inline-flex items-center gap-1 text-[11px] font-semibold rounded-full px-2.5 py-1"
                        style={{
                          backgroundColor: "rgba(104,176,136,0.10)",
                          color: TOKENS.darkGreen,
                        }}
                        data-testid="chip-total-hours"
                      >
                        <Clock className="w-3 h-3" />
                        {totalHours.toFixed(1)} hrs total
                      </span>
                    )}
                    {!!supplier && !isLocked && (
                      <button
                        onClick={() => setIsImportTimesheetsOpen(true)}
                        className="inline-flex items-center gap-1 text-xs font-medium hover:underline"
                        style={{ color: TOKENS.purple }}
                        data-testid="button-import-timesheets"
                      >
                        <ArrowUp className="w-3 h-3" />
                        Import from timesheets
                      </button>
                    )}
                  </div>
                )}

                {/* Subtotal strip */}
                <div
                  className="flex items-center justify-between px-4 py-3 border-t"
                  style={{
                    backgroundColor: TOKENS.ghost,
                    borderColor: TOKENS.border,
                  }}
                  data-testid="strip-items-subtotal"
                >
                  <span className="text-xs text-muted-foreground">
                    Subtotal (ex GST)
                  </span>
                  <span className="text-base font-bold">
                    {formatCurrency(subtotal)}
                  </span>
                </div>
              </CardContent>
            </Card>

            {/* Terms & Conditions (collapsible) */}
            <Card style={{ borderColor: TOKENS.border }}>
              <button
                onClick={() => setIsTermsOpen((v) => !v)}
                className="w-full flex items-center justify-between gap-3 px-6 py-4 text-left hover-elevate rounded-t-lg"
                data-testid="button-toggle-terms"
              >
                <div className="flex-1 min-w-0">
                  <p className="text-base font-semibold">Terms & Conditions</p>
                  {!isTermsOpen && (
                    <p className="text-xs text-muted-foreground truncate mt-0.5">
                      {termsAndConditions
                        ? termsAndConditions.slice(0, 80) +
                          (termsAndConditions.length > 80 ? "…" : "")
                        : "No terms set."}
                    </p>
                  )}
                </div>
                {isTermsOpen ? (
                  <ChevronUp className="w-4 h-4 text-muted-foreground flex-shrink-0" />
                ) : (
                  <ChevronDown className="w-4 h-4 text-muted-foreground flex-shrink-0" />
                )}
              </button>
              {isTermsOpen && (
                <CardContent className="pt-0">
                  <Textarea
                    value={termsAndConditions}
                    onChange={(e) => {
                      setTermsAndConditions(e.target.value);
                      setHasUnsavedChanges(true);
                    }}
                    placeholder="Standard terms and conditions for this purchase order..."
                    rows={4}
                    disabled={isLocked}
                    data-testid="textarea-po-terms"
                  />
                </CardContent>
              )}
            </Card>
          </div>

          {/* Right sidebar */}
          <div className="space-y-6">
            {/* Totals */}
            <Card
              className="overflow-hidden"
              style={{ borderColor: TOKENS.border }}
            >
              <div
                className="h-1 w-full"
                style={{ backgroundColor: TOKENS.purple }}
              />
              <CardContent className="pt-4 space-y-2">
                <p className="text-sm font-semibold">Purchase Order Total</p>

                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">Subtotal</span>
                  <span className="font-medium" data-testid="text-subtotal">
                    {formatCurrency(subtotal)}
                  </span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">GST (10%)</span>
                  <span
                    className="text-muted-foreground"
                    data-testid="text-gst"
                  >
                    {formatCurrency(gstAmount)}
                  </span>
                </div>

                <Separator />

                <div className="flex justify-between items-center pt-1">
                  <span className="text-sm font-semibold">
                    Total (inc GST)
                  </span>
                  <span
                    className="text-2xl font-bold"
                    data-testid="text-total"
                  >
                    {formatCurrency(total)}
                  </span>
                </div>

                {project &&
                  (project as any).contractPrice &&
                  (project as any).contractPrice > 0 && (
                    <div
                      className="rounded-lg px-3 py-2 mt-2"
                      style={{ backgroundColor: "rgba(104,176,136,0.08)" }}
                      data-testid="chip-contract-health"
                    >
                      <p
                        className="text-xs font-medium"
                        style={{ color: TOKENS.darkGreen }}
                      >
                        ✓ Within contract budget
                      </p>
                    </div>
                  )}
              </CardContent>
            </Card>

            {/* Delivery */}
            <Card style={{ borderColor: TOKENS.border }}>
              <CardHeader className="pb-3">
                <CardTitle className="text-base">Delivery</CardTitle>
              </CardHeader>
              <CardContent className="space-y-1.5">
                {/* Required By with Calendar popover */}
                <div className="flex items-center gap-2 py-1">
                  <Label className="text-[11px] font-medium text-muted-foreground w-28 flex-shrink-0">
                    Required By
                  </Label>
                  <Popover>
                    <PopoverTrigger asChild>
                      <button
                        disabled={isLocked}
                        className="flex-1 flex items-center justify-between gap-2 text-sm rounded px-2 py-1 hover:bg-[#f5f4f0] focus:outline-none disabled:opacity-60 text-left"
                        data-testid="input-required-by-date"
                      >
                        <span className={requiredByDate ? "" : "text-muted-foreground"}>
                          {requiredByDate
                            ? format(new Date(requiredByDate), "dd MMM yyyy")
                            : "Pick a date"}
                        </span>
                        <CalendarIcon className="w-3.5 h-3.5 text-muted-foreground" />
                      </button>
                    </PopoverTrigger>
                    <PopoverContent className="w-auto p-0" align="end">
                      <Calendar
                        mode="single"
                        selected={
                          requiredByDate ? new Date(requiredByDate) : undefined
                        }
                        onSelect={(d) => {
                          if (d) {
                            setRequiredByDate(d.toISOString().split("T")[0]);
                            setHasUnsavedChanges(true);
                          }
                        }}
                      />
                    </PopoverContent>
                  </Popover>
                </div>

                {[
                  {
                    label: "Reference",
                    value: deliveryReference,
                    set: setDeliveryReference,
                    placeholder: "PO reference number",
                    testid: "input-delivery-reference",
                  },
                  {
                    label: "Attention",
                    value: deliveryAttention,
                    set: setDeliveryAttention,
                    placeholder: "Name or department",
                    testid: "input-delivery-attention",
                  },
                  {
                    label: "Contact",
                    value: deliveryContact,
                    set: setDeliveryContact,
                    placeholder: "Phone / email",
                    testid: "input-delivery-contact",
                  },
                ].map((row) => (
                  <div key={row.label} className="flex items-center gap-2 py-1">
                    <Label className="text-[11px] font-medium text-muted-foreground w-28 flex-shrink-0">
                      {row.label}
                    </Label>
                    <Input
                      value={row.value}
                      onChange={(e) => {
                        row.set(e.target.value);
                        setHasUnsavedChanges(true);
                      }}
                      placeholder={row.placeholder}
                      disabled={isLocked}
                      className="border-0 bg-transparent hover:bg-[#f5f4f0] focus:bg-white focus:border focus:border-[#eaeae8] focus-visible:ring-0 rounded px-2 py-1 h-8 flex-1"
                      data-testid={row.testid}
                    />
                  </div>
                ))}

                <div className="space-y-1 py-1">
                  <Label className="text-[11px] font-medium text-muted-foreground">
                    Delivery Address
                  </Label>
                  <Textarea
                    value={deliveryAddress}
                    onChange={(e) => {
                      setDeliveryAddress(e.target.value);
                      setHasUnsavedChanges(true);
                    }}
                    placeholder="Site address for delivery"
                    rows={2}
                    disabled={isLocked}
                    data-testid="textarea-delivery-address"
                  />
                </div>
                <div className="space-y-1 py-1">
                  <Label className="text-[11px] font-medium text-muted-foreground">
                    Instructions
                  </Label>
                  <Textarea
                    value={deliveryInstructions}
                    onChange={(e) => {
                      setDeliveryInstructions(e.target.value);
                      setHasUnsavedChanges(true);
                    }}
                    placeholder="Special delivery instructions"
                    rows={2}
                    disabled={isLocked}
                    data-testid="textarea-delivery-instructions"
                  />
                </div>
              </CardContent>
            </Card>

            {/* Project */}
            {project && (
              <Card style={{ borderColor: TOKENS.border }}>
                <CardHeader className="pb-3">
                  <CardTitle className="text-base">Project</CardTitle>
                </CardHeader>
                <CardContent>
                  <p
                    className="font-medium text-sm"
                    data-testid="text-project-name"
                  >
                    {project.name}
                  </p>
                  {project.address && (
                    <p className="text-xs text-muted-foreground mt-1">
                      {project.address}
                    </p>
                  )}
                </CardContent>
              </Card>
            )}

            {/* Attachments */}
            <Card style={{ borderColor: TOKENS.border }}>
              <CardHeader className="pb-3">
                <CardTitle className="text-base flex items-center gap-2">
                  <Paperclip className="w-4 h-4" />
                  Attachments
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-2">
                {attachments.length > 0 && (
                  <div className="space-y-1.5">
                    {attachments.map((att) => (
                      <div
                        key={att.id}
                        className="flex items-center gap-2 px-2 py-1.5 rounded text-xs"
                        style={{ backgroundColor: TOKENS.ghost }}
                        data-testid={`attachment-${att.id}`}
                      >
                        <FileText className="w-3.5 h-3.5 text-muted-foreground flex-shrink-0" />
                        <a
                          href={att.fileUrl}
                          target="_blank"
                          rel="noreferrer"
                          className="flex-1 truncate hover:underline"
                          style={{ color: TOKENS.blue }}
                        >
                          {att.fileName}
                        </a>
                        {!isLocked && (
                          <button
                            onClick={() =>
                              deleteAttachmentMutation.mutate(att.id)
                            }
                            className="p-0.5 hover:bg-destructive/10 rounded text-destructive"
                            data-testid={`button-delete-attachment-${att.id}`}
                          >
                            <X className="w-3.5 h-3.5" />
                          </button>
                        )}
                      </div>
                    ))}
                  </div>
                )}
                {!isLocked && (
                  <div
                    onDragOver={(e) => e.preventDefault()}
                    onDrop={handleFileDrop}
                    onClick={() => fileInputRef.current?.click()}
                    className="border-2 border-dashed rounded-lg p-4 text-center cursor-pointer transition-colors"
                    style={{
                      borderColor: TOKENS.border,
                    }}
                    onMouseEnter={(e) => {
                      (e.currentTarget as HTMLDivElement).style.borderColor =
                        TOKENS.purple;
                      (e.currentTarget as HTMLDivElement).style.backgroundColor =
                        TOKENS.ghost;
                    }}
                    onMouseLeave={(e) => {
                      (e.currentTarget as HTMLDivElement).style.borderColor =
                        TOKENS.border;
                      (e.currentTarget as HTMLDivElement).style.backgroundColor =
                        "transparent";
                    }}
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
                    <input
                      ref={fileInputRef}
                      type="file"
                      multiple
                      className="hidden"
                      onChange={handleFileSelect}
                      data-testid="input-attachment-file"
                    />
                  </div>
                )}
                {isLocked && attachments.length === 0 && (
                  <p className="text-xs text-muted-foreground">No attachments</p>
                )}
              </CardContent>
            </Card>

            {/* Activity */}
            <Card style={{ borderColor: TOKENS.border }}>
              <CardHeader className="pb-3">
                <CardTitle className="text-base">Activity</CardTitle>
              </CardHeader>
              <CardContent>
                {activityItems.length === 0 ? (
                  <p className="text-xs text-muted-foreground">
                    No activity yet.
                  </p>
                ) : (
                  <ul className="space-y-2.5">
                    {activityItems.map((a, i) => (
                      <li
                        key={i}
                        className="flex items-start gap-2.5"
                        data-testid={`activity-item-${i}`}
                      >
                        <span
                          className="inline-block rounded-full mt-1.5 flex-shrink-0"
                          style={{
                            width: 8,
                            height: 8,
                            backgroundColor: a.color,
                          }}
                        />
                        <div className="flex-1 min-w-0">
                          <p className="text-sm leading-tight">{a.label}</p>
                          <p className="text-[11px] text-muted-foreground mt-0.5">
                            {a.time
                              ? formatDistanceToNow(new Date(a.time), {
                                  addSuffix: true,
                                })
                              : ""}
                          </p>
                        </div>
                      </li>
                    ))}
                  </ul>
                )}
              </CardContent>
            </Card>
          </div>
        </div>
      </div>

      {/* ---------- Dialogs ---------- */}

      {/* Import Scope */}
      <Dialog
        open={isImportScopeDialogOpen}
        onOpenChange={setIsImportScopeDialogOpen}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Import Scope from Project</DialogTitle>
            <DialogDescription>
              This will replace the current scope with the project's scope content.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setIsImportScopeDialogOpen(false)}
            >
              Cancel
            </Button>
            <Button onClick={handleImportProjectScope}>Import Scope</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

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
