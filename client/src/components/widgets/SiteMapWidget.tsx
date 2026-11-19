import { useEffect, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { ExternalLink, Loader2, MapPin, Navigation } from "lucide-react";
import type { WidgetProps } from "@/types/widgets";
import { useProject } from "@/contexts/ProjectContext";
import { Button } from "@/components/ui/button";
import { WidgetSkeleton } from "@/components/ui/WidgetSkeleton";
import {
  geocodeAndSaveProject,
  mapsDirectionsUrl,
  mapsSearchUrl,
  pinIcon,
  siteLocationKey,
  useMapsConfig,
  type SiteLocation,
} from "@/lib/googleMaps";
import { MapCanvas, MapLoadError, MapNotSetUp, useGoogleMap } from "@/components/maps/useGoogleMap";

/** Project overview widget: the job site on Google Maps, with links out. */
export default function SiteMapWidget({ onSetTitleAction }: WidgetProps) {
  const { currentProject } = useProject();
  const [, setLocation] = useLocation();
  const projectId = currentProject?.id;
  const config = useMapsConfig();
  const apiKey = config.data?.apiKey ?? null;
  const locQ = useQuery<SiteLocation>({ queryKey: siteLocationKey(projectId ?? ""), enabled: !!projectId });
  const loc = locQ.data;
  const hasPoint = loc?.latitude != null && loc?.longitude != null;
  const { ref, maps, map, error } = useGoogleMap(apiKey && hasPoint ? apiKey : null, { zoom: 16 });
  const markerRef = useRef<any>(null);
  const [finding, setFinding] = useState(false);
  const [notFound, setNotFound] = useState(false);

  useEffect(() => {
    if (!projectId) return onSetTitleAction?.(null);
    onSetTitleAction?.({ label: "Edit site location", onClick: () => setLocation(`/projects/${projectId}/settings`) });
    return () => onSetTitleAction?.(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [projectId]);

  useEffect(() => {
    if (!maps || !map || !hasPoint) return;
    const pos = { lat: loc!.latitude!, lng: loc!.longitude! };
    if (markerRef.current && markerRef.current.getMap() !== map) {
      markerRef.current.setMap(null);
      markerRef.current = null;
    }
    if (!markerRef.current) {
      markerRef.current = new maps.Marker({ map, position: pos, icon: pinIcon(maps, currentProject?.color), title: currentProject?.name });
    } else {
      markerRef.current.setPosition(pos);
    }
    map.setCenter(pos);
  }, [maps, map, hasPoint, loc?.latitude, loc?.longitude, currentProject?.color, currentProject?.name]);

  if (!projectId || config.isLoading || locQ.isLoading) return <WidgetSkeleton />;

  const address = loc?.address || currentProject?.location || "";

  const findIt = async () => {
    if (!apiKey || !address) return;
    setFinding(true);
    setNotFound(false);
    try {
      const r = await geocodeAndSaveProject(apiKey, projectId, address);
      if (r === "not-found") setNotFound(true);
    } catch {
      setNotFound(true);
    } finally {
      setFinding(false);
    }
  };

  let body: React.ReactNode;
  if (!apiKey) body = <MapNotSetUp className="flex-1" />;
  else if (!hasPoint) {
    body = (
      <div className="flex flex-1 flex-col items-center justify-center gap-2 rounded-md border border-dashed bg-muted/40 p-4 text-center">
        <MapPin className="h-5 w-5 text-muted-foreground" />
        <p className="text-xs text-muted-foreground">
          {notFound
            ? "Couldn't find that address. Drop a pin in Project Settings."
            : address
              ? "No site location yet."
              : "Add the project address in Project Settings to show the site."}
        </p>
        {address && (
          <Button size="sm" variant="outline" onClick={findIt} disabled={finding} data-testid="button-find-site">
            {finding && <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" />}
            Find on map
          </Button>
        )}
      </div>
    );
  } else if (error) body = <MapLoadError message={error} className="flex-1" />;
  else body = <MapCanvas mapRef={ref} ready={!!map} className="flex-1 min-h-[160px]" />;

  return (
    <div className="flex h-full min-h-0 flex-col gap-2" data-testid="widget-site-map">
      {body}
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="min-w-0 truncate text-xs text-muted-foreground" title={address}>
          {address || "No address"}
        </p>
        {hasPoint && (
          <div className="flex shrink-0 gap-1">
            <Button asChild size="sm" variant="ghost" className="h-7 px-2 text-xs">
              <a href={mapsSearchUrl(loc!.latitude!, loc!.longitude!)} target="_blank" rel="noreferrer" data-testid="link-open-in-maps">
                <ExternalLink className="h-3.5 w-3.5 mr-1" />
                Open in Google Maps
              </a>
            </Button>
            <Button asChild size="sm" variant="ghost" className="h-7 px-2 text-xs">
              <a href={mapsDirectionsUrl(loc!.latitude!, loc!.longitude!)} target="_blank" rel="noreferrer" data-testid="link-directions">
                <Navigation className="h-3.5 w-3.5 mr-1" />
                Directions
              </a>
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}
