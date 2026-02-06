import { useState, useEffect, useMemo } from "react";
import { MapContainer, TileLayer, Polyline, useMap } from "react-leaflet";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import { fetchReplayPath, type PathPoint } from "../../replay-path";

const serverUrl = import.meta.env.REWIND_SERVER_URL;

/**
 * Split a [lat, lng] polyline at antimeridian crossings so Leaflet
 * never draws a map-spanning line from 178° to -178°.
 */
function splitAtAntimeridian(
  coords: L.LatLngExpression[],
): L.LatLngExpression[][] {
  if (coords.length < 2) return [coords];

  const segments: L.LatLngExpression[][] = [];
  let current: L.LatLngExpression[] = [coords[0]];

  for (let i = 1; i < coords.length; i++) {
    const [lat1, lng1] = coords[i - 1] as [number, number];
    const [lat2, lng2] = coords[i] as [number, number];
    const dLng = lng2 - lng1;

    if (dLng > 180 || dLng < -180) {
      const lng2Unwrapped = dLng > 180 ? lng2 - 360 : lng2 + 360;
      const crossLng = dLng > 180 ? -180 : 180;
      const t = (crossLng - lng1) / (lng2Unwrapped - lng1);
      const crossLat = lat1 + t * (lat2 - lat1);

      current.push([crossLat, crossLng] as L.LatLngExpression);
      segments.push(current);
      current = [[crossLat, -crossLng] as L.LatLngExpression];
    }

    current.push(coords[i]);
  }

  segments.push(current);
  if (segments.length === 1) return segments;

  const result: L.LatLngExpression[][] = [];
  for (const seg of segments) {
    result.push(seg);
    result.push(
      seg.map((p) => {
        const [lat, lng] = p as [number, number];
        return [lat, lng + 360] as L.LatLngExpression;
      }),
    );
    result.push(
      seg.map((p) => {
        const [lat, lng] = p as [number, number];
        return [lat, lng - 360] as L.LatLngExpression;
      }),
    );
  }
  return result;
}

type Props = {
  resultId: number;
};

export default function ResultTraceMap({ resultId }: Props) {
  const [points, setPoints] = useState<PathPoint[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setPoints(null);
    setError(null);

    (async () => {
      try {
        const res = await fetch(`${serverUrl}/replay/${resultId}`);
        if (!res.ok) throw new Error("Failed to fetch replay");
        const { pathUrl } = await res.json();
        const path = await fetchReplayPath(pathUrl);
        setPoints(path);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to load trace");
      }
    })();
  }, [resultId]);

  const { segments, bounds } = useMemo(() => {
    if (!points || points.length === 0) return { segments: [], bounds: null };

    const coords: L.LatLngExpression[] = points.map(
      (p) => [p.lat, p.lng] as L.LatLngExpression,
    );
    const segs = splitAtAntimeridian(coords);
    const b = L.latLngBounds(coords.map((c) => L.latLng(c as [number, number])));
    return { segments: segs, bounds: b };
  }, [points]);

  if (error) {
    return (
      <div className="h-full flex items-center justify-center text-red-400 text-sm">
        {error}
      </div>
    );
  }

  if (!points) {
    return (
      <div className="h-full flex items-center justify-center text-slate-400 text-sm">
        <span className="w-4 h-4 border-2 border-slate-500 border-t-blue-400 rounded-full animate-spin mr-2" />
        Loading trace...
      </div>
    );
  }

  return (
    <MapContainer
      center={bounds ? bounds.getCenter() : [0, 0]}
      zoom={3}
      className="h-full w-full"
      worldCopyJump
    >
      <TileLayer
        attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
        url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
      />
      {bounds && <FitBounds bounds={bounds} />}
      {segments.map((seg, i) => (
        <Polyline
          key={i}
          positions={seg}
          pathOptions={{ color: "#3b82f6", weight: 2 }}
        />
      ))}
    </MapContainer>
  );
}

function FitBounds({ bounds }: { bounds: L.LatLngBounds }) {
  const map = useMap();
  useEffect(() => {
    map.fitBounds(bounds, { padding: [20, 20] });
  }, [bounds, map]);
  return null;
}
