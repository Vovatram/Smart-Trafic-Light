import { useCallback, useEffect, useState } from "react";

import { api } from "./api/client";
import { DeviceEditor } from "./components/DeviceEditor";
import { HistoryPanel } from "./components/HistoryPanel";
import { InfoPanel } from "./components/InfoPanel";
import { SignalModePanel } from "./components/SignalModePanel";
import { useHistoryPlayback } from "./hooks/useHistoryPlayback";
import { useSignalState } from "./hooks/useSignalState";
import { SceneView, type ViewName } from "./scene/SceneView";
import type {
  Crossing,
  CrossingBrief,
  DeviceType,
  PedestrianSignal,
  SignalMode,
  VehicleSignal,
} from "./types";

export default function App() {
  const [crossings, setCrossings] = useState<CrossingBrief[]>([]);
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [crossing, setCrossing] = useState<Crossing | null>(null);
  const [view, setView] = useState<ViewName>("perspective");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [placingType, setPlacingType] = useState<DeviceType | null>(null);
  const [selectedDeviceIds, setSelectedDeviceIds] = useState<ReadonlySet<number>>(new Set());
  const [generationPanelOpen, setGenerationPanelOpen] = useState(false);
  const [signalPanelOpen, setSignalPanelOpen] = useState(true);

  const { live, requestCall } = useSignalState(crossing);
  const historyPlayback = useHistoryPlayback(crossing);

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
  const onRoadLengthChange = useCallback((value: number) => patch({ road_length: value }), [patch]);
  const onLogRetentionChange = useCallback(
    (value: number) => patch({ log_retention_hours: value }),
    [patch],
  );

  const { openHistory } = historyPlayback;
  const onOpenDeviceJournal = useCallback((deviceId: number) => openHistory("journal", deviceId), [openHistory]);

  const onStartPlacing = useCallback((type: DeviceType) => {
    setPlacingType(type);
    setSelectedDeviceIds(new Set());
    setGenerationPanelOpen(false);
    setView("top");
  }, []);
  const onStopPlacing = useCallback(() => setPlacingType(null), []);

  // видимость плашек интенсивности на сцене напрямую следует за открытостью
  // панели "Генерация" — свернул панель, плашки пропали, отдельного тумблера нет
  const onGenerationOpenChange = useCallback((open: boolean) => {
    setGenerationPanelOpen(open);
    if (open) {
      setPlacingType(null);
      setSelectedDeviceIds(new Set());
      setView("top");
    }
  }, []);

  const onPlace = useCallback(
    (x: number, z: number) => {
      if (crossing === null || placingType === null) return;
      void run(() =>
        api.addItsDevice(crossing.id, { device_type: placingType, x, z }).then((device) => {
          setCrossing((prev) => (prev ? { ...prev, its_devices: [...prev.its_devices, device] } : prev));
          // установили объект — сразу выходим из режима установки и открываем его редактирование
          setPlacingType(null);
          setSelectedDeviceIds(new Set([device.id]));
        }),
      );
    },
    [crossing, placingType, run],
  );

  // клик по объекту всегда добавляет/убирает его из выбора — без Ctrl/Cmd;
  // чтобы оставить только один, сначала кликните по пустому месту сцены
  const onSelectDevice = useCallback((id: number) => {
    setSelectedDeviceIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);
  const onClearSelection = useCallback(() => setSelectedDeviceIds(new Set()), []);

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
      ).then(() => setSelectedDeviceIds(new Set()));
    },
    [run],
  );

  // --- светофор: клик по лампе в сцене раскрывает панель режима и переводит в ручной ---
  const focusSignalPanel = useCallback(() => {
    setSignalPanelOpen(true);
    setSelectedDeviceIds(new Set());
  }, []);
  const onClickVehicleLight = useCallback(() => {
    focusSignalPanel();
    patch({ signal_mode: "manual" });
  }, [focusSignalPanel, patch]);
  const onClickPedestrianLight = onClickVehicleLight;
  const onPickVehicle = useCallback(
    (value: VehicleSignal) => patch({ vehicle_signal: value, signal_mode: "manual" }),
    [patch],
  );
  const onPickPedestrian = useCallback(
    (value: PedestrianSignal) => patch({ pedestrian_signal: value, signal_mode: "manual" }),
    [patch],
  );

  // --- режим управления: ручной / адаптивный / циклы / кнопка ---
  const onSetMode = useCallback((mode: SignalMode) => patch({ signal_mode: mode }), [patch]);
  const onSelectCycle = useCallback((id: number) => patch({ active_cycle_id: id }), [patch]);
  const onAllRedAfterCarsChange = useCallback(
    (value: number) => patch({ all_red_after_cars_s: value }),
    [patch],
  );
  const onAllRedAfterPedsChange = useCallback(
    (value: number) => patch({ all_red_after_peds_s: value }),
    [patch],
  );
  const onButtonMinGreenChange = useCallback(
    (value: number) => patch({ button_min_green_s: value }),
    [patch],
  );
  const onButtonPedsChange = useCallback(
    (value: number) => patch({ button_peds_s: value }),
    [patch],
  );

  const onAddCycle = useCallback(
    (draft: { name: string; green_cars_s: number; green_peds_s: number }) => {
      if (crossing === null) return;
      void run(() =>
        api.addSignalCycle(crossing.id, draft).then((cycle) => {
          setCrossing((prev) => (prev ? { ...prev, cycles: [...prev.cycles, cycle] } : prev));
        }),
      );
    },
    [crossing, run],
  );

  const onDeleteCycle = useCallback(
    (id: number) => {
      void run(() =>
        api.removeSignalCycle(id).then(() => {
          setCrossing((prev) =>
            prev
              ? {
                  ...prev,
                  cycles: prev.cycles.filter((c) => c.id !== id),
                  active_cycle_id: prev.active_cycle_id === id ? null : prev.active_cycle_id,
                }
              : prev,
          );
        }),
      );
    },
    [run],
  );

  // редактор открывается только при выборе ровно одного объекта; при нескольких
  // выбранных панель скрыта, но секторы обзора у всех выбранных остаются видны
  const selectedDevice =
    selectedDeviceIds.size === 1
      ? (crossing?.its_devices.find((d) => selectedDeviceIds.has(d.id)) ?? null)
      : null;

  // бейдж скрыт и в ручном режиме (нет расписания), и когда сама панель
  // "Режим светофора" свёрнута — доп. параметры видны, только пока она открыта
  const formatBadge = (value: string): string => {
    if (!crossing || crossing.signal_mode === "manual" || !signalPanelOpen || !value) return "";
    return value === "АУ" ? "АУ" : `${value} с`;
  };
  const vehicleStatusLabel = formatBadge(live.vehicleLabel);
  const pedestrianStatusLabel = formatBadge(live.pedestrianLabel);

  return (
    <div className="relative h-full w-full">
      <SceneView
        crossing={crossing}
        view={view}
        placingType={placingType}
        onPlace={onPlace}
        selectedDeviceIds={selectedDeviceIds}
        onSelectDevice={onSelectDevice}
        onClearSelection={onClearSelection}
        generationMode={generationPanelOpen}
        onChangeCrossing={patch}
        vehicleSignal={live.vehicle}
        pedestrianSignal={live.pedestrian}
        vehicleStatusLabel={vehicleStatusLabel}
        pedestrianStatusLabel={pedestrianStatusLabel}
        onClickVehicleLight={onClickVehicleLight}
        onClickPedestrianLight={onClickPedestrianLight}
        onPedestrianWaiting={requestCall}
        showTrafficCounts={signalPanelOpen}
        replay={historyPlayback.replay}
      />

      {selectedDevice && (
        <aside
          className="absolute top-4 left-4 z-10 w-80 max-w-[calc(100vw-2rem)] overflow-y-auto"
          style={{ maxHeight: "calc(100vh - 2rem)" }}
        >
          <DeviceEditor
            device={selectedDevice}
            busy={busy}
            onChange={(devicePatch) => onChangeDevice(selectedDevice.id, devicePatch)}
            onDelete={() => onDeleteDevice(selectedDevice.id)}
            onClose={onClearSelection}
            onOpenJournal={() => onOpenDeviceJournal(selectedDevice.id)}
          />
        </aside>
      )}

      <aside
        className="absolute top-4 right-4 z-10 flex w-80 max-w-[calc(100vw-2rem)] flex-col gap-3 overflow-y-auto"
        style={{ maxHeight: "calc(100vh - 2rem)" }}
      >
        {crossing && (
          <SignalModePanel
            crossing={crossing}
            busy={busy}
            callPending={live.callPending}
            open={signalPanelOpen}
            onOpenChange={setSignalPanelOpen}
            onSetMode={onSetMode}
            onPickVehicle={onPickVehicle}
            onPickPedestrian={onPickPedestrian}
            onSelectCycle={onSelectCycle}
            onAddCycle={onAddCycle}
            onDeleteCycle={onDeleteCycle}
            onAllRedAfterCarsChange={onAllRedAfterCarsChange}
            onAllRedAfterPedsChange={onAllRedAfterPedsChange}
            onButtonMinGreenChange={onButtonMinGreenChange}
            onButtonPedsChange={onButtonPedsChange}
            onPressButton={requestCall}
          />
        )}
        <InfoPanel
          crossings={crossings}
          selectedId={selectedId}
          onSelect={setSelectedId}
          crossing={crossing}
          onLanesForward={onLanesForward}
          onLanesBackward={onLanesBackward}
          onRoadLengthChange={onRoadLengthChange}
          onLogRetentionChange={onLogRetentionChange}
          onPatch={patch}
          busy={busy}
          view={view}
          onView={setView}
          placingType={placingType}
          onStartPlacing={onStartPlacing}
          onStopPlacing={onStopPlacing}
          selectedDeviceIds={selectedDeviceIds}
          onSelectDevice={onSelectDevice}
          generationOpen={generationPanelOpen}
          onGenerationOpenChange={onGenerationOpenChange}
          onOpenHistory={openHistory}
        />
      </aside>

      {historyPlayback.open && crossing && <HistoryPanel playback={historyPlayback} />}

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
