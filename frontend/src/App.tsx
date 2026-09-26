import { useEffect, useMemo, useState } from "react";

import { api } from "./api/client";
import { InfoPanel } from "./components/InfoPanel";
import { SceneView, type ViewName } from "./scene/SceneView";
import type { Frame, Intersection, IntersectionBrief, Layout, SignalState, Turn } from "./types";
import { DIRECTIONS, TURNS } from "./types";

/**
 * Статичная картина светофоров: берём первую фазу активной программы,
 * чтобы головы на мачтах показывали осмысленные цвета без анимации.
 */
function staticSignals(intersection: Intersection | null): Frame["signals"] {
  const program =
    intersection?.programs.find((item) => item.is_active) ?? intersection?.programs[0] ?? null;
  const phase = program?.phases[0];
  const signals: Frame["signals"] = {};
  for (const direction of DIRECTIONS) {
    if (!intersection?.approaches.some((approach) => approach.direction === direction)) continue;
    const allowed = phase?.movements[direction] ?? [];
    signals[direction] = Object.fromEntries(
      TURNS.map((turn) => [turn, allowed.includes(turn) ? "green" : "red"]),
    ) as Record<Turn, SignalState>;
  }
  return signals;
}

export default function App() {
  const [intersections, setIntersections] = useState<IntersectionBrief[]>([]);
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [intersection, setIntersection] = useState<Intersection | null>(null);
  const [layout, setLayout] = useState<Layout | null>(null);
  const [view, setView] = useState<ViewName>("perspective");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api
      .intersections()
      .then((list) => {
        setIntersections(list);
        if (list.length > 0) setSelectedId((current) => current ?? list[0].id);
      })
      .catch((cause: Error) => setError(cause.message));
  }, []);

  useEffect(() => {
    if (selectedId === null) return;
    let cancelled = false;

    (async () => {
      try {
        const [detail, geometry] = await Promise.all([
          api.intersection(selectedId),
          api.layout(selectedId),
        ]);
        if (cancelled) return;
        setIntersection(detail);
        setLayout(geometry);
        setError(null);
      } catch (cause) {
        if (!cancelled) setError((cause as Error).message);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [selectedId]);

  const signals = useMemo(() => staticSignals(intersection), [intersection]);

  return (
    <div className="relative h-full w-full">
      <SceneView layout={layout} view={view} signals={signals} />

      <header className="pointer-events-none absolute top-4 left-4 z-10">
        <h1 className="text-lg font-semibold text-slate-100">
          SmartTrafficLight
          {intersection ? <span className="text-slate-400"> · {intersection.name}</span> : null}
        </h1>
        <p className="text-xs text-slate-400">геометрия перекрёстка из БД, вид со всех сторон</p>
      </header>

      <aside className="absolute top-4 right-4 z-10 flex w-80 max-w-[calc(100vw-2rem)] flex-col gap-3">
        <InfoPanel
          intersections={intersections}
          selectedId={selectedId}
          onSelect={setSelectedId}
          intersection={intersection}
          layout={layout}
          view={view}
          onView={setView}
        />
      </aside>

      {error !== null && (
        <div className="absolute bottom-4 left-4 z-10 max-w-md rounded-lg border border-rose-500/50 bg-rose-950/80 px-3 py-2 text-sm text-rose-200">
          {error}
        </div>
      )}

      {intersections.length === 0 && error === null && (
        <div className="absolute bottom-4 left-1/2 z-10 -translate-x-1/2 rounded-lg border border-slate-700 bg-slate-900/90 px-4 py-3 text-sm text-slate-300">
          В базе нет перекрёстков. Заполни демо-данные:{" "}
          <code className="text-sky-300">python -m app.seed</code>
        </div>
      )}
    </div>
  );
}
