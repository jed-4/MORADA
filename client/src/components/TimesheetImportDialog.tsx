import { useState, useRef, useCallback } from "react";
import * as XLSX from "xlsx";
import { parse, isValid, format } from "date-fns";
import { Upload, AlertCircle, CheckCircle2, AlertTriangle, FileSpreadsheet } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
import type { Project, User, CostCode } from "@shared/schema";

interface ParsedRow {
  _rowNum: number;
  date: string;
  userName: string;
  startTime: string;
  endTime: string;
  duration: number;
  costCodeStr: string;
  status: string;
  description: string;
  userId: string | null;
  costCodeId: string | null;
  severity: "ok" | "warning" | "error";
  issues: string[];
}

interface TimesheetImportDialogProps {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  projects: Project[];
  users: User[];
  costCodes: CostCode[];
  defaultProjectId?: string;
  onImported: () => void;
}

function matchUser(name: string, users: User[]): User | null {
  if (!name) return null;
  const normalized = name.trim().toLowerCase();
  return (
    users.find((u) => {
      const full = `${u.firstName || ""} ${u.lastName || ""}`.trim().toLowerCase();
      return full === normalized;
    }) ?? null
  );
}

function matchCostCode(str: string, codes: CostCode[]): CostCode | null {
  if (!str) return null;
  const normalized = str.trim().toLowerCase();
  return (
    codes.find((c) => {
      const codeTitle = `${c.code}-${c.title}`.toLowerCase();
      const titleOnly = c.title.toLowerCase();
      const codeOnly = c.code.toLowerCase();
      return (
        codeTitle === normalized ||
        titleOnly === normalized ||
        codeOnly === normalized ||
        normalized.startsWith(codeOnly + "-")
      );
    }) ?? null
  );
}

function parseRows(
  data: any[],
  users: User[],
  costCodes: CostCode[]
): ParsedRow[] {
  const headers = data.length > 0 ? Object.keys(data[0]) : [];
  const isBuildern = headers.includes("Start & End Time");

  return data.map((row, i) => {
    const issues: string[] = [];

    const dateStr = String(row["Date"] || "").trim();
    let parsedDate: Date | null = null;
    if (dateStr) {
      const d = parse(dateStr, "dd/MM/yyyy", new Date());
      parsedDate = isValid(d) ? d : null;
    }
    if (!parsedDate) issues.push("Invalid or missing date");

    const userName = String(row["User"] || "").trim();
    if (!userName) issues.push("Missing user name");
    const matchedUser = matchUser(userName, users);
    if (userName && !matchedUser) issues.push(`User "${userName}" not found in company`);

    let startTime = "";
    let endTime = "";
    if (isBuildern) {
      const combined = String(row["Start & End Time"] || "").trim();
      const parts = combined.split(" - ");
      startTime = parts[0]?.trim() || "";
      endTime = parts[1]?.trim() || "";
    } else {
      startTime = String(row["Start Time"] || "").trim();
      endTime = String(row["End Time"] || "").trim();
      if (startTime === "-") startTime = "";
      if (endTime === "-") endTime = "";
    }

    const durationRaw = isBuildern ? row["Duration"] : row["Duration (hrs)"];
    const duration =
      typeof durationRaw === "number"
        ? durationRaw
        : parseFloat(String(durationRaw || "0"));
    if (isNaN(duration) || duration <= 0) issues.push("Invalid or missing duration");

    const costCodeStr = isBuildern
      ? String(row["Cost code"] || "").trim()
      : String(row["Cost Code"] || row["cost code"] || "").trim();
    const matchedCode = costCodeStr ? matchCostCode(costCodeStr, costCodes) : null;
    if (costCodeStr && !matchedCode)
      issues.push(`Cost code "${costCodeStr}" not matched — will import without`);

    const rawStatus = String(row["Status"] || "draft").trim().toLowerCase();
    const status =
      rawStatus === "submitted"
        ? "submitted"
        : rawStatus === "approved"
        ? "approved"
        : rawStatus === "rejected"
        ? "rejected"
        : "draft";

    const description = String(row["Description"] || "").trim();

    const isError =
      !parsedDate || !matchedUser || isNaN(duration) || duration <= 0;
    const isWarning = !isError && issues.length > 0;

    return {
      _rowNum: i + 1,
      date: parsedDate ? format(parsedDate, "dd/MM/yyyy") : dateStr,
      userName,
      startTime,
      endTime,
      duration: isNaN(duration) ? 0 : duration,
      costCodeStr,
      status,
      description,
      userId: matchedUser?.id ?? null,
      costCodeId: matchedCode?.id ?? null,
      severity: isError ? "error" : isWarning ? "warning" : "ok",
      issues,
    };
  });
}

