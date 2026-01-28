import { describe, it, expect } from "vitest";
import {
  getBoatSpeed,
  calculateTWA,
  parsePolarTable,
  PolarData,
} from "./polar";

// Inline test polar data (subset of IMOCA polar for testing)
const testPolarTable: Record<string, Record<string, number>> = {
  "0": {
    "0": 0,
    "20": 0,
    "30": 0,
    "45": 0,
    "90": 0,
    "120": 0,
    "150": 0,
    "180": 0,
  },
  "8": {
    "0": 0,
    "20": 1.284,
    "30": 5.216,
    "45": 8.546,
    "90": 11.083,
    "120": 10.943,
    "150": 7.803,
    "180": 5.777,
  },
  "10": {
    "0": 0,
    "20": 0.943,
    "30": 5.777,
    "45": 9.218,
    "90": 11.835,
    "120": 12.136,
    "150": 9.318,
    "180": 7.091,
  },
  "15": {
    "0": 0,
    "20": 0.732,
    "30": 6.68,
    "45": 10.531,
    "90": 13.855,
    "120": 14.687,
    "150": 11.924,
    "180": 9.218,
  },
  "20": {
    "0": 0,
    "20": 0.341,
    "30": 6.981,
    "45": 11.143,
    "90": 16.878,
    "120": 18.442,
    "150": 16.606,
    "180": 11.976,
  },
  "25": {
    "0": 0,
    "20": 0.15,
    "30": 7.181,
    "45": 11.474,
    "90": 18.839,
    "120": 20.581,
    "150": 21.186,
    "180": 15.466,
  },
  "70": {
    "0": 0,
    "20": 0,
    "30": 0.942,
    "45": 1.619,
    "90": 2.789,
    "120": 3.168,
    "150": 3.536,
    "180": 3.06,
  },
};

const polar: PolarData = parsePolarTable(testPolarTable);

describe("getBoatSpeed", () => {
  describe("boundary conditions", () => {
    it("returns zero speed at TWA 0 (heading into wind)", () => {
      // VR polar has 0 speed at TWA 0 (can't sail directly into wind)
      const speedIntoWind = getBoatSpeed(polar, 10, 0);
      const speedBeamReach = getBoatSpeed(polar, 10, 90);
      expect(speedIntoWind).toBeLessThan(speedBeamReach / 2);
      expect(speedIntoWind).toBe(0);
    });

    it("handles TWA > 180 by normalizing", () => {
      // TWA 200 should be treated as TWA 160 (360 - 200)
      const speed200 = getBoatSpeed(polar, 15, 200);
      const speed160 = getBoatSpeed(polar, 15, 160);
      expect(speed200).toBeCloseTo(speed160, 2);
    });

    it("handles negative TWA by taking absolute value", () => {
      const speedPositive = getBoatSpeed(polar, 15, 45);
      const speedNegative = getBoatSpeed(polar, 15, -45);
      expect(speedNegative).toBeCloseTo(speedPositive, 2);
    });
  });

  describe("interpolation", () => {
    it("returns reasonable speed at typical sailing angles", () => {
      // At 10 knots TWS and 90 degrees TWA, IMOCA should do ~9-10 knots
      const speed = getBoatSpeed(polar, 10, 90);
      expect(speed).toBeGreaterThan(8);
      expect(speed).toBeLessThan(12);
    });

    it("speed increases with wind speed", () => {
      const speedLight = getBoatSpeed(polar, 8, 90);
      const speedMedium = getBoatSpeed(polar, 15, 90);
      const speedStrong = getBoatSpeed(polar, 25, 90);

      expect(speedMedium).toBeGreaterThan(speedLight);
      expect(speedStrong).toBeGreaterThan(speedMedium);
    });

    it("broad reach (120-140) is typically fastest", () => {
      const speedBeam = getBoatSpeed(polar, 20, 90);
      const speedBroadReach = getBoatSpeed(polar, 20, 130);
      const speedDownwind = getBoatSpeed(polar, 20, 180);

      // Broad reach should be faster than beam reach for high-performance boats
      expect(speedBroadReach).toBeGreaterThan(speedBeam);
      // Broad reach should be faster than dead downwind
      expect(speedBroadReach).toBeGreaterThan(speedDownwind);
    });

    it("upwind is slower than downwind", () => {
      const speedUpwind = getBoatSpeed(polar, 15, 40);
      const speedDownwind = getBoatSpeed(polar, 15, 140);

      expect(speedDownwind).toBeGreaterThan(speedUpwind);
    });
  });

  describe("clamping", () => {
    it("clamps TWS below minimum to minimum", () => {
      // Very light wind should still return a value (clamped to min TWS)
      const speed = getBoatSpeed(polar, 1, 90);
      expect(speed).toBeGreaterThanOrEqual(0);
    });

    it("clamps TWS above maximum to maximum", () => {
      // Very high wind should be clamped to max TWS in polar (70 knots)
      const speed = getBoatSpeed(polar, 100, 90);
      expect(speed).toBeGreaterThan(0);
      // Should be same as max TWS value (70 knots in VR polar)
      const speedAtMax = getBoatSpeed(polar, 70, 90);
      expect(speed).toBeCloseTo(speedAtMax, 1);
    });
  });
});

describe("calculateTWA", () => {
  describe("basic angles", () => {
    it("returns 0 when heading into the wind", () => {
      // Heading north (0), wind from north (0)
      expect(calculateTWA(0, 0)).toBe(0);
    });

    it("returns 180 when running dead downwind", () => {
      // Heading north (0), wind from south (180)
      expect(calculateTWA(0, 180)).toBe(180);
    });

    it("returns 90 for beam reach", () => {
      // Heading north (0), wind from east (90)
      expect(calculateTWA(0, 90)).toBe(90);
      // Heading north (0), wind from west (270)
      expect(calculateTWA(0, 270)).toBe(90);
    });

    it("returns 45 for close hauled", () => {
      // Heading north (0), wind from NE (45)
      expect(calculateTWA(0, 45)).toBe(45);
    });
  });

  describe("normalization", () => {
    it("normalizes angles crossing 360", () => {
      // Heading 350, wind from 10 -> TWA should be 20
      expect(calculateTWA(350, 10)).toBe(20);
    });

    it("normalizes angles crossing 0", () => {
      // Heading 10, wind from 350 -> TWA should be 20
      expect(calculateTWA(10, 350)).toBe(20);
    });

    it("always returns positive TWA (0-180)", () => {
      // Various combinations should always give 0-180
      expect(calculateTWA(45, 90)).toBeGreaterThanOrEqual(0);
      expect(calculateTWA(45, 90)).toBeLessThanOrEqual(180);

      expect(calculateTWA(270, 90)).toBeGreaterThanOrEqual(0);
      expect(calculateTWA(270, 90)).toBeLessThanOrEqual(180);
    });
  });

  describe("symmetry", () => {
    it("same TWA for port and starboard tacks", () => {
      // Wind from north (0)
      // Heading 45 (starboard tack) should give same TWA as heading 315 (port tack)
      expect(calculateTWA(45, 0)).toBe(calculateTWA(315, 0));
    });
  });
});
