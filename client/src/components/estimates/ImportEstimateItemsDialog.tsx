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
  ImportMatchOptions,
  FuzzyMatch,
} from "@shared/import";
import { useToast } from "@/hooks/use-toast";
import { EstimateGroup, FieldOption } from "@shared/schema";

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
  
  // User corrections for unmatched values (raw value -> corrected value)
  const [typeCorrections, setTypeCorrections] = useState<Record<string, string>>({});
  const [allowanceCorrections, setAllowanceCorrections] = useState<Record<string, string>>({});
  
  // Valid options for dropdowns
  const VALID_TYPES = ["Material", "Labour", "Subcontractor", "Fee"];
  const VALID_ALLOWANCES = ["None", "Prime Cost", "Provisional Sum"];

  // Fetch cost codes for matching
  const { data: costCodes = [] } = useQuery<CostCode[]>({
    queryKey: ["/api/cost-codes"],
    enabled: open,
  });

  // Fetch existing estimate groups for matching
  const { data: existingGroups = [] } = useQuery<EstimateGroup[]>({
    queryKey: ["/api/estimates", estimateId, "groups"],
    enabled: open && !!estimateId,
  });

  // Fetch status options from field settings
  const { data: statusOptions = [] } = useQuery<FieldOption[]>({
    queryKey: ["/api/field-categories/estimate_item.status/options"],
    enabled: open,
    queryFn: async () => {
      try {
        const response = await fetch("/api/field-categories");
        const categories = await response.json();
        const statusCategory = categories.find((c: any) => c.key === "estimate_item.status");
        if (statusCategory) {
          const optionsResponse = await fetch(`/api/field-categories/${statusCategory.id}/options`);
          return optionsResponse.json();
        }
        return [];
      } catch {
        return [];
      }
    },
  });

  // Build match options for fuzzy matching
  const matchOptions: ImportMatchOptions = useMemo(() => ({
    costCodes,
    groups: existingGroups.map(g => ({ id: g.id, name: g.name })),
    statusOptions: statusOptions.map(s => ({ id: s.id, name: s.name, key: s.key })),
  }), [costCodes, existingGroups, statusOptions]);

  // Compute parsed results from original data (no corrections applied during parsing)
  const parsedResults = useMemo(() => {
    if (!fileData.length || !columnMapping.name) return [];
    return fileData.map((row, index) => parseImportRow(row, columnMapping, index, costCodes, matchOptions));
  }, [fileData, columnMapping, costCodes, matchOptions]);
  
  // Check if a row has a corrected type value
  const getTypeCorrection = (rawValue: string | undefined): string | undefined => {
    if (!rawValue) return undefined;
    return typeCorrections[rawValue.trim()];
  };
  
  // Check if a row's type error is fixed by user correction
  const isTypeCorrected = (parsed: any): boolean => {
    if (parsed?.typeMatch?.rawValue) {
      return !!typeCorrections[parsed.typeMatch.rawValue];
    }
    return false;
  };

  // Calculate counts including corrected rows
  const { validCount, errorCount, correctedCount } = useMemo(() => {
    let valid = 0;
    let errors = 0;
    let corrected = 0;
    
    parsedResults.forEach(parsed => {
      const hasTypeError = parsed.errors?.some(e => e.includes("type:"));
      const hasOtherErrors = parsed.errors?.some(e => !e.includes("type:") && !e.includes("allowance:"));
      const rawTypeValue = parsed.typeMatch?.rawValue;
      const typeIsCorrected = rawTypeValue ? !!typeCorrections[rawTypeValue] : false;
      
      if (parsed.data && !parsed.errors?.length) {
        valid++;
      } else if (hasTypeError && !hasOtherErrors && typeIsCorrected) {
        // Row has only type error which is corrected
        corrected++;
      } else if (parsed.errors?.length) {
        errors++;
      }
    });
    
    return { validCount: valid + corrected, errorCount: errors, correctedCount: corrected };
  }, [parsedResults, typeCorrections]);
  
  // Count fuzzy match statistics
  const matchedCostCodes = parsedResults.filter(r => r.costCodeMatch?.matchedCode).length;
  const unmatchedCostCodes = parsedResults.filter(r => r.costCodeMatch && !r.costCodeMatch.matchedCode).length;
  const matchedTypes = parsedResults.filter(r => r.typeMatch?.confidence === "high").length;
  const matchedUnits = parsedResults.filter(r => r.unitTypeMatch?.confidence === "high" || r.unitTypeMatch?.confidence === "medium").length;
  const matchedGroups = parsedResults.filter(r => r.groupMatch?.matched).length;
  const newGroups = parsedResults.filter(r => r.groupMatch && !r.groupMatch.matched).length;

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

  // Group data by group/parent name with parsed results
  const groupedData = useMemo(() => {
    if (!fileData.length || !columnMapping.group) {
      return { ungrouped: fileData.map((row, idx) => ({ row, parsed: parsedResults[idx] })) };
    }

    const groups: Record<string, any[]> = {};
    const groupColumn = columnMapping.group as string;
    fileData.forEach((row, idx) => {
      const groupName = row[groupColumn] || "Ungrouped";
      if (!groups[groupName]) {
        groups[groupName] = [];
      }
      groups[groupName].push({ row, parsed: parsedResults[idx] });
    });

    return groups;
  }, [fileData, columnMapping.group, parsedResults]);

  const handleImport = async () => {
    setIsImporting(true);
    
    try {
      // Get valid rows and apply corrections
      const validRows: any[] = [];
      
      parsedResults.forEach((parsed, index) => {
        // Check if row is valid or has only fixable errors with corrections applied
        const hasTypeError = parsed.errors?.some(e => e.includes("type:"));
        const hasOtherErrors = parsed.errors?.some(e => !e.includes("type:") && !e.includes("allowance:"));
        
        // Get correction for type if needed
        const rawTypeValue = parsed.typeMatch?.rawValue;
        const typeCorrection = rawTypeValue ? typeCorrections[rawTypeValue] : undefined;
        
        // Skip if has non-fixable errors, or has type error without correction
        if (hasOtherErrors) return;
        if (hasTypeError && !typeCorrection) return;
        
        // Build the item data
        if (parsed.data) {
          const item: any = { ...parsed.data, estimateId };
          
          // Apply type correction if needed
          if (typeCorrection) {
            item.type = typeCorrection;
          }
          
          validRows.push(item);
        } else if (hasTypeError && typeCorrection) {
          // Row had only type error which is now corrected - rebuild with corrected value injected
          const rawRow = { ...fileData[index] };
          // Inject the corrected type value before parsing
          const typeColumn = columnMapping.type;
          if (typeColumn) {
            rawRow[typeColumn] = typeCorrection;
          }
          const rebuiltParsed = parseImportRow(rawRow, columnMapping, index, costCodes, matchOptions);
          if (rebuiltParsed.data) {
            const item: any = { ...rebuiltParsed.data, estimateId };
            validRows.push(item);
          }
        }
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
    setTypeCorrections({});
    setAllowanceCorrections({});
    onClose();
  };
  
  // Count rows that need type/allowance corrections
  const unmatchedTypeValues = useMemo(() => {
    const values = new Set<string>();
    parsedResults.forEach(parsed => {
      // Has a type error
      if (parsed?.errors?.some(e => e.includes("type:"))) {
        const typeCol = columnMapping.type;
        if (typeCol) {
          const rawVal = fileData[parsed.rowIndex]?.[typeCol];
          if (rawVal && !typeCorrections[String(rawVal).trim()]) {
            values.add(String(rawVal).trim());
          }
        }
      }
      // Low confidence type match
      if (parsed?.typeMatch && !parsed.typeMatch.matchedValue && parsed.typeMatch.rawValue) {
        if (!typeCorrections[parsed.typeMatch.rawValue]) {
          values.add(parsed.typeMatch.rawValue);
        }
      }
    });
    return values;
  }, [parsedResults, typeCorrections, columnMapping.type, fileData]);

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
          <div className="flex-1 overflow-auto">
            {/* Sticky header section - File info + Column mapping */}
            <div className="sticky top-0 bg-background z-10 px-6">
              {/* File info */}
              <div className="flex items-center gap-2 text-sm flex-wrap py-3 border-b">
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

              {/* Column mapping dropdowns */}
              <div className="grid grid-cols-8 gap-3 py-3 border-b">
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
            </div>

            {/* Data preview table */}
            <div className="py-3 px-6">
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
                      {columnMapping.group && (
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
                        const costCodeMatch = parsed?.costCodeMatch;
                        
                        // Check if the error is specifically about type (fixable inline)
                        const typeError = parsed?.errors?.find(e => e.includes("type:"));
                        const allowanceError = parsed?.errors?.find(e => e.includes("allowance:"));
                        const hasOnlyFixableErrors = hasError && parsed?.errors?.every(e => 
                          e.includes("type:") || e.includes("allowance:")
                        );
                        
                        // Get raw values for correction dropdowns
                        const rawTypeValue = getCellValue(row, "type")?.toString().trim();
                        const rawAllowanceValue = getCellValue(row, "allowance")?.toString().trim();
                        
                        // Check if correction was applied
                        const typeCorrectionApplied = rawTypeValue && typeCorrections[rawTypeValue];
                        const typeNowFixed = hasOnlyFixableErrors && typeCorrectionApplied;
                        
                        // Determine if type needs correction (has error or low confidence) and not yet corrected
                        const typeNeedsCorrection = (typeError || 
                          (parsed?.typeMatch && !parsed.typeMatch.matchedValue && parsed.typeMatch.rawValue)) && 
                          !typeCorrectionApplied;
                        const typeIsMatched = parsed?.typeMatch?.matchedValue && parsed.typeMatch.confidence === "high";
                        
                        return (
                          <TableRow 
                            key={`${groupName}-${index}`}
                            className={cn(
                              hasError && !hasOnlyFixableErrors && !typeNowFixed && "bg-destructive/10",
                              hasOnlyFixableErrors && !typeNowFixed && "bg-amber-50 dark:bg-amber-900/20",
                              typeNowFixed && "bg-green-50 dark:bg-green-900/20",
                              isGroupSelected && !hasError && "bg-primary/10"
                            )}
                          >
                            <TableCell>
                              {hasError && !hasOnlyFixableErrors && !typeNowFixed && <AlertCircle className="h-4 w-4 text-destructive" />}
                              {hasOnlyFixableErrors && !typeNowFixed && <AlertCircle className="h-4 w-4 text-amber-500" />}
                              {typeNowFixed && <CheckCircle className="h-4 w-4 text-green-600" />}
                              {!hasError && !typeNowFixed && (
                                <CheckCircle className="h-4 w-4 text-green-600" />
                              )}
                            </TableCell>
                            {hasError && !hasOnlyFixableErrors && !typeNowFixed ? (
                              <TableCell colSpan={8} className="text-sm text-destructive">
                                {parsed.errors.join(", ")}
                              </TableCell>
                            ) : (
                              <>
                                <TableCell>{getCellValue(row, "name")}</TableCell>
                                <TableCell>
                                  {typeCorrectionApplied ? (
                                    <Badge 
                                      variant="default"
                                      className="text-xs bg-green-600 hover:bg-green-700"
                                    >
                                      {typeCorrections[rawTypeValue]}
                                      <span className="opacity-70 ml-1">({rawTypeValue})</span>
                                    </Badge>
                                  ) : typeNeedsCorrection && rawTypeValue ? (
                                    <div className="flex items-center gap-1.5">
                                      <Select
                                        value=""
                                        onValueChange={(value) => {
                                          setTypeCorrections(prev => ({
                                            ...prev,
                                            [rawTypeValue]: value
                                          }));
                                        }}
                                      >
                                        <SelectTrigger className="h-7 w-[140px] text-xs border-amber-400 bg-amber-50 dark:bg-amber-900/20">
                                          <SelectValue placeholder="Select type..." />
                                        </SelectTrigger>
                                        <SelectContent>
                                          {VALID_TYPES.map(type => (
                                            <SelectItem key={type} value={type}>
                                              {type}
                                            </SelectItem>
                                          ))}
                                        </SelectContent>
                                      </Select>
                                      <span className="text-xs text-muted-foreground">
                                        ({rawTypeValue})
                                      </span>
                                    </div>
                                  ) : typeIsMatched ? (
                                    <Badge 
                                      variant="default"
                                      className="text-xs bg-green-600 hover:bg-green-700"
                                    >
                                      {parsed.typeMatch!.matchedValue}
                                      {parsed.typeMatch!.rawValue !== parsed.typeMatch!.matchedValue && (
                                        <span className="opacity-70 ml-1">({parsed.typeMatch!.rawValue})</span>
                                      )}
                                    </Badge>
                                  ) : (
                                    getCellValue(row, "type")
                                  )}
                                </TableCell>
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
                    {unmatchedCostCodes} cost code{unmatchedCostCodes !== 1 ? 's' : ''} unmatched
                  </span>
                )}
                {matchedTypes > 0 && (
                  <span className="text-sm font-medium text-green-600">
                    {matchedTypes} type{matchedTypes !== 1 ? 's' : ''} matched
                  </span>
                )}
                {unmatchedTypeValues.size > 0 && (
                  <span className="text-sm font-medium text-amber-600">
                    {unmatchedTypeValues.size} type{unmatchedTypeValues.size !== 1 ? 's' : ''} need fixing
                  </span>
                )}
                {Object.keys(typeCorrections).length > 0 && (
                  <span className="text-sm font-medium text-blue-600">
                    {Object.keys(typeCorrections).length} correction{Object.keys(typeCorrections).length !== 1 ? 's' : ''} applied
                  </span>
                )}
                {matchedGroups > 0 && (
                  <span className="text-sm font-medium text-green-600">
                    {matchedGroups} group{matchedGroups !== 1 ? 's' : ''} matched
                  </span>
                )}
                {newGroups > 0 && (
                  <span className="text-sm font-medium text-blue-600">
                    {newGroups} new group{newGroups !== 1 ? 's' : ''} to create
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
