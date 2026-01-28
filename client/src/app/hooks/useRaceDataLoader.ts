import { useEffect } from "react";
import { SphereView } from "../../sphere";
import InterpolatedWind from "../../interpolated-wind";
import { Course, WindRasterSource } from "../../models";
import { AppAction } from "../state";
import { initLandData } from "../land";
import { currentWindContext } from "../wind-context";
import { loadPolar } from "../polar";

/**
 * Hook to handle race data loading when entering Lobby state.
 * Loads wind rasters, polar data, and initializes land collision data.
 */
export function useRaceDataLoader(
  isLoadingWind: boolean,
  course: Course | null,
  windRasterSources: WindRasterSource[] | null,
  sphereNodeRef: React.RefObject<HTMLDivElement>,
  sphereViewRef: React.MutableRefObject<SphereView | null>,
  interpolatedWindRef: React.MutableRefObject<InterpolatedWind>,
  dispatch: React.Dispatch<AppAction>,
): void {
  useEffect(() => {
    if (!isLoadingWind || !course || !windRasterSources) return;

    // Initialize land collision data
    initLandData();

    // Load wind rasters and polar in parallel
    const loadData = async () => {
      try {
        const [currentWindSource, nextWindSources] = currentWindContext(
          course.startTime,
          null,
          windRasterSources,
        );

        // Load wind rasters and polar in parallel
        const [, polar] = await Promise.all([
          interpolatedWindRef.current.update(
            currentWindSource,
            nextWindSources,
            true, // awaitAll
          ),
          loadPolar(course.polar),
        ]);

        // Update visualization
        const factor = interpolatedWindRef.current.getInterpolationFactor(
          course.startTime,
        );
        sphereViewRef.current?.updateWind(interpolatedWindRef.current, factor);

        // Dispatch polar loaded first, then wind success
        dispatch({ type: "POLAR_LOADED", polar });
        dispatch({
          type: "WIND_LOAD_RESULT",
          result: { status: "success", data: undefined },
        });
      } catch (e) {
        dispatch({
          type: "WIND_LOAD_RESULT",
          result: {
            status: "error",
            error: e instanceof Error ? e.message : "Failed to load wind data",
          },
        });
      }
    };

    loadData();
  }, [
    isLoadingWind,
    course?.key,
    windRasterSources,
    sphereNodeRef,
    sphereViewRef,
    interpolatedWindRef,
    dispatch,
  ]);
}

/**
 * Hook to update interpolated wind when raster sources change during gameplay.
 */
export function useWindSourceUpdater(
  isPlaying: boolean,
  currentSource: WindRasterSource | null,
  nextSources: WindRasterSource[],
  courseTime: number,
  sphereViewRef: React.MutableRefObject<SphereView | null>,
  interpolatedWindRef: React.MutableRefObject<InterpolatedWind>,
): void {
  useEffect(() => {
    if (!isPlaying) return;

    const interpolatedWind = interpolatedWindRef.current;

    interpolatedWind.update(currentSource, nextSources).then(() => {
      if (sphereViewRef.current) {
        const factor = interpolatedWind.getInterpolationFactor(courseTime);
        sphereViewRef.current.updateWind(interpolatedWind, factor);
      }
    });
  }, [currentSource?.time, nextSources[0]?.time]);
}
