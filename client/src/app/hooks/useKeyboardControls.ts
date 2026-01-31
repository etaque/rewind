import { useEffect } from "react";
import { AppAction } from "../state";
import { SphereView } from "../../sphere";

/**
 * Hook to handle keyboard controls when playing.
 * - Arrow Left/Right: Turn boat
 * - Enter: Toggle TWA lock
 * - Arrow Up: Lock to optimal upwind VMG heading
 * - Arrow Down: Lock to optimal downwind VMG heading
 * - Space: Tack
 * - X: Center map on boat
 */
export function useKeyboardControls(
  isPlaying: boolean,
  dispatch: React.Dispatch<AppAction>,
  sphereViewRef: React.RefObject<SphereView | null>,
) {
  useEffect(() => {
    if (!isPlaying) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "ArrowLeft") {
        dispatch({ type: "TURN", direction: "left" });
      } else if (e.key === "ArrowRight") {
        dispatch({ type: "TURN", direction: "right" });
      } else if (e.key === "Enter") {
        e.preventDefault();
        e.stopPropagation();
        dispatch({ type: "TOGGLE_TWA_LOCK" });
      } else if (e.key === "ArrowUp") {
        e.preventDefault();
        e.stopPropagation();
        dispatch({ type: "VMG_LOCK", mode: "upwind" });
      } else if (e.key === "ArrowDown") {
        e.preventDefault();
        e.stopPropagation();
        dispatch({ type: "VMG_LOCK", mode: "downwind" });
      } else if (e.key === " ") {
        e.preventDefault();
        e.stopPropagation();
        dispatch({ type: "TACK" });
      } else if (e.key === "x" || e.key === "X") {
        sphereViewRef.current?.centerOnBoat();
      }
    };

    const handleKeyUp = (e: KeyboardEvent) => {
      if (e.key === "ArrowLeft" || e.key === "ArrowRight") {
        dispatch({ type: "TURN", direction: null });
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    window.addEventListener("keyup", handleKeyUp);
    return () => {
      window.removeEventListener("keydown", handleKeyDown);
      window.removeEventListener("keyup", handleKeyUp);
    };
  }, [isPlaying, dispatch, sphereViewRef]);
}
