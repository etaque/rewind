export type PlacementMode =
  | null
  | { type: "start" }
  | { type: "finishLine" }
  | { type: "gateCenter"; index: number }
  | { type: "waypoint"; leg: number }
  | { type: "exclusionPoint"; zone: number };

export function placementLabel(mode: PlacementMode): string | null {
  if (!mode) return null;
  switch (mode.type) {
    case "start":
      return "Click on the globe to set start position";
    case "finishLine":
      return "Click on the globe to set finish line center";
    case "gateCenter":
      return `Click on the globe to set Gate ${mode.index + 1} center`;
    case "waypoint":
      return `Click on the globe to add a waypoint`;
    case "exclusionPoint":
      return `Click on the globe to add a point to exclusion zone`;
  }
}
