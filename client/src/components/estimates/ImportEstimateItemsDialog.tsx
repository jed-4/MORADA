import React, { useState, useMemo } from "react";
import { Upload, FileSpreadsheet, ChevronDown, ChevronRight, X, AlertCircle } from "lucide-react";
import * as XLSX from "xlsx";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";
import {
  ImportEstimateItem,
  ColumnMapping,
  autoDetectColumnMapping,
  parseImportRow,
} from "@shared/import";

interface ImportEstimateItemsDialogProps {
  open: boolean;
  onClose: () => void;
  estimateId: string;
  onImportComplete: () => void;
}

const FIELD_LABELS: Record<keyof ImportEstimateItem, string> = {
  name: "Name",
  type: "Cost Type",
  description: "Description",
  quantity: "Quantity",
  unitType: "Unit",
  unitCostExTax: "Unit Cost (ex. tax)",
  markupPercent: "Markup",
  allowance: "Allowance",
  notes: "Notes",
  costCode: "Group",
  status: "Status",
  proposalVisible: "Proposal Visible",
  shownAs: "Shown As",
};

// Core mapping fields to display at the top
const CORE_MAPPING_FIELDS: (keyof ImportEstimateItem)[] = [
  "name",
  "type",
  "costCode",
  "quantity",
  "unitType",
  "unitCostExTax",
  "markupPercent",
  "description"
];

