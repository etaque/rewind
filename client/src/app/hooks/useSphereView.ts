import { useEffect, useRef } from "react";
import { SphereView } from "../../sphere";
import InterpolatedWind from "../../interpolated-wind";
import { Course } from "../../models";
import { Session } from "../state";
import { calculateTWA, getOptimalVMGAngle } from "../polar";
import { getWindDirection, msToKnots, getWindSpeed } from "../../utils";


export type SphereViewState = {
  sphereViewRef: React.MutableRefObject<SphereView | null>;
  sphereNodeRef: React.RefObject<HTMLDivElement>;
  interpolatedWindRef: React.MutableRefObject<InterpolatedWind>;
  vmgBad: boolean;
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
  const vmgBadRef = useRef(false);

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

    // Auto-center if boat is near viewport edge
    sphereViewRef.current.centerOnBoatIfNearEdge();

    const interpolatedWind = interpolatedWindRef.current;
    const factor = interpolatedWind.getInterpolationFactor(session.courseTime);
    sphereViewRef.current.updateWind(interpolatedWind, factor);

    // Compute VMG status with padding to avoid flickering at the boundary
    const VMG_PADDING = 5; // degrees
    const windDir = getWindDirection(session.windSpeed);
    const tws = msToKnots(getWindSpeed(session.windSpeed));
    const twa = calculateTWA(session.heading, windDir);

    let vmgBad = false;
    if (session.targetHeading === null) {
      if (twa <= 90) {
        vmgBad = twa < getOptimalVMGAngle(session.polar, tws, "upwind") - VMG_PADDING;
      } else {
        vmgBad = twa > getOptimalVMGAngle(session.polar, tws, "downwind") + VMG_PADDING;
      }
    }
    vmgBadRef.current = vmgBad;
    sphereViewRef.current.updateVMGStatus(vmgBad);
    sphereViewRef.current.updateTWALockStatus(session.lockedTWA !== null);
    sphereViewRef.current.updateWindDirection(windDir);

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
    vmgBad: vmgBadRef.current,
    resetWind,
  };
}
