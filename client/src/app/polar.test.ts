import { describe, it, expect } from "vitest";
import { getBoatSpeed, calculateTWA } from "./polar";

describe("getBoatSpeed", () => {
  describe("boundary conditions", () => {
    it("returns low speed at TWA 0 (heading into wind)", () => {
      // Polar has non-zero values at TWA 0 (drift/forward motion)
      // But speed should be much lower than at other angles
      const speedIntoWind = getBoatSpeed(10, 0);
      const speedBeamReach = getBoatSpeed(10, 90);
      expect(speedIntoWind).toBeLessThan(speedBeamReach / 2);
      expect(speedIntoWind).toBeCloseTo(3.5, 1); // From polar data
    });

    it("handles TWA > 180 by normalizing", () => {
      // TWA 200 should be treated as TWA 160 (360 - 200)
      const speed200 = getBoatSpeed(15, 200);
      const speed160 = getBoatSpeed(15, 160);
      expect(speed200).toBeCloseTo(speed160, 2);
    });

    it("handles negative TWA by taking absolute value", () => {
      const speedPositive = getBoatSpeed(15, 45);
      const speedNegative = getBoatSpeed(15, -45);
      expect(speedNegative).toBeCloseTo(speedPositive, 2);
    });
  });

  describe("interpolation", () => {
    it("returns reasonable speed at typical sailing angles", () => {
      // At 10 knots TWS and 90 degrees TWA, IMOCA should do ~9-10 knots
      const speed = getBoatSpeed(10, 90);
      expect(speed).toBeGreaterThan(8);
      expect(speed).toBeLessThan(12);
    });

    it("speed increases with wind speed", () => {
      const speedLight = getBoatSpeed(8, 90);
      const speedMedium = getBoatSpeed(15, 90);
      const speedStrong = getBoatSpeed(25, 90);

      expect(speedMedium).toBeGreaterThan(speedLight);
      expect(speedStrong).toBeGreaterThan(speedMedium);
    });

    it("broad reach (120-140) is typically fastest", () => {
      const speedBeam = getBoatSpeed(20, 90);
      const speedBroadReach = getBoatSpeed(20, 130);
      const speedDownwind = getBoatSpeed(20, 180);

      // Broad reach should be faster than beam reach for high-performance boats
      expect(speedBroadReach).toBeGreaterThan(speedBeam);
      // Broad reach should be faster than dead downwind
      expect(speedBroadReach).toBeGreaterThan(speedDownwind);
    });

    it("upwind is slower than downwind", () => {
      const speedUpwind = getBoatSpeed(15, 40);
      const speedDownwind = getBoatSpeed(15, 140);

      expect(speedDownwind).toBeGreaterThan(speedUpwind);
    });
  });

  describe("clamping", () => {
    it("clamps TWS below minimum to minimum", () => {
      // Very light wind should still return a value (clamped to min TWS)
      const speed = getBoatSpeed(1, 90);
      expect(speed).toBeGreaterThanOrEqual(0);
    });

    it("clamps TWS above maximum to maximum", () => {
      // Very high wind should be clamped to max TWS in polar
      const speed = getBoatSpeed(100, 90);
      expect(speed).toBeGreaterThan(0);
      // Should be same as max TWS value
      const speedAtMax = getBoatSpeed(40, 90);
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
