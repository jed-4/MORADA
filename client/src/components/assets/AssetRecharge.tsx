import { useEffect, useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { Briefcase, CalendarPlus, Loader2, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
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

interface RechargeResponse {
  from: string;
  dayRateCents: number | null;
  totalCents: number;
  days: number;
  byProject: { projectId: string; projectName: string; days: number; bookedDays: number; cents: number }[];
}

const rechargesKey = (id: string) => ["/api/assets", id, "recharges"] as const;
const bookingsKey = (id: string) => ["/api/assets", id, "bookings"] as const;
// Shared with AssetCostsSection, so recovery reads the same running-cost figure.
const costsKey = (id: string) => ["/api/assets", id, "costs"] as const;

/**
 * What this asset has charged to jobs at its day rate — from bookings and its
 * driver's approved timesheets — against what it actually cost to run.
 */
export function AssetRechargeSection({ asset, canEdit }: { asset: Asset; canEdit: boolean }) {
  const { toast } = useToast();
  const { data, isLoading } = useQuery<RechargeResponse>({ queryKey: rechargesKey(asset.id) });
  const { data: bookings = [] } = useQuery<(AssetBooking & { projectName: string })[]>({ queryKey: bookingsKey(asset.id) });
  const { data: costs } = useQuery<{ summary: { billsLast12Cents: number; loggedLast12Cents: number } }>({ queryKey: costsKey(asset.id) });
  const [booking, setBooking] = useState(false);

  const removeBooking = useMutation({
    mutationFn: (bookingId: string) => apiRequest(`/api/assets/${asset.id}/bookings/${bookingId}`, "DELETE"),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: bookingsKey(asset.id) });
      queryClient.invalidateQueries({ queryKey: rechargesKey(asset.id) });
    },
    onError: (err) => toast({ title: errorText(err, "Couldn't remove the booking"), variant: "destructive" }),
  });

  const runningLast12 = costs ? costs.summary.billsLast12Cents + costs.summary.loggedLast12Cents : null;
  const recovery = data && runningLast12 && runningLast12 > 0 ? Math.round((data.totalCents / runningLast12) * 100) : null;
  const today = todayKey();
  const upcoming = bookings.filter((b) => b.toDate >= today);
  const past = bookings.filter((b) => b.toDate < today).slice(0, 5);

  return (
    <Card className="overflow-hidden min-w-0 lg:col-span-2" data-testid="card-asset-recharge">
      <div className="flex items-center justify-between gap-3 px-4 py-3 border-b border-border">
        <div className="flex items-center gap-2 min-w-0">
          <Briefcase className="w-4 h-4 text-muted-foreground shrink-0" />
          <div className="min-w-0">
            <h3 className="text-sm font-semibold">Charged to jobs</h3>
            <p className="text-xs text-muted-foreground">
              {asset.dayRateCents
                ? `${money(asset.dayRateCents)}/day ex GST — on booked days, and days its driver has approved hours on a job.`
                : "No day rate set, so it isn't charged to jobs. Set one under Edit."}
            </p>
          </div>
        </div>
        {canEdit && (
          <Button size="sm" variant="outline" className="h-6 px-2 text-xs shrink-0" onClick={() => setBooking(true)} data-testid="button-book-asset">
            <CalendarPlus className="w-3.5 h-3.5 mr-1" />Book to job
          </Button>
        )}
      </div>

      {isLoading || !data ? (
        <div className="py-8 flex justify-center"><Loader2 className="w-5 h-5 animate-spin text-muted-foreground" /></div>
      ) : (
        <div className="grid md:grid-cols-[280px_1fr] divide-y md:divide-y-0 md:divide-x divide-border">
          <div className="px-4 py-3 flex flex-col gap-3">
            <div>
              <div className="text-[11px] text-muted-foreground">Last 12 months</div>
              <div className="text-base font-semibold tabular-nums">{money(data.totalCents)}</div>
              <div className="text-[11px] text-muted-foreground">{data.days} day{data.days === 1 ? "" : "s"} on jobs</div>
            </div>
            <div>
              <div className="text-[11px] text-muted-foreground">Recovered from jobs</div>
              <div className="text-base font-semibold tabular-nums">{recovery != null ? `${recovery}%` : "—"}</div>
              <div className="text-[11px] text-muted-foreground">
                {runningLast12 ? `of ${money(runningLast12)} running costs` : "link bills to see running costs"}
              </div>
            </div>
          </div>
          <div className="flex flex-col">
            {data.byProject.length === 0 ? (
              <p className="px-4 py-6 text-xs text-muted-foreground text-center">Nothing charged to jobs in the last 12 months.</p>
            ) : (
              <ul className="divide-y divide-border">
                {data.byProject.map((p) => (
                  <li key={p.projectId} className="flex items-center gap-3 px-4 py-2" data-testid={`row-recharge-${p.projectId}`}>
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
              <div className="border-t border-border px-4 py-2">
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
        </div>
      )}
      <BookingDialog asset={asset} open={booking} onClose={() => setBooking(false)} />
    </Card>
  );
}

function BookingDialog({ asset, open, onClose }: { asset: Asset; open: boolean; onClose: () => void }) {
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

/** Register-level settings: which cost code vehicle recharges land on. */
export function AssetRegisterSettingsButton({ canEdit }: { canEdit: boolean }) {
  const { toast } = useToast();
  const [open, setOpen] = useState(false);
  const { data: settings } = useQuery<{ rechargeCostCodeId: string | null }>({ queryKey: ["/api/asset-register/settings"] });
  const { data: costCodes = [] } = useQuery<{ id: string; code: string; title: string; isArchived?: boolean; isActive?: boolean }[]>({
    queryKey: ["/api/cost-codes"],
    enabled: open,
  });
  const [value, setValue] = useState<string>("none");
  useEffect(() => {
    if (open) setValue(settings?.rechargeCostCodeId ?? "none");
  }, [open, settings]);

  const save = useMutation({
    mutationFn: () => apiRequest("/api/asset-register/settings", "PUT", { rechargeCostCodeId: value === "none" ? null : value }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/asset-register/settings"] });
      queryClient.invalidateQueries({ queryKey: ["/api/projects"] });
      setOpen(false);
    },
    onError: (err) => toast({ title: errorText(err, "Couldn't save"), variant: "destructive" }),
  });

  if (!canEdit) return null;
  const usable = costCodes.filter((c) => c.id === value || (!c.isArchived && c.isActive !== false));

  return (
    <>
      <Button size="sm" variant="outline" className="h-6 px-2 text-xs" onClick={() => setOpen(true)} data-testid="button-asset-settings">
        Job charging
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Charging vehicles to jobs</DialogTitle>
            <DialogDescription>
              Each vehicle's day rate is charged to a job on days it's booked there, or its driver has approved hours there. It shows in the job's Budget as an internal cost, on this cost code.
            </DialogDescription>
          </DialogHeader>
          <div className="flex flex-col gap-1">
            <Label className="text-xs">Cost code</Label>
            <Select value={value} onValueChange={(v) => v && setValue(v)}>
              <SelectTrigger className="h-8 text-xs" data-testid="select-recharge-cost-code"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="none" className="text-xs">None — show as "Vehicles & plant"</SelectItem>
                {usable.map((c) => (
                  <SelectItem key={c.id} value={c.id} className="text-xs">{c.code ? `${c.code} · ` : ""}{c.title}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <p className="text-[11px] text-muted-foreground">Not cash: the real fuel and servicing are already in bills, so this stays out of the cashflow forecast.</p>
          </div>
          <DialogFooter>
            <Button variant="outline" size="sm" onClick={() => setOpen(false)}>Cancel</Button>
            <Button size="sm" onClick={() => save.mutate()} disabled={save.isPending} data-testid="button-save-asset-settings">Save</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
