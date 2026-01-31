import { Polygon, Tooltip } from "react-leaflet";
import L from "leaflet";
import { ExclusionZone } from "../../models";

type Props = {
  zone: ExclusionZone;
  index: number;
};

export default function ExclusionZonePolygon({ zone, index }: Props) {
  const positions: L.LatLngExpression[] = zone.polygon.map((p) => [
    p.lat,
    p.lng,
  ]);

  return (
    <Polygon
      positions={positions}
      pathOptions={{
        color: "#ef4444",
        fillColor: "#ef4444",
        fillOpacity: 0.15,
        weight: 2,
      }}
      eventHandlers={{
        // We handle vertex editing through editable polygons via the map click handler
        // For now, polygons are displayed but vertices are edited through the form
        click: (e) => {
          L.DomEvent.stopPropagation(e);
        },
      }}
    >
      <Tooltip direction="center" permanent={false}>
        {zone.name || `Exclusion Zone ${index + 1}`}
      </Tooltip>
    </Polygon>
  );
}
