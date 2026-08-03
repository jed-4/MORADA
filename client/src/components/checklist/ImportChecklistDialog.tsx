import { useState } from "react";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { Upload, FileText, AlertCircle } from "lucide-react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import * as XLSX from "xlsx";

interface ImportChecklistDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

interface ColumnMapping {
  templateName: string;
  templateDescription: string;
  type: string;
  groupName: string;
  itemDescription: string;
  itemTooltip: string;
  responseType: string;
  responseOptions: string;
}

const EMPTY_MAPPING: ColumnMapping = {
  templateName: "",
  templateDescription: "",
  type: "",
  groupName: "",
  itemDescription: "",
  itemTooltip: "",
  responseType: "",
  responseOptions: "",
};

// Drives both the mapping selects and the preview table, so the two can't
// drift. testId values match the original hand-written markup.
const COLUMN_FIELDS: Array<{ field: keyof ColumnMapping; label: string; testId: string }> = [
  { field: "templateName", label: "Checklist Group", testId: "template-name" },
  { field: "groupName", label: "Checklist", testId: "group" },
  { field: "itemDescription", label: "Checklist Item", testId: "item" },
  { field: "type", label: "Type *", testId: "type" },
  { field: "templateDescription", label: "Description", testId: "description" },
  { field: "itemTooltip", label: "Item Note", testId: "item-tooltip" },
  { field: "responseType", label: "Response Type", testId: "response-type" },
  { field: "responseOptions", label: "Response Options", testId: "response-options" },
];

