import { describe, it, expect } from "vitest";
import {
  appReducer,
  initialState,
  asyncState,
  AppState,
  AppAction,
  Session,
  RaceState,
} from "./state";
import { Course, WindRasterSource } from "../models";

// Test fixtures
const testCourse: Course = {
  key: "test-course",
  name: "Test Course",
  description: "Test course description",
  startTime: 1000,
  start: { lng: -10, lat: 45 },
  finishLine: {
    center: { lng: 10, lat: 45 },
    orientation: 0,
    lengthNm: 12,
  },
  gates: [],
  exclusionZones: [],
  routeWaypoints: [[]],
  startHeading: 90,
  timeFactor: 60,
  maxDays: 90,
};

const testRace: RaceState = {
  id: "ABC123",
  myPlayerId: "player-1",
  isCreator: true,
  players: new Map(),
};

const testWindRasterSources: WindRasterSource[] = [
  { time: 900, pngUrl: "http://test/1.png" },
  { time: 1100, pngUrl: "http://test/2.png" },
];

function makeLobbyState(
  overrides: Partial<{
    course: Course;
    race: RaceState;
  }> = {},
): Extract<AppState, { tag: "Lobby" }> {
  return {
    tag: "Lobby",
    course: testCourse,
    race: testRace,
    windRasterSources: [],
    wind: asyncState.success(undefined),
    ...overrides,
  };
}

function makeCountdownState(
  overrides: Partial<{
    countdown: number;
    course: Course;
    race: RaceState;
  }> = {},
): Extract<AppState, { tag: "Countdown" }> {
  return {
    tag: "Countdown",
    countdown: 3,
    course: testCourse,
    race: testRace,
    windRasterSources: [],
    ...overrides,
  };
}

function makePlayingState(
  sessionOverrides: Partial<Session> = {},
): Extract<AppState, { tag: "Playing" }> {
  return {
    tag: "Playing",
    race: { ...testRace },
    raceEndedReason: null,
    leaderboard: [],
    session: {
      clock: 0,
      lastWindRefresh: 0,
      courseTime: 1000,
      serverRaceTime: 1000,
      position: { lng: -10, lat: 45 },
      turning: null,
      heading: 90,
      targetHeading: null,
      lockedTWA: null,
      boatSpeed: 10,
      course: testCourse,
      currentSource: testWindRasterSources[0],
      nextSources: [testWindRasterSources[1]],
      windSpeed: { u: 5, v: -10 },
      nextGateIndex: 0,
      gateTimes: [],
      finishTime: null,
      ...sessionOverrides,
    },
  };
}

