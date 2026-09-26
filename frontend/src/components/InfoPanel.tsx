import type { ViewName } from "../scene/SceneView";
import { VIEW_LABEL, VIEW_ORDER } from "../scene/SceneView";
import type { Crossing, CrossingBrief, PedestrianSignal, VehicleSignal } from "../types";
import { Button, Card, Select } from "./ui";

function LaneStepper({
  label,
  value,
  onChange,
  disabled,
}: {
  label: string;
  value: number;
  onChange: (value: number) => void;
  disabled: boolean;
}) {
  return (
    <div className="flex items-center justify-between gap-2">
      <span className="text-sm text-slate-300">{label}</span>
      <div className="flex items-center gap-1.5">
        <Button
          disabled={disabled || value <= 0}
          onClick={() => onChange(value - 1)}
          className="!px-2 !py-1"
        >
          −
        </Button>
        <span className="w-5 text-center text-sm tabular-nums text-slate-100">{value}</span>
        <Button
          disabled={disabled || value >= 5}
          onClick={() => onChange(value + 1)}
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
              <LaneStepper
                label="Полос «вперёд» (N)"
                value={crossing.lanes_forward}
                onChange={onLanesForward}
                disabled={busy}
              />
              <LaneStepper
                label="Полос «назад» (K)"
                value={crossing.lanes_backward}
                onChange={onLanesBackward}
                disabled={busy}
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

      <Card title="Камера">
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
    </>
  );
}
