import { useEffect, useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { Loader2, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
import type { Asset, AssetBooking } from "@shared/schema";
import { todayKey } from "@shared/assets";
import { errorText, money, shortDate } from "./assetsShared";

export interface RechargeResponse {
  from: string;
  dayRateCents: number | null;
  totalCents: number;
  days: number;
  byProject: { projectId: string; projectName: string; days: number; bookedDays: number; cents: number }[];
}

export const rechargesKey = (id: string) => ["/api/assets", id, "recharges"] as const;
const bookingsKey = (id: string) => ["/api/assets", id, "bookings"] as const;

/**
 * A charge-out asset's jobs: what each was charged over the last 12 months at
 * the day rate (from bookings and the driver's approved timesheets), and the
 * bookings themselves. Sits inside the Costs card.
 */
export function ChargeOutJobs({ asset, data, canEdit }: { asset: Asset; data: RechargeResponse; canEdit: boolean }) {
  const { toast } = useToast();
  const { data: bookings = [] } = useQuery<(AssetBooking & { projectName: string })[]>({ queryKey: bookingsKey(asset.id) });

  const removeBooking = useMutation({
    mutationFn: (bookingId: string) => apiRequest(`/api/assets/${asset.id}/bookings/${bookingId}`, "DELETE"),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: bookingsKey(asset.id) });
      queryClient.invalidateQueries({ queryKey: rechargesKey(asset.id) });
    },
    onError: (err) => toast({ title: errorText(err, "Couldn't remove the booking"), variant: "destructive" }),
  });

  const today = todayKey();
  const upcoming = bookings.filter((b) => b.toDate >= today);
  const past = bookings.filter((b) => b.toDate < today).slice(0, 5);

  if (data.byProject.length === 0 && upcoming.length === 0 && past.length === 0) {
    return (
      <p className="px-3 py-3 text-xs text-muted-foreground text-center">
        {asset.dayRateCents
          ? "Not charged to a job in the last 12 months. Book it to a job, or it charges the jobs its driver logs hours on."
          : "Set a day rate under Edit to start charging it to jobs."}
      </p>
    );
  }

  return (
    <div className="flex flex-col">
      {data.byProject.length > 0 && (
        <ul className="divide-y divide-border">
          {data.byProject.map((p) => (
            <li key={p.projectId} className="flex items-center gap-3 px-3 py-1.5" data-testid={`row-recharge-${p.projectId}`}>
              <div className="flex-1 min-w-0">
                <a href={`/projects/${p.projectId}`} className="text-xs font-medium truncate hover:underline">{p.projectName}</a>
                <div className="text-[11px] text-muted-foreground">
                  {p.days} day{p.days === 1 ? "" : "s"}{p.bookedDays ? ` · ${p.bookedDays} booked` : ""}
                </div>
              </div>
              <span className="text-xs tabular-nums">{money(p.cents)}</span>
            </li>
          ))}
        </ul>
      )}
      {(upcoming.length > 0 || past.length > 0) && (
        <div className="border-t border-border px-3 py-1.5">
          <div className="text-[11px] font-medium text-muted-foreground mb-1">Bookings</div>
          <ul className="flex flex-col gap-1">
            {[...upcoming, ...past].map((b) => (
              <li key={b.id} className="flex items-center gap-2 text-xs" data-testid={`row-booking-${b.id}`}>
                <span className="tabular-nums text-muted-foreground w-36 shrink-0">
                  {shortDate(b.fromDate)}{b.toDate !== b.fromDate ? ` – ${shortDate(b.toDate)}` : ""}
                </span>
                <span className="flex-1 min-w-0 truncate">{b.projectName}{b.includeWeekends ? " · inc weekends" : ""}</span>
                {canEdit && (
                  <Button size="icon" variant="ghost" className="h-6 w-6" aria-label="Remove booking" onClick={() => removeBooking.mutate(b.id)}>
                    <Trash2 className="w-3 h-3" />
                  </Button>
                )}
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

export function BookingDialog({ asset, open, onClose }: { asset: Asset; open: boolean; onClose: () => void }) {
  const { toast } = useToast();
  const { data: projects = [] } = useQuery<{ id: string; name: string; isArchived?: boolean; isBusiness?: boolean }[]>({
    queryKey: ["/api/projects"],
    enabled: open,
  });
  const [projectId, setProjectId] = useState("");
  const [fromDate, setFromDate] = useState(todayKey());
  const [toDate, setToDate] = useState(todayKey());
  const [includeWeekends, setIncludeWeekends] = useState(false);

  useEffect(() => {
    if (!open) return;
    setProjectId("");
    setFromDate(todayKey());
    setToDate(todayKey());
    setIncludeWeekends(false);
  }, [open]);

  const save = useMutation({
    mutationFn: () => apiRequest(`/api/assets/${asset.id}/bookings`, "POST", { projectId, fromDate, toDate, includeWeekends }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: bookingsKey(asset.id) });
      queryClient.invalidateQueries({ queryKey: rechargesKey(asset.id) });
      onClose();
    },
    onError: (err) => toast({ title: errorText(err, "Couldn't book it"), variant: "destructive" }),
  });

  const live = projects.filter((p) => !p.isArchived && !p.isBusiness);

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Book {asset.name} to a job</DialogTitle>
          <DialogDescription>
            Each booked day charges the job {asset.dayRateCents ? `${money(asset.dayRateCents)}` : "the day rate"}, instead of following the driver's timesheets.
          </DialogDescription>
        </DialogHeader>
        <form
          className="flex flex-col gap-3"
          onSubmit={(e) => {
            e.preventDefault();
            if (!projectId) return toast({ title: "Pick the job", variant: "destructive" });
            if (toDate < fromDate) return toast({ title: "The booking ends before it starts", variant: "destructive" });
            save.mutate();
          }}
        >
          <div className="flex flex-col gap-1">
            <Label className="text-xs">Job</Label>
            <Select value={projectId || undefined} onValueChange={(v) => v && setProjectId(v)}>
              <SelectTrigger className="h-8 text-xs" data-testid="select-booking-project"><SelectValue placeholder="Choose a job" /></SelectTrigger>
              <SelectContent>
                {live.map((p) => <SelectItem key={p.id} value={p.id} className="text-xs">{p.name}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="flex flex-col gap-1">
              <Label className="text-xs">From</Label>
              <Input type="date" className="h-8 text-xs" value={fromDate} onChange={(e) => setFromDate(e.target.value)} />
            </div>
            <div className="flex flex-col gap-1">
              <Label className="text-xs">To</Label>
              <Input type="date" className="h-8 text-xs" value={toDate} onChange={(e) => setToDate(e.target.value)} />
            </div>
          </div>
          <label className="flex items-center gap-2 text-xs">
            <Checkbox checked={includeWeekends} onCheckedChange={(v) => setIncludeWeekends(v === true)} />
            Include weekends
          </label>
          {!asset.dayRateCents && (
            <p className="text-[11px] text-muted-foreground">This asset has no day rate yet, so the booking won't charge anything until one is set.</p>
          )}
          <DialogFooter>
            <Button type="button" variant="outline" size="sm" onClick={onClose}>Cancel</Button>
            <Button type="submit" size="sm" disabled={save.isPending} data-testid="button-save-booking">
              {save.isPending && <Loader2 className="w-3.5 h-3.5 mr-1 animate-spin" />}
              Book
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