describe("appReducer", () => {
  describe("initial state", () => {
    it("starts in Idle state", () => {
      expect(initialState).toEqual({ tag: "Idle" });
    });
  });

  describe("RACE_CREATED", () => {
    it("transitions from Idle to Lobby with wind loading", () => {
      const action: AppAction = {
        type: "RACE_CREATED",
        raceId: "ABC123",
        playerId: "player-1",
        course: testCourse,
        windRasterSources: testWindRasterSources,
      };

      const result = appReducer(initialState, action);

      expect(result.tag).toBe("Lobby");
      if (result.tag === "Lobby") {
        expect(result.race.id).toBe("ABC123");
        expect(result.race.myPlayerId).toBe("player-1");
        expect(result.race.isCreator).toBe(true);
        expect(result.course).toBe(testCourse);
        expect(result.windRasterSources).toBe(testWindRasterSources);
        expect(result.wind.status).toBe("loading");
      }
    });

    it("ignores action if not in Idle state", () => {
      const lobbyState = makeLobbyState();
      const action: AppAction = {
        type: "RACE_CREATED",
        raceId: "NEW123",
        playerId: "player-2",
        course: testCourse,
        windRasterSources: [testWindRasterSources[1]],
      };

      const result = appReducer(lobbyState, action);
      expect(result).toBe(lobbyState);
    });
  });

  describe("RACE_JOINED", () => {
    it("transitions from Idle to Lobby with wind loading", () => {
      const players = new Map([
        [
          "host",
          {
            id: "host",
            name: "Host",
            position: null,
            heading: null,
            lastUpdate: 0,
          },
        ],
      ]);
      const action: AppAction = {
        type: "RACE_JOINED",
        raceId: "ABC123",
        playerId: "player-2",
        course: testCourse,
        isCreator: false,
        players,
        windRasterSources: [testWindRasterSources[1]],
      };

      const result = appReducer(initialState, action);

      expect(result.tag).toBe("Lobby");
      if (result.tag === "Lobby") {
        expect(result.race.isCreator).toBe(false);
        expect(result.race.players.size).toBe(1);
        expect(result.wind.status).toBe("loading");
      }
    });
  });

  describe("PLAYER_JOINED", () => {
    it("adds player to race", () => {
      const state = makeLobbyState();
      const action: AppAction = {
        type: "PLAYER_JOINED",
        playerId: "player-2",
        playerName: "Alice",
      };

      const result = appReducer(state, action);

      expect(result.tag).toBe("Lobby");
      if (result.tag === "Lobby") {
        expect(result.race.players.size).toBe(1);
        expect(result.race.players.get("player-2")?.name).toBe("Alice");
      }
    });

    it("ignores action if not in Lobby state", () => {
      const action: AppAction = {
        type: "PLAYER_JOINED",
        playerId: "player-2",
        playerName: "Alice",
      };

      const result = appReducer(initialState, action);
      expect(result).toBe(initialState);
    });
  });

  describe("PLAYER_LEFT", () => {
    it("removes player from race", () => {
      const players = new Map([
        [
          "player-2",
          {
            id: "player-2",
            name: "Alice",
            position: null,
            heading: null,
            lastUpdate: 0,
          },
        ],
      ]);
      const state = makeLobbyState({ race: { ...testRace, players } });
      const action: AppAction = { type: "PLAYER_LEFT", playerId: "player-2" };

      const result = appReducer(state, action);

      expect(result.tag).toBe("Lobby");
      if (result.tag === "Lobby") {
        expect(result.race.players.size).toBe(0);
      }
    });
  });

  describe("COUNTDOWN", () => {
    it("updates countdown in race", () => {
      const state = makeCountdownState();
      const action: AppAction = { type: "COUNTDOWN", seconds: 3 };

      const result = appReducer(state, action);

      expect(result.tag).toBe("Countdown");
      if (result.tag === "Countdown") {
        expect(result.countdown).toBe(3);
      }
    });
  });

  describe("COUNTDOWN", () => {
    it("marks race as started", () => {
      const state = makeCountdownState();
      const action: AppAction = { type: "COUNTDOWN", seconds: 0 };

      const result = appReducer(state, action);

      expect(result.tag).toBe("Playing");
    });
  });

  describe("LEAVE_RACE", () => {
    it("returns to Idle state", () => {
      const state = makeLobbyState();
      const action: AppAction = { type: "LEAVE_RACE" };

      const result = appReducer(state, action);

      expect(result).toEqual({ tag: "Idle" });
    });
  });

  describe("TURN", () => {
    it("sets turning direction", () => {
      const state = makePlayingState();
      const action: AppAction = { type: "TURN", direction: "left" };

      const result = appReducer(state, action);

      expect(result.tag).toBe("Playing");
      if (result.tag === "Playing") {
        expect(result.session.turning).toBe("left");
      }
    });

    it("cancels ongoing tack", () => {
      const state = makePlayingState({ targetHeading: 180 });
      const action: AppAction = { type: "TURN", direction: "right" };

      const result = appReducer(state, action);

      expect(result.tag).toBe("Playing");
      if (result.tag === "Playing") {
        expect(result.session.targetHeading).toBeNull();
      }
    });

    it("cancels TWA lock", () => {
      const state = makePlayingState({ lockedTWA: 45 });
      const action: AppAction = { type: "TURN", direction: "left" };

      const result = appReducer(state, action);

      expect(result.tag).toBe("Playing");
      if (result.tag === "Playing") {
        expect(result.session.lockedTWA).toBeNull();
      }
    });

    it("stops turning with null direction", () => {
      const state = makePlayingState({ turning: "left" });
      const action: AppAction = { type: "TURN", direction: null };

      const result = appReducer(state, action);

      expect(result.tag).toBe("Playing");
      if (result.tag === "Playing") {
        expect(result.session.turning).toBeNull();
      }
    });

    it("ignores action if not Playing", () => {
      const state = makeLobbyState();
      const action: AppAction = { type: "TURN", direction: "left" };

      const result = appReducer(state, action);
      expect(result).toBe(state);
    });
  });

  describe("TACK", () => {
    it("sets target heading for tack", () => {
      const state = makePlayingState({
        heading: 45,
        targetHeading: null,
        windSpeed: { u: 0, v: -10 }, // Wind from north
      });
      const action: AppAction = { type: "TACK" };

      const result = appReducer(state, action);

      expect(result.tag).toBe("Playing");
      if (result.tag === "Playing") {
        expect(result.session.targetHeading).not.toBeNull();
      }
    });

    it("ignores tack if one is in progress", () => {
      const state = makePlayingState({
        heading: 45,
        targetHeading: 315, // Already tacking
      });
      const action: AppAction = { type: "TACK" };

      const result = appReducer(state, action);

      // State should be unchanged
      expect(result).toBe(state);
    });
  });

  describe("TOGGLE_TWA_LOCK", () => {
    it("locks TWA when unlocked", () => {
      const state = makePlayingState({
        heading: 45,
        lockedTWA: null,
        windSpeed: { u: 0, v: -10 },
      });
      const action: AppAction = { type: "TOGGLE_TWA_LOCK" };

      const result = appReducer(state, action);

      expect(result.tag).toBe("Playing");
      if (result.tag === "Playing") {
        expect(result.session.lockedTWA).not.toBeNull();
      }
    });

    it("unlocks TWA when locked", () => {
      const state = makePlayingState({ lockedTWA: 45 });
      const action: AppAction = { type: "TOGGLE_TWA_LOCK" };

      const result = appReducer(state, action);

      expect(result.tag).toBe("Playing");
      if (result.tag === "Playing") {
        expect(result.session.lockedTWA).toBeNull();
      }
    });
  });

  describe("LOCAL_WIND_UPDATED", () => {
    it("updates wind speed in session", () => {
      const state = makePlayingState();
      const newWind = { u: 15, v: -5 };
      const action: AppAction = {
        type: "LOCAL_WIND_UPDATED",
        windSpeed: newWind,
      };

      const result = appReducer(state, action);

      expect(result.tag).toBe("Playing");
      if (result.tag === "Playing") {
        expect(result.session.windSpeed).toEqual(newWind);
      }
    });
  });
});
