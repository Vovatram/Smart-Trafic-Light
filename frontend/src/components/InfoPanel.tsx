import type { ViewName } from "../scene/SceneView";
import { VIEW_LABEL, VIEW_ORDER } from "../scene/SceneView";
import type { Crossing, CrossingBrief, DeviceType, PedestrianSignal, VehicleSignal } from "../types";
import { Button, Card, Select, Stepper } from "./ui";

const VEHICLE_LABEL: Record<VehicleSignal, string> = { red: "Красный", yellow: "Жёлтый", green: "Зелёный" };
const VEHICLE_ORDER: VehicleSignal[] = ["red", "yellow", "green"];
const PEDESTRIAN_LABEL: Record<PedestrianSignal, string> = { stop: "Стоп", walk: "Идите" };
const PEDESTRIAN_ORDER: PedestrianSignal[] = ["stop", "walk"];

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
  onVehicleSignal,
  onPedestrianSignal,
  busy,
  view,
  onView,
  placingType,
  onStartPlacing,
  onStopPlacing,
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
  placingType: DeviceType | null;
  onStartPlacing: (type: DeviceType) => void;
  onStopPlacing: () => void;
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
        <Card title="ИТС-объекты">
          {placingType ? (
            <div className="space-y-2">
              <p className="text-sm text-slate-200">
                Режим установки: <span className="font-medium">{DEVICE_LABEL[placingType]}</span>
              </p>
              <p className="text-[11px] leading-snug text-slate-500">
                Кликните по сцене — объект появится в этой точке. Можно ставить несколько подряд.
              </p>
              <Button variant="primary" className="w-full" onClick={onStopPlacing}>
                Готово
              </Button>
            </div>
          ) : (
            <div className="space-y-2">
              <p className="text-[11px] leading-snug text-slate-500">
                Включите вид сверху и кликните по сцене, чтобы поставить объект. Камера и датчик
                встают на столб у обочины; петля — на полотно дороги.
              </p>
              <div className="space-y-1.5">
                {DEVICE_ORDER.map((type) => (
                  <Button
                    key={type}
                    className="w-full"
                    disabled={busy}
                    onClick={() => onStartPlacing(type)}
                  >
                    + {DEVICE_LABEL[type]}
                  </Button>
                ))}
              </div>
              {crossing.its_devices.length > 0 && (
                <p className="text-[11px] text-slate-500">
                  Установлено: {crossing.its_devices.length}. Кликните по объекту на сцене, чтобы
                  изменить параметры или удалить.
                </p>
              )}
            </div>
          )}
        </Card>
      )}
    </>
  );
}
