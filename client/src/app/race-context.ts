import { createContext, useContext } from "react";
import { Course } from "../models";
import { PeerState } from "../multiplayer/types";
import { AsyncState } from "./state";
import { RecordedGhost } from "./App";

export type RaceContextValue = {
  // Race state
  raceId: string | null;
  myPlayerId: string | null;
  isCreator: boolean;
  canSelectCourse: boolean;
  players: Map<string, PeerState>;
  windStatus: AsyncState<void>["status"];

  // Course state
  courses: Course[];
  selectedCourseKey: string | null;

  // Ghosts
  recordedGhosts: Map<number, RecordedGhost>;

  // Race actions
  createRace: (playerName: string) => void;
  joinRace: (raceId: string, playerName: string) => void;
  startRace: () => void;
  leaveRace: () => void;

  // Course actions
  selectCourse: (courseKey: string) => void;
  openEditor: () => void;

  // Ghost actions
  addGhost: (entryId: number, playerName: string) => void;
  removeGhost: (ghostId: number) => void;
};

export const RaceContext = createContext<RaceContextValue | null>(null);

export function useRaceContext(): RaceContextValue {
  const context = useContext(RaceContext);
  if (!context) {
    throw new Error("useRaceContext must be used within a RaceProvider");
  }
  return context;
}
