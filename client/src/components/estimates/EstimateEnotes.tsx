import { useState, useCallback, useMemo, useRef } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuTrigger,
  DropdownMenuItem,
  DropdownMenuSeparator,
} from "@/components/ui/dropdown-menu";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  CheckCircle2,
  Circle,
  MinusCircle,
  Plus,
  Trash2,
  StickyNote,
  EyeOff,
  Columns3,
  ChevronUp,
  ChevronDown,
  Paperclip,
  MoreHorizontal,
  X,
  Download,
  Upload,
} from "lucide-react";

interface EnoteRow {
  id: string;
  estimateId: string;
  groupName: string;
  categoryName: string;
  sortOrder: number;
  required: boolean | null;
  brainstormNotes: string | null;
  rfiRequired: boolean;
  rfqRequired: boolean;
  rfqDate: string | null;
  labourRequired: boolean;
  estimatorNotes: string | null;
  completed: boolean;
  isCustom: boolean;
  status: string | null;
}

interface FieldOption {
  id: string;
  key: string;
  name: string;
  color: string;
  isDefault?: boolean;
  isCompleted?: boolean;
}

interface FieldCategory {
  id: string;
  key: string;
  label: string;
}

// ─── Column definitions ───────────────────────────────────────────────────────

interface ColDef {
  id: string;
  label: string;
  defaultWidth: number;
  minWidth: number;
  visible: boolean;
}

const DEFAULT_COLUMNS: ColDef[] = [
  { id: "required",       label: "Req?",            defaultWidth: 56,  minWidth: 44,  visible: true },
  { id: "brainstorm",     label: "Brainstorm Notes", defaultWidth: 180, minWidth: 80,  visible: true },
  { id: "rfi",            label: "RFI",              defaultWidth: 44,  minWidth: 40,  visible: true },
  { id: "rfq",            label: "RFQ",              defaultWidth: 44,  minWidth: 40,  visible: true },
  { id: "rfqDate",        label: "RFQ Date",         defaultWidth: 96,  minWidth: 70,  visible: true },
  { id: "labour",         label: "Labour",           defaultWidth: 52,  minWidth: 44,  visible: true },
  { id: "estimatorNotes", label: "Estimator Notes",  defaultWidth: 180, minWidth: 80,  visible: true },
  { id: "status",         label: "Status",           defaultWidth: 120, minWidth: 90,  visible: true },
  { id: "completed",      label: "Done",             defaultWidth: 52,  minWidth: 44,  visible: true },
];

type ColPrefs = { order: string[]; hidden: string[]; widths: Record<string, number> };

function loadColPrefs(estimateId: string): ColPrefs {
  try {
    const raw = localStorage.getItem(`enotes_columns_${estimateId}`);
    if (raw) return JSON.parse(raw) as ColPrefs;
  } catch (_) {}
  return { order: DEFAULT_COLUMNS.map(c => c.id), hidden: [], widths: {} };
}

function saveColPrefs(estimateId: string, prefs: ColPrefs) {
  try {
    localStorage.setItem(`enotes_columns_${estimateId}`, JSON.stringify(prefs));
  } catch (_) {}
}

// ─── NotePopover ──────────────────────────────────────────────────────────────

