import { useMemo, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { format } from "date-fns";
import { CalendarOff, Trash2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { Skeleton } from "@/components/ui/skeleton";
import type { FieldCategoryWithOptions, User as UserType } from "@shared/schema";

interface LeaveRow {
  id: string;
  userId: string;
  userName: string;
  startDate: string;
  endDate: string;
  isHalfDay: boolean;
  halfDayPeriod: "am" | "pm" | null;
  leaveType: string;
  note: string | null;
}

/**
 * Business → Leave.
 *
 * The list-and-edit surface for the same `leave_entries` the business calendar
 * draws as bands. Marking leave itself lives on the calendar, where you can see
 * who else is already away that week — so this page is for reviewing and
 * correcting, not for the primary entry flow.
 *
 * No balances or approvals here on purpose: this records that someone is away,
 * and leave management is a separate build.
 */
export default function BusinessLeave() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [userFilter, setUserFilter] = useState<string>("all");
  const [upcomingOnly, setUpcomingOnly] = useState(true);

  const { data: leave = [], isLoading } = useQuery<LeaveRow[]>({
    queryKey: ["/api/leave-entries"],
  });
  const { data: users = [] } = useQuery<UserType[]>({ queryKey: ["/api/users"] });
  const { data: fieldCategories = [] } = useQuery<FieldCategoryWithOptions[]>({
    queryKey: ["/api/field-categories"],
  });

  const leaveTypes = fieldCategories.find(c => c.key === "leave.type")?.options ?? [];
  const typeOf = (key: string) => leaveTypes.find((o: any) => o.key === key);

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => { await apiRequest(`/api/leave-entries/${id}`, "DELETE"); },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/leave-entries"] });
      toast({ title: "Leave removed" });
    },
  });

  const rows = useMemo(() => {
    // Compare on the date part only: entries are stored at local midnight, so a
    // whole-day comparison against `new Date()` would hide today's leave.
    const today = format(new Date(), "yyyy-MM-dd");
    return leave
      .filter(l => userFilter === "all" || l.userId === userFilter)
      .filter(l => !upcomingOnly || String(l.endDate).slice(0, 10) >= today)
      .sort((a, b) => String(a.startDate).localeCompare(String(b.startDate)));
  }, [leave, userFilter, upcomingOnly]);

  const teamMembers = users.filter((u: any) => u.userCategory === "team");

  const formatRange = (row: LeaveRow) => {
    const start = new Date(row.startDate);
    const end = new Date(row.endDate);
    if (row.isHalfDay) {
      return `${format(start, "EEE d MMM yyyy")} · ${row.halfDayPeriod === "pm" ? "afternoon" : "morning"}`;
    }
    if (format(start, "yyyy-MM-dd") === format(end, "yyyy-MM-dd")) {
      return format(start, "EEE d MMM yyyy");
    }
    return `${format(start, "EEE d MMM")} – ${format(end, "EEE d MMM yyyy")}`;
  };

  /** Working days are the useful number here — leave over a weekend isn't 4 days off. */
  const workingDays = (row: LeaveRow) => {
    if (row.isHalfDay) return 0.5;
    let days = 0;
    const cursor = new Date(row.startDate);
    const end = new Date(row.endDate);
    while (cursor <= end) {
      const dow = cursor.getDay();
      if (dow !== 0 && dow !== 6) days++;
      cursor.setDate(cursor.getDate() + 1);
    }
    return days;
  };

  return (
    <div className="flex flex-col h-full p-3 sm:p-4" data-testid="business-leave">
      <div className="flex flex-col flex-1 min-h-0 border border-border rounded-lg bg-card overflow-hidden">
        <div className="h-9 bg-card flex items-center justify-between px-2 border-b border-border flex-shrink-0 gap-2">
          <div className="flex items-center gap-1.5">
            <Select value={userFilter} onValueChange={setUserFilter}>
              <SelectTrigger className="h-6 w-44 text-xs" data-testid="select-leave-user-filter">
                <SelectValue placeholder="Everyone" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Everyone</SelectItem>
                {teamMembers.map((u: any) => (
                  <SelectItem key={u.id} value={u.id}>
                    {`${u.firstName || ""} ${u.lastName || ""}`.trim() || u.email}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <button
              className={`h-6 px-2 text-xs border rounded-md hover-elevate active-elevate-2 ${upcomingOnly ? "bg-primary text-primary-foreground border-primary/20" : ""}`}
              onClick={() => setUpcomingOnly(v => !v)}
              data-testid="button-toggle-upcoming"
            >
              {upcomingOnly ? "Upcoming" : "All time"}
            </button>
          </div>
          <span className="text-xs text-muted-foreground pr-1">
            Mark leave from the calendar
          </span>
        </div>

        <div className="flex-1 min-h-0 overflow-auto">
          {isLoading ? (
            <div className="p-4 space-y-2">
              {Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-9 w-full" />)}
            </div>
          ) : rows.length === 0 ? (
            <div className="flex flex-col h-full items-center justify-center gap-2 text-center p-8" data-testid="leave-empty">
              <CalendarOff className="h-10 w-10 text-muted-foreground" />
              <h3 className="text-sm font-semibold">
                {upcomingOnly ? "No leave coming up" : "No leave recorded"}
              </h3>
              <p className="text-xs text-muted-foreground max-w-xs">
                Mark someone as away from Business → Calendar and it appears here.
              </p>
            </div>
          ) : (
            <table className="w-full text-xs">
              <thead className="sticky top-0 bg-card border-b border-border">
                <tr className="text-left text-muted-foreground">
                  <th className="font-medium px-3 py-2">Who</th>
                  <th className="font-medium px-3 py-2">When</th>
                  <th className="font-medium px-3 py-2">Type</th>
                  <th className="font-medium px-3 py-2 text-right">Working days</th>
                  <th className="font-medium px-3 py-2">Note</th>
                  <th className="w-10" />
                </tr>
              </thead>
              <tbody>
                {rows.map(row => {
                  const type = typeOf(row.leaveType);
                  return (
                    <tr key={row.id} className="border-b border-border/50" data-testid={`leave-row-${row.id}`}>
                      <td className="px-3 py-2 font-medium">{row.userName}</td>
                      <td className="px-3 py-2 tabular-nums">{formatRange(row)}</td>
                      <td className="px-3 py-2">
                        <Badge
                          variant="outline"
                          className="text-2xs font-normal"
                          style={type?.color ? { borderColor: `${type.color}66`, color: type.color } : undefined}
                        >
                          {type?.name ?? row.leaveType}
                        </Badge>
                      </td>
                      <td className="px-3 py-2 text-right tabular-nums">{workingDays(row)}</td>
                      <td className="px-3 py-2 text-muted-foreground truncate max-w-[16rem]">{row.note}</td>
                      <td className="px-2 py-2">
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-6 w-6 text-muted-foreground hover:text-destructive"
                          onClick={() => deleteMutation.mutate(row.id)}
                          data-testid={`button-delete-leave-${row.id}`}
                          aria-label="Remove this leave"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </div>
  );
}
