import { useState, useRef, useMemo, type ReactNode } from "react";
import { useLocation } from "wouter";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { type EstimateTemplate, type CostCode } from "@shared/schema";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Alert, AlertDescription } from "@/components/ui/alert";
import {
  Calculator,
  Plus,
  Search,
  MoreVertical,
  Edit3,
  Trash2,
  Copy,
  Upload,
  Loader2,
  FileSpreadsheet,
  AlertCircle,
  GripVertical,
  StickyNote,
  Clock,
} from "lucide-react";
import { useAuth } from "@/hooks/use-auth";
import { format } from "date-fns";
import * as XLSX from "xlsx";

interface TemplateItem {
  groupName?: string;
  name: string;
  description?: string;
  costCodeId?: string;
  costCodeTitle?: string;
  unit?: string;
  quantity?: number;
  unitPrice?: number;
  markup?: number;
  sortOrder: number;
  isGroup: boolean;
  parentGroupName?: string;
}

interface ColumnMapping {
  groupName: string;
  name: string;
  description: string;
  costCode: string;
  unit: string;
  quantity: string;
  unitPrice: string;
  markup: string;
}

interface LabourTemplate {
  id: string;
  categoryName: string;
  description: string;
  subHeading?: string;
  numMen: number;
  hoursPerMan: number;
  sortOrder: number;
}

interface EnoteTemplateWithRequired {
  id: string;
  groupName: string;
  categoryName: string;
  brainstormNotes?: string;
  isRequired: boolean;
  sortOrder: number;
}

interface EnoteTemplate {
  id: string;
  groupName: string;
  categoryName: string;
  brainstormNotes?: string;
  sortOrder: number;
}

