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
import { useSelectionStatusOptions } from "@/hooks/useSelectionStatusOptions";
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
  AlertTriangle,
  QrCode,
  Link as LinkIcon,
  Link2,
  ChevronDown,
  ChevronRight,
  XCircle,
} from "lucide-react";
import { format } from "date-fns";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Separator } from "@/components/ui/separator";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog";
import { cn } from "@/lib/utils";

function SortableAttachmentThumb({ att, onDelete }: { att: OptionAttachment; onDelete: (id: string) => void }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: att.id });
  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
    zIndex: isDragging ? 10 : undefined,
  };
  return (
    <div ref={setNodeRef} style={style} className="relative group aspect-square rounded-md overflow-hidden bg-muted cursor-grab active:cursor-grabbing">
      <img src={att.filePath} alt={att.fileName || "attachment"} className="w-full h-full object-cover" />
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
  );
}

function SortableImageGrid({
  attachments,
  onReorder,
  onDelete,
}: {
  attachments: OptionAttachment[];
  onReorder: (newOrder: OptionAttachment[]) => void;
  onDelete: (id: string) => void;
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
            <SortableAttachmentThumb key={att.id} att={att} onDelete={onDelete} />
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
  const [isAddingOption, setIsAddingOption] = useState(false);
  const [editingOption, setEditingOption] = useState<SelectionOption | null>(null);
  const [searchTerm, setSearchTerm] = useState("");
  const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false);
  const [optionsView, setOptionsView] = useState<"table" | "grid">("grid");
  const [optionsSearchExpanded, setOptionsSearchExpanded] = useState(false);
  const optionsSearchRef = useRef<HTMLInputElement>(null);
  const optionsSearchWrapRef = useRef<HTMLDivElement>(null);
  const [pricingPopoverOpen, setPricingPopoverOpen] = useState(false);
  const [editingAllowance, setEditingAllowance] = useState<string>("");
  const [isEditingDetails, setIsEditingDetails] = useState(false);
  const { toast } = useToast();
  const { user } = useAuth();
  const { statusOptions, getStatusInfo, getStatusLabel } = useSelectionStatusOptions();
  const imageInputRef = useRef<HTMLInputElement>(null);
  const [uploadingImage, setUploadingImage] = useState(false);
  const [bannerDismissed, setBannerDismissed] = useState(false);
  const [commentText, setCommentText] = useState("");
  const [commentsExpanded, setCommentsExpanded] = useState(false);
  const [showQrModal, setShowQrModal] = useState(false);
  const [portalLinkCopied, setPortalLinkCopied] = useState(false);

  const effectiveProjectId = projectId || currentProject?.id;

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
      });
    }
  }, [selection]);

  useEffect(() => {
    const subscription = selectionForm.watch(() => {
      setHasUnsavedChanges(true);
    });
    return () => subscription.unsubscribe();
  }, [selectionForm.watch]);

  useEffect(() => {
    if (optionsSearchExpanded) optionsSearchRef.current?.focus();
  }, [optionsSearchExpanded]);

  useEffect(() => {
    if (!optionsSearchExpanded) return;
    const handler = (e: MouseEvent) => {
      if (optionsSearchWrapRef.current && !optionsSearchWrapRef.current.contains(e.target as Node) && !searchTerm) {
        setOptionsSearchExpanded(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [optionsSearchExpanded, searchTerm]);

  const updateSelectionMutation = useMutation({
    mutationFn: async (data: Partial<InsertSelection>) => {
      return await apiRequest(`/api/selections/${id}`, "PATCH", data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/selections", id] });
      queryClient.invalidateQueries({ queryKey: ["/api/selections", effectiveProjectId] });
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
      queryClient.invalidateQueries({ queryKey: ["/api/selections", id] });
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
      queryClient.invalidateQueries({ queryKey: ["/api/selections", id] });
      setEditingOption(null);
      toast({
        title: "Option updated",
        description: "The selection option has been updated successfully.",
      });
    },
    onError: () => {
      toast({
        title: "Error",
        description: "Failed to update option. Please try again.",
        variant: "destructive",
      });
    },
  });

  const deleteOptionMutation = useMutation({
    mutationFn: async (optionId: string) => {
      await apiRequest(`/api/selection-options/${optionId}`, "DELETE");
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/selections", id] });
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
      queryClient.invalidateQueries({ queryKey: ["/api/selections", id] });
      queryClient.invalidateQueries({ queryKey: ["/api/selections/with-options"] });
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
      queryClient.invalidateQueries({ queryKey: ["/api/selections", id] });
      queryClient.invalidateQueries({ queryKey: ["/api/selections/with-options"] });
      toast({ title: "Approval removed", description: "The option has been unlocked." });
    },
    onError: (err: any) => {
      toast({ title: "Error", description: err?.message ?? "Failed to unapprove option.", variant: "destructive" });
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
        queryClient.invalidateQueries({ queryKey: ["/api/selections", id] });
      } catch {
        toast({ title: "Upload failed", variant: "destructive" });
      } finally {
        setUploadingImage(false);
      }
    };
    reader.readAsDataURL(file);
  };

  const markReceivedMutation = useMutation({
    mutationFn: async () => {
      return await apiRequest(`/api/selections/${id}/mark-received`, "PATCH");
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/selections", id] });
      queryClient.invalidateQueries({ queryKey: ["/api/selections/with-options"] });
      toast({ title: "Marked as received", description: "This selection has been marked as received." });
    },
    onError: (err: any) => {
      toast({ title: "Error", description: err?.message ?? "Failed to mark as received.", variant: "destructive" });
    },
  });

  const [gstInclusive, setGstInclusive] = useState<boolean>(false);
  const [pendingImages, setPendingImages] = useState<Array<{ file: File; previewUrl: string }>>([]);
  const pendingImageInputRef = useRef<HTMLInputElement>(null);
  const [unitCostDisplayStr, setUnitCostDisplayStr] = useState<string>("");
  const [totalCostDisplayStr, setTotalCostDisplayStr] = useState<string>("");
  const [markupDisplayStr, setMarkupDisplayStr] = useState<string>("");

  const optionForm = useForm<InsertSelectionOption>({
    resolver: zodResolver(insertSelectionOptionSchema),
    defaultValues: {
      selectionId: id || "",
      name: "",
      description: "",
      sku: "",
      brand: "",
      category: "",
      subcategory: "",
      unitCost: undefined,
      unitTax: undefined,
      gstInclusive: false,
      markupPercent: undefined,
      totalCost: undefined,
      quantity: 1,
      unitType: "ea",
      url: "",
      visibleToClient: true,
      isSelectedByClient: false,
      sortOrder: 0,
    },
  });

  const watchedUnitCost = optionForm.watch("unitCost");
  const watchedQuantity = optionForm.watch("quantity");
  const watchedMarkupPercent = optionForm.watch("markupPercent");

  useEffect(() => {
    if (!watchedUnitCost) return;
    const total = Math.round(watchedUnitCost * (watchedQuantity || 1) * (1 + (watchedMarkupPercent || 0) / 100));
    optionForm.setValue("totalCost", total, { shouldDirty: true });
    setTotalCostDisplayStr((total / 100).toFixed(2));
  }, [watchedUnitCost, watchedQuantity, watchedMarkupPercent]);

  const handleDialogChange = (open: boolean) => {
    if (!open) {
      setIsAddingOption(false);
      setEditingOption(null);
      setGstInclusive(false);
      setUnitCostDisplayStr("");
      setTotalCostDisplayStr("");
      setMarkupDisplayStr("");
      setPendingImages((prev) => {
        prev.forEach((p) => URL.revokeObjectURL(p.previewUrl));
        return [];
      });
      optionForm.reset({
        selectionId: id || "",
        name: "",
        description: "",
        sku: "",
        brand: "",
        category: "",
        subcategory: "",
        unitCost: undefined,
        unitTax: undefined,
        gstInclusive: false,
        markupPercent: undefined,
        totalCost: undefined,
        quantity: 1,
        unitType: "ea",
        url: "",
        visibleToClient: true,
        isSelectedByClient: false,
        sortOrder: 0,
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

  const onOptionSubmit = async (data: InsertSelectionOption) => {
    if (editingOption) {
      updateOptionMutation.mutate({ optionId: editingOption.id, data });
    } else {
      try {
        const newOption = await createOptionMutation.mutateAsync({
          ...data,
          selectionId: id || "",
        });
        if (pendingImages.length > 0 && newOption?.id) {
          setUploadingImage(true);
          try {
            for (const { file } of pendingImages) {
              await uploadImageToOption(newOption.id, file);
            }
            queryClient.invalidateQueries({ queryKey: ["/api/selections", id] });
          } finally {
            setUploadingImage(false);
          }
        }
        setPendingImages((prev) => {
          prev.forEach((p) => URL.revokeObjectURL(p.previewUrl));
          return [];
        });
      } catch {
        // errors handled by mutation
      }
    }
  };

  const handleEditOption = (option: SelectionOption) => {
    setEditingOption(option);
    setGstInclusive(option.gstInclusive || false);
    setUnitCostDisplayStr(option.unitCost ? (option.unitCost / 100).toFixed(2) : "");
    setTotalCostDisplayStr(option.totalCost ? (option.totalCost / 100).toFixed(2) : "");
    setMarkupDisplayStr(option.markupPercent != null ? option.markupPercent.toString() : "");
    
    optionForm.reset({
      selectionId: option.selectionId,
      name: option.name,
      description: option.description || "",
      sku: option.sku || "",
      brand: option.brand || "",
      category: option.category || "",
      subcategory: option.subcategory || "",
      unitCost: option.unitCost || undefined,
      unitTax: option.unitTax || undefined,
      gstInclusive: option.gstInclusive || false,
      markupPercent: option.markupPercent || undefined,
      totalCost: option.totalCost || undefined,
      quantity: option.quantity,
      unitType: option.unitType,
      url: option.url || "",
      visibleToClient: option.visibleToClient,
      isSelectedByClient: option.isSelectedByClient,
      sortOrder: option.sortOrder,
    });
  };

  const handleAddOption = () => {
    setIsAddingOption(true);
    setEditingOption(null);
    setGstInclusive(false);
    setUnitCostDisplayStr("");
    setTotalCostDisplayStr("");
    setMarkupDisplayStr("");
    optionForm.reset({
      selectionId: id || "",
      name: "",
      description: "",
      sku: "",
      brand: "",
      category: "",
      subcategory: "",
      unitCost: undefined,
      unitTax: undefined,
      gstInclusive: false,
      markupPercent: undefined,
      totalCost: undefined,
      quantity: 1,
      unitType: "ea",
      url: "",
      visibleToClient: true,
      isSelectedByClient: false,
      sortOrder: 0,
    });
  };

  const calculateGst = (unitCost: number | undefined, inclusive: boolean): number => {
    if (!unitCost || unitCost <= 0) return 0;
    const gstRate = 0.1;
    
    if (inclusive) {
      return Math.round((unitCost * gstRate) / (1 + gstRate));
    } else {
      return Math.round(unitCost * gstRate);
    }
  };

  const handleGstChange = (inclusive: boolean) => {
    setGstInclusive(inclusive);
    optionForm.setValue("gstInclusive", inclusive);
    const currentUnitCost = optionForm.getValues("unitCost");
    if (currentUnitCost) {
      const newTax = calculateGst(currentUnitCost, inclusive);
      optionForm.setValue("unitTax", newTax);
    }
  };

  const recalculateTotalCost = (unitCostCents?: number, qty?: number, markupPct?: number) => {
    const cost = unitCostCents ?? optionForm.getValues("unitCost") ?? 0;
    const quantity = qty ?? optionForm.getValues("quantity") ?? 1;
    const markup = markupPct ?? optionForm.getValues("markupPercent") ?? 0;
    if (!cost) return;
    const total = Math.round(cost * quantity * (1 + markup / 100));
    optionForm.setValue("totalCost", total);
    setTotalCostDisplayStr((total / 100).toFixed(2));
  };

  const handleUnitCostChange = (value: number | undefined) => {
    if (value && gstInclusive) {
      const newTax = calculateGst(value, gstInclusive);
      optionForm.setValue("unitTax", newTax);
    } else if (!gstInclusive) {
      optionForm.setValue("unitTax", value ? calculateGst(value, false) : undefined);
    }
  };

  const filteredOptions = (selection?.options || []).filter((option) =>
    option.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
    option.description?.toLowerCase().includes(searchTerm.toLowerCase()) ||
    option.brand?.toLowerCase().includes(searchTerm.toLowerCase()) ||
    option.sku?.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const handleSaveSelection = () => {
    const data = selectionForm.getValues();
    updateSelectionMutation.mutate(data);
  };

  const handleSaveDetails = () => {
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
            <ArrowLeft className="w-4 h-4 mr-2" />
            Back to Selections
          </Button>
        </div>
      </div>
    );
  }

  const currentStatus = getStatusInfo(selection.status);
  const StatusIcon = currentStatus.icon;

  // Calculate selected price from options (ensure we have valid numbers)
  const selectedOption = selection.options?.find(opt => opt.isSelectedByClient);
  const selectedPrice = Number(selectedOption?.totalCost) || 0;
  const allowanceAmount = Number(selection.allowance) || 0;
  const isOverAllowance = allowanceAmount > 0 && selectedPrice > allowanceAmount;
  const allowancePercent = allowanceAmount > 0 ? Math.min((selectedPrice / allowanceAmount) * 100, 200) : 0;

  const isAdminUser = !!user?.isAdminLike;

  return (
    <div className="flex flex-col h-full">
      {/* Breadcrumb bar */}
      <div className="h-9 bg-background border-b flex items-center justify-between px-2 gap-2 flex-shrink-0">
        <button
          onClick={goBack}
          className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors"
          data-testid="button-back"
        >
          <ChevronLeft className="w-3.5 h-3.5" />
          Selections
        </button>
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
              <DropdownMenuItem onClick={() => setIsEditingDetails(true)}>
                <Settings className="w-4 h-4 mr-2" />
                Edit Details
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
                onClick={() => window.open(`/api/selections/${id}/pdf`, "_blank")}
              >
                <Package className="w-4 h-4 mr-2" />
                Export PDF
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>

      {/* Main Content Area */}
      <div className="flex-1 overflow-y-auto">
        <div className="p-4 space-y-6">

          {/* Prominent name heading */}
          <div>
            <h2 className="text-2xl font-bold leading-tight">{selection.name}</h2>
            {(selection.category || selection.room) && (
              <p className="text-sm text-muted-foreground mt-0.5">
                {[selection.category, selection.room].filter(Boolean).join(" · ")}
              </p>
            )}
          </div>

          {/* Over-allowance banner */}
          {isOverAllowance && !bannerDismissed && (
            <div className="flex items-center gap-3 rounded-md border border-[hsl(var(--coral))]/40 bg-[hsl(var(--coral-bg))] px-4 py-3">
              <AlertTriangle className="w-4 h-4 text-[hsl(var(--coral))] shrink-0" />
              <div className="flex-1 min-w-0">
                <span className="text-sm font-medium text-[hsl(var(--coral))]">Over allowance by ${((selectedPrice - allowanceAmount) / 100).toLocaleString("en-AU", { minimumFractionDigits: 2 })}</span>
                <span className="text-sm text-muted-foreground ml-2">Selected option exceeds the allowance.</span>
              </div>
              <Button
                size="sm"
                variant="outline"
                className="h-7 text-xs shrink-0"
                onClick={() => setLocation(`/projects/${effectiveProjectId}/variations/new?name=${encodeURIComponent(selection.name + " – allowance overage")}&amount=${selectedPrice - allowanceAmount}`)}
              >
                Create Variation
              </Button>
              <button
                type="button"
                onClick={() => setBannerDismissed(true)}
                className="w-6 h-6 flex items-center justify-center rounded text-muted-foreground hover-elevate shrink-0"
                aria-label="Dismiss warning"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            </div>
          )}

          {/* Selection Details — summary strip OR inline edit form */}
          <div className="surface-panel p-3" data-testid="selection-details-block">
            {!isEditingDetails ? (
              <>
              <div className="flex items-center gap-6 flex-wrap">
                {/* Status */}
                <div>
                  <div className="text-data text-muted-foreground uppercase tracking-wide mb-1">Status</div>
                  <Badge 
                    variant="outline" 
                    className={cn("text-xs capitalize", currentStatus.bgClass, currentStatus.textClass)}
                  >
                    <StatusIcon className="w-3 h-3 mr-1" />
                    {currentStatus.name}
                  </Badge>
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
                
                {/* Deadline */}
                <div>
                  <div className="text-data text-muted-foreground uppercase tracking-wide mb-1">Deadline</div>
                  <div className="text-sm font-medium flex items-center gap-1">
                    <CalendarIcon className="w-3 h-3 text-muted-foreground" />
                    {selection.deadline ? format(new Date(selection.deadline), "dd/MM/yyyy") : "—"}
                  </div>
                </div>

                {/* Estimate link */}
                {selection.estimateItemId && (
                  <div>
                    <div className="text-data text-muted-foreground uppercase tracking-wide mb-1">Source</div>
                    <div className="text-sm font-medium flex items-center gap-1 text-muted-foreground">
                      <Link2 className="w-3 h-3" />
                      Linked from estimate
                    </div>
                  </div>
                )}
                
                <div className="flex-1" />
                
                {/* Pricing Section */}
                <Popover open={pricingPopoverOpen} onOpenChange={(open) => {
                  setPricingPopoverOpen(open);
                  if (open) {
                    setEditingAllowance((allowanceAmount / 100).toFixed(2));
                  }
                }}>
                  <PopoverTrigger asChild>
                    <button 
                      type="button"
                      className="text-left hover-elevate rounded-md p-2 -m-2 transition-colors cursor-pointer"
                      data-testid="button-edit-pricing"
                    >
                      <div className="flex items-start gap-6">
                        <div className="flex flex-col gap-0.5">
                          <div className="flex items-center gap-2">
                            <span className="text-data text-muted-foreground uppercase tracking-wide w-16">Allowance</span>
                            <span className="text-sm font-semibold">${(allowanceAmount / 100).toLocaleString('en-AU', { minimumFractionDigits: 2 })}</span>
                          </div>
                          <div className="flex items-center gap-2">
                            <span className="text-data text-muted-foreground uppercase tracking-wide w-16">Selected</span>
                            <span className="text-sm font-semibold text-primary">${(selectedPrice / 100).toLocaleString('en-AU', { minimumFractionDigits: 2 })}</span>
                          </div>
                        </div>
                        <div className="flex flex-col items-end">
                          <span className="text-data text-muted-foreground uppercase tracking-wide">Difference</span>
                          {(() => {
                            const difference = selectedPrice - allowanceAmount;
                            const isOver = difference > 0;
                            const isUnder = difference < 0;
                            return (
                              <span className={cn(
                                "text-sm font-semibold",
                                isOver && "text-status-danger",
                                isUnder && "text-status-success",
                                !isOver && !isUnder && "text-muted-foreground"
                              )}>
                                {isOver && "+"}${(Math.abs(difference) / 100).toLocaleString('en-AU', { minimumFractionDigits: 2 })}
                              </span>
                            );
                          })()}
                        </div>
                      </div>
                    </button>
                  </PopoverTrigger>
                  <PopoverContent align="end" className="w-64">
                    <div className="space-y-4">
                      <div className="text-sm font-semibold">Edit Allowance</div>
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

                {/* Edit toggle */}
                <button
                  type="button"
                  onClick={() => setIsEditingDetails(true)}
                  className="h-7 w-7 rounded-md hover-elevate active-elevate-2 flex items-center justify-center text-muted-foreground"
                  data-testid="button-toggle-edit-details"
                  aria-label="Edit selection details"
                >
                  <Edit3 className="w-3.5 h-3.5" />
                </button>
              </div>

              {/* Allowance progress bar */}
              {allowanceAmount > 0 && (
                <div className="mt-3 pt-3 border-t border-border/60">
                  <div className="flex items-center justify-between mb-1.5 text-xs text-muted-foreground">
                    <span>Allowance utilisation</span>
                    <div className="flex items-center gap-3">
                      {selectedPrice > 0 && (
                        <span className={cn(
                          "text-xs",
                          selectedPrice > allowanceAmount ? "text-[hsl(var(--coral))]" : "text-muted-foreground"
                        )}>
                          {selectedPrice > allowanceAmount ? "+" : ""}${Math.abs(selectedPrice - allowanceAmount) >= 0 ? ((selectedPrice - allowanceAmount) / 100).toLocaleString("en-AU", { minimumFractionDigits: 2 }) : "0.00"} variance
                        </span>
                      )}
                      <span className={cn(
                        "font-semibold",
                        allowancePercent > 110 ? "text-[hsl(var(--coral))]" : allowancePercent > 100 ? "text-[hsl(var(--amber))]" : "text-[hsl(var(--sage))]"
                      )}>
                        {allowancePercent.toFixed(0)}%
                      </span>
                    </div>
                  </div>
                  <div className="h-1.5 rounded-full bg-muted overflow-hidden">
                    <div
                      className={cn(
                        "h-full rounded-full transition-all duration-300",
                        allowancePercent > 110 ? "bg-[hsl(var(--coral))]" : allowancePercent > 100 ? "bg-[hsl(var(--amber))]" : "bg-[hsl(var(--sage))]"
                      )}
                      style={{ width: `${Math.min(allowancePercent, 100)}%` }}
                    />
                  </div>
                </div>
              )}
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
                          <Select onValueChange={field.onChange} value={field.value || ""}>
                            <FormControl>
                              <SelectTrigger className="h-9 text-sm shadow-none border-border" data-testid="select-category">
                                <SelectValue placeholder="Select category" />
                              </SelectTrigger>
                            </FormControl>
                            <SelectContent>
                              {selectionCategories?.options?.map((opt) => (
                                <SelectItem key={opt.key} value={opt.name}>
                                  {opt.name}
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
                      name="room"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel className="text-data text-muted-foreground uppercase tracking-wide">Location</FormLabel>
                          <Select onValueChange={field.onChange} value={field.value || ""}>
                            <FormControl>
                              <SelectTrigger className="h-9 text-sm shadow-none border-border" data-testid="select-room">
                                <SelectValue placeholder="Select location" />
                              </SelectTrigger>
                            </FormControl>
                            <SelectContent>
                              {locationCategories?.options?.map((opt) => (
                                <SelectItem key={opt.key} value={opt.name}>
                                  {opt.name}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
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
                      name="allowance"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel className="text-data text-muted-foreground uppercase tracking-wide">Allowance ($)</FormLabel>
                          <FormControl>
                            <div className="relative">
                              <span className="absolute left-2 top-1/2 -translate-y-1/2 text-muted-foreground text-sm">$</span>
                              <Input
                                type="number"
                                step="0.01"
                                min="0"
                                className="h-9 pl-6 text-sm shadow-none border-border"
                                value={field.value !== undefined && field.value !== null ? (Number(field.value) / 100).toString() : ""}
                                onChange={(e) => {
                                  const v = e.target.value;
                                  if (v === "") {
                                    field.onChange(undefined);
                                  } else {
                                    const parsed = parseFloat(v);
                                    field.onChange(isNaN(parsed) ? undefined : Math.round(parsed * 100));
                                  }
                                  setHasUnsavedChanges(true);
                                }}
                                data-testid="input-allowance"
                              />
                            </div>
                          </FormControl>
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

          {/* Options Section */}
          <div>
            <div className="flex items-center justify-between mb-3">
              <h2 className="text-sm font-semibold flex items-center gap-2">
                <Package className="w-4 h-4" />
                Options ({selection.options?.length || 0})
              </h2>
              <div className="flex items-center gap-1.5">
                {/* View toggle */}
                <div className="flex items-center border border-border rounded-md overflow-hidden">
                  <button
                    onClick={() => setOptionsView("grid")}
                    className={cn(
                      "h-7 w-7 flex items-center justify-center transition-colors",
                      optionsView === "grid" ? "bg-primary text-primary-foreground" : "text-muted-foreground hover-elevate"
                    )}
                    data-testid="button-view-grid"
                  >
                    <LayoutGrid className="w-3.5 h-3.5" />
                  </button>
                  <button
                    onClick={() => setOptionsView("table")}
                    className={cn(
                      "h-7 w-7 flex items-center justify-center transition-colors",
                      optionsView === "table" ? "bg-primary text-primary-foreground" : "text-muted-foreground hover-elevate"
                    )}
                    data-testid="button-view-table"
                  >
                    <LayoutList className="w-3.5 h-3.5" />
                  </button>
                </div>

                {/* Expandable search */}
                <div ref={optionsSearchWrapRef} className="flex items-center flex-shrink-0">
                  <div className={cn("flex items-center transition-all duration-200 overflow-hidden", optionsSearchExpanded ? "w-44" : "w-7")}>
                    {optionsSearchExpanded ? (
                      <div className="relative w-full">
                        <Search className="absolute left-2 top-1/2 -translate-y-1/2 w-3 h-3 text-muted-foreground" />
                        <Input
                          ref={optionsSearchRef}
                          placeholder="Search options…"
                          value={searchTerm}
                          onChange={(e) => setSearchTerm(e.target.value)}
                          onKeyDown={(e) => {
                            if (e.key === "Escape") { setSearchTerm(""); setOptionsSearchExpanded(false); }
                          }}
                          className="h-7 pl-7 pr-6 text-xs"
                          data-testid="input-search-options"
                        />
                        {searchTerm && (
                          <button
                            type="button"
                            onClick={() => { setSearchTerm(""); optionsSearchRef.current?.focus(); }}
                            className="absolute right-1 top-1/2 -translate-y-1/2 h-4 w-4 flex items-center justify-center rounded hover-elevate text-muted-foreground"
                          >
                            <X className="w-3 h-3" />
                          </button>
                        )}
                      </div>
                    ) : (
                      <button
                        type="button"
                        onClick={() => setOptionsSearchExpanded(true)}
                        className="h-7 w-7 flex items-center justify-center rounded-md text-muted-foreground hover-elevate active-elevate-2"
                        data-testid="button-search-options"
                      >
                        <Search className="w-3.5 h-3.5" />
                      </button>
                    )}
                  </div>
                </div>

                {/* Add option */}
                <Button
                  size="sm"
                  onClick={handleAddOption}
                  data-testid="button-add-option"
                >
                  <Plus className="w-3.5 h-3.5 mr-1" />
                  Add Option
                </Button>
              </div>
            </div>
            
            {filteredOptions.length === 0 ? (
              <div className="text-center py-12 border rounded-lg bg-muted/20">
                <Package className="w-12 h-12 mx-auto mb-4 text-muted-foreground" />
                <h3 className="text-lg font-medium mb-2">No options yet</h3>
                <p className="text-muted-foreground mb-4">
                  {searchTerm ? "Try adjusting your search terms." : "Add options for your client to choose from."}
                </p>
                {!searchTerm && (
                  <Button onClick={handleAddOption} data-testid="button-add-first-option">
                    <Plus className="w-4 h-4 mr-2" />
                    Add Option
                  </Button>
                )}
              </div>
            ) : optionsView === "grid" ? (
              /* Grid View - Gallery Style */
              <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
                {filteredOptions.map((option) => {
                  const heroAttachment = option.attachments?.[0];
                  const isApproved = !!option.approvedAt;
                  const isLocked = !!option.lockedAt;
                  return (
                    <Tooltip key={option.id}>
                    <TooltipTrigger asChild>
                    <Card 
                      className={cn(
                        "transition-all duration-200 group",
                        isLocked ? "cursor-not-allowed opacity-80" : "hover-elevate cursor-pointer",
                        option.isSelectedByClient && !isApproved && "ring-1 ring-[hsl(var(--amber))]",
                        isApproved && "ring-1 ring-[hsl(var(--sage))]"
                      )}
                      onClick={() => { if (!isLocked) handleEditOption(option); }}
                      data-testid={`card-option-${option.id}`}
                    >
                      {/* Hero image */}
                      <div className="h-40 bg-muted flex items-center justify-center relative overflow-hidden">
                        {heroAttachment?.filePath ? (
                          <img
                            src={heroAttachment.filePath}
                            alt={option.name}
                            className="w-full h-full object-cover"
                          />
                        ) : (
                          <Camera className="w-10 h-10 text-muted-foreground/30" />
                        )}
                        <div className="absolute top-2 left-2 flex flex-col gap-1">
                          {!option.visibleToClient && (
                            <Badge variant="secondary" className="text-[10px] px-1.5 py-0.5">
                              <EyeOff className="w-3 h-3 mr-1" />
                              Hidden
                            </Badge>
                          )}
                          {isLocked && (
                            <Badge variant="secondary" className="text-[10px] px-1.5 py-0.5">
                              <Lock className="w-3 h-3 mr-1" />
                              Locked
                            </Badge>
                          )}
                        </div>
                        <div className="absolute top-2 right-2 flex flex-col gap-1 items-end">
                          {isApproved ? (
                            <Tooltip>
                              <TooltipTrigger asChild>
                                <Badge className="bg-[hsl(var(--sage))] text-white text-[10px] px-1.5 py-0.5 no-default-active-elevate cursor-default">
                                  <CheckCircle className="w-3 h-3 mr-1" />
                                  Approved
                                </Badge>
                              </TooltipTrigger>
                              <TooltipContent side="left">
                                <p className="text-xs">
                                  {option.approvedBy || "Admin"}{option.approvedAt ? ` · ${format(new Date(option.approvedAt), "d MMM yyyy")}` : ""}
                                </p>
                              </TooltipContent>
                            </Tooltip>
                          ) : option.isSelectedByClient ? (
                            <Badge className="bg-[hsl(var(--amber))] text-white text-[10px] px-1.5 py-0.5 no-default-active-elevate">
                              <CheckCircle className="w-3 h-3 mr-1" />
                              Client selected
                            </Badge>
                          ) : null}
                        </div>
                      </div>
                      <CardContent className="p-3">
                        <div className="font-medium text-sm truncate">{option.name}</div>
                        {(option.brand || option.sku) && (
                          <div className="text-xs text-muted-foreground truncate">
                            {[option.brand, option.sku ? `SKU ${option.sku}` : null].filter(Boolean).join(" · ")}
                          </div>
                        )}
                        <div className="mt-2 flex items-end justify-between gap-1">
                          <span className="text-xs text-muted-foreground">
                            {option.quantity} {option.unitType}
                          </span>
                          <div className="flex items-end gap-0.5">
                            <div className="text-right">
                              {(() => {
                                const displayCents = option.totalCost != null
                                  ? option.totalCost
                                  : option.unitCost != null
                                    ? Math.round(option.unitCost * (option.quantity || 1) * (1 + (option.markupPercent || 0) / 100))
                                    : null;
                                return displayCents != null ? (
                                  <div className="text-sm font-semibold">
                                    ${(displayCents / 100).toFixed(2)}
                                  </div>
                                ) : null;
                              })()}
                              {selection.allowance != null && selection.allowance > 0 && option.totalCost != null && (() => {
                                const variance = option.totalCost - selection.allowance;
                                if (variance === 0) return null;
                                const over = variance > 0;
                                return (
                                  <div className={`text-[10px] font-medium ${over ? "text-[hsl(var(--coral))]" : "text-[hsl(var(--sage))]"}`}>
                                    {over ? "+" : ""}${(Math.abs(variance) / 100).toFixed(0)}
                                  </div>
                                );
                              })()}
                            </div>
                            {isAdminUser && (
                              <AlertDialog>
                                <DropdownMenu>
                                  <DropdownMenuTrigger asChild>
                                    <Button
                                      size="icon"
                                      variant="ghost"
                                      className="h-6 w-6 flex-shrink-0 opacity-0 group-hover:opacity-100 transition-opacity"
                                      onClick={(e) => e.stopPropagation()}
                                    >
                                      <MoreVertical className="w-3.5 h-3.5" />
                                    </Button>
                                  </DropdownMenuTrigger>
                                  <DropdownMenuContent align="end" onClick={(e) => e.stopPropagation()}>
                                    {!isLocked && (
                                      <DropdownMenuItem
                                        onClick={(e) => { e.stopPropagation(); handleEditOption(option); }}
                                      >
                                        <Edit3 className="w-4 h-4 mr-2" />
                                        Edit
                                      </DropdownMenuItem>
                                    )}
                                    {isApproved && (
                                      <AlertDialogTrigger asChild>
                                        <DropdownMenuItem
                                          onSelect={(e) => e.preventDefault()}
                                          onClick={(e) => e.stopPropagation()}
                                        >
                                          <XCircle className="w-4 h-4 mr-2" />
                                          Remove approval
                                        </DropdownMenuItem>
                                      </AlertDialogTrigger>
                                    )}
                                    <DropdownMenuItem
                                      onClick={(e) => { e.stopPropagation(); if (!isLocked) deleteOptionMutation.mutate(option.id); }}
                                      className="text-destructive"
                                      disabled={isLocked}
                                    >
                                      <Trash2 className="w-4 h-4 mr-2" />
                                      Delete
                                    </DropdownMenuItem>
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
                            )}
                          </div>
                        </div>
                        {isAdminUser && !isApproved && !isLocked && (
                          <AlertDialog>
                            <AlertDialogTrigger asChild>
                              <Button
                                size="sm"
                                variant="outline"
                                className="mt-2 h-7 w-full text-xs"
                                onClick={(e) => e.stopPropagation()}
                                disabled={approveMutation.isPending}
                              >
                                <CheckCircle className="w-3 h-3 mr-1" />
                                Approve
                              </Button>
                            </AlertDialogTrigger>
                            <AlertDialogContent onClick={(e) => e.stopPropagation()}>
                              <AlertDialogHeader>
                                <AlertDialogTitle>Approve this option?</AlertDialogTitle>
                                <AlertDialogDescription>
                                  This will approve and lock <span className="font-medium text-foreground">{option.name}</span>. Locked options cannot be edited or deleted.
                                </AlertDialogDescription>
                              </AlertDialogHeader>
                              <AlertDialogFooter>
                                <AlertDialogCancel>Cancel</AlertDialogCancel>
                                <AlertDialogAction onClick={() => approveMutation.mutate(option.id)}>
                                  Approve
                                </AlertDialogAction>
                              </AlertDialogFooter>
                            </AlertDialogContent>
                          </AlertDialog>
                        )}
                      </CardContent>
                    </Card>
                    </TooltipTrigger>
                    {isLocked && (
                      <TooltipContent>
                        <p className="text-xs">This option is locked</p>
                      </TooltipContent>
                    )}
                    </Tooltip>
                  );
                })}
              </div>
            ) : (
              /* Table View */
              <div className="border rounded-lg overflow-hidden">
                <LineItemTable
                  size="sm"
                  data={filteredOptions}
                  rowKey={(option) => option.id}
                  rowTestId={(option) => `row-option-${option.id}`}
                  onRowClick={(option) => { if (!option.lockedAt) handleEditOption(option); }}
                  rowClassName={(option, idx) => cn(option.lockedAt ? "cursor-not-allowed opacity-75" : "hover-elevate", idx % 2 === 0 ? "bg-background" : "bg-muted/20")}
                  columns={[
                    {
                      key: "image",
                      header: "Image",
                      width: 64,
                      truncate: false,
                      cell: () => (
                        <div className="w-10 h-10 bg-muted rounded flex items-center justify-center">
                          <Package className="w-5 h-5 text-muted-foreground" />
                        </div>
                      ),
                    },
                    {
                      key: "option",
                      header: "Option",
                      truncate: false,
                      cell: (option) => (
                        <div className="flex flex-col gap-0.5">
                          <span className="font-medium text-sm">{option.name}</span>
                          {option.brand && (
                            <span className="text-xs text-muted-foreground">{option.brand}</span>
                          )}
                          {option.productUrl && (
                            <a
                              href={option.productUrl}
                              target="_blank"
                              rel="noopener noreferrer"
                              onClick={(e) => e.stopPropagation()}
                              className="text-xs text-primary hover:underline flex items-center gap-1"
                            >
                              <ExternalLink className="w-3 h-3" />
                              View product
                            </a>
                          )}
                        </div>
                      ),
                    },
                    {
                      key: "sku",
                      header: "SKU",
                      cell: (option) => (
                        <span className="font-mono text-xs text-muted-foreground">{option.sku || "-"}</span>
                      ),
                    },
                    {
                      key: "qty",
                      header: "Qty",
                      align: "center",
                      cell: (option) => `${option.quantity} ${option.unitType}`,
                    },
                    {
                      key: "unitPrice",
                      header: "Unit Price",
                      align: "right",
                      cell: (option) => `$${((option.unitCost || 0) / 100).toFixed(2)}`,
                    },
                    {
                      key: "amount",
                      header: "Amount",
                      align: "right",
                      className: "font-semibold",
                      cell: (option) => `$${((option.totalCost || 0) / 100).toFixed(2)}`,
                    },
                    {
                      key: "status",
                      header: "Status",
                      align: "center",
                      truncate: false,
                      cell: (option) => {
                        const isApprovedRow = !!option.approvedAt;
                        const isLockedRow = !!option.lockedAt;
                        return (
                          <div className="flex flex-col gap-1 items-center">
                            {isApprovedRow ? (
                              <Tooltip>
                                <TooltipTrigger asChild>
                                  <Badge className="bg-[hsl(var(--sage))] text-white text-[10px] px-1.5 cursor-default no-default-active-elevate">
                                    <CheckCircle className="w-3 h-3 mr-1" />
                                    Approved
                                  </Badge>
                                </TooltipTrigger>
                                <TooltipContent>
                                  <p className="text-xs">
                                    {option.approvedBy || "Admin"}{option.approvedAt ? ` · ${format(new Date(option.approvedAt), "d MMM yyyy")}` : ""}
                                  </p>
                                </TooltipContent>
                              </Tooltip>
                            ) : isLockedRow ? (
                              <Badge variant="outline" className="text-xs">
                                <Lock className="w-3 h-3 mr-1" />
                                Locked
                              </Badge>
                            ) : option.isSelectedByClient ? (
                              <Badge variant="outline" className="text-xs">
                                <CheckCircle className="w-3 h-3 mr-1" />
                                Selected
                              </Badge>
                            ) : !option.visibleToClient ? (
                              <Badge variant="outline" className="text-xs text-muted-foreground">
                                <EyeOff className="w-3 h-3 mr-1" />
                                Hidden
                              </Badge>
                            ) : (
                              <Badge variant="outline" className="text-xs">
                                <Eye className="w-3 h-3 mr-1" />
                                Visible
                              </Badge>
                            )}
                          </div>
                        );
                      },
                    },
                  ]}
                  actions={(option) => {
                    const isLockedRow = !!option.lockedAt;
                    const isApprovedRow = !!option.approvedAt;
                    return (
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild onClick={(e) => e.stopPropagation()}>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-6 w-6"
                          data-testid={`button-option-menu-${option.id}`}
                        >
                          <MoreVertical className="w-4 h-4" />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        <DropdownMenuItem
                          onClick={(e) => { e.stopPropagation(); if (!isLockedRow) handleEditOption(option); }}
                          disabled={isLockedRow}
                        >
                          <Edit3 className="w-4 h-4 mr-2" />
                          Edit
                        </DropdownMenuItem>
                        {isAdminUser && !isApprovedRow && (
                          <DropdownMenuItem
                            onClick={(e) => { e.stopPropagation(); approveMutation.mutate(option.id); }}
                            disabled={approveMutation.isPending}
                          >
                            <CheckCircle className="w-4 h-4 mr-2" />
                            Approve
                          </DropdownMenuItem>
                        )}
                        {isAdminUser && isApprovedRow && (
                          <DropdownMenuItem
                            onClick={(e) => { e.stopPropagation(); unapproveMutation.mutate(option.id); }}
                            disabled={unapproveMutation.isPending}
                          >
                            <XCircle className="w-4 h-4 mr-2" />
                            Remove approval
                          </DropdownMenuItem>
                        )}
                        <DropdownMenuItem
                          onClick={(e) => { e.stopPropagation(); if (!isLockedRow) deleteOptionMutation.mutate(option.id); }}
                          className="text-destructive"
                          disabled={isLockedRow}
                        >
                          <Trash2 className="w-4 h-4 mr-2" />
                          Delete
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  );
                  }}
                />
              </div>
            )}
          </div>

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
                            ? "bg-blue-50 dark:bg-blue-950/20 ml-4"
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
        </div>
      </div>

      {/* Add/Edit Option Dialog */}
      <Dialog 
        open={isAddingOption || !!editingOption} 
        onOpenChange={handleDialogChange}
      >
        <DialogContent className="sm:max-w-[700px] max-h-[95vh] flex flex-col">
          <DialogHeader className="flex-shrink-0">
            <DialogTitle>
              {editingOption ? "Edit Option" : "Add New Option"}
            </DialogTitle>
            <DialogDescription>
              {editingOption 
                ? "Update the option details below."
                : "Add a new option for clients to choose from."
              }
            </DialogDescription>
          </DialogHeader>

          <div className="flex-1 overflow-y-auto">
            <Form {...optionForm}>
              <form onSubmit={optionForm.handleSubmit(onOptionSubmit)} className="space-y-4 pr-2">

                {/* Row 1: Name (full width) */}
                <FormField
                  control={optionForm.control}
                  name="name"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Option Name</FormLabel>
                      <FormControl>
                        <Input
                          className="h-9"
                          placeholder="e.g., Subway Tile White"
                          {...field}
                          data-testid="input-option-name"
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                {/* Row 2: Brand | SKU */}
                <div className="grid grid-cols-2 gap-4">
                  <FormField
                    control={optionForm.control}
                    name="brand"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Brand</FormLabel>
                        <FormControl>
                          <Input
                            className="h-9"
                            placeholder="e.g., Concept Tile"
                            {...field}
                            value={field.value || ""}
                            data-testid="input-option-brand"
                          />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={optionForm.control}
                    name="sku"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>SKU</FormLabel>
                        <FormControl>
                          <Input
                            className="h-9"
                            placeholder="Product code"
                            {...field}
                            value={field.value || ""}
                            data-testid="input-option-sku"
                          />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </div>

                {/* Row 3: Description (full width) */}
                <FormField
                  control={optionForm.control}
                  name="description"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Description</FormLabel>
                      <FormControl>
                        <Textarea
                          placeholder="Describe this option..."
                          rows={2}
                          {...field}
                          value={field.value || ""}
                          data-testid="input-option-description"
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <Separator />

                {/* Pricing section: Qty | Unit Type | Unit Cost */}
                <div className="grid grid-cols-3 gap-4">
                  <FormField
                    control={optionForm.control}
                    name="quantity"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Qty</FormLabel>
                        <FormControl>
                          <Input
                            className="h-9"
                            type="number"
                            min="1"
                            {...field}
                            onChange={(e) => {
                              field.onChange(parseInt(e.target.value) || 1);
                            }}
                            data-testid="input-option-quantity"
                          />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <FormField
                    control={optionForm.control}
                    name="unitType"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Unit Type</FormLabel>
                        <Select onValueChange={field.onChange} value={field.value || "ea"}>
                          <FormControl>
                            <SelectTrigger className="h-9" data-testid="select-option-unit-type">
                              <SelectValue placeholder="Select unit" />
                            </SelectTrigger>
                          </FormControl>
                          <SelectContent>
                            <SelectItem value="ea">ea</SelectItem>
                            <SelectItem value="m2">m²</SelectItem>
                            <SelectItem value="lm">lm</SelectItem>
                            <SelectItem value="m3">m³</SelectItem>
                            <SelectItem value="hr">hr</SelectItem>
                            <SelectItem value="day">day</SelectItem>
                            <SelectItem value="wk">wk</SelectItem>
                            <SelectItem value="lot">lot</SelectItem>
                            <SelectItem value="allow">allow</SelectItem>
                            <SelectItem value="t">t</SelectItem>
                            <SelectItem value="kg">kg</SelectItem>
                          </SelectContent>
                        </Select>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <FormField
                    control={optionForm.control}
                    name="unitCost"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel className="text-primary font-semibold">Unit Cost</FormLabel>
                        <FormControl>
                          <div className="flex rounded-md border border-primary/40 bg-primary/5 overflow-hidden focus-within:ring-1 focus-within:ring-primary/50">
                            <span className="flex items-center px-3 text-muted-foreground text-sm font-medium border-r border-primary/20 bg-primary/5 select-none">$</span>
                            <Input
                              type="number"
                              placeholder="0.00"
                              step="0.01"
                              min="0"
                              className="border-0 rounded-none bg-transparent text-right font-medium shadow-none focus-visible:ring-0 h-9"
                              value={unitCostDisplayStr}
                              onChange={(e) => {
                                setUnitCostDisplayStr(e.target.value);
                                const centValue = e.target.value !== "" ? Math.round(parseFloat(e.target.value) * 100) : undefined;
                                field.onChange(centValue);
                                handleUnitCostChange(centValue);
                              }}
                              data-testid="input-option-unit-cost"
                            />
                          </div>
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </div>

                {/* GST toggle + Markup + Total */}
                <div className="space-y-4">
                  {/* GST pill toggle */}
                  <div className="flex items-center justify-between">
                    <span className="text-xs text-muted-foreground font-medium">GST treatment</span>
                    <div className="flex rounded-md border border-border overflow-hidden text-xs">
                      <button
                        type="button"
                        onClick={() => handleGstChange(false)}
                        className={cn(
                          "px-3 py-1.5 font-medium transition-colors",
                          !gstInclusive ? "bg-foreground text-background" : "text-muted-foreground hover-elevate"
                        )}
                        data-testid="button-gst-ex"
                      >
                        Ex. GST
                      </button>
                      <button
                        type="button"
                        onClick={() => handleGstChange(true)}
                        className={cn(
                          "px-3 py-1.5 font-medium transition-colors border-l border-border",
                          gstInclusive ? "bg-foreground text-background" : "text-muted-foreground hover-elevate"
                        )}
                        data-testid="button-gst-inc"
                      >
                        Inc. GST
                      </button>
                    </div>
                  </div>

                  {/* Markup % */}
                  <FormField
                    control={optionForm.control}
                    name="markupPercent"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Markup %</FormLabel>
                        <FormControl>
                          <div className="relative">
                            <Input
                              type="number"
                              placeholder="0"
                              min="0"
                              className="pr-8 h-9"
                              value={markupDisplayStr}
                              onChange={(e) => {
                                setMarkupDisplayStr(e.target.value);
                                field.onChange(e.target.value !== "" ? parseInt(e.target.value) : undefined);
                              }}
                              data-testid="input-option-markup"
                            />
                            <span className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground text-sm">%</span>
                          </div>
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  {/* Total display card */}
                  <FormField
                    control={optionForm.control}
                    name="totalCost"
                    render={({ field }) => {
                      const totalCents = watchedUnitCost
                        ? Math.round(watchedUnitCost * (watchedQuantity || 1) * (1 + (watchedMarkupPercent || 0) / 100))
                        : null;
                      const totalIncGst = totalCents !== null
                        ? (gstInclusive ? totalCents : Math.round(totalCents * 1.1))
                        : null;
                      const totalExGst = totalCents !== null
                        ? (gstInclusive ? Math.round(totalCents / 1.1) : totalCents)
                        : null;
                      return (
                        <FormItem>
                          <input type="hidden" {...field} value={field.value ?? ""} />
                          <div
                            className="rounded-md bg-muted/50 border border-border px-4 py-3 space-y-1"
                            data-testid="display-option-total-cost"
                          >
                            <div className="flex items-baseline justify-between gap-2">
                              <span className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Total inc. GST</span>
                              <span className="text-lg font-semibold tabular-nums">
                                {totalIncGst !== null ? `$${(totalIncGst / 100).toFixed(2)}` : "—"}
                              </span>
                            </div>
                            <div className="flex items-baseline justify-between gap-2">
                              <span className="text-xs text-muted-foreground">ex. GST</span>
                              <span className="text-sm text-muted-foreground tabular-nums">
                                {totalExGst !== null ? `$${(totalExGst / 100).toFixed(2)}` : "—"}
                              </span>
                            </div>
                          </div>
                          <FormMessage />
                        </FormItem>
                      );
                    }}
                  />
                </div>

                <Separator />

                {/* URL */}
                <FormField
                  control={optionForm.control}
                  name="url"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Product URL</FormLabel>
                      <FormControl>
                        <Input
                          className="h-9"
                          type="url"
                          placeholder="https://..."
                          {...field}
                          value={field.value || ""}
                          data-testid="input-option-url"
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                {/* Visible to Client */}
                <FormField
                  control={optionForm.control}
                  name="visibleToClient"
                  render={({ field }) => (
                    <FormItem className="flex items-center justify-between rounded-md border p-3">
                      <div>
                        <FormLabel className="text-sm font-medium">Visible to client</FormLabel>
                        <p className="text-xs text-muted-foreground mt-0.5">Show this option in the client portal</p>
                      </div>
                      <FormControl>
                        <Switch
                          checked={!!field.value}
                          onCheckedChange={field.onChange}
                          data-testid="switch-option-visible"
                        />
                      </FormControl>
                    </FormItem>
                  )}
                />

                <Separator />

                {/* Images */}
                <div className="space-y-2">
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
                    {/* File input for editing an existing option */}
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
                    {/* File input for a new option (staged locally) */}
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

                  {editingOption ? (
                    editingOptionAttachments && editingOptionAttachments.length > 0 ? (
                      <SortableImageGrid
                        attachments={editingOptionAttachments}
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
                    )
                  ) : pendingImages.length > 0 ? (
                    <div className="grid grid-cols-3 gap-2">
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
                      No images yet — they'll be uploaded when you save
                    </div>
                  )}
                </div>

                <div className="flex items-center justify-end space-x-3 pt-4 mt-6 border-t">
                  <Button 
                    type="button" 
                    variant="outline" 
                    onClick={() => handleDialogChange(false)}
                    data-testid="button-cancel-option"
                  >
                    Cancel
                  </Button>
                  <Button 
                    type="submit"
                    disabled={createOptionMutation.isPending || updateOptionMutation.isPending}
                    data-testid="button-save-option"
                  >
                    {(createOptionMutation.isPending || updateOptionMutation.isPending) && (
                      <Loader2 className="w-4 h-4 animate-spin mr-2" />
                    )}
                    {editingOption ? "Update Option" : "Add Option"}
                  </Button>
                </div>
              </form>
            </Form>
          </div>
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
