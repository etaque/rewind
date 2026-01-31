import { useRef, useMemo } from "react";
import { Marker, Polyline } from "react-leaflet";
import L from "leaflet";
import { LngLat } from "../../models";

const waypointIcon = L.divIcon({
  className: "",
  html: '<div style="width:10px;height:10px;border-radius:50%;background:#f97316;border:2px solid white;"></div>',
  iconSize: [10, 10],
  iconAnchor: [5, 5],
});

const waypointIconSelected = L.divIcon({
  className: "",
  html: '<div style="width:14px;height:14px;border-radius:50%;background:#f97316;border:2px solid white;box-shadow:0 0 0 3px rgba(250,204,21,0.8);"></div>',
  iconSize: [14, 14],
  iconAnchor: [7, 7],
});

type Props = {
  legIndex: number;
  startPoint: LngLat;
  endPoint: LngLat;
  waypoints: LngLat[];
  curvePositions?: L.LatLngExpression[][];
  onWaypointDrag: (waypointIndex: number, lat: number, lng: number) => void;
  onAddWaypoint: (waypointIndex: number, lat: number, lng: number) => void;
  onRemoveWaypoint: (waypointIndex: number) => void;
  onWaypointClick?: (waypointIndex: number) => void;
  selectedWaypointIndex?: number;
};

export default function WaypointPolyline({
  legIndex,
  startPoint,
  endPoint,
  waypoints,
  curvePositions,
  onWaypointDrag,
  onAddWaypoint,
  onRemoveWaypoint,
  onWaypointClick,
  selectedWaypointIndex,
}: Props) {
  // Build full path: start → waypoints → end
  const allPoints: LngLat[] = [startPoint, ...waypoints, endPoint];
  const positions: L.LatLngExpression[] = allPoints.map((p) => [p.lat, p.lng]);

  return (
    <>
      <Polyline
        positions={curvePositions ?? [positions]}
        color="#f97316"
        weight={2}
        opacity={0.6}
        eventHandlers={{
          click: (e) => {
            // Add waypoint at click position
            const latlng = e.latlng;
            // Find which segment was clicked (between which existing points)
            let insertIdx = waypoints.length; // default: before end
            let minDist = Infinity;
            for (let i = 0; i < allPoints.length - 1; i++) {
              const a = allPoints[i];
              const b = allPoints[i + 1];
              const dist = pointToSegmentDist(
                latlng.lat,
                latlng.lng,
                a.lat,
                a.lng,
                b.lat,
                b.lng,
              );
              if (dist < minDist) {
                minDist = dist;
                // Insert index in the waypoints array (subtract 1 because allPoints[0] is start)
                insertIdx = Math.max(0, i);
              }
            }
            onAddWaypoint(insertIdx, latlng.lat, latlng.lng);
          },
        }}
      />
      {waypoints.map((wp, i) => (
        <WaypointMarker
          key={`leg-${legIndex}-wp-${i}`}
          position={wp}
          index={i}
          selected={selectedWaypointIndex === i}
          onDrag={onWaypointDrag}
          onRemove={onRemoveWaypoint}
          onClick={onWaypointClick ? () => onWaypointClick(i) : undefined}
        />
      ))}
    </>
  );
}

function WaypointMarker({
  position,
  index,
  selected,
  onDrag,
  onRemove,
  onClick,
}: {
  position: LngLat;
  index: number;
  selected?: boolean;
  onDrag: (i: number, lat: number, lng: number) => void;
  onRemove: (i: number) => void;
  onClick?: () => void;
}) {
  const markerRef = useRef<L.Marker>(null);

  const eventHandlers = useMemo(
    () => ({
      dragend() {
        const marker = markerRef.current;
        if (marker) {
          const pos = marker.getLatLng();
          onDrag(index, pos.lat, pos.lng);
        }
      },
      contextmenu(e: L.LeafletEvent) {
        const me = e as L.LeafletMouseEvent;
        me.originalEvent.preventDefault();
        onRemove(index);
      },
      click() {
        onClick?.();
      },
    }),
    [index, onDrag, onRemove, onClick],
  );

  return (
    <Marker
      ref={markerRef}
      position={[position.lat, position.lng]}
      icon={selected ? waypointIconSelected : waypointIcon}
      draggable
      eventHandlers={eventHandlers}
    />
  );
}

function pointToSegmentDist(
  px: number,
  py: number,
  ax: number,
  ay: number,
  bx: number,
  by: number,
): number {
  const dx = bx - ax;
  const dy = by - ay;
  const lenSq = dx * dx + dy * dy;
  if (lenSq === 0) {
    const ex = px - ax;
    const ey = py - ay;
    return Math.sqrt(ex * ex + ey * ey);
  }
  let t = ((px - ax) * dx + (py - ay) * dy) / lenSq;
  t = Math.max(0, Math.min(1, t));
  const cx = ax + t * dx;
  const cy = ay + t * dy;
  const ex = px - cx;
  const ey = py - cy;
  return Math.sqrt(ex * ex + ey * ey);
}
