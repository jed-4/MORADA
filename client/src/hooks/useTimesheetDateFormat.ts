import { useQuery } from "@tanstack/react-query";
import { format } from "date-fns";
import type { CompanySettings } from "@shared/schema";

export function formatTimesheetDate(date: Date | string, dateFormat: "short" | "long" = "short"): string {
  const d = typeof date === "string" ? new Date(date) : date;
  if (dateFormat === "long") {
    return format(d, "EEE d MMM");
  }
  const day = d.getDate();
  const month = d.getMonth() + 1;
  const year = String(d.getFullYear()).slice(-2);
  return `${day}/${month}/${year}`;
}

export function useTimesheetDateFormat(): "short" | "long" {
  const { data: settings } = useQuery<CompanySettings>({
    queryKey: ["/api/company-settings"],
  });
  return (settings?.timesheetDateFormat as "short" | "long") || "short";
}
