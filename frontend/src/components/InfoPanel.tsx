import { useState } from "react";

import type { ViewName } from "../scene/SceneView";
import { VIEW_LABEL, VIEW_ORDER } from "../scene/SceneView";
import type { Crossing, CrossingBrief, DeviceType } from "../types";
import { Button, Card, Select, Stepper } from "./ui";

const DEVICE_LABEL: Record<DeviceType, string> = {
  camera: "Камера",
  microwave: "Микроволновый датчик",
  loop: "Индукционная петля",
};
const DEVICE_ORDER: DeviceType[] = ["camera", "microwave", "loop"];

export function InfoPanel({
  crossings,
  selectedId,
  onSelect,
  crossing,
  onLanesForward,
  onLanesBackward,
  busy,
  view,
  onView,
  placingType,
  onStartPlacing,
  onStopPlacing,
  editingId,
  onSelectDevice,
  generationMode,
  onStartGeneration,
  onStopGeneration,
}: {
  crossings: CrossingBrief[];
  selectedId: number | null;
  onSelect: (id: number) => void;
  crossing: Crossing | null;
  onLanesForward: (value: number) => void;
  onLanesBackward: (value: number) => void;
  busy: boolean;
  view: ViewName;
  onView: (view: ViewName) => void;
  placingType: DeviceType | null;
  onStartPlacing: (type: DeviceType) => void;
  onStopPlacing: () => void;
  editingId: number | null;
  onSelectDevice: (id: number) => void;
  generationMode: boolean;
  onStartGeneration: () => void;
  onStopGeneration: () => void;
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
          </div>
        )}
      </Card>

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
                  active={device.id === editingId}
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
        <Card title="Генерация" defaultOpen={false}>
          <div className="grid grid-cols-2 gap-2">
            <Button active={!generationMode} onClick={onStopGeneration}>
              Реальный режим
            </Button>
            <Button active={generationMode} disabled={busy} onClick={onStartGeneration}>
              Генерация
            </Button>
          </div>
        </Card>
      )}
    </>
  );
}
