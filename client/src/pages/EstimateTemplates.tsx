import { useState, useRef } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { type EstimateTemplate } from "@shared/schema";
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
} from "lucide-react";
import { useAuth } from "@/hooks/use-auth";
import { format } from "date-fns";
import * as XLSX from "xlsx";

interface TemplateItem {
  groupName?: string;
  name: string;
  description?: string;
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

export default function EstimateTemplates() {
  const [isAddingTemplate, setIsAddingTemplate] = useState(false);
  const [editingTemplate, setEditingTemplate] = useState<EstimateTemplate | null>(null);
  const [searchTerm, setSearchTerm] = useState("");
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
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/estimate-templates"] });
      toast({
        title: "Template created",
        description: "Your new estimate template has been created.",
      });
      setIsAddingTemplate(false);
      setFormData({ name: "", description: "", category: "" });
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
      .map((row, idx) => ({
        groupName: row.groupName ? String(row.groupName).trim() : undefined,
        name: String(row.name).trim(),
        description: row.description ? String(row.description).trim() : undefined,
        costCodeTitle: row.costCode ? String(row.costCode).trim() : undefined,
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
      }));

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
      {/* Row 1 - Title & Actions */}
      <div className="h-9 bg-background flex items-center justify-between px-2 gap-4 flex-shrink-0">
        <div className="flex items-center gap-3">
          <h2 className="text-sm font-semibold" data-testid="text-page-title">
            Estimate Templates
          </h2>
          <Badge variant="secondary" className="text-xs" data-testid="text-template-count">
            {templates.length} {templates.length === 1 ? 'template' : 'templates'}
          </Badge>
        </div>

        <div className="flex items-center gap-1.5">
          <button
            className="h-6 w-auto px-2 text-xs border rounded-md hover-elevate active-elevate-2 flex items-center gap-0.5"
            onClick={() => setIsImportDialogOpen(true)}
            data-testid="button-import-templates"
          >
            <Upload className="w-3 h-3" />
            <span>Import</span>
          </button>
          <button
            className="h-6 w-auto px-2 text-xs border rounded-md bg-[#bba7db] text-white border-[#bba7db]/20 hover:bg-[#bba7db]/90 active-elevate-2 flex items-center gap-0.5"
            onClick={handleOpenAdd}
            data-testid="button-add-template"
          >
            <Plus className="w-3 h-3" />
            <span>New Template</span>
          </button>
        </div>
      </div>

      {/* Row 2 - Search & Filters */}
      <div className="h-9 bg-background flex items-center justify-between px-2 gap-1.5 border-b border-border flex-shrink-0">
        <div className="flex items-center gap-1.5 flex-1">
          <div className="relative w-48">
            <Search className="absolute left-2 top-1/2 -translate-y-1/2 w-3 h-3 text-muted-foreground" />
            <Input
              placeholder="Search..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="pl-7 pr-2 py-0 h-6 text-xs border"
              data-testid="input-search-templates"
            />
          </div>
        </div>
      </div>

      {/* Templates List */}
      <div className="flex-1 overflow-auto p-4">
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
                onClick={() => handleOpenEdit(template)}
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
      </div>

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
              <Label htmlFor="category">Category</Label>
              <Select 
                value={formData.category} 
                onValueChange={(value) => setFormData({ ...formData, category: value })}
              >
                <SelectTrigger id="category" data-testid="select-template-category">
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
