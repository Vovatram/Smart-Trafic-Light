import { Html } from "@react-three/drei";
import { useMemo } from "react";

import type { Crossing, PedestrianSignal, VehicleSignal } from "../types";
import { poles, roadGeometry } from "./layout";
import {
  PEDESTRIAN_COLOR,
  PEDESTRIAN_HEAD_Y,
  VEHICLE_COLOR,
  VEHICLE_HEAD_Y,
} from "./SignalMasts";

const VEHICLE_BADGE_Y = VEHICLE_HEAD_Y + 1.1;
const PEDESTRIAN_BADGE_Y = PEDESTRIAN_HEAD_Y + 0.4;
const PEDESTRIAN_SIDE_OFFSET = 1.6; // дальше от дороги, чтобы не закрывать сам светофор

function Badge({
  x,
  y,
  z,
  title,
  value,
  color,
}: {
  x: number;
  y: number;
  z: number;
  title: string;
  value: string;
  color: string;
}) {
  return (
    <Html position={[x, y, z]} center>
      <div className="min-w-16 rounded border border-slate-600 bg-slate-900/95 px-2 py-1 text-center shadow-lg">
        <div className="text-[10px] font-medium tracking-wide text-slate-400 uppercase">{title}</div>
        <div className="text-xs font-bold tabular-nums" style={{ color }}>
          {value}
        </div>
      </div>
    </Html>
  );
}

/**
 * Автомобильный бейдж — один, по центру перехода (не над столбами, чтобы не
 * закрывать светофор и не дублироваться на обоих столбах разом). Пешеходный
 * — у каждого столба, но сдвинут в сторону от дороги (дальше по X от
 * центра, в ту же сторону, куда уже смотрит сам столб), чтобы не
 * перекрывать пешеходную голову светофора. Цвет текста — цвет текущего
 * сигнала, а не фиксированный.
 */
export function SignalStatusBadge({
  crossing,
  vehicleLabel,
  pedestrianLabel,
  vehicleSignal,
  pedestrianSignal,
}: {
  crossing: Crossing;
  vehicleLabel: string;
  pedestrianLabel: string;
  vehicleSignal: VehicleSignal;
  pedestrianSignal: PedestrianSignal;
}) {
  const geo = useMemo(() => roadGeometry(crossing), [crossing]);
  const items = useMemo(() => poles(geo), [geo]);

  if (!vehicleLabel && !pedestrianLabel) return null;

  return (
    <>
      {vehicleLabel && (
        <Badge
          x={0}
          y={VEHICLE_BADGE_Y}
          z={0}
          title="Автомобильный"
          value={vehicleLabel}
          color={VEHICLE_COLOR[vehicleSignal]}
        />
      )}
      {pedestrianLabel &&
        items.map((pole) => (
          <Badge
            key={pole.key}
            x={pole.x + Math.sign(pole.x) * PEDESTRIAN_SIDE_OFFSET}
            y={PEDESTRIAN_BADGE_Y}
            z={pole.z}
            title="Пешеходный"
            value={pedestrianLabel}
            color={PEDESTRIAN_COLOR[pedestrianSignal]}
          />
        ))}
    </>
  );
}
