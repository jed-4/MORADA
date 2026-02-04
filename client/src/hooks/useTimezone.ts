import { useAuth } from "./use-auth";
import { useQuery } from "@tanstack/react-query";

interface SystemConfiguration {
  timezone?: string;
}

export function useTimezone() {
  const { user } = useAuth();
  
  const { data: systemConfig } = useQuery<SystemConfiguration>({
    queryKey: ["/api/system-configuration"],
    enabled: !!user?.companyId,
  });

  const userTimezone = user?.timezone;
  const companyTimezone = systemConfig?.timezone || "Australia/Sydney";
  
  const effectiveTimezone = userTimezone || companyTimezone;

  return {
    userTimezone,
    companyTimezone,
    effectiveTimezone,
    isUsingCompanyDefault: !userTimezone,
  };
}

export function formatInTimezone(date: Date | string, timezone: string, options?: Intl.DateTimeFormatOptions): string {
  const d = typeof date === 'string' ? new Date(date) : date;
  if (isNaN(d.getTime())) return '';
  
  try {
    return d.toLocaleString('en-AU', {
      timeZone: timezone,
      ...options,
    });
  } catch {
    return d.toLocaleString('en-AU', options);
  }
}

export function formatDateInTimezone(date: Date | string, timezone: string): string {
  return formatInTimezone(date, timezone, {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  });
}

export function formatTimeInTimezone(date: Date | string, timezone: string): string {
  return formatInTimezone(date, timezone, {
    hour: '2-digit',
    minute: '2-digit',
    hour12: true,
  });
}

export function formatDateTimeInTimezone(date: Date | string, timezone: string): string {
  return formatInTimezone(date, timezone, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    hour12: true,
  });
}

export function formatRelativeDateInTimezone(date: Date | string, timezone: string): string {
  const d = typeof date === 'string' ? new Date(date) : date;
  if (isNaN(d.getTime())) return '';
  
  const now = new Date();
  const today = new Date(now.toLocaleString('en-US', { timeZone: timezone }));
  today.setHours(0, 0, 0, 0);
  
  const targetDate = new Date(d.toLocaleString('en-US', { timeZone: timezone }));
  targetDate.setHours(0, 0, 0, 0);
  
  const diffDays = Math.floor((targetDate.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
  
  if (diffDays === 0) return 'Today';
  if (diffDays === 1) return 'Tomorrow';
  if (diffDays === -1) return 'Yesterday';
  
  return formatDateInTimezone(date, timezone);
}

export function isTodayInTimezone(date: Date, timezone: string): boolean {
  const now = new Date();
  const todayStr = formatInTimezone(now, timezone, { year: 'numeric', month: '2-digit', day: '2-digit' });
  const dateStr = formatInTimezone(date, timezone, { year: 'numeric', month: '2-digit', day: '2-digit' });
  return todayStr === dateStr;
}

export function getDayOfWeekInTimezone(timezone: string): number {
  const now = new Date();
  const dayStr = formatInTimezone(now, timezone, { weekday: 'short' });
  const dayMap: Record<string, number> = { 'Sun': 0, 'Mon': 1, 'Tue': 2, 'Wed': 3, 'Thu': 4, 'Fri': 5, 'Sat': 6 };
  return dayMap[dayStr] ?? now.getDay();
}

export function getCurrentTimeInTimezone(timezone: string): { hours: number; minutes: number; totalMinutes: number } {
  const now = new Date();
  const timeStr = formatInTimezone(now, timezone, { hour: '2-digit', minute: '2-digit', hour12: false });
  const [hours, minutes] = timeStr.split(':').map(Number);
  return { hours: hours || 0, minutes: minutes || 0, totalMinutes: (hours || 0) * 60 + (minutes || 0) };
}