export function ImportChecklistDialog({ open, onOpenChange }: ImportChecklistDialogProps) {
  const { toast } = useToast();
  const [file, setFile] = useState<File | null>(null);
  const [headers, setHeaders] = useState<string[]>([]);
  const [headerIndices, setHeaderIndices] = useState<Map<string, number>>(new Map());
  const [rawData, setRawData] = useState<any[][]>([]);
  const [columnMapping, setColumnMapping] = useState<ColumnMapping>(EMPTY_MAPPING);
  const [previewData, setPreviewData] = useState<any[]>([]);
  const [error, setError] = useState<string | null>(null);

  const importMutation = useMutation({
    mutationFn: async (items: any[]) => {
      return await apiRequest("/api/checklist-templates/import", "POST", { items });
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["/api/checklist-templates"] });
      
      let description = `Created ${data.templatesCreated} checklist groups, ${data.groupsCreated} checklists, and ${data.itemsCreated} items.`;
      if (data.skippedRows && data.skippedRows > 0) {
        description += ` (${data.skippedRows} rows skipped - missing template name)`;
      }
      
      toast({
        title: data.templatesCreated > 0 ? "Import successful" : "Import completed with no data",
        description,
        variant: data.templatesCreated > 0 ? "default" : "destructive",
      });
      onOpenChange(false);
      setFile(null);
      setHeaders([]);
      setHeaderIndices(new Map());
      setRawData([]);
      setColumnMapping(EMPTY_MAPPING);
      setPreviewData([]);
      setError(null);
    },
    onError: (error: any) => {
      toast({
        title: "Import failed",
        description: error.message || "Failed to import checklist groups.",
        variant: "destructive",
      });
    },
  });

  // Auto-detect column mapping based on header names
  const autoDetectColumns = (headers: string[]) => {
    const mapping: ColumnMapping = { ...EMPTY_MAPPING };

    headers.forEach((header) => {
      // Skip invalid headers
      if (!header || typeof header !== 'string') return;

      const normalized = header.toLowerCase().trim();

      // Response columns are matched first: "responseType" also contains
      // "type", so the generic type check below would otherwise swallow it.
      if (normalized.includes('response') && normalized.includes('option')) {
        mapping.responseOptions = header;
      } else if (normalized.includes('response') && normalized.includes('type')) {
        mapping.responseType = header;
      } else if (normalized.includes('tooltip') || normalized.includes('hint')) {
        mapping.itemTooltip = header;
      } else if (normalized.includes('template') && normalized.includes('name')) {
        mapping.templateName = header;
      } else if (normalized.includes('description') && !normalized.includes('item')) {
        mapping.templateDescription = header;
      } else if (normalized.includes('type')) {
        mapping.type = header;
      } else if (normalized.includes('group')) {
        mapping.groupName = header;
      } else if (normalized.includes('item') && normalized.includes('description')) {
        mapping.itemDescription = header;
      }
    });

    return mapping;
  };

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    e.preventDefault();
    const selectedFile = e.target.files?.[0];
    if (!selectedFile) return;

    setFile(selectedFile);
    setError(null);

    try {
      const reader = new FileReader();
      reader.onload = (evt) => {
        try {
          const bstr = evt.target?.result;
          const wb = XLSX.read(bstr, { type: "binary" });
          const wsname = wb.SheetNames[0];
          const ws = wb.Sheets[wsname];
          const data = XLSX.utils.sheet_to_json(ws, { header: 1 });

          // Parse headers and rows
          const rawHeaders = data[0] as any[];
          const rows = data.slice(1) as any[][];

          // Normalize and track header indices
          const validHeaders: string[] = [];
          const indices = new Map<string, number>();
          
          rawHeaders.forEach((h: any, index: number) => {
            const normalized = h ? String(h).trim() : '';
            if (normalized.length > 0) {
              validHeaders.push(normalized);
              indices.set(normalized, index);
            }
          });

          // Validate we have at least some headers
          if (validHeaders.length === 0) {
            setError("No valid headers found in file. Please ensure the first row contains column names.");
            return;
          }

          setHeaders(validHeaders);
          setHeaderIndices(indices);
          setRawData(rows);

          // Auto-detect column mapping
          const detectedMapping = autoDetectColumns(validHeaders);
          setColumnMapping(detectedMapping);

          // Generate preview with detected mapping
          updatePreview(rows, detectedMapping, indices);
        } catch (err) {
          setError("Failed to parse file. Please ensure it's a valid CSV or Excel file with the correct format.");
        }
      };
      reader.readAsBinaryString(selectedFile);
    } catch (err) {
      setError("Failed to read file");
    }
  };

  const updatePreview = (rows: any[][], mapping: ColumnMapping, indices: Map<string, number>) => {
    const mapped = rows
      .filter(row => row.some(cell => cell)) // Skip empty rows
      .map(row => {
        const getColumnValue = (fieldName: keyof ColumnMapping) => {
          const headerName = mapping[fieldName];
          if (!headerName) return "";
          const columnIndex = indices.get(headerName);
          return columnIndex !== undefined ? (row[columnIndex] || "") : "";
        };

        const templateName = getColumnValue('templateName');
        const groupName = getColumnValue('groupName');
        return {
          templateName: templateName && templateName.trim() ? templateName.trim() : "General",
          templateDescription: getColumnValue('templateDescription'),
          type: getColumnValue('type'),
          groupName: groupName && groupName.trim() ? groupName.trim() : "General",
          itemDescription: getColumnValue('itemDescription'),
          itemTooltip: getColumnValue('itemTooltip'),
          responseType: getColumnValue('responseType'),
          responseOptions: getColumnValue('responseOptions'),
        };
      });

    setPreviewData(mapped);
  };

  const handleColumnMappingChange = (field: keyof ColumnMapping, value: string) => {
    const newMapping = { ...columnMapping, [field]: value === "__none__" ? "" : value };
    setColumnMapping(newMapping);
    updatePreview(rawData, newMapping, headerIndices);
  };

  const handleImport = () => {
    if (previewData.length === 0) {
      setError("No data to import");
      return;
    }

    // Show note if Checklist Group not mapped - will default to "General"
    if (!columnMapping.templateName) {
      toast({
        title: "Note",
        description: "Checklist Group column not mapped. Items will go into 'General'.",
      });
    }
    
    // Type is optional - will default to "Job" if not mapped
    if (!columnMapping.type) {
      toast({
        title: "Note",
        description: "Type column not mapped. All items will default to 'Job' type.",
      });
    }

    importMutation.mutate(previewData);
  };

  const handleDownloadTemplate = () => {
    const headers = [
      "Checklist Group", "Checklist", "Checklist Item", "Type", "Description",
      "Item Note", "Response Type", "Response Options",
    ];
    // Response Type is one of checkbox | text | single_choice | multiple_choice;
    // Response Options is a pipe-separated list, used by the two choice types.
    const exampleRows = [
      ["Site Preparation", "Pre-Construction Checklist", "Clear and level the site", "Job", "Tasks to complete before starting construction", "", "checkbox", ""],
      ["Site Preparation", "Pre-Construction Checklist", "Set up temporary fencing", "Job", "Tasks to complete before starting construction", "Check council setback rules first", "checkbox", ""],
      ["Permits & Approvals", "Pre-Construction Checklist", "Obtain building permit", "Job", "Tasks to complete before starting construction", "", "single_choice", "Approved | Pending | Rejected"],
      ["Initial Contact", "Lead Qualification", "Make first phone call", "Lead", "Steps to qualify a potential lead", "", "text", ""],
    ];
    
    const csvRows = [
      headers.join(","),
      ...exampleRows.map(row => row.map(cell => `"${cell}"`).join(","))
    ];
    
    const csvContent = csvRows.join("\n");
    const blob = new Blob([csvContent], { type: "text/csv" });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "checklist-template-import-example.csv";
    a.click();
    window.URL.revokeObjectURL(url);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-6xl max-h-[90vh] flex flex-col overflow-hidden">
        <DialogHeader>
          <DialogTitle>Import Checklist Groups</DialogTitle>
          <DialogDescription>
            Upload a CSV or Excel file with checklist groups, checklists, and items. Each row should contain checklist information.
          </DialogDescription>
        </DialogHeader>

        <div className="flex-1 overflow-y-auto space-y-4">
          {/* File Upload */}
          <div className="space-y-2">
            <Label htmlFor="file-upload">Upload File</Label>
            <div className="flex items-center gap-2">
              <Input
                id="file-upload"
                type="file"
                accept=".csv,.xlsx,.xls"
                onChange={handleFileChange}
                data-testid="input-import-file"
              />
              <Button
                variant="outline"
                size="sm"
                onClick={handleDownloadTemplate}
                data-testid="button-download-template"
              >
                <FileText className="h-4 w-4 mr-2" />
                Download Template
              </Button>
            </div>
            <p className="text-sm text-muted-foreground">
              Supported columns: Checklist Group, Checklist, Checklist Item, Type, Description,
              Item Note, Response Type, Response Options.
              All fields are optional - unmapped items will go into "General".
            </p>
          </div>

          {/* Error Alert */}
          {error && (
            <Alert variant="destructive">
              <AlertCircle className="h-4 w-4" />
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}

          {/* Column Mapping */}
          {headers.length > 0 && (
            <div className="space-y-3 p-4 border rounded-md bg-muted/50">
              <Label className="text-base">Map Your Columns</Label>
              <p className="text-sm text-muted-foreground">
                Select which column from your file matches each field. Unmapped fields will default to "General".
              </p>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {COLUMN_FIELDS.map(({ field, label, testId }) => (
                  <div className="space-y-2" key={field}>
                    <Label htmlFor={`map-${testId}`}>{label}</Label>
                    <Select
                      value={columnMapping[field] || "__none__"}
                      onValueChange={(value) => handleColumnMappingChange(field, value)}
                    >
                      <SelectTrigger id={`map-${testId}`} data-testid={`select-map-${testId}`}>
                        <SelectValue placeholder="Select column" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="__none__">-- None --</SelectItem>
                        {headers.map((header) => (
                          <SelectItem key={header} value={header}>
                            {header}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Preview */}
          {previewData.length > 0 && (
            <div className="space-y-2">
              <Label>Preview ({previewData.length} rows)</Label>
              <div className="border rounded-md overflow-auto max-h-96">
                <table className="w-full text-sm">
                  <thead className="bg-muted sticky top-0">
                    <tr>
                      {COLUMN_FIELDS.map(({ field, label }) => (
                        <th key={field} className="text-left p-2 border-b font-medium">
                          {label.replace(" *", "")}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {previewData.slice(0, 10).map((row, idx) => (
                      <tr key={idx} className="border-b">
                        {COLUMN_FIELDS.map(({ field }) => (
                          <td key={field} className="p-2">{row[field]}</td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
                {previewData.length > 10 && (
                  <div className="p-2 text-center text-sm text-muted-foreground border-t bg-muted/50">
                    ... and {previewData.length - 10} more rows
                  </div>
                )}
              </div>
            </div>
          )}

        </div>

        {/* Sticky Actions Footer */}
        <div className="flex justify-end gap-2 pt-4 border-t bg-background sticky bottom-0">
          <Button
            variant="outline"
            onClick={() => {
              onOpenChange(false);
              setFile(null);
              setPreviewData([]);
              setError(null);
            }}
            data-testid="button-cancel-import"
          >
            Cancel
          </Button>
          <Button
            onClick={handleImport}
            disabled={previewData.length === 0 || importMutation.isPending}
            data-testid="button-confirm-import"
          >
            {importMutation.isPending ? "Importing..." : `Import ${previewData.length} Rows`}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
