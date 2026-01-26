import { useEffect, useRef } from "react";
import { LngLat } from "../../models";
import { AppAction, Session } from "../state";
import InterpolatedWind from "../../interpolated-wind";
import { MultiplayerClient } from "../../multiplayer/client";

const WIND_REFRESH_INTERVAL = 100;

type GameLoopRefs = {
  position: React.MutableRefObject<LngLat | null>;
  courseTime: React.MutableRefObject<number>;
  heading: React.MutableRefObject<number>;
  interpolatedWind: React.MutableRefObject<InterpolatedWind>;
  multiplayer: React.MutableRefObject<MultiplayerClient | null>;
};

/**
 * Hook to run the game animation loop when playing.
 * Handles:
 * - Tick dispatch for physics updates
 * - Wind refresh at intervals
 * - Position broadcasting to multiplayer peers
 */
export function useGameLoop(
  isPlaying: boolean,
  session: Session | null,
  dispatch: React.Dispatch<AppAction>,
  refs: GameLoopRefs,
) {
  const lastWindRefreshRef = useRef<number>(0);

  useEffect(() => {
    if (!isPlaying || !session) return;

    let animationId: number;
    let lastTime: number | null = null;
    let accumulatedClock = session.clock;
    lastWindRefreshRef.current = 0;

    const tick = (time: number) => {
      if (lastTime !== null) {
        const delta = time - lastTime;
        accumulatedClock += delta;

        dispatch({ type: "TICK", delta });

        // Check if wind refresh needed
        if (
          accumulatedClock - lastWindRefreshRef.current >
          WIND_REFRESH_INTERVAL
        ) {
          lastWindRefreshRef.current = accumulatedClock;

          const interpolatedWind = refs.interpolatedWind.current;
          if (refs.position.current && refs.courseTime.current) {
            const windSpeed = interpolatedWind.speedAt(
              refs.position.current,
              refs.courseTime.current,
            ) ?? { u: 0, v: 0 };
            dispatch({ type: "LOCAL_WIND_UPDATED", windSpeed });
          }
        }

        // Broadcast position to multiplayer peers
        if (refs.multiplayer.current && refs.position.current) {
          refs.multiplayer.current.broadcastPosition(
            refs.position.current,
            refs.heading.current,
          );
        }
      }
      lastTime = time;
      animationId = requestAnimationFrame(tick);
    };

    animationId = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(animationId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isPlaying]);
}