export function TimesheetImportDialog({
  open,
  onOpenChange,
  projects,
  users,
  costCodes,
  defaultProjectId,
  onImported,
}: TimesheetImportDialogProps) {
  const { toast } = useToast();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [step, setStep] = useState<1 | 2>(1);
  const [projectId, setProjectId] = useState(defaultProjectId || "");
  const [fileName, setFileName] = useState("");
  const [parsedRows, setParsedRows] = useState<ParsedRow[]>([]);
  const [importing, setImporting] = useState(false);
  const [formatDetected, setFormatDetected] = useState<"buildern" | "buildpro" | "unknown">("unknown");

  const reset = useCallback(() => {
    setStep(1);
    setFileName("");
    setParsedRows([]);
    setProjectId(defaultProjectId || "");
    setFormatDetected("unknown");
    if (fileInputRef.current) fileInputRef.current.value = "";
  }, [defaultProjectId]);

  const handleFileChange = useCallback(
    async (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (!file) return;
      setFileName(file.name);

      try {
        const buffer = await file.arrayBuffer();
        const wb = XLSX.read(new Uint8Array(buffer), { type: "array" });
        const ws = wb.Sheets[wb.SheetNames[0]];
        const data = XLSX.utils.sheet_to_json(ws, { defval: "" }) as any[];

        if (data.length === 0) {
          toast({
            title: "Empty file",
            description: "No rows found in the spreadsheet.",
            variant: "destructive",
          });
          return;
        }

        const headers = Object.keys(data[0]);
        const detected = headers.includes("Start & End Time")
          ? "buildern"
          : headers.includes("Start Time")
          ? "buildpro"
          : "unknown";
        setFormatDetected(detected);

        const rows = parseRows(data, users, costCodes);
        setParsedRows(rows);
      } catch {
        toast({
          title: "Could not read file",
          description: "Make sure the file is a valid XLSX spreadsheet.",
          variant: "destructive",
        });
      }
    },
    [users, costCodes, toast]
  );

  const handleNext = () => {
    if (!projectId) {
      toast({
        title: "Select a project",
        description: "Choose which project these timesheets belong to.",
        variant: "destructive",
      });
      return;
    }
    if (parsedRows.length === 0) {
      toast({
        title: "No file selected",
        description: "Please choose an XLSX file.",
        variant: "destructive",
      });
      return;
    }
    setStep(2);
  };

  const importableRows = parsedRows.filter((r) => r.severity !== "error");
  const errorRows = parsedRows.filter((r) => r.severity === "error");

  const handleImport = async () => {
    setImporting(true);
    try {
      const payload = {
        projectId,
        rows: importableRows.map((r) => ({
          date: r.date,
          userId: r.userId,
          startTime: r.startTime || null,
          endTime: r.endTime || null,
          duration: r.duration,
          costCodeId: r.costCodeId || null,
          status: r.status,
          description: r.description || null,
        })),
      };

      const result = await apiRequest("/api/timesheets/import", "POST", payload);
      queryClient.invalidateQueries({ queryKey: ["/api/timesheets"] });
      onImported();
      onOpenChange(false);
      reset();
      toast({
        title: "Import complete",
        description: `${result.imported} timesheet${result.imported !== 1 ? "s" : ""} imported${result.skipped > 0 ? `, ${result.skipped} skipped` : ""}.`,
      });
    } catch (err: any) {
      toast({
        title: "Import failed",
        description: err.message || "An unexpected error occurred.",
        variant: "destructive",
      });
    } finally {
      setImporting(false);
    }
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(v) => {
        if (!v) reset();
        onOpenChange(v);
      }}
    >
      <DialogContent className={step === 2 ? "max-w-3xl" : "max-w-md"}>
        <DialogHeader>
          <DialogTitle>
            {step === 1
              ? "Import Timesheets"
              : `Preview — ${parsedRows.length} row${parsedRows.length !== 1 ? "s" : ""}`}
          </DialogTitle>
        </DialogHeader>

        {step === 1 && (
          <div className="space-y-4 py-2">
            <div className="space-y-1.5">
              <label className="text-sm font-medium">Project *</label>
              <Select value={projectId} onValueChange={setProjectId}>
                <SelectTrigger data-testid="select-import-project">
                  <SelectValue placeholder="Select a project..." />
                </SelectTrigger>
                <SelectContent>
                  {projects.map((p) => (
                    <SelectItem key={p.id} value={p.id}>
                      {p.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1.5">
              <label className="text-sm font-medium">File (XLSX) *</label>
              <div
                className="border-2 border-dashed border-border rounded-md p-6 flex flex-col items-center gap-2 cursor-pointer hover-elevate"
                onClick={() => fileInputRef.current?.click()}
                data-testid="dropzone-import-file"
              >
                <FileSpreadsheet className="w-8 h-8 text-muted-foreground" />
                {fileName ? (
                  <span className="text-sm font-medium">{fileName}</span>
                ) : (
                  <span className="text-sm text-muted-foreground">
                    Click to choose an XLSX file
                  </span>
                )}
                {fileName && formatDetected !== "unknown" && (
                  <Badge variant="secondary" className="text-xs">
                    {formatDetected === "buildern" ? "Buildern" : "BuildPro"} format detected
                  </Badge>
                )}
              </div>
              <input
                ref={fileInputRef}
                type="file"
                accept=".xlsx,.xls"
                className="hidden"
                onChange={handleFileChange}
                data-testid="input-import-file"
              />
            </div>

            {parsedRows.length > 0 && (
              <p className="text-sm text-muted-foreground">
                {parsedRows.length} row{parsedRows.length !== 1 ? "s" : ""} parsed
                {errorRows.length > 0 ? ` · ${errorRows.length} will be skipped` : ""}
              </p>
            )}
          </div>
        )}

        {step === 2 && (
          <div className="space-y-3">
            <div className="flex items-center gap-4 text-sm">
              <span className="flex items-center gap-1.5 text-green-600 dark:text-green-400">
                <CheckCircle2 className="w-4 h-4" />
                {importableRows.length} ready to import
              </span>
              {errorRows.length > 0 && (
                <span className="flex items-center gap-1.5 text-red-600 dark:text-red-400">
                  <AlertCircle className="w-4 h-4" />
                  {errorRows.length} will be skipped
                </span>
              )}
            </div>

            <div className="rounded-md border border-border overflow-auto max-h-96">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-8 px-2"></TableHead>
                    <TableHead>Date</TableHead>
                    <TableHead>User</TableHead>
                    <TableHead>Start</TableHead>
                    <TableHead>End</TableHead>
                    <TableHead>Hrs</TableHead>
                    <TableHead>Cost Code</TableHead>
                    <TableHead>Status</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {parsedRows.map((row) => (
                    <TableRow
                      key={row._rowNum}
                      className={row.severity === "error" ? "opacity-40" : ""}
                      title={row.issues.join(" · ")}
                    >
                      <TableCell className="px-2">
                        {row.severity === "ok" && (
                          <CheckCircle2 className="w-3.5 h-3.5 text-green-500" />
                        )}
                        {row.severity === "warning" && (
                          <AlertTriangle className="w-3.5 h-3.5 text-amber-500" />
                        )}
                        {row.severity === "error" && (
                          <AlertCircle className="w-3.5 h-3.5 text-red-500" />
                        )}
                      </TableCell>
                      <TableCell className="text-xs">{row.date || "—"}</TableCell>
                      <TableCell className="text-xs max-w-[120px] truncate">
                        {row.userName ? (
                          row.userId ? (
                            row.userName
                          ) : (
                            <span className="text-red-600 dark:text-red-400">{row.userName}</span>
                          )
                        ) : (
                          "—"
                        )}
                      </TableCell>
                      <TableCell className="text-xs">{row.startTime || "—"}</TableCell>
                      <TableCell className="text-xs">{row.endTime || "—"}</TableCell>
                      <TableCell className="text-xs">
                        {row.duration > 0 ? row.duration.toFixed(1) : "—"}
                      </TableCell>
                      <TableCell className="text-xs max-w-[120px] truncate">
                        {row.costCodeStr ? (
                          row.costCodeId ? (
                            row.costCodeStr
                          ) : (
                            <span className="text-amber-600 dark:text-amber-400">
                              {row.costCodeStr}
                            </span>
                          )
                        ) : (
                          "—"
                        )}
                      </TableCell>
                      <TableCell className="text-xs capitalize">{row.status}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>

            {(errorRows.length > 0 || parsedRows.some((r) => r.severity === "warning")) && (
              <p className="text-xs text-muted-foreground">
                <span className="text-red-600 dark:text-red-400">Red</span> = skipped (missing date, duration, or user not found).{" "}
                <span className="text-amber-600 dark:text-amber-400">Amber</span> = imported without cost code.
              </p>
            )}
          </div>
        )}

        <DialogFooter className="flex-wrap gap-2">
          {step === 1 ? (
            <>
              <Button variant="outline" onClick={() => onOpenChange(false)}>
                Cancel
              </Button>
              <Button
                onClick={handleNext}
                disabled={!fileName || !projectId}
                data-testid="button-import-preview"
              >
                Preview
                <Upload className="w-3.5 h-3.5 ml-1.5" />
              </Button>
            </>
          ) : (
            <>
              <Button variant="outline" onClick={() => setStep(1)}>
                Back
              </Button>
              <Button
                onClick={handleImport}
                disabled={importing || importableRows.length === 0}
                data-testid="button-import-confirm"
              >
                {importing
                  ? "Importing…"
                  : `Import ${importableRows.length} timesheet${importableRows.length !== 1 ? "s" : ""}`}
              </Button>
            </>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