export function ImportEstimateItemsDialog({
  open,
  onClose,
  estimateId,
  onImportComplete,
}: ImportEstimateItemsDialogProps) {
  const [fileName, setFileName] = useState<string>("");
  const [fileData, setFileData] = useState<any[]>([]);
  const [headers, setHeaders] = useState<string[]>([]);
  const [columnMapping, setColumnMapping] = useState<ColumnMapping>({});
  const [isImporting, setIsImporting] = useState(false);
  const [collapsedGroups, setCollapsedGroups] = useState<Set<string>>(new Set());

  // Compute parsed results whenever data or mapping changes
  const parsedResults = useMemo(() => {
    if (!fileData.length || !columnMapping.name) return [];
    return fileData.map((row, index) => parseImportRow(row, columnMapping, index));
  }, [fileData, columnMapping]);

  const validCount = parsedResults.filter(r => r.data).length;
  const errorCount = parsedResults.filter(r => r.errors).length;

  const handleFileUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    try {
      setFileName(file.name);
      const data = await file.arrayBuffer();
      const workbook = XLSX.read(data);
      const worksheet = workbook.Sheets[workbook.SheetNames[0]];
      const jsonData = XLSX.utils.sheet_to_json(worksheet, { header: 1 }) as any[][];

      // Extract headers and data
      const headerRow = jsonData[0] as string[];
      const dataRows = jsonData.slice(1).filter(row => row.some(cell => cell !== undefined && cell !== ""));

      // Convert to object array
      const objectData = dataRows.map(row => {
        const obj: any = {};
        headerRow.forEach((header, index) => {
          obj[header] = row[index];
        });
        return obj;
      });

      setHeaders(headerRow);
      setFileData(objectData);

      // Auto-detect column mapping
      const detectedMapping = autoDetectColumnMapping(headerRow);
      setColumnMapping(detectedMapping);
    } catch (error) {
      console.error("Error reading file:", error);
      alert("Failed to read file. Please ensure it's a valid Excel or CSV file.");
    }
  };

  const handleColumnMappingChange = (field: keyof ImportEstimateItem, columnName: string) => {
    setColumnMapping(prev => ({
      ...prev,
      [field]: columnName === "not-mapped" ? undefined : columnName,
    }));
  };

  const toggleGroup = (groupName: string) => {
    setCollapsedGroups(prev => {
      const newSet = new Set(prev);
      if (newSet.has(groupName)) {
        newSet.delete(groupName);
      } else {
        newSet.add(groupName);
      }
      return newSet;
    });
  };

  // Group data by cost code/group with parsed results
  const groupedData = useMemo(() => {
    if (!fileData.length || !columnMapping.costCode) {
      return { ungrouped: fileData.map((row, idx) => ({ row, parsed: parsedResults[idx] })) };
    }

    const groups: Record<string, any[]> = {};
    const costCodeColumn = columnMapping.costCode as string;
    fileData.forEach((row, idx) => {
      const groupName = row[costCodeColumn] || "Ungrouped";
      if (!groups[groupName]) {
        groups[groupName] = [];
      }
      groups[groupName].push({ row, parsed: parsedResults[idx] });
    });

    return groups;
  }, [fileData, columnMapping.costCode, parsedResults]);

  const handleImport = async () => {
    setIsImporting(true);
    
    try {
      // Get only valid rows
      const validRows = parsedResults
        .filter(row => row.data)
        .map(row => {
          const item = { ...row.data!, estimateId };
          return item;
        });

      const response = await fetch(`/api/estimates/${estimateId}/items/import`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ items: validRows }),
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || "Import failed");
      }

      const result = await response.json();
      onImportComplete();
      handleClose();
      alert(`Successfully imported ${result.count} items!`);
    } catch (error: any) {
      console.error("Import error:", error);
      alert(error.message || "Failed to import items");
    } finally {
      setIsImporting(false);
    }
  };

  const handleClose = () => {
    setFileName("");
    setFileData([]);
    setHeaders([]);
    setColumnMapping({});
    setCollapsedGroups(new Set());
    onClose();
  };

  const getCellValue = (row: any, field: keyof ImportEstimateItem) => {
    const columnName = columnMapping[field];
    if (!columnName) return "";
    return row[columnName] ?? "";
  };

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="max-w-[95vw] max-h-[95vh] w-[1200px] flex flex-col p-0">
        <DialogHeader className="px-6 pt-6 pb-4 border-b">
          <DialogTitle className="text-xl">Import estimation</DialogTitle>
        </DialogHeader>

        {!fileData.length ? (
          <div className="space-y-6 py-8 px-6">
            <div className="flex flex-col items-center justify-center border-2 border-dashed rounded-md p-12 hover-elevate">
              <Upload className="h-12 w-12 text-muted-foreground mb-4" />
              <h3 className="text-lg font-medium mb-2">Upload File</h3>
              <p className="text-sm text-muted-foreground mb-4">
                Drag and drop or click to browse for Excel (.xlsx) or CSV files
              </p>
              <input
                type="file"
                accept=".xlsx,.xls,.csv"
                onChange={handleFileUpload}
                className="hidden"
                id="file-upload"
                data-testid="input-file-upload"
              />
              <label htmlFor="file-upload">
                <Button asChild data-testid="button-browse-file">
                  <span>
                    <FileSpreadsheet className="mr-2 h-4 w-4" />
                    Browse File
                  </span>
                </Button>
              </label>
            </div>
          </div>
        ) : null}
        
        {fileData.length > 0 && (
          <div className="flex-1 flex flex-col min-h-0 px-6 overflow-hidden">
            {/* File info */}
            <div className="flex items-center gap-2 text-sm flex-wrap pb-3 border-b flex-shrink-0">
              <span className="text-muted-foreground">Import file to</span>
              <span className="font-medium">{fileName}</span>
              <span className="px-2 py-1 bg-primary/10 text-primary rounded text-xs font-medium">
                Working
              </span>
              <span className="text-muted-foreground">and match your columns to BuildPro</span>
              <Button
                variant="ghost"
                size="sm"
                className="h-auto p-0 text-primary hover:underline"
                onClick={() => {
                  setFileData([]);
                  setHeaders([]);
                  setColumnMapping({});
                  setFileName("");
                }}
                data-testid="button-change-file"
              >
                Change file
              </Button>
            </div>

            {/* Validation status */}
            {parsedResults.length > 0 && (
              <div className="flex items-center gap-2 py-3 flex-shrink-0">
                <span className="text-sm text-muted-foreground">{validCount} valid rows</span>
                {errorCount > 0 && (
                  <span className="text-sm text-destructive">{errorCount} rows with errors</span>
                )}
              </div>
            )}

            {/* Column mapping dropdowns */}
            <div className="grid grid-cols-8 gap-3 py-3 border-b overflow-x-auto relative z-20 bg-background flex-shrink-0">
              {CORE_MAPPING_FIELDS.map(field => (
                <div key={field} className="space-y-1">
                  <Label className="text-xs font-medium text-muted-foreground">
                    {FIELD_LABELS[field]}{field === "name" && "*"}
                  </Label>
                  <Select
                    value={(columnMapping[field] as string) || "not-mapped"}
                    onValueChange={(value) => handleColumnMappingChange(field, value)}
                  >
                    <SelectTrigger className="h-9" data-testid={`select-column-${field}`}>
                      <SelectValue placeholder="Not mapped" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="not-mapped">Not mapped</SelectItem>
                      {headers.map(header => (
                        <SelectItem key={header} value={header}>
                          {header}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              ))}
            </div>

            {/* Data preview table */}
            <div className="flex-1 min-h-0 py-3 relative">
              <ScrollArea className="h-full border rounded-md">
                <Table>
                <TableHeader className="sticky top-0 bg-background z-10 border-b">
                  <TableRow>
                    <TableHead className="w-8"></TableHead>
                    <TableHead className="w-[200px]">{columnMapping.name || "Name"}</TableHead>
                    <TableHead className="w-[120px]">{columnMapping.type || "Cost Type"}</TableHead>
                    <TableHead className="w-[150px]">{columnMapping.costCode || "Group"}</TableHead>
                    <TableHead className="w-[100px]">{columnMapping.quantity || "Quantity"}</TableHead>
                    <TableHead className="w-[80px]">{columnMapping.unitType || "Unit"}</TableHead>
                    <TableHead className="w-[120px]">{columnMapping.unitCostExTax || "Unit Cost"}</TableHead>
                    <TableHead className="w-[100px]">{columnMapping.markupPercent || "Markup"}</TableHead>
                    <TableHead>{columnMapping.description || "Description"}</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {Object.entries(groupedData).map(([groupName, rows]) => (
                    <React.Fragment key={groupName}>
                      {columnMapping.costCode && (
                        <TableRow
                          className="bg-muted/50 font-medium cursor-pointer hover-elevate"
                          onClick={() => toggleGroup(groupName)}
                        >
                          <TableCell>
                            {collapsedGroups.has(groupName) ? (
                              <ChevronRight className="h-4 w-4" />
                            ) : (
                              <ChevronDown className="h-4 w-4" />
                            )}
                          </TableCell>
                          <TableCell colSpan={8}>
                            {groupName}
                          </TableCell>
                        </TableRow>
                      )}
                      {!collapsedGroups.has(groupName) && rows.map((item, index) => {
                        const { row, parsed } = item;
                        const hasError = parsed?.errors && parsed.errors.length > 0;
                        
                        return (
                          <TableRow 
                            key={`${groupName}-${index}`}
                            className={cn(hasError && "bg-destructive/10")}
                          >
                            <TableCell>
                              {hasError && <AlertCircle className="h-4 w-4 text-destructive" />}
                            </TableCell>
                            {hasError ? (
                              <TableCell colSpan={8} className="text-sm text-destructive">
                                {parsed.errors.join(", ")}
                              </TableCell>
                            ) : (
                              <>
                                <TableCell>{getCellValue(row, "name")}</TableCell>
                                <TableCell>{getCellValue(row, "type")}</TableCell>
                                <TableCell>{getCellValue(row, "costCode")}</TableCell>
                                <TableCell>{getCellValue(row, "quantity")}</TableCell>
                                <TableCell>{getCellValue(row, "unitType")}</TableCell>
                                <TableCell>{getCellValue(row, "unitCostExTax")}</TableCell>
                                <TableCell>{getCellValue(row, "markupPercent")}</TableCell>
                                <TableCell className="max-w-[200px] truncate">
                                  {getCellValue(row, "description")}
                                </TableCell>
                              </>
                            )}
                          </TableRow>
                        );
                      })}
                    </React.Fragment>
                  ))}
                </TableBody>
              </Table>
              </ScrollArea>
            </div>
          </div>
        )}

        {fileData.length > 0 && (
          <div className="flex justify-end gap-2 px-6 py-4 border-t flex-shrink-0 bg-background">
            <Button
              variant="outline"
              onClick={handleClose}
              disabled={isImporting}
              data-testid="button-cancel-import"
            >
              Cancel
            </Button>
            <Button
              onClick={handleImport}
              disabled={!columnMapping.name || validCount === 0 || isImporting}
              data-testid="button-import-continue"
            >
              {isImporting ? "Importing..." : `Continue (${validCount} items)`}
            </Button>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
