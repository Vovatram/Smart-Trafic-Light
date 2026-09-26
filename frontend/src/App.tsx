import { useCallback, useEffect, useState } from "react";

import { api } from "./api/client";
import { InfoPanel } from "./components/InfoPanel";
import { SceneView, type ViewName } from "./scene/SceneView";
import type { Crossing, CrossingBrief, PedestrianSignal, VehicleSignal } from "./types";

export default function App() {
  const [crossings, setCrossings] = useState<CrossingBrief[]>([]);
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [crossing, setCrossing] = useState<Crossing | null>(null);
  const [view, setView] = useState<ViewName>("perspective");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api
      .crossings()
      .then((list) => {
        setCrossings(list);
        if (list.length > 0) setSelectedId((current) => current ?? list[0].id);
      })
      .catch((cause: Error) => setError(cause.message));
  }, []);

  const reloadCrossing = useCallback((id: number) => {
    return api.crossing(id).then((detail) => {
      setCrossing(detail);
      setError(null);
      return detail;
    });
  }, []);

  useEffect(() => {
    if (selectedId === null) return;
    let cancelled = false;

    reloadCrossing(selectedId).catch((cause: Error) => {
      if (!cancelled) setError(cause.message);
    });

    return () => {
      cancelled = true;
    };
  }, [selectedId, reloadCrossing]);

  const run = useCallback(
    (action: () => Promise<unknown>) => {
      setBusy(true);
      setError(null);
      return action()
        .catch((cause: Error) => setError(cause.message))
        .finally(() => setBusy(false));
    },
    [],
  );

  const patch = useCallback(
    (body: Parameters<typeof api.updateCrossing>[1]) => {
      if (crossing === null) return;
      void run(() => api.updateCrossing(crossing.id, body).then(setCrossing));
    },
    [crossing, run],
  );

  const onLanesForward = useCallback((value: number) => patch({ lanes_forward: value }), [patch]);
  const onLanesBackward = useCallback((value: number) => patch({ lanes_backward: value }), [patch]);
  const onVehicleSignal = useCallback(
    (value: VehicleSignal) => patch({ vehicle_signal: value }),
    [patch],
  );
  const onPedestrianSignal = useCallback(
    (value: PedestrianSignal) => patch({ pedestrian_signal: value }),
    [patch],
  );

  const onAddCamera = useCallback(() => {
    if (crossing === null) return;
    const side = crossing.camera_poles.length % 2 === 0 ? "left" : "right";
    void run(() => api.addCameraPole(crossing.id, { side }).then(() => reloadCrossing(crossing.id)));
  }, [crossing, run, reloadCrossing]);

  const onChangeCamera = useCallback(
    (id: number, cameraPatch: Parameters<typeof api.updateCameraPole>[1]) => {
      if (crossing === null) return;
      void run(() =>
        api.updateCameraPole(id, cameraPatch).then((updated) => {
          setCrossing((prev) =>
            prev
              ? { ...prev, camera_poles: prev.camera_poles.map((p) => (p.id === id ? updated : p)) }
              : prev,
          );
        }),
      );
    },
    [crossing, run],
  );

  const onRemoveCamera = useCallback(
    (id: number) => {
      if (crossing === null) return;
      void run(() =>
        api.removeCameraPole(id).then(() => {
          setCrossing((prev) =>
            prev ? { ...prev, camera_poles: prev.camera_poles.filter((p) => p.id !== id) } : prev,
          );
        }),
      );
    },
    [crossing, run],
  );

  return (
    <div className="relative h-full w-full">
      <SceneView crossing={crossing} view={view} />

      <header className="pointer-events-none absolute top-4 left-4 z-10">
        <h1 className="text-lg font-semibold text-slate-100">
          SmartTrafficLight
          {crossing ? <span className="text-slate-400"> · {crossing.name}</span> : null}
        </h1>
        <p className="text-xs text-slate-400">
          пешеходный переход через дорогу, можно менять число полос и смотреть с разных сторон
        </p>
      </header>

      <aside className="absolute top-4 right-4 z-10 flex w-80 max-w-[calc(100vw-2rem)] flex-col gap-3 overflow-y-auto" style={{ maxHeight: "calc(100vh - 2rem)" }}>
        <InfoPanel
          crossings={crossings}
          selectedId={selectedId}
          onSelect={setSelectedId}
          crossing={crossing}
          onLanesForward={onLanesForward}
          onLanesBackward={onLanesBackward}
          onVehicleSignal={onVehicleSignal}
          onPedestrianSignal={onPedestrianSignal}
          busy={busy}
          view={view}
          onView={setView}
          onAddCamera={onAddCamera}
          onChangeCamera={onChangeCamera}
          onRemoveCamera={onRemoveCamera}
        />
      </aside>

      {error !== null && (
        <div className="absolute bottom-4 left-4 z-10 max-w-md rounded-lg border border-rose-500/50 bg-rose-950/80 px-3 py-2 text-sm text-rose-200">
          {error}
        </div>
      )}

      {crossings.length === 0 && error === null && (
        <div className="absolute bottom-4 left-1/2 z-10 -translate-x-1/2 rounded-lg border border-slate-700 bg-slate-900/90 px-4 py-3 text-sm text-slate-300">
          В базе нет переходов. Заполни демо-данные:{" "}
          <code className="text-sky-300">python -m app.seed</code>
        </div>
      )}
    </div>
  );
}
