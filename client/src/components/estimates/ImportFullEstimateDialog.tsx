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
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { cn } from "@/lib/utils";
import {
  parseFullEstimateImport,
  ImportEstimateFormat,
  ImportEstimateGroup,
  ImportEstimateWithGroupsItem,
} from "@shared/import";

type Step = "upload" | "preview" | "name";

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

      // Parse the file
      const result = parseFullEstimateImport(objectData, headerRow);
      
      setFormat(result.format);
      setGroups(result.groups);
      setItems(result.items);
      setParseErrors(result.errors);

      // Set default estimate name from filename
      const defaultName = file.name.replace(/\.(xlsx|xls|csv)$/i, "");
      setEstimateName(defaultName);

      if (result.errors.length > 0) {
        setStep("preview");
      } else {
        setStep("name");
      }
    } catch (error) {
      console.error("Error reading file:", error);
      alert("Failed to read file. Please ensure it's a valid Excel or CSV file.");
    }
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
    setFormat("unknown");
    setGroups([]);
    setItems([]);
    setParseErrors([]);
    onClose();
  };

  const formatLabel = format === "buildern" ? "Buildern" : format === "wunderbuild" ? "Wunderbuild" : "Unknown";

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="max-w-5xl max-h-[90vh]">
        <DialogHeader>
          <DialogTitle>Import Estimate</DialogTitle>
          <DialogDescription>
            {step === "upload" && "Upload a buildern or wunderbuild estimate export file"}
            {step === "preview" && "Review parsed estimate data"}
            {step === "name" && "Name your imported estimate"}
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

        {step === "preview" && (
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <div className="flex gap-4">
                <Badge variant="outline">{formatLabel} Format</Badge>
                <Badge variant="default" className="gap-1">
                  <CheckCircle2 className="h-3 w-3" />
                  {groups.length} Groups, {items.length} Items
                </Badge>
                {parseErrors.length > 0 && (
                  <Badge variant="destructive" className="gap-1">
                    <AlertCircle className="h-3 w-3" />
                    {parseErrors.length} Errors
                  </Badge>
                )}
              </div>
              <div className="flex gap-2">
                <Button variant="outline" onClick={() => setStep("upload")} data-testid="button-back-upload">
                  Back
                </Button>
                <Button
                  onClick={() => setStep("name")}
                  disabled={groups.length === 0}
                  data-testid="button-next-name"
                >
                  Next: Name Estimate
                </Button>
              </div>
            </div>

            {parseErrors.length > 0 && (
              <div className="p-4 border border-destructive/50 bg-destructive/10 rounded-md">
                <p className="text-sm font-medium text-destructive mb-2">Parse Errors:</p>
                <ScrollArea className="max-h-32">
                  <ul className="text-xs text-destructive space-y-1">
                    {parseErrors.map((error, index) => (
                      <li key={index}>• {error}</li>
                    ))}
                  </ul>
                </ScrollArea>
              </div>
            )}

            <ScrollArea className="h-[500px] border rounded-md">
              <div className="p-4 space-y-6">
                <div>
                  <h3 className="text-sm font-medium mb-3">Groups ({groups.length})</h3>
                  <div className="space-y-2">
                    {groups.map((group, index) => (
                      <div
                        key={index}
                        className="flex items-center justify-between p-3 bg-muted/50 rounded-md"
                        data-testid={`group-preview-${index}`}
                      >
                        <span className="text-sm font-medium">{group.name}</span>
                        <Badge variant="secondary">
                          {items.filter(item => item.groupName === group.name).length} items
                        </Badge>
                      </div>
                    ))}
                  </div>
                </div>

                <div>
                  <h3 className="text-sm font-medium mb-3">Items ({items.length})</h3>
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Group</TableHead>
                        <TableHead>Name</TableHead>
                        <TableHead>Type</TableHead>
                        <TableHead>Qty</TableHead>
                        <TableHead>Unit</TableHead>
                        <TableHead>Price</TableHead>
                        <TableHead>Markup</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {items.slice(0, 50).map((item, index) => (
                        <TableRow key={index} data-testid={`item-preview-${index}`}>
                          <TableCell className="text-xs text-muted-foreground">{item.groupName}</TableCell>
                          <TableCell className="text-sm">{item.name}</TableCell>
                          <TableCell>
                            <Badge variant="secondary">{item.type}</Badge>
                          </TableCell>
                          <TableCell>{item.quantity}</TableCell>
                          <TableCell>{item.unitType}</TableCell>
                          <TableCell>${item.unitCostExTax.toFixed(2)}</TableCell>
                          <TableCell>{item.markupPercent}%</TableCell>
                        </TableRow>
                      ))}
                      {items.length > 50 && (
                        <TableRow>
                          <TableCell colSpan={7} className="text-center text-sm text-muted-foreground">
                            ... and {items.length - 50} more items
                          </TableCell>
                        </TableRow>
                      )}
                    </TableBody>
                  </Table>
                </div>
              </div>
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
              <Button variant="outline" onClick={() => setStep("preview")} data-testid="button-back-preview">
                Back to Preview
              </Button>
              <Button
                onClick={handleImport}
                disabled={!estimateName.trim() || isImporting}
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
