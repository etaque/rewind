import { useEffect, useRef } from "react";
import { LngLat } from "../../models";
import { Session } from "../state";

export type SessionRefs = {
  position: React.MutableRefObject<LngLat | null>;
  courseTime: React.MutableRefObject<number>;
  heading: React.MutableRefObject<number>;
};

/**
 * Hook that maintains refs synchronized with session values.
 * Used by the game loop to avoid re-renders while accessing current values.
 *
 * The refs are automatically kept in sync with the session state,
 * eliminating the need for manual synchronization effects in components.
 */
export function useSessionRefs(session: Session | null): SessionRefs {
  const positionRef = useRef<LngLat | null>(session?.position ?? null);
  const courseTimeRef = useRef<number>(session?.courseTime ?? 0);
  const headingRef = useRef<number>(session?.heading ?? 0);

  // Keep refs in sync with session
  useEffect(() => {
    if (session) {
      positionRef.current = session.position;
      courseTimeRef.current = session.courseTime;
      headingRef.current = session.heading;
    } else {
      positionRef.current = null;
      courseTimeRef.current = 0;
      headingRef.current = 0;
    }
  }, [session?.position, session?.courseTime, session?.heading]);

  return {
    position: positionRef,
    courseTime: courseTimeRef,
    heading: headingRef,
  };
}
