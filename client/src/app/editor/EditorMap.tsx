import { useRef, useMemo, useCallback, useEffect } from "react";
import { MapContainer, TileLayer, Marker, Tooltip, useMap } from "react-leaflet";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import { Course, LngLat } from "../../models";
import GateMarker from "./GateMarker";
import ExclusionZonePolygon from "./ExclusionZonePolygon";
import WaypointPolyline from "./WaypointPolyline";
import { catmullRomSplineGeo } from "../../catmull-rom";
import type { FocusTarget } from "./CourseForm";

export type MapSelection =
  | { type: "gate"; index: number }
  | { type: "finish" }
  | { type: "waypoint"; legIndex: number; waypointIndex: number };

const startIcon = L.divIcon({
  className: "",
  html: '<div style="width:16px;height:16px;border-radius:50%;background:#22c55e;border:2px solid white;"></div>',
  iconSize: [16, 16],
  iconAnchor: [8, 8],
});

type Props = {
  course: Course;
  onChange: (course: Course) => void;
  onSelect?: (selection: MapSelection) => void;
  focusTarget?: FocusTarget;
};

function MapCenter({ lat, lng }: { lat: number; lng: number }) {
  const map = useMap();
  const hasFlown = useRef(false);

  useEffect(() => {
    if (!hasFlown.current) {
      map.setView([lat, lng], 5);
      hasFlown.current = true;
    }
  }, [lat, lng, map]);

  return null;
}

function MapFocus({ position, focusKey }: { position: LngLat | null; focusKey: number | null }) {
  const map = useMap();
  const prevKey = useRef<number | null>(null);

  useEffect(() => {
    if (!position || focusKey === null || focusKey === prevKey.current) return;
    prevKey.current = focusKey;
    map.panTo([position.lat, position.lng]);
  }, [position, focusKey, map]);

  return null;
}

