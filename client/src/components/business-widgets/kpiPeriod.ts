import type { KPIPeriod } from "./kpiDefinitions";

const DEFAULT_FY_START_MONTH = 7;

export interface PeriodRange {
  start: Date;
  end: Date;
}

export function getPeriodRange(
  period: KPIPeriod,
  fyStartMonth: number = DEFAULT_FY_START_MONTH,
  now: Date = new Date(),
): PeriodRange {
  const end = new Date(now);
  if (period === "month") {
    return { start: new Date(now.getFullYear(), now.getMonth(), 1), end };
  }
  if (period === "quarter") {
    const q = Math.floor(now.getMonth() / 3);
    return { start: new Date(now.getFullYear(), q * 3, 1), end };
  }
  const month = now.getMonth() + 1;
  const fyStartYear = month >= fyStartMonth ? now.getFullYear() : now.getFullYear() - 1;
  return { start: new Date(fyStartYear, fyStartMonth - 1, 1), end };
}

export function getPeriodLabel(period: KPIPeriod): string {
  if (period === "month") return "This month";
  if (period === "quarter") return "This quarter";
  return "This year";
}
