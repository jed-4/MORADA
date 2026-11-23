/** Shared hour formatting for Labour hours (P17) and Labour code detail (P18). */

export const hoursNum = (v?: string | null) => parseFloat(v || '0') || 0;

/** "1.8", "20.5", "0": one decimal at most, no unit. */
export const fmtHours = (n: number) =>
  (Math.round(n * 10) / 10).toLocaleString(undefined, { maximumFractionDigits: 1 });

/** Hours booked past the budget (a code with no budget but time booked counts too). */
export const isOverBudget = (budgeted: number, used: number) => used > budgeted && used > 0;

/** "Labour – Framing" → "Framing": the screen is already about labour. */
export const shortLabourTitle = (t: string) => t.replace(/^labour\s*[–—-]\s*/i, '');
