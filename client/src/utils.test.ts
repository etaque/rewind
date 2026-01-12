import { describe, it, expect } from "vitest";
import {
  msToKnots,
  getWindDirection,
  getWindSpeed,
  getWindSpeedKnots,
  reframeLongitude,
  clamp,
  lngOneDegToM,
  latOneDegToM,
  bilinear,
} from "./utils";

describe("msToKnots", () => {
  it("converts 0 m/s to 0 knots", () => {
    expect(msToKnots(0)).toBe(0);
  });

  it("converts 1 m/s to ~1.944 knots", () => {
    expect(msToKnots(1)).toBeCloseTo(1.944, 3);
  });

  it("converts 10 m/s to ~19.44 knots", () => {
    expect(msToKnots(10)).toBeCloseTo(19.44, 2);
  });

  it("handles negative values", () => {
    expect(msToKnots(-5)).toBeCloseTo(-9.72, 2);
  });
});

describe("getWindDirection", () => {
  it("returns 0 for wind from the north (v negative, u zero)", () => {
    // Wind blowing TO the south means it comes FROM the north
    expect(getWindDirection({ u: 0, v: -10 })).toBeCloseTo(0, 1);
  });

  it("returns 90 for wind from the east", () => {
    // Wind blowing TO the west means it comes FROM the east
    expect(getWindDirection({ u: -10, v: 0 })).toBeCloseTo(90, 1);
  });

  it("returns 180 for wind from the south", () => {
    // Wind blowing TO the north means it comes FROM the south
    expect(getWindDirection({ u: 0, v: 10 })).toBeCloseTo(180, 1);
  });

  it("returns 270 for wind from the west", () => {
    // Wind blowing TO the east means it comes FROM the west
    expect(getWindDirection({ u: 10, v: 0 })).toBeCloseTo(270, 1);
  });

  it("returns 45 for wind from the northeast", () => {
    // u and v both negative (blowing to SW)
    expect(getWindDirection({ u: -10, v: -10 })).toBeCloseTo(45, 1);
  });

  it("handles zero wind (atan2(0,0) = 0, result = 180)", () => {
    // atan2(-0, -0) = Math.PI, so result is 180
    // This is mathematically correct but meaningless for zero wind
    expect(getWindDirection({ u: 0, v: 0 })).toBe(180);
  });
});

describe("getWindSpeed", () => {
  it("returns 0 for no wind", () => {
    expect(getWindSpeed({ u: 0, v: 0 })).toBe(0);
  });

  it("returns correct magnitude for pure u component", () => {
    expect(getWindSpeed({ u: 10, v: 0 })).toBe(10);
  });

  it("returns correct magnitude for pure v component", () => {
    expect(getWindSpeed({ u: 0, v: 10 })).toBe(10);
  });

  it("returns correct magnitude for combined components (3-4-5 triangle)", () => {
    expect(getWindSpeed({ u: 3, v: 4 })).toBe(5);
  });

  it("handles negative components", () => {
    expect(getWindSpeed({ u: -3, v: -4 })).toBe(5);
  });
});

describe("getWindSpeedKnots", () => {
  it("returns 0 for no wind", () => {
    expect(getWindSpeedKnots({ u: 0, v: 0 })).toBe(0);
  });

  it("converts wind magnitude to knots", () => {
    // 10 m/s magnitude -> ~19.44 knots
    expect(getWindSpeedKnots({ u: 10, v: 0 })).toBeCloseTo(19.44, 2);
  });
});

describe("reframeLongitude", () => {
  it("returns longitude unchanged if within bounds", () => {
    expect(reframeLongitude(0)).toBe(0);
    expect(reframeLongitude(90)).toBe(90);
    expect(reframeLongitude(-90)).toBe(-90);
    expect(reframeLongitude(180)).toBe(180);
    expect(reframeLongitude(-180)).toBe(-180);
  });

  it("wraps longitude > 180 to negative", () => {
    expect(reframeLongitude(181)).toBe(-179);
    expect(reframeLongitude(270)).toBe(-90);
    expect(reframeLongitude(360)).toBe(0);
  });

  it("wraps longitude < -180 to positive", () => {
    expect(reframeLongitude(-181)).toBe(179);
    expect(reframeLongitude(-270)).toBe(90);
    expect(reframeLongitude(-360)).toBe(0);
  });
});

describe("clamp", () => {
  it("returns value if within bounds", () => {
    expect(clamp(5, 0, 10)).toBe(5);
  });

  it("returns low bound if value is below", () => {
    expect(clamp(-5, 0, 10)).toBe(0);
  });

  it("returns high bound if value is above", () => {
    expect(clamp(15, 0, 10)).toBe(10);
  });

  it("handles equal bounds", () => {
    expect(clamp(5, 5, 5)).toBe(5);
    expect(clamp(0, 5, 5)).toBe(5);
    expect(clamp(10, 5, 5)).toBe(5);
  });

  it("works with negative ranges", () => {
    expect(clamp(-5, -10, -1)).toBe(-5);
    expect(clamp(0, -10, -1)).toBe(-1);
    expect(clamp(-15, -10, -1)).toBe(-10);
  });
});

describe("lngOneDegToM", () => {
  it("returns ~111km at equator", () => {
    // At equator, 1 degree longitude = ~111,320 meters
    expect(lngOneDegToM(0)).toBeCloseTo(111320, -2);
  });

  it("returns 0 at poles", () => {
    expect(lngOneDegToM(90)).toBeCloseTo(0, 0);
    expect(lngOneDegToM(-90)).toBeCloseTo(0, 0);
  });

  it("decreases with latitude", () => {
    const atEquator = lngOneDegToM(0);
    const at45 = lngOneDegToM(45);
    const at60 = lngOneDegToM(60);

    expect(at45).toBeLessThan(atEquator);
    expect(at60).toBeLessThan(at45);
  });

  it("returns ~78km at 45 degrees latitude", () => {
    // cos(45) = 0.707, so ~78,700 meters
    expect(lngOneDegToM(45)).toBeCloseTo(78700, -2);
  });
});

describe("latOneDegToM", () => {
  it("is constant at 111km", () => {
    expect(latOneDegToM).toBe(111000);
  });
});

describe("bilinear", () => {
  // Simple grid function for testing: f(x,y) = x + y
  const simpleGrid = ({ x, y }: { x: number; y: number }) => x + y;

  it("returns exact value at integer coordinates", () => {
    expect(bilinear({ x: 2, y: 3 }, simpleGrid)).toBe(5);
    expect(bilinear({ x: 0, y: 0 }, simpleGrid)).toBe(0);
  });

  it("interpolates correctly at midpoints", () => {
    // At (0.5, 0), should interpolate between f(0,0)=0 and f(1,0)=1 -> 0.5
    // But also considering y direction
    expect(bilinear({ x: 0.5, y: 0 }, simpleGrid)).toBeCloseTo(0.5, 5);
  });

  it("interpolates correctly in both dimensions", () => {
    // At (0.5, 0.5):
    // f(0,0)=0, f(1,0)=1, f(0,1)=1, f(1,1)=2
    // Expected: 1 (center of 0,1,1,2)
    expect(bilinear({ x: 0.5, y: 0.5 }, simpleGrid)).toBeCloseTo(1, 5);
  });

  it("works with constant grid", () => {
    const constantGrid = () => 42;
    expect(bilinear({ x: 0.5, y: 0.5 }, constantGrid)).toBe(42);
    expect(bilinear({ x: 1.7, y: 2.3 }, constantGrid)).toBe(42);
  });
});
