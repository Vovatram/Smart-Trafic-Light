import { Html } from "@react-three/drei";

import type { Crossing, CrossingPatch } from "../types";
import { roadGeometry, spawnPoints, type SpawnKey } from "./layout";

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

export function GenerationBadges({
  crossing,
  onChange,
}: {
  crossing: Crossing;
  onChange: (patch: CrossingPatch) => void;
}) {
  const geo = roadGeometry(crossing);
  const points = spawnPoints(geo);

  return (
    <>
      {points.map((point) => {
        const field = FIELD[point.key];
        const value = crossing[field] as number;
        return (
          <Html key={point.key} position={[point.x, 1.8, point.z]} center>
            <div className="flex w-32 flex-col items-center gap-1 rounded-lg border border-slate-600 bg-slate-900/95 px-2.5 py-2 text-center shadow-xl">
              <span className="text-[11px] font-medium text-slate-200">{LABEL[point.key]}</span>
              <input
                type="number"
                min={0}
                max={2000}
                step={20}
                defaultValue={value}
                key={value}
                onBlur={(event) => {
                  const next = Number(event.target.value);
                  if (Number.isFinite(next) && next !== value) {
                    onChange({ [field]: Math.min(2000, Math.max(0, next)) } as CrossingPatch);
                  }
                }}
                className="w-full rounded border border-slate-700 bg-slate-800 px-1 py-0.5 text-center text-sm text-slate-100"
              />
              <span className="text-[10px] text-slate-500">{UNIT[point.key]}</span>
            </div>
          </Html>
        );
      })}
    </>
  );
}
