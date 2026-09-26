import type { DeviceType, ItsDevice, ItsDevicePatch } from "../types";
import { Button, Stepper, TextField } from "./ui";

const DEVICE_LABEL: Record<DeviceType, string> = {
  camera: "Камера",
  microwave: "Микроволновый датчик",
  loop: "Индукционная петля",
};

export function DeviceEditor({
  device,
  busy,
  onChange,
  onDelete,
  onClose,
}: {
  device: ItsDevice;
  busy: boolean;
  onChange: (patch: ItsDevicePatch) => void;
  onDelete: () => void;
  onClose: () => void;
}) {
  return (
    <div className="absolute inset-0 z-20 flex items-center justify-center bg-black/50 p-4">
      <div className="w-full max-w-sm rounded-xl border border-slate-700/60 bg-slate-900/95 p-4 shadow-2xl backdrop-blur-sm">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-sm font-semibold text-slate-100">
            {DEVICE_LABEL[device.device_type]} №{device.id}
          </h2>
          <button onClick={onClose} className="text-slate-500 hover:text-slate-200" aria-label="Закрыть">
            ✕
          </button>
        </div>

        <div className="space-y-2.5">
          <Stepper
            label="Позиция X"
            value={device.x}
            unit=" м"
            min={-500}
            max={500}
            step={0.5}
            disabled={busy}
            onChange={(x) => onChange({ x })}
          />
          <Stepper
            label="Позиция Z"
            value={device.z}
            unit=" м"
            min={-500}
            max={500}
            step={0.5}
            disabled={busy}
            onChange={(z) => onChange({ z })}
          />

          {device.device_type === "loop" ? (
            <Stepper
              label="Длина петли"
              value={device.loop_length ?? 2}
              unit=" м"
              min={0.5}
              max={5}
              step={0.5}
              disabled={busy}
              onChange={(loop_length) => onChange({ loop_length })}
            />
          ) : (
            <>
              <Stepper
                label="Высота столба"
                value={device.height ?? 5}
                unit=" м"
                min={1.5}
                max={12}
                step={0.5}
                disabled={busy}
                onChange={(height) => onChange({ height })}
              />
              <Stepper
                label="Поворот"
                value={device.rotation_deg ?? 0}
                unit="°"
                min={0}
                max={345}
                step={15}
                disabled={busy}
                onChange={(rotation_deg) => onChange({ rotation_deg })}
              />
              <Stepper
                label="Угол обзора"
                value={device.fov_deg ?? 60}
                unit="°"
                min={5}
                max={180}
                step={5}
                disabled={busy}
                onChange={(fov_deg) => onChange({ fov_deg })}
              />
              <Stepper
                label="Радиус обзора"
                value={device.view_radius ?? 35}
                unit=" м"
                min={2}
                max={150}
                step={5}
                disabled={busy}
                onChange={(view_radius) => onChange({ view_radius })}
              />
              {device.device_type === "camera" && (
                <TextField
                  label="Ссылка на трансляцию"
                  value={device.stream_url ?? ""}
                  placeholder="https://..."
                  disabled={busy}
                  onCommit={(stream_url) => onChange({ stream_url: stream_url || null })}
                />
              )}
            </>
          )}
        </div>

        <div className="mt-4 flex gap-2">
          <Button variant="danger" className="flex-1" disabled={busy} onClick={onDelete}>
            Удалить
          </Button>
          <Button className="flex-1" onClick={onClose}>
            Закрыть
          </Button>
        </div>
      </div>
    </div>
  );
}
