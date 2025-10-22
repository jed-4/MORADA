import React, { useState, useMemo } from "react";
import { Upload, FileSpreadsheet, ChevronDown, ChevronRight, X, AlertCircle, CheckCircle } from "lucide-react";
import * as XLSX from "xlsx";
import { useQuery } from "@tanstack/react-query";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
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
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import {
  ImportEstimateItem,
  ColumnMapping,
  autoDetectColumnMapping,
  parseImportRow,
  CostCode,
} from "@shared/import";
import { useToast } from "@/hooks/use-toast";

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
  costCode: "Cost Code",
  group: "Group",
  status: "Status",
  proposalVisible: "Proposal Visible",
  shownAs: "Shown As",
};

// Core mapping fields to display at the top
const CORE_MAPPING_FIELDS: (keyof ImportEstimateItem)[] = [
  "name",
  "type",
  "costCode",
  "group",
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
  const { toast } = useToast();
  const [fileName, setFileName] = useState<string>("");
  const [fileData, setFileData] = useState<any[]>([]);
  const [headers, setHeaders] = useState<string[]>([]);
  const [columnMapping, setColumnMapping] = useState<ColumnMapping>({});
  const [isImporting, setIsImporting] = useState(false);
  const [collapsedGroups, setCollapsedGroups] = useState<Set<string>>(new Set());
  const [selectedGroups, setSelectedGroups] = useState<Set<string>>(new Set());

  // Fetch cost codes for matching
  const { data: costCodes = [] } = useQuery<CostCode[]>({
    queryKey: ["/api/cost-codes"],
    enabled: open,
  });

  // Compute parsed results whenever data or mapping changes
  const parsedResults = useMemo(() => {
    if (!fileData.length || !columnMapping.name) return [];
    return fileData.map((row, index) => parseImportRow(row, columnMapping, index, costCodes));
  }, [fileData, columnMapping, costCodes]);

  const validCount = parsedResults.filter(r => r.data).length;
  const errorCount = parsedResults.filter(r => r.errors).length;
  
  // Count cost code matches
  const matchedCostCodes = parsedResults.filter(r => r.costCodeMatch?.matchedCode).length;
  const unmatchedCostCodes = parsedResults.filter(r => r.costCodeMatch && !r.costCodeMatch.matchedCode).length;

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

  const toggleGroupSelection = (groupName: string) => {
    setSelectedGroups(prev => {
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
      
      toast({
        title: "Success",
        description: `Successfully imported ${result.count} items!`,
      });
      
      handleClose();
      onImportComplete();
    } catch (error: any) {
      console.error("Import error:", error);
      toast({
        title: "Error",
        description: error.message || "Failed to import items",
        variant: "destructive",
      });
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
      <DialogContent className="max-w-[1200px] w-[95vw] max-h-[90vh] p-0 flex flex-col">
        {/* Loading Overlay */}
        {isImporting && (
          <div className="absolute inset-0 bg-background/80 backdrop-blur-sm z-50 flex flex-col items-center justify-center rounded-lg">
            <div className="flex flex-col items-center space-y-4">
              <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary"></div>
              <p className="text-lg font-medium">Importing items...</p>
              <p className="text-sm text-muted-foreground">Please wait while we process your data</p>
            </div>
          </div>
        )}
        
        {/* Header - Fixed */}
        <DialogHeader className="px-6 pt-6 pb-4 border-b flex-shrink-0">
          <DialogTitle className="text-xl">Import estimation</DialogTitle>
        </DialogHeader>

        {/* Upload State */}
        {!fileData.length ? (
          <div className="flex-1 flex items-center justify-center py-8 px-6">
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
      
      {/* Preview State - Scrollable Content */}
      {fileData.length > 0 && (
        <>
          <div className="flex-1 overflow-auto px-6">
            {/* File info */}
            <div className="flex items-center gap-2 text-sm flex-wrap py-3 border-b sticky top-0 bg-background z-10">
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

            {/* Column mapping dropdowns - Sticky */}
            <div className="grid grid-cols-8 gap-3 py-3 border-b sticky top-[52px] bg-background z-10">
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
            <div className="py-3">
              <div className="border rounded-md">
                <Table>
                <TableHeader className="bg-muted/50">
                  <TableRow>
                    <TableHead className="w-8"></TableHead>
                    <TableHead className="w-[200px]">{columnMapping.name || "Name"}</TableHead>
                    <TableHead className="w-[120px]">{columnMapping.type || "Cost Type"}</TableHead>
                    <TableHead className="w-[150px]">{columnMapping.costCode || "Cost Code"}</TableHead>
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
                        <TableRow className="bg-muted/50 font-medium">
                          <TableCell>
                            <div
                              className="flex items-center gap-2 cursor-pointer"
                              onClick={() => toggleGroup(groupName)}
                            >
                              {collapsedGroups.has(groupName) ? (
                                <ChevronRight className="h-4 w-4" />
                              ) : (
                                <ChevronDown className="h-4 w-4" />
                              )}
                            </div>
                          </TableCell>
                          <TableCell colSpan={8}>
                            <div className="flex items-center gap-2">
                              <Checkbox
                                checked={selectedGroups.has(groupName)}
                                onCheckedChange={() => toggleGroupSelection(groupName)}
                                data-testid={`checkbox-group-${groupName}`}
                              />
                              <span>{groupName}</span>
                            </div>
                          </TableCell>
                        </TableRow>
                      )}
                      {!collapsedGroups.has(groupName) && rows.map((item, index) => {
                        const { row, parsed } = item;
                        const hasError = parsed?.errors && parsed.errors.length > 0;
                        const isGroupSelected = selectedGroups.has(groupName);
                        const costCodeMatch = parsed.costCodeMatch;
                        
                        return (
                          <TableRow 
                            key={`${groupName}-${index}`}
                            className={cn(
                              hasError && "bg-destructive/10",
                              isGroupSelected && !hasError && "bg-primary/10"
                            )}
                          >
                            <TableCell>
                              {hasError && <AlertCircle className="h-4 w-4 text-destructive" />}
                              {!hasError && costCodeMatch?.matchedCode && (
                                <CheckCircle className="h-4 w-4 text-green-600" />
                              )}
                            </TableCell>
                            {hasError ? (
                              <TableCell colSpan={8} className="text-sm text-destructive">
                                {parsed.errors.join(", ")}
                              </TableCell>
                            ) : (
                              <>
                                <TableCell>{getCellValue(row, "name")}</TableCell>
                                <TableCell>{getCellValue(row, "type")}</TableCell>
                                <TableCell>
                                  {costCodeMatch ? (
                                    <div className="flex items-center gap-1.5">
                                      {costCodeMatch.matchedCode ? (
                                        <Badge variant="default" className="bg-green-600 hover:bg-green-700 text-xs">
                                          {costCodeMatch.matchedCode.code} - {costCodeMatch.matchedCode.title}
                                        </Badge>
                                      ) : (
                                        <Badge variant="secondary" className="text-xs">
                                          {costCodeMatch.rawValue} (no match)
                                        </Badge>
                                      )}
                                    </div>
                                  ) : (
                                    getCellValue(row, "costCode")
                                  )}
                                </TableCell>
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
              </div>
            </div>
          </div>

          {/* Footer - Fixed at bottom with summary */}
          <div className="flex-shrink-0 border-t bg-background">
            {/* Summary bar */}
            {parsedResults.length > 0 && (
              <div className="flex items-center gap-4 px-6 py-3 border-b bg-muted/30">
                <span className="text-sm font-medium text-muted-foreground">Summary:</span>
                <span className="text-sm font-medium text-green-600 flex items-center gap-1">
                  <CheckCircle className="h-4 w-4" />
                  {validCount} valid
                </span>
                {errorCount > 0 && (
                  <span className="text-sm font-medium text-destructive flex items-center gap-1">
                    <AlertCircle className="h-4 w-4" />
                    {errorCount} errors
                  </span>
                )}
                {matchedCostCodes > 0 && (
                  <span className="text-sm font-medium text-green-600">
                    {matchedCostCodes} cost code{matchedCostCodes !== 1 ? 's' : ''} matched
                  </span>
                )}
                {unmatchedCostCodes > 0 && (
                  <span className="text-sm font-medium text-amber-600">
                    {unmatchedCostCodes} unmatched
                  </span>
                )}
              </div>
            )}
            
            {/* Action buttons */}
            <div className="flex justify-end gap-2 px-6 py-4">
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
                {isImporting ? "Importing..." : `Import ${validCount} items`}
              </Button>
            </div>
          </div>
        </>
      )}
      </DialogContent>
    </Dialog>
  );
}
