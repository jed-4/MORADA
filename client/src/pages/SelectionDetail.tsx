import { useState, useEffect, useRef } from "react";
import { DndContext, closestCenter, PointerSensor, useSensor, useSensors, type DragEndEvent } from "@dnd-kit/core";
import { arrayMove, SortableContext, horizontalListSortingStrategy, useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { useParams, useLocation } from "wouter";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage, FormDescription } from "@/components/ui/form";
import { useToast } from "@/hooks/use-toast";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { useProject } from "@/contexts/ProjectContext";
import { useAuth } from "@/hooks/use-auth";
import { usePermission } from "@/hooks/use-permission";
import { useSelectionStatusOptions } from "@/hooks/useSelectionStatusOptions";
import {
  SelectionStatusPill,
  RestrictedNotice,
  RestrictedPill,
  getDerivedStatus,
  isDecided,
  isRestricted,
} from "@/components/selections/selectionHelpers";
import { useSelectionPdfExport } from "@/components/selections/useSelectionPdfExport";
import { OptionsSection, type OptionView } from "@/components/selections/OptionViews";
import { OptionDialog, type OptionDialogValues } from "@/components/selections/OptionDialog";
import { 
  insertSelectionOptionSchema, 
  insertSelectionSchema,
  type SelectionWithOptions,
  type SelectionOption,
  type OptionAttachment,
  type InsertSelectionOption,
  type InsertSelection,
  type FieldCategoryWithOptions,
  type SelectionComment,
} from "@shared/schema";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { CreatableFieldSelect } from "@/components/ui/creatable-field-select";
import { Label } from "@/components/ui/label";
import { formatCents } from "@shared/money";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { LineItemTable } from "@/components/LineItemTable";
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@/components/ui/tabs";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import {
  ChevronLeft,
  HardHat,
  Plus,
  Search,
  MoreVertical,
  Edit3,
  Trash2,
  Package,
  CheckCircle,
  Clock,
  AlertCircle,
  DollarSign,
  Calendar as CalendarIcon,
  MapPin,
  Settings,
  Loader2,
  Save,
  Eye,
  EyeOff,
  LockOpen,
  Lock,
  LayoutList,
  LayoutGrid,
  ExternalLink,
  Users,
  X,
  MessageSquare,
  Send,
  ShoppingCart,
  PackageCheck,
  Camera,
  Image as ImageIcon,
  Upload,
  QrCode,
  Link as LinkIcon,
  Link2,
  ChevronDown,
  ChevronRight,
  XCircle,
  FileText,
  File as FileIcon,
  BookMarked,
  Crosshair,
} from "lucide-react";
import { format } from "date-fns";
import { FocalPointPicker, saveFocalPoint } from "@/components/FocalPointPicker";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Separator } from "@/components/ui/separator";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog";
import { cn } from "@/lib/utils";

function SortableAttachmentThumb({ att, onDelete, selectionId }: { att: OptionAttachment; onDelete: (id: string) => void; selectionId: string }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: att.id });
  const { toast } = useToast();
  const [focalOpen, setFocalOpen] = useState(false);
  const [isSavingFocal, setIsSavingFocal] = useState(false);
  const isImage = att.fileType?.toLowerCase() === "image" || /\.(jpe?g|png|gif|webp|avif)$/i.test(att.filePath || "");
  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
    zIndex: isDragging ? 10 : undefined,
  };

  const handleSaveFocal = async (x: number, y: number) => {
    setIsSavingFocal(true);
    try {
      await saveFocalPoint("option_attachments", att.id, x, y);
      queryClient.invalidateQueries({ queryKey: ["/api/selections", selectionId] });
      // The list renders this attachment as the row thumbnail.
      queryClient.invalidateQueries({ queryKey: ["/api/selections/with-options"] });
      toast({ title: "Focal point saved" });
      setFocalOpen(false);
    } catch {
      toast({ title: "Failed to save focal point", variant: "destructive" });
    } finally {
      setIsSavingFocal(false);
    }
  };

  return (
    <>
      <div ref={setNodeRef} style={style} className="relative group aspect-square rounded-md overflow-hidden bg-muted cursor-grab active:cursor-grabbing">
        <img
          src={att.filePath}
          alt={att.fileName || "attachment"}
          className="w-full h-full object-cover"
          style={{ objectPosition: `${att.thumbnailX ?? 50}% ${att.thumbnailY ?? 50}%` }}
        />
        <div className="absolute inset-0 bg-black/50 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center gap-2">
          <button
            type="button"
            {...attributes}
            {...listeners}
            className="text-white p-1"
            aria-label="Drag to reorder"
            onClick={(e) => e.stopPropagation()}
          >
            <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24"><path d="M9 3h2v2H9V3zm4 0h2v2h-2V3zM9 7h2v2H9V7zm4 0h2v2h-2V7zM9 11h2v2H9v-2zm4 0h2v2h-2v-2zM9 15h2v2H9v-2zm4 0h2v2h-2v-2z"/></svg>
          </button>
          {isImage && (
            <button
              type="button"
              className="text-white p-1"
              onClick={(e) => { e.stopPropagation(); setFocalOpen(true); }}
              aria-label="Set thumbnail focal point"
              title="Set focal point"
            >
              <Crosshair className="w-4 h-4" />
            </button>
          )}
          <button
            type="button"
            className="text-white p-1"
            onClick={(e) => { e.stopPropagation(); onDelete(att.id); }}
            aria-label="Delete image"
          >
            <Trash2 className="w-4 h-4" />
          </button>
        </div>
      </div>
      {isImage && (
        <FocalPointPicker
          open={focalOpen}
          onOpenChange={setFocalOpen}
          imageUrl={att.filePath}
          initialX={att.thumbnailX ?? 50}
          initialY={att.thumbnailY ?? 50}
          onSave={handleSaveFocal}
          isSaving={isSavingFocal}
        />
      )}
    </>
  );
}

function SortableImageGrid({
  attachments,
  onReorder,
  onDelete,
  selectionId,
}: {
  attachments: OptionAttachment[];
  onReorder: (newOrder: OptionAttachment[]) => void;
  onDelete: (id: string) => void;
  selectionId: string;
}) {
  const [items, setItems] = useState<OptionAttachment[]>(attachments);
  useEffect(() => { setItems(attachments); }, [attachments]);
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 5 } }));
  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    if (over && active.id !== over.id) {
      const oldIndex = items.findIndex((i) => i.id === active.id);
      const newIndex = items.findIndex((i) => i.id === over.id);
      const newOrder = arrayMove(items, oldIndex, newIndex);
      setItems(newOrder);
      onReorder(newOrder);
    }
  };
  return (
    <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
      <SortableContext items={items.map((i) => i.id)} strategy={horizontalListSortingStrategy}>
        <div className="grid grid-cols-4 gap-2">
          {items.map((att) => (
            <SortableAttachmentThumb key={att.id} att={att} onDelete={onDelete} selectionId={selectionId} />
          ))}
        </div>
      </SortableContext>
    </DndContext>
  );
}

