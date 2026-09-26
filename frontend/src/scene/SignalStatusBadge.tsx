import { Html } from "@react-three/drei";
import { useMemo } from "react";

import type { Crossing } from "../types";
import { poles, roadGeometry } from "./layout";
import { PEDESTRIAN_HEAD_Y, VEHICLE_HEAD_Y } from "./SignalMasts";

const VEHICLE_BADGE_Y = VEHICLE_HEAD_Y + 0.9;
const PEDESTRIAN_BADGE_Y = PEDESTRIAN_HEAD_Y + 0.6;

function Badge({ x, y, z, value }: { x: number; y: number; z: number; value: string }) {
  return (
    <Html position={[x, y, z]} center>
      <div className="rounded-full border border-slate-600 bg-slate-900/90 px-2 py-0.5 text-[11px] font-semibold tabular-nums text-slate-100 shadow-lg">
        {value}
      </div>
    </Html>
  );
}

/**
 * Два числовых поля над каждым столбом — отдельно для автомобильного и
 * пешеходного сигнала (у них разное расписание смены цвета). Пустая строка
 * скрывает конкретное поле (так в ручном режиме, где расписания нет).
 */
export function SignalStatusBadge({
  crossing,
  vehicleLabel,
  pedestrianLabel,
}: {
  crossing: Crossing;
  vehicleLabel: string;
  pedestrianLabel: string;
}) {
  const geo = useMemo(() => roadGeometry(crossing), [crossing]);
  const items = useMemo(() => poles(geo), [geo]);

  if (!vehicleLabel && !pedestrianLabel) return null;

  return (
    <>
      {items.map((pole) => (
        <group key={pole.key}>
          {vehicleLabel && <Badge x={pole.x} y={VEHICLE_BADGE_Y} z={pole.z} value={vehicleLabel} />}
          {pedestrianLabel && (
            <Badge x={pole.x} y={PEDESTRIAN_BADGE_Y} z={pole.z} value={pedestrianLabel} />
          )}
        </group>
      ))}
    </>
  );
}
