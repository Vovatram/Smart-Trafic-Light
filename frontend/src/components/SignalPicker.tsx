import type { PedestrianSignal, VehicleSignal } from "../types";
import { Button, Card } from "./ui";

const VEHICLE_LABEL: Record<VehicleSignal, string> = { red: "Красный", yellow: "Жёлтый", green: "Зелёный" };
const VEHICLE_ORDER: VehicleSignal[] = ["red", "yellow", "green"];
const PEDESTRIAN_LABEL: Record<PedestrianSignal, string> = { stop: "Стоп", walk: "Идите" };
const PEDESTRIAN_ORDER: PedestrianSignal[] = ["stop", "walk"];

/**
 * Открывается кликом по автомобильному или пешеходному светофору на сцене.
 * Выбор сигнала здесь всегда переводит переход в ручной режим — иначе выбор
 * тут же перезапишет автоматика следующим тиком.
 */
export function SignalPicker({
  kind,
  vehicleValue,
  pedestrianValue,
  isManual,
  busy,
  onPickVehicle,
  onPickPedestrian,
  onClose,
}: {
  kind: "vehicle" | "pedestrian";
  vehicleValue: VehicleSignal;
  pedestrianValue: PedestrianSignal;
  isManual: boolean;
  busy: boolean;
  onPickVehicle: (value: VehicleSignal) => void;
  onPickPedestrian: (value: PedestrianSignal) => void;
  onClose: () => void;
}) {
  return (
    <Card title={kind === "vehicle" ? "Автомобильный светофор" : "Пешеходный светофор"}>
      <div className="space-y-2.5">
        {!isManual && (
          <p className="text-[11px] leading-snug text-amber-400">
            Сейчас работает автоматика. Выбор здесь переключит переход в ручной режим.
          </p>
        )}
        <div className="flex gap-2">
          {kind === "vehicle"
            ? VEHICLE_ORDER.map((value) => (
                <Button
                  key={value}
                  active={vehicleValue === value}
                  disabled={busy}
                  className="flex-1"
                  onClick={() => onPickVehicle(value)}
                >
                  {VEHICLE_LABEL[value]}
                </Button>
              ))
            : PEDESTRIAN_ORDER.map((value) => (
                <Button
                  key={value}
                  active={pedestrianValue === value}
                  disabled={busy}
                  className="flex-1"
                  onClick={() => onPickPedestrian(value)}
                >
                  {PEDESTRIAN_LABEL[value]}
                </Button>
              ))}
        </div>
        <Button className="w-full" onClick={onClose}>
          Закрыть
        </Button>
      </div>
    </Card>
  );
}
