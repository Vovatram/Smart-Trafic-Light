import type { PedestrianSignal, SceneSnapshot, VehicleSignal } from "../types";

export interface ReplayFrame {
  cars: SceneSnapshot["cars"];
  peds: SceneSnapshot["peds"];
  vehicleSignal: VehicleSignal;
  pedestrianSignal: PedestrianSignal;
}

function lerpSlot(
  a: SceneSnapshot["cars"][number],
  b: SceneSnapshot["cars"][number],
  t: number,
): SceneSnapshot["cars"][number] {
  // если слот появился/исчез между двумя снимками — не тянем позицию из
  // ниоткуда, просто показываем ту сторону, где он реально активен
  if (!a || !b) return b ?? a ?? null;
  return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, b[2]];
}

/**
 * Строит кадр реплея на момент atMs линейной интерполяцией между двумя
 * ближайшими снимками сцены (снимки пишутся раз в SCENE_SNAPSHOT_INTERVAL_S,
 * между ними позиции агентов "докручиваются" плавно). Список snapshots
 * должен быть отсортирован по возрастанию `at` (сервер уже отдаёт так).
 */
export function buildReplayFrame(snapshots: SceneSnapshot[], atMs: number): ReplayFrame | null {
  if (snapshots.length === 0) return null;

  const times = snapshots.map((s) => new Date(s.at).getTime());
  if (atMs <= times[0]) {
    const s = snapshots[0];
    return { cars: s.cars, peds: s.peds, vehicleSignal: s.vehicle_signal, pedestrianSignal: s.pedestrian_signal };
  }
  const last = snapshots.length - 1;
  if (atMs >= times[last]) {
    const s = snapshots[last];
    return { cars: s.cars, peds: s.peds, vehicleSignal: s.vehicle_signal, pedestrianSignal: s.pedestrian_signal };
  }

  // бинарный поиск пары (lo, lo+1), между которыми лежит atMs
  let lo = 0;
  let hi = last;
  while (hi - lo > 1) {
    const mid = (lo + hi) >> 1;
    if (times[mid] <= atMs) lo = mid;
    else hi = mid;
  }

  const prev = snapshots[lo];
  const next = snapshots[hi];
  const span = times[hi] - times[lo];
  const t = span > 0 ? (atMs - times[lo]) / span : 0;

  const cars = Array.from({ length: Math.max(prev.cars.length, next.cars.length) }, (_, i) =>
    lerpSlot(prev.cars[i] ?? null, next.cars[i] ?? null, t),
  );
  const peds = Array.from({ length: Math.max(prev.peds.length, next.peds.length) }, (_, i) =>
    lerpSlot(prev.peds[i] ?? null, next.peds[i] ?? null, t),
  );

  return {
    cars,
    peds,
    vehicleSignal: prev.vehicle_signal,
    pedestrianSignal: prev.pedestrian_signal,
  };
}
