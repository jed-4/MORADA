import { useEffect, useMemo, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { Loader2, MapPin } from "lucide-react";
import type { Project } from "@shared/schema";
import type { WidgetProps } from "@/types/widgets";
import { Button } from "@/components/ui/button";
import { WidgetSkeleton } from "@/components/ui/WidgetSkeleton";
import { WidgetError } from "@/components/ui/WidgetError";
import { WidgetEmpty } from "@/components/ui/WidgetEmpty";
import { useToast } from "@/hooks/use-toast";
import { geocodeAndSaveProject, pinIcon, useMapsConfig } from "@/lib/googleMaps";
import { MapCanvas, MapLoadError, MapNotSetUp, useGoogleMap } from "@/components/maps/useGoogleMap";

type ProjectRow = Project & { clientName?: string | null };

/**
 * "Live" = on the tools: construction or post-construction (defects, handover),
 * the same rule the Business Schedule uses for its live jobs.
 */
const LIVE_PHASES = new Set(["construction", "post_construction"]);
const isLive = (p: ProjectRow) => !p.isArchived && !p.isBusiness && LIVE_PHASES.has(p.currentSystemPhase ?? "");
const hasPoint = (p: ProjectRow) => p.siteLatitude != null && p.siteLongitude != null;
const jobNo = (p: ProjectRow) => p.constructionNumber || p.jobNumber || "";

/**
 * Company dashboard: every live job on one Google map, coloured by the
 * project's colour. Reads GET /api/projects, so it shows exactly the projects
 * the user can already see (company-scoped, and non-admins only see projects
 * they've been given access to).
 */
export default function BusinessJobMapWidget({ onSetTitleAction }: WidgetProps) {
  const [, navigate] = useLocation();
  const { toast } = useToast();
  const config = useMapsConfig();
  const apiKey = config.data?.apiKey ?? null;
  const projectsQ = useQuery<ProjectRow[]>({ queryKey: ["/api/projects"] });
  const { ref, maps, map, error } = useGoogleMap(apiKey);
  const markersRef = useRef<any[]>([]);
  const infoRef = useRef<any>(null);
  const [backfill, setBackfill] = useState<{ done: number; total: number } | null>(null);

  useEffect(() => {
    onSetTitleAction?.({ label: "All projects", onClick: () => navigate("/projects") });
    return () => onSetTitleAction?.(null);
  }, [onSetTitleAction, navigate]);

  const live = useMemo(() => (projectsQ.data ?? []).filter(isLive), [projectsQ.data]);
  const located = useMemo(() => live.filter(hasPoint), [live]);
  const missing = useMemo(() => live.filter((p) => !hasPoint(p)), [live]);
  const findable = useMemo(() => missing.filter((p) => p.location?.trim()), [missing]);

  // Markers: rebuilt whenever the located set changes, then fit to them.
  useEffect(() => {
    if (!maps || !map) return;
    for (const m of markersRef.current) m.setMap(null);
    markersRef.current = [];
    if (!infoRef.current) infoRef.current = new maps.InfoWindow();

    const bounds = new maps.LatLngBounds();
    for (const p of located) {
      const pos = { lat: p.siteLatitude!, lng: p.siteLongitude! };
      const marker = new maps.Marker({ map, position: pos, icon: pinIcon(maps, p.color), title: p.name });
      marker.addListener("click", () => {
        infoRef.current.setContent(infoContent(p, () => navigate(`/projects/${p.id}`)));
        infoRef.current.open({ map, anchor: marker });
      });
      markersRef.current.push(marker);
      bounds.extend(pos);
    }
    if (located.length === 0) {
      map.setCenter({ lat: -27.5, lng: 134 });
      map.setZoom(4);
    } else if (located.length === 1) {
      map.setCenter(bounds.getCenter());
      map.setZoom(14);
    } else {
      map.fitBounds(bounds, 48);
    }
  }, [maps, map, located, navigate]);

  const runBackfill = async () => {
    if (!apiKey || findable.length === 0) return;
    let saved = 0;
    let notFound = 0;
    setBackfill({ done: 0, total: findable.length });
    for (let i = 0; i < findable.length; i++) {
      const p = findable[i];
      try {
        const r = await geocodeAndSaveProject(apiKey, p.id, p.location!);
        if (r === "saved") saved++;
        if (r === "not-found") notFound++;
      } catch {
        notFound++;
      }
      setBackfill({ done: i + 1, total: findable.length });
      // Stay well under the Geocoder's client-side rate limit.
      await new Promise((r) => setTimeout(r, 150));
    }
    setBackfill(null);
    toast({
      title: `Found ${saved} of ${findable.length} job${findable.length === 1 ? "" : "s"}`,
      description: notFound ? `${notFound} address${notFound === 1 ? "" : "es"} couldn't be found — drop a pin in each project's settings.` : undefined,
    });
  };

  if (config.isLoading || projectsQ.isLoading) return <WidgetSkeleton />;
  if (projectsQ.isError) return <WidgetError onRetry={() => projectsQ.refetch()} message="Couldn't load projects." />;
  if (!apiKey) return <MapNotSetUp className="h-full" />;
  if (live.length === 0) return <WidgetEmpty icon={MapPin} message="No jobs in construction right now." />;

  const noAddress = missing.length - findable.length;

  return (
    <div className="flex h-full min-h-0 flex-col gap-2" data-testid="widget-job-map">
      {error ? (
        <MapLoadError message={error} className="flex-1" />
      ) : (
        <MapCanvas mapRef={ref} ready={!!map} className="flex-1 min-h-[220px]" />
      )}
      <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-muted-foreground">
        <span data-testid="text-job-map-counts">
          {located.length} of {live.length} live job{live.length === 1 ? "" : "s"} on the map
          {missing.length > 0 && ` · ${missing.length} without a location`}
          {noAddress > 0 && ` (${noAddress} with no address)`}
        </span>
        {findable.length > 0 && (
          <Button size="sm" variant="outline" className="h-7 text-xs" onClick={runBackfill} disabled={!!backfill} data-testid="button-backfill-locations">
            {backfill ? (
              <>
                <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" />
                Finding {backfill.done}/{backfill.total}…
              </>
            ) : (
              `Find locations for ${findable.length} job${findable.length === 1 ? "" : "s"} without one`
            )}
          </Button>
        )}
      </div>
    </div>
  );
}

/** Info-window body built with DOM nodes (textContent), never innerHTML. */
function infoContent(p: ProjectRow, open: () => void): HTMLElement {
  const root = document.createElement("div");
  root.style.cssText = "font: 13px/1.4 Inter, system-ui, sans-serif; color: #2C2825; min-width: 160px; max-width: 240px";
  const title = document.createElement("div");
  title.style.cssText = "font-weight: 600; margin-bottom: 2px";
  title.textContent = p.name;
  root.appendChild(title);
  const meta = [jobNo(p) && `Job ${jobNo(p)}`, p.clientName].filter(Boolean).join(" · ");
  if (meta) {
    const m = document.createElement("div");
    m.style.cssText = "color: #6B6561";
    m.textContent = meta;
    root.appendChild(m);
  }
  if (p.location) {
    const a = document.createElement("div");
    a.style.cssText = "color: #6B6561; margin-top: 2px";
    a.textContent = p.location;
    root.appendChild(a);
  }
  const link = document.createElement("a");
  link.href = `/projects/${p.id}`;
  link.textContent = "Open project →";
  link.style.cssText = "display: inline-block; margin-top: 6px; color: #87749A; font-weight: 500";
  link.addEventListener("click", (e) => {
    e.preventDefault();
    open();
  });
  root.appendChild(link);
  return root;
}
