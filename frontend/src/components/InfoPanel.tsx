import type { ViewName } from "../scene/SceneView";
import { VIEW_LABEL, VIEW_ORDER } from "../scene/SceneView";
import type {
  CameraPole,
  CameraSide,
  Crossing,
  CrossingBrief,
  PedestrianSignal,
  VehicleSignal,
} from "../types";
import { Button, Card, Select } from "./ui";

function Stepper({
  label,
  value,
  unit = "",
  min,
  max,
  step = 1,
  onChange,
  disabled,
}: {
  label: string;
  value: number;
  unit?: string;
  min: number;
  max: number;
  step?: number;
  onChange: (value: number) => void;
  disabled: boolean;
}) {
  const round = (n: number) => Math.round(n * 100) / 100;
  return (
    <div className="flex items-center justify-between gap-2">
      <span className="text-sm text-slate-300">{label}</span>
      <div className="flex items-center gap-1.5">
        <Button
          disabled={disabled || value <= min}
          onClick={() => onChange(round(Math.max(min, value - step)))}
          className="!px-2 !py-1"
        >
          −
        </Button>
        <span className="w-10 text-center text-sm tabular-nums text-slate-100">
          {value}
          {unit}
        </span>
        <Button
          disabled={disabled || value >= max}
          onClick={() => onChange(round(Math.min(max, value + step)))}
          className="!px-2 !py-1"
        >
          +
        </Button>
      </div>
    </div>
  );
}

const VEHICLE_LABEL: Record<VehicleSignal, string> = { red: "Красный", yellow: "Жёлтый", green: "Зелёный" };
const VEHICLE_ORDER: VehicleSignal[] = ["red", "yellow", "green"];
const PEDESTRIAN_LABEL: Record<PedestrianSignal, string> = { stop: "Стоп", walk: "Идите" };
const PEDESTRIAN_ORDER: PedestrianSignal[] = ["stop", "walk"];
const SIDE_LABEL: Record<CameraSide, string> = { left: "слева", right: "справа" };
const SIDE_ORDER: CameraSide[] = ["left", "right"];

function CameraCard({
  pole,
  index,
  busy,
  onChange,
  onRemove,
}: {
  pole: CameraPole;
  index: number;
  busy: boolean;
  onChange: (patch: Partial<Pick<CameraPole, "side" | "height" | "rotation_deg">>) => void;
  onRemove: () => void;
}) {
  return (
    <div className="space-y-2 rounded-lg border border-slate-800 p-2.5">
      <div className="flex items-center justify-between">
        <span className="text-xs font-medium text-slate-300">Камера {index + 1}</span>
        <button
          disabled={busy}
          onClick={onRemove}
          className="text-xs text-slate-500 hover:text-rose-400 disabled:opacity-40"
        >
          удалить
        </button>
      </div>

      <div className="flex items-center justify-between gap-2">
        <span className="text-sm text-slate-300">Сторона</span>
        <div className="flex gap-1.5">
          {SIDE_ORDER.map((side) => (
            <Button
              key={side}
              active={pole.side === side}
              disabled={busy}
              className="!px-2.5 !py-1"
              onClick={() => onChange({ side })}
            >
              {SIDE_LABEL[side]}
            </Button>
          ))}
        </div>
      </div>

      <Stepper
        label="Высота"
        value={pole.height}
        unit=" м"
        min={1.5}
        max={12}
        step={0.5}
        disabled={busy}
        onChange={(height) => onChange({ height })}
      />
      <Stepper
        label="Поворот"
        value={pole.rotation_deg}
        unit="°"
        min={0}
        max={345}
        step={15}
        disabled={busy}
        onChange={(rotation_deg) => onChange({ rotation_deg })}
      />
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
  onVehicleSignal,
  onPedestrianSignal,
  busy,
  view,
  onView,
  onAddCamera,
  onChangeCamera,
  onRemoveCamera,
}: {
  crossings: CrossingBrief[];
  selectedId: number | null;
  onSelect: (id: number) => void;
  crossing: Crossing | null;
  onLanesForward: (value: number) => void;
  onLanesBackward: (value: number) => void;
  onVehicleSignal: (value: VehicleSignal) => void;
  onPedestrianSignal: (value: PedestrianSignal) => void;
  busy: boolean;
  view: ViewName;
  onView: (view: ViewName) => void;
  onAddCamera: () => void;
  onChangeCamera: (id: number, patch: Partial<Pick<CameraPole, "side" | "height" | "rotation_deg">>) => void;
  onRemoveCamera: (id: number) => void;
}) {
  return (
    <>
      <Card title="Переход">
        <div className="space-y-3">
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
              <p className="text-[11px] leading-snug text-slate-500">
                Правостороннее движение: N едет от вас в глубину сцены, K — навстречу.
                Всего {crossing.lanes_forward + crossing.lanes_backward} полос, ширина
                полосы {crossing.lane_width} м.
              </p>
            </div>
          )}
        </div>
      </Card>

      <Card title="Вид сцены">
        <div className="grid grid-cols-2 gap-2">
          {VIEW_ORDER.map((name) => (
            <Button key={name} active={view === name} onClick={() => onView(name)}>
              {VIEW_LABEL[name]}
            </Button>
          ))}
        </div>
        <p className="mt-2 text-[11px] leading-snug text-slate-500">
          Мышь: левая кнопка — поворот, колесо — приближение, правая — сдвиг.
        </p>
      </Card>

      {crossing && (
        <Card title="Сигналы">
          <div className="space-y-3">
            <div>
              <span className="mb-1 block text-xs text-slate-400">Автомобильный</span>
              <div className="flex gap-2">
                {VEHICLE_ORDER.map((value) => (
                  <Button
                    key={value}
                    active={crossing.vehicle_signal === value}
                    disabled={busy}
                    className="flex-1"
                    onClick={() => onVehicleSignal(value)}
                  >
                    {VEHICLE_LABEL[value]}
                  </Button>
                ))}
              </div>
            </div>
            <div>
              <span className="mb-1 block text-xs text-slate-400">Пешеходный</span>
              <div className="flex gap-2">
                {PEDESTRIAN_ORDER.map((value) => (
                  <Button
                    key={value}
                    active={crossing.pedestrian_signal === value}
                    disabled={busy}
                    className="flex-1"
                    onClick={() => onPedestrianSignal(value)}
                  >
                    {PEDESTRIAN_LABEL[value]}
                  </Button>
                ))}
              </div>
            </div>
          </div>
        </Card>
      )}

      {crossing && (
        <Card title="Камеры наблюдения">
          <div className="space-y-2.5">
            {crossing.camera_poles.length === 0 && (
              <p className="text-xs text-slate-500">Пока не добавлено ни одной камеры.</p>
            )}
            {crossing.camera_poles.map((pole, index) => (
              <CameraCard
                key={pole.id}
                pole={pole}
                index={index}
                busy={busy}
                onChange={(patch) => onChangeCamera(pole.id, patch)}
                onRemove={() => onRemoveCamera(pole.id)}
              />
            ))}
            <Button variant="primary" className="w-full" disabled={busy} onClick={onAddCamera}>
              + Добавить столб с камерой
            </Button>
          </div>
        </Card>
      )}
    </>
  );
}
