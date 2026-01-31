import { useEffect, useRef } from "react";
import { SphereView } from "../../sphere";
import InterpolatedWind from "../../interpolated-wind";
import { Course } from "../../models";
import { Session } from "../state";


export type SphereViewState = {
  sphereViewRef: React.MutableRefObject<SphereView | null>;
  sphereNodeRef: React.RefObject<HTMLDivElement>;
  interpolatedWindRef: React.MutableRefObject<InterpolatedWind>;
  resetWind: () => void;
};

/**
 * Hook to manage the SphereView 3D globe lifecycle.
 * Handles initialization, resize, position/wind updates, and projected path.
 */
export function useSphereView(
  session: Session | null,
  lobbyCourse: Course | null,
): SphereViewState {
  const sphereViewRef = useRef<SphereView | null>(null);
  const sphereNodeRef = useRef<HTMLDivElement>(null!);
  const interpolatedWindRef = useRef<InterpolatedWind>(new InterpolatedWind());

  // Initialize SphereView immediately (without a course for idle view)
  useEffect(() => {
    if (sphereNodeRef.current && !sphereViewRef.current) {
      sphereViewRef.current = new SphereView(sphereNodeRef.current);
      sphereViewRef.current.render();
    }
  }, []);

  // Handle window resize
  useEffect(() => {
    const handleResize = () => {
      sphereViewRef.current?.resize();
    };

    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, []);

  // Sync course to SphereView when joining a race
  useEffect(() => {
    if (lobbyCourse && sphereViewRef.current) {
      sphereViewRef.current.setCourse(lobbyCourse);
    }
  }, [lobbyCourse?.key]);

  // Sync position, heading, and wind to SphereView during gameplay
  useEffect(() => {
    if (!session) return;
    if (!sphereViewRef.current) return;

    sphereViewRef.current.updatePosition(
      session.position,
      session.heading,
      session.boatSpeed,
    );

    const interpolatedWind = interpolatedWindRef.current;
    const factor = interpolatedWind.getInterpolationFactor(session.courseTime);
    sphereViewRef.current.updateWind(interpolatedWind, factor);

  }, [
    session?.position,
    session?.heading,
    session?.courseTime,
    session?.lockedTWA,
    session?.targetHeading,
  ]);

  const resetWind = () => {
    interpolatedWindRef.current = new InterpolatedWind();
  };

  return {
    sphereViewRef,
    sphereNodeRef,
    interpolatedWindRef,
    resetWind,
  };
}
