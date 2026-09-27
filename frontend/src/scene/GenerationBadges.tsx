import { Html } from "@react-three/drei";

import type { Crossing, CrossingPatch } from "../types";
import { roadGeometry, sidewalkX, type RoadGeometry } from "./layout";
import type { ManualSpawnRef, SpawnKind } from "./TrafficSimulation";

interface Entry {
  spawnKind: SpawnKind;
  label: string;
  field: keyof CrossingPatch;
  unit: string;
}

/** Всё, что реально едет "вперёд" с этого конца дороги: машины (всегда, если есть полосы), спецтехника, трамвай/автобус (только если включена их полоса). */
function forwardCluster(geo: RoadGeometry): Entry[] {
  const entries: Entry[] = [];
  if (geo.lanesForward > 0) {
    entries.push({ spawnKind: "forward", label: "Машины →", field: "vph_forward", unit: "авто/ч" });
    entries.push({ spawnKind: "special-forward", label: "Спецтехника →", field: "special_vph_forward", unit: "ед/ч" });
  }
  if (geo.hasTramForward) {
    entries.push({ spawnKind: "tram-forward", label: "Трамвай →", field: "tram_vph_forward", unit: "ед/ч" });
  }
  if (geo.hasBusForward) {
    entries.push({ spawnKind: "bus-forward", label: "Автобус →", field: "bus_vph_forward", unit: "ед/ч" });
  }
  return entries;
}

function backwardCluster(geo: RoadGeometry): Entry[] {
  const entries: Entry[] = [];
  if (geo.lanesBackward > 0) {
    entries.push({ spawnKind: "backward", label: "Машины ←", field: "vph_backward", unit: "авто/ч" });
    entries.push({
      spawnKind: "special-backward",
      label: "Спецтехника ←",
      field: "special_vph_backward",
      unit: "ед/ч",
    });
  }
  if (geo.hasTramBackward) {
    entries.push({ spawnKind: "tram-backward", label: "Трамвай ←", field: "tram_vph_backward", unit: "ед/ч" });
  }
  if (geo.hasBusBackward) {
    entries.push({ spawnKind: "bus-backward", label: "Автобус ←", field: "bus_vph_backward", unit: "ед/ч" });
  }
  return entries;
}

/**
 * Ряд панелек рядом друг с другом (по X), а не наложенных друг на друга —
 * шаг пропорционален зуму вида "сверху" (viewPositions в SceneView ставит
 * камеру на высоту ~roadLength*1.6), иначе на длинной дороге фиксированный
 * шаг в метрах снова окажется меньше ширины самой панельки на экране.
 */
function rowPositions(anchorX: number, z: number, count: number, spacing: number): Array<{ x: number; z: number }> {
  return Array.from({ length: count }, (_, i) => ({ x: anchorX + (i - (count - 1) / 2) * spacing, z }));
}

function IntensityInput({
  x,
  z,
  label,
  unit,
  value,
  onChange,
  onSpawn,
}: {
  x: number;
  z: number;
  label: string;
  unit: string;
  value: number;
  onChange: (next: number) => void;
  onSpawn?: () => void;
}) {
  return (
    <Html position={[x, 1.8, z]} center>
      <div className="flex w-32 flex-col items-center gap-1 rounded-lg border border-slate-600 bg-slate-900/95 px-2.5 py-2 text-center shadow-xl">
        <span className="text-[11px] font-medium text-slate-200">{label}</span>
        <input
          type="number"
          min={0}
          step={20}
          defaultValue={value}
          key={value}
          onBlur={(event) => {
            const next = Number(event.target.value);
            if (Number.isFinite(next) && next !== value) onChange(Math.max(0, next));
          }}
          className="w-full rounded border border-slate-700 bg-slate-800 px-1 py-0.5 text-center text-sm text-slate-100"
        />
        <span className="text-[10px] text-slate-500">{unit}</span>
        {onSpawn && (
          <button
            onClick={onSpawn}
            className="mt-0.5 w-full rounded bg-sky-600/80 px-1 py-0.5 text-[10px] font-semibold text-white transition hover:bg-sky-500"
          >
            Спавн
          </button>
        )}
      </div>
    </Html>
  );
}

/**
 * Единственные надписи, оставшиеся на сцене в режиме "Генерация" — сама
 * интенсивность (число в час) на каждое "начало" потока, плюс кнопка
 * "Спавн" — спавнит одного агента этого типа немедленно, не дожидаясь
 * вероятностного тика (удобно проверить, что полоса/остановка настроена
 * верно, не выставляя интенсивность и не ожидая её). Все панельки одного
 * "начала" (машины/спецтехника/трамвай/автобус) выстроены в ряд рядом друг
 * с другом, а не наложены друг на друга.
 */
export function GenerationBadges({
  crossing,
  onChange,
  manualSpawnRef,
}: {
  crossing: Crossing;
  onChange: (patch: CrossingPatch) => void;
  manualSpawnRef?: ManualSpawnRef;
}) {
  const geo = roadGeometry(crossing);
  const spacing = Math.max(geo.roadLength, 20) * 0.24;

  const forward = forwardCluster(geo);
  const backward = backwardCluster(geo);
  const forwardPos = rowPositions(geo.leftEdge / 2, -geo.roadLength, forward.length, spacing);
  const backwardPos = rowPositions(geo.rightEdge / 2, geo.roadLength, backward.length, spacing);

  const pedLeft: Entry = { spawnKind: "pedLeft", label: "Пешеходы →", field: "peds_left_vph", unit: "чел/ч" };
  const pedRight: Entry = { spawnKind: "pedRight", label: "Пешеходы ←", field: "peds_right_vph", unit: "чел/ч" };

  const requestSpawn = (kind: SpawnKind) => {
    if (!manualSpawnRef) return;
    manualSpawnRef.current.add(kind);
  };

  const renderEntry = (entry: Entry, pos: { x: number; z: number }) => (
    <IntensityInput
      key={entry.spawnKind}
      x={pos.x}
      z={pos.z}
      label={entry.label}
      unit={entry.unit}
      value={crossing[entry.field] as number}
      onChange={(next) => onChange({ [entry.field]: next } as CrossingPatch)}
      onSpawn={manualSpawnRef ? () => requestSpawn(entry.spawnKind) : undefined}
    />
  );

  return (
    <>
      {forward.map((entry, i) => renderEntry(entry, forwardPos[i]))}
      {backward.map((entry, i) => renderEntry(entry, backwardPos[i]))}
      {renderEntry(pedLeft, { x: sidewalkX(geo, "left"), z: 0 })}
      {renderEntry(pedRight, { x: sidewalkX(geo, "right"), z: 0 })}
    </>
  );
}
