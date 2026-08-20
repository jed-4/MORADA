import { useState, useMemo } from "react";
import * as XLSX from "xlsx";
import { useMutation } from "@tanstack/react-query";
import { Upload, FileSpreadsheet, Loader2, AlertCircle } from "lucide-react";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { dollarsToCents } from "@shared/money";

/** The fields an imported row can fill. `code` is the identity used for matching. */
const FIELDS = [
  { key: "name", label: "Item name", required: true },
  { key: "code", label: "SKU", hint: "matched on" },
  { key: "groupName", label: "Group" },
  { key: "unitType", label: "Unit" },
  { key: "costPrice", label: "Cost (ex GST)", money: true },
  { key: "sellPrice", label: "Sell (ex GST)", money: true },
  { key: "nickname", label: "Nickname" },
  { key: "description", label: "Description" },
  { key: "supplierCode", label: "Supplier ref" },
  { key: "brand", label: "Brand" },
  { key: "leadTimeDays", label: "Lead time (days)", number: true },
] as const;

const NONE = "__none__";

/** Header guesses, so a typical supplier sheet maps itself. */
const GUESSES: Record<string, string> = {
  name: "name", item: "name", "item name": "name", product: "name", description: "description",
  sku: "code", code: "code", "item code": "code", "product code": "code", ref: "code",
  group: "groupName", category: "groupName", section: "groupName",
  unit: "unitType", uom: "unitType", units: "unitType", "unit of measure": "unitType",
  cost: "costPrice", "cost price": "costPrice", price: "costPrice", "unit price": "costPrice",
  "trade price": "costPrice", "ex gst": "costPrice", buy: "costPrice",
  sell: "sellPrice", "sell price": "sellPrice", rrp: "sellPrice", retail: "sellPrice",
  nickname: "nickname", brand: "brand", manufacturer: "brand",
  "supplier ref": "supplierCode", "supplier code": "supplierCode",
  "lead time": "leadTimeDays", "lead time days": "leadTimeDays",
};

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  priceListId: string;
}

