import { useEffect } from "react";
import { AppAction } from "../state";
import { SphereView } from "../../sphere";

/**
 * Hook to handle keyboard controls when playing.
 * - Arrow Left/Right: Turn boat
 * - Enter: Toggle TWA lock
 * - Shift: Lock to closest VMG (upwind or downwind based on current TWA)
 * - Arrow Up: Zoom in and center on boat
 * - Arrow Down: Zoom out and center on boat
 * - Space: Tack
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
      } else if (e.key === "Shift") {
        e.preventDefault();
        e.stopPropagation();
        dispatch({ type: "VMG_LOCK", mode: "closest" });
      } else if (e.key === "ArrowUp") {
        e.preventDefault();
        e.stopPropagation();
        sphereViewRef.current?.zoomIn();
      } else if (e.key === "ArrowDown") {
        e.preventDefault();
        e.stopPropagation();
        sphereViewRef.current?.zoomOut();
      } else if (e.key === " ") {
        e.preventDefault();
        e.stopPropagation();
        dispatch({ type: "TACK" });
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
