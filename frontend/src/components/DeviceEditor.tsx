import type { DeviceType, ItsDevice, ItsDevicePatch } from "../types";
import { Button, Card, Checkbox, Stepper, TextField } from "./ui";

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
  onOpenJournal,
}: {
  device: ItsDevice;
  busy: boolean;
  onChange: (patch: ItsDevicePatch) => void;
  onDelete: () => void;
  onClose: () => void;
  onOpenJournal: () => void;
}) {
  return (
    <Card title={`Редактирование: ${DEVICE_LABEL[device.device_type]} №${device.id}`}>
      <div className="space-y-2.5">
        <Checkbox
          label="Включён"
          checked={device.enabled}
          disabled={busy}
          onChange={(enabled) => onChange({ enabled })}
        />
        <Stepper
          label="Позиция X"
          value={device.x}
          unit=" м"
          min={-100000}
          max={100000}
          step={0.5}
          disabled={busy}
          onChange={(x) => onChange({ x })}
        />
        <Stepper
          label="Позиция Z"
          value={device.z}
          unit=" м"
          min={-100000}
          max={100000}
          step={0.5}
          disabled={busy}
          onChange={(z) => onChange({ z })}
        />

        {device.device_type === "loop" ? (
          <Stepper
            label="Длина петли"
            value={device.loop_length ?? 2}
            unit=" м"
            min={0.1}
            max={100000}
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
              min={0.1}
              max={100000}
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
              min={0.1}
              max={100000}
              step={5}
              disabled={busy}
              onChange={(fov_deg) => onChange({ fov_deg })}
            />
            <Stepper
              label="Радиус обзора"
              value={device.view_radius ?? 35}
              unit=" м"
              min={0.1}
              max={100000}
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

        <Button className="w-full" onClick={onOpenJournal}>
          Журнал
        </Button>
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