function NotePopover({
  value,
  placeholder,
  onSave,
}: {
  value: string | null;
  placeholder: string;
  onSave: (v: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState(value ?? "");

  const handleOpenChange = (o: boolean) => {
    if (!o) {
      const trimmed = draft.trim();
      if (trimmed !== (value ?? "")) {
        onSave(trimmed);
      }
    } else {
      setDraft(value ?? "");
    }
    setOpen(o);
  };

  return (
    <Popover open={open} onOpenChange={handleOpenChange}>
      <PopoverTrigger asChild>
        <span className="text-xs text-muted-foreground cursor-pointer hover:text-foreground line-clamp-1 min-h-[20px] flex items-center w-full">
          {value ? (
            <span className="truncate">{value}</span>
          ) : (
            <span className="opacity-30 italic">{placeholder}</span>
          )}
        </span>
      </PopoverTrigger>
      <PopoverContent className="w-72 p-2" align="start" side="bottom">
        <Textarea
          autoFocus
          value={draft}
          onChange={e => setDraft(e.target.value)}
          onKeyDown={e => {
            if (e.key === "Escape" || e.key === "Enter") {
              e.preventDefault();
              handleOpenChange(false);
            }
          }}
          placeholder={placeholder}
          className="min-h-[80px] text-xs resize-none"
          rows={4}
        />
        <div className="flex justify-between items-center mt-1.5">
          <span className="text-[10px] text-muted-foreground">Enter or click Save</span>
          <Button size="sm" className="h-6 text-xs px-2" onClick={() => handleOpenChange(false)}>
            Save
          </Button>
        </div>
      </PopoverContent>
    </Popover>
  );
}

// ─── StatusPill ───────────────────────────────────────────────────────────────

function StatusPill({
  value,
  options,
  onChange,
}: {
  value: string | null;
  options: FieldOption[];
  onChange: (key: string | null) => void;
}) {
  const selected = options.find(o => o.key === value);

  return (
    <Select
      value={value ?? "__none__"}
      onValueChange={v => onChange(v === "__none__" ? null : v)}
    >
      <SelectTrigger
        className="h-5 text-[11px] border-0 focus:ring-0 focus:ring-offset-0 px-1.5 rounded gap-0.5"
        style={selected ? { backgroundColor: selected.color + "28", color: selected.color, borderColor: "transparent" } : { backgroundColor: "transparent" }}
      >
        <SelectValue placeholder={<span className="opacity-30 text-[10px]">—</span>} />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value="__none__">
          <span className="text-muted-foreground italic text-xs">Clear</span>
        </SelectItem>
        {options.map(opt => (
          <SelectItem key={opt.key} value={opt.key}>
            <div className="flex items-center gap-1.5">
              <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ backgroundColor: opt.color }} />
              <span className="text-xs">{opt.name}</span>
            </div>
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

// ─── ColumnsDropdown ──────────────────────────────────────────────────────────

function ColumnsDropdown({
  columns,
  hidden,
  onToggle,
  onMoveUp,
  onMoveDown,
}: {
  columns: ColDef[];
  hidden: string[];
  onToggle: (id: string) => void;
  onMoveUp: (id: string) => void;
  onMoveDown: (id: string) => void;
}) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          className="flex items-center gap-1.5 text-[11px] px-2 py-1 rounded border border-border/50 text-muted-foreground hover:text-foreground transition-colors"
          title="Manage columns"
        >
          <Columns3 className="w-3 h-3" />
          Columns
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="w-52 p-1" onCloseAutoFocus={e => e.preventDefault()}>
        {columns.map((col, idx) => {
          const isHidden = hidden.includes(col.id);
          const isFirst = idx === 0;
          const isLast = idx === columns.length - 1;
          return (
            <div
              key={col.id}
              className="flex items-center gap-2 px-2 py-1 rounded hover-elevate"
            >
              <Checkbox
                id={`col-toggle-${col.id}`}
                checked={!isHidden}
                onCheckedChange={() => onToggle(col.id)}
                className="flex-shrink-0"
              />
              <label
                htmlFor={`col-toggle-${col.id}`}
                className="flex-1 text-xs cursor-pointer select-none"
              >
                {col.label}
              </label>
              <div className="flex flex-col">
                <button
                  className="text-muted-foreground/50 hover:text-foreground disabled:opacity-20"
                  onClick={() => onMoveUp(col.id)}
                  disabled={isFirst}
                  title="Move up"
                >
                  <ChevronUp className="w-3 h-3" />
                </button>
                <button
                  className="text-muted-foreground/50 hover:text-foreground disabled:opacity-20"
                  onClick={() => onMoveDown(col.id)}
                  disabled={isLast}
                  title="Move down"
                >
                  <ChevronDown className="w-3 h-3" />
                </button>
              </div>
            </div>
          );
        })}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

// ─── Attachment types ─────────────────────────────────────────────────────────

interface EnoteAttachment {
  id: string;
  enoteId: string;
  fileName: string;
  fileUrl: string;
  fileSize: number;
  mimeType: string;
  uploadedAt: string;
}

// ─── AttachmentPanel ──────────────────────────────────────────────────────────

function formatBytes(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function isImage(mimeType: string) {
  return mimeType.startsWith("image/");
}

function AttachmentPanel({
  row,
  open,
  onClose,
  onCountChange,
}: {
  row: EnoteRow;
  open: boolean;
  onClose: () => void;
  onCountChange: (rowId: string, count: number) => void;
}) {
  const { toast } = useToast();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [lightboxUrl, setLightboxUrl] = useState<string | null>(null);

  const { data: attachments = [], isLoading, refetch } = useQuery<EnoteAttachment[]>({
    queryKey: ["/api/estimate-enotes", row.id, "attachments"],
    queryFn: () => fetch(`/api/estimate-enotes/${row.id}/attachments`, { credentials: "include" }).then(r => r.json()),
    enabled: open,
  });

  const deleteMut = useMutation({
    mutationFn: (id: string) => apiRequest(`/api/enote-attachments/${id}`, "DELETE"),
    onSuccess: () => {
      refetch().then(r => {
        onCountChange(row.id, (r.data as EnoteAttachment[] | undefined)?.length ?? 0);
      });
    },
    onError: () => toast({ title: "Delete failed", variant: "destructive" }),
  });

  const handleUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const formData = new FormData();
    formData.append("file", file);
    try {
      const resp = await fetch(`/api/estimate-enotes/${row.id}/attachments`, {
        method: "POST",
        credentials: "include",
        body: formData,
      });
      if (!resp.ok) throw new Error("Upload failed");
      const newAttachment = await resp.json();
      queryClient.setQueryData<EnoteAttachment[]>(
        ["/api/estimate-enotes", row.id, "attachments"],
        old => [...(old ?? []), newAttachment]
      );
      onCountChange(row.id, (attachments.length ?? 0) + 1);
    } catch {
      toast({ title: "Upload failed", variant: "destructive" });
    }
    e.target.value = "";
  };

  return (
    <>
      <Dialog open={open} onOpenChange={v => { if (!v) onClose(); }}>
        <DialogContent className="max-w-xl w-full">
          <DialogHeader>
            <DialogTitle className="text-sm font-semibold flex items-center gap-2">
              <Paperclip className="w-4 h-4 text-muted-foreground" />
              Attachments — <span className="font-normal text-muted-foreground truncate max-w-[260px]">{row.categoryName || "Unnamed"}</span>
            </DialogTitle>
          </DialogHeader>

          {/* Upload button */}
          <div className="flex justify-end">
            <Button size="sm" variant="outline" className="gap-1.5" onClick={() => fileInputRef.current?.click()}>
              <Upload className="w-3.5 h-3.5" />
              Upload File
            </Button>
            <input ref={fileInputRef} type="file" className="hidden" onChange={handleUpload} />
          </div>

          {/* File list */}
          {isLoading ? (
            <div className="py-8 text-center text-sm text-muted-foreground">Loading…</div>
          ) : attachments.length === 0 ? (
            <div className="py-8 text-center text-sm text-muted-foreground italic">No attachments yet</div>
          ) : (
            <div className="flex flex-col gap-1 max-h-[400px] overflow-y-auto pr-1">
              {attachments.map(att => (
                <div key={att.id} className="flex items-center gap-2 p-2 rounded-md border border-border/50 hover-elevate group">
                  {/* Thumbnail or icon */}
                  {isImage(att.mimeType) ? (
                    <button
                      className="w-10 h-10 flex-shrink-0 rounded overflow-hidden border border-border/30"
                      onClick={() => setLightboxUrl(att.fileUrl)}
                      title="Preview"
                    >
                      <img src={att.fileUrl} alt={att.fileName} className="w-full h-full object-cover" />
                    </button>
                  ) : (
                    <div className="w-10 h-10 flex-shrink-0 rounded border border-border/30 bg-muted/50 flex items-center justify-center">
                      <Paperclip className="w-4 h-4 text-muted-foreground" />
                    </div>
                  )}

                  {/* Name + size */}
                  <div className="flex-1 min-w-0">
                    <p className="text-xs font-medium truncate">{att.fileName}</p>
                    <p className="text-[10px] text-muted-foreground">{formatBytes(att.fileSize)}</p>
                  </div>

                  {/* Actions */}
                  <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                    <a
                      href={att.fileUrl}
                      download={att.fileName}
                      className="text-muted-foreground hover:text-foreground"
                      title="Download"
                    >
                      <Download className="w-3.5 h-3.5" />
                    </a>
                    <button
                      className="text-muted-foreground/50 hover:text-destructive transition-colors"
                      onClick={() => deleteMut.mutate(att.id)}
                      title="Delete"
                    >
                      <X className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Lightbox */}
      {lightboxUrl !== null && (
        <div
          className="fixed inset-0 z-[200] bg-black/80 flex items-center justify-center"
          onClick={() => setLightboxUrl(null)}
        >
          <button
            className="absolute top-4 right-4 text-white/80 hover:text-white"
            onClick={() => setLightboxUrl(null)}
          >
            <X className="w-6 h-6" />
          </button>
          <img
            src={lightboxUrl}
            alt="Preview"
            className="max-w-[90vw] max-h-[90vh] object-contain rounded"
            onClick={e => e.stopPropagation()}
          />
        </div>
      )}
    </>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────

interface Props {
  estimateId: string;
}

export default function EstimateEnotes({ estimateId }: Props) {
  const { toast } = useToast();

  // ── Left-panel state ──────────────────────────────────────────────────────
  const [selectedCategory, setSelectedCategory] = useState<string>("");
  const [editingCell, setEditingCell] = useState<{ id: string; field: string } | null>(null);
  const [editValue, setEditValue] = useState("");
  const [newCategoryName, setNewCategoryName] = useState("");
  const [newItemName, setNewItemName] = useState("");
  const [hideNotRequired, setHideNotRequired] = useState(false);
  const newCatInputRef = useRef<HTMLInputElement>(null);
  const newItemInputRef = useRef<HTMLInputElement>(null);

  // ── Attachment panel state ────────────────────────────────────────────────
  const [attachmentPanelRow, setAttachmentPanelRow] = useState<EnoteRow | null>(null);
  const [attachmentCounts, setAttachmentCounts] = useState<Record<string, number>>({});

  // ── Column preferences (visibility, order, widths) ────────────────────────
  const [colPrefs, setColPrefs] = useState<ColPrefs>(() => loadColPrefs(estimateId));

  const updateColPrefs = useCallback((updater: (prev: ColPrefs) => ColPrefs) => {
    setColPrefs(prev => {
      const next = updater(prev);
      saveColPrefs(estimateId, next);
      return next;
    });
  }, [estimateId]);

  // Ordered + annotated column list (DEFAULT_COLUMNS reordered by colPrefs.order)
  const orderedCols = useMemo<ColDef[]>(() => {
    const byId = Object.fromEntries(DEFAULT_COLUMNS.map(c => [c.id, c]));
    const result: ColDef[] = [];
    for (const id of colPrefs.order) {
      if (byId[id]) result.push(byId[id]);
    }
    // add any new columns not yet in prefs
    for (const col of DEFAULT_COLUMNS) {
      if (!result.find(c => c.id === col.id)) result.push(col);
    }
    return result;
  }, [colPrefs.order]);

  const visibleCols = useMemo(
    () => orderedCols.filter(c => !colPrefs.hidden.includes(c.id)),
    [orderedCols, colPrefs.hidden]
  );

  const colWidths = useMemo<Record<string, number>>(() => {
    const out: Record<string, number> = {};
    for (const col of DEFAULT_COLUMNS) {
      out[col.id] = colPrefs.widths[col.id] ?? col.defaultWidth;
    }
    return out;
  }, [colPrefs.widths]);

  // Grid template: fixed "Item" column (1fr) + visible cols + fixed actions column (52px)
  const gridTemplate = useMemo(() => {
    const mid = visibleCols.map(c => `${colWidths[c.id]}px`).join(" ");
    return `1fr ${mid} 52px`;
  }, [visibleCols, colWidths]);

  // ── Column resize ─────────────────────────────────────────────────────────
  const resizingRef = useRef<{ colId: string; startX: number; startWidth: number } | null>(null);

  const startResize = useCallback((colId: string, e: React.MouseEvent) => {
    e.preventDefault();
    const startWidth = colWidths[colId];
    resizingRef.current = { colId, startX: e.clientX, startWidth };

    const onMove = (ev: MouseEvent) => {
      if (!resizingRef.current) return;
      const { colId: id, startX, startWidth: sw } = resizingRef.current;
      const col = DEFAULT_COLUMNS.find(c => c.id === id);
      const minW = col?.minWidth ?? 40;
      const newW = Math.max(minW, sw + ev.clientX - startX);
      updateColPrefs(prev => ({
        ...prev,
        widths: { ...prev.widths, [id]: newW },
      }));
    };

    const onUp = () => {
      resizingRef.current = null;
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
    };

    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
  }, [colWidths, updateColPrefs]);

  // ── Toggle column visibility ──────────────────────────────────────────────
  const toggleCol = useCallback((id: string) => {
    updateColPrefs(prev => {
      const hidden = prev.hidden.includes(id)
        ? prev.hidden.filter(h => h !== id)
        : [...prev.hidden, id];
      return { ...prev, hidden };
    });
  }, [updateColPrefs]);

  // ── Move column up/down ───────────────────────────────────────────────────
  const moveColUp = useCallback((id: string) => {
    updateColPrefs(prev => {
      const order = [...prev.order];
      const idx = order.indexOf(id);
      if (idx <= 0) return prev;
      [order[idx - 1], order[idx]] = [order[idx], order[idx - 1]];
      return { ...prev, order };
    });
  }, [updateColPrefs]);

  const moveColDown = useCallback((id: string) => {
    updateColPrefs(prev => {
      const order = [...prev.order];
      const idx = order.indexOf(id);
      if (idx < 0 || idx >= order.length - 1) return prev;
      [order[idx], order[idx + 1]] = [order[idx + 1], order[idx]];
      return { ...prev, order };
    });
  }, [updateColPrefs]);

  // ── Data queries ──────────────────────────────────────────────────────────
  const { data: enotes = [], isLoading } = useQuery<EnoteRow[]>({
    queryKey: ["/api/estimates", estimateId, "enotes"],
    queryFn: () => fetch(`/api/estimates/${estimateId}/enotes`, { credentials: "include" }).then(r => r.json()),
  });

  const { data: serverCounts = {} } = useQuery<Record<string, number>>({
    queryKey: ["/api/estimates", estimateId, "enotes", "attachment-counts"],
    queryFn: () => fetch(`/api/estimates/${estimateId}/enotes/attachment-counts`, { credentials: "include" }).then(r => r.json()),
  });

  // Merge server counts with local overrides
  const effectiveCounts = useMemo(
    () => ({ ...serverCounts, ...attachmentCounts }),
    [serverCounts, attachmentCounts]
  );

  const { data: fieldCategories = [] } = useQuery<FieldCategory[]>({
    queryKey: ["/api/field-categories"],
  });

  const enoteStatusCategory = useMemo(
    () => fieldCategories.find((c: FieldCategory) => c.key === "enote.status"),
    [fieldCategories]
  );

  const { data: enoteStatusOptions = [] } = useQuery<FieldOption[]>({
    queryKey: ["/api/field-options", enoteStatusCategory?.id],
    enabled: !!enoteStatusCategory?.id,
    queryFn: async () => {
      return apiRequest(`/api/field-categories/${enoteStatusCategory!.id}/options`, "GET") as Promise<FieldOption[]>;
    },
  });

  // ── Mutations ──────────────────────────────────────────────────────────────
  const updateMutation = useMutation({
    mutationFn: ({ id, data }: { id: string; data: Partial<EnoteRow> }) =>
      apiRequest(`/api/estimates/${estimateId}/enotes/${id}`, "PATCH", data),
    onMutate: async ({ id, data }) => {
      await queryClient.cancelQueries({ queryKey: ["/api/estimates", estimateId, "enotes"] });
      const prev = queryClient.getQueryData<EnoteRow[]>(["/api/estimates", estimateId, "enotes"]);
      queryClient.setQueryData<EnoteRow[]>(["/api/estimates", estimateId, "enotes"], old =>
        old?.map(r => r.id === id ? { ...r, ...data } : r) ?? []
      );
      return { prev };
    },
    onError: (_e, _v, ctx) => {
      queryClient.setQueryData(["/api/estimates", estimateId, "enotes"], ctx?.prev);
      toast({ title: "Save failed", variant: "destructive" });
    },
    onSettled: () => queryClient.invalidateQueries({ queryKey: ["/api/estimates", estimateId, "enotes"] }),
  });

  const createMutation = useMutation({
    mutationFn: (data: Partial<EnoteRow>) =>
      apiRequest(`/api/estimates/${estimateId}/enotes`, "POST", data),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["/api/estimates", estimateId, "enotes"] }),
    onError: () => toast({ title: "Failed to add", variant: "destructive" }),
  });

  const addCustomRowMutation = useMutation({
    mutationFn: (groupName: string) =>
      apiRequest(`/api/estimates/${estimateId}/enotes/rows`, "POST", { groupName }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["/api/estimates", estimateId, "enotes"] }),
    onError: () => toast({ title: "Failed to add row", variant: "destructive" }),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) =>
      apiRequest(`/api/estimates/${estimateId}/enotes/${id}`, "DELETE"),
    onMutate: async (id) => {
      await queryClient.cancelQueries({ queryKey: ["/api/estimates", estimateId, "enotes"] });
      const prev = queryClient.getQueryData<EnoteRow[]>(["/api/estimates", estimateId, "enotes"]);
      queryClient.setQueryData<EnoteRow[]>(["/api/estimates", estimateId, "enotes"], old =>
        old?.filter(r => r.id !== id) ?? []
      );
      return { prev };
    },
    onError: (_e, _v, ctx) => {
      queryClient.setQueryData(["/api/estimates", estimateId, "enotes"], ctx?.prev);
      toast({ title: "Delete failed", variant: "destructive" });
    },
    onSettled: () => queryClient.invalidateQueries({ queryKey: ["/api/estimates", estimateId, "enotes"] }),
  });

  const update = useCallback((id: string, data: Partial<EnoteRow>) => {
    updateMutation.mutate({ id, data });
  }, [updateMutation]);

  const commitEdit = (row: EnoteRow, field: "rfqDate") => {
    if (editingCell?.id === row.id && editingCell?.field === field) {
      const current = row[field] ?? "";
      if (editValue !== current) update(row.id, { [field]: editValue || null });
      setEditingCell(null);
    }
  };

  const cycleRequired = (row: EnoteRow) => {
    const next = row.required === null ? true : row.required === true ? false : null;
    update(row.id, { required: next });
  };

  // ── Derived data ───────────────────────────────────────────────────────────
  const categoryNames = useMemo(() => [...new Set(enotes.map(r => r.groupName))], [enotes]);
  const effectiveCategory = selectedCategory || categoryNames[0] || "";

  const categoryItems = useMemo(() => {
    const all = enotes.filter(r => r.groupName === effectiveCategory);
    return hideNotRequired ? all.filter(r => r.required !== false) : all;
  }, [enotes, effectiveCategory, hideNotRequired]);

  const addCategory = () => {
    const trimmed = newCategoryName.trim();
    if (!trimmed) return;
    if (categoryNames.includes(trimmed)) {
      setSelectedCategory(trimmed);
      setNewCategoryName("");
      return;
    }
    createMutation.mutate({ groupName: trimmed, categoryName: "" }, {
      onSuccess: () => {
        setSelectedCategory(trimmed);
        setNewCategoryName("");
      },
    });
  };

  const addItem = () => {
    const trimmed = newItemName.trim();
    if (!trimmed || !effectiveCategory) return;
    createMutation.mutate({ groupName: effectiveCategory, categoryName: trimmed }, {
      onSuccess: () => setNewItemName(""),
    });
  };

  const RequiredIcon = ({ val }: { val: boolean | null }) => {
    if (val === true) return <CheckCircle2 className="w-4 h-4 text-green-500 cursor-pointer flex-shrink-0" />;
    if (val === false) return <MinusCircle className="w-4 h-4 text-muted-foreground cursor-pointer flex-shrink-0" />;
    return <Circle className="w-4 h-4 text-muted-foreground/40 cursor-pointer flex-shrink-0" />;
  };

  // ── Cell renderer per column id ────────────────────────────────────────────
  const renderCell = (colId: string, row: EnoteRow) => {
    switch (colId) {
      case "required":
        return (
          <div className="flex justify-center" onClick={() => cycleRequired(row)}>
            <RequiredIcon val={row.required} />
          </div>
        );
      case "brainstorm":
        return (
          <div className="pl-2 py-0.5 overflow-hidden">
            <NotePopover
              value={row.brainstormNotes}
              placeholder="Add notes…"
              onSave={v => update(row.id, { brainstormNotes: v || null })}
            />
          </div>
        );
      case "rfi":
        return (
          <div className="flex justify-center">
            <Checkbox checked={row.rfiRequired} onCheckedChange={v => update(row.id, { rfiRequired: !!v })} />
          </div>
        );
      case "rfq":
        return (
          <div className="flex justify-center">
            <Checkbox checked={row.rfqRequired} onCheckedChange={v => update(row.id, { rfqRequired: !!v })} />
          </div>
        );
      case "rfqDate":
        return (
          <div className="pl-1">
            {editingCell?.id === row.id && editingCell.field === "rfqDate" ? (
              <Input
                autoFocus
                value={editValue}
                onChange={e => setEditValue(e.target.value)}
                onBlur={() => commitEdit(row, "rfqDate")}
                onKeyDown={e => { if (e.key === "Enter" || e.key === "Escape") commitEdit(row, "rfqDate"); }}
                className="h-6 text-xs focus-visible:ring-0 border-primary"
                placeholder="dd/mm/yy"
              />
            ) : (
              <span
                className="text-xs text-muted-foreground cursor-pointer hover:text-foreground"
                onClick={() => { setEditingCell({ id: row.id, field: "rfqDate" }); setEditValue(row.rfqDate ?? ""); }}
              >
                {row.rfqDate ? row.rfqDate : <span className="opacity-30">—</span>}
              </span>
            )}
          </div>
        );
      case "labour":
        return (
          <div className="flex justify-center">
            <Checkbox checked={row.labourRequired} onCheckedChange={v => update(row.id, { labourRequired: !!v })} />
          </div>
        );
      case "estimatorNotes":
        return (
          <div className="pl-2 py-0.5 overflow-hidden">
            <NotePopover
              value={row.estimatorNotes}
              placeholder="Add notes…"
              onSave={v => update(row.id, { estimatorNotes: v || null })}
            />
          </div>
        );
      case "status":
        return (
          <div className="px-1">
            <StatusPill
              value={row.status}
              options={enoteStatusOptions}
              onChange={key => update(row.id, { status: key })}
            />
          </div>
        );
      case "completed":
        return (
          <div className="flex justify-center">
            <Checkbox checked={row.completed} onCheckedChange={v => update(row.id, { completed: !!v })} />
          </div>
        );
      default:
        return null;
    }
  };

  if (isLoading) {
    return (
      <div className="flex-1 flex items-center justify-center p-8 text-muted-foreground text-sm">
        Loading E-Notes…
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full overflow-hidden">
      <div className="flex flex-1 min-h-0 overflow-hidden">

        {/* LEFT: Categories panel */}
        <div className="w-52 flex-shrink-0 border-r border-border flex flex-col bg-muted/20">
          <div className="px-3 py-2 border-b border-border/50 flex-shrink-0">
            <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Categories</span>
          </div>
          <div className="flex-1 overflow-y-auto">
            {categoryNames.length === 0 ? (
              <div className="px-3 py-4 text-xs text-muted-foreground italic">No categories yet</div>
            ) : categoryNames.map(cat => {
              const catAll = enotes.filter(r => r.groupName === cat);
              const done = catAll.filter(r => r.completed).length;
              const reqCount = catAll.filter(r => r.required === true).length;
              const isSelected = effectiveCategory === cat;
              return (
                <button
                  key={cat}
                  onClick={() => setSelectedCategory(cat)}
                  className={`w-full text-left px-3 py-2 flex flex-col gap-0.5 border-b border-border/20 transition-colors hover-elevate ${
                    isSelected ? "bg-[#bba7db]/15 text-foreground" : "text-muted-foreground hover:text-foreground"
                  }`}
                >
                  <span className="text-xs font-medium truncate w-full">{cat}</span>
                  <div className="flex items-center gap-1.5">
                    <span className="text-[10px] text-muted-foreground">{done}/{catAll.length} done</span>
                    {reqCount > 0 && (
                      <span className="text-[9px] px-1 rounded font-medium bg-green-500/15 text-green-700 dark:text-green-400">
                        {reqCount} req.
                      </span>
                    )}
                  </div>
                </button>
              );
            })}
          </div>

          {/* Add category input */}
          <div className="p-2 border-t border-border/50 flex-shrink-0 flex gap-1">
            <Input
              ref={newCatInputRef}
              value={newCategoryName}
              onChange={e => setNewCategoryName(e.target.value)}
              onKeyDown={e => { if (e.key === "Enter") addCategory(); }}
              placeholder="New category…"
              className="h-7 text-xs"
            />
            <Button
              size="icon"
              variant="ghost"
              className="h-7 w-7 flex-shrink-0"
              onClick={addCategory}
              disabled={!newCategoryName.trim() || createMutation.isPending}
            >
              <Plus className="w-3 h-3" />
            </Button>
          </div>
        </div>

        {/* RIGHT: Items for selected category */}
        <div className="flex-1 flex flex-col min-h-0 overflow-hidden">
          {!effectiveCategory ? (
            <div className="flex-1 flex items-center justify-center flex-col gap-2 text-muted-foreground">
              <StickyNote className="w-8 h-8 text-muted-foreground/40" />
              <p className="text-xs">Add a category on the left to get started</p>
            </div>
          ) : (
            <>
              {/* Filter + Column management bar */}
              <div className="flex-shrink-0 flex items-center gap-2 px-3 py-1.5 border-b border-border/30 bg-background">
                <button
                  onClick={() => setHideNotRequired(v => !v)}
                  className={`flex items-center gap-1.5 text-[11px] px-2 py-1 rounded border transition-colors ${
                    hideNotRequired
                      ? "bg-primary/10 border-primary/30 text-primary"
                      : "border-border/50 text-muted-foreground hover:text-foreground"
                  }`}
                  title="Toggle hide not-required rows"
                >
                  <EyeOff className="w-3 h-3" />
                  Hide Not Required
                </button>

                <ColumnsDropdown
                  columns={orderedCols}
                  hidden={colPrefs.hidden}
                  onToggle={toggleCol}
                  onMoveUp={moveColUp}
                  onMoveDown={moveColDown}
                />
              </div>

              {/* Column header */}
              <div className="flex-shrink-0 bg-muted/50 border-b border-border/50 text-[10px] font-medium text-muted-foreground uppercase tracking-wide select-none overflow-hidden">
                <div
                  className="grid items-center px-3 py-1.5"
                  style={{ gridTemplateColumns: gridTemplate }}
                >
                  {/* Fixed: Item */}
                  <span>Item</span>

                  {/* Dynamic visible columns */}
                  {visibleCols.map((col, idx) => {
                    const isCenter = ["required", "rfi", "rfq", "labour", "completed"].includes(col.id);
                    return (
                      <div key={col.id} className="relative flex items-center">
                        <span className={`flex-1 truncate ${isCenter ? "text-center" : "pl-1"}`}>
                          {col.label}
                        </span>
                        {/* Resize handle — appears on hover between columns */}
                        <div
                          className="absolute right-0 top-0 bottom-0 w-3 flex items-center justify-center cursor-col-resize group/resize z-10"
                          onMouseDown={e => startResize(col.id, e)}
                          title="Drag to resize"
                        >
                          <div className="w-px h-full bg-border/0 group-hover/resize:bg-border/60 transition-colors" />
                        </div>
                      </div>
                    );
                  })}

                  {/* Fixed: delete placeholder */}
                  <span />
                </div>
              </div>

              {/* Scrollable rows */}
              <div className="flex-1 overflow-auto min-h-0">
                {categoryItems.length === 0 ? (
                  <div className="flex items-center justify-center h-24 text-xs text-muted-foreground italic">
                    {hideNotRequired ? "All rows are hidden by the filter" : "No items in this category yet"}
                  </div>
                ) : categoryItems.map(row => {
                  const attCount = effectiveCounts[row.id] ?? 0;
                  return (
                    <div
                      key={row.id}
                      className={`grid items-center px-3 border-b border-border/10 transition-colors group/erow ${
                        row.required === false ? "opacity-40" : ""
                      } ${row.completed ? "bg-green-500/5" : ""}`}
                      style={{ gridTemplateColumns: gridTemplate, minHeight: "34px" }}
                    >
                      {/* Fixed: Item name + attachment badge */}
                      <div className="flex items-center gap-1.5 min-w-0">
                        {row.isCustom ? (
                          <Input
                            value={row.categoryName}
                            onChange={e => update(row.id, { categoryName: e.target.value })}
                            placeholder="Item name…"
                            className="h-6 text-xs border-0 focus-visible:ring-0 px-0 bg-transparent min-w-0 flex-1"
                          />
                        ) : (
                          <span className="text-sm truncate flex-1 min-w-0">
                            {row.categoryName || <span className="italic text-muted-foreground/40 text-xs">Unnamed</span>}
                          </span>
                        )}
                        {attCount > 0 && (
                          <button
                            className="flex items-center gap-0.5 text-[10px] text-muted-foreground hover:text-foreground flex-shrink-0"
                            onClick={() => setAttachmentPanelRow(row)}
                            title={`${attCount} attachment${attCount !== 1 ? "s" : ""}`}
                          >
                            <Paperclip className="w-3 h-3" />
                            <span>{attCount}</span>
                          </button>
                        )}
                      </div>

                      {/* Dynamic visible columns */}
                      {visibleCols.map(col => (
                        <div key={col.id} className="overflow-hidden">
                          {renderCell(col.id, row)}
                        </div>
                      ))}

                      {/* Fixed: Actions column — 3-dot menu (hover-only) */}
                      <div className="flex justify-center items-center">
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <button
                              className="invisible group-hover/erow:visible text-muted-foreground/50 hover:text-foreground transition-colors p-0.5 rounded"
                              title="Row options"
                            >
                              <MoreHorizontal className="w-3.5 h-3.5" />
                            </button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end" className="w-44">
                            <DropdownMenuItem
                              className="flex items-center gap-2 text-xs"
                              onSelect={() => setAttachmentPanelRow(row)}
                            >
                              <Paperclip className="w-3.5 h-3.5" />
                              Attachments
                              {attCount > 0 && (
                                <span className="ml-auto text-[10px] text-muted-foreground">{attCount}</span>
                              )}
                            </DropdownMenuItem>
                            {row.isCustom && (
                              <>
                                <DropdownMenuSeparator />
                                <DropdownMenuItem
                                  className="flex items-center gap-2 text-xs text-destructive focus:text-destructive"
                                  onSelect={() => deleteMutation.mutate(row.id)}
                                >
                                  <Trash2 className="w-3.5 h-3.5" />
                                  Delete row
                                </DropdownMenuItem>
                              </>
                            )}
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </div>
                    </div>
                  );
                })}

                {/* Per-group add blank row button */}
                {effectiveCategory && (
                  <div className="px-3 py-1.5 flex">
                    <button
                      className="flex items-center gap-1 text-[11px] text-muted-foreground hover:text-foreground transition-colors"
                      onClick={() => addCustomRowMutation.mutate(effectiveCategory)}
                      disabled={addCustomRowMutation.isPending}
                      title="Add blank row to this group"
                    >
                      <Plus className="w-3 h-3" />
                      Add blank row
                    </button>
                  </div>
                )}
              </div>

              {/* Add named item row */}
              <div className="flex-shrink-0 border-t border-border/50 px-3 py-2 flex items-center gap-2">
                <Input
                  ref={newItemInputRef}
                  value={newItemName}
                  onChange={e => setNewItemName(e.target.value)}
                  onKeyDown={e => { if (e.key === "Enter") addItem(); }}
                  placeholder="Add named item to this category…"
                  className="h-7 text-xs flex-1"
                />
                <Button
                  size="sm"
                  variant="outline"
                  className="h-7 text-xs gap-1"
                  onClick={addItem}
                  disabled={!newItemName.trim() || createMutation.isPending}
                >
                  <Plus className="w-3 h-3" />
                  Add Item
                </Button>
              </div>
            </>
          )}
        </div>
      </div>

      {/* Attachment panel */}
      {attachmentPanelRow !== null && (
        <AttachmentPanel
          row={attachmentPanelRow}
          open={attachmentPanelRow !== null}
          onClose={() => setAttachmentPanelRow(null)}
          onCountChange={(rowId, count) =>
            setAttachmentCounts(prev => ({ ...prev, [rowId]: count }))
          }
        />
      )}
    </div>
  );
}