export default function EditorMap({ course, onChange, onSelect, focusTarget }: Props) {
  const startMarkerRef = useRef<L.Marker>(null);

  const update = useCallback(
    (partial: Partial<Course>) => {
      onChange({ ...course, ...partial });
    },
    [course, onChange],
  );

  const onStartDrag = useMemo(
    () => ({
      dragend() {
        const marker = startMarkerRef.current;
        if (marker) {
          const pos = marker.getLatLng();
          update({ start: { lat: pos.lat, lng: pos.lng } });
        }
      },
    }),
    [update],
  );

  const onFinishDrag = useCallback(
    (lat: number, lng: number) => {
      update({
        finishLine: {
          ...course.finishLine,
          center: { lat, lng },
        },
      });
    },
    [course.finishLine, update],
  );

  const onGateDrag = useCallback(
    (gateIndex: number) => (lat: number, lng: number) => {
      const gates = [...course.gates];
      gates[gateIndex] = {
        ...gates[gateIndex],
        center: { lat, lng },
      };
      update({ gates });
    },
    [course.gates, update],
  );

  const onWaypointDrag = useCallback(
    (legIndex: number) =>
      (waypointIndex: number, lat: number, lng: number) => {
        const routeWaypoints = course.routeWaypoints.map((leg) => [...leg]);
        routeWaypoints[legIndex][waypointIndex] = { lat, lng };
        update({ routeWaypoints });
      },
    [course.routeWaypoints, update],
  );

  const onAddWaypoint = useCallback(
    (legIndex: number) =>
      (insertIndex: number, lat: number, lng: number) => {
        const routeWaypoints = course.routeWaypoints.map((leg) => [...leg]);
        routeWaypoints[legIndex].splice(insertIndex, 0, { lat, lng });
        update({ routeWaypoints });
      },
    [course.routeWaypoints, update],
  );

  const onRemoveWaypoint = useCallback(
    (legIndex: number) => (waypointIndex: number) => {
      const routeWaypoints = course.routeWaypoints.map((leg) => [...leg]);
      routeWaypoints[legIndex].splice(waypointIndex, 1);
      update({ routeWaypoints });
    },
    [course.routeWaypoints, update],
  );

  // Build leg endpoints and spline curves
  const SPLINE_SEGMENTS = 20;

  const legEndpoints = useMemo(() => {
    const points: LngLat[] = [
      course.start,
      ...course.gates.map((g) => g.center),
      course.finishLine.center,
    ];
    const legs: { start: LngLat; end: LngLat }[] = [];
    for (let i = 0; i < points.length - 1; i++) {
      legs.push({ start: points[i], end: points[i + 1] });
    }
    return legs;
  }, [course.start, course.gates, course.finishLine.center]);

  const legCurves = useMemo(() => {
    const legPoints: LngLat[] = [
      course.start,
      ...course.gates.map((g) => g.center),
      course.finishLine.center,
    ];

    // Build one continuous path with all waypoints, tracking leg boundaries
    const allCoords: [number, number][] = [[course.start.lng, course.start.lat]];
    const legBoundaries: number[] = [0];

    for (let legIndex = 0; legIndex < legPoints.length - 1; legIndex++) {
      const waypoints = course.routeWaypoints[legIndex] ?? [];
      for (const wp of waypoints) {
        allCoords.push([wp.lng, wp.lat]);
      }
      const to = legPoints[legIndex + 1];
      allCoords.push([to.lng, to.lat]);
      legBoundaries.push(allCoords.length - 1);
    }

    const useSpline = allCoords.length >= 3;
    const splined = useSpline
      ? catmullRomSplineGeo(allCoords, SPLINE_SEGMENTS)
      : allCoords;
    const factor = useSpline ? SPLINE_SEGMENTS : 1;

    // Slice splined result into per-leg curves as [lat, lng] for Leaflet
    const curves: L.LatLngExpression[][] = [];
    for (let i = 0; i < legBoundaries.length - 1; i++) {
      const fromIdx = legBoundaries[i] * factor;
      const toIdx = legBoundaries[i + 1] * factor;
      const legCoords = splined.slice(fromIdx, toIdx + 1);
      curves.push(legCoords.map(([lng, lat]) => [lat, lng] as L.LatLngExpression));
    }
    return curves;
  }, [course.start, course.gates, course.finishLine.center, course.routeWaypoints]);

  // Resolve focus target to a position and selection identity
  const focusPosition = useMemo((): LngLat | null => {
    if (!focusTarget) return null;
    const { selection } = focusTarget;
    if (selection.type === "gate") {
      return course.gates[selection.index]?.center ?? null;
    } else if (selection.type === "waypoint") {
      return course.routeWaypoints[selection.legIndex]?.[selection.waypointIndex] ?? null;
    } else {
      return course.finishLine.center;
    }
  }, [focusTarget, course.gates, course.routeWaypoints, course.finishLine.center]);

  const selection = focusTarget?.selection ?? null;

  return (
    <MapContainer
      center={[course.start.lat, course.start.lng]}
      zoom={5}
      className="h-full w-full"
      worldCopyJump
    >
      <TileLayer
        attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
        url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
      />
      <MapCenter lat={course.start.lat} lng={course.start.lng} />
      <MapFocus position={focusPosition} focusKey={focusTarget?.key ?? null} />

      {/* Start marker */}
      <Marker
        ref={startMarkerRef}
        position={[course.start.lat, course.start.lng]}
        icon={startIcon}
        draggable
        eventHandlers={onStartDrag}
      >
        <Tooltip direction="top" offset={[0, -10]}>
          Start
        </Tooltip>
      </Marker>

      {/* Finish line */}
      <GateMarker
        gate={course.finishLine}
        color="#ef4444"
        label="Finish"
        onDrag={onFinishDrag}
        onClick={() => onSelect?.({ type: "finish" })}
        selected={selection?.type === "finish"}
      />

      {/* Gates */}
      {course.gates.map((gate, i) => (
        <GateMarker
          key={`gate-${i}`}
          gate={gate}
          color="#3b82f6"
          label={`Gate ${i + 1}`}
          onDrag={onGateDrag(i)}
          onClick={() => onSelect?.({ type: "gate", index: i })}
          selected={selection?.type === "gate" && selection.index === i}
        />
      ))}

      {/* Exclusion zones */}
      {course.exclusionZones.map((zone, i) => (
        <ExclusionZonePolygon
          key={`zone-${i}`}
          zone={zone}
          index={i}
        />
      ))}

      {/* Route waypoints */}
      {legEndpoints.map((leg, i) => (
        <WaypointPolyline
          key={`leg-${i}`}
          legIndex={i}
          startPoint={leg.start}
          endPoint={leg.end}
          waypoints={course.routeWaypoints[i] || []}
          curvePositions={legCurves[i]}
          onWaypointDrag={onWaypointDrag(i)}
          onAddWaypoint={onAddWaypoint(i)}
          onRemoveWaypoint={onRemoveWaypoint(i)}
          onWaypointClick={(waypointIndex: number) =>
            onSelect?.({ type: "waypoint", legIndex: i, waypointIndex })
          }
          selectedWaypointIndex={
            selection?.type === "waypoint" && selection.legIndex === i
              ? selection.waypointIndex
              : undefined
          }
        />
      ))}
    </MapContainer>
  );
}
