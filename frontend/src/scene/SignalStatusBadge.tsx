import { Html } from "@react-three/drei";
import { useMemo } from "react";
import type { RefObject } from "react";

import type { Crossing, PedestrianSignal, VehicleSignal } from "../types";
import { poles, roadGeometry } from "./layout";
import {
  PEDESTRIAN_COLOR,
  PEDESTRIAN_HEAD_Y,
  VEHICLE_COLOR,
  VEHICLE_HEAD_Y,
} from "./SignalMasts";
import type { PedCountRefs, VehicleCountRefs } from "./TrafficSimulation";

// ниже, чем раньше (было +1.1) — на этой высоте бейдж надёжнее попадает в
// кадр во всех пресетах камеры; всё равно выше самой автомобильной головы (4.3)
const VEHICLE_BADGE_Y = VEHICLE_HEAD_Y + 0.55;
const PEDESTRIAN_BADGE_Y = PEDESTRIAN_HEAD_Y + 0.4;
const PEDESTRIAN_SIDE_OFFSET = 1.6; // дальше от дороги, чтобы не закрывать сам светофор

function Badge({
  x,
  y,
  z,
  title,
  value,
  color,
  countRef,
  sideRefs,
}: {
  x: number;
  y: number;
  z: number;
  title: string;
  value: string;
  color: string;
  /** третья строка под секундами — сколько пешеходов сейчас на этой стороне; пишется через ref, не React state */
  countRef?: (el: HTMLDivElement | null) => void;
  /** два числа рядом (лево/право на экране) — счётчики машин по направлениям, см. VehicleCountRefs */
  sideRefs?: { left: (el: HTMLDivElement | null) => void; right: (el: HTMLDivElement | null) => void };
}) {
  return (
    <Html position={[x, y, z]} center zIndexRange={[100, 0]}>
      <div
        className="min-w-16 rounded border-2 bg-slate-950 px-2 py-1 text-center shadow-[0_0_10px_rgba(0,0,0,0.6)]"
        style={{ borderColor: color, boxShadow: `0 0 8px 1px ${color}55` }}
      >
        <div className="text-[10px] font-medium tracking-wide text-slate-300 uppercase">{title}</div>
        <div className="text-sm font-bold tabular-nums" style={{ color }}>
          {value}
        </div>
        {countRef && <div ref={countRef} className="text-[10px] tabular-nums text-slate-400" />}
        {sideRefs && (
          <div className="mt-0.5 flex items-center justify-between gap-2 text-[10px] tabular-nums text-slate-400">
            <span ref={sideRefs.left} />
            <span ref={sideRefs.right} />
          </div>
        )}
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
  pedCountRef,
  vehicleCountRef,
}: {
  crossing: Crossing;
  vehicleLabel: string;
  pedestrianLabel: string;
  vehicleSignal: VehicleSignal;
  pedestrianSignal: PedestrianSignal;
  /** живые счётчики пешеходов слева/справа (пишет TrafficSimulation) — третья строка на пешеходном бейдже */
  pedCountRef?: RefObject<PedCountRefs>;
  /** живые счётчики машин лево/право НА ЭКРАНЕ (пишет TrafficSimulation по текущей камере) */
  vehicleCountRef?: RefObject<VehicleCountRefs>;
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
          sideRefs={{
            left: (el) => {
              if (vehicleCountRef?.current) vehicleCountRef.current.left = el;
            },
            right: (el) => {
              if (vehicleCountRef?.current) vehicleCountRef.current.right = el;
            },
          }}
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
            countRef={(el) => {
              if (!pedCountRef?.current) return;
              pedCountRef.current[pole.key === "forward" ? "pedLeft" : "pedRight"] = el;
            }}
          />
        ))}
    </>
  );
}