export default function EstimateTemplates() {
  const [, navigate] = useLocation();
  const [activeTab, setActiveTab] = useState<'items' | 'labour' | 'enotes'>('items');
  const [isAddingTemplate, setIsAddingTemplate] = useState(false);
  const [editingTemplate, setEditingTemplate] = useState<EstimateTemplate | null>(null);
  const [searchTerm, setSearchTerm] = useState("");
  // Shared group state (Labour + E-Notes)
  const [selectedGroup, setSelectedGroup] = useState<string>("");
  const [newGroupName, setNewGroupName] = useState("");
  // Labour Hours tab state
  const [editingLabourCell, setEditingLabourCell] = useState<{ id: string; field: string } | null>(null);
  const [labourEditValue, setLabourEditValue] = useState("");
  const [newLabourDesc, setNewLabourDesc] = useState("");
  const [newLabourSubHeading, setNewLabourSubHeading] = useState("");
  const [hiddenSubHeadings, setHiddenSubHeadings] = useState<Set<string>>(new Set());
  // E-Notes tab state
  const [editingEnoteCell, setEditingEnoteCell] = useState<{ id: string; field: string } | null>(null);
  const [enoteEditValue, setEnoteEditValue] = useState("");
  const [newEnoteCategory, setNewEnoteCategory] = useState("");
  const [isImportDialogOpen, setIsImportDialogOpen] = useState(false);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [headers, setHeaders] = useState<string[]>([]);
  const [rawData, setRawData] = useState<any[][]>([]);
  const [headerIndices, setHeaderIndices] = useState<Map<string, number>>(new Map());
  const [columnMapping, setColumnMapping] = useState<ColumnMapping>({
    groupName: "",
    name: "",
    description: "",
    costCode: "",
    unit: "",
    quantity: "",
    unitPrice: "",
    markup: "",
  });
  const [previewData, setPreviewData] = useState<any[]>([]);
  const [importError, setImportError] = useState<string | null>(null);
  const [templateName, setTemplateName] = useState("");
  const [unitPriceIncludesGst, setUnitPriceIncludesGst] = useState<boolean>(false);
  const [templateCategory, setTemplateCategory] = useState("");
  const fileInputRef = useRef<HTMLInputElement>(null);
  const { toast } = useToast();
  const { user } = useAuth();

  const [formData, setFormData] = useState({
    name: "",
    description: "",
    category: "",
  });

  const { data: templates = [], isLoading } = useQuery<EstimateTemplate[]>({
    queryKey: ["/api/estimate-templates"],
  });

  // Labour Hours tab queries — fetch all at once, filter client-side by selectedGroup
  const { data: allLabourTemplates = [] } = useQuery<LabourTemplate[]>({
    queryKey: ["/api/labour-task-templates"],
    queryFn: () => fetch("/api/labour-task-templates", { credentials: "include" }).then(r => r.json()),
    enabled: activeTab === 'labour' || activeTab === 'enotes',
  });

  const addLabourTemplateMutation = useMutation({
    mutationFn: (data: { description: string; categoryName: string; subHeading?: string; numMen?: number; hoursPerMan?: number }) =>
      apiRequest("/api/labour-task-templates", "POST", { ...data, sortOrder: allLabourTemplates.filter(t => t.categoryName === data.categoryName).length }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["/api/labour-task-templates"] }),
    onError: () => toast({ title: "Failed to add template item", variant: "destructive" }),
  });

  const updateLabourTemplateMutation = useMutation({
    mutationFn: ({ id, data }: { id: string; data: Partial<LabourTemplate> }) =>
      apiRequest(`/api/labour-task-templates/${id}`, "PATCH", data),
    onMutate: async ({ id, data }) => {
      await queryClient.cancelQueries({ queryKey: ["/api/labour-task-templates"] });
      const prev = queryClient.getQueryData<LabourTemplate[]>(["/api/labour-task-templates"]);
      queryClient.setQueryData<LabourTemplate[]>(["/api/labour-task-templates"], old =>
        old?.map(t => t.id === id ? { ...t, ...data } : t) ?? []
      );
      return { prev };
    },
    onError: (_e, _v, ctx) => queryClient.setQueryData(["/api/labour-task-templates"], ctx?.prev),
    onSettled: () => queryClient.invalidateQueries({ queryKey: ["/api/labour-task-templates"] }),
  });

  const deleteLabourTemplateMutation = useMutation({
    mutationFn: (id: string) => apiRequest(`/api/labour-task-templates/${id}`, "DELETE"),
    onMutate: async (id) => {
      const prev = queryClient.getQueryData<LabourTemplate[]>(["/api/labour-task-templates"]);
      queryClient.setQueryData<LabourTemplate[]>(["/api/labour-task-templates"], old =>
        old?.filter(t => t.id !== id) ?? []
      );
      return { prev };
    },
    onError: (_e, _v, ctx) => queryClient.setQueryData(["/api/labour-task-templates"], ctx?.prev),
    onSettled: () => queryClient.invalidateQueries({ queryKey: ["/api/labour-task-templates"] }),
  });

  // E-Notes tab queries — always load so group panel works in both Labour and E-Notes
  const { data: enoteTemplates = [] } = useQuery<EnoteTemplate[]>({
    queryKey: ["/api/enote-templates"],
    enabled: activeTab === 'labour' || activeTab === 'enotes',
  });

  const addEnoteTemplateMutation = useMutation({
    mutationFn: (data: { groupName: string; categoryName: string; brainstormNotes?: string }) =>
      apiRequest("/api/enote-templates", "POST", { ...data, sortOrder: enoteTemplates.length }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["/api/enote-templates"] }),
    onError: () => toast({ title: "Failed to add E-Note template", variant: "destructive" }),
  });

  const updateEnoteTemplateMutation = useMutation({
    mutationFn: ({ id, data }: { id: string; data: Partial<EnoteTemplate> }) =>
      apiRequest(`/api/enote-templates/${id}`, "PATCH", data),
    onMutate: async ({ id, data }) => {
      await queryClient.cancelQueries({ queryKey: ["/api/enote-templates"] });
      const prev = queryClient.getQueryData<EnoteTemplate[]>(["/api/enote-templates"]);
      queryClient.setQueryData<EnoteTemplate[]>(["/api/enote-templates"], old =>
        old?.map(t => t.id === id ? { ...t, ...data } : t) ?? []
      );
      return { prev };
    },
    onError: (_e, _v, ctx) => queryClient.setQueryData(["/api/enote-templates"], ctx?.prev),
    onSettled: () => queryClient.invalidateQueries({ queryKey: ["/api/enote-templates"] }),
  });

  const deleteEnoteTemplateMutation = useMutation({
    mutationFn: (id: string) => apiRequest(`/api/enote-templates/${id}`, "DELETE"),
    onMutate: async (id) => {
      const prev = queryClient.getQueryData<EnoteTemplate[]>(["/api/enote-templates"]);
      queryClient.setQueryData<EnoteTemplate[]>(["/api/enote-templates"], old =>
        old?.filter(t => t.id !== id) ?? []
      );
      return { prev };
    },
    onError: (_e, _v, ctx) => queryClient.setQueryData(["/api/enote-templates"], ctx?.prev),
    onSettled: () => queryClient.invalidateQueries({ queryKey: ["/api/enote-templates"] }),
  });

  // Toggle required/not-required for all E-Note rows belonging to a group
  const toggleGroupRequiredMutation = useMutation({
    mutationFn: async ({ groupName, isRequired }: { groupName: string; isRequired: boolean }) => {
      const groupItems = enoteTemplates.filter((t: any) => t.groupName === groupName);
      await Promise.all(groupItems.map((t: any) => apiRequest(`/api/enote-templates/${t.id}`, "PATCH", { isRequired })));
    },
    onMutate: async ({ groupName, isRequired }) => {
      const prev = queryClient.getQueryData<any[]>(["/api/enote-templates"]);
      queryClient.setQueryData<any[]>(["/api/enote-templates"], old =>
        old?.map(t => t.groupName === groupName ? { ...t, isRequired } : t) ?? []
      );
      return { prev };
    },
    onError: (_e, _v, ctx) => queryClient.setQueryData(["/api/enote-templates"], ctx?.prev),
    onSettled: () => queryClient.invalidateQueries({ queryKey: ["/api/enote-templates"] }),
  });

  // Derived: all distinct groups (from E-Notes + Labour) in sorted order
  const { allGroups, labourOnlyGroups } = useMemo(() => {
    const enoteGroupNames = new Set(enoteTemplates.map((t: any) => t.groupName));
    const labourCats = [...new Set(allLabourTemplates.map(t => t.categoryName))].sort();
    const enoteGroupsSorted = [...new Set(enoteTemplates.map((t: any) => t.groupName))].sort();
    // Groups that exist in E-Notes (primary list)
    const merged = [...enoteGroupsSorted];
    // Add labour-only groups (not in E-Notes)
    labourCats.forEach(cat => { if (!enoteGroupNames.has(cat)) merged.push(cat); });
    return { allGroups: merged, labourOnlyGroups: new Set(labourCats.filter(c => !enoteGroupNames.has(c))) };
  }, [enoteTemplates, allLabourTemplates]);

  // Group required status (from E-Notes — first row in group)
  const groupRequiredStatus = useMemo(() => {
    const map = new Map<string, boolean>();
    enoteTemplates.forEach((t: any) => {
      if (!map.has(t.groupName)) map.set(t.groupName, t.isRequired !== false);
    });
    return map;
  }, [enoteTemplates]);

  // Items for the currently selected group
  const groupLabourItems = useMemo(() =>
    allLabourTemplates.filter(t => t.categoryName === selectedGroup),
    [allLabourTemplates, selectedGroup]
  );
  const groupEnoteItems = useMemo(() =>
    enoteTemplates.filter((t: any) => t.groupName === selectedGroup),
    [enoteTemplates, selectedGroup]
  );

  // Fetch cost codes for import matching
  const { data: costCodes = [] } = useQuery<CostCode[]>({
    queryKey: ["/api/cost-codes"],
  });

  // Normalize string for matching: lowercase, collapse whitespace, normalize dashes
  const normalizeForMatch = (str: string): string => {
    return str
      .toLowerCase()
      .trim()
      .replace(/[\u2013\u2014]/g, '-') // Replace en-dash and em-dash with hyphen
      .replace(/\s+/g, ' ') // Collapse multiple spaces
      .replace(/\s*-\s*/g, '-'); // Remove spaces around hyphens
  };

  // Create a map for cost code matching (case-insensitive by code)
  const costCodeMatchMap = useMemo(() => {
    const map = new Map<string, CostCode>();
    costCodes.forEach((cc) => {
      const normalizedCode = normalizeForMatch(cc.code);
      const normalizedTitle = normalizeForMatch(cc.title);
      
      // Index by normalized code
      map.set(normalizedCode, cc);
      // Also index by "code - title" format
      map.set(`${normalizedCode}-${normalizedTitle}`, cc);
      // Also just by title for flexible matching
      map.set(normalizedTitle, cc);
      // Index with space separator too
      map.set(`${normalizedCode} - ${normalizedTitle}`, cc);
    });
    return map;
  }, [costCodes]);

  const matchCostCode = (costCodeStr: string | undefined): { id?: string; display?: string } => {
    if (!costCodeStr) return {};
    const normalized = normalizeForMatch(costCodeStr);
    
    // Direct match
    let matched = costCodeMatchMap.get(normalized);
    
    // If no match, try extracting just the code portion (before first space or dash-title)
    if (!matched) {
      const codeOnlyMatch = normalized.match(/^[\d\w.-]+/);
      if (codeOnlyMatch) {
        matched = costCodeMatchMap.get(normalizeForMatch(codeOnlyMatch[0]));
      }
    }
    
    if (matched) {
      return { 
        id: matched.id, 
        display: `${matched.code} - ${matched.title}` 
      };
    }
    // Return just the display with no ID if no match found
    return { display: costCodeStr.trim() };
  };

  const createMutation = useMutation({
    mutationFn: async (data: { name: string; description?: string; category?: string; templateData?: TemplateItem[] }) => {
      return await apiRequest("/api/estimate-templates", "POST", {
        ...data,
        templateData: data.templateData || [],
        createdBy: user?.id,
        createdByName: user?.firstName && user?.lastName 
          ? `${user.firstName} ${user.lastName}` 
          : user?.email,
      });
    },
    onSuccess: (template: EstimateTemplate) => {
      queryClient.invalidateQueries({ queryKey: ["/api/estimate-templates"] });
      toast({
        title: "Template created",
        description: "Your new estimate template has been created.",
      });
      setIsAddingTemplate(false);
      setFormData({ name: "", description: "", category: "" });
      navigate(`/estimate-templates/${template.id}`);
    },
    onError: () => {
      toast({
        title: "Error",
        description: "Failed to create template.",
        variant: "destructive",
      });
    },
  });

  const updateMutation = useMutation({
    mutationFn: async ({ id, data }: { id: string; data: Partial<EstimateTemplate> }) => {
      return await apiRequest(`/api/estimate-templates/${id}`, "PATCH", data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/estimate-templates"] });
      toast({
        title: "Template updated",
        description: "The template has been updated successfully.",
      });
      setEditingTemplate(null);
      setFormData({ name: "", description: "", category: "" });
    },
    onError: () => {
      toast({
        title: "Error",
        description: "Failed to update template.",
        variant: "destructive",
      });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      await apiRequest(`/api/estimate-templates/${id}`, "DELETE");
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/estimate-templates"] });
      toast({
        title: "Template deleted",
        description: "The template has been deleted successfully.",
      });
    },
    onError: () => {
      toast({
        title: "Error",
        description: "Failed to delete template.",
        variant: "destructive",
      });
    },
  });

  const duplicateMutation = useMutation({
    mutationFn: async (template: EstimateTemplate) => {
      const { id, createdAt, updatedAt, isArchived, ...rest } = template;
      return await apiRequest("/api/estimate-templates", "POST", {
        ...rest,
        name: `${template.name} (Copy)`,
        createdBy: user?.id,
        createdByName: user?.firstName && user?.lastName 
          ? `${user.firstName} ${user.lastName}` 
          : user?.email,
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/estimate-templates"] });
      toast({
        title: "Template duplicated",
        description: "The template has been duplicated successfully.",
      });
    },
    onError: () => {
      toast({
        title: "Error",
        description: "Failed to duplicate template.",
        variant: "destructive",
      });
    },
  });

  const autoDetectColumns = (headers: string[]) => {
    const mapping: ColumnMapping = {
      groupName: "",
      name: "",
      description: "",
      costCode: "",
      unit: "",
      quantity: "",
      unitPrice: "",
      markup: "",
    };

    headers.forEach((header) => {
      if (!header || typeof header !== 'string') return;
      const normalized = header.toLowerCase().trim();
      
      if (normalized.includes('group') || normalized.includes('category') || normalized.includes('stage')) {
        mapping.groupName = header;
      } else if (normalized.includes('item') || normalized.includes('name') || normalized.includes('task')) {
        mapping.name = header;
      } else if (normalized.includes('description') || normalized.includes('desc')) {
        mapping.description = header;
      } else if (normalized.includes('cost') && normalized.includes('code')) {
        mapping.costCode = header;
      } else if (normalized === 'unit' || normalized.includes('uom')) {
        mapping.unit = header;
      } else if (normalized.includes('qty') || normalized.includes('quantity')) {
        mapping.quantity = header;
      } else if (normalized.includes('rate') || normalized.includes('price') || normalized.includes('unit cost')) {
        mapping.unitPrice = header;
      } else if (normalized.includes('markup') || normalized.includes('margin')) {
        mapping.markup = header;
      }
    });

    return mapping;
  };

  const handleFileSelect = (file: File) => {
    if (!file.name.endsWith(".xlsx") && !file.name.endsWith(".xls") && !file.name.endsWith(".csv")) {
      toast({
        title: "Invalid file type",
        description: "Please upload an Excel file (.xlsx, .xls) or CSV file.",
        variant: "destructive",
      });
      return;
    }
    setSelectedFile(file);
    setImportError(null);
    
    const baseName = file.name.replace(/\.(xlsx|xls|csv)$/i, "");
    setTemplateName(baseName);

    const reader = new FileReader();
    reader.onload = (evt) => {
      try {
        const bstr = evt.target?.result;
        const wb = XLSX.read(bstr, { type: "binary" });
        const wsname = wb.SheetNames[0];
        const ws = wb.Sheets[wsname];
        const data = XLSX.utils.sheet_to_json(ws, { header: 1 });

        const rawHeaders = data[0] as any[];
        const rows = data.slice(1) as any[][];

        const validHeaders: string[] = [];
        const indices = new Map<string, number>();
        
        rawHeaders.forEach((h: any, index: number) => {
          const normalized = h ? String(h).trim() : '';
          if (normalized.length > 0) {
            validHeaders.push(normalized);
            indices.set(normalized, index);
          }
        });

        if (validHeaders.length === 0) {
          setImportError("No valid headers found in file.");
          return;
        }

        setHeaders(validHeaders);
        setHeaderIndices(indices);
        setRawData(rows);

        const detectedMapping = autoDetectColumns(validHeaders);
        setColumnMapping(detectedMapping);

        updatePreview(rows, detectedMapping, indices);
      } catch (err) {
        setImportError("Failed to parse file. Please ensure it's a valid Excel or CSV file.");
      }
    };
    reader.readAsBinaryString(file);
  };

  const updatePreview = (rows: any[][], mapping: ColumnMapping, indices: Map<string, number>) => {
    const mapped = rows
      .filter(row => row.some(cell => cell))
      .map((row, idx) => {
        const getColumnValue = (fieldName: keyof ColumnMapping) => {
          const headerName = mapping[fieldName];
          if (!headerName) return "";
          const columnIndex = indices.get(headerName);
          return columnIndex !== undefined ? (row[columnIndex] || "") : "";
        };

        return {
          groupName: getColumnValue('groupName'),
          name: getColumnValue('name'),
          description: getColumnValue('description'),
          costCode: getColumnValue('costCode'),
          unit: getColumnValue('unit'),
          quantity: getColumnValue('quantity'),
          unitPrice: getColumnValue('unitPrice'),
          markup: getColumnValue('markup'),
          sortOrder: idx,
        };
      });

    setPreviewData(mapped);
  };

  const handleColumnMappingChange = (field: keyof ColumnMapping, value: string) => {
    const newMapping = { ...columnMapping, [field]: value === "__none__" ? "" : value };
    setColumnMapping(newMapping);
    updatePreview(rawData, newMapping, headerIndices);
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    const file = e.dataTransfer.files[0];
    if (file) handleFileSelect(file);
  };

  const formatCurrency = (cents: number | undefined) => {
    if (!cents) return "$0.00";
    return `$${(cents / 100).toFixed(2)}`;
  };

  const handleImport = () => {
    if (!templateName.trim()) {
      setImportError("Please enter a template name.");
      return;
    }
    if (previewData.length === 0) {
      setImportError("No data to import.");
      return;
    }
    if (!columnMapping.name) {
      setImportError("Please map the Item Name column.");
      return;
    }

    const templateItems: TemplateItem[] = previewData
      .filter(row => row.name)
      .map((row, idx) => {
        // Match cost code to company cost codes
        const costCodeMatch = matchCostCode(row.costCode ? String(row.costCode) : undefined);
        
        return {
          id: crypto.randomUUID(), // CRITICAL: Generate unique ID for each item
          groupName: row.groupName ? String(row.groupName).trim() : undefined,
          name: String(row.name).trim(),
          description: row.description ? String(row.description).trim() : undefined,
          costCodeId: costCodeMatch.id,
          costCodeTitle: costCodeMatch.display,
          unit: row.unit ? String(row.unit).trim() : undefined,
          quantity: row.quantity ? parseFloat(String(row.quantity)) || 1 : undefined,
          unitPrice: row.unitPrice ? (() => {
            let price = parseFloat(String(row.unitPrice)) || 0;
            if (unitPriceIncludesGst) {
              price = price / 1.1;
            }
            return Math.round(price * 100);
          })() : undefined,
          markup: row.markup ? parseFloat(String(row.markup)) || 0 : undefined,
          sortOrder: idx,
          isGroup: false,
        };
      });

    createMutation.mutate({
      name: templateName.trim(),
      description: `Imported from ${selectedFile?.name}`,
      category: templateCategory || undefined,
      templateData: templateItems,
    }, {
      onSuccess: () => {
        setIsImportDialogOpen(false);
        setSelectedFile(null);
        setPreviewData([]);
        setHeaders([]);
        setTemplateName("");
        setTemplateCategory("");
        setColumnMapping({
          groupName: "",
          name: "",
          description: "",
          costCode: "",
          unit: "",
          quantity: "",
          unitPrice: "",
          markup: "",
        });
      },
    });
  };

  const handleOpenAdd = () => {
    setFormData({ name: "", description: "", category: "" });
    setIsAddingTemplate(true);
  };

  const handleOpenEdit = (template: EstimateTemplate) => {
    setFormData({
      name: template.name,
      description: template.description || "",
      category: template.category || "",
    });
    setEditingTemplate(template);
  };

  const handleSave = () => {
    if (!formData.name.trim()) {
      toast({
        title: "Validation error",
        description: "Template name is required.",
        variant: "destructive",
      });
      return;
    }

    if (editingTemplate) {
      updateMutation.mutate({
        id: editingTemplate.id,
        data: {
          name: formData.name.trim(),
          description: formData.description.trim() || undefined,
          category: formData.category || undefined,
        },
      });
    } else {
      createMutation.mutate({
        name: formData.name.trim(),
        description: formData.description.trim() || undefined,
        category: formData.category || undefined,
      });
    }
  };

  const filteredTemplates = templates
    .filter(template =>
      template.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      template.description?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      template.category?.toLowerCase().includes(searchTerm.toLowerCase())
    )
    .sort((a, b) => a.name.localeCompare(b.name));

  const getItemCount = (template: EstimateTemplate) => {
    const data = template.templateData as TemplateItem[] | null;
    return data?.length || 0;
  };

  const getCategoryColor = (category: string | null) => {
    switch (category?.toLowerCase()) {
      case "residential": return "bg-green-500/10 text-green-700 dark:text-green-400";
      case "commercial": return "bg-blue-500/10 text-blue-700 dark:text-blue-400";
      case "renovation": return "bg-orange-500/10 text-orange-700 dark:text-orange-400";
      default: return "bg-gray-500/10 text-gray-700 dark:text-gray-400";
    }
  };

  return (
    <div className="h-full flex flex-col">
      {/* Row 1 - Title */}
      <div className="h-9 bg-background flex items-center px-2 gap-4 flex-shrink-0 border-b border-border">
        <div className="flex items-center gap-3">
          <h2 className="text-sm font-semibold" data-testid="text-page-title">
            Estimate Templates
          </h2>
        </div>
      </div>

      {/* Tab navigation */}
      <div className="h-9 bg-background flex items-center border-b border-border flex-shrink-0 px-2 gap-0">
        {(['items', 'labour', 'enotes'] as const).map(tab => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab)}
            className={`h-9 px-4 text-xs font-medium border-b-2 transition-colors flex items-center gap-1.5 ${
              activeTab === tab ? 'border-[#bba7db] text-foreground' : 'border-transparent text-muted-foreground hover:text-foreground'
            }`}
          >
            {tab === 'items' && <Calculator className="w-3 h-3" />}
            {tab === 'labour' && <Clock className="w-3 h-3" />}
            {tab === 'enotes' && <StickyNote className="w-3 h-3" />}
            {tab === 'items' ? 'Estimate Items' : tab === 'labour' ? 'Labour Hours' : 'E-Notes'}
          </button>
        ))}
        <div className="flex-1" />
        {activeTab === 'items' && (
          <div className="flex items-center gap-1.5">
            <div className="relative w-40">
              <Search className="absolute left-2 top-1/2 -translate-y-1/2 w-3 h-3 text-muted-foreground" />
              <Input
                placeholder="Search..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="pl-7 pr-2 py-0 h-6 text-xs border"
                data-testid="input-search-templates"
              />
            </div>
            <button
              className="h-6 w-auto px-2 text-xs border rounded-md hover-elevate active-elevate-2 flex items-center gap-0.5"
              onClick={() => setIsImportDialogOpen(true)}
              data-testid="button-import-templates"
            >
              <Upload className="w-3 h-3" />
              <span>Import</span>
            </button>
            <button
              className="h-6 w-auto px-2 text-xs border rounded-md bg-[#bba7db] text-white border-[#bba7db]/20 active-elevate-2 flex items-center gap-0.5"
              onClick={handleOpenAdd}
              data-testid="button-add-template"
            >
              <Plus className="w-3 h-3" />
              <span>New Template</span>
            </button>
          </div>
        )}
      </div>

      {/* Labour Hours Tab — split panel */}
      {activeTab === 'labour' && (
        <div className="flex-1 flex min-h-0 overflow-hidden">
          {/* LEFT: Groups panel */}
          <div className="w-52 flex-shrink-0 border-r border-border flex flex-col bg-muted/20">
            <div className="px-3 py-2 border-b border-border/50 flex items-center justify-between flex-shrink-0">
              <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Groups</span>
            </div>
            <div className="flex-1 overflow-y-auto">
              {allGroups.length === 0 && (
                <div className="px-3 py-4 text-xs text-muted-foreground italic">No groups yet</div>
              )}
              {allGroups.map(group => {
                const isSelected = selectedGroup === group;
                const labourCount = allLabourTemplates.filter(t => t.categoryName === group).length;
                const isRequired = groupRequiredStatus.get(group);
                const hasEnotes = !labourOnlyGroups.has(group);
                return (
                  <button key={group} onClick={() => setSelectedGroup(group)}
                    className={`w-full text-left px-3 py-2 flex flex-col gap-0.5 border-b border-border/20 transition-colors hover-elevate ${isSelected ? 'bg-[#bba7db]/15 text-foreground' : 'text-muted-foreground hover:text-foreground'}`}>
                    <span className="text-xs font-medium truncate w-full">{group}</span>
                    <div className="flex items-center gap-1.5">
                      {labourCount > 0 && <span className="text-[10px] text-muted-foreground">{labourCount} item{labourCount !== 1 ? 's' : ''}</span>}
                      {hasEnotes && isRequired !== undefined && (
                        <span className={`text-[9px] px-1 rounded font-medium ${isRequired ? 'bg-green-500/15 text-green-700 dark:text-green-400' : 'bg-muted text-muted-foreground'}`}>
                          {isRequired ? 'Required' : 'Not req.'}
                        </span>
                      )}
                    </div>
                  </button>
                );
              })}
            </div>
            {/* Add new group */}
            <div className="border-t border-border/50 p-2 flex-shrink-0 flex gap-1">
              <Input placeholder="New group…" value={newGroupName} onChange={e => setNewGroupName(e.target.value)}
                onKeyDown={e => {
                  if (e.key === 'Enter' && newGroupName.trim()) {
                    addEnoteTemplateMutation.mutate({ groupName: newGroupName.trim(), categoryName: "" });
                    setSelectedGroup(newGroupName.trim());
                    setNewGroupName("");
                  }
                }}
                className="h-6 text-xs flex-1" />
              <button
                onClick={() => {
                  if (newGroupName.trim()) {
                    addEnoteTemplateMutation.mutate({ groupName: newGroupName.trim(), categoryName: "" });
                    setSelectedGroup(newGroupName.trim());
                    setNewGroupName("");
                  }
                }}
                className="h-6 w-6 flex items-center justify-center border rounded text-muted-foreground hover-elevate flex-shrink-0"
              >
                <Plus className="w-3 h-3" />
              </button>
            </div>
          </div>

          {/* RIGHT: Items for selected group */}
          <div className="flex-1 flex flex-col min-h-0 overflow-hidden">
            {!selectedGroup ? (
              <div className="flex-1 flex items-center justify-center text-sm text-muted-foreground flex-col gap-2">
                <Clock className="w-8 h-8 text-muted-foreground/40" />
                <p className="text-xs">Select a group to manage its labour hours</p>
              </div>
            ) : (
              <>
                {/* Column headers */}
                <div className="grid px-4 py-1.5 text-[10px] font-medium text-muted-foreground uppercase tracking-wide bg-muted/30 border-b border-border/50 flex-shrink-0"
                  style={{ gridTemplateColumns: "1fr 90px 70px 80px 32px" }}>
                  <span>Description</span>
                  <span>Sub-Heading</span>
                  <span className="text-center">No. Men</span>
                  <span className="text-center">Hrs / Man</span>
                  <span />
                </div>
                <div className="flex-1 overflow-y-auto">
                  {(() => {
                    const items = groupLabourItems;
                    if (items.length === 0) return (
                      <div className="flex items-center justify-center h-24 text-xs text-muted-foreground italic">
                        No items yet — add one below
                      </div>
                    );
                    // Group by subHeading to render separator rows
                    const rendered: ReactNode[] = [];
                    let lastSubHeading: string | null | undefined = undefined;
                    items.forEach(t => {
                      const sh = t.subHeading || "";
                      if (sh !== lastSubHeading) {
                        lastSubHeading = sh;
                        if (sh) {
                          rendered.push(
                            <div key={`sh-${sh}`} className="flex items-center gap-2 px-4 py-1 bg-muted/40 border-b border-border/30">
                              {editingLabourCell?.id === `sh-${sh}` ? (
                                <Input autoFocus value={labourEditValue} onChange={e => setLabourEditValue(e.target.value)}
                                  onBlur={() => {
                                    // rename all items in this subHeading
                                    items.filter(i => i.subHeading === sh).forEach(i =>
                                      updateLabourTemplateMutation.mutate({ id: i.id, data: { subHeading: labourEditValue } })
                                    );
                                    setEditingLabourCell(null);
                                  }}
                                  onKeyDown={e => {
                                    if (e.key === 'Enter' || e.key === 'Escape') {
                                      if (e.key === 'Enter') {
                                        items.filter(i => i.subHeading === sh).forEach(i =>
                                          updateLabourTemplateMutation.mutate({ id: i.id, data: { subHeading: labourEditValue } })
                                        );
                                      }
                                      setEditingLabourCell(null);
                                    }
                                  }}
                                  className="h-5 text-xs focus-visible:ring-0 border-primary flex-1" />
                              ) : (
                                <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground cursor-pointer hover:text-foreground"
                                  onClick={() => { setEditingLabourCell({ id: `sh-${sh}`, field: 'subHeading' }); setLabourEditValue(sh); }}>
                                  {sh}
                                </span>
                              )}
                            </div>
                          );
                        }
                      }
                      rendered.push(
                        <div key={t.id} className="grid items-center border-b border-border/10 group/lrow min-h-[34px] px-4"
                          style={{ gridTemplateColumns: "1fr 90px 70px 80px 32px" }}>
                          {/* Description */}
                          <div className="pr-2 py-0.5">
                            {editingLabourCell?.id === t.id && editingLabourCell.field === 'description' ? (
                              <Input autoFocus value={labourEditValue} onChange={e => setLabourEditValue(e.target.value)}
                                onBlur={() => { updateLabourTemplateMutation.mutate({ id: t.id, data: { description: labourEditValue } }); setEditingLabourCell(null); }}
                                onKeyDown={e => { if (e.key === 'Enter' || e.key === 'Escape') { if (e.key === 'Enter') updateLabourTemplateMutation.mutate({ id: t.id, data: { description: labourEditValue } }); setEditingLabourCell(null); } }}
                                className="h-6 text-sm focus-visible:ring-0 border-primary" />
                            ) : (
                              <span className="text-sm cursor-pointer hover:text-foreground truncate block"
                                onClick={() => { setEditingLabourCell({ id: t.id, field: 'description' }); setLabourEditValue(t.description); }}>
                                {t.description || <span className="text-muted-foreground italic text-xs">Click to edit…</span>}
                              </span>
                            )}
                          </div>
                          {/* Sub-heading */}
                          <div className="pr-2 py-0.5">
                            {editingLabourCell?.id === t.id && editingLabourCell.field === 'subHeading' ? (
                              <Input autoFocus value={labourEditValue} onChange={e => setLabourEditValue(e.target.value)}
                                onBlur={() => { updateLabourTemplateMutation.mutate({ id: t.id, data: { subHeading: labourEditValue || null } }); setEditingLabourCell(null); }}
                                onKeyDown={e => { if (e.key === 'Enter' || e.key === 'Escape') { if (e.key === 'Enter') updateLabourTemplateMutation.mutate({ id: t.id, data: { subHeading: labourEditValue || null } }); setEditingLabourCell(null); } }}
                                className="h-6 text-xs focus-visible:ring-0 border-primary" />
                            ) : (
                              <span className="text-xs cursor-pointer text-muted-foreground hover:text-foreground truncate block"
                                onClick={() => { setEditingLabourCell({ id: t.id, field: 'subHeading' }); setLabourEditValue(t.subHeading || ""); }}>
                                {t.subHeading || <span className="italic text-[10px]">—</span>}
                              </span>
                            )}
                          </div>
                          {/* No. Men */}
                          <div className="flex justify-center">
                            {editingLabourCell?.id === t.id && editingLabourCell.field === 'numMen' ? (
                              <Input autoFocus value={labourEditValue} onChange={e => setLabourEditValue(e.target.value)}
                                onBlur={() => { updateLabourTemplateMutation.mutate({ id: t.id, data: { numMen: parseFloat(labourEditValue) || 1 } }); setEditingLabourCell(null); }}
                                onKeyDown={e => { if (e.key === 'Enter' || e.key === 'Escape') { if (e.key === 'Enter') updateLabourTemplateMutation.mutate({ id: t.id, data: { numMen: parseFloat(labourEditValue) || 1 } }); setEditingLabourCell(null); } }}
                                className="h-6 text-sm text-center focus-visible:ring-0 border-primary w-14" />
                            ) : (
                              <span className="text-sm cursor-pointer text-center w-full"
                                onClick={() => { setEditingLabourCell({ id: t.id, field: 'numMen' }); setLabourEditValue(String(t.numMen)); }}>
                                {t.numMen}
                              </span>
                            )}
                          </div>
                          {/* Hrs/Man */}
                          <div className="flex justify-center">
                            {editingLabourCell?.id === t.id && editingLabourCell.field === 'hoursPerMan' ? (
                              <Input autoFocus value={labourEditValue} onChange={e => setLabourEditValue(e.target.value)}
                                onBlur={() => { updateLabourTemplateMutation.mutate({ id: t.id, data: { hoursPerMan: parseFloat(labourEditValue) || 0 } }); setEditingLabourCell(null); }}
                                onKeyDown={e => { if (e.key === 'Enter' || e.key === 'Escape') { if (e.key === 'Enter') updateLabourTemplateMutation.mutate({ id: t.id, data: { hoursPerMan: parseFloat(labourEditValue) || 0 } }); setEditingLabourCell(null); } }}
                                className="h-6 text-sm text-center focus-visible:ring-0 border-primary w-20" />
                            ) : (
                              <span className="text-sm cursor-pointer text-center w-full"
                                onClick={() => { setEditingLabourCell({ id: t.id, field: 'hoursPerMan' }); setLabourEditValue(String(t.hoursPerMan)); }}>
                                {t.hoursPerMan}
                              </span>
                            )}
                          </div>
                          {/* Delete */}
                          <div className="flex justify-center opacity-0 group-hover/lrow:opacity-100 transition-opacity">
                            <button onClick={() => deleteLabourTemplateMutation.mutate(t.id)}
                              className="h-5 w-5 flex items-center justify-center text-muted-foreground hover:text-destructive rounded">
                              <Trash2 className="w-3 h-3" />
                            </button>
                          </div>
                        </div>
                      );
                    });
                    return rendered;
                  })()}
                </div>
                {/* Add row */}
                <div className="flex items-center gap-2 px-4 py-2 border-t border-border/30 flex-shrink-0">
                  <Input placeholder="Description…" value={newLabourDesc} onChange={e => setNewLabourDesc(e.target.value)}
                    onKeyDown={e => { if (e.key === 'Enter' && newLabourDesc.trim()) { addLabourTemplateMutation.mutate({ description: newLabourDesc.trim(), categoryName: selectedGroup, subHeading: newLabourSubHeading || undefined }); setNewLabourDesc(""); } }}
                    className="h-7 text-sm flex-1" />
                  <Input placeholder="Sub-heading (optional)" value={newLabourSubHeading} onChange={e => setNewLabourSubHeading(e.target.value)}
                    className="h-7 text-xs w-36" />
                  <Button size="sm" variant="outline" className="h-7 px-3 text-xs"
                    onClick={() => { if (newLabourDesc.trim()) { addLabourTemplateMutation.mutate({ description: newLabourDesc.trim(), categoryName: selectedGroup, subHeading: newLabourSubHeading || undefined }); setNewLabourDesc(""); } }}>
                    <Plus className="w-3 h-3 mr-1" />Add
                  </Button>
                </div>
              </>
            )}
          </div>
        </div>
      )}

      {/* E-Notes Tab — split panel mirroring Labour layout */}
      {activeTab === 'enotes' && (
        <div className="flex-1 flex min-h-0 overflow-hidden">
          {/* LEFT: Groups panel */}
          <div className="w-52 flex-shrink-0 border-r border-border flex flex-col bg-muted/20">
            <div className="px-3 py-2 border-b border-border/50 flex items-center justify-between flex-shrink-0">
              <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Groups</span>
            </div>
            <div className="flex-1 overflow-y-auto">
              {allGroups.length === 0 && (
                <div className="px-3 py-4 text-xs text-muted-foreground italic">No groups yet</div>
              )}
              {allGroups.map(group => {
                const isSelected = selectedGroup === group;
                const enoteCount = enoteTemplates.filter((t: any) => t.groupName === group && t.categoryName).length;
                const isRequired = groupRequiredStatus.get(group);
                const hasEnotes = !labourOnlyGroups.has(group);
                return (
                  <button key={group} onClick={() => setSelectedGroup(group)}
                    className={`w-full text-left px-3 py-2 flex flex-col gap-0.5 border-b border-border/20 transition-colors hover-elevate ${isSelected ? 'bg-[#bba7db]/15 text-foreground' : 'text-muted-foreground hover:text-foreground'}`}>
                    <div className="flex items-center justify-between gap-1 w-full">
                      <span className="text-xs font-medium truncate">{group}</span>
                      {hasEnotes && (
                        <button
                          onClick={e => {
                            e.stopPropagation();
                            toggleGroupRequiredMutation.mutate({ groupName: group, isRequired: !(isRequired !== false) });
                          }}
                          className={`text-[9px] px-1.5 py-0.5 rounded font-medium flex-shrink-0 border transition-colors ${
                            isRequired !== false
                              ? 'bg-green-500/15 text-green-700 dark:text-green-400 border-green-500/20'
                              : 'bg-muted text-muted-foreground border-border'
                          }`}
                          title="Click to toggle Required/Not Required"
                        >
                          {isRequired !== false ? 'Required' : 'Not Req.'}
                        </button>
                      )}
                    </div>
                    {enoteCount > 0 && <span className="text-[10px] text-muted-foreground">{enoteCount} categor{enoteCount !== 1 ? 'ies' : 'y'}</span>}
                  </button>
                );
              })}
            </div>
            {/* Add new group */}
            <div className="border-t border-border/50 p-2 flex-shrink-0 flex gap-1">
              <Input placeholder="New group…" value={newGroupName} onChange={e => setNewGroupName(e.target.value)}
                onKeyDown={e => {
                  if (e.key === 'Enter' && newGroupName.trim()) {
                    addEnoteTemplateMutation.mutate({ groupName: newGroupName.trim(), categoryName: "" });
                    setSelectedGroup(newGroupName.trim());
                    setNewGroupName("");
                  }
                }}
                className="h-6 text-xs flex-1" />
              <button
                onClick={() => {
                  if (newGroupName.trim()) {
                    addEnoteTemplateMutation.mutate({ groupName: newGroupName.trim(), categoryName: "" });
                    setSelectedGroup(newGroupName.trim());
                    setNewGroupName("");
                  }
                }}
                className="h-6 w-6 flex items-center justify-center border rounded text-muted-foreground hover-elevate flex-shrink-0"
              >
                <Plus className="w-3 h-3" />
              </button>
            </div>
          </div>

          {/* RIGHT: Categories for selected group */}
          <div className="flex-1 flex flex-col min-h-0 overflow-hidden">
            {!selectedGroup ? (
              <div className="flex-1 flex items-center justify-center text-sm text-muted-foreground flex-col gap-2">
                <StickyNote className="w-8 h-8 text-muted-foreground/40" />
                <p className="text-xs">Select a group to manage its E-Notes categories</p>
              </div>
            ) : (
              <>
                {/* Column headers */}
                <div className="grid px-4 py-1.5 text-[10px] font-medium text-muted-foreground uppercase tracking-wide bg-muted/30 border-b border-border/50 flex-shrink-0"
                  style={{ gridTemplateColumns: "1fr 1fr 32px" }}>
                  <span>Category</span>
                  <span>Default Notes</span>
                  <span />
                </div>
                <div className="flex-1 overflow-y-auto">
                  {groupEnoteItems.filter((t: any) => t.categoryName).length === 0 && (
                    <div className="flex items-center justify-center h-24 text-xs text-muted-foreground italic">
                      No categories yet — add one below
                    </div>
                  )}
                  {groupEnoteItems.filter((t: any) => t.categoryName).map((t: any) => (
                    <div key={t.id} className="grid items-center border-b border-border/10 group/erow min-h-[34px] px-4"
                      style={{ gridTemplateColumns: "1fr 1fr 32px" }}>
                      {/* Category */}
                      <div className="pr-2 py-0.5">
                        {editingEnoteCell?.id === t.id && editingEnoteCell.field === 'categoryName' ? (
                          <Input autoFocus value={enoteEditValue} onChange={e => setEnoteEditValue(e.target.value)}
                            onBlur={() => { updateEnoteTemplateMutation.mutate({ id: t.id, data: { categoryName: enoteEditValue } }); setEditingEnoteCell(null); }}
                            onKeyDown={e => { if (e.key === 'Enter' || e.key === 'Escape') { if (e.key === 'Enter') updateEnoteTemplateMutation.mutate({ id: t.id, data: { categoryName: enoteEditValue } }); setEditingEnoteCell(null); } }}
                            className="h-6 text-xs focus-visible:ring-0 border-primary" />
                        ) : (
                          <span className="text-sm cursor-pointer hover:text-foreground truncate block"
                            onClick={() => { setEditingEnoteCell({ id: t.id, field: 'categoryName' }); setEnoteEditValue(t.categoryName); }}>
                            {t.categoryName || <span className="italic text-muted-foreground text-xs">Click to edit…</span>}
                          </span>
                        )}
                      </div>
                      {/* Notes */}
                      <div className="pr-2 py-0.5">
                        {editingEnoteCell?.id === t.id && editingEnoteCell.field === 'brainstormNotes' ? (
                          <Input autoFocus value={enoteEditValue} onChange={e => setEnoteEditValue(e.target.value)}
                            onBlur={() => { updateEnoteTemplateMutation.mutate({ id: t.id, data: { brainstormNotes: enoteEditValue } }); setEditingEnoteCell(null); }}
                            onKeyDown={e => { if (e.key === 'Enter' || e.key === 'Escape') { if (e.key === 'Enter') updateEnoteTemplateMutation.mutate({ id: t.id, data: { brainstormNotes: enoteEditValue } }); setEditingEnoteCell(null); } }}
                            className="h-6 text-xs focus-visible:ring-0 border-primary" />
                        ) : (
                          <span className="text-xs cursor-pointer hover:text-foreground truncate block text-muted-foreground"
                            onClick={() => { setEditingEnoteCell({ id: t.id, field: 'brainstormNotes' }); setEnoteEditValue(t.brainstormNotes ?? ""); }}>
                            {t.brainstormNotes || <span className="italic">Click to add notes…</span>}
                          </span>
                        )}
                      </div>
                      {/* Delete */}
                      <div className="flex justify-center opacity-0 group-hover/erow:opacity-100 transition-opacity">
                        <button onClick={() => deleteEnoteTemplateMutation.mutate(t.id)}
                          className="h-5 w-5 flex items-center justify-center text-muted-foreground hover:text-destructive rounded">
                          <Trash2 className="w-3 h-3" />
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
                {/* Add row */}
                <div className="flex items-center gap-2 px-4 py-2 border-t border-border/30 flex-shrink-0">
                  <Input placeholder="Category name…" value={newEnoteCategory} onChange={e => setNewEnoteCategory(e.target.value)}
                    onKeyDown={e => { if (e.key === 'Enter' && newEnoteCategory.trim()) { addEnoteTemplateMutation.mutate({ groupName: selectedGroup, categoryName: newEnoteCategory.trim() }); setNewEnoteCategory(""); } }}
                    className="h-7 text-sm flex-1" />
                  <Button size="sm" variant="outline" className="h-7 px-3 text-xs"
                    onClick={() => { if (newEnoteCategory.trim()) { addEnoteTemplateMutation.mutate({ groupName: selectedGroup, categoryName: newEnoteCategory.trim() }); setNewEnoteCategory(""); } }}>
                    <Plus className="w-3 h-3 mr-1" />Add
                  </Button>
                </div>
              </>
            )}
          </div>
        </div>
      )}

      {/* Estimate Items Tab (existing content) */}
      {activeTab === 'items' && <div className="flex-1 overflow-auto p-4">
        {isLoading ? (
          <div className="text-center py-8 text-muted-foreground text-sm">
            Loading templates...
          </div>
        ) : filteredTemplates.length === 0 ? (
          <div className="text-center py-8">
            <Calculator className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
            <h3 className="text-sm font-medium mb-2">
              {searchTerm ? "No templates found" : "No templates yet"}
            </h3>
            <p className="text-xs text-muted-foreground mb-4">
              {searchTerm
                ? "Try adjusting your search terms"
                : "Start by adding your first estimate template or import from Excel"}
            </p>
            {!searchTerm && (
              <div className="flex items-center gap-2 justify-center">
                <button 
                  onClick={() => setIsImportDialogOpen(true)} 
                  className="h-6 px-2 text-xs border rounded-md hover-elevate active-elevate-2 flex items-center gap-0.5"
                  data-testid="button-import-first-template"
                >
                  <Upload className="h-3 w-3" />
                  Import from Excel
                </button>
                <button 
                  onClick={handleOpenAdd} 
                  className="h-6 px-2 text-xs border rounded-md bg-[#bba7db] text-white border-[#bba7db]/20 hover:bg-[#bba7db]/90 active-elevate-2 flex items-center gap-0.5"
                  data-testid="button-create-first-template"
                >
                  <Plus className="h-3 w-3" />
                  Create Manually
                </button>
              </div>
            )}
          </div>
        ) : (
          <div className="space-y-2">
            {filteredTemplates.map((template) => (
              <div 
                key={template.id} 
                className="group border rounded-md p-2 bg-card hover-elevate transition-all cursor-pointer"
                onClick={() => navigate(`/estimate-templates/${template.id}`)}
                data-testid={`card-template-${template.id}`}
              >
                <div className="flex items-start gap-2">
                  <div className="flex-1 min-w-0">
                    <h3 className="font-semibold text-sm mb-1 line-clamp-1">
                      {template.name}
                    </h3>
                    {template.description && (
                      <p className="text-xs text-muted-foreground line-clamp-1">
                        {template.description}
                      </p>
                    )}
                  </div>
                  
                  <div className="flex items-center gap-2 flex-shrink-0">
                    {template.category && (
                      <Badge 
                        variant="secondary" 
                        className={`h-4 px-1.5 text-[10px] ${getCategoryColor(template.category)}`}
                      >
                        {template.category}
                      </Badge>
                    )}

                    <Badge variant="outline" className="h-4 px-1.5 text-[10px]">
                      {getItemCount(template)} {getItemCount(template) === 1 ? 'item' : 'items'}
                    </Badge>
                    
                    <div className="flex items-center gap-1 text-[10px] text-muted-foreground">
                      <span>
                        {format(new Date(template.updatedAt), "MMM d, yyyy")}
                      </span>
                    </div>
                    
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-6 w-6 opacity-0 group-hover:opacity-100 transition-opacity"
                          onClick={(e) => e.stopPropagation()}
                          data-testid={`button-menu-${template.id}`}
                        >
                          <MoreVertical className="h-3 w-3" />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        <DropdownMenuItem
                          onClick={(e) => {
                            e.stopPropagation();
                            handleOpenEdit(template);
                          }}
                          data-testid={`button-edit-${template.id}`}
                        >
                          <Edit3 className="h-4 w-4 mr-2" />
                          Edit
                        </DropdownMenuItem>
                        <DropdownMenuItem
                          onClick={(e) => {
                            e.stopPropagation();
                            duplicateMutation.mutate(template);
                          }}
                          data-testid={`button-duplicate-${template.id}`}
                        >
                          <Copy className="h-4 w-4 mr-2" />
                          Duplicate
                        </DropdownMenuItem>
                        <DropdownMenuItem
                          onClick={(e) => {
                            e.stopPropagation();
                            deleteMutation.mutate(template.id);
                          }}
                          className="text-destructive"
                          data-testid={`button-delete-${template.id}`}
                        >
                          <Trash2 className="h-4 w-4 mr-2" />
                          Delete
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>}

      {/* Add/Edit Template Dialog */}
      <Dialog 
        open={isAddingTemplate || !!editingTemplate} 
        onOpenChange={(open) => {
          if (!open) {
            setIsAddingTemplate(false);
            setEditingTemplate(null);
            setFormData({ name: "", description: "", category: "" });
          }
        }}
      >
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>
              {editingTemplate ? "Edit Estimate Template" : "New Estimate Template"}
            </DialogTitle>
            <DialogDescription>
              {editingTemplate 
                ? "Update the template details below."
                : "Create a new estimate template to reuse across projects."}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="name">Template Name *</Label>
              <Input
                id="name"
                value={formData.name}
                onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                placeholder="e.g., Standard 4-Bed Build"
                data-testid="input-template-name"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="description">Description</Label>
              <Textarea
                id="description"
                value={formData.description}
                onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                placeholder="Brief description of the template..."
                rows={3}
                data-testid="textarea-template-description"
              />
            </div>
          </div>

          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => {
                setIsAddingTemplate(false);
                setEditingTemplate(null);
                setFormData({ name: "", description: "", category: "" });
              }}
            >
              Cancel
            </Button>
            <Button
              onClick={handleSave}
              disabled={createMutation.isPending || updateMutation.isPending}
              data-testid="button-save-template"
            >
              {(createMutation.isPending || updateMutation.isPending) ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Saving...
                </>
              ) : editingTemplate ? (
                "Update Template"
              ) : (
                "Create Template"
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Import Dialog */}
      <Dialog 
        open={isImportDialogOpen} 
        onOpenChange={(open) => {
          setIsImportDialogOpen(open);
          if (!open) {
            setSelectedFile(null);
            setPreviewData([]);
            setHeaders([]);
            setImportError(null);
            setTemplateName("");
            setTemplateCategory("");
          }
        }}
      >
        <DialogContent className="max-w-4xl max-h-[90vh] overflow-hidden flex flex-col">
          <DialogHeader className="flex-shrink-0">
            <DialogTitle>Import Estimate Template</DialogTitle>
            <DialogDescription>
              Upload an Excel file containing your estimate line items with groups, cost codes, and pricing.
            </DialogDescription>
          </DialogHeader>

          <div className="flex-1 overflow-y-auto space-y-4 py-4">
            <input
              type="file"
              ref={fileInputRef}
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file) handleFileSelect(file);
              }}
              accept=".xlsx,.xls,.csv"
              className="hidden"
              data-testid="input-file-upload"
            />

            {selectedFile && (
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="import-template-name">Template Name *</Label>
                  <Input
                    id="import-template-name"
                    value={templateName}
                    onChange={(e) => setTemplateName(e.target.value)}
                    placeholder="e.g., Standard Residential Build"
                    data-testid="input-import-template-name"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="import-template-category">Category</Label>
                  <Select value={templateCategory} onValueChange={setTemplateCategory}>
                    <SelectTrigger id="import-template-category" data-testid="select-import-template-category">
                      <SelectValue placeholder="Select category" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="Residential">Residential</SelectItem>
                      <SelectItem value="Commercial">Commercial</SelectItem>
                      <SelectItem value="Renovation">Renovation</SelectItem>
                      <SelectItem value="Extension">Extension</SelectItem>
                      <SelectItem value="Custom">Custom</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
            )}

            <div
              onDragOver={handleDragOver}
              onDragLeave={handleDragLeave}
              onDrop={handleDrop}
              onClick={() => fileInputRef.current?.click()}
              className={`border-2 border-dashed rounded-lg p-6 text-center cursor-pointer transition-colors ${
                isDragging
                  ? "border-primary bg-primary/5"
                  : selectedFile
                  ? "border-green-500 bg-green-500/5"
                  : "border-muted-foreground/25 hover:border-muted-foreground/50"
              }`}
              data-testid="dropzone-file-upload"
            >
              {selectedFile ? (
                <div className="flex flex-col items-center gap-2">
                  <FileSpreadsheet className="h-8 w-8 text-green-500" />
                  <p className="font-medium text-sm">{selectedFile.name}</p>
                  <p className="text-xs text-muted-foreground">
                    {(selectedFile.size / 1024).toFixed(1)} KB
                  </p>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={(e) => {
                      e.stopPropagation();
                      setSelectedFile(null);
                      setPreviewData([]);
                      setHeaders([]);
                    }}
                  >
                    Choose a different file
                  </Button>
                </div>
              ) : (
                <div className="flex flex-col items-center gap-2">
                  <Upload className="h-8 w-8 text-muted-foreground" />
                  <p className="font-medium text-sm">Drop your Excel file here</p>
                  <p className="text-xs text-muted-foreground">
                    or click to browse
                  </p>
                </div>
              )}
            </div>

            {importError && (
              <Alert variant="destructive">
                <AlertCircle className="h-4 w-4" />
                <AlertDescription>{importError}</AlertDescription>
              </Alert>
            )}

            {headers.length > 0 && (
              <div className="space-y-3 p-4 border rounded-md bg-muted/50">
                <Label className="text-sm font-medium">Map Your Columns</Label>
                <p className="text-xs text-muted-foreground">
                  Select which column from your file matches each field.
                </p>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                  <div className="space-y-1">
                    <Label className="text-xs">Item Name *</Label>
                    <Select
                      value={columnMapping.name || "__none__"}
                      onValueChange={(value) => handleColumnMappingChange('name', value)}
                    >
                      <SelectTrigger className="h-8 text-xs" data-testid="select-map-name">
                        <SelectValue placeholder="Select column" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="__none__">-- None --</SelectItem>
                        {headers.map((header) => (
                          <SelectItem key={header} value={header}>{header}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="space-y-1">
                    <Label className="text-xs">Group/Category</Label>
                    <Select
                      value={columnMapping.groupName || "__none__"}
                      onValueChange={(value) => handleColumnMappingChange('groupName', value)}
                    >
                      <SelectTrigger className="h-8 text-xs" data-testid="select-map-group">
                        <SelectValue placeholder="Select column" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="__none__">-- None --</SelectItem>
                        {headers.map((header) => (
                          <SelectItem key={header} value={header}>{header}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="space-y-1">
                    <Label className="text-xs">Cost Code</Label>
                    <Select
                      value={columnMapping.costCode || "__none__"}
                      onValueChange={(value) => handleColumnMappingChange('costCode', value)}
                    >
                      <SelectTrigger className="h-8 text-xs" data-testid="select-map-costcode">
                        <SelectValue placeholder="Select column" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="__none__">-- None --</SelectItem>
                        {headers.map((header) => (
                          <SelectItem key={header} value={header}>{header}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="space-y-1">
                    <Label className="text-xs">Unit</Label>
                    <Select
                      value={columnMapping.unit || "__none__"}
                      onValueChange={(value) => handleColumnMappingChange('unit', value)}
                    >
                      <SelectTrigger className="h-8 text-xs" data-testid="select-map-unit">
                        <SelectValue placeholder="Select column" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="__none__">-- None --</SelectItem>
                        {headers.map((header) => (
                          <SelectItem key={header} value={header}>{header}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="space-y-1">
                    <Label className="text-xs">Quantity</Label>
                    <Select
                      value={columnMapping.quantity || "__none__"}
                      onValueChange={(value) => handleColumnMappingChange('quantity', value)}
                    >
                      <SelectTrigger className="h-8 text-xs" data-testid="select-map-quantity">
                        <SelectValue placeholder="Select column" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="__none__">-- None --</SelectItem>
                        {headers.map((header) => (
                          <SelectItem key={header} value={header}>{header}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="space-y-1">
                    <Label className="text-xs">Unit Price</Label>
                    <Select
                      value={columnMapping.unitPrice || "__none__"}
                      onValueChange={(value) => handleColumnMappingChange('unitPrice', value)}
                    >
                      <SelectTrigger className="h-8 text-xs" data-testid="select-map-unitprice">
                        <SelectValue placeholder="Select column" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="__none__">-- None --</SelectItem>
                        {headers.map((header) => (
                          <SelectItem key={header} value={header}>{header}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <RadioGroup
                      value={unitPriceIncludesGst ? "inc" : "ex"}
                      onValueChange={(value) => setUnitPriceIncludesGst(value === "inc")}
                      className="flex items-center gap-3 mt-1.5"
                    >
                      <div className="flex items-center space-x-1">
                        <RadioGroupItem value="ex" id="gst-ex" className="h-3 w-3" />
                        <Label htmlFor="gst-ex" className="text-[10px] text-muted-foreground cursor-pointer">Ex GST</Label>
                      </div>
                      <div className="flex items-center space-x-1">
                        <RadioGroupItem value="inc" id="gst-inc" className="h-3 w-3" />
                        <Label htmlFor="gst-inc" className="text-[10px] text-muted-foreground cursor-pointer">Inc GST</Label>
                      </div>
                    </RadioGroup>
                  </div>

                  <div className="space-y-1">
                    <Label className="text-xs">Markup %</Label>
                    <Select
                      value={columnMapping.markup || "__none__"}
                      onValueChange={(value) => handleColumnMappingChange('markup', value)}
                    >
                      <SelectTrigger className="h-8 text-xs" data-testid="select-map-markup">
                        <SelectValue placeholder="Select column" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="__none__">-- None --</SelectItem>
                        {headers.map((header) => (
                          <SelectItem key={header} value={header}>{header}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="space-y-1">
                    <Label className="text-xs">Description</Label>
                    <Select
                      value={columnMapping.description || "__none__"}
                      onValueChange={(value) => handleColumnMappingChange('description', value)}
                    >
                      <SelectTrigger className="h-8 text-xs" data-testid="select-map-description">
                        <SelectValue placeholder="Select column" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="__none__">-- None --</SelectItem>
                        {headers.map((header) => (
                          <SelectItem key={header} value={header}>{header}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </div>
              </div>
            )}

            {previewData.length > 0 && (
              <div className="space-y-2">
                <Label className="text-sm">Preview ({previewData.filter(r => r.name).length} items)</Label>
                <div className="border rounded-md overflow-auto max-h-48">
                  <table className="w-full text-xs">
                    <thead className="bg-muted sticky top-0">
                      <tr>
                        <th className="text-left p-2 border-b font-medium">Group</th>
                        <th className="text-left p-2 border-b font-medium">Item Name</th>
                        <th className="text-left p-2 border-b font-medium">Cost Code</th>
                        <th className="text-left p-2 border-b font-medium">Qty</th>
                        <th className="text-right p-2 border-b font-medium">Unit Price</th>
                      </tr>
                    </thead>
                    <tbody>
                      {previewData.slice(0, 10).map((row, idx) => (
                        <tr key={idx} className="border-b">
                          <td className="p-2">{row.groupName || "-"}</td>
                          <td className="p-2 font-medium">{row.name || "-"}</td>
                          <td className="p-2">{row.costCode || "-"}</td>
                          <td className="p-2">{row.quantity || "-"}</td>
                          <td className="p-2 text-right">{row.unitPrice ? `$${row.unitPrice}` : "-"}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  {previewData.length > 10 && (
                    <div className="p-2 text-center text-xs text-muted-foreground border-t bg-muted/50">
                      ... and {previewData.length - 10} more items
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>

          <DialogFooter className="flex-shrink-0 border-t pt-4">
            <Button
              variant="outline"
              onClick={() => {
                setIsImportDialogOpen(false);
                setSelectedFile(null);
                setPreviewData([]);
                setHeaders([]);
                setImportError(null);
                setTemplateName("");
                setTemplateCategory("");
              }}
            >
              Cancel
            </Button>
            <Button
              onClick={handleImport}
              disabled={previewData.length === 0 || !templateName.trim() || createMutation.isPending}
              data-testid="button-confirm-import"
            >
              {createMutation.isPending ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Importing...
                </>
              ) : (
                <>
                  <Upload className="h-4 w-4 mr-2" />
                  Import {previewData.filter(r => r.name).length} Items
                </>
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
