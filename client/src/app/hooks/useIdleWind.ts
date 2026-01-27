import { useEffect, useRef } from "react";
import { SphereView } from "../../sphere";
import InterpolatedWind from "../../interpolated-wind";
import WindRaster from "../../wind-raster";

const serverUrl = import.meta.env.REWIND_SERVER_URL;

/**
 * Hook to load a random wind raster for the idle globe view.
 * Only loads when in idle state (no course selected for race).
 */
export function useIdleWind(
  isIdle: boolean,
  sphereViewRef: React.MutableRefObject<SphereView | null>,
  interpolatedWindRef: React.MutableRefObject<InterpolatedWind>,
): void {
  const loadedRef = useRef(false);

  useEffect(() => {
    // Only load if idle and not already loaded
    if (!isIdle || loadedRef.current) return;
    if (!sphereViewRef.current) return;

    const loadRandomWind = async () => {
      try {
        const response = await fetch(`${serverUrl}/wind/random`);
        if (!response.ok) {
          console.warn("Failed to fetch random wind:", response.statusText);
          return;
        }

        const data = await response.json();
        const pngUrl = data.pngUrl;

        // Load the raster directly (we don't need interpolation for idle view)
        const raster = await WindRaster.load(Date.now(), pngUrl);

        // Create a simple interpolated wind with just one raster
        const interpolatedWind = interpolatedWindRef.current;
        // Manually set the current raster (we can't use update() easily here)
        await interpolatedWind.update(
          { time: raster.time, pngUrl },
          [],
          true,
        );

        // Update the sphere view
        sphereViewRef.current?.updateWind(interpolatedWind, 0);
        loadedRef.current = true;
      } catch (e) {
        console.warn("Failed to load random wind:", e);
      }
    };

    loadRandomWind();
  }, [isIdle, sphereViewRef, interpolatedWindRef]);

  // Reset loaded flag when leaving idle state
  useEffect(() => {
    if (!isIdle) {
      loadedRef.current = false;
    }
  }, [isIdle]);
}
