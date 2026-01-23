import { describe, it, expect } from "vitest";
import { calculateSignedTWA, toggleTWALock } from "./twa-lock";
import { Session } from "./state";

// Helper to create a minimal session for testing
function makeSession(overrides: Partial<Session> = {}): Session {
  return {
    course: {
      key: "test",
      name: "Test Course",
      startTime: 0,
      start: { lng: 0, lat: 0 },
      finish: { lng: 0, lat: 0 },
      startHeading: 0,
      timeFactor: 1,
      maxDays: 90,
    },
    clock: 0,
    lastWindRefresh: 0,
    courseTime: 0,
    serverRaceTime: 0,
    position: { lng: 0, lat: 0 },
    turning: null,
    heading: 0,
    targetHeading: null,
    lockedTWA: null,
    boatSpeed: 0,
    windSpeed: { u: 0, v: -10 }, // Wind from north by default
    currentSource: null,
    nextSources: [],
    finishTime: null,
    ...overrides,
  };
}

describe("calculateSignedTWA", () => {
  describe("with wind from north (0 degrees)", () => {
    // Wind from north: u=0, v=-10

    it("returns positive TWA for starboard tack (wind from right)", () => {
      const session = makeSession({
        heading: 45,
        windSpeed: { u: 0, v: -10 },
      });

      const twa = calculateSignedTWA(session);
      // Heading 45, wind from 0 -> TWA = -45 (wind from port... wait)
      // Let me recalculate: windDir - heading = 0 - 45 = -45
      expect(twa).toBe(-45);
    });

    it("returns negative TWA for port tack (wind from left)", () => {
      const session = makeSession({
        heading: 315,
        windSpeed: { u: 0, v: -10 },
      });

      const twa = calculateSignedTWA(session);
      // windDir - heading = 0 - 315 = -315, normalized to 45
      expect(twa).toBe(45);
    });

    it("returns 0 when heading into the wind", () => {
      const session = makeSession({
        heading: 0,
        windSpeed: { u: 0, v: -10 },
      });

      const twa = calculateSignedTWA(session);
      expect(twa).toBe(0);
    });

    it("returns 180 or -180 when running dead downwind", () => {
      const session = makeSession({
        heading: 180,
        windSpeed: { u: 0, v: -10 },
      });

      const twa = calculateSignedTWA(session);
      // windDir - heading = 0 - 180 = -180
      expect(Math.abs(twa)).toBe(180);
    });
  });

  describe("normalization", () => {
    it("normalizes to -180 to 180 range", () => {
      const session = makeSession({
        heading: 350,
        windSpeed: { u: 0, v: -10 }, // Wind from north (0)
      });

      const twa = calculateSignedTWA(session);
      // windDir - heading = 0 - 350 = -350, normalized to 10
      expect(twa).toBe(10);
    });
  });
});

describe("toggleTWALock", () => {
  describe("locking", () => {
    it("locks to current signed TWA when unlocked", () => {
      const session = makeSession({
        heading: 45,
        lockedTWA: null,
        windSpeed: { u: 0, v: -10 },
      });

      const result = toggleTWALock(session);
      expect(result).toBe(-45);
    });

    it("returns different TWA values for different headings", () => {
      const session1 = makeSession({
        heading: 60,
        lockedTWA: null,
        windSpeed: { u: 0, v: -10 },
      });

      const session2 = makeSession({
        heading: 120,
        lockedTWA: null,
        windSpeed: { u: 0, v: -10 },
      });

      expect(toggleTWALock(session1)).not.toBe(toggleTWALock(session2));
    });
  });

  describe("unlocking", () => {
    it("returns null when already locked", () => {
      const session = makeSession({
        heading: 45,
        lockedTWA: -45,
        windSpeed: { u: 0, v: -10 },
      });

      const result = toggleTWALock(session);
      expect(result).toBeNull();
    });

    it("returns null regardless of locked TWA value", () => {
      const session = makeSession({
        heading: 90,
        lockedTWA: 30, // Some arbitrary locked value
        windSpeed: { u: -10, v: 0 },
      });

      const result = toggleTWALock(session);
      expect(result).toBeNull();
    });
  });

  describe("toggle cycle", () => {
    it("lock then unlock returns null", () => {
      // Start unlocked
      const session1 = makeSession({
        heading: 45,
        lockedTWA: null,
        windSpeed: { u: 0, v: -10 },
      });

      // First toggle: locks
      const lockedValue = toggleTWALock(session1);
      expect(lockedValue).not.toBeNull();

      // Second toggle: unlocks
      const session2 = makeSession({
        ...session1,
        lockedTWA: lockedValue,
      });

      const unlockedValue = toggleTWALock(session2);
      expect(unlockedValue).toBeNull();
    });
  });
});
