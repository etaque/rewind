import { LngLat, WindSpeed, WindReport } from "./models";
import WindRaster from "./wind-raster";

/**
 * Manages two wind rasters (current and next) and provides interpolated wind values.
 * Pre-loads the next report so transitions are seamless.
 */
export default class InterpolatedWind {
  private currentRaster: WindRaster | null = null;
  private nextRaster: WindRaster | null = null;
  private currentReport: WindReport | null = null;
  private nextReport: WindReport | null = null;
  private loadingTime: number | null = null;

  /**
   * Update which reports should be active. Call this on every tick or when reports change.
   * Returns true if the current raster changed (for triggering texture updates).
   */
  async update(
    currentReport: WindReport | null,
    nextReports: WindReport[],
  ): Promise<boolean> {
    const nextReport = nextReports[0] ?? null;
    let currentChanged = false;

    // Check if current report changed
    if (currentReport?.time !== this.currentReport?.time) {
      // If the new current was our pre-loaded next, swap it
      if (this.nextRaster && currentReport?.time === this.nextReport?.time) {
        this.currentRaster = this.nextRaster;
        this.nextRaster = null;
      } else if (currentReport) {
        // Need to load the current report
        this.currentRaster = await WindRaster.load(
          currentReport.time,
          currentReport.pngUrl,
        );
      } else {
        this.currentRaster = null;
      }
      this.currentReport = currentReport;
      currentChanged = true;
    }

    // Pre-load next report if needed
    if (
      nextReport &&
      nextReport.time !== this.nextReport?.time &&
      nextReport.time !== this.loadingTime
    ) {
      this.loadingTime = nextReport.time;
      this.nextReport = nextReport;

      WindRaster.load(nextReport.time, nextReport.pngUrl).then((raster) => {
        // Only set if still relevant
        if (this.nextReport?.time === raster.time) {
          this.nextRaster = raster;
        }
        this.loadingTime = null;
      });
    }

    return currentChanged;
  }

  /**
   * Get interpolated wind speed at a position.
   * @param position Geographic position
   * @param courseTime Current course time (unix timestamp in ms)
   */
  speedAt(position: LngLat, courseTime: number): WindSpeed | null {
    const t = this.getInterpolationFactor(courseTime);
    return this.speedAtWithFactor(position, t);
  }

  /**
   * Get interpolated wind speed at a position using a pre-computed factor.
   * @param position Geographic position
   * @param t Interpolation factor (0-1)
   */
  speedAtWithFactor(position: LngLat, t: number): WindSpeed | null {
    if (!this.currentRaster) return null;

    const currentSpeed = this.currentRaster.speedAt(position);
    if (!currentSpeed) return null;

    // If we have next raster and t > 0, interpolate
    if (this.nextRaster && t > 0) {
      const nextSpeed = this.nextRaster.speedAt(position);
      if (nextSpeed) {
        return {
          u: lerp(currentSpeed.u, nextSpeed.u, t),
          v: lerp(currentSpeed.v, nextSpeed.v, t),
        };
      }
    }

    return currentSpeed;
  }

  /**
   * Get the interpolation factor (0-1) based on course time.
   */
  getInterpolationFactor(courseTime: number): number {
    if (!this.currentReport || !this.nextReport) return 0;

    const duration = this.nextReport.time - this.currentReport.time;
    if (duration <= 0) return 0;

    const elapsed = courseTime - this.currentReport.time;
    return Math.max(0, Math.min(1, elapsed / duration));
  }

  /**
   * Get the current raster (for texture rendering).
   */
  getCurrentRaster(): WindRaster | null {
    return this.currentRaster;
  }

  /**
   * Get the next raster (for interpolated texture rendering).
   */
  getNextRaster(): WindRaster | null {
    return this.nextRaster;
  }

  /**
   * Check if both rasters are loaded and ready for interpolation.
   */
  canInterpolate(): boolean {
    return this.currentRaster !== null && this.nextRaster !== null;
  }
}

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}
