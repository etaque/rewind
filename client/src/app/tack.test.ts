import { describe, it, expect } from "vitest";
import { calculateTackTarget } from "./tack";
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
    currentReport: null,
    nextReports: [],
    ...overrides,
  };
}

describe("calculateTackTarget", () => {
  describe("prevents concurrent tacks", () => {
    it("returns null if a tack is already in progress", () => {
      const session = makeSession({
        heading: 45,
        targetHeading: 315, // Tack already in progress
        windSpeed: { u: 0, v: -10 },
      });

      expect(calculateTackTarget(session)).toBeNull();
    });
  });

  describe("tack calculations with wind from north (0 degrees)", () => {
    // Wind from north: u=0, v=-10 (blowing south)

    it("tacks from starboard to port (45 -> 315)", () => {
      const session = makeSession({
        heading: 45,
        targetHeading: null,
        windSpeed: { u: 0, v: -10 }, // Wind from north
      });

      const target = calculateTackTarget(session);
      expect(target).toBeCloseTo(315, 0);
    });

    it("tacks from port to starboard (315 -> 45)", () => {
      const session = makeSession({
        heading: 315,
        targetHeading: null,
        windSpeed: { u: 0, v: -10 }, // Wind from north
      });

      const target = calculateTackTarget(session);
      expect(target).toBeCloseTo(45, 0);
    });

    it("tacks from starboard to port (60 -> 300)", () => {
      const session = makeSession({
        heading: 60,
        targetHeading: null,
        windSpeed: { u: 0, v: -10 },
      });

      const target = calculateTackTarget(session);
      expect(target).toBeCloseTo(300, 0);
    });
  });

  describe("tack calculations with wind from east (90 degrees)", () => {
    // Wind from east: u=-10, v=0 (blowing west)

    it("tacks correctly with easterly wind", () => {
      const session = makeSession({
        heading: 135, // Sailing SW on starboard
        targetHeading: null,
        windSpeed: { u: -10, v: 0 }, // Wind from east
      });

      const target = calculateTackTarget(session);
      // Should flip to port tack, heading NW (45)
      expect(target).toBeCloseTo(45, 0);
    });
  });

  describe("gybe calculations (downwind)", () => {
    it("gybes from starboard to port when running downwind", () => {
      const session = makeSession({
        heading: 160, // Running downwind, slightly starboard
        targetHeading: null,
        windSpeed: { u: 0, v: -10 }, // Wind from north
      });

      const target = calculateTackTarget(session);
      // Should gybe to port side
      expect(target).toBeCloseTo(200, 0);
    });
  });

  describe("edge cases", () => {
    it("handles heading directly into wind", () => {
      const session = makeSession({
        heading: 0, // Pointing at wind
        targetHeading: null,
        windSpeed: { u: 0, v: -10 }, // Wind from north
      });

      const target = calculateTackTarget(session);
      // TWA is 0, flipping sign still gives 0
      expect(target).toBeCloseTo(0, 0);
    });

    it("handles heading directly downwind", () => {
      const session = makeSession({
        heading: 180, // Running dead downwind
        targetHeading: null,
        windSpeed: { u: 0, v: -10 }, // Wind from north
      });

      const target = calculateTackTarget(session);
      // TWA is 180 (or -180), should stay same
      expect(target).toBeCloseTo(180, 0);
    });
  });
});
