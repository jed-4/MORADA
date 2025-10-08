import { useState } from "react";
import { Upload, FileSpreadsheet, CheckCircle2, AlertCircle, X } from "lucide-react";
import * as XLSX from "xlsx";
import {
  Dialog,
  DialogContent,
  DialogDescription,
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
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { cn } from "@/lib/utils";
import {
  ImportEstimateItem,
  ColumnMapping,
  autoDetectColumnMapping,
  parseImportRow,
  ImportRowResult,
} from "@shared/import";

type Step = "upload" | "map" | "preview";

interface ImportEstimateItemsDialogProps {
  open: boolean;
  onClose: () => void;
  estimateId: string;
  onImportComplete: () => void;
}

const FIELD_LABELS: Record<keyof ImportEstimateItem, string> = {
  name: "Name",
  type: "Type",
  description: "Description",
  quantity: "Quantity",
  unitType: "Unit",
  unitCostExTax: "Price (Ex Tax)",
  allowance: "Allowance",
  notes: "Notes",
  costCode: "Cost Code",
  status: "Status",
  proposalVisible: "Proposal Visible",
  shownAs: "Shown As",
};

const ITEM_TYPES = ["Material", "Labour", "Subcontractor", "Fee"];
const ALLOWANCE_TYPES = ["None", "Prime Cost", "Provisional Sum"];

export function ImportEstimateItemsDialog({
  open,
  onClose,
  estimateId,
  onImportComplete,
}: ImportEstimateItemsDialogProps) {
  const [step, setStep] = useState<Step>("upload");
  const [fileData, setFileData] = useState<any[]>([]);
  const [headers, setHeaders] = useState<string[]>([]);
  const [columnMapping, setColumnMapping] = useState<ColumnMapping>({});
  const [parsedRows, setParsedRows] = useState<ImportRowResult[]>([]);
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

      // Auto-detect column mapping
      const detectedMapping = autoDetectColumnMapping(headerRow);
      setColumnMapping(detectedMapping);

      setStep("map");
    } catch (error) {
      console.error("Error reading file:", error);
      alert("Failed to read file. Please ensure it's a valid Excel or CSV file.");
    }
  };

  const handleColumnMappingChange = (field: keyof ImportEstimateItem, columnName: string) => {
    setColumnMapping(prev => ({
      ...prev,
      [field]: columnName === "none" ? undefined : columnName,
    }));
  };

  const handlePreview = () => {
    // Parse all rows using the column mapping
    const results = fileData.map((row, index) =>
      parseImportRow(row, columnMapping, index)
    );
    setParsedRows(results);
    setStep("preview");
  };

  const handleImport = async () => {
    setIsImporting(true);
    
    try {
      // Get only valid rows
      const validRows = parsedRows
        .filter(row => row.data)
        .map(row => ({
          ...row.data!,
          estimateId,
          // unitCostExTax is already in dollars (backend expects dollars)
        }));

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
    setStep("upload");
    setFileData([]);
    setHeaders([]);
    setColumnMapping({});
    setParsedRows([]);
    onClose();
  };

  const validCount = parsedRows.filter(row => row.data).length;
  const errorCount = parsedRows.filter(row => row.errors).length;

  const downloadTemplate = () => {
    const templateData = [
      ["Name", "Type", "Description", "Quantity", "Unit", "Price Ex Tax", "Allowance", "Notes", "Cost Code", "Status"],
      ["Example Item", "Material", "Sample description", "10", "m2", "25.50", "None", "Sample notes", "CODE-001", "incomplete"],
    ];

    const worksheet = XLSX.utils.aoa_to_sheet(templateData);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, "Template");
    XLSX.writeFile(workbook, "estimate_items_template.xlsx");
  };

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="max-w-5xl max-h-[90vh]">
        <DialogHeader>
          <DialogTitle>Import Estimate Items</DialogTitle>
          <DialogDescription>
            {step === "upload" && "Upload an Excel or CSV file containing estimate items"}
            {step === "map" && "Map your file columns to estimate fields"}
            {step === "preview" && "Review and confirm import"}
          </DialogDescription>
        </DialogHeader>

        {step === "upload" && (
          <div className="space-y-6">
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

            <div className="flex items-center justify-between p-4 bg-muted/50 rounded-md">
              <div>
                <p className="text-sm font-medium">Need a template?</p>
                <p className="text-xs text-muted-foreground">Download our Excel template to get started</p>
              </div>
              <Button variant="outline" onClick={downloadTemplate} data-testid="button-download-template">
                Download Template
              </Button>
            </div>
          </div>
        )}

        {step === "map" && (
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <p className="text-sm text-muted-foreground">
                {fileData.length} rows detected. Map columns to fields below.
              </p>
              <Button onClick={handlePreview} data-testid="button-next-preview">
                Next: Preview
              </Button>
            </div>

            <ScrollArea className="h-[400px] border rounded-md p-4">
              <div className="space-y-4">
                {Object.entries(FIELD_LABELS).map(([field, label]) => (
                  <div key={field} className="flex items-center gap-4">
                    <div className="w-40">
                      <span className="text-sm font-medium">{label}</span>
                      {field === "name" && <Badge variant="secondary" className="ml-2">Required</Badge>}
                    </div>
                    <Select
                      value={(columnMapping[field as keyof ImportEstimateItem] as string) || "none"}
                      onValueChange={(value) => handleColumnMappingChange(field as keyof ImportEstimateItem, value)}
                    >
                      <SelectTrigger className="flex-1" data-testid={`select-column-${field}`}>
                        <SelectValue placeholder="Select column" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="none">-- Not mapped --</SelectItem>
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
            </ScrollArea>
          </div>
        )}

        {step === "preview" && (
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <div className="flex gap-4">
                <Badge variant="default" className="gap-1">
                  <CheckCircle2 className="h-3 w-3" />
                  {validCount} Valid
                </Badge>
                {errorCount > 0 && (
                  <Badge variant="destructive" className="gap-1">
                    <AlertCircle className="h-3 w-3" />
                    {errorCount} Errors
                  </Badge>
                )}
              </div>
              <div className="flex gap-2">
                <Button variant="outline" onClick={() => setStep("map")} data-testid="button-back-mapping">
                  Back to Mapping
                </Button>
                <Button
                  onClick={handleImport}
                  disabled={validCount === 0 || isImporting}
                  data-testid="button-import-confirm"
                >
                  {isImporting ? "Importing..." : `Import ${validCount} Items`}
                </Button>
              </div>
            </div>

            <ScrollArea className="h-[500px] border rounded-md">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-12">#</TableHead>
                    <TableHead>Name</TableHead>
                    <TableHead>Type</TableHead>
                    <TableHead>Qty</TableHead>
                    <TableHead>Unit</TableHead>
                    <TableHead>Price</TableHead>
                    <TableHead>Status</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {parsedRows.map((row, index) => (
                    <TableRow
                      key={index}
                      className={cn(row.errors && "bg-destructive/10")}
                      data-testid={`row-preview-${index}`}
                    >
                      <TableCell className="font-mono text-xs">{index + 1}</TableCell>
                      {row.errors ? (
                        <TableCell colSpan={6}>
                          <div className="flex items-center gap-2">
                            <AlertCircle className="h-4 w-4 text-destructive" />
                            <span className="text-sm text-destructive">
                              {row.errors.join(", ")}
                            </span>
                          </div>
                        </TableCell>
                      ) : (
                        <>
                          <TableCell>{row.data?.name}</TableCell>
                          <TableCell>{row.data?.type}</TableCell>
                          <TableCell>{row.data?.quantity}</TableCell>
                          <TableCell>{row.data?.unitType}</TableCell>
                          <TableCell>${row.data?.unitCostExTax.toFixed(2)}</TableCell>
                          <TableCell>
                            <Badge variant="secondary">{row.data?.status}</Badge>
                          </TableCell>
                        </>
                      )}
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </ScrollArea>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
