import { useState } from "react";

import type { ViewName } from "../scene/SceneView";
import { VIEW_LABEL, VIEW_ORDER } from "../scene/SceneView";
import type { Crossing, CrossingBrief, CrossingPatch, DeviceType, StopPosition } from "../types";
import { Button, Card, Checkbox, Select, Stepper } from "./ui";

const DEVICE_LABEL: Record<DeviceType, string> = {
  camera: "Камера",
  microwave: "Микроволновый датчик",
  loop: "Индукционная петля",
};
const DEVICE_ORDER: DeviceType[] = ["camera", "microwave", "loop"];

/**
 * Трамвай/автобус ЗАМЕНЯЮТ существующую полосу направления (трамвай —
 * самую левую, автобус — самую правую), велополоса, наоборот, добавляет
 * ширину сбоку — см. frontend/scene/layout.ts. Остановка — только
 * визуальный маркер платформы, без имитации посадки/высадки.
 */
function TransitColumn({
  label,
  disabled,
  hasTram,
  hasBus,
  hasBike,
  tramStop,
  busStop,
  onSetTram,
  onSetBus,
  onSetBike,
  onSetTramStop,
  onSetBusStop,
}: {
  label: string;
  disabled: boolean;
  hasTram: boolean;
  hasBus: boolean;
  hasBike: boolean;
  tramStop: StopPosition;
  busStop: StopPosition;
  onSetTram: (value: boolean) => void;
  onSetBus: (value: boolean) => void;
  onSetBike: (value: boolean) => void;
  onSetTramStop: (value: StopPosition) => void;
  onSetBusStop: (value: StopPosition) => void;
}) {
  return (
    <div className="space-y-2">
      <span className="block text-[11px] font-semibold tracking-wide text-slate-400 uppercase">
        {label}
      </span>
      <Checkbox label="Трамвайные пути" checked={hasTram} disabled={disabled} onChange={onSetTram} />
      {hasTram && (
        <Select value={tramStop} onChange={(value) => onSetTramStop(value as StopPosition)}>
          <option value="none">Без остановки</option>
          <option value="before">Остановка до перехода</option>
          <option value="after">Остановка после перехода</option>
        </Select>
      )}
      <Checkbox label="Автобусная полоса" checked={hasBus} disabled={disabled} onChange={onSetBus} />
      {hasBus && (
        <Select value={busStop} onChange={(value) => onSetBusStop(value as StopPosition)}>
          <option value="none">Без остановки</option>
          <option value="before">Остановка до перехода</option>
          <option value="after">Остановка после перехода</option>
        </Select>
      )}
      <Checkbox label="Велополоса" checked={hasBike} disabled={disabled} onChange={onSetBike} />
    </div>
  );
}

