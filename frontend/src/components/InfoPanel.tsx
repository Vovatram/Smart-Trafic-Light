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
  generationMode: boolean;
  onStartGeneration: () => void;
  onStopGeneration: () => void;
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
        <Card title="ИТС-объекты">
          {placingType ? (
            <div className="space-y-2">
              <p className="text-sm text-slate-200">
                Режим установки: <span className="font-medium">{DEVICE_LABEL[placingType]}</span>
              </p>
              <p className="text-[11px] leading-snug text-slate-500">
                Водите мышью по сцене — полупрозрачный силуэт показывает, где встанет объект.
                Кликните, чтобы поставить его и сразу перейти к настройке.
              </p>
              <Button className="w-full" onClick={onStopPlacing}>
                Отмена
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

      {crossing && (
        <Card title="Генерация потока">
          {generationMode ? (
            <div className="space-y-2">
              <p className="text-[11px] leading-snug text-slate-500">
                Плашки на сцене — число машин/пешеходов в час для каждого из 4 начал потока.
                Введите значение и уберите фокус с поля, чтобы сохранить.
              </p>
              <Button className="w-full" onClick={onStopGeneration}>
                Готово
              </Button>
            </div>
          ) : (
            <div className="space-y-2">
              <p className="text-[11px] leading-snug text-slate-500">
                Машины едут только на зелёный, пешеходы — только на «идите», и видны только там,
                где их застаёт зона обзора камеры или датчика.
              </p>
              <Button className="w-full" disabled={busy} onClick={onStartGeneration}>
                Настроить интенсивность
              </Button>
            </div>
          )}
        </Card>
      )}
    </>
  );
}
