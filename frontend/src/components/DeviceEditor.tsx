import type { DeviceType, ItsDevice, ItsDevicePatch } from "../types";
import { Button, Card, Stepper, TextField } from "./ui";

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
    <Card title={`Редактирование: ${DEVICE_LABEL[device.device_type]} №${device.id}`}>
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
              max={360}
              step={15}
              wrap
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
            <p className="text-[11px] leading-snug text-slate-500">
              Зона обзора показывается на сцене, пока идёт редактирование.
            </p>
          </>
        )}

        <div className="flex gap-2 pt-1">
          <Button variant="danger" className="flex-1" disabled={busy} onClick={onDelete}>
            Удалить
          </Button>
          <Button className="flex-1" onClick={onClose}>
            Готово
          </Button>
        </div>
      </div>
    </Card>
  );
}
