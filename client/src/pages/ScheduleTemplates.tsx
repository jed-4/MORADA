import { useMemo, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { type ScheduleTemplate } from "@shared/schema";
import { type ColumnDef } from "@tanstack/react-table";
import { LineItemTable } from "@/components/LineItemTable";
import { type DataTableColumnMeta } from "@/components/data-table/DataTable";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { Alert, AlertDescription } from "@/components/ui/alert";
import {
  Calendar,
  Plus,
  Upload,
  Loader2,
  FileSpreadsheet,
  AlertCircle,
} from "lucide-react";
import { useAuth } from "@/hooks/use-auth";
import { format } from "date-fns";
import * as XLSX from "xlsx";
import {
  TemplateListPage,
  type TemplateListConfig,
} from "@/components/templates/TemplateListPage";

interface TemplateItem {
  name: string;
  description?: string;
  duration: number;
  type: "task" | "milestone" | "inspection" | "delivery" | "meeting";
  assigneeName?: string;
  category?: string;
  predecessorNames?: string[];
  predecessorRelation?: "FS" | "SS" | "FF" | "SF";
  labels?: string[];
  sortOrder: number;
}

interface ColumnMapping {
  category: string;
  name: string;
  description: string;
  duration: string;
  assignee: string;
  predecessors: string;
  predecessorRelation: string;
}

interface ScheduleTemplateForm {
  name: string;
  description: string;
  category: string;
}

const CATEGORY_OPTIONS = [
  { value: "Residential", label: "Residential" },
  { value: "Commercial", label: "Commercial" },
  { value: "Renovation", label: "Renovation" },
  { value: "Extension", label: "Extension" },
  { value: "Custom", label: "Custom" },
];

const EMPTY_COLUMN_MAPPING: ColumnMapping = {
  category: "",
  name: "",
  description: "",
  duration: "",
  assignee: "",
  predecessors: "",
  predecessorRelation: "",
};

const getItemCount = (template: ScheduleTemplate) => {
  const data = template.templateData as TemplateItem[] | null;
  return data?.length || 0;
};

const getCategoryColor = (category: string | null) => {
  switch (category?.toLowerCase()) {
    case "residential": return "bg-status-success-bg text-status-success";
    case "commercial": return "bg-status-info-bg text-status-info";
    case "renovation": return "bg-status-warning-bg text-status-warning";
    default: return "bg-muted text-secondary dark:text-muted";
  }
};

const columns: ColumnDef<ScheduleTemplate, unknown>[] = [
  {
    id: "name",
    header: "Name",
    accessorFn: (t) => t.name || "",
    cell: ({ row }) => (
      <span className="text-xs font-medium" data-testid={`cell-name-${row.original.id}`}>
        {row.original.name}
      </span>
    ),
    size: 240,
    meta: { defaultWidth: 240, headerLabel: "Name" } satisfies DataTableColumnMeta,
  },
  {
    id: "category",
    header: "Category",
    accessorFn: (t) => t.category || "",
    cell: ({ row }) => row.original.category ? (
      <Badge
        variant="secondary"
        className={`h-4 px-1.5 text-data ${getCategoryColor(row.original.category)}`}
        data-testid={`cell-category-${row.original.id}`}
      >
        {row.original.category}
      </Badge>
    ) : (
      <span className="text-xs text-muted-foreground">—</span>
    ),
    size: 120,
    meta: { defaultWidth: 120, headerLabel: "Category" } satisfies DataTableColumnMeta,
  },
  {
    id: "description",
    header: "Description",
    accessorFn: (t) => t.description || "",
    cell: ({ row }) => (
      <span className="text-xs text-muted-foreground line-clamp-1" data-testid={`cell-description-${row.original.id}`}>
        {row.original.description || "—"}
      </span>
    ),
    size: 320,
    meta: { defaultWidth: 320, headerLabel: "Description" } satisfies DataTableColumnMeta,
  },
  {
    id: "items",
    header: "Items",
    accessorFn: (t) => getItemCount(t),
    cell: ({ row }) => (
      <span className="text-xs tabular-nums" data-testid={`cell-items-${row.original.id}`}>
        {getItemCount(row.original)}
      </span>
    ),
    size: 80,
    meta: { defaultWidth: 80, align: "right", headerLabel: "Items" } satisfies DataTableColumnMeta,
  },
  {
    id: "updatedAt",
    header: "Updated",
    accessorFn: (t) => (t.updatedAt ? new Date(t.updatedAt).getTime() : 0),
    cell: ({ row }) => (
      <span className="text-xs text-muted-foreground" data-testid={`cell-updated-${row.original.id}`}>
        {format(new Date(row.original.updatedAt), "MMM d, yyyy")}
      </span>
    ),
    size: 120,
    meta: { defaultWidth: 120, headerLabel: "Updated" } satisfies DataTableColumnMeta,
  },
];

const pickerColumns = [
  { id: "name", label: "Name" },
  { id: "category", label: "Category" },
  { id: "description", label: "Description" },
  { id: "items", label: "Items" },
  { id: "updatedAt", label: "Updated" },
];

function autoDetectColumns(headers: string[]) {
  const mapping: ColumnMapping = { ...EMPTY_COLUMN_MAPPING };

  headers.forEach((header) => {
    if (!header || typeof header !== 'string') return;
    const normalized = header.toLowerCase().trim();

    if (normalized.includes('category') || normalized.includes('stage') || normalized.includes('phase')) {
      mapping.category = header;
    } else if (normalized.includes('task') || (normalized.includes('name') && !normalized.includes('template'))) {
      mapping.name = header;
    } else if (normalized.includes('description') || normalized.includes('desc')) {
      mapping.description = header;
    } else if (normalized.includes('duration') || normalized.includes('days')) {
      mapping.duration = header;
    } else if (normalized.includes('assign') || normalized.includes('user') || normalized.includes('supplier')) {
      mapping.assignee = header;
    } else if (normalized.includes('predecessor') && !normalized.includes('relation')) {
      mapping.predecessors = header;
    } else if (normalized.includes('relation') || normalized.includes('type')) {
      mapping.predecessorRelation = header;
    }
  });

  return mapping;
}

/** XLSX/CSV import dialog for schedule templates (page-local, wired via extraDialogs). */
function ScheduleImportDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const { toast } = useToast();
  const { user } = useAuth();
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [headers, setHeaders] = useState<string[]>([]);
  const [rawData, setRawData] = useState<any[][]>([]);
  const [headerIndices, setHeaderIndices] = useState<Map<string, number>>(new Map());
  const [columnMapping, setColumnMapping] = useState<ColumnMapping>({ ...EMPTY_COLUMN_MAPPING });
  const [previewData, setPreviewData] = useState<any[]>([]);
  const [importError, setImportError] = useState<string | null>(null);
  const [templateName, setTemplateName] = useState("");
  const [templateCategory, setTemplateCategory] = useState("");
  const fileInputRef = useRef<HTMLInputElement>(null);

  const resetImportState = () => {
    setSelectedFile(null);
    setPreviewData([]);
    setHeaders([]);
    setImportError(null);
    setTemplateName("");
    setTemplateCategory("");
    setColumnMapping({ ...EMPTY_COLUMN_MAPPING });
  };

  const importMutation = useMutation({
    mutationFn: async (data: { name: string; description?: string; category?: string; templateData?: TemplateItem[] }) => {
      return await apiRequest("/api/schedule-templates", "POST", {
        ...data,
        templateData: data.templateData || [],
        createdBy: user?.id,
        createdByName: user?.firstName && user?.lastName
          ? `${user.firstName} ${user.lastName}`
          : user?.email,
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/schedule-templates"] });
      toast({
        title: "Template created",
        description: "Your new schedule template has been created.",
      });
      onOpenChange(false);
      resetImportState();
    },
    onError: () => {
      toast({
        title: "Error",
        description: "Failed to create template.",
        variant: "destructive",
      });
    },
  });

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
          category: getColumnValue('category'),
          name: getColumnValue('name'),
          description: getColumnValue('description'),
          duration: getColumnValue('duration'),
          assignee: getColumnValue('assignee'),
          predecessors: getColumnValue('predecessors'),
          predecessorRelation: getColumnValue('predecessorRelation'),
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
      setImportError("Please map the Task/Name column.");
      return;
    }

    const templateItems: TemplateItem[] = previewData
      .filter(row => row.name)
      .map((row, idx) => ({
        name: String(row.name).trim(),
        description: row.description ? String(row.description).trim() : undefined,
        duration: row.duration ? parseInt(String(row.duration), 10) || 1 : 1,
        type: "task" as const,
        category: row.category ? String(row.category).trim() : undefined,
        assigneeName: row.assignee ? String(row.assignee).trim() : undefined,
        predecessorNames: row.predecessors ? String(row.predecessors).split(',').map((p: string) => p.trim()).filter(Boolean) : undefined,
        predecessorRelation: row.predecessorRelation?.toUpperCase() as "FS" | "SS" | "FF" | "SF" | undefined,
        sortOrder: idx,
      }));

    importMutation.mutate({
      name: templateName.trim(),
      description: `Imported from ${selectedFile?.name}`,
      category: templateCategory || undefined,
      templateData: templateItems,
    });
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(nextOpen) => {
        onOpenChange(nextOpen);
        if (!nextOpen) {
          resetImportState();
        }
      }}
    >
      <DialogContent className="max-w-4xl max-h-[90vh] overflow-hidden flex flex-col">
        <DialogHeader className="flex-shrink-0">
          <DialogTitle>Import Schedule Template</DialogTitle>
          <DialogDescription>
            Upload an Excel file containing your schedule tasks. Supports Buildern and Wunderbuild formats.
          </DialogDescription>
        </DialogHeader>

        <div className="flex-1 overflow-y-auto space-y-4 py-4">
          {/* Hidden file input */}
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

          {/* Template name and category */}
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
                    {CATEGORY_OPTIONS.map((option) => (
                      <SelectItem key={option.value} value={option.value}>
                        {option.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
          )}

          {/* Drop zone */}
          <div
            onDragOver={handleDragOver}
            onDragLeave={handleDragLeave}
            onDrop={handleDrop}
            onClick={() => fileInputRef.current?.click()}
            className={`border-2 border-dashed rounded-lg p-6 text-center cursor-pointer transition-colors ${
              isDragging
                ? "border-primary bg-primary/5"
                : selectedFile
                ? "border-sage bg-sage/10"
                : "border-muted-foreground/25 hover:border-muted-foreground/50"
            }`}
            data-testid="dropzone-file-upload"
          >
            {selectedFile ? (
              <div className="flex flex-col items-center gap-2">
                <FileSpreadsheet className="h-8 w-8 text-status-success" />
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

          {/* Error Alert */}
          {importError && (
            <Alert variant="destructive">
              <AlertCircle className="h-4 w-4" />
              <AlertDescription>{importError}</AlertDescription>
            </Alert>
          )}

          {/* Column Mapping */}
          {headers.length > 0 && (
            <div className="space-y-3 p-4 border rounded-md bg-muted/50">
              <Label className="text-sm font-medium">Map Your Columns</Label>
              <p className="text-xs text-muted-foreground">
                Select which column from your file matches each field.
              </p>
              <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
                <div className="space-y-1">
                  <Label className="text-xs">Task Name *</Label>
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
                  <Label className="text-xs">Category/Stage</Label>
                  <Select
                    value={columnMapping.category || "__none__"}
                    onValueChange={(value) => handleColumnMappingChange('category', value)}
                  >
                    <SelectTrigger className="h-8 text-xs" data-testid="select-map-category">
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
                  <Label className="text-xs">Duration (days)</Label>
                  <Select
                    value={columnMapping.duration || "__none__"}
                    onValueChange={(value) => handleColumnMappingChange('duration', value)}
                  >
                    <SelectTrigger className="h-8 text-xs" data-testid="select-map-duration">
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
                  <Label className="text-xs">Assignee</Label>
                  <Select
                    value={columnMapping.assignee || "__none__"}
                    onValueChange={(value) => handleColumnMappingChange('assignee', value)}
                  >
                    <SelectTrigger className="h-8 text-xs" data-testid="select-map-assignee">
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
                  <Label className="text-xs">Predecessors</Label>
                  <Select
                    value={columnMapping.predecessors || "__none__"}
                    onValueChange={(value) => handleColumnMappingChange('predecessors', value)}
                  >
                    <SelectTrigger className="h-8 text-xs" data-testid="select-map-predecessors">
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

          {/* Preview */}
          {previewData.length > 0 && (
            <div className="space-y-2">
              <Label className="text-sm">Preview ({previewData.filter(r => r.name).length} tasks)</Label>
              <div className="border rounded-md overflow-hidden">
                <LineItemTable
                  data={previewData.slice(0, 10)}
                  rowKey={(_row, idx) => idx}
                  columns={[
                    { key: "category", header: "Category", cell: (row) => row.category || "-" },
                    { key: "name", header: "Task Name", cell: (row) => row.name || "-", className: "font-medium" },
                    { key: "duration", header: "Duration", cell: (row) => `${row.duration || "1"} days` },
                    { key: "assignee", header: "Assignee", cell: (row) => row.assignee || "-" },
                  ]}
                />
                {previewData.length > 10 && (
                  <div className="p-2 text-center text-xs text-muted-foreground border-t bg-muted/50">
                    ... and {previewData.length - 10} more tasks
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
              onOpenChange(false);
              resetImportState();
            }}
          >
            Cancel
          </Button>
          <Button
            onClick={handleImport}
            disabled={previewData.length === 0 || !templateName.trim() || importMutation.isPending}
            data-testid="button-confirm-import"
          >
            {importMutation.isPending ? (
              <>
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                Importing...
              </>
            ) : (
              <>
                <Upload className="h-4 w-4 mr-2" />
                Import {previewData.filter(r => r.name).length} Tasks
              </>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export default function ScheduleTemplates() {
  const { user } = useAuth();
  const [isImportDialogOpen, setIsImportDialogOpen] = useState(false);

  const config = useMemo<TemplateListConfig<ScheduleTemplate, ScheduleTemplateForm>>(
    () => ({
      pageTitle: "Schedule Templates",
      emptyIcon: Calendar,
      emptyDescription: "Start by adding your first schedule template or import from Excel",
      emptyActionLabel: "Create Manually",
      api: { base: "/api/schedule-templates" },
      detailRoute: (id) => `/schedule-templates/${id}`,
      navigateOnCreate: false,
      table: {
        storageKey: "schedule-templates",
        legacyConfigKey: "schedule-templates-column-config-v1",
        columns,
        pickerColumns,
        editAction: { navigate: (t) => `/schedule-templates/${t.id}` },
        contentClassName: "overflow-auto p-4",
        columnPickerTestId: "button-columns",
      },
      searchFields: (t) => [t.name, t.description, t.category],
      sort: (a, b) => a.name.localeCompare(b.name),
      form: {
        initialValues: { name: "", description: "", category: "" },
        fromEntity: (t) => ({
          name: t.name,
          description: t.description || "",
          category: t.category || "",
        }),
        validate: (f) => (f.name.trim() ? null : "Template name is required."),
        toPayload: (f, mode) => ({
          name: f.name.trim(),
          description: f.description.trim() || undefined,
          category: f.category || undefined,
          ...(mode === "create"
            ? {
                templateData: [],
                createdBy: user?.id,
                createdByName: user?.firstName && user?.lastName
                  ? `${user.firstName} ${user.lastName}`
                  : user?.email,
              }
            : {}),
        }),
        fields: [
          {
            type: "text",
            key: "name",
            label: "Template Name *",
            placeholder: "e.g., Standard 4-Bed Build",
            testId: "input-template-name",
          },
          {
            type: "select",
            key: "category",
            label: "Category",
            placeholder: "Select category",
            options: CATEGORY_OPTIONS,
            testId: "select-template-category",
          },
          {
            type: "textarea",
            key: "description",
            label: "Description",
            placeholder: "Brief description of the template...",
            rows: 3,
            testId: "textarea-template-description",
          },
        ],
        titles: {
          create: "New Schedule Template",
          edit: "Edit Schedule Template",
          createDescription: "Create a new schedule template to reuse across projects.",
          editDescription: "Update the template details below.",
        },
      },
      duplicatePayload: (template) => {
        const { id, createdAt, updatedAt, isArchived, ...rest } = template;
        return {
          ...rest,
          name: `${template.name} (Copy)`,
          createdBy: user?.id,
          createdByName: user?.firstName && user?.lastName
            ? `${user.firstName} ${user.lastName}`
            : user?.email,
        };
      },
      toasts: { created: "Your new schedule template has been created." },
      headerActions: (
        <button
          className="h-6 w-auto px-2 text-xs border rounded-md hover-elevate active-elevate-2 flex items-center gap-0.5"
          onClick={() => setIsImportDialogOpen(true)}
          data-testid="button-import-templates"
        >
          <Upload className="w-3 h-3" />
          <span>Import</span>
        </button>
      ),
      emptyStateActions: (
        <div className="flex justify-center mt-2">
          <button
            onClick={() => setIsImportDialogOpen(true)}
            className="h-6 px-2 text-xs border rounded-md hover-elevate active-elevate-2 flex items-center gap-0.5"
            data-testid="button-import-first-template"
          >
            <Upload className="h-3 w-3" />
            Import from Excel
          </button>
        </div>
      ),
      extraDialogs: (
        <ScheduleImportDialog
          open={isImportDialogOpen}
          onOpenChange={setIsImportDialogOpen}
        />
      ),
    }),
    [user, isImportDialogOpen],
  );

  return <TemplateListPage config={config} />;
}
