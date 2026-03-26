import { useState, useRef } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Upload, FileSpreadsheet, AlertCircle, Loader2 } from "lucide-react";
import { useMutation } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/hooks/use-auth";
import * as XLSX from "xlsx";

interface ColumnMapping {
  category: string;
  name: string;
  description: string;
  duration: string;
  assignee: string;
  predecessors: string;
  predecessorRelation: string;
}

interface PreviewRow {
  category: string;
  name: string;
  description: string;
  duration: string;
  assignee: string;
  predecessors: string;
  predecessorRelation: string;
  sortOrder: number;
}

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

type ImportMode = "template" | "project";

interface ImportScheduleDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  mode: ImportMode;
  projectId?: string;
  scheduleId?: string;
  onSuccess?: () => void;
}

export function ImportScheduleDialog({
  open,
  onOpenChange,
  mode,
  projectId,
  scheduleId,
  onSuccess,
}: ImportScheduleDialogProps) {
  const { toast } = useToast();
  const { user } = useAuth();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [headers, setHeaders] = useState<string[]>([]);
  const [rawData, setRawData] = useState<any[][]>([]);
  const [headerIndices, setHeaderIndices] = useState<Map<string, number>>(new Map());
  const [columnMapping, setColumnMapping] = useState<ColumnMapping>({
    category: "",
    name: "",
    description: "",
    duration: "",
    assignee: "",
    predecessors: "",
    predecessorRelation: "",
  });
  const [previewData, setPreviewData] = useState<PreviewRow[]>([]);
  const [importError, setImportError] = useState<string | null>(null);
  const [templateName, setTemplateName] = useState("");
  const [templateCategory, setTemplateCategory] = useState("");

  const resetState = () => {
    setSelectedFile(null);
    setPreviewData([]);
    setHeaders([]);
    setRawData([]);
    setHeaderIndices(new Map());
    setImportError(null);
    setTemplateName("");
    setTemplateCategory("");
    setColumnMapping({
      category: "",
      name: "",
      description: "",
      duration: "",
      assignee: "",
      predecessors: "",
      predecessorRelation: "",
    });
  };

  const autoDetectColumns = (headers: string[]): ColumnMapping => {
    const mapping: ColumnMapping = {
      category: "",
      name: "",
      description: "",
      duration: "",
      assignee: "",
      predecessors: "",
      predecessorRelation: "",
    };

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

  const createTemplateMutation = useMutation({
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
        title: "Template imported",
        description: "Your schedule template has been created.",
      });
      resetState();
      onOpenChange(false);
      onSuccess?.();
    },
    onError: () => {
      toast({
        title: "Error",
        description: "Failed to import template.",
        variant: "destructive",
      });
    },
  });

  const importToProjectMutation = useMutation({
    mutationFn: async (items: TemplateItem[]) => {
      return await apiRequest("/api/schedule-items/bulk-create", "POST", {
        scheduleId,
        items,
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [`/api/projects/${projectId}/schedule-items`] });
      if (scheduleId) {
        queryClient.invalidateQueries({ queryKey: [`/api/schedules/${scheduleId}/items`] });
      }
      toast({
        title: "Schedule imported",
        description: "Tasks have been added to the project schedule.",
      });
      resetState();
      onOpenChange(false);
      onSuccess?.();
    },
    onError: (error: any) => {
      toast({
        title: "Error",
        description: error.message || "Failed to import schedule.",
        variant: "destructive",
      });
    },
  });

  const handleImport = () => {
    if (previewData.length === 0) {
      setImportError("No data to import.");
      return;
    }
    if (!columnMapping.name) {
      setImportError("Please map the Task/Name column.");
      return;
    }

    const items: TemplateItem[] = previewData
      .filter(row => row.name)
      .map((row, idx) => {
        const durationStr = String(row.duration || "1").trim();
        const parsedDuration = parseInt(durationStr, 10);
        const duration = isNaN(parsedDuration) || parsedDuration < 1 ? 1 : parsedDuration;
        
        return {
          name: String(row.name).trim(),
          description: row.description ? String(row.description).trim() : undefined,
          duration,
          type: "task" as const,
          category: row.category ? String(row.category).trim() : undefined,
          assigneeName: row.assignee ? String(row.assignee).trim() : undefined,
          predecessorNames: row.predecessors ? String(row.predecessors).split(',').map((p: string) => p.trim()).filter(Boolean) : undefined,
          predecessorRelation: row.predecessorRelation?.toUpperCase() as "FS" | "SS" | "FF" | "SF" | undefined,
          sortOrder: idx,
        };
      });

    if (mode === "template") {
      if (!templateName.trim()) {
        setImportError("Please enter a template name.");
        return;
      }
      createTemplateMutation.mutate({
        name: templateName.trim(),
        description: `Imported from ${selectedFile?.name}`,
        category: templateCategory || undefined,
        templateData: items,
      });
    } else {
      if (!scheduleId) {
        setImportError("No schedule selected.");
        return;
      }
      importToProjectMutation.mutate(items);
    }
  };

  const isPending = createTemplateMutation.isPending || importToProjectMutation.isPending;
  const taskCount = previewData.filter(r => r.name).length;

  return (
    <Dialog 
      open={open} 
      onOpenChange={(open) => {
        onOpenChange(open);
        if (!open) resetState();
      }}
    >
      <DialogContent className="max-w-4xl max-h-[90vh] overflow-hidden flex flex-col">
        <DialogHeader className="flex-shrink-0">
          <DialogTitle>
            {mode === "template" ? "Import Schedule Template" : "Import Schedule"}
          </DialogTitle>
          <DialogDescription>
            Upload an Excel file containing your schedule tasks. Supports Buildern and Wunderbuild formats.
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

          {mode === "template" && selectedFile && (
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
                    resetState();
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

          {previewData.length > 0 && (
            <div className="space-y-2">
              <Label className="text-sm">Preview ({taskCount} tasks)</Label>
              <div className="border rounded-md overflow-auto max-h-48">
                <table className="w-full text-xs">
                  <thead className="bg-muted sticky top-0">
                    <tr>
                      <th className="text-left p-2 border-b font-medium">Category</th>
                      <th className="text-left p-2 border-b font-medium">Task Name</th>
                      <th className="text-left p-2 border-b font-medium">Duration</th>
                      <th className="text-left p-2 border-b font-medium">Assignee</th>
                    </tr>
                  </thead>
                  <tbody>
                    {previewData.slice(0, 10).map((row, idx) => (
                      <tr key={idx} className="border-b">
                        <td className="p-2">{row.category || "-"}</td>
                        <td className="p-2 font-medium">{row.name || "-"}</td>
                        <td className="p-2">{row.duration || "1"} days</td>
                        <td className="p-2">{row.assignee || "-"}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
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
              resetState();
            }}
          >
            Cancel
          </Button>
          <Button
            onClick={handleImport}
            disabled={taskCount === 0 || (mode === "template" && !templateName.trim()) || isPending}
            data-testid="button-confirm-import"
          >
            {isPending ? (
              <>
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                Importing...
              </>
            ) : (
              <>
                <Upload className="h-4 w-4 mr-2" />
                Import {taskCount} Tasks
              </>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
