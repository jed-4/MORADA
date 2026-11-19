import { useEffect, useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { Loader2, Save } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
import type { CompanySettings } from "@shared/schema";

/**
 * Company switches for "Arriving on site" (#46, migration 0136).
 *
 * The phone offers a "clock in?" notification when someone arrives at a job
 * site. It never clocks anyone in by itself. Each person also has to switch
 * it on on their own phone.
 */
export function ArrivingOnSiteSettings() {
  const { toast } = useToast();
  const { data: settings } = useQuery<CompanySettings>({ queryKey: ["/api/company-settings"] });

  const [enabled, setEnabled] = useState(false);
  const [storeVisits, setStoreVisits] = useState(true);
  const [hoursStart, setHoursStart] = useState("05:00");
  const [hoursEnd, setHoursEnd] = useState("19:00");
  const [weekends, setWeekends] = useState(false);

  useEffect(() => {
    if (!settings) return;
    setEnabled(settings.geofenceEnabled ?? false);
    setStoreVisits(settings.geofenceStoreVisits ?? true);
    setHoursStart(settings.geofenceHoursStart || "05:00");
    setHoursEnd(settings.geofenceHoursEnd || "19:00");
    setWeekends(settings.geofenceWeekends ?? false);
  }, [settings]);

  const save = useMutation({
    mutationFn: () =>
      apiRequest("/api/company-settings", "PATCH", {
        geofenceEnabled: enabled,
        geofenceStoreVisits: storeVisits,
        geofenceHoursStart: hoursStart,
        geofenceHoursEnd: hoursEnd,
        geofenceWeekends: weekends,
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/company-settings"] });
      toast({ title: "Arriving on site settings saved" });
    },
    onError: (e: any) => toast({ title: "Couldn't save", description: e?.message, variant: "destructive" }),
  });

  return (
    <div className="space-y-6">
      <Card className="border-2">
        <CardHeader className="pb-4">
          <CardTitle className="text-base font-semibold">Arriving on site</CardTitle>
          <p className="text-sm text-muted-foreground">
            When someone arrives at a job site, their phone asks "You're at 12 Smith St — clock in?". It never
            clocks anyone in by itself, and each person switches it on on their own phone.
          </p>
        </CardHeader>
        <CardContent className="space-y-5">
          <div className="flex items-center justify-between gap-4">
            <div>
              <Label className="text-sm font-medium">Turn on for this company</Label>
              <p className="text-table text-muted-foreground">
                Construction jobs with a site location set (Project Settings → Site location) are watched.
              </p>
            </div>
            <Switch checked={enabled} onCheckedChange={setEnabled} data-testid="geofence-enabled" />
          </div>

          {enabled && (
            <>
              <div className="flex items-center justify-between gap-4">
                <div>
                  <Label className="text-sm font-medium">Keep a site sign-in register</Label>
                  <p className="text-table text-muted-foreground">
                    Records who arrived at and left which job site, and when — never a trail of where they went.
                    Seen only by the person and by timesheet approvers, next to the timesheet. Kept for 12 months.
                    Turn off to send the prompts only and store nothing.
                  </p>
                </div>
                <Switch checked={storeVisits} onCheckedChange={setStoreVisits} data-testid="geofence-store-visits" />
              </div>

              <div>
                <Label className="text-sm font-medium">Prompt only between</Label>
                <div className="flex items-center gap-2 mt-1.5 max-w-sm">
                  <Input type="time" step="900" value={hoursStart} onChange={(e) => setHoursStart(e.target.value)} data-testid="geofence-hours-start" />
                  <span className="text-sm text-muted-foreground">and</span>
                  <Input type="time" step="900" value={hoursEnd} onChange={(e) => setHoursEnd(e.target.value)} data-testid="geofence-hours-end" />
                </div>
                <p className="text-table text-muted-foreground mt-1">At most one prompt per site per day.</p>
              </div>

              <div className="flex items-center justify-between gap-4">
                <Label className="text-sm font-medium">Prompt on weekends too</Label>
                <Switch checked={weekends} onCheckedChange={setWeekends} data-testid="geofence-weekends" />
              </div>

              <p className="text-table text-muted-foreground border-t pt-4">
                Before switching this on, give your team written notice that the app records site arrivals and
                departures. In NSW the Workplace Surveillance Act asks for 14 days' notice for tracking — check what
                applies to you.
              </p>
            </>
          )}
        </CardContent>
      </Card>

      <div className="flex justify-end">
        <Button onClick={() => save.mutate()} disabled={save.isPending} data-testid="geofence-settings-save">
          {save.isPending ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Save className="h-4 w-4 mr-2" />}
          {save.isPending ? "Saving..." : "Save"}
        </Button>
      </div>
    </div>
  );
}
