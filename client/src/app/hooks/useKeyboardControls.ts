import { useEffect } from "react";
import { AppAction } from "../state";

/**
 * Hook to handle keyboard controls when playing.
 * - Arrow Left/Right: Turn boat
 * - Arrow Up: Toggle TWA lock
 * - Space: Tack
 */
export function useKeyboardControls(
  isPlaying: boolean,
  dispatch: React.Dispatch<AppAction>,
) {
  useEffect(() => {
    if (!isPlaying) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "ArrowLeft") {
        dispatch({ type: "TURN", direction: "left" });
      } else if (e.key === "ArrowRight") {
        dispatch({ type: "TURN", direction: "right" });
      } else if (e.key === "ArrowUp") {
        e.preventDefault();
        dispatch({ type: "TOGGLE_TWA_LOCK" });
      } else if (e.key === " ") {
        e.preventDefault();
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
  }, [isPlaying, dispatch]);
}