export function ImportPriceListDialog({ open, onOpenChange, priceListId }: Props) {
  const { toast } = useToast();
  const [fileName, setFileName] = useState("");
  const [headers, setHeaders] = useState<string[]>([]);
  const [rows, setRows] = useState<Record<string, unknown>[]>([]);
  const [mapping, setMapping] = useState<Record<string, string>>({});
  const [parseError, setParseError] = useState("");

  const reset = () => {
    setFileName(""); setHeaders([]); setRows([]); setMapping({}); setParseError("");
  };

  const handleFile = async (file: File) => {
    setParseError("");
    try {
      const wb = XLSX.read(await file.arrayBuffer(), { type: "array" });
      const sheet = wb.Sheets[wb.SheetNames[0]];
      const json = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, { defval: "" });
      if (json.length === 0) {
        setParseError("That sheet has no rows.");
        return;
      }
      const hdrs = Object.keys(json[0]);
      const guessed: Record<string, string> = {};
      hdrs.forEach((h) => {
        const field = GUESSES[h.toLowerCase().trim()];
        // First header wins a field, so a sheet with both "Price" and "Cost"
        // doesn't silently overwrite the earlier guess.
        if (field && !guessed[field]) guessed[field] = h;
      });
      setFileName(file.name);
      setHeaders(hdrs);
      setRows(json);
      setMapping(guessed);
    } catch (e: any) {
      setParseError(e?.message || "Could not read that file.");
    }
  };

  /** Rows the server will act on, with money converted at the boundary. */
  const payload = useMemo(() => {
    const nameCol = mapping.name;
    if (!nameCol) return [];
    return rows.map((r) => {
      const out: Record<string, unknown> = {};
      for (const f of FIELDS) {
        const col = mapping[f.key];
        if (!col) continue;
        const raw = r[col];
        if (raw === "" || raw === null || raw === undefined) continue;
        if ((f as any).money) {
          // Sheets carry dollars; the column is integer cents.
          const n = typeof raw === "number" ? raw : parseFloat(String(raw).replace(/[^0-9.\-]/g, ""));
          if (!Number.isFinite(n)) continue;
          out[f.key] = dollarsToCents(n);
        } else if ((f as any).number) {
          const n = typeof raw === "number" ? raw : parseInt(String(raw).replace(/[^0-9\-]/g, ""), 10);
          if (Number.isFinite(n)) out[f.key] = n;
        } else {
          out[f.key] = String(raw).trim();
        }
      }
      return out;
    }).filter((r) => !!r.name);
  }, [rows, mapping]);

  const withSku = payload.filter((r) => !!r.code).length;

  const runImport = useMutation({
    mutationFn: () => apiRequest(`/api/price-lists/${priceListId}/import`, "POST", { rows: payload }),
    onSuccess: (res: any) => {
      queryClient.invalidateQueries({ queryKey: ["/api/price-list/items"] });
      queryClient.invalidateQueries({ queryKey: ["/api/price-list/groups"] });
      queryClient.invalidateQueries({ queryKey: ["/api/price-lists"] });
      const bits = [
        `${res.created} added`,
        `${res.updated} updated`,
        res.groupsCreated ? `${res.groupsCreated} group${res.groupsCreated === 1 ? "" : "s"} created` : "",
        res.skipped ? `${res.skipped} skipped` : "",
      ].filter(Boolean);
      toast({ title: "Import complete", description: bits.join(" · ") });
      reset();
      onOpenChange(false);
    },
    onError: (error: any) =>
      toast({ title: "Import failed", description: error.message, variant: "destructive" }),
  });

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) reset(); onOpenChange(o); }}>
      <DialogContent className="sm:max-w-lg max-h-[90vh] flex flex-col overflow-hidden" data-testid="modal-import-price-list">
        <DialogHeader className="flex-shrink-0">
          <DialogTitle>Import items</DialogTitle>
          <DialogDescription>
            Excel (.xlsx) or CSV. Rows are matched on SKU — an existing SKU has its
            prices updated, anything new is added.
          </DialogDescription>
        </DialogHeader>

        <div className="flex min-h-0 flex-1 flex-col">
          <div className="flex-1 overflow-y-auto space-y-4 pr-1">
            {rows.length === 0 ? (
              <label
                className="flex flex-col items-center justify-center gap-2 rounded-lg border border-dashed border-border py-10 cursor-pointer hover-elevate"
                data-testid="dropzone-import"
              >
                <Upload className="h-5 w-5 text-muted-foreground" />
                <span className="text-sm">Choose a spreadsheet</span>
                <span className="text-xs text-muted-foreground">.xlsx or .csv</span>
                <input
                  type="file"
                  accept=".xlsx,.xls,.csv"
                  className="hidden"
                  onChange={(e) => e.target.files?.[0] && handleFile(e.target.files[0])}
                  data-testid="input-import-file"
                />
              </label>
            ) : (
              <>
                <div className="flex items-center gap-2 text-sm">
                  <FileSpreadsheet className="h-4 w-4 text-muted-foreground" />
                  <span className="truncate">{fileName}</span>
                  <span className="text-xs text-muted-foreground">{rows.length} rows</span>
                  <Button variant="ghost" size="sm" className="ml-auto h-6 text-xs" onClick={reset}>
                    Change
                  </Button>
                </div>

                <div className="space-y-2">
                  {FIELDS.map((f) => (
                    <div key={f.key} className="grid grid-cols-2 items-center gap-2">
                      <Label className="text-xs">
                        {f.label}
                        {(f as any).required && <span className="text-destructive"> *</span>}
                        {(f as any).hint && (
                          <span className="ml-1 text-[10px] text-muted-foreground">({(f as any).hint})</span>
                        )}
                      </Label>
                      <Select
                        value={mapping[f.key] ?? NONE}
                        onValueChange={(v) =>
                          setMapping((m) => {
                            const next = { ...m };
                            if (v === NONE) delete next[f.key]; else next[f.key] = v;
                            return next;
                          })
                        }
                      >
                        <SelectTrigger className="h-7 text-xs" data-testid={`map-${f.key}`}>
                          <SelectValue placeholder="Not imported" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value={NONE}>Not imported</SelectItem>
                          {headers.map((h) => (
                            <SelectItem key={h} value={h}>{h}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  ))}
                </div>

                {!mapping.name && (
                  <p className="flex items-center gap-1.5 text-xs text-destructive">
                    <AlertCircle className="h-3 w-3" />
                    Choose which column holds the item name.
                  </p>
                )}
                {mapping.name && !mapping.code && (
                  <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
                    <AlertCircle className="h-3 w-3" />
                    Without a SKU column every row is added as new — nothing can be matched.
                  </p>
                )}
                {mapping.name && mapping.code && (
                  <p className="text-xs text-muted-foreground">
                    {payload.length} rows ready · {withSku} carry a SKU and can be matched.
                  </p>
                )}
              </>
            )}

            {parseError && (
              <p className="flex items-center gap-1.5 text-xs text-destructive">
                <AlertCircle className="h-3 w-3" />
                {parseError}
              </p>
            )}
          </div>

          <div className="flex flex-shrink-0 justify-end gap-3 border-t pt-4 mt-4">
            <Button variant="outline" onClick={() => { reset(); onOpenChange(false); }} data-testid="button-cancel-import">
              Cancel
            </Button>
            <Button
              disabled={!mapping.name || payload.length === 0 || runImport.isPending}
              onClick={() => runImport.mutate()}
              data-testid="button-run-import"
            >
              {runImport.isPending && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
              Import {payload.length || ""} rows
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
