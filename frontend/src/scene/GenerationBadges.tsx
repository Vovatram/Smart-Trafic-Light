import { Html } from "@react-three/drei";

import type { Crossing, CrossingPatch } from "../types";
import { busLaneIndex, laneCenterX, roadGeometry, spawnPoints, tramLaneIndex, type SpawnKey } from "./layout";

const LABEL: Record<SpawnKey, string> = {
  forward: "Машины →",
  backward: "Машины ←",
  pedLeft: "Пешеходы →",
  pedRight: "Пешеходы ←",
};

const FIELD: Record<SpawnKey, keyof CrossingPatch> = {
  forward: "vph_forward",
  backward: "vph_backward",
  pedLeft: "peds_left_vph",
  pedRight: "peds_right_vph",
};

const UNIT: Record<SpawnKey, string> = {
  forward: "авто/ч",
  backward: "авто/ч",
  pedLeft: "чел/ч",
  pedRight: "чел/ч",
};

interface Point {
  key: string;
  x: number;
  z: number;
  label: string;
  field: keyof CrossingPatch;
  unit: string;
  max: number;
}

/** Спецтехника едет по обычным полосам — точки ставим чуть в глубине дороги от основного "Машины", чтобы бейджи не перекрывались. */
function transitPoints(crossing: Crossing): Point[] {
  const geo = roadGeometry(crossing);
  const L = geo.roadLength;
  const points: Point[] = [];

  if (geo.lanesForward > 0) {
    points.push({
      key: "special-forward",
      x: laneCenterX(geo, "forward", 0),
      z: -L + 6,
      label: "Спецтехника →",
      field: "special_vph_forward",
      unit: "ед/ч",
      max: 30,
    });
  }
  if (geo.lanesBackward > 0) {
    points.push({
      key: "special-backward",
      x: laneCenterX(geo, "backward", 0),
      z: L - 6,
      label: "Спецтехника ←",
      field: "special_vph_backward",
      unit: "ед/ч",
      max: 30,
    });
  }
  if (geo.hasTramForward) {
    points.push({
      key: "tram-forward",
      x: laneCenterX(geo, "forward", tramLaneIndex()),
      z: -L,
      label: "Трамвай →",
      field: "tram_vph_forward",
      unit: "ед/ч",
      max: 60,
    });
  }
  if (geo.hasTramBackward) {
    points.push({
      key: "tram-backward",
      x: laneCenterX(geo, "backward", tramLaneIndex()),
      z: L,
      label: "Трамвай ←",
      field: "tram_vph_backward",
      unit: "ед/ч",
      max: 60,
    });
  }
  if (geo.hasBusForward) {
    points.push({
      key: "bus-forward",
      x: laneCenterX(geo, "forward", busLaneIndex(geo, "forward")),
      z: -L + 3,
      label: "Автобус →",
      field: "bus_vph_forward",
      unit: "ед/ч",
      max: 60,
    });
  }
  if (geo.hasBusBackward) {
    points.push({
      key: "bus-backward",
      x: laneCenterX(geo, "backward", busLaneIndex(geo, "backward")),
      z: L - 3,
      label: "Автобус ←",
      field: "bus_vph_backward",
      unit: "ед/ч",
      max: 60,
    });
  }
  return points;
}

function IntensityInput({
  x,
  z,
  label,
  unit,
  max,
  value,
  onChange,
}: {
  x: number;
  z: number;
  label: string;
  unit: string;
  max: number;
  value: number;
  onChange: (next: number) => void;
}) {
  return (
    <Html position={[x, 1.8, z]} center>
      <div className="flex w-32 flex-col items-center gap-1 rounded-lg border border-slate-600 bg-slate-900/95 px-2.5 py-2 text-center shadow-xl">
        <span className="text-[11px] font-medium text-slate-200">{label}</span>
        <input
          type="number"
          min={0}
          max={max}
          step={max > 100 ? 20 : 2}
          defaultValue={value}
          key={value}
          onBlur={(event) => {
            const next = Number(event.target.value);
            if (Number.isFinite(next) && next !== value) onChange(Math.min(max, Math.max(0, next)));
          }}
          className="w-full rounded border border-slate-700 bg-slate-800 px-1 py-0.5 text-center text-sm text-slate-100"
        />
        <span className="text-[10px] text-slate-500">{unit}</span>
      </div>
    </Html>
  );
}

/**
 * Единственные надписи, оставшиеся на сцене в режиме "Генерация" — сама
 * интенсивность (число в час) на каждое "начало" потока: машины/пешеходы (4
 * основных точки) плюс трамвай/автобус (только если включена их полоса) и
 * спецтехника (всегда, если у направления есть хоть одна полоса).
 */
export function GenerationBadges({
  crossing,
  onChange,
}: {
  crossing: Crossing;
  onChange: (patch: CrossingPatch) => void;
}) {
  const geo = roadGeometry(crossing);
  const points = spawnPoints(geo);
  const transit = transitPoints(crossing);

  return (
    <>
      {points.map((point) => (
        <IntensityInput
          key={point.key}
          x={point.x}
          z={point.z}
          label={LABEL[point.key]}
          unit={UNIT[point.key]}
          max={2000}
          value={crossing[FIELD[point.key]] as number}
          onChange={(next) => onChange({ [FIELD[point.key]]: next } as CrossingPatch)}
        />
      ))}
      {transit.map((point) => (
        <IntensityInput
          key={point.key}
          x={point.x}
          z={point.z}
          label={point.label}
          unit={point.unit}
          max={point.max}
          value={crossing[point.field] as number}
          onChange={(next) => onChange({ [point.field]: next } as CrossingPatch)}
        />
      ))}
    </>
  );
}
