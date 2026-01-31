import { useRef, useMemo } from "react";
import { Marker, Polyline, Tooltip } from "react-leaflet";
import L from "leaflet";
import { Gate } from "../../models";

// 1 nautical mile in degrees latitude (approximate)
const NM_TO_DEG = 1 / 60;

function gateEndpoints(gate: Gate): [L.LatLng, L.LatLng] {
  const rad = (gate.orientation * Math.PI) / 180;
  const halfLen = (gate.lengthNm / 2) * NM_TO_DEG;
  const dlng = Math.sin(rad) * halfLen;
  const dlat = Math.cos(rad) * halfLen;
  const c = gate.center;
  return [
    L.latLng(c.lat - dlat, c.lng - dlng),
    L.latLng(c.lat + dlat, c.lng + dlng),
  ];
}

type Props = {
  gate: Gate;
  color: string;
  label: string;
  onDrag: (lat: number, lng: number) => void;
  onClick?: () => void;
  selected?: boolean;
};

export default function GateMarker({ gate, color, label, onDrag, onClick, selected }: Props) {
  const markerRef = useRef<L.Marker>(null);

  const icon = useMemo(
    () =>
      L.divIcon({
        className: "",
        html: selected
          ? `<div style="width:18px;height:18px;border-radius:50%;background:${color};border:2px solid white;box-shadow:0 0 0 3px rgba(250,204,21,0.8);"></div>`
          : `<div style="width:14px;height:14px;border-radius:50%;background:${color};border:2px solid white;"></div>`,
        iconSize: selected ? [18, 18] : [14, 14],
        iconAnchor: selected ? [9, 9] : [7, 7],
      }),
    [color, selected],
  );

  const endpoints = gateEndpoints(gate);

  const eventHandlers = useMemo(
    () => ({
      dragend() {
        const marker = markerRef.current;
        if (marker) {
          const pos = marker.getLatLng();
          onDrag(pos.lat, pos.lng);
        }
      },
      click() {
        onClick?.();
      },
    }),
    [onDrag, onClick],
  );

  return (
    <>
      <Marker
        ref={markerRef}
        position={[gate.center.lat, gate.center.lng]}
        icon={icon}
        draggable
        eventHandlers={eventHandlers}
      >
        <Tooltip direction="top" offset={[0, -10]} permanent={false}>
          {label}
        </Tooltip>
      </Marker>
      <Polyline
        positions={[endpoints[0], endpoints[1]]}
        color={color}
        weight={3}
        dashArray="8 4"
      />
    </>
  );
}
