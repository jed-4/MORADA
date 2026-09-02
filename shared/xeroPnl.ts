/** Per-month P&L section totals, keyed "YYYY-MM". Amounts are ex-GST dollars. */
export interface SectionTotals { income: number; directCosts: number; expenses: number }

const XERO_PL_MONTH_MAP: Record<string, string> = {
  Jan: "01", Feb: "02", Mar: "03", Apr: "04", May: "05", Jun: "06",
  Jul: "07", Aug: "08", Sep: "09", Oct: "10", Nov: "11", Dec: "12",
};

/**
 * Turn a Xero P&L column header into a "YYYY-MM" key, or null if it is not a
 * month column.
 *
 * Xero is inconsistent about this header across report shapes — observed forms
 * include "Jan 2025", "Jan 25", "30 Apr 26", "30 Apr 2026" and
 * "30 Apr 2026 YTD". A header this function fails to parse is a column silently
 * dropped from the sync, so it is exported and tested rather than buried in a
 * closure.
 */
export function parseXeroPnlMonthLabel(label: string): string | null {
  const parts = (label || "").trim().split(/\s+/);
  let mm: string | undefined;
  let yearStr: string | undefined;
  for (let j = 0; j < parts.length; j++) {
    const monthCode = XERO_PL_MONTH_MAP[parts[j] as keyof typeof XERO_PL_MONTH_MAP];
    if (!monthCode) continue;
    mm = monthCode;
    // Year is the next purely-numeric token ("Jan 2025", "30 Apr 26")…
    for (let k = j + 1; k < parts.length; k++) {
      if (/^\d{2}(\d{2})?$/.test(parts[k])) { yearStr = parts[k]; break; }
    }
    // …or the previous one when the month trails the year.
    if (!yearStr) {
      for (let k = j - 1; k >= 0; k--) {
        if (/^\d{2}(\d{2})?$/.test(parts[k])) { yearStr = parts[k]; break; }
      }
    }
    break;
  }
  if (!mm || !yearStr) return null;
  const yyyy = yearStr.length === 2 ? `20${yearStr}` : yearStr;
  return `${yyyy}-${mm}`;
}
