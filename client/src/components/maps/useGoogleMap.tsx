import { useEffect, useRef, useState } from "react";
import { MapPin, Loader2, AlertTriangle } from "lucide-react";
import { cn } from "@/lib/utils";
import { loadGoogleMaps, type GoogleMapsNs } from "@/lib/googleMaps";

/** Default view when a map has nothing to show yet: roughly Australia. */
export const AU_CENTER = { lat: -27.5, lng: 134 };

/**
 * Create a google.maps.Map in `ref` once the API has loaded AND the container
 * is mounted (widgets often render a skeleton/empty state first). If the
 * container is remounted, a fresh map is made for the new node. Returns the
 * namespace and the map (both null until ready) and any load error.
 */
export function useGoogleMap(apiKey: string | null | undefined, options?: Record<string, unknown>) {
  const ref = useRef<HTMLDivElement | null>(null);
  const [maps, setMaps] = useState<GoogleMapsNs | null>(null);
  const [map, setMap] = useState<any>(null);
  const [error, setError] = useState<string | null>(null);
  const optionsRef = useRef(options);

  useEffect(() => {
    if (!apiKey) return;
    let cancelled = false;
    loadGoogleMaps(apiKey)
      .then((ns) => !cancelled && setMaps(ns))
      .catch((e: Error) => !cancelled && setError(e.message));
    return () => {
      cancelled = true;
    };
  }, [apiKey]);

  // Runs after every render: cheap check, creates the map when both exist.
  useEffect(() => {
    if (!maps) return;
    const node = ref.current;
    if (!node) {
      if (map) setMap(null);
      return;
    }
    if (map && map.getDiv() === node) return;
    setMap(
      new maps.Map(node, {
        center: AU_CENTER,
        zoom: 4,
        mapTypeControl: false,
        streetViewControl: false,
        fullscreenControl: true,
        clickableIcons: false,
        gestureHandling: "cooperative",
        ...optionsRef.current,
      }),
    );
  });

  return { ref, maps, map, error };
}

/** Shown wherever a map would be when no GOOGLE_MAPS_API_KEY is configured. */
export function MapNotSetUp({ className }: { className?: string }) {
  return (
    <div
      data-testid="map-not-set-up"
      className={cn(
        "flex h-full min-h-[140px] flex-col items-center justify-center gap-1.5 rounded-md border border-dashed bg-muted/40 p-4 text-center",
        className,
      )}
    >
      <MapPin className="h-5 w-5 text-muted-foreground" />
      <p className="text-sm font-medium">Map not set up yet</p>
      <p className="text-xs text-muted-foreground">
        Add a Google Maps key in settings (GOOGLE_MAPS_API_KEY) to show maps here.
      </p>
    </div>
  );
}

export function MapLoadError({ message, className }: { message: string; className?: string }) {
  return (
    <div className={cn("flex h-full min-h-[140px] flex-col items-center justify-center gap-1.5 rounded-md border bg-muted/40 p-4 text-center", className)}>
      <AlertTriangle className="h-5 w-5 text-muted-foreground" />
      <p className="text-xs text-muted-foreground">{message}</p>
    </div>
  );
}

/** The map canvas, with a spinner over it until the API is ready. */
export function MapCanvas({
  mapRef,
  ready,
  className,
}: {
  mapRef: React.MutableRefObject<HTMLDivElement | null>;
  ready: boolean;
  className?: string;
}) {
  return (
    <div className={cn("relative overflow-hidden rounded-md border", className)}>
      <div ref={mapRef} className="absolute inset-0" />
      {!ready && (
        <div className="absolute inset-0 flex items-center justify-center bg-muted/40">
          <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
        </div>
      )}
    </div>
  );
}
