import { useCallback, useEffect, useState } from "react";

import { api } from "./api/client";
import { DeviceEditor } from "./components/DeviceEditor";
import { InfoPanel } from "./components/InfoPanel";
import { SceneView, type ViewName } from "./scene/SceneView";
import type { Crossing, CrossingBrief, DeviceType, PedestrianSignal, VehicleSignal } from "./types";

export default function App() {
  const [crossings, setCrossings] = useState<CrossingBrief[]>([]);
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [crossing, setCrossing] = useState<Crossing | null>(null);
  const [view, setView] = useState<ViewName>("perspective");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [placingType, setPlacingType] = useState<DeviceType | null>(null);
  const [selectedDeviceId, setSelectedDeviceId] = useState<number | null>(null);

  useEffect(() => {
    api
      .crossings()
      .then((list) => {
        setCrossings(list);
        if (list.length > 0) setSelectedId((current) => current ?? list[0].id);
      })
      .catch((cause: Error) => setError(cause.message));
  }, []);

  useEffect(() => {
    if (selectedId === null) return;
    let cancelled = false;

    api
      .crossing(selectedId)
      .then((detail) => {
        if (!cancelled) {
          setCrossing(detail);
          setError(null);
        }
      })
      .catch((cause: Error) => {
        if (!cancelled) setError(cause.message);
      });

    return () => {
      cancelled = true;
    };
  }, [selectedId]);

  const run = useCallback((action: () => Promise<unknown>) => {
    setBusy(true);
    setError(null);
    return action()
      .catch((cause: Error) => setError(cause.message))
      .finally(() => setBusy(false));
  }, []);

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

  const onStartPlacing = useCallback((type: DeviceType) => {
    setPlacingType(type);
    setSelectedDeviceId(null);
    setView("top");
  }, []);
  const onStopPlacing = useCallback(() => setPlacingType(null), []);

  const onPlace = useCallback(
    (x: number, z: number) => {
      if (crossing === null || placingType === null) return;
      void run(() =>
        api.addItsDevice(crossing.id, { device_type: placingType, x, z }).then((device) => {
          setCrossing((prev) => (prev ? { ...prev, its_devices: [...prev.its_devices, device] } : prev));
          // установили объект — сразу выходим из режима установки и открываем его редактирование
          setPlacingType(null);
          setSelectedDeviceId(device.id);
        }),
      );
    },
    [crossing, placingType, run],
  );

  const onSelectDevice = useCallback((id: number) => setSelectedDeviceId(id), []);

  const onChangeDevice = useCallback(
    (id: number, devicePatch: Parameters<typeof api.updateItsDevice>[1]) => {
      void run(() =>
        api.updateItsDevice(id, devicePatch).then((updated) => {
          setCrossing((prev) =>
            prev
              ? { ...prev, its_devices: prev.its_devices.map((d) => (d.id === id ? updated : d)) }
              : prev,
          );
        }),
      );
    },
    [run],
  );

  const onDeleteDevice = useCallback(
    (id: number) => {
      void run(() =>
        api.removeItsDevice(id).then(() => {
          setCrossing((prev) =>
            prev ? { ...prev, its_devices: prev.its_devices.filter((d) => d.id !== id) } : prev,
          );
        }),
      ).then(() => setSelectedDeviceId(null));
    },
    [run],
  );

  const selectedDevice = crossing?.its_devices.find((d) => d.id === selectedDeviceId) ?? null;

  return (
    <div className="relative h-full w-full">
      <SceneView
        crossing={crossing}
        view={view}
        placingType={placingType}
        onPlace={onPlace}
        editingId={selectedDeviceId}
        onSelectDevice={onSelectDevice}
      />

      <header className="pointer-events-none absolute top-4 left-4 z-10">
        <h1 className="text-lg font-semibold text-slate-100">
          SmartTrafficLight
          {crossing ? <span className="text-slate-400"> · {crossing.name}</span> : null}
        </h1>
        <p className="text-xs text-slate-400">
          пешеходный переход через дорогу — меняйте полосы, ставьте ИТС-объекты и смотрите с разных сторон
        </p>
      </header>

      <aside
        className="absolute top-4 right-4 z-10 flex w-80 max-w-[calc(100vw-2rem)] flex-col gap-3 overflow-y-auto"
        style={{ maxHeight: "calc(100vh - 2rem)" }}
      >
        {selectedDevice && (
          <DeviceEditor
            device={selectedDevice}
            busy={busy}
            onChange={(devicePatch) => onChangeDevice(selectedDevice.id, devicePatch)}
            onDelete={() => onDeleteDevice(selectedDevice.id)}
            onClose={() => setSelectedDeviceId(null)}
          />
        )}
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
          placingType={placingType}
          onStartPlacing={onStartPlacing}
          onStopPlacing={onStopPlacing}
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
