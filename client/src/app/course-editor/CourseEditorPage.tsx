import { useState, useRef, useEffect, useCallback } from "react";
import { Course, LngLat } from "../../models";
import { SphereView } from "../../sphere";
import { PlacementMode, placementLabel } from "./placement";
import EditorToolbar from "./EditorToolbar";
import CourseMetadataForm from "./CourseMetadataForm";
import StartEditor from "./StartEditor";
import GatesListEditor from "./GatesListEditor";
import WaypointsEditor from "./WaypointsEditor";
import ExclusionZonesEditor from "./ExclusionZonesEditor";
import Section from "./Section";

export default function CourseEditorPage() {
  const [course, setCourse] = useState<Course | null>(null);
  const [placement, setPlacement] = useState<PlacementMode>(null);

  const sphereNodeRef = useRef<HTMLDivElement>(null);
  const sphereViewRef = useRef<SphereView | null>(null);

  // Initialize SphereView
  useEffect(() => {
    if (sphereNodeRef.current && !sphereViewRef.current) {
      sphereViewRef.current = new SphereView(sphereNodeRef.current);
      sphereViewRef.current.render();
    }
  }, []);

  // Handle window resize
  useEffect(() => {
    const handleResize = () => sphereViewRef.current?.resize();
    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, []);

  // Sync course to SphereView for live preview
  useEffect(() => {
    if (course && sphereViewRef.current) {
      sphereViewRef.current.setCourse(course);
    }
  }, [course]);

  // Wire up drag-to-move markers
  useEffect(() => {
    const sv = sphereViewRef.current;
    if (!sv || !course) {
      if (sv) sv.onDragMarker = null;
      return;
    }

    sv.onDragMarker = (marker, coord) => {
      setCourse((prev) => {
        if (!prev) return prev;
        switch (marker.type) {
          case "start":
            return { ...prev, start: coord };
          case "finishCenter":
            return { ...prev, finishLine: { ...prev.finishLine, center: coord } };
          case "gateCenter": {
            const gates = [...prev.gates];
            gates[marker.index] = { ...gates[marker.index], center: coord };
            return { ...prev, gates };
          }
          case "waypoint": {
            const routeWaypoints = prev.routeWaypoints.map((wps, i) =>
              i === marker.leg
                ? wps.map((wp, j) => (j === marker.index ? coord : wp))
                : wps,
            );
            return { ...prev, routeWaypoints };
          }
        }
      });
    };

    return () => {
      sv.onDragMarker = null;
    };
  }, [course !== null]);

  // Wire up click-to-place
  useEffect(() => {
    const sv = sphereViewRef.current;
    if (!sv) return;

    if (!placement || !course) {
      sv.onClickCoord = null;
      return;
    }

    sv.onClickCoord = (coord: LngLat) => {
      applyPlacement(coord);
      setPlacement(null);
    };

    return () => {
      sv.onClickCoord = null;
    };
  }, [placement, course]);

  const applyPlacement = useCallback(
    (coord: LngLat) => {
      if (!placement || !course) return;

      switch (placement.type) {
        case "start":
          setCourse({ ...course, start: coord });
          break;
        case "finishLine":
          setCourse({
            ...course,
            finishLine: { ...course.finishLine, center: coord },
          });
          break;
        case "gateCenter": {
          const gates = [...course.gates];
          gates[placement.index] = { ...gates[placement.index], center: coord };
          setCourse({ ...course, gates });
          break;
        }
        case "waypoint": {
          const routeWaypoints = course.routeWaypoints.map((wps, i) =>
            i === placement.leg ? [...wps, coord] : wps,
          );
          setCourse({ ...course, routeWaypoints });
          break;
        }
        case "exclusionPoint": {
          const exclusionZones = course.exclusionZones.map((zone, i) =>
            i === placement.zone
              ? { ...zone, polygon: [...zone.polygon, coord] }
              : zone,
          );
          setCourse({ ...course, exclusionZones });
          break;
        }
      }
    },
    [placement, course],
  );

  const handleCourseLoaded = useCallback((loaded: Course) => {
    setCourse(loaded);
    setPlacement(null);
    // Focus globe on loaded course
    if (sphereViewRef.current) {
      sphereViewRef.current.setCourse(loaded);
      sphereViewRef.current.focusOnCourseStart();
    }
  }, []);

  const banner = placementLabel(placement);

  return (
    <>
      {/* Globe */}
      <div ref={sphereNodeRef} id="sphere" className="fixed inset-0" />

      {/* Placement banner */}
      {banner && (
        <div className="fixed top-0 left-0 right-0 z-30 flex items-center justify-center gap-4 py-2 bg-blue-600/80 text-white text-sm">
          <span>{banner}</span>
          <button
            onClick={() => setPlacement(null)}
            className="px-2 py-0.5 bg-white/20 hover:bg-white/30 rounded text-xs"
          >
            Cancel
          </button>
        </div>
      )}

      {/* Side panel */}
      <div className="fixed top-0 left-0 bottom-0 w-[420px] z-20 bg-slate-900/90 overflow-y-auto pointer-events-auto">
        <div className="p-4 space-y-5">
          {/* Header */}
          <div className="flex items-center justify-between">
            <h1 className="text-white text-lg font-semibold">Course Editor</h1>
            <a
              href="#/"
              className="text-sm text-slate-400 hover:text-white transition-colors"
            >
              Back to game
            </a>
          </div>

          {/* Toolbar */}
          <EditorToolbar course={course} onCourseLoaded={handleCourseLoaded} />

          {/* Form (only when course loaded) */}
          {course && (
            <div className="space-y-4">
              <Section label="Metadata" defaultOpen>
                <CourseMetadataForm course={course} onChange={setCourse} />
              </Section>

              <Section label="Start" defaultOpen>
                <StartEditor
                  course={course}
                  onChange={setCourse}
                  setPlacement={setPlacement}
                />
              </Section>

              <Section label="Gates & Finish" defaultOpen>
                <GatesListEditor
                  course={course}
                  onChange={setCourse}
                  setPlacement={setPlacement}
                />
              </Section>

              <Section label="Waypoints">
                <WaypointsEditor
                  course={course}
                  onChange={setCourse}
                  setPlacement={setPlacement}
                />
              </Section>

              <Section label="Exclusion Zones">
                <ExclusionZonesEditor
                  course={course}
                  onChange={setCourse}
                  setPlacement={setPlacement}
                />
              </Section>
            </div>
          )}

          {!course && (
            <div className="text-slate-500 text-sm py-8 text-center">
              Create a new course or load one to get started.
            </div>
          )}
        </div>
      </div>
    </>
  );
}
