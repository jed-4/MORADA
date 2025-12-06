import { useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { ScrollArea } from "@/components/ui/scroll-area";
import { FileSpreadsheet, Upload, CheckCircle, AlertCircle } from "lucide-react";
import { useMutation } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import * as XLSX from "xlsx";

type Step = "upload" | "map" | "preview" | "complete";

interface ColumnMapping {
  name?: string;
  email?: string;
  phone?: string;
  mobile?: string;
  company?: string;
  role?: string;
  address?: string;
  notes?: string;
}

interface ParsedContact {
  name: string;
  email?: string;
  phone?: string;
  mobile?: string;
  company?: string;
  role?: string;
  address?: string;
  notes?: string;
}

interface ImportContactsDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

const FIELD_OPTIONS: { key: keyof ColumnMapping; label: string; required: boolean }[] = [
  { key: "name", label: "Name", required: true },
  { key: "email", label: "Email", required: false },
  { key: "phone", label: "Phone", required: false },
  { key: "mobile", label: "Mobile", required: false },
  { key: "company", label: "Company", required: false },
  { key: "role", label: "Role/Position", required: false },
  { key: "address", label: "Address", required: false },
  { key: "notes", label: "Notes", required: false },
];

export function ImportContactsDialog({ open, onOpenChange }: ImportContactsDialogProps) {
  const { toast } = useToast();
  const [step, setStep] = useState<Step>("upload");
  const [headers, setHeaders] = useState<string[]>([]);
  const [fileData, setFileData] = useState<any[]>([]);
  const [columnMapping, setColumnMapping] = useState<ColumnMapping>({});
  const [parsedContacts, setParsedContacts] = useState<ParsedContact[]>([]);
  const [importResults, setImportResults] = useState<{ success: number; errors: string[] }>({ success: 0, errors: [] });

  const importMutation = useMutation({
    mutationFn: async (contacts: ParsedContact[]) => {
      const results = { success: 0, errors: [] as string[] };
      
      for (let i = 0; i < contacts.length; i++) {
        const contact = contacts[i];
        try {
          await apiRequest("/api/contacts", "POST", {
            name: contact.name,
            email: contact.email || null,
            phone: contact.phone || null,
            mobile: contact.mobile || null,
            company: contact.company || null,
            role: contact.role || null,
            address: contact.address || null,
            notes: contact.notes || null,
          });
          results.success++;
        } catch (error: any) {
          results.errors.push(`Row ${i + 1} (${contact.name}): ${error.message || "Failed to import"}`);
        }
      }
      
      return results;
    },
    onSuccess: (results) => {
      setImportResults(results);
      setStep("complete");
      queryClient.invalidateQueries({ queryKey: ["/api/contacts"] });
    },
    onError: (error: any) => {
      toast({
        title: "Import failed",
        description: error.message || "An error occurred during import",
        variant: "destructive",
      });
    },
  });

  const handleFileUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    try {
      const data = await file.arrayBuffer();
      const workbook = XLSX.read(data);
      const worksheet = workbook.Sheets[workbook.SheetNames[0]];
      const jsonData = XLSX.utils.sheet_to_json(worksheet, { header: 1 }) as any[][];

      const headerRow = jsonData[0] as string[];
      const dataRows = jsonData.slice(1).filter(row => row.some(cell => cell !== undefined && cell !== ""));

      const objectData = dataRows.map(row => {
        const obj: any = {};
        headerRow.forEach((header, index) => {
          obj[header] = row[index];
        });
        return obj;
      });

      setHeaders(headerRow.filter(h => h));
      setFileData(objectData);

      const mapping: ColumnMapping = {};
      const lowerHeaders = headerRow.map(h => h?.toLowerCase() || "");
      
      if (lowerHeaders.includes("name")) mapping.name = headerRow[lowerHeaders.indexOf("name")];
      else if (lowerHeaders.includes("contact name")) mapping.name = headerRow[lowerHeaders.indexOf("contact name")];
      else if (lowerHeaders.includes("full name")) mapping.name = headerRow[lowerHeaders.indexOf("full name")];
      
      if (lowerHeaders.includes("email")) mapping.email = headerRow[lowerHeaders.indexOf("email")];
      else if (lowerHeaders.includes("email address")) mapping.email = headerRow[lowerHeaders.indexOf("email address")];
      
      if (lowerHeaders.includes("phone")) mapping.phone = headerRow[lowerHeaders.indexOf("phone")];
      else if (lowerHeaders.includes("phone number")) mapping.phone = headerRow[lowerHeaders.indexOf("phone number")];
      else if (lowerHeaders.includes("telephone")) mapping.phone = headerRow[lowerHeaders.indexOf("telephone")];
      
      if (lowerHeaders.includes("mobile")) mapping.mobile = headerRow[lowerHeaders.indexOf("mobile")];
      else if (lowerHeaders.includes("cell")) mapping.mobile = headerRow[lowerHeaders.indexOf("cell")];
      else if (lowerHeaders.includes("mobile phone")) mapping.mobile = headerRow[lowerHeaders.indexOf("mobile phone")];
      
      if (lowerHeaders.includes("company")) mapping.company = headerRow[lowerHeaders.indexOf("company")];
      else if (lowerHeaders.includes("company name")) mapping.company = headerRow[lowerHeaders.indexOf("company name")];
      else if (lowerHeaders.includes("organisation")) mapping.company = headerRow[lowerHeaders.indexOf("organisation")];
      else if (lowerHeaders.includes("organization")) mapping.company = headerRow[lowerHeaders.indexOf("organization")];
      
      if (lowerHeaders.includes("role")) mapping.role = headerRow[lowerHeaders.indexOf("role")];
      else if (lowerHeaders.includes("position")) mapping.role = headerRow[lowerHeaders.indexOf("position")];
      else if (lowerHeaders.includes("job title")) mapping.role = headerRow[lowerHeaders.indexOf("job title")];
      else if (lowerHeaders.includes("title")) mapping.role = headerRow[lowerHeaders.indexOf("title")];
      
      if (lowerHeaders.includes("address")) mapping.address = headerRow[lowerHeaders.indexOf("address")];
      
      if (lowerHeaders.includes("notes")) mapping.notes = headerRow[lowerHeaders.indexOf("notes")];
      else if (lowerHeaders.includes("comments")) mapping.notes = headerRow[lowerHeaders.indexOf("comments")];

      setColumnMapping(mapping);
      setStep("map");
    } catch (error) {
      console.error("Error reading file:", error);
      toast({
        title: "Error reading file",
        description: "Please ensure it's a valid Excel or CSV file.",
        variant: "destructive",
      });
    }
  };

  const handleColumnMappingChange = (field: keyof ColumnMapping, value: string) => {
    setColumnMapping(prev => ({
      ...prev,
      [field]: value === "none" ? undefined : value,
    }));
  };

  const handleContinue = () => {
    if (!columnMapping.name) {
      toast({
        title: "Name column required",
        description: "Please map a column to the Name field.",
        variant: "destructive",
      });
      return;
    }

    const contacts: ParsedContact[] = [];
    
    fileData.forEach((row) => {
      const name = row[columnMapping.name!];
      if (!name || String(name).trim() === "") return;
      
      contacts.push({
        name: String(name).trim(),
        email: columnMapping.email ? String(row[columnMapping.email] || "").trim() || undefined : undefined,
        phone: columnMapping.phone ? String(row[columnMapping.phone] || "").trim() || undefined : undefined,
        mobile: columnMapping.mobile ? String(row[columnMapping.mobile] || "").trim() || undefined : undefined,
        company: columnMapping.company ? String(row[columnMapping.company] || "").trim() || undefined : undefined,
        role: columnMapping.role ? String(row[columnMapping.role] || "").trim() || undefined : undefined,
        address: columnMapping.address ? String(row[columnMapping.address] || "").trim() || undefined : undefined,
        notes: columnMapping.notes ? String(row[columnMapping.notes] || "").trim() || undefined : undefined,
      });
    });

    setParsedContacts(contacts);
    setStep("preview");
  };

  const handleImport = () => {
    importMutation.mutate(parsedContacts);
  };

  const handleClose = () => {
    setStep("upload");
    setHeaders([]);
    setFileData([]);
    setColumnMapping({});
    setParsedContacts([]);
    setImportResults({ success: 0, errors: [] });
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="max-w-3xl max-h-[90vh] overflow-hidden flex flex-col">
        <DialogHeader>
          <DialogTitle>Import Contacts</DialogTitle>
          <DialogDescription>
            {step === "upload" && "Upload a CSV or Excel file with your contact data."}
            {step === "map" && "Map your file columns to contact fields."}
            {step === "preview" && "Review contacts before importing."}
            {step === "complete" && "Import complete!"}
          </DialogDescription>
        </DialogHeader>

        {step === "upload" && (
          <div className="space-y-6 py-4">
            <div className="border-2 border-dashed rounded-lg p-8 text-center">
              <Upload className="mx-auto h-12 w-12 text-muted-foreground mb-4" />
              <p className="text-sm text-muted-foreground mb-4">
                Drag and drop your file here, or click to browse
              </p>
              <input
                type="file"
                accept=".csv,.xlsx,.xls"
                onChange={handleFileUpload}
                className="hidden"
                id="contact-file-upload"
                data-testid="input-contact-file-upload"
              />
              <label htmlFor="contact-file-upload">
                <Button asChild data-testid="button-browse-contact-file">
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
                <li>• CSV files (.csv)</li>
                <li>• Excel files (.xlsx, .xls)</li>
                <li>• First row should contain column headers</li>
              </ul>
            </div>
          </div>
        )}

        {step === "map" && (
          <div className="space-y-4 flex-1 overflow-hidden flex flex-col">
            <div className="p-4 bg-muted/50 rounded-md">
              <p className="text-sm font-medium mb-3">Map your file columns to contact fields</p>
              <div className="grid grid-cols-2 gap-3">
                {FIELD_OPTIONS.map(({ key, label, required }) => (
                  <div key={key}>
                    <Label htmlFor={`map-${key}`} className="text-xs mb-1">
                      {label}{required && "*"}
                    </Label>
                    <Select
                      value={columnMapping[key] || "none"}
                      onValueChange={(value) => handleColumnMappingChange(key, value)}
                    >
                      <SelectTrigger id={`map-${key}`} data-testid={`select-column-${key}`}>
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
                ))}
              </div>
            </div>

            <div className="text-sm text-muted-foreground">
              {fileData.length} rows detected in file
            </div>
          </div>
        )}

        {step === "preview" && (
          <div className="space-y-4 flex-1 overflow-hidden flex flex-col">
            <div className="text-sm">
              <span className="font-medium">{parsedContacts.length}</span> contacts ready to import
            </div>

            <ScrollArea className="flex-1 border rounded-md">
              <table className="w-full text-sm">
                <thead className="bg-muted sticky top-0">
                  <tr>
                    <th className="text-left p-2 font-medium">Name</th>
                    <th className="text-left p-2 font-medium">Email</th>
                    <th className="text-left p-2 font-medium">Phone</th>
                    <th className="text-left p-2 font-medium">Company</th>
                  </tr>
                </thead>
                <tbody>
                  {parsedContacts.slice(0, 50).map((contact, index) => (
                    <tr key={index} className="border-t">
                      <td className="p-2">{contact.name}</td>
                      <td className="p-2 text-muted-foreground">{contact.email || "-"}</td>
                      <td className="p-2 text-muted-foreground">{contact.phone || contact.mobile || "-"}</td>
                      <td className="p-2 text-muted-foreground">{contact.company || "-"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {parsedContacts.length > 50 && (
                <div className="p-2 text-center text-sm text-muted-foreground">
                  ... and {parsedContacts.length - 50} more contacts
                </div>
              )}
            </ScrollArea>
          </div>
        )}

        {step === "complete" && (
          <div className="space-y-4 py-4">
            <div className="flex items-center justify-center gap-3">
              <CheckCircle className="h-12 w-12 text-green-500" />
              <div>
                <p className="text-lg font-medium">Import Complete</p>
                <p className="text-sm text-muted-foreground">
                  Successfully imported {importResults.success} contacts
                </p>
              </div>
            </div>

            {importResults.errors.length > 0 && (
              <div className="p-4 bg-destructive/10 border border-destructive/20 rounded-md">
                <div className="flex items-center gap-2 mb-2">
                  <AlertCircle className="h-4 w-4 text-destructive" />
                  <p className="text-sm font-medium text-destructive">
                    {importResults.errors.length} contacts failed to import
                  </p>
                </div>
                <ScrollArea className="max-h-32">
                  <ul className="text-xs text-muted-foreground space-y-1">
                    {importResults.errors.map((error, i) => (
                      <li key={i}>{error}</li>
                    ))}
                  </ul>
                </ScrollArea>
              </div>
            )}
          </div>
        )}

        <DialogFooter>
          {step === "upload" && (
            <Button variant="outline" onClick={handleClose} data-testid="button-cancel-import">
              Cancel
            </Button>
          )}
          
          {step === "map" && (
            <>
              <Button variant="outline" onClick={() => setStep("upload")} data-testid="button-back">
                Back
              </Button>
              <Button onClick={handleContinue} data-testid="button-continue">
                Continue
              </Button>
            </>
          )}
          
          {step === "preview" && (
            <>
              <Button variant="outline" onClick={() => setStep("map")} data-testid="button-back">
                Back
              </Button>
              <Button 
                onClick={handleImport} 
                disabled={importMutation.isPending}
                className="bg-[#bba7db] hover:bg-[#bba7db]/90 text-white"
                data-testid="button-import"
              >
                {importMutation.isPending ? "Importing..." : `Import ${parsedContacts.length} Contacts`}
              </Button>
            </>
          )}
          
          {step === "complete" && (
            <Button onClick={handleClose} data-testid="button-done">
              Done
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