export function InfoPanel({
  crossings,
  selectedId,
  onSelect,
  crossing,
  onLanesForward,
  onLanesBackward,
  onRoadLengthChange,
  onLogRetentionChange,
  onPatch,
  busy,
  view,
  onView,
  placingType,
  onStartPlacing,
  onStopPlacing,
  selectedDeviceIds,
  onSelectDevice,
  generationOpen,
  onGenerationOpenChange,
  onOpenHistory,
}: {
  crossings: CrossingBrief[];
  selectedId: number | null;
  onSelect: (id: number) => void;
  crossing: Crossing | null;
  onLanesForward: (value: number) => void;
  onLanesBackward: (value: number) => void;
  onRoadLengthChange: (value: number) => void;
  onLogRetentionChange: (value: number) => void;
  onPatch: (patch: CrossingPatch) => void;
  busy: boolean;
  view: ViewName;
  onView: (view: ViewName) => void;
  placingType: DeviceType | null;
  onStartPlacing: (type: DeviceType) => void;
  onStopPlacing: () => void;
  selectedDeviceIds: ReadonlySet<number>;
  onSelectDevice: (id: number) => void;
  generationOpen: boolean;
  onGenerationOpenChange: (open: boolean) => void;
  onOpenHistory: (tab: "journal" | "charts") => void;
}) {
  const [newDeviceType, setNewDeviceType] = useState<DeviceType>("camera");

  return (
    <>
      <Card title="Настройка перехода">
        <Select
          value={selectedId ?? ""}
          onChange={(value) => onSelect(Number(value))}
          disabled={crossings.length === 0}
        >
          {crossings.length === 0 && <option value="">нет данных</option>}
          {crossings.map((item) => (
            <option key={item.id} value={item.id}>
              {item.name}
            </option>
          ))}
        </Select>

        {crossing && (
          <div className="space-y-2 border-t border-slate-800 pt-3">
            <Stepper
              label="Полос «вперёд» (N)"
              value={crossing.lanes_forward}
              min={0}
              max={5}
              disabled={busy}
              onChange={onLanesForward}
            />
            <Stepper
              label="Полос «назад» (K)"
              value={crossing.lanes_backward}
              min={0}
              max={5}
              disabled={busy}
              onChange={onLanesBackward}
            />
            <Stepper
              label="Длина дороги"
              value={crossing.road_length}
              unit=" м"
              min={10}
              max={200}
              step={5}
              disabled={busy}
              onChange={onRoadLengthChange}
            />
            <Stepper
              label="Хранить журнал"
              value={crossing.log_retention_hours}
              unit=" ч"
              min={1}
              max={720}
              step={1}
              disabled={busy}
              onChange={onLogRetentionChange}
            />
          </div>
        )}
      </Card>

      {crossing && (
        <Card title="Трамвай, автобус, вело" defaultOpen={false}>
          <div className="grid grid-cols-2 gap-3">
            <TransitColumn
              label="Вперёд (N)"
              disabled={busy || crossing.lanes_forward < 1}
              hasTram={crossing.has_tram_forward}
              hasBus={crossing.has_bus_forward}
              hasBike={crossing.has_bike_forward}
              tramStop={crossing.tram_stop_forward}
              busStop={crossing.bus_stop_forward}
              onSetTram={(value) =>
                onPatch({ has_tram_forward: value, ...(value ? {} : { tram_stop_forward: "none" }) })
              }
              onSetBus={(value) =>
                onPatch({ has_bus_forward: value, ...(value ? {} : { bus_stop_forward: "none" }) })
              }
              onSetBike={(value) => onPatch({ has_bike_forward: value })}
              onSetTramStop={(value) => onPatch({ tram_stop_forward: value })}
              onSetBusStop={(value) => onPatch({ bus_stop_forward: value })}
            />
            <TransitColumn
              label="Назад (K)"
              disabled={busy || crossing.lanes_backward < 1}
              hasTram={crossing.has_tram_backward}
              hasBus={crossing.has_bus_backward}
              hasBike={crossing.has_bike_backward}
              tramStop={crossing.tram_stop_backward}
              busStop={crossing.bus_stop_backward}
              onSetTram={(value) =>
                onPatch({ has_tram_backward: value, ...(value ? {} : { tram_stop_backward: "none" }) })
              }
              onSetBus={(value) =>
                onPatch({ has_bus_backward: value, ...(value ? {} : { bus_stop_backward: "none" }) })
              }
              onSetBike={(value) => onPatch({ has_bike_backward: value })}
              onSetTramStop={(value) => onPatch({ tram_stop_backward: value })}
              onSetBusStop={(value) => onPatch({ bus_stop_backward: value })}
            />
          </div>
        </Card>
      )}

      <Card title="Вид сцены" defaultOpen={false}>
        <div className="grid grid-cols-2 gap-2">
          {VIEW_ORDER.map((name) => (
            <Button key={name} active={view === name} onClick={() => onView(name)}>
              {VIEW_LABEL[name]}
            </Button>
          ))}
        </div>
      </Card>

      {crossing && (
        <Card title="ИТС-объекты" defaultOpen={false}>
          {placingType ? (
            <div className="flex items-center justify-between gap-2">
              <span className="text-sm text-slate-300">{DEVICE_LABEL[placingType]}…</span>
              <Button onClick={onStopPlacing}>Отмена</Button>
            </div>
          ) : (
            <div className="flex gap-2">
              <Select value={newDeviceType} onChange={(value) => setNewDeviceType(value as DeviceType)}>
                {DEVICE_ORDER.map((type) => (
                  <option key={type} value={type}>
                    {DEVICE_LABEL[type]}
                  </option>
                ))}
              </Select>
              <Button
                variant="primary"
                disabled={busy}
                onClick={() => onStartPlacing(newDeviceType)}
              >
                Добавить
              </Button>
            </div>
          )}

          {crossing.its_devices.length > 0 && (
            <div className="space-y-1">
              {crossing.its_devices.map((device) => (
                <Button
                  key={device.id}
                  active={selectedDeviceIds.has(device.id)}
                  disabled={busy}
                  className="w-full text-left"
                  onClick={() => onSelectDevice(device.id)}
                >
                  {DEVICE_LABEL[device.device_type]} №{device.id}
                </Button>
              ))}
            </div>
          )}
        </Card>
      )}

      {crossing && (
        <Card title="Генерация" open={generationOpen} onOpenChange={onGenerationOpenChange}>
          <></>
        </Card>
      )}

      {crossing && (
        <Card title="История" defaultOpen={false}>
          <div className="grid grid-cols-2 gap-2">
            <Button onClick={() => onOpenHistory("journal")}>Журнал</Button>
            <Button onClick={() => onOpenHistory("charts")}>Графики</Button>
          </div>
        </Card>
      )}
    </>
  );
}
