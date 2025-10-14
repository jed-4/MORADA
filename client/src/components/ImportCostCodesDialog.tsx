import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { Upload, FileSpreadsheet } from "lucide-react";
import * as XLSX from "xlsx";

type ImportCostCodesDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
};

type ParsedData = {
  headers: string[];
  rows: string[][];
};

type ColumnMapping = {
  costCode: string;
  costCodeTitle: string;
  categoryCode: string;
  categoryTitle: string;
};

export default function ImportCostCodesDialog({ open, onOpenChange }: ImportCostCodesDialogProps) {
  const { toast } = useToast();
  const [parsedData, setParsedData] = useState<ParsedData | null>(null);
  const [fileName, setFileName] = useState<string>("");
  const [columnMapping, setColumnMapping] = useState<ColumnMapping>({
    costCode: "",
    costCodeTitle: "",
    categoryCode: "",
    categoryTitle: "",
  });

  const importMutation = useMutation({
    mutationFn: async () => {
      if (!parsedData) throw new Error("No data to import");
      
      // Build the import data from mapped columns
      const importData = parsedData.rows.map((row) => {
        const getCell = (mapping: string) => {
          if (!mapping || mapping === "__none__") return "";
          const colIndex = parsedData.headers.indexOf(mapping);
          return colIndex >= 0 ? row[colIndex] : "";
        };

        return {
          costCode: getCell(columnMapping.costCode),
          costCodeTitle: getCell(columnMapping.costCodeTitle),
          categoryCode: getCell(columnMapping.categoryCode),
          categoryTitle: getCell(columnMapping.categoryTitle),
        };
      });

      const response = await apiRequest("POST", "/api/cost-codes/import", { items: importData });
      return response.json();
    },
    onSuccess: (result: any) => {
      queryClient.invalidateQueries({ queryKey: ["/api/cost-categories"] });
      queryClient.invalidateQueries({ queryKey: ["/api/cost-codes"] });
      
      handleClose();
      
      toast({
        title: "Import successful",
        description: `Created ${result.categoriesCreated} categories and ${result.codesCreated} cost codes.`,
      });
    },
    onError: (error: any) => {
      toast({
        title: "Import failed",
        description: error.message || "An error occurred while importing the data.",
        variant: "destructive",
      });
    },
  });

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    e.preventDefault();
    e.stopPropagation();
    
    const file = e.target.files?.[0];
    if (!file) return;

    setFileName(file.name);
    const reader = new FileReader();

    reader.onload = (event) => {
      try {
        const data = event.target?.result;
        let workbook: XLSX.WorkBook;

        if (file.name.endsWith('.csv')) {
          workbook = XLSX.read(data, { type: 'binary' });
        } else {
          workbook = XLSX.read(data, { type: 'array' });
        }

        const sheetName = workbook.SheetNames[0];
        const worksheet = workbook.Sheets[sheetName];
        const jsonData = XLSX.utils.sheet_to_json(worksheet, { header: 1 }) as string[][];

        if (jsonData.length === 0) {
          toast({
            title: "Empty file",
            description: "The file appears to be empty.",
            variant: "destructive",
          });
          return;
        }

        const headers = jsonData[0] as string[];
        const rows = jsonData.slice(1).filter(row => row.some(cell => cell)); // Filter empty rows

        setParsedData({ headers, rows });

        // Auto-map columns if possible
        const autoMapping: ColumnMapping = {
          costCode: "",
          costCodeTitle: "",
          categoryCode: "__none__",
          categoryTitle: "__none__",
        };

        headers.forEach((header) => {
          const lower = header.toLowerCase();
          if (lower.includes('cost') && lower.includes('code') && !lower.includes('title')) {
            autoMapping.costCode = header;
          } else if (lower.includes('cost') && (lower.includes('title') || lower.includes('name') || lower.includes('description'))) {
            autoMapping.costCodeTitle = header;
          } else if (lower.includes('category') && lower.includes('code') && !lower.includes('title')) {
            autoMapping.categoryCode = header;
          } else if (lower.includes('category') && (lower.includes('title') || lower.includes('name'))) {
            autoMapping.categoryTitle = header;
          }
        });

        setColumnMapping(autoMapping);
      } catch (error) {
        toast({
          title: "Failed to parse file",
          description: "The file could not be read. Please ensure it's a valid CSV or Excel file.",
          variant: "destructive",
        });
      }
    };

    if (file.name.endsWith('.csv')) {
      reader.readAsBinaryString(file);
    } else {
      reader.readAsArrayBuffer(file);
    }
  };

  const handleClose = () => {
    setParsedData(null);
    setFileName("");
    setColumnMapping({
      costCode: "",
      costCodeTitle: "",
      categoryCode: "__none__",
      categoryTitle: "__none__",
    });
    onOpenChange(false);
  };

  const canImport = columnMapping.costCode && columnMapping.costCodeTitle && parsedData;

  const getPreviewData = () => {
    if (!parsedData) return [];
    
    return parsedData.rows.slice(0, 10).map((row) => {
      const getCell = (mapping: string) => {
        if (!mapping || mapping === "__none__") return "";
        const colIndex = parsedData.headers.indexOf(mapping);
        return colIndex >= 0 ? row[colIndex] : "";
      };

      return {
        costCode: getCell(columnMapping.costCode),
        costCodeTitle: getCell(columnMapping.costCodeTitle),
        categoryCode: getCell(columnMapping.categoryCode),
        categoryTitle: getCell(columnMapping.categoryTitle),
      };
    });
  };

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="max-w-6xl max-h-[90vh] flex flex-col" data-testid="dialog-import-cost-codes">
        <DialogHeader>
          <DialogTitle>Import Cost Codes</DialogTitle>
          <DialogDescription>
            Upload a CSV or Excel file and map the columns to import cost codes and categories.
          </DialogDescription>
        </DialogHeader>

        <div className="flex flex-col gap-6 flex-1 overflow-hidden">
          {/* File Upload */}
          {!parsedData ? (
            <div className="flex flex-col items-center justify-center border-2 border-dashed rounded-lg p-12">
              <FileSpreadsheet className="h-12 w-12 text-muted-foreground mb-4" />
              <div className="flex flex-col items-center gap-2">
                <span className="text-sm text-muted-foreground mb-2">CSV or Excel (.xlsx, .xls)</span>
                <Button
                  variant="outline"
                  onClick={() => document.getElementById('file-upload')?.click()}
                  data-testid="button-choose-file"
                >
                  <Upload className="h-4 w-4 mr-2" />
                  Choose File
                </Button>
              </div>
              <Input
                id="file-upload"
                type="file"
                accept=".csv,.xlsx,.xls"
                onChange={handleFileChange}
                className="hidden"
                data-testid="input-file-upload"
              />
            </div>
          ) : (
            <>
              {/* File Info and Column Mapping */}
              <div className="space-y-4">
                <div className="flex items-center gap-2 text-sm">
                  <FileSpreadsheet className="h-4 w-4" />
                  <span className="font-medium">{fileName}</span>
                  <span className="text-muted-foreground">
                    ({parsedData.rows.length} rows)
                  </span>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => setParsedData(null)}
                    data-testid="button-change-file"
                  >
                    Change File
                  </Button>
                </div>

                {/* Column Mapping */}
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label>Cost Code Column *</Label>
                    <Select
                      value={columnMapping.costCode}
                      onValueChange={(value) =>
                        setColumnMapping({ ...columnMapping, costCode: value })
                      }
                    >
                      <SelectTrigger data-testid="select-cost-code-column">
                        <SelectValue placeholder="Select column" />
                      </SelectTrigger>
                      <SelectContent>
                        {parsedData.headers.map((header) => (
                          <SelectItem key={header} value={header}>
                            {header}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="space-y-2">
                    <Label>Cost Code Title Column *</Label>
                    <Select
                      value={columnMapping.costCodeTitle}
                      onValueChange={(value) =>
                        setColumnMapping({ ...columnMapping, costCodeTitle: value })
                      }
                    >
                      <SelectTrigger data-testid="select-cost-code-title-column">
                        <SelectValue placeholder="Select column" />
                      </SelectTrigger>
                      <SelectContent>
                        {parsedData.headers.map((header) => (
                          <SelectItem key={header} value={header}>
                            {header}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="space-y-2">
                    <Label>Category Code Column (Optional)</Label>
                    <Select
                      value={columnMapping.categoryCode}
                      onValueChange={(value) =>
                        setColumnMapping({ ...columnMapping, categoryCode: value })
                      }
                    >
                      <SelectTrigger data-testid="select-category-code-column">
                        <SelectValue placeholder="Select column" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="__none__">None</SelectItem>
                        {parsedData.headers.map((header) => (
                          <SelectItem key={header} value={header}>
                            {header}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="space-y-2">
                    <Label>Category Title Column (Optional)</Label>
                    <Select
                      value={columnMapping.categoryTitle}
                      onValueChange={(value) =>
                        setColumnMapping({ ...columnMapping, categoryTitle: value })
                      }
                    >
                      <SelectTrigger data-testid="select-category-title-column">
                        <SelectValue placeholder="Select column" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="__none__">None</SelectItem>
                        {parsedData.headers.map((header) => (
                          <SelectItem key={header} value={header}>
                            {header}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </div>
              </div>

              {/* Preview Table */}
              {canImport && (
                <div className="flex-1 overflow-hidden flex flex-col">
                  <h4 className="text-sm font-medium mb-2">Preview (first 10 rows)</h4>
                  <div className="border rounded-lg overflow-auto flex-1">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Cost Code</TableHead>
                          <TableHead>Cost Code Title</TableHead>
                          <TableHead>Category Code</TableHead>
                          <TableHead>Category Title</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {getPreviewData().map((row, index) => (
                          <TableRow key={index}>
                            <TableCell className="font-mono text-sm">{row.costCode}</TableCell>
                            <TableCell>{row.costCodeTitle}</TableCell>
                            <TableCell className="font-mono text-sm">{row.categoryCode}</TableCell>
                            <TableCell>{row.categoryTitle}</TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                </div>
              )}
            </>
          )}

          {/* Actions */}
          <div className="flex justify-end gap-3 pt-4 border-t">
            <Button
              type="button"
              variant="outline"
              onClick={handleClose}
              data-testid="button-cancel-import"
            >
              Cancel
            </Button>
            {parsedData && (
              <Button
                onClick={() => importMutation.mutate()}
                disabled={!canImport || importMutation.isPending}
                data-testid="button-submit-import"
              >
                {importMutation.isPending ? "Importing..." : `Import ${parsedData.rows.length} Rows`}
              </Button>
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
