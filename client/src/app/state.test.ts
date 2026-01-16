import { describe, it, expect } from "vitest";
import {
  appReducer,
  initialState,
  AppState,
  AppAction,
  Session,
  LobbyState,
} from "./state";
import { Course, WindReport } from "../models";

// Test fixtures
const testCourse: Course = {
  key: "test-course",
  name: "Test Course",
  startTime: 1000,
  start: { lng: -10, lat: 45 },
  finish: { lng: 10, lat: 45 },
  startHeading: 90,
  timeFactor: 60,
  maxDays: 90,
};

const testLobby: LobbyState = {
  id: "ABC123",
  courseKey: "test-course",
  myPlayerId: "player-1",
  isCreator: true,
  players: new Map(),
  countdown: null,
  raceStarted: false,
};

const testReports: WindReport[] = [
  { time: 900, pngUrl: "http://test/1.png" },
  { time: 1100, pngUrl: "http://test/2.png" },
];

function makeLoadingState(
  overrides: Partial<{
    course: Course;
    lobby: LobbyState;
    reportsLoaded: boolean;
  }> = {},
): Extract<AppState, { tag: "Loading" }> {
  return {
    tag: "Loading",
    course: testCourse,
    lobby: testLobby,
    reportsLoaded: false,
    ...overrides,
  };
}

function makePlayingState(
  sessionOverrides: Partial<Session> = {},
): Extract<AppState, { tag: "Playing" }> {
  return {
    tag: "Playing",
    lobby: { ...testLobby, raceStarted: true },
    raceEndedReason: null,
    session: {
      clock: 0,
      lastWindRefresh: 0,
      courseTime: 1000,
      position: { lng: -10, lat: 45 },
      turning: null,
      heading: 90,
      targetHeading: null,
      lockedTWA: null,
      boatSpeed: 10,
      course: testCourse,
      currentReport: testReports[0],
      nextReports: [testReports[1]],
      windSpeed: { u: 5, v: -10 },
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

  describe("LOBBY_CREATED", () => {
    it("transitions from Idle to Loading", () => {
      const action: AppAction = {
        type: "LOBBY_CREATED",
        lobbyId: "ABC123",
        playerId: "player-1",
        course: testCourse,
      };

      const result = appReducer(initialState, action);

      expect(result.tag).toBe("Loading");
      if (result.tag === "Loading") {
        expect(result.lobby.id).toBe("ABC123");
        expect(result.lobby.myPlayerId).toBe("player-1");
        expect(result.lobby.isCreator).toBe(true);
        expect(result.course).toBe(testCourse);
        expect(result.reportsLoaded).toBe(false);
      }
    });

    it("ignores action if not in Idle state", () => {
      const loadingState = makeLoadingState();
      const action: AppAction = {
        type: "LOBBY_CREATED",
        lobbyId: "NEW123",
        playerId: "player-2",
        course: testCourse,
      };

      const result = appReducer(loadingState, action);
      expect(result).toBe(loadingState);
    });
  });

  describe("LOBBY_JOINED", () => {
    it("transitions from Idle to Loading", () => {
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
        type: "LOBBY_JOINED",
        lobbyId: "ABC123",
        playerId: "player-2",
        course: testCourse,
        isCreator: false,
        players,
      };

      const result = appReducer(initialState, action);

      expect(result.tag).toBe("Loading");
      if (result.tag === "Loading") {
        expect(result.lobby.isCreator).toBe(false);
        expect(result.lobby.players.size).toBe(1);
      }
    });
  });

  describe("PLAYER_JOINED", () => {
    it("adds player to lobby", () => {
      const state = makeLoadingState();
      const action: AppAction = {
        type: "PLAYER_JOINED",
        playerId: "player-2",
        playerName: "Alice",
      };

      const result = appReducer(state, action);

      expect(result.tag).toBe("Loading");
      if (result.tag === "Loading") {
        expect(result.lobby.players.size).toBe(1);
        expect(result.lobby.players.get("player-2")?.name).toBe("Alice");
      }
    });

    it("ignores action if not in Loading state", () => {
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
    it("removes player from lobby", () => {
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
      const state = makeLoadingState({ lobby: { ...testLobby, players } });
      const action: AppAction = { type: "PLAYER_LEFT", playerId: "player-2" };

      const result = appReducer(state, action);

      expect(result.tag).toBe("Loading");
      if (result.tag === "Loading") {
        expect(result.lobby.players.size).toBe(0);
      }
    });
  });

  describe("COUNTDOWN", () => {
    it("updates countdown in lobby", () => {
      const state = makeLoadingState();
      const action: AppAction = { type: "COUNTDOWN", seconds: 3 };

      const result = appReducer(state, action);

      expect(result.tag).toBe("Loading");
      if (result.tag === "Loading") {
        expect(result.lobby.countdown).toBe(3);
      }
    });
  });

  describe("RACE_STARTED", () => {
    it("marks race as started", () => {
      const state = makeLoadingState();
      const action: AppAction = { type: "RACE_STARTED" };

      const result = appReducer(state, action);

      expect(result.tag).toBe("Loading");
      if (result.tag === "Loading") {
        expect(result.lobby.raceStarted).toBe(true);
      }
    });
  });

  describe("REPORTS_LOADED", () => {
    it("marks reports as loaded if race not started", () => {
      const state = makeLoadingState();
      const action: AppAction = {
        type: "REPORTS_LOADED",
        reports: testReports,
      };

      const result = appReducer(state, action);

      expect(result.tag).toBe("Loading");
      if (result.tag === "Loading") {
        expect(result.reportsLoaded).toBe(true);
      }
    });

    it("transitions to Playing if race already started", () => {
      const state = makeLoadingState({
        lobby: { ...testLobby, raceStarted: true },
      });
      const action: AppAction = {
        type: "REPORTS_LOADED",
        reports: testReports,
      };

      const result = appReducer(state, action);

      expect(result.tag).toBe("Playing");
    });
  });

  describe("REPORTS_ERROR", () => {
    it("returns to Idle state", () => {
      const state = makeLoadingState();
      const action: AppAction = { type: "REPORTS_ERROR" };

      const result = appReducer(state, action);

      expect(result).toEqual({ tag: "Idle" });
    });
  });

  describe("LEAVE_LOBBY", () => {
    it("returns to Idle state", () => {
      const state = makeLoadingState();
      const action: AppAction = { type: "LEAVE_LOBBY" };

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
      const state = makeLoadingState();
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
