import { useEffect, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Crosshair, Loader2, MapPin } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { formatDistanceToNow } from "date-fns";
import {
  SOURCE_LABEL,
  geocodeAndSaveProject,
  pinIcon,
  putSiteLocation,
  siteLocationKey,
  useMapsConfig,
  mapsSearchUrl,
  type SiteLocation,
} from "@/lib/googleMaps";
import { MapCanvas, MapLoadError, MapNotSetUp, useGoogleMap } from "./useGoogleMap";

const RADIUS_MIN = 20;
const RADIUS_MAX = 5000;

/**
 * "Site location" block under the address in Project Settings.
 *  - drag the pin (or click the map) → source 'pin'
 *  - "Use address" → geocode the saved address, replacing any pin
 *  - radius for the future "arriving on site" geofence
 */
export function SiteLocationEditor({
  projectId,
  address,
  color,
}: {
  projectId: string;
  address: string | null | undefined;
  color?: string | null;
}) {
  const { toast } = useToast();
  const config = useMapsConfig();
  const apiKey = config.data?.apiKey ?? null;
  const { data: loc } = useQuery<SiteLocation>({ queryKey: siteLocationKey(projectId) });
  const { ref, maps, map, error } = useGoogleMap(apiKey);
  const markerRef = useRef<any>(null);
  const circleRef = useRef<any>(null);
  const [busy, setBusy] = useState(false);
  const [radius, setRadius] = useState<string>("");

  useEffect(() => {
    if (loc) setRadius(String(loc.radiusM ?? 150));
  }, [loc?.radiusM]);

  const hasPoint = loc?.latitude != null && loc?.longitude != null;

  const savePin = async (lat: number, lng: number) => {
    try {
      await putSiteLocation(projectId, { latitude: lat, longitude: lng, source: "pin" });
    } catch {
      toast({ title: "Couldn't save the pin", variant: "destructive" });
    }
  };

  // Marker + radius circle, kept in sync with the saved location.
  useEffect(() => {
    if (!maps || !map) return;
    if (!hasPoint) {
      markerRef.current?.setMap(null);
      circleRef.current?.setMap(null);
      markerRef.current = null;
      circleRef.current = null;
      return;
    }
    const pos = { lat: loc!.latitude!, lng: loc!.longitude! };
    if (markerRef.current && markerRef.current.getMap() !== map) {
      markerRef.current.setMap(null);
      circleRef.current?.setMap(null);
      markerRef.current = null;
    }
    if (!markerRef.current) {
      markerRef.current = new maps.Marker({ map, position: pos, draggable: true, icon: pinIcon(maps, color), title: "Drag to the site" });
      markerRef.current.addListener("dragend", (e: any) => savePin(e.latLng.lat(), e.latLng.lng()));
      circleRef.current = new maps.Circle({
        map,
        center: pos,
        radius: loc!.radiusM || 150,
        strokeColor: color || "#87749A",
        strokeOpacity: 0.6,
        strokeWeight: 1,
        fillColor: color || "#87749A",
        fillOpacity: 0.12,
        clickable: false,
      });
      map.setCenter(pos);
      map.setZoom(17);
    } else {
      markerRef.current.setPosition(pos);
      circleRef.current?.setCenter(pos);
      circleRef.current?.setRadius(loc!.radiusM || 150);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [maps, map, loc?.latitude, loc?.longitude, loc?.radiusM, hasPoint]);

  // With no pin yet, clicking the map drops one. Once there is a pin it only
  // moves by dragging, so a stray click while panning can't shift the site.
  useEffect(() => {
    if (!maps || !map) return;
    const l = map.addListener("click", (e: any) => {
      if (markerRef.current) return;
      savePin(e.latLng.lat(), e.latLng.lng());
    });
    return () => l.remove();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [maps, map, projectId]);

  const useAddress = async () => {
    if (!apiKey) return;
    if (!address?.trim()) {
      toast({ title: "No address to look up", description: "Add the project address first." });
      return;
    }
    setBusy(true);
    try {
      const r = await geocodeAndSaveProject(apiKey, projectId, address, true);
      if (r === "not-found") toast({ title: "Couldn't find that address", description: "Drag the pin to the site instead." });
    } catch {
      toast({ title: "Address lookup failed", description: "Check the Geocoding API is enabled on the key.", variant: "destructive" });
    } finally {
      setBusy(false);
    }
  };

  const saveRadius = async () => {
    const n = Math.round(Number(radius));
    if (!Number.isFinite(n) || n < RADIUS_MIN || n > RADIUS_MAX) {
      toast({ title: `Radius must be ${RADIUS_MIN}–${RADIUS_MAX} m` });
      setRadius(String(loc?.radiusM ?? 150));
      return;
    }
    if (n === loc?.radiusM) return;
    try {
      await putSiteLocation(projectId, { radiusM: n });
    } catch {
      toast({ title: "Couldn't save the radius", variant: "destructive" });
    }
  };

  return (
    <div className="space-y-2" data-testid="site-location-editor">
      <div className="flex items-center justify-between gap-2">
        <Label>
          <Crosshair className="h-3 w-3 inline mr-1" />
          Site location
        </Label>
        {apiKey && (
          <Button type="button" variant="outline" size="sm" onClick={useAddress} disabled={busy} data-testid="button-use-address">
            {busy ? <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" /> : <MapPin className="h-3.5 w-3.5 mr-1.5" />}
            Use address
          </Button>
        )}
      </div>

      {config.isLoading ? null : !apiKey ? (
        <MapNotSetUp className="h-[220px]" />
      ) : error ? (
        <MapLoadError message={error} className="h-[220px]" />
      ) : (
        <MapCanvas mapRef={ref} ready={!!map} className="h-[260px]" />
      )}

      <div className="flex flex-wrap items-end gap-x-6 gap-y-2 text-xs text-muted-foreground">
        <div className="space-y-1">
          <Label htmlFor="site-radius" className="text-xs">On-site radius (m)</Label>
          <Input
            id="site-radius"
            type="number"
            min={RADIUS_MIN}
            max={RADIUS_MAX}
            step={10}
            className="h-8 w-28"
            value={radius}
            onChange={(e) => setRadius(e.target.value)}
            onBlur={saveRadius}
            onKeyDown={(e) => e.key === "Enter" && (e.currentTarget as HTMLInputElement).blur()}
            data-testid="input-site-radius"
          />
        </div>
        <div className="pb-1.5" data-testid="text-site-location-meta">
          {hasPoint ? (
            <>
              {SOURCE_LABEL[loc!.source ?? ""] ?? "Set"}
              {loc!.setByName ? ` by ${loc!.setByName}` : ""}
              {loc!.setAt ? ` · ${formatDistanceToNow(new Date(loc!.setAt), { addSuffix: true })}` : ""}
              {" · "}
              <a className="underline hover:text-foreground" href={mapsSearchUrl(loc!.latitude!, loc!.longitude!)} target="_blank" rel="noreferrer">
                {loc!.latitude!.toFixed(5)}, {loc!.longitude!.toFixed(5)}
              </a>
            </>
          ) : apiKey ? (
            "No location yet — press Use address, or click the map to drop a pin."
          ) : (
            "No location yet."
          )}
        </div>
      </div>
    </div>
  );
}
