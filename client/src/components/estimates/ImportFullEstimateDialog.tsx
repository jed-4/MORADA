import { useState } from "react";
import { Upload, FileSpreadsheet, CheckCircle2, AlertCircle } from "lucide-react";
import * as XLSX from "xlsx";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
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
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { cn } from "@/lib/utils";
import {
  detectEstimateImportFormat,
  parseBuildernRow,
  parseWunderbuildRow,
  ImportEstimateFormat,
  ImportEstimateGroup,
  ImportEstimateWithGroupsItem,
} from "@shared/import";

type Step = "upload" | "map" | "name";

interface ColumnMapping {
  name?: string;
  parentName?: string;
  costType?: string;
  quantity?: string;
  unit?: string;
  unitCostExTax?: string;
  markupPercent?: string;
  description?: string;
  costCode?: string;
}

interface ImportFullEstimateDialogProps {
  open: boolean;
  onClose: () => void;
  projectId: string;
  onImportComplete: () => void;
}

export function ImportFullEstimateDialog({
  open,
  onClose,
  projectId,
  onImportComplete,
}: ImportFullEstimateDialogProps) {
  const [step, setStep] = useState<Step>("upload");
  const [estimateName, setEstimateName] = useState("");
  const [fileData, setFileData] = useState<any[]>([]);
  const [headers, setHeaders] = useState<string[]>([]);
  const [columnMapping, setColumnMapping] = useState<ColumnMapping>({});
  const [format, setFormat] = useState<ImportEstimateFormat>("unknown");
  const [groups, setGroups] = useState<ImportEstimateGroup[]>([]);
  const [items, setItems] = useState<ImportEstimateWithGroupsItem[]>([]);
  const [parseErrors, setParseErrors] = useState<string[]>([]);
  const [isImporting, setIsImporting] = useState(false);

  const handleFileUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    try {
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

      // Detect format
      const detectedFormat = detectEstimateImportFormat(headerRow);
      setFormat(detectedFormat);

      // Auto-detect column mappings based on format
      const mapping: ColumnMapping = {};
      if (detectedFormat === "buildern") {
        mapping.name = "Name";
        mapping.parentName = "Parent Name";
        mapping.costType = "Cost Type";
        mapping.quantity = "Quantity";
        mapping.unit = "Unit";
        mapping.unitCostExTax = "Unit cost ex. tax";
        mapping.markupPercent = "Markup %";
        mapping.description = "Description";
        mapping.costCode = "Cost Code";
      } else if (detectedFormat === "wunderbuild") {
        mapping.name = "Costing Item";
        mapping.parentName = "Category";
        mapping.costType = "Cost Type";
        mapping.quantity = "Quantity";
        mapping.unit = "UOM";
        mapping.unitCostExTax = "Cost (ex.)";
        mapping.markupPercent = "Markup (%)";
        mapping.description = "Note";
        mapping.costCode = "Cost Code";
      }
      setColumnMapping(mapping);

      // Set default estimate name from filename
      const defaultName = file.name.replace(/\.(xlsx|xls|csv)$/i, "");
      setEstimateName(defaultName);

      setStep("map");
    } catch (error) {
      console.error("Error reading file:", error);
      alert("Failed to read file. Please ensure it's a valid Excel or CSV file.");
    }
  };

  const handleColumnMappingChange = (field: keyof ColumnMapping, value: string) => {
    setColumnMapping(prev => ({
      ...prev,
      [field]: value === "none" ? undefined : value,
    }));
  };

  const handleContinue = () => {
    // Parse the data with the current column mapping
    const parsedGroups: ImportEstimateGroup[] = [];
    const parsedItems: ImportEstimateWithGroupsItem[] = [];
    const errors: string[] = [];
    const groupNames = new Set<string>();
    let previousCategory = "";
    let sortOrder = 0;

    fileData.forEach((row, index) => {
      try {
        if (format === "buildern") {
          // Map row data using column mapping
          const mappedRow: any = {};
          Object.entries(columnMapping).forEach(([field, columnName]) => {
            if (columnName) {
              mappedRow[columnName] = row[columnName];
            }
          });

          const parsed = parseBuildernRow(mappedRow);

          if (parsed.isGroup && parsed.groupName) {
            if (!groupNames.has(parsed.groupName)) {
              parsedGroups.push({
                name: parsed.groupName,
                sortOrder: sortOrder++,
              });
              groupNames.add(parsed.groupName);
            }
          } else if (parsed.item) {
            parsedItems.push(parsed.item as ImportEstimateWithGroupsItem);
          }
        } else if (format === "wunderbuild") {
          // Map row data using column mapping
          const mappedRow: any = {};
          Object.entries(columnMapping).forEach(([field, columnName]) => {
            if (columnName) {
              mappedRow[columnName] = row[columnName];
            }
          });

          const parsed = parseWunderbuildRow(mappedRow, previousCategory);
          previousCategory = parsed.category;

          if (parsed.isGroup && parsed.groupName) {
            if (!groupNames.has(parsed.groupName)) {
              parsedGroups.push({
                name: parsed.groupName,
                sortOrder: sortOrder++,
              });
              groupNames.add(parsed.groupName);
            }
          } else if (parsed.item) {
            parsedItems.push(parsed.item as ImportEstimateWithGroupsItem);
          }
        }
      } catch (error: any) {
        errors.push(`Row ${index + 1}: ${error.message}`);
      }
    });

    setGroups(parsedGroups);
    setItems(parsedItems);
    setParseErrors(errors);
    setStep("name");
  };

  const handleImport = async () => {
    if (!estimateName.trim()) {
      alert("Please enter an estimate name");
      return;
    }

    setIsImporting(true);

    try {
      const response = await fetch(`/api/projects/${projectId}/estimates/import`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: estimateName.trim(),
          groups,
          items,
        }),
        credentials: "include",
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || "Import failed");
      }

      const result = await response.json();
      onImportComplete();
      handleClose();
      alert(`Successfully imported estimate with ${result.groupCount} groups and ${result.itemCount} items!`);
    } catch (error: any) {
      console.error("Import error:", error);
      alert(error.message || "Failed to import estimate");
    } finally {
      setIsImporting(false);
    }
  };

  const handleClose = () => {
    setStep("upload");
    setEstimateName("");
    setFileData([]);
    setHeaders([]);
    setColumnMapping({});
    setFormat("unknown");
    setGroups([]);
    setItems([]);
    setParseErrors([]);
    onClose();
  };

  const formatLabel = format === "buildern" ? "Buildern" : format === "wunderbuild" ? "Wunderbuild" : "Unknown";

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="max-w-6xl max-h-[90vh]">
        <DialogHeader>
          <DialogTitle>Import Estimate</DialogTitle>
          <DialogDescription>
            {step === "upload" && "Upload a buildern or wunderbuild estimate export file"}
            {step === "map" && `Match your columns to BuildPro fields (${formatLabel} format detected)`}
            {step === "name" && "Review and name your imported estimate"}
          </DialogDescription>
        </DialogHeader>

        {step === "upload" && (
          <div className="space-y-6">
            <div className="flex flex-col items-center justify-center border-2 border-dashed rounded-md p-12 hover-elevate">
              <Upload className="h-12 w-12 text-muted-foreground mb-4" />
              <h3 className="text-lg font-medium mb-2">Upload Estimate Export</h3>
              <p className="text-sm text-muted-foreground mb-4">
                Upload a buildern or wunderbuild CSV/Excel estimate export file
              </p>
              <input
                type="file"
                accept=".xlsx,.xls,.csv"
                onChange={handleFileUpload}
                className="hidden"
                id="estimate-file-upload"
                data-testid="input-estimate-file-upload"
              />
              <label htmlFor="estimate-file-upload">
                <Button asChild data-testid="button-browse-estimate-file">
                  <span>
                    <FileSpreadsheet className="mr-2 h-4 w-4" />
                    Browse File
                  </span>
                </Button>
              </label>
            </div>

            <div className="p-4 bg-muted/50 rounded-md">
              <p className="text-sm font-medium mb-2">Supported Formats</p>
              <ul className="text-xs text-muted-foreground space-y-1">
                <li>• Buildern estimate exports (CSV/Excel)</li>
                <li>• Wunderbuild estimate exports (CSV/Excel)</li>
                <li>• Files must include groups and items with pricing data</li>
              </ul>
            </div>
          </div>
        )}

        {step === "map" && (
          <div className="space-y-4">
            <div className="p-4 bg-muted/50 rounded-md">
              <p className="text-sm font-medium mb-3">Map your file columns to BuildPro fields</p>
              <div className="grid grid-cols-3 gap-3">
                <div>
                  <Label htmlFor="map-name" className="text-xs mb-1">Name*</Label>
                  <Select
                    value={columnMapping.name || "none"}
                    onValueChange={(value) => handleColumnMappingChange("name", value)}
                  >
                    <SelectTrigger id="map-name" data-testid="select-column-name">
                      <SelectValue placeholder="Select column" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">-- Not mapped --</SelectItem>
                      {headers.map(header => (
                        <SelectItem key={header} value={header}>{header}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div>
                  <Label htmlFor="map-group" className="text-xs mb-1">Group*</Label>
                  <Select
                    value={columnMapping.parentName || "none"}
                    onValueChange={(value) => handleColumnMappingChange("parentName", value)}
                  >
                    <SelectTrigger id="map-group" data-testid="select-column-group">
                      <SelectValue placeholder="Select column" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">-- Not mapped --</SelectItem>
                      {headers.map(header => (
                        <SelectItem key={header} value={header}>{header}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div>
                  <Label htmlFor="map-cost-type" className="text-xs mb-1">Cost Type</Label>
                  <Select
                    value={columnMapping.costType || "none"}
                    onValueChange={(value) => handleColumnMappingChange("costType", value)}
                  >
                    <SelectTrigger id="map-cost-type" data-testid="select-column-cost-type">
                      <SelectValue placeholder="Select column" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">-- Not mapped --</SelectItem>
                      {headers.map(header => (
                        <SelectItem key={header} value={header}>{header}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div>
                  <Label htmlFor="map-quantity" className="text-xs mb-1">Quantity*</Label>
                  <Select
                    value={columnMapping.quantity || "none"}
                    onValueChange={(value) => handleColumnMappingChange("quantity", value)}
                  >
                    <SelectTrigger id="map-quantity" data-testid="select-column-quantity">
                      <SelectValue placeholder="Select column" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">-- Not mapped --</SelectItem>
                      {headers.map(header => (
                        <SelectItem key={header} value={header}>{header}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div>
                  <Label htmlFor="map-unit" className="text-xs mb-1">Unit</Label>
                  <Select
                    value={columnMapping.unit || "none"}
                    onValueChange={(value) => handleColumnMappingChange("unit", value)}
                  >
                    <SelectTrigger id="map-unit" data-testid="select-column-unit">
                      <SelectValue placeholder="Select column" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">-- Not mapped --</SelectItem>
                      {headers.map(header => (
                        <SelectItem key={header} value={header}>{header}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div>
                  <Label htmlFor="map-unit-cost" className="text-xs mb-1">Unit Cost (ex. tax)</Label>
                  <Select
                    value={columnMapping.unitCostExTax || "none"}
                    onValueChange={(value) => handleColumnMappingChange("unitCostExTax", value)}
                  >
                    <SelectTrigger id="map-unit-cost" data-testid="select-column-unit-cost">
                      <SelectValue placeholder="Select column" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">-- Not mapped --</SelectItem>
                      {headers.map(header => (
                        <SelectItem key={header} value={header}>{header}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div>
                  <Label htmlFor="map-markup" className="text-xs mb-1">Markup %</Label>
                  <Select
                    value={columnMapping.markupPercent || "none"}
                    onValueChange={(value) => handleColumnMappingChange("markupPercent", value)}
                  >
                    <SelectTrigger id="map-markup" data-testid="select-column-markup">
                      <SelectValue placeholder="Select column" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">-- Not mapped --</SelectItem>
                      {headers.map(header => (
                        <SelectItem key={header} value={header}>{header}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div>
                  <Label htmlFor="map-description" className="text-xs mb-1">Description</Label>
                  <Select
                    value={columnMapping.description || "none"}
                    onValueChange={(value) => handleColumnMappingChange("description", value)}
                  >
                    <SelectTrigger id="map-description" data-testid="select-column-description">
                      <SelectValue placeholder="Select column" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">-- Not mapped --</SelectItem>
                      {headers.map(header => (
                        <SelectItem key={header} value={header}>{header}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div>
                  <Label htmlFor="map-cost-code" className="text-xs mb-1">Cost Code</Label>
                  <Select
                    value={columnMapping.costCode || "none"}
                    onValueChange={(value) => handleColumnMappingChange("costCode", value)}
                  >
                    <SelectTrigger id="map-cost-code" data-testid="select-column-cost-code">
                      <SelectValue placeholder="Select column" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">-- Not mapped --</SelectItem>
                      {headers.map(header => (
                        <SelectItem key={header} value={header}>{header}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
            </div>

            <div className="flex items-center justify-between">
              <p className="text-sm text-muted-foreground">
                {fileData.length} rows detected
              </p>
              <Button onClick={handleContinue} data-testid="button-continue-import">
                Continue
              </Button>
            </div>

            <ScrollArea className="h-[400px] border rounded-md">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="text-xs">Name</TableHead>
                    <TableHead className="text-xs">Group</TableHead>
                    <TableHead className="text-xs">Type</TableHead>
                    <TableHead className="text-xs">Qty</TableHead>
                    <TableHead className="text-xs">Unit</TableHead>
                    <TableHead className="text-xs">Cost</TableHead>
                    <TableHead className="text-xs">Markup</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {fileData.slice(0, 20).map((row, index) => (
                    <TableRow key={index}>
                      <TableCell className="text-xs">
                        {columnMapping.name ? row[columnMapping.name] : "-"}
                      </TableCell>
                      <TableCell className="text-xs text-muted-foreground">
                        {columnMapping.parentName ? row[columnMapping.parentName] : "-"}
                      </TableCell>
                      <TableCell className="text-xs">
                        {columnMapping.costType ? row[columnMapping.costType] : "-"}
                      </TableCell>
                      <TableCell className="text-xs">
                        {columnMapping.quantity ? row[columnMapping.quantity] : "-"}
                      </TableCell>
                      <TableCell className="text-xs">
                        {columnMapping.unit ? row[columnMapping.unit] : "-"}
                      </TableCell>
                      <TableCell className="text-xs">
                        {columnMapping.unitCostExTax ? row[columnMapping.unitCostExTax] : "-"}
                      </TableCell>
                      <TableCell className="text-xs">
                        {columnMapping.markupPercent ? row[columnMapping.markupPercent] : "-"}
                      </TableCell>
                    </TableRow>
                  ))}
                  {fileData.length > 20 && (
                    <TableRow>
                      <TableCell colSpan={7} className="text-center text-xs text-muted-foreground">
                        ... and {fileData.length - 20} more rows
                      </TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            </ScrollArea>
          </div>
        )}

        {step === "name" && (
          <div className="space-y-6">
            <div className="flex items-center justify-between p-4 bg-muted/50 rounded-md">
              <div>
                <Badge variant="outline">{formatLabel} Format</Badge>
                <p className="text-sm text-muted-foreground mt-2">
                  {groups.length} groups, {items.length} items ready to import
                </p>
                {parseErrors.length > 0 && (
                  <p className="text-sm text-destructive mt-1">
                    {parseErrors.length} rows had errors and will be skipped
                  </p>
                )}
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="estimate-name">Estimate Name</Label>
              <Input
                id="estimate-name"
                value={estimateName}
                onChange={(e) => setEstimateName(e.target.value)}
                placeholder="Enter estimate name"
                data-testid="input-estimate-name"
              />
            </div>

            <div className="flex justify-between">
              <Button variant="outline" onClick={() => setStep("map")} data-testid="button-back-mapping">
                Back to Mapping
              </Button>
              <Button
                onClick={handleImport}
                disabled={!estimateName.trim() || isImporting || groups.length === 0}
                data-testid="button-import-estimate"
              >
                {isImporting ? "Importing..." : `Import Estimate`}
              </Button>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
