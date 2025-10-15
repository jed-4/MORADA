import { useState } from "react";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
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

export function ImportChecklistDialog({ open, onOpenChange }: ImportChecklistDialogProps) {
  const { toast } = useToast();
  const [file, setFile] = useState<File | null>(null);
  const [previewData, setPreviewData] = useState<any[]>([]);
  const [error, setError] = useState<string | null>(null);

  const importMutation = useMutation({
    mutationFn: async (items: any[]) => {
      const res = await apiRequest('POST', "/api/checklist-templates/import", { items });
      return res.json();
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["/api/checklist-templates"] });
      toast({
        title: "Import successful",
        description: `Created ${data.templatesCreated} templates, ${data.groupsCreated} groups, and ${data.itemsCreated} items.`,
      });
      onOpenChange(false);
      setFile(null);
      setPreviewData([]);
      setError(null);
    },
    onError: (error: any) => {
      toast({
        title: "Import failed",
        description: error.message || "Failed to import checklist templates.",
        variant: "destructive",
      });
    },
  });

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
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
          const headers = data[0] as string[];
          const rows = data.slice(1) as any[][];

          // Map to expected format
          const mapped = rows
            .filter(row => row.some(cell => cell)) // Skip empty rows
            .map(row => ({
              templateName: row[0] || "",
              templateDescription: row[1] || "",
              type: row[2] || "",
              groupName: row[3] || "",
              itemDescription: row[4] || "",
            }));

          setPreviewData(mapped);
        } catch (err) {
          setError("Failed to parse file. Please ensure it's a valid CSV or Excel file with the correct format.");
        }
      };
      reader.readAsBinaryString(selectedFile);
    } catch (err) {
      setError("Failed to read file");
    }
  };

  const handleImport = () => {
    if (previewData.length === 0) {
      setError("No data to import");
      return;
    }

    importMutation.mutate(previewData);
  };

  const handleDownloadTemplate = () => {
    const headers = ["Template Name", "Description", "Type", "Group Name", "Item Description"];
    const exampleRows = [
      ["Pre-Construction Checklist", "Tasks to complete before starting construction", "Job", "Site Preparation", "Clear and level the site"],
      ["Pre-Construction Checklist", "Tasks to complete before starting construction", "Job", "Site Preparation", "Set up temporary fencing"],
      ["Pre-Construction Checklist", "Tasks to complete before starting construction", "Job", "Permits & Approvals", "Obtain building permit"],
      ["Lead Qualification", "Steps to qualify a potential lead", "Lead", "Initial Contact", "Make first phone call"],
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
      <DialogContent className="max-w-6xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Import Checklist Templates</DialogTitle>
          <DialogDescription>
            Upload a CSV or Excel file with checklist templates, groups, and items. Each row should contain template information.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
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
              Expected columns: Template Name, Description, Type (Task/Job/Estimation/Lead), Group Name, Item Description
            </p>
          </div>

          {/* Error Alert */}
          {error && (
            <Alert variant="destructive">
              <AlertCircle className="h-4 w-4" />
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}

          {/* Preview */}
          {previewData.length > 0 && (
            <div className="space-y-2">
              <Label>Preview ({previewData.length} rows)</Label>
              <div className="border rounded-md overflow-auto max-h-96">
                <table className="w-full text-sm">
                  <thead className="bg-muted sticky top-0">
                    <tr>
                      <th className="text-left p-2 border-b font-medium">Template</th>
                      <th className="text-left p-2 border-b font-medium">Description</th>
                      <th className="text-left p-2 border-b font-medium">Type</th>
                      <th className="text-left p-2 border-b font-medium">Group</th>
                      <th className="text-left p-2 border-b font-medium">Item</th>
                    </tr>
                  </thead>
                  <tbody>
                    {previewData.slice(0, 10).map((row, idx) => (
                      <tr key={idx} className="border-b">
                        <td className="p-2">{row.templateName}</td>
                        <td className="p-2">{row.templateDescription}</td>
                        <td className="p-2">{row.type}</td>
                        <td className="p-2">{row.groupName}</td>
                        <td className="p-2">{row.itemDescription}</td>
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

          {/* Actions */}
          <div className="flex justify-end gap-2 pt-4">
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
        </div>
      </DialogContent>
    </Dialog>
  );
}
