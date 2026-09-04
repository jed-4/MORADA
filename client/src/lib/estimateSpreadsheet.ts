// Excel round-trip helpers shared by job estimates and estimate templates.
//
// Both surfaces write the same column set (ESTIMATE_EXPORT_HEADERS) so a sheet
// exported from one re-imports cleanly into the other. `xlsx` is imported
// dynamically — it is a large dependency and neither page needs it until the
// user actually asks for a file.

import {
  ESTIMATE_EXPORT_HEADERS,
  ESTIMATE_IMPORT_EXAMPLE_ROW,
  type EstimateExportHeader,
} from "@shared/import";

export type EstimateExportRow = Partial<Record<EstimateExportHeader, string | number>>;

/** Filesystem-safe stem for a download, e.g. "Two Storey Reno" -> "Two_Storey_Reno". */
export function safeFileStem(name: string): string {
  return (name || "export").replace(/[^a-z0-9]/gi, "_");
}

function todayStamp(): string {
  return new Date().toISOString().split("T")[0];
}

/** Write rows to a one-sheet .xlsx and trigger the browser download. */
export async function downloadEstimateWorkbook(
  rows: EstimateExportRow[],
  opts: { sheetName: string; fileName: string },
): Promise<void> {
  const XLSX = await import("xlsx");
  const ws = XLSX.utils.json_to_sheet(rows, {
    header: ESTIMATE_EXPORT_HEADERS as unknown as string[],
  });
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, opts.sheetName);
  XLSX.writeFile(wb, opts.fileName);
}

/** Export a named set of lines, stamped with today's date. */
export async function exportEstimateRows(
  rows: EstimateExportRow[],
  opts: { name: string; sheetName: string },
): Promise<void> {
  await downloadEstimateWorkbook(rows, {
    sheetName: opts.sheetName,
    fileName: `${safeFileStem(opts.name)}_${todayStamp()}.xlsx`,
  });
}

/** Download an empty sheet with the correct headers plus one example row. */
export async function downloadBlankImportTemplate(
  opts: { sheetName: string; fileName: string } = {
    sheetName: "Estimate Import",
    fileName: "Morada_Estimate_Import_Template.xlsx",
  },
): Promise<void> {
  await downloadEstimateWorkbook([{ ...ESTIMATE_IMPORT_EXAMPLE_ROW }], opts);
}