export default function SelectionDetail() {
  const { id, projectId } = useParams<{ id: string; projectId?: string }>();
  const [, setLocation] = useLocation();
  const { currentProject } = useProject();
  const { exportPdf, isExporting: isExportingPdf } = useSelectionPdfExport();
  const [isAddingOption, setIsAddingOption] = useState(false);
  // Seeds a CREATE. Only the URL importer uses it: it opens a fresh dialog
  // already filled in from the scraped page. Editing seeds from the option
  // itself, and a plain Add seeds from the dialog's own defaults.
  const [prefillValues, setPrefillValues] = useState<Partial<OptionDialogValues> | null>(null);
  const [prefillSpecifications, setPrefillSpecifications] = useState<Record<string, any> | null>(null);
  const [editingOption, setEditingOption] = useState<SelectionOption | null>(null);
  const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false);
  const [localNotes, setLocalNotes] = useState<string>("");
  const [notesInitialized, setNotesInitialized] = useState(false);
  const [pricingPopoverOpen, setPricingPopoverOpen] = useState(false);
  const [editingAllowance, setEditingAllowance] = useState<string>("");
  // Allowance linking: a selection can point at a PC/PS estimate line so its
  // budget follows the estimate instead of being a typed-in number.
  const [editingAllowanceItemId, setEditingAllowanceItemId] = useState<string>("");
  const [isEditingDetails, setIsEditingDetails] = useState(false);
  const { toast } = useToast();
  const { user } = useAuth();
  const { statusOptions, getStatusInfo, getStatusLabel } = useSelectionStatusOptions();
  const noteSaveRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const imageInputRef = useRef<HTMLInputElement>(null);
  const [uploadingImage, setUploadingImage] = useState(false);
  const [commentText, setCommentText] = useState("");
  const [commentsExpanded, setCommentsExpanded] = useState(false);
  const [notesPanelExpanded, setNotesPanelExpanded] = useState(false);
  // Unread-comment indicator: last-seen timestamp per selection (local to
  // this browser — no schema change). Seen is stamped while the panel is open.
  const commentsSeenKey = `selection-comments-seen-${id}`;
  const [commentsSeenAt, setCommentsSeenAt] = useState<number>(() => {
    const v = Number(localStorage.getItem(commentsSeenKey) || 0);
    return Number.isFinite(v) ? v : 0;
  });
  const [showQrModal, setShowQrModal] = useState(false);
  const [portalLinkCopied, setPortalLinkCopied] = useState(false);

  const effectiveProjectId = projectId || currentProject?.id;
  const { data: projectAllowances = [] } = useQuery<any[]>({
    queryKey: ["/api/projects", effectiveProjectId, "allowances"],
    // Rows come back as { item, actualCost, ... } — flatten to the estimate
    // item, which carries name / allowance type / priceIncTax
    queryFn: async () => {
      const rows: any[] = await apiRequest(`/api/projects/${effectiveProjectId}/allowances`, "GET");
      return (rows ?? []).map((r: any) => r?.item ?? r).filter(Boolean);
    },
    enabled: (pricingPopoverOpen || isEditingDetails) && !!effectiveProjectId,
  });


  const { data: selectionCategories } = useQuery<FieldCategoryWithOptions>({
    queryKey: ["/api/field-categories/by-key/selection.category"],
  });

  const { data: locationCategories } = useQuery<FieldCategoryWithOptions>({
    queryKey: ["/api/field-categories/by-key/selection.room"],
  });

  const { data: selection, isLoading } = useQuery<SelectionWithOptions>({
    queryKey: ["/api/selections", id],
    enabled: !!id,
  });

  const selectionForm = useForm<InsertSelection>({
    resolver: zodResolver(insertSelectionSchema),
    defaultValues: {
      projectId: effectiveProjectId || "",
      name: "",
      description: "",
      category: "",
      room: "",
      selectionType: "selection",
      status: "draft",
      deadline: undefined,
      allowance: undefined,
      clientCanChange: true,
      clientCanSeePrice: false,
      clientCanAddOption: false,
    },
  });

  useEffect(() => {
    if (selection) {
      selectionForm.reset({
        projectId: selection.projectId,
        name: selection.name,
        description: selection.description || "",
        category: selection.category || "",
        room: selection.room || "",
        selectionType: (selection as any).selectionType || "selection",
        status: selection.status,
        deadline: selection.deadline || undefined,
        allowance: selection.allowance || undefined,
        clientCanChange: selection.clientCanChange,
        clientCanSeePrice: selection.clientCanSeePrice,
        clientCanAddOption: (selection as any).clientCanAddOption ?? false,
      });
      if (!notesInitialized) {
        setLocalNotes((selection as any).notes || "");
        setNotesInitialized(true);
      }
    }
  }, [selection]);

  useEffect(() => {
    const subscription = selectionForm.watch(() => {
      setHasUnsavedChanges(true);
    });
    return () => subscription.unsubscribe();
  }, [selectionForm.watch]);

  // Every write on this page has to refresh two caches: this selection, and the
  // project Selections list, which is keyed on /api/selections/with-options.
  // staleTime is Infinity, so a list left out of the invalidation goes on
  // serving the row exactly as it looked before the edit until a full reload.
  const invalidateSelection = () => {
    queryClient.invalidateQueries({ queryKey: ["/api/selections", id] });
    queryClient.invalidateQueries({ queryKey: ["/api/selections/with-options"] });
  };

  const updateSelectionMutation = useMutation({
    mutationFn: async (data: Partial<InsertSelection>) => {
      return await apiRequest(`/api/selections/${id}`, "PATCH", data);
    },
    onSuccess: () => {
      invalidateSelection();
      setHasUnsavedChanges(false);
      toast({
        title: "Selection updated",
        description: "Your changes have been saved.",
      });
    },
    onError: () => {
      toast({
        title: "Error",
        description: "Failed to save changes. Please try again.",
        variant: "destructive",
      });
    },
  });

  useEffect(() => {
    if (commentsExpanded) {
      const now = Date.now();
      localStorage.setItem(commentsSeenKey, String(now));
      setCommentsSeenAt(now);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [commentsExpanded, id]);

  const { data: comments = [] } = useQuery<SelectionComment[]>({
    queryKey: ["/api/selections", id, "comments"],
    queryFn: async () => {
      const res = await fetch(`/api/selections/${id}/comments`);
      if (!res.ok) throw new Error("Failed to fetch comments");
      return res.json();
    },
    enabled: !!id,
  });

  const addCommentMutation = useMutation({
    mutationFn: async (content: string) => {
      return await apiRequest(`/api/selections/${id}/comments`, "POST", { content });
    },
    onSuccess: () => {
      setCommentText("");
      queryClient.invalidateQueries({ queryKey: ["/api/selections", id, "comments"] });
    },
    onError: () => {
      toast({ title: "Error", description: "Failed to post comment.", variant: "destructive" });
    },
  });

  const deleteCommentMutation = useMutation({
    mutationFn: async (commentId: string) => {
      return await apiRequest(`/api/selection-comments/${commentId}`, "DELETE");
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/selections", id, "comments"] });
    },
  });

  // Send-to-client: emails the portal link and stamps portalSentAt
  const [sendDialogOpen, setSendDialogOpen] = useState(false);
  const [sendTo, setSendTo] = useState("");
  const [sendMessage, setSendMessage] = useState("");

  const { data: clientContact } = useQuery<any>({
    queryKey: ["/api/contacts", (currentProject as any)?.clientId],
    enabled: sendDialogOpen && !!(currentProject as any)?.clientId,
  });

  useEffect(() => {
    if (sendDialogOpen && !sendTo && clientContact?.email) {
      setSendTo(clientContact.email);
    }
  }, [sendDialogOpen, clientContact?.email]);

  const sendPortalMutation = useMutation({
    mutationFn: async () =>
      await apiRequest(`/api/selections/${id}/send-portal`, "POST", {
        to: sendTo.trim(),
        message: sendMessage.trim() || undefined,
      }),
    onSuccess: () => {
      invalidateSelection();
      setSendDialogOpen(false);
      setSendMessage("");
      toast({ title: "Sent to client", description: `Portal link emailed to ${sendTo.trim()}.` });
    },
    onError: (err: any) => {
      const msg = err?.message?.replace(/^\d+:\s*/, "") ?? "Failed to send.";
      toast({ title: "Send failed", description: msg, variant: "destructive" });
    },
  });

  const handleCopyPortalLink = () => {
    if (!selection?.portalToken) return;
    const url = `${window.location.origin}/portal/selections/${selection.portalToken}`;
    navigator.clipboard.writeText(url).then(() => {
      setPortalLinkCopied(true);
      setTimeout(() => setPortalLinkCopied(false), 2000);
    });
  };

  const createOptionMutation = useMutation({
    mutationFn: async (option: InsertSelectionOption) => {
      return await apiRequest(`/api/selections/${id}/options`, "POST", option);
    },
    onSuccess: () => {
      invalidateSelection();
      setIsAddingOption(false);
      toast({
        title: "Option added",
        description: "The selection option has been added successfully.",
      });
    },
    onError: () => {
      toast({
        title: "Error",
        description: "Failed to add option. Please try again.",
        variant: "destructive",
      });
    },
  });

  const updateOptionMutation = useMutation({
    mutationFn: async ({ optionId, data }: { optionId: string; data: Partial<InsertSelectionOption> }) => {
      return await apiRequest(`/api/selection-options/${optionId}`, "PATCH", data);
    },
    onSuccess: () => {
      invalidateSelection();
      setEditingOption(null);
      toast({
        title: "Option updated",
        description: "The selection option has been updated successfully.",
      });
    },
    onError: (err: any) => {
      const msg = err?.message?.replace(/^\d+:\s*/, "") ?? "Failed to update option. Please try again.";
      toast({
        title: "Error",
        description: msg,
        variant: "destructive",
      });
    },
  });

  const deleteOptionMutation = useMutation({
    mutationFn: async (optionId: string) => {
      await apiRequest(`/api/selection-options/${optionId}`, "DELETE");
    },
    onSuccess: () => {
      invalidateSelection();
      toast({
        title: "Option deleted",
        description: "The selection option has been deleted successfully.",
      });
    },
    onError: () => {
      toast({
        title: "Error",
        description: "Failed to delete option. Please try again.",
        variant: "destructive",
      });
    },
  });

  const approveMutation = useMutation({
    mutationFn: async (optionId: string) => {
      return await apiRequest(`/api/selection-options/${optionId}/approve`, "PATCH");
    },
    onSuccess: () => {
      invalidateSelection();
      toast({ title: "Option approved", description: "The option has been approved and locked." });
    },
    onError: (err: any) => {
      toast({ title: "Error", description: err?.message ?? "Failed to approve option.", variant: "destructive" });
    },
  });

  const unapproveMutation = useMutation({
    mutationFn: async (optionId: string) => {
      return await apiRequest(`/api/selection-options/${optionId}/unapprove`, "PATCH");
    },
    onSuccess: () => {
      invalidateSelection();
      toast({ title: "Approval removed", description: "The option has been unlocked." });
    },
    onError: (err: any) => {
      toast({ title: "Error", description: err?.message ?? "Failed to unapprove option.", variant: "destructive" });
    },
  });

  const saveToLibraryMutation = useMutation({
    mutationFn: async (option: SelectionOption) => {
      const productName = option.name?.trim() || selection?.name?.trim() || "Unnamed Product";
      return await apiRequest("/api/products", "POST", {
        name: productName,
        brand: option.brand ?? null,
        sku: option.sku ?? null,
        description: option.description ?? null,
        defaultUnitCost: option.unitCost ?? null,
        unitType: option.unitType ?? "ea",
        url: option.url ?? null,
        isActive: true,
      });
    },
    onSuccess: (product: any, option) => {
      queryClient.invalidateQueries({ queryKey: ["/api/products"] });
      const displayName = option.name?.trim() || selection?.name?.trim() || "Product";
      toast({ title: "Saved to Product Library", description: `"${displayName}" is now in your library.` });
    },
    onError: (err: any) => {
      toast({ title: "Failed to save", description: err?.message ?? "Could not save to Product Library.", variant: "destructive" });
    },
  });

  const { data: editingOptionAttachments, refetch: refetchAttachments } = useQuery<OptionAttachment[]>({
    queryKey: ["/api/selection-options", editingOption?.id, "attachments"],
    queryFn: async () => {
      if (!editingOption?.id) return [];
      const res = await fetch(`/api/selection-options/${editingOption.id}/attachments`);
      return res.json();
    },
    enabled: !!editingOption?.id,
  });

  const deleteAttachmentMutation = useMutation({
    mutationFn: async (attachmentId: string) => {
      await apiRequest(`/api/selection-option-attachments/${attachmentId}`, "DELETE");
    },
    onSuccess: () => refetchAttachments(),
  });

  const handleImageUpload = async (file: File) => {
    if (!editingOption?.id) return;
    setUploadingImage(true);
    const optionId = editingOption.id;
    const reader = new FileReader();
    reader.onerror = () => {
      setUploadingImage(false);
      toast({ title: "Could not read file", variant: "destructive" });
    };
    reader.onload = async (e) => {
      try {
        const fileData = e.target?.result as string;
        await apiRequest(`/api/selection-options/${optionId}/attachments`, "POST", {
          fileData,
          fileName: file.name,
          fileType: "image",
          mimeType: file.type,
          fileSize: file.size,
        });
        refetchAttachments();
        invalidateSelection();
      } catch {
        toast({ title: "Upload failed", variant: "destructive" });
      } finally {
        setUploadingImage(false);
      }
    };
    reader.readAsDataURL(file);
  };

  const handleDocUpload = async (file: File) => {
    if (!editingOption?.id) return;
    setUploadingDoc(true);
    const optionId = editingOption.id;
    const reader = new FileReader();
    reader.onerror = () => {
      setUploadingDoc(false);
      toast({ title: "Could not read file", variant: "destructive" });
    };
    reader.onload = async (e) => {
      try {
        const fileData = e.target?.result as string;
        await apiRequest(`/api/selection-options/${optionId}/attachments`, "POST", {
          fileData,
          fileName: file.name,
          fileType: "document",
          mimeType: file.type || "application/octet-stream",
          fileSize: file.size,
        });
        refetchAttachments();
        invalidateSelection();
      } catch {
        toast({ title: "Upload failed", variant: "destructive" });
      } finally {
        setUploadingDoc(false);
      }
    };
    reader.readAsDataURL(file);
  };

  const markReceivedMutation = useMutation({
    mutationFn: async () => {
      return await apiRequest(`/api/selections/${id}/mark-received`, "PATCH");
    },
    onSuccess: () => {
      invalidateSelection();
      toast({ title: "Marked as received", description: "This selection has been marked as received." });
    },
    onError: (err: any) => {
      toast({ title: "Error", description: err?.message ?? "Failed to mark as received.", variant: "destructive" });
    },
  });

  const [pendingImages, setPendingImages] = useState<Array<{ file: File; previewUrl: string }>>([]);
  const pendingImageInputRef = useRef<HTMLInputElement>(null);
  const [pendingDocs, setPendingDocs] = useState<Array<{ file: File }>>([]);
  const pendingDocInputRef = useRef<HTMLInputElement>(null);
  const docInputRef = useRef<HTMLInputElement>(null);
  const [uploadingDoc, setUploadingDoc] = useState(false);

  // Capture ergonomics: product-library picker + paste-a-URL import
  const [productLibraryOpen, setProductLibraryOpen] = useState(false);
  const [productSearch, setProductSearch] = useState("");
  const [urlImportOpen, setUrlImportOpen] = useState(false);
  const [importUrl, setImportUrl] = useState("");
  // Scraped image URLs staged on the add form; downloaded server-side on save
  const [pendingRemoteImages, setPendingRemoteImages] = useState<string[]>([]);

  const { data: libraryProducts = [] } = useQuery<any[]>({
    queryKey: ["/api/products"],
    enabled: productLibraryOpen,
  });

  const addFromLibraryMutation = useMutation({
    mutationFn: async (productId: number) =>
      await apiRequest(`/api/selections/${id}/options/from-product`, "POST", { productId }),
    onSuccess: (newOption: any) => {
      invalidateSelection();
      setProductLibraryOpen(false);
      toast({
        title: "Added from library",
        description: "Adjust quantity and markup if needed.",
      });
      if (newOption?.id) handleEditOption({ ...newOption, attachments: newOption.attachments ?? [] } as SelectionOption);
    },
    onError: (err: any) => {
      toast({ title: "Error", description: err?.message ?? "Failed to add from library.", variant: "destructive" });
    },
  });

  const scrapeUrlMutation = useMutation({
    mutationFn: async (url: string) =>
      await apiRequest(`/api/products/scrape-url`, "POST", { url }),
    onSuccess: (scraped: any) => {
      setUrlImportOpen(false);
      setImportUrl("");
      // Open a fresh add form pre-filled with everything we could extract.
      // AU retail pages list inc-GST prices, hence gstInclusive.
      setPrefillValues({
        name: scraped?.name ?? "",
        brand: scraped?.brand ?? "",
        sku: scraped?.sku ?? "",
        description: scraped?.description ?? "",
        url: scraped?.url ?? "",
        ...(scraped?.priceCents ? { unitCost: scraped.priceCents, gstInclusive: true } : {}),
      });
      setPrefillSpecifications(null);
      setIsAddingOption(true);
      setEditingOption(null);
      setPendingRemoteImages(Array.isArray(scraped?.images) ? scraped.images : []);
      toast({
        title: "Product imported",
        description: "Review the details, then save.",
      });
    },
    onError: (err: any) => {
      const msg = err?.message?.replace(/^\d+:\s*/, "") ?? "Could not read that page.";
      toast({ title: "Import failed", description: msg, variant: "destructive" });
    },
  });

  const handleDialogChange = (open: boolean) => {
    if (!open) {
      setIsAddingOption(false);
      setEditingOption(null);
      setPrefillValues(null);
      setPrefillSpecifications(null);
      // Staged media is this page's, not the dialog's — the dialog has no way
      // to know an object URL still needs revoking.
      setPendingDocs([]);
      setPendingRemoteImages([]);
      setPendingImages((prev) => {
        prev.forEach((p) => URL.revokeObjectURL(p.previewUrl));
        return [];
      });
    }
  };

  const uploadImageToOption = async (optionId: string, file: File) => {
    const reader = new FileReader();
    return new Promise<void>((resolve, reject) => {
      reader.onerror = () => reject(new Error("Could not read file"));
      reader.onload = async (e) => {
        try {
          await apiRequest(`/api/selection-options/${optionId}/attachments`, "POST", {
            fileData: e.target?.result as string,
            fileName: file.name,
            fileType: "image",
            mimeType: file.type,
            fileSize: file.size,
          });
          resolve();
        } catch (err) {
          reject(err);
        }
      };
      reader.readAsDataURL(file);
    });
  };

  const uploadDocumentToOption = async (optionId: string, file: File) => {
    const reader = new FileReader();
    return new Promise<void>((resolve, reject) => {
      reader.onerror = () => reject(new Error("Could not read file"));
      reader.onload = async (e) => {
        try {
          await apiRequest(`/api/selection-options/${optionId}/attachments`, "POST", {
            fileData: e.target?.result as string,
            fileName: file.name,
            fileType: "document",
            mimeType: file.type || "application/octet-stream",
            fileSize: file.size,
          });
          resolve();
        } catch (err) {
          reject(err);
        }
      };
      reader.readAsDataURL(file);
    });
  };

  // Shared sink for pasted/dropped image files: uploads immediately when
  // editing an existing option, stages for post-create upload otherwise.
  const stageOrUploadImageFiles = (files: File[]) => {
    const images = files.filter((f) => f.type.startsWith("image/"));
    if (images.length === 0) return;
    if (editingOption?.id) {
      images.forEach((f) => handleImageUpload(f));
    } else {
      setPendingImages((prev) => [
        ...prev,
        ...images.map((file) => ({ file, previewUrl: URL.createObjectURL(file) })),
      ]);
    }
  };

  const handleSaveNotes = (value: string) => {
    if (noteSaveRef.current) clearTimeout(noteSaveRef.current);
    noteSaveRef.current = setTimeout(() => {
      apiRequest(`/api/selections/${id}`, "PATCH", { notes: value }).then(() => {
        invalidateSelection();
      });
    }, 600);
  };

  const onOptionSubmit = async (
    values: OptionDialogValues,
    specifications: Record<string, any> | null,
  ) => {
    const dataWithSpecs = { ...values, specifications } as unknown as InsertSelectionOption;
    if (editingOption) {
      updateOptionMutation.mutate({ optionId: editingOption.id, data: dataWithSpecs as InsertSelectionOption });
    } else {
      try {
        const newOption = await createOptionMutation.mutateAsync({
          ...dataWithSpecs,
          selectionId: id || "",
        } as InsertSelectionOption);
        if (pendingImages.length > 0 && newOption?.id) {
          setUploadingImage(true);
          try {
            for (const { file } of pendingImages) {
              await uploadImageToOption(newOption.id, file);
            }
            invalidateSelection();
          } finally {
            setUploadingImage(false);
          }
        }
        if (pendingRemoteImages.length > 0 && newOption?.id) {
          setUploadingImage(true);
          try {
            const result: any = await apiRequest(
              `/api/selection-options/${newOption.id}/attachments-from-url`,
              "POST",
              { urls: pendingRemoteImages },
            );
            if (result?.failed?.length) {
              toast({
                title: "Some images couldn't be imported",
                description: `${result.failed.length} image${result.failed.length === 1 ? "" : "s"} failed to download.`,
              });
            }
            invalidateSelection();
          } catch {
            toast({ title: "Image import failed", description: "The product was saved without its images.", variant: "destructive" });
          } finally {
            setUploadingImage(false);
          }
        }
        if (pendingDocs.length > 0 && newOption?.id) {
          setUploadingDoc(true);
          try {
            for (const { file } of pendingDocs) {
              await uploadDocumentToOption(newOption.id, file);
            }
            invalidateSelection();
          } finally {
            setUploadingDoc(false);
          }
        }
        setPendingImages((prev) => {
          prev.forEach((p) => URL.revokeObjectURL(p.previewUrl));
          return [];
        });
        setPendingDocs([]);
        setPendingRemoteImages([]);
      } catch {
        // errors handled by mutation
      }
    }
  };

  const handleEditOption = (option: SelectionOption) => {
    // The dialog seeds its own form from initialValues now, so opening it is
    // the whole job. This used to reset the form and six pieces of display
    // state that were never page state — they belonged to the dialog.
    setEditingOption(option);
  };

  const handleViewOption = (option: SelectionOption) => handleEditOption(option);

  const formatFileSize = (bytes: number): string => {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  };

  const handleAddOption = () => {
    setPrefillValues(null);
    setPrefillSpecifications(null);
    setIsAddingOption(true);
    setEditingOption(null);
  };

  // Once a decision exists, the chosen/approved option leads — the rest are
  // history and get muted in the card grid below. Searching now happens inside
  // OptionsSection, so this is ordering only.
  const orderedOptions = (selection?.options || []).slice().sort((a, b) => {
    const rank = (o: typeof a) => (o.approvedAt ? 0 : o.isSelectedByClient ? 1 : 2);
    return rank(a) - rank(b) || (a.sortOrder ?? 0) - (b.sortOrder ?? 0);
  });

  /**
   * selection_options row + its attachments -> the shape OptionsSection reads.
   * The hero is the first attachment, which is what both views used to dig out
   * for themselves.
   */
  const optionViews: OptionView[] = orderedOptions.map((o) => ({
    id: o.id,
    name: o.name,
    brand: o.brand,
    sku: o.sku,
    description: o.description,
    url: o.url,
    quantity: o.quantity,
    unitType: o.unitType,
    unitCost: o.unitCost,
    totalCost: o.totalCost,
    markupPercent: o.markupPercent,
    visibleToClient: o.visibleToClient,
    isSelectedByClient: o.isSelectedByClient,
    approvedAt: o.approvedAt as any,
    approvedBy: o.approvedBy,
    lockedAt: o.lockedAt as any,
    heroUrl: o.attachments?.[0]?.filePath ?? null,
  }));

  /** OptionsSection hands back an OptionView; the handlers want the real row. */
  const rowOf = (v: OptionView) => orderedOptions.find((o) => o.id === v.id)!;
  const hasDecision = (selection?.options || []).some((o) => o.isSelectedByClient || o.approvedAt);

  // A withheld stub arrives without description/deadline/allowance/flags, so
  // the form's values for those are empty defaults, not the stored data.
  // Saving would overwrite the real values with blanks. Refuse at the source.
  const isWithheldStub = () => (selection as any)?.restricted === true;

  const handleSaveSelection = () => {
    if (isWithheldStub()) return;
    const data = selectionForm.getValues();
    updateSelectionMutation.mutate(data);
  };

  const handleSaveDetails = () => {
    if (isWithheldStub()) return;
    const data = selectionForm.getValues();
    updateSelectionMutation.mutate(data, {
      onSuccess: () => setIsEditingDetails(false),
    });
  };

  const handleCancelEditDetails = () => {
    if (selection) {
      selectionForm.reset({
        projectId: selection.projectId,
        name: selection.name,
        description: selection.description || "",
        category: selection.category || "",
        room: selection.room || "",
        selectionType: selection.selectionType || "selection",
        status: selection.status,
        deadline: selection.deadline || undefined,
        allowance: selection.allowance || undefined,
        clientCanChange: selection.clientCanChange,
        clientCanSeePrice: selection.clientCanSeePrice,
        clientCanAddOption: (selection as any).clientCanAddOption ?? false,
      });
    }
    setHasUnsavedChanges(false);
    setIsEditingDetails(false);
  };


  const goBack = () => {
    if (effectiveProjectId) {
      setLocation(`/projects/${effectiveProjectId}/selections`);
    } else {
      setLocation("/selections");
    }
  };

  // Approval follows the permission system rather than admin-ness, so any role
  // granted projects.selections:approve — including a client — can approve.
  // NOTE: must be called before the early returns below — as a hook, calling
  // it after them crashed the page on any cold/direct load ("Rendered more
  // hooks than during the previous render").
  const canApproveSelections = usePermission("projects.selections", "approve");

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-full">
        <Loader2 className="w-8 h-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!selection) {
    return (
      <div className="p-6">
        <div className="text-center text-muted-foreground">
          <Package className="w-12 h-12 mx-auto mb-4 opacity-50" />
          <p>Selection not found.</p>
          <Button 
            variant="outline" 
            onClick={goBack}
            className="mt-4"
          >
            <ChevronLeft className="w-4 h-4 mr-2" />
            Back to Selections
          </Button>
        </div>
      </div>
    );
  }

  // Withheld by permission: the server sent a name-only stub with `options: []`
  // because this viewer lacks `projects.selections.pending`. See
  // server/selectionVisibility.ts. Every photo hangs off an option, so the page
  // has nothing to show — it must explain that rather than offer an empty
  // "add your first product" state for options that already exist.
  const restricted = isRestricted(selection as any);

  const currentStatus = getStatusInfo(selection.status);
  const StatusIcon = currentStatus.icon;

  // Calculate selected price from options (ensure we have valid numbers)
  const selectedOption = selection.options?.find(opt => opt.isSelectedByClient);
  const selectedPrice = selectedOption
    ? (selectedOption.totalCost != null
        ? selectedOption.totalCost
        : selectedOption.unitCost != null
          ? Math.round(selectedOption.unitCost * (selectedOption.quantity || 1) * (1 + (selectedOption.markupPercent || 0) / 100))
          : 0)
    : 0;
  const allowanceAmount = Number(selection.allowance) || 0;

  const isAdminUser = !!user?.isAdminLike;
  const isOverAllowance = allowanceAmount > 0 && selectedPrice > allowanceAmount;
  const linkedAllowanceName = selection.estimateItemId
    ? (projectAllowances.find((a: any) => a.id === selection.estimateItemId)?.name ?? "Linked allowance")
    : null;

  /**
   * The dialog's right-hand column. It stays on this page because how an image
   * is stored is the one thing the two hosts genuinely do not share: here an
   * image is a multipart upload into option_attachments, and on a CREATE it has
   * to be staged until the option has an id to hang off.
   */
  const optionMediaPane = (
    <>
              {/* Images (drop zone: drag files from Finder/browser or paste) */}
              <div
                className="space-y-2"
                onDragOver={(e) => {
                  if (e.dataTransfer.types.includes("Files")) e.preventDefault();
                }}
                onDrop={(e) => {
                  const files = Array.from(e.dataTransfer?.files ?? []).filter((f) => f.type.startsWith("image/"));
                  if (files.length > 0) {
                    e.preventDefault();
                    stageOrUploadImageFiles(files);
                  }
                }}
              >
                <div className="flex items-center justify-between">
                  <span className="text-sm font-medium">Images</span>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="h-7 text-xs"
                    disabled={uploadingImage}
                    onClick={() => editingOption ? imageInputRef.current?.click() : pendingImageInputRef.current?.click()}
                  >
                    {uploadingImage ? (
                      <Loader2 className="w-3 h-3 mr-1 animate-spin" />
                    ) : (
                      <Upload className="w-3 h-3 mr-1" />
                    )}
                    Add image
                  </Button>
                  <input
                    ref={imageInputRef}
                    type="file"
                    accept="image/*"
                    className="hidden"
                    onChange={(e) => {
                      const file = e.target.files?.[0];
                      if (file) handleImageUpload(file);
                      e.target.value = "";
                    }}
                  />
                  <input
                    ref={pendingImageInputRef}
                    type="file"
                    accept="image/*"
                    className="hidden"
                    onChange={(e) => {
                      const file = e.target.files?.[0];
                      if (file) {
                        setPendingImages((prev) => [
                          ...prev,
                          { file, previewUrl: URL.createObjectURL(file) },
                        ]);
                      }
                      e.target.value = "";
                    }}
                  />
                </div>

                {editingOption ? (() => {
                  const imageAtts = (editingOptionAttachments || []).filter(a => a.fileType === "image");
                  return imageAtts.length > 0 ? (
                    <SortableImageGrid
                      attachments={imageAtts}
                      selectionId={id ?? ""}
                      onReorder={(newOrder) => {
                        newOrder.forEach((att, idx) => {
                          apiRequest(`/api/selection-option-attachments/${att.id}`, "PATCH", { sortOrder: idx });
                        });
                        queryClient.invalidateQueries({ queryKey: ["/api/selections", id] });
                      }}
                      onDelete={(attId) => deleteAttachmentMutation.mutate(attId)}
                    />
                  ) : (
                    <div className="border border-dashed rounded-md p-4 text-center text-muted-foreground text-xs">
                      <ImageIcon className="w-6 h-6 mx-auto mb-1 opacity-40" />
                      No images yet
                    </div>
                  );
                })() : (pendingImages.length > 0 || pendingRemoteImages.length > 0) ? (
                  <div className="grid grid-cols-3 gap-2">
                    {pendingRemoteImages.map((src, idx) => (
                      <div key={`remote-${idx}`} className="relative aspect-square rounded-md overflow-hidden border border-border">
                        <img src={src} alt="Imported product image" className="w-full h-full object-cover" />
                        <button
                          type="button"
                          onClick={() => setPendingRemoteImages((prev) => prev.filter((_, i) => i !== idx))}
                          className="absolute top-1 right-1 w-5 h-5 rounded-full bg-black/60 flex items-center justify-center text-white hover:bg-black/80"
                        >
                          <X className="w-3 h-3" />
                        </button>
                      </div>
                    ))}
                    {pendingImages.map((p, idx) => (
                      <div key={idx} className="relative aspect-square rounded-md overflow-hidden border border-border">
                        <img src={p.previewUrl} alt={p.file.name} className="w-full h-full object-cover" />
                        <button
                          type="button"
                          onClick={() => {
                            URL.revokeObjectURL(p.previewUrl);
                            setPendingImages((prev) => prev.filter((_, i) => i !== idx));
                          }}
                          className="absolute top-1 right-1 w-5 h-5 rounded-full bg-black/60 flex items-center justify-center text-white hover:bg-black/80"
                        >
                          <X className="w-3 h-3" />
                        </button>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="border border-dashed rounded-md p-4 text-center text-muted-foreground text-xs">
                    <ImageIcon className="w-6 h-6 mx-auto mb-1 opacity-40" />
                    No images yet — add, paste, or drag them here; they'll be uploaded when you save
                  </div>
                )}
              </div>

              <Separator />

              {/* Documents & Attachments */}
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-sm font-medium">Documents & Specs</span>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="h-7 text-xs"
                    disabled={uploadingDoc}
                    onClick={() => editingOption ? docInputRef.current?.click() : pendingDocInputRef.current?.click()}
                  >
                    {uploadingDoc ? (
                      <Loader2 className="w-3 h-3 mr-1 animate-spin" />
                    ) : (
                      <Upload className="w-3 h-3 mr-1" />
                    )}
                    Add file
                  </Button>
                  <input
                    ref={docInputRef}
                    type="file"
                    className="hidden"
                    onChange={(e) => {
                      const file = e.target.files?.[0];
                      if (file) handleDocUpload(file);
                      e.target.value = "";
                    }}
                  />
                  <input
                    ref={pendingDocInputRef}
                    type="file"
                    className="hidden"
                    onChange={(e) => {
                      const file = e.target.files?.[0];
                      if (file) setPendingDocs((prev) => [...prev, { file }]);
                      e.target.value = "";
                    }}
                  />
                </div>

                {editingOption ? (() => {
                  const docAtts = (editingOptionAttachments || []).filter(a => a.fileType !== "image");
                  return docAtts.length > 0 ? (
                    <div className="space-y-1">
                      {docAtts.map((att) => (
                        <div key={att.id} className="flex items-center gap-2 p-2 rounded-md border border-border bg-muted/20">
                          <FileText className="w-4 h-4 text-muted-foreground flex-shrink-0" />
                          <a
                            href={att.filePath}
                            target="_blank"
                            rel="noopener noreferrer"
                            onClick={(e) => e.stopPropagation()}
                            className="flex-1 text-sm truncate hover:underline text-primary"
                          >
                            {att.fileName}
                          </a>
                          {att.fileSize && (
                            <span className="text-xs text-muted-foreground flex-shrink-0">{formatFileSize(att.fileSize)}</span>
                          )}
                          <button
                            type="button"
                            onClick={() => deleteAttachmentMutation.mutate(att.id)}
                            className="h-5 w-5 flex-shrink-0 flex items-center justify-center rounded hover:text-destructive text-muted-foreground"
                          >
                            <X className="w-3 h-3" />
                          </button>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div className="border border-dashed rounded-md p-3 text-center text-muted-foreground text-xs">
                      <FileIcon className="w-5 h-5 mx-auto mb-1 opacity-40" />
                      No files attached
                    </div>
                  );
                })() : pendingDocs.length > 0 ? (
                  <div className="space-y-1">
                    {pendingDocs.map((p, idx) => (
                      <div key={idx} className="flex items-center gap-2 p-2 rounded-md border border-border bg-muted/20">
                        <FileText className="w-4 h-4 text-muted-foreground flex-shrink-0" />
                        <span className="flex-1 text-sm truncate">{p.file.name}</span>
                        <span className="text-xs text-muted-foreground flex-shrink-0">{formatFileSize(p.file.size)}</span>
                        <button
                          type="button"
                          onClick={() => setPendingDocs((prev) => prev.filter((_, i) => i !== idx))}
                          className="h-5 w-5 flex-shrink-0 flex items-center justify-center rounded hover:text-destructive text-muted-foreground"
                        >
                          <X className="w-3 h-3" />
                        </button>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="border border-dashed rounded-md p-3 text-center text-muted-foreground text-xs">
                    <FileIcon className="w-5 h-5 mx-auto mb-1 opacity-40" />
                    No files attached — they'll be uploaded when you save
                  </div>
                )}
              </div>
    </>
  );

  return (
    <div className="flex flex-col h-full">
      {/* Main Content Area */}
      <div className="flex-1 overflow-y-auto">
        <div className="p-4 space-y-6">


          {/* Breadcrumb + title row. The project header and section tabs come
              from the project shell, so this page only owns its own crumb. */}
          <div>
            {/* The project shell already renders one crumb row
                (Project · Selections), so Back sits inline with the title
                rather than adding a second row */}
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0 flex items-center gap-2">
                <button
                  onClick={goBack}
                  className="h-7 w-7 -ml-1 rounded-md hover-elevate active-elevate-2 flex items-center justify-center text-muted-foreground hover:text-foreground shrink-0"
                  data-testid="button-back"
                  aria-label="Back to Selections"
                >
                  <ChevronLeft className="w-4 h-4" />
                </button>
                <h2 className="text-2xl font-bold leading-tight truncate">{selection.name}</h2>
              </div>
      <div className="flex items-center gap-2">
        {hasUnsavedChanges && !isEditingDetails && (
          <Button
            size="sm"
            onClick={handleSaveSelection}
            disabled={updateSelectionMutation.isPending}
            data-testid="button-save-selection"
          >
            {updateSelectionMutation.isPending ? (
              <Loader2 className="w-3.5 h-3.5 mr-1 animate-spin" />
            ) : (
              <Save className="w-3.5 h-3.5 mr-1" />
            )}
            Save
          </Button>
        )}
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="icon" className="h-7 w-7" data-testid="button-selection-menu">
              <MoreVertical className="w-4 h-4" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            {/* Every item here is unsafe against a withheld stub: the edit form
                is populated from fields the server did not send, so saving it
                would blank the description, deadline and allowance and store
                the synthetic "awaiting_approval" status; the portal link, QR
                and PDF all need a portalToken that was stripped. */}
            {restricted ? (
              <DropdownMenuItem disabled>
                <Lock className="w-4 h-4 mr-2" />
                Hidden — no permission
              </DropdownMenuItem>
            ) : (
              <>
                <DropdownMenuItem onClick={() => setIsEditingDetails(true)}>
                  <Settings className="w-4 h-4 mr-2" />
                  Edit Details
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => setSendDialogOpen(true)} data-testid="menu-send-to-client">
                  <Send className="w-4 h-4 mr-2" />
                  Send to Client
                </DropdownMenuItem>
                <DropdownMenuItem onClick={handleCopyPortalLink}>
                  <LinkIcon className="w-4 h-4 mr-2" />
                  {portalLinkCopied ? "Link copied!" : "Copy Portal Link"}
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => setShowQrModal(true)}>
                  <QrCode className="w-4 h-4 mr-2" />
                  Show QR Code
                </DropdownMenuItem>
                <DropdownMenuItem
                  onSelect={(e) => e.preventDefault()}
                  disabled={isExportingPdf}
                  onClick={() => exportPdf(`/api/selections/${id}/pdf`, "selection.pdf")}
                >
                  {isExportingPdf ? (
                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  ) : (
                    <Package className="w-4 h-4 mr-2" />
                  )}
                  {isExportingPdf ? "Exporting…" : "Export PDF"}
                </DropdownMenuItem>
              </>
            )}
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
            </div>
          </div>


          {/* Selection Details — summary strip OR inline edit form */}
          <div className="surface-panel p-3" data-testid="selection-details-block">
            {!isEditingDetails ? (
              <>
              <div className="flex items-start gap-4">
              {/* Left: the selection's own details */}
              <div className="flex-1 min-w-0 flex items-center gap-6 flex-wrap">
                {/* Status */}
                <div>
                  <div className="text-data text-muted-foreground uppercase tracking-wide mb-1">Status</div>
                  {restricted ? <RestrictedPill /> : <SelectionStatusPill derived={getDerivedStatus(selection as any)} />}
                </div>

                {/* Category */}
                <div>
                  <div className="text-data text-muted-foreground uppercase tracking-wide mb-1">Category</div>
                  <div className="text-sm font-medium">{selection.category || "—"}</div>
                </div>
                
                {/* Location */}
                <div>
                  <div className="text-data text-muted-foreground uppercase tracking-wide mb-1">Location</div>
                  <div className="text-sm font-medium flex items-center gap-1">
                    <MapPin className="w-3 h-3 text-muted-foreground" />
                    {selection.room || "—"}
                  </div>
                </div>
                
                {/* Deadline — irrelevant once the client has decided */}
                {!isDecided(getDerivedStatus(selection as any)) && (
                  <div>
                    <div className="text-data text-muted-foreground uppercase tracking-wide mb-1">Deadline</div>
                    <div className="text-sm font-medium flex items-center gap-1">
                      <CalendarIcon className="w-3 h-3 text-muted-foreground" />
                      {selection.deadline ? format(new Date(selection.deadline), "dd/MM/yyyy") : "—"}
                    </div>
                  </div>
                )}

                {/* Description */}
                {selection.description && (
                  <div className="w-full mt-2">
                    <div className="text-data text-muted-foreground uppercase tracking-wide mb-1">Description</div>
                    <div className="text-sm text-foreground">{selection.description}</div>
                  </div>
                )}

                {/* Linked allowance */}
                {selection.estimateItemId && (
                  <div>
                    <div className="text-data text-muted-foreground uppercase tracking-wide mb-1">Allowance</div>
                    <a
                      href={`/projects/${effectiveProjectId}/allowances/${selection.estimateItemId}`}
                      className="text-sm font-medium flex items-center gap-1 text-primary hover:underline"
                      data-testid="link-selection-allowance"
                    >
                      <Link2 className="w-3 h-3" />
                      {linkedAllowanceName ?? "Linked allowance"}
                    </a>
                  </div>
                )}
                
              </div>

              {/* Right column: the money, divided off and read vertically */}
              <div className="shrink-0 self-stretch border-l border-border/70 pl-5 pr-1">
                {/* Pricing Section */}
                <Popover open={pricingPopoverOpen} onOpenChange={(open) => {
                  setPricingPopoverOpen(open);
                  if (open) {
                    setEditingAllowance((allowanceAmount / 100).toFixed(2));
                    setEditingAllowanceItemId(selection.estimateItemId ?? "");
                  }
                }}>
                  <PopoverTrigger asChild>
                    <button 
                      type="button"
                      className="text-left hover-elevate rounded-md p-2 -m-2 transition-colors cursor-pointer"
                      data-testid="button-edit-pricing"
                    >
                      <div className="space-y-2.5 whitespace-nowrap min-w-[150px]">
                        {/* Label above value, matching the detail cells */}
                        <div>
                          <div className="text-data text-muted-foreground uppercase tracking-wide mb-0.5">Allowance</div>
                          <div className="text-sm font-semibold tabular-nums">
                            {allowanceAmount > 0 ? formatCents(allowanceAmount) : "—"}
                          </div>
                        </div>
                        <div>
                          <div className="text-data text-muted-foreground uppercase tracking-wide mb-0.5">Selected</div>
                          <div className="text-sm font-semibold tabular-nums text-primary">
                            {selectedPrice > 0 ? formatCents(selectedPrice) : "—"}
                          </div>
                        </div>
                        {/* Nothing to compare against without an allowance —
                            showing a "difference" there reads as overspend */}
                        {allowanceAmount > 0 && (
                          <div className="pt-2 border-t border-border/70">
                            <div className="text-data text-muted-foreground uppercase tracking-wide mb-0.5">Difference</div>
                            {(() => {
                              const difference = selectedPrice - allowanceAmount;
                              const isOver = difference > 0;
                              const isUnder = difference < 0;
                              return (
                                <div className={cn(
                                  "text-sm font-semibold tabular-nums",
                                  isOver && "text-status-danger",
                                  isUnder && "text-status-success",
                                  !isOver && !isUnder && "text-muted-foreground",
                                )}>
                                  {isOver && "+"}{formatCents(Math.abs(difference))}
                                </div>
                              );
                            })()}
                          </div>
                        )}
                      </div>
                      {/* Allowance progress bar */}
                      {allowanceAmount > 0 && (
                        <div className="mt-2 space-y-0.5">
                          <div className="h-1.5 w-full bg-muted rounded-full overflow-hidden">
                            {(() => {
                              const pct = (selectedPrice / allowanceAmount) * 100;
                              const barPct = Math.min(pct, 100);
                              const barColor = pct <= 100 ? "bg-[hsl(var(--sage))]" : pct <= 110 ? "bg-[hsl(var(--amber))]" : "bg-[hsl(var(--coral))]";
                              return <div className={`h-full rounded-full transition-all ${barColor}`} style={{ width: `${barPct}%` }} />;
                            })()}
                          </div>
                          {(() => {
                            const pct = (selectedPrice / allowanceAmount) * 100;
                            const diff = selectedPrice - allowanceAmount;
                            const label = diff === 0 ? "On budget" : diff > 0 ? `$${(diff / 100).toFixed(0)} over` : `$${(Math.abs(diff) / 100).toFixed(0)} under`;
                            const labelColor = pct > 100 ? "text-[hsl(var(--coral))]" : pct > 90 ? "text-[hsl(var(--amber))]" : "text-[hsl(var(--sage))]";
                            return <div className={`text-[10px] font-medium text-right ${labelColor}`}>{label}</div>;
                          })()}
                        </div>
                      )}
                    </button>
                  </PopoverTrigger>
                  <PopoverContent align="end" className="w-64">
                    <div className="space-y-4">
                      <div className="text-sm font-semibold">Allowance</div>
                      <div>
                        <label className="text-xs text-muted-foreground uppercase tracking-wide">Linked to</label>
                        <Select
                          value={editingAllowanceItemId || "none"}
                          onValueChange={(v) => {
                            const id = v === "none" ? "" : v;
                            setEditingAllowanceItemId(id);
                            // Adopt the allowance's budget so the two agree
                            const picked = projectAllowances.find((a: any) => a.id === id);
                            if (picked) {
                              // This endpoint recomputes and returns priceIncTax
                              // already in CENTS (it deliberately doesn't trust
                              // the dollars cache on estimate_items)
                              const cents = Number(picked.priceIncTax ?? 0);
                              setEditingAllowance((cents / 100).toFixed(2));
                            }
                          }}
                        >
                          <SelectTrigger className="mt-1 h-9 text-sm" data-testid="select-allowance-link">
                            <SelectValue placeholder="Not linked — manual amount" />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="none">Not linked — manual amount</SelectItem>
                            {projectAllowances.map((a: any) => (
                              <SelectItem key={a.id} value={a.id}>
                                {a.name}
                                {a.allowance ? ` · ${a.allowance === "Prime Cost" ? "PC" : "PS"}` : ""}
                                {a.priceIncTax != null ? ` · ${formatCents(Number(a.priceIncTax))}` : ""}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                        {projectAllowances.length === 0 && (
                          <p className="mt-1 text-[11px] text-muted-foreground">
                            No PC/PS allowances on this project's estimate yet.
                          </p>
                        )}
                      </div>
                      <div>
                        <label className="text-xs text-muted-foreground uppercase tracking-wide">Allowance Amount</label>
                        <div className="relative mt-1">
                          <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground text-sm">$</span>
                          <Input 
                            type="number"
                            step="0.01"
                            min="0"
                            className="pl-7"
                            value={editingAllowance}
                            onChange={(e) => setEditingAllowance(e.target.value)}
                            data-testid="input-edit-allowance"
                          />
                        </div>
                        {editingAllowanceItemId && (
                          <p className="mt-1 text-[11px] text-muted-foreground">
                            Prefilled from the linked allowance — edit to override.
                          </p>
                        )}
                      </div>
                      <div className="flex justify-end gap-2">
                        <Button 
                          variant="outline" 
                          size="sm"
                          onClick={() => setPricingPopoverOpen(false)}
                        >
                          Cancel
                        </Button>
                        <Button 
                          size="sm"
                          onClick={() => {
                            const parsed = parseFloat(editingAllowance);
                            const newAllowance = isNaN(parsed) ? allowanceAmount : Math.round(parsed * 100);
                            selectionForm.setValue("allowance", newAllowance);
                            selectionForm.setValue("estimateItemId", editingAllowanceItemId || null);
                            setHasUnsavedChanges(true);
                            setPricingPopoverOpen(false);
                            handleSaveSelection();
                            toast({
                              title: "Allowance updated",
                              description: "Changes saved successfully.",
                            });
                          }}
                          disabled={updateSelectionMutation.isPending}
                          data-testid="button-save-allowance"
                        >
                          {updateSelectionMutation.isPending ? "Saving..." : "Save"}
                        </Button>
                      </div>
                    </div>
                  </PopoverContent>
                </Popover>

              </div>
              </div>

              </>
            ) : (
              <Form {...selectionForm}>
                <form className="space-y-3" onSubmit={(e) => e.preventDefault()}>
                  {/* Row 1: Name (wide), Category, Location */}
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                    <FormField
                      control={selectionForm.control}
                      name="name"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel className="text-data text-muted-foreground uppercase tracking-wide">Name</FormLabel>
                          <FormControl>
                            <Input 
                              placeholder="e.g., Kitchen Splashback Tiles"
                              className="h-9 text-sm shadow-none border-border"
                              {...field}
                              data-testid="input-selection-name"
                            />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                    <FormField
                      control={selectionForm.control}
                      name="category"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel className="text-data text-muted-foreground uppercase tracking-wide">Category</FormLabel>
                          <FormControl>
                            <CreatableFieldSelect
                              categoryKey="selection.category"
                              value={field.value || ""}
                              onValueChange={field.onChange}
                              placeholder="Select category"
                              data-testid="select-category"
                            />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                    <FormField
                      control={selectionForm.control}
                      name="room"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel className="text-data text-muted-foreground uppercase tracking-wide">Location</FormLabel>
                          <FormControl>
                            <CreatableFieldSelect
                              categoryKey="selection.room"
                              value={field.value || ""}
                              onValueChange={field.onChange}
                              placeholder="Select location"
                              data-testid="select-room"
                            />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                  </div>

                  {/* Row 2: Deadline, Status, Allowance */}
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                    <FormField
                      control={selectionForm.control}
                      name="deadline"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel className="text-data text-muted-foreground uppercase tracking-wide">Deadline</FormLabel>
                          <Popover>
                            <PopoverTrigger asChild>
                              <FormControl>
                                <Button
                                  variant="outline"
                                  className={cn(
                                    "w-full h-9 text-sm font-normal justify-start shadow-none",
                                    !field.value && "text-muted-foreground"
                                  )}
                                  data-testid="button-deadline"
                                >
                                  {field.value ? (
                                    format(new Date(field.value), "dd/MM/yyyy")
                                  ) : (
                                    <span>Select date</span>
                                  )}
                                  <CalendarIcon className="ml-auto h-3.5 w-3.5 opacity-50" />
                                </Button>
                              </FormControl>
                            </PopoverTrigger>
                            <PopoverContent className="w-auto p-0" align="start">
                              <Calendar
                                mode="single"
                                selected={field.value ? new Date(field.value) : undefined}
                                onSelect={field.onChange}
                                initialFocus
                              />
                            </PopoverContent>
                          </Popover>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                    <FormField
                      control={selectionForm.control}
                      name="status"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel className="text-data text-muted-foreground uppercase tracking-wide">Status</FormLabel>
                          <Select onValueChange={(val) => { field.onChange(val); setHasUnsavedChanges(true); }} value={field.value || ""}>
                            <FormControl>
                              <SelectTrigger className="h-9 text-sm shadow-none border-border" data-testid="select-status">
                                <SelectValue placeholder="Select status" />
                              </SelectTrigger>
                            </FormControl>
                            <SelectContent>
                              {statusOptions.map((status) => (
                                <SelectItem key={status.key} value={status.key}>
                                  {status.name}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                    <FormField
                      control={selectionForm.control}
                      name="estimateItemId"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel className="text-data text-muted-foreground uppercase tracking-wide">Allowance</FormLabel>
                          <Select
                            value={field.value || "none"}
                            onValueChange={(v) => {
                              const id = v === "none" ? null : v;
                              field.onChange(id);
                              // The budget follows the linked estimate line;
                              // no link means no allowance at all
                              const picked = projectAllowances.find((a: any) => a.id === id);
                              selectionForm.setValue("allowance", picked ? Number(picked.priceIncTax ?? 0) : null);
                              setHasUnsavedChanges(true);
                            }}
                          >
                            <FormControl>
                              <SelectTrigger className="h-9 text-sm" data-testid="select-allowance-link-edit">
                                <SelectValue placeholder="No allowance" />
                              </SelectTrigger>
                            </FormControl>
                            <SelectContent>
                              <SelectItem value="none">No allowance</SelectItem>
                              {projectAllowances.map((a: any) => (
                                <SelectItem key={a.id} value={a.id}>
                                  {a.name}
                                  {a.allowance ? ` · ${a.allowance === "Prime Cost" ? "PC" : "PS"}` : ""}
                                  {a.priceIncTax != null ? ` · ${formatCents(Number(a.priceIncTax))}` : ""}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                  </div>

                  {/* Row 3: Description */}
                  <FormField
                    control={selectionForm.control}
                    name="description"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel className="text-data text-muted-foreground uppercase tracking-wide">Description</FormLabel>
                        <FormControl>
                          <Textarea 
                            placeholder="Add notes about this selection..."
                            rows={2}
                            className="text-sm"
                            {...field}
                            value={field.value || ""}
                            data-testid="input-selection-description"
                          />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  {/* Client permissions accordion */}
                  <Accordion type="multiple" defaultValue={["client"]} className="w-full">
                    <AccordionItem value="client" className="border rounded-md px-3">
                      <AccordionTrigger className="py-2 hover:no-underline" data-testid="accordion-client">
                        <div className="flex items-center gap-2">
                          <Users className="w-3.5 h-3.5 text-primary" />
                          <span className="text-sm font-medium">Client permissions</span>
                        </div>
                      </AccordionTrigger>
                      <AccordionContent className="pt-2 pb-3 space-y-2">
                        <FormField
                          control={selectionForm.control}
                          name="clientCanChange"
                          render={({ field }) => (
                            <FormItem className="flex flex-row items-center justify-between rounded-md border p-2 gap-3">
                              <div className="space-y-0.5">
                                <FormLabel className="text-sm">Allow Changes</FormLabel>
                                <FormDescription className="text-xs">
                                  Client can change their selection after choosing
                                </FormDescription>
                              </div>
                              <FormControl>
                                <Switch
                                  checked={field.value}
                                  onCheckedChange={(val) => { field.onChange(val); setHasUnsavedChanges(true); }}
                                  data-testid="switch-client-can-change"
                                />
                              </FormControl>
                            </FormItem>
                          )}
                        />
                        <FormField
                          control={selectionForm.control}
                          name="clientCanSeePrice"
                          render={({ field }) => (
                            <FormItem className="flex flex-row items-center justify-between rounded-md border p-2 gap-3">
                              <div className="space-y-0.5">
                                <FormLabel className="text-sm">Show Pricing</FormLabel>
                                <FormDescription className="text-xs">
                                  Client can see pricing information for options
                                </FormDescription>
                              </div>
                              <FormControl>
                                <Switch
                                  checked={field.value}
                                  onCheckedChange={(val) => { field.onChange(val); setHasUnsavedChanges(true); }}
                                  data-testid="switch-client-can-see-price"
                                />
                              </FormControl>
                            </FormItem>
                          )}
                        />
                        <FormField
                          control={selectionForm.control}
                          name="clientCanAddOption"
                          render={({ field }) => (
                            <FormItem className="flex flex-row items-center justify-between rounded-md border p-2 gap-3">
                              <div className="space-y-0.5">
                                <FormLabel className="text-sm">Allow Client Suggestions</FormLabel>
                                <FormDescription className="text-xs">
                                  Client can add their own option — a photo and a name, for your team to price up
                                </FormDescription>
                              </div>
                              <FormControl>
                                <Switch
                                  checked={field.value ?? false}
                                  onCheckedChange={(val) => { field.onChange(val); setHasUnsavedChanges(true); }}
                                  data-testid="switch-client-can-add-option"
                                />
                              </FormControl>
                            </FormItem>
                          )}
                        />
                      </AccordionContent>
                    </AccordionItem>
                  </Accordion>

                  {/* Save / Cancel footer */}
                  <div className="flex items-center justify-end gap-2 pt-1">
                    <Button
                      type="button"
                      size="sm"
                      variant="ghost"
                      className="h-7 px-2 text-xs"
                      onClick={handleCancelEditDetails}
                      data-testid="button-cancel-edit-details"
                    >
                      <X className="w-3 h-3 mr-1" />
                      Cancel
                    </Button>
                    <Button
                      type="button"
                      size="sm"
                      className="h-7 px-3 text-xs"
                      onClick={handleSaveDetails}
                      disabled={updateSelectionMutation.isPending}
                      data-testid="button-save-details"
                    >
                      {updateSelectionMutation.isPending ? (
                        <Loader2 className="w-3 h-3 mr-1 animate-spin" />
                      ) : (
                        <Save className="w-3 h-3 mr-1" />
                      )}
                      Save
                    </Button>
                  </div>
                </form>
              </Form>
            )}
          </div>

          {/* Options — the shared block, identical to the one on a selection
              template. What differs is what a project can DO to an option:
              approve, unapprove, lock, save to the library, and measure against
              the allowance. Those are passed in as render props rather than
              branched on inside the view. */}
          <OptionsSection
            options={optionViews}
            viewStorageKey="selection-options-view"
            allowanceCents={selection.allowance}
            hasDecision={hasDecision}
            chosenLabel="Client selected"
            onOpen={(v) => {
              const option = rowOf(v);
              if (option.lockedAt) handleViewOption(option); else handleEditOption(option);
            }}
            bodyOverride={restricted ? (
              /* Not "no options" — the options exist and were withheld. */
              <RestrictedNotice className="py-4" />
            ) : undefined}
            emptyAction={(
              <Button onClick={handleAddOption} data-testid="button-add-first-option">
                <Plus className="w-4 h-4 mr-2" />
                Add Product
              </Button>
            )}
            addControl={(
              /* Add option — withheld selections are read-only here */
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button size="sm" className={cn(restricted && "hidden")} data-testid="button-add-option">
                    <Plus className="w-3.5 h-3.5 mr-1" />
                    Add Product
                    <ChevronDown className="w-3 h-3 ml-1" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  <DropdownMenuItem onClick={handleAddOption} data-testid="menu-add-new-product">
                    <Plus className="h-3.5 w-3.5 mr-2" />
                    New product
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={() => { setProductSearch(""); setProductLibraryOpen(true); }} data-testid="menu-add-from-library">
                    <BookMarked className="h-3.5 w-3.5 mr-2" />
                    From product library
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={() => { setImportUrl(""); setUrlImportOpen(true); }} data-testid="menu-add-from-url">
                    <Link2 className="h-3.5 w-3.5 mr-2" />
                    Import from URL
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            )}
            renderPrimaryAction={(v) => {
              const option = rowOf(v);
              const isApproved = !!option.approvedAt;
              /* Approve, promoted out of the hover-only kebab. `approvedAt` is
                 what the server's visibility rules actually gate on
                 (server/selectionVisibility.ts), and the ONLY control in the
                 product that writes it used to be a menu item you had to hover
                 the right card to find.

                 Shown on the client's pick when there is one. When nothing has
                 been picked at all it shows on every option, because that is the
                 state almost every production selection is actually in — gating
                 purely on `isSelectedByClient` would leave the builder with no
                 visible way to approve anything. Once a decision exists, the
                 other cards fall back to the kebab. */
              if (!canApproveSelections || isApproved) return null;
              if (!option.isSelectedByClient && hasDecision) return null;
              return (
                <Button
                  size="sm"
                  className="mt-2 w-full h-7 text-xs"
                  onClick={(e) => { e.stopPropagation(); approveMutation.mutate(option.id); }}
                  disabled={approveMutation.isPending}
                  data-testid={`button-approve-option-${option.id}`}
                >
                  {approveMutation.isPending ? (
                    <Loader2 className="w-3.5 h-3.5 mr-1 animate-spin" />
                  ) : (
                    <CheckCircle className="w-3.5 h-3.5 mr-1" />
                  )}
                  Approve
                </Button>
              );
            }}
            renderMenu={(v, place) => {
              const option = rowOf(v);
              const isApproved = !!option.approvedAt;
              const isLocked = !!option.lockedAt;
              /* Was `isAdminUser` alone, which hid the whole menu — and with it
                 the only Approve control in the DEFAULT view — from a site
                 manager who actually holds `projects.selections:approve`. */
              if (!isAdminUser && !canApproveSelections) return null;
              return (
                <AlertDialog>
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button
                        size="icon"
                        variant="ghost"
                        className={cn(
                          "h-6 w-6",
                          // Over the hero image in the grid, so it needs a
                          // backdrop and only appears on card hover. In a table
                          // row there is no `group` ancestor to hover.
                          place === "grid" && "bg-background/80 backdrop-blur-sm opacity-0 group-hover:opacity-100 transition-opacity",
                        )}
                        onClick={(e) => e.stopPropagation()}
                        data-testid={`button-option-menu-${option.id}`}
                      >
                        <MoreVertical className="w-3.5 h-3.5" />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end" onClick={(e) => e.stopPropagation()}>
                      <DropdownMenuItem onClick={(e) => { e.stopPropagation(); handleViewOption(option); }}>
                        <Eye className="w-4 h-4 mr-2" />
                        View
                      </DropdownMenuItem>
                      {canApproveSelections && !isApproved && (
                        <DropdownMenuItem
                          onClick={(e) => { e.stopPropagation(); approveMutation.mutate(option.id); }}
                          disabled={approveMutation.isPending}
                        >
                          <CheckCircle className="w-4 h-4 mr-2" />
                          Approve
                        </DropdownMenuItem>
                      )}
                      {isAdminUser && !isLocked && (
                        <DropdownMenuItem onClick={(e) => { e.stopPropagation(); handleEditOption(option); }}>
                          <Edit3 className="w-4 h-4 mr-2" />
                          Edit
                        </DropdownMenuItem>
                      )}
                      {canApproveSelections && isApproved && (
                        <AlertDialogTrigger asChild>
                          <DropdownMenuItem onSelect={(e) => e.preventDefault()} onClick={(e) => e.stopPropagation()}>
                            <XCircle className="w-4 h-4 mr-2" />
                            Remove approval
                          </DropdownMenuItem>
                        </AlertDialogTrigger>
                      )}
                      {/* Editing the catalogue and deleting an option are not
                          approval rights — they stay on isAdminUser. */}
                      {isAdminUser && (
                        <>
                          <DropdownMenuItem
                            onClick={(e) => { e.stopPropagation(); saveToLibraryMutation.mutate(option); }}
                            disabled={saveToLibraryMutation.isPending}
                          >
                            <BookMarked className="w-4 h-4 mr-2" />
                            Save to Product Library
                          </DropdownMenuItem>
                          <DropdownMenuItem
                            onClick={(e) => { e.stopPropagation(); if (!isLocked) deleteOptionMutation.mutate(option.id); }}
                            className="text-destructive"
                            disabled={isLocked}
                          >
                            <Trash2 className="w-4 h-4 mr-2" />
                            Delete
                          </DropdownMenuItem>
                        </>
                      )}
                    </DropdownMenuContent>
                  </DropdownMenu>
                  <AlertDialogContent onClick={(e) => e.stopPropagation()}>
                    <AlertDialogHeader>
                      <AlertDialogTitle>Remove approval?</AlertDialogTitle>
                      <AlertDialogDescription>
                        This will unlock <span className="font-medium text-foreground">{option.name}</span> and revert the selection status to submitted.
                      </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                      <AlertDialogCancel>Cancel</AlertDialogCancel>
                      <AlertDialogAction onClick={() => unapproveMutation.mutate(option.id)}>
                        Remove approval
                      </AlertDialogAction>
                    </AlertDialogFooter>
                  </AlertDialogContent>
                </AlertDialog>
              );
            }}
          />

          {/* Procurement section — only for ordered/received */}
          {((selection as any).status === "ordered" || (selection as any).status === "received") && (
            <div className="surface-panel p-3" data-testid="selection-procurement">
              <div className="flex items-center gap-2 mb-3">
                <ShoppingCart className="w-3.5 h-3.5 text-muted-foreground" />
                <span className="text-data text-muted-foreground uppercase tracking-wide">Procurement</span>
              </div>
              <div className="flex items-center gap-6 flex-wrap">
                {/* PO link */}
                {(selection as any).purchaseOrderId && (
                  <div>
                    <div className="text-data text-muted-foreground uppercase tracking-wide mb-1">Purchase Order</div>
                    <a
                      href={`/projects/${selection.projectId}/purchase-orders/${(selection as any).purchaseOrderId}`}
                      className="inline-flex items-center gap-1 text-sm font-medium text-[#4a90d4] hover:underline"
                      data-testid="link-procurement-po"
                    >
                      <ExternalLink className="w-3.5 h-3.5" />
                      View PO
                    </a>
                  </div>
                )}

                {/* Ordered date */}
                {(selection as any).orderedAt && (
                  <div>
                    <div className="text-data text-muted-foreground uppercase tracking-wide mb-1">Ordered On</div>
                    <div className="text-sm font-medium">
                      {format(new Date((selection as any).orderedAt), "dd MMM yyyy")}
                    </div>
                  </div>
                )}

                {/* Received date or Mark as Received button */}
                {(selection as any).status === "received" && (selection as any).receivedAt ? (
                  <div>
                    <div className="text-data text-muted-foreground uppercase tracking-wide mb-1">Received On</div>
                    <div className="text-sm font-medium flex items-center gap-1 text-[#68b088]">
                      <PackageCheck className="w-3.5 h-3.5" />
                      {format(new Date((selection as any).receivedAt), "dd MMM yyyy")}
                    </div>
                  </div>
                ) : (
                  <div>
                    <div className="text-data text-muted-foreground uppercase tracking-wide mb-1">Delivery</div>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => markReceivedMutation.mutate()}
                      disabled={markReceivedMutation.isPending}
                      data-testid="button-mark-received"
                    >
                      {markReceivedMutation.isPending ? (
                        <Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" />
                      ) : (
                        <PackageCheck className="w-3.5 h-3.5 mr-1.5" />
                      )}
                      Mark as Received
                    </Button>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Comments */}
          <div className="surface-panel" data-testid="selection-comments">
            <button
              type="button"
              onClick={() => setCommentsExpanded((v) => !v)}
              className="w-full flex items-center gap-2 p-3 hover-elevate rounded-t-md text-left"
            >
              <MessageSquare className="w-3.5 h-3.5 text-muted-foreground" />
              <span className="text-data text-muted-foreground uppercase tracking-wide">Comments</span>
              {comments.length > 0 && (
                <Badge variant="secondary" className="text-xs">{comments.length}</Badge>
              )}
              {!commentsExpanded && (() => {
                const unread = comments.filter((c) => new Date(c.createdAt).getTime() > commentsSeenAt).length;
                return unread > 0 ? (
                  <Badge variant="status-danger" className="rounded-[5px] text-xs">{unread} new</Badge>
                ) : null;
              })()}
              <ChevronDown className={cn("w-3.5 h-3.5 text-muted-foreground ml-auto transition-transform duration-150", commentsExpanded && "rotate-180")} />
            </button>

            {commentsExpanded && (
              <div className="px-3 pb-3">
                {comments.length === 0 ? (
                  <div className="text-center py-4 text-muted-foreground">
                    <p className="text-sm">No comments yet</p>
                  </div>
                ) : (
                  <div className="space-y-2 mb-3">
                    {comments.map((comment) => (
                      <div
                        key={comment.id}
                        className={cn(
                          "rounded-md p-2.5 text-sm",
                          comment.isClientComment
                            ? "bg-status-info-bg ml-4"
                            : "bg-muted mr-4"
                        )}
                      >
                        <div className="flex items-center justify-between gap-2 mb-1">
                          <span className="font-medium text-xs text-muted-foreground">
                            {comment.isClientComment ? "Client" : (comment.createdByName || "Team")}
                          </span>
                          <div className="flex items-center gap-1">
                            <span className="text-xs text-muted-foreground">
                              {format(new Date(comment.createdAt), "d MMM, h:mm a")}
                            </span>
                            {isAdminUser && !comment.isClientComment && (
                              <button
                                onClick={() => deleteCommentMutation.mutate(comment.id)}
                                className="h-4 w-4 flex items-center justify-center rounded hover:text-destructive"
                              >
                                <Trash2 className="w-3 h-3 text-muted-foreground hover:text-destructive" />
                              </button>
                            )}
                          </div>
                        </div>
                        <p className="text-sm whitespace-pre-wrap">{comment.content}</p>
                      </div>
                    ))}
                  </div>
                )}

                <div className="flex items-end gap-2 pt-2 border-t">
                  <Textarea
                    placeholder="Add a comment..."
                    value={commentText}
                    onChange={(e) => setCommentText(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" && !e.shiftKey && commentText.trim()) {
                        e.preventDefault();
                        addCommentMutation.mutate(commentText.trim());
                      }
                    }}
                    className="flex-1 min-h-[60px] text-sm resize-none"
                    data-testid="input-comment"
                  />
                  <Button
                    size="icon"
                    onClick={() => commentText.trim() && addCommentMutation.mutate(commentText.trim())}
                    disabled={!commentText.trim() || addCommentMutation.isPending}
                    data-testid="button-send-comment"
                  >
                    {addCommentMutation.isPending ? (
                      <Loader2 className="w-4 h-4 animate-spin" />
                    ) : (
                      <Send className="w-4 h-4" />
                    )}
                  </Button>
                </div>
              </div>
            )}
          </div>

          {/* Notes to trades — collapsible, below comments */}
          <div className="surface-panel" data-testid="selection-trades-notes">
            <button
              type="button"
              onClick={() => setNotesPanelExpanded((v) => !v)}
              className="w-full flex items-center gap-2 p-3 hover-elevate rounded-t-md text-left"
            >
              <HardHat className="w-3.5 h-3.5 text-muted-foreground" />
              <span className="text-data text-muted-foreground uppercase tracking-wide">Notes to Trades</span>
              {!!localNotes && <Badge variant="secondary" className="text-xs">set</Badge>}
              <ChevronDown className={cn("w-3.5 h-3.5 text-muted-foreground ml-auto transition-transform duration-150", notesPanelExpanded && "rotate-180")} />
            </button>
            {notesPanelExpanded && (
              <div className="px-3 pb-3 space-y-1.5">
                <p className="text-xs px-2 py-1 rounded-md bg-status-warning-bg text-status-warning border border-status-warning/30">
                  Visible to your internal team only — not the client.
                </p>
                <Textarea
                  value={localNotes}
                  onChange={(e) => setLocalNotes(e.target.value)}
                  onBlur={(e) => handleSaveNotes(e.target.value)}
                  placeholder="Instructions, warnings, or notes for your trades team…"
                  rows={3}
                  className="text-sm resize-none"
                  data-testid="input-selection-notes"
                />
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Add/Edit Option Dialog — the shared one. This page supplies the
          persistence (rows + multipart uploads into option_attachments) and the
          media column; everything else, including the form and its validation,
          lives in the component. */}
      <OptionDialog
        open={isAddingOption || !!editingOption}
        onOpenChange={handleDialogChange}
        mode={editingOption ? "edit" : "create"}
        nounSingular="Product"
        isSaving={createOptionMutation.isPending || updateOptionMutation.isPending}
        initialValues={editingOption ? {
          name: editingOption.name,
          brand: editingOption.brand,
          sku: editingOption.sku,
          description: editingOption.description,
          notes: editingOption.notes,
          category: editingOption.category,
          subcategory: editingOption.subcategory,
          url: editingOption.url,
          quantity: editingOption.quantity,
          unitType: editingOption.unitType,
          unitCost: editingOption.unitCost,
          unitTax: editingOption.unitTax,
          totalCost: editingOption.totalCost,
          markupPercent: editingOption.markupPercent,
          gstInclusive: editingOption.gstInclusive,
          visibleToClient: editingOption.visibleToClient,
        } : prefillValues}
        initialSpecifications={editingOption
          ? (editingOption.specifications as Record<string, any> | null)
          : prefillSpecifications}
        onPaste={(files) => stageOrUploadImageFiles(files)}
        onSubmit={onOptionSubmit}
        mediaPane={optionMediaPane}
      />

      {/* Product Library Picker */}
      <Dialog open={productLibraryOpen} onOpenChange={setProductLibraryOpen}>
        <DialogContent className="sm:max-w-lg max-h-[80vh] flex flex-col">
          <DialogHeader className="flex-shrink-0">
            <DialogTitle>Product Library</DialogTitle>
            <DialogDescription>Pick a product to add as an option — images and details come with it.</DialogDescription>
          </DialogHeader>
          <div className="flex-shrink-0 mb-2">
            <div className="relative">
              <Search className="absolute left-2 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
              <Input
                placeholder="Search products..."
                value={productSearch}
                onChange={(e) => setProductSearch(e.target.value)}
                className="pl-7 h-8 text-sm"
                data-testid="input-product-search"
              />
            </div>
          </div>
          <div className="flex-1 overflow-y-auto space-y-1 min-h-0">
            {libraryProducts.length === 0 ? (
              <div className="text-center py-8 text-sm text-muted-foreground">
                <Package className="h-8 w-8 mx-auto mb-2 opacity-40" />
                No products in library yet — save an option to the library or import one from a URL.
              </div>
            ) : (() => {
              const q = productSearch.toLowerCase();
              const filtered = libraryProducts.filter((p) =>
                !q ||
                p.name?.toLowerCase().includes(q) ||
                p.brand?.toLowerCase().includes(q) ||
                p.sku?.toLowerCase().includes(q)
              );
              if (filtered.length === 0) {
                return <div className="text-center py-8 text-sm text-muted-foreground">No products match your search</div>;
              }
              return filtered.map((product) => (
                <button
                  key={product.id}
                  className="w-full flex items-center gap-3 px-3 py-2 rounded-md border bg-card hover-elevate text-left disabled:opacity-60"
                  disabled={addFromLibraryMutation.isPending}
                  onClick={() => addFromLibraryMutation.mutate(product.id)}
                  data-testid={`library-product-${product.id}`}
                >
                  {product.images?.[0]?.filePath ? (
                    <img src={product.images[0].filePath} alt={product.name} className="w-10 h-10 rounded object-cover flex-shrink-0" />
                  ) : (
                    <div className="w-10 h-10 rounded bg-muted flex items-center justify-center flex-shrink-0">
                      <Package className="h-4 w-4 text-muted-foreground" />
                    </div>
                  )}
                  <div className="flex-1 min-w-0">
                    <div className="font-medium text-sm truncate">{product.name}</div>
                    {(product.brand || product.sku) && (
                      <div className="text-xs text-muted-foreground truncate">
                        {[product.brand, product.sku ? `SKU: ${product.sku}` : null].filter(Boolean).join(" · ")}
                      </div>
                    )}
                    {product.defaultUnitCost != null && (
                      <div className="text-xs text-muted-foreground">${(product.defaultUnitCost / 100).toFixed(2)}</div>
                    )}
                  </div>
                  {addFromLibraryMutation.isPending && addFromLibraryMutation.variables === product.id && (
                    <Loader2 className="w-4 h-4 animate-spin text-muted-foreground" />
                  )}
                </button>
              ));
            })()}
          </div>
        </DialogContent>
      </Dialog>

      {/* Import from URL */}
      <Dialog open={urlImportOpen} onOpenChange={(open) => { setUrlImportOpen(open); if (!open) setImportUrl(""); }}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Link2 className="w-4 h-4" />
              Import product from URL
            </DialogTitle>
            <DialogDescription>
              Paste a supplier product page — name, price and images are pulled in for you to review.
            </DialogDescription>
          </DialogHeader>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              if (importUrl.trim()) scrapeUrlMutation.mutate(importUrl.trim());
            }}
            className="space-y-3"
          >
            <Input
              autoFocus
              placeholder="https://supplier.com.au/products/…"
              value={importUrl}
              onChange={(e) => setImportUrl(e.target.value)}
              data-testid="input-import-url"
            />
            <div className="flex justify-end gap-2">
              <Button type="button" variant="outline" onClick={() => setUrlImportOpen(false)}>
                Cancel
              </Button>
              <Button type="submit" disabled={!importUrl.trim() || scrapeUrlMutation.isPending} data-testid="button-import-url">
                {scrapeUrlMutation.isPending && <Loader2 className="w-4 h-4 animate-spin mr-2" />}
                {scrapeUrlMutation.isPending ? "Reading page…" : "Import"}
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>

      {/* Send to Client */}
      <Dialog open={sendDialogOpen} onOpenChange={(open) => { setSendDialogOpen(open); if (!open) setSendTo(""); }}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Send className="w-4 h-4" />
              Send to client
            </DialogTitle>
            <DialogDescription>
              Emails a link to the client portal where they can review the options and make their choice.
            </DialogDescription>
          </DialogHeader>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              if (sendTo.trim()) sendPortalMutation.mutate();
            }}
            className="space-y-3"
          >
            <div>
              <label className="text-xs font-medium text-muted-foreground block mb-1">Client email</label>
              <Input
                type="email"
                required
                placeholder="client@example.com"
                value={sendTo}
                onChange={(e) => setSendTo(e.target.value)}
                data-testid="input-send-to"
              />
            </div>
            <div>
              <label className="text-xs font-medium text-muted-foreground block mb-1">Message (optional)</label>
              <Textarea
                placeholder="A note to include in the email…"
                value={sendMessage}
                onChange={(e) => setSendMessage(e.target.value)}
                className="min-h-[70px] text-sm"
              />
            </div>
            {(selection as any)?.portalSentAt && (
              <p className="text-xs text-muted-foreground">
                Last sent {format(new Date((selection as any).portalSentAt), "d MMM yyyy, h:mm a")}
              </p>
            )}
            <div className="flex justify-end gap-2 pt-1">
              <Button type="button" variant="outline" onClick={() => setSendDialogOpen(false)}>
                Cancel
              </Button>
              <Button type="submit" disabled={!sendTo.trim() || sendPortalMutation.isPending} data-testid="button-send-portal">
                {sendPortalMutation.isPending && <Loader2 className="w-4 h-4 animate-spin mr-2" />}
                Send link
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>

      {/* QR Code Modal */}
      <Dialog open={showQrModal} onOpenChange={setShowQrModal}>
        <DialogContent className="sm:max-w-[360px]">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <QrCode className="w-4 h-4" />
              Client Portal QR Code
            </DialogTitle>
            <DialogDescription>
              Clients can scan this QR code to view and choose options on their device.
            </DialogDescription>
          </DialogHeader>
          <div className="flex flex-col items-center gap-4 py-2">
            {id && (
              <img
                src={`/api/selections/${id}/qr-code`}
                alt="QR code for client portal"
                className="w-48 h-48 rounded-md border"
              />
            )}
            <Button
              variant="outline"
              size="sm"
              className="w-full"
              onClick={handleCopyPortalLink}
            >
              <LinkIcon className="w-4 h-4 mr-2" />
              {portalLinkCopied ? "Link copied!" : "Copy Portal Link"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
