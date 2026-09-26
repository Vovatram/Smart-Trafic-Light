import type { Crossing, StopPosition } from "../types";

/**
 * Геометрия прямого участка дороги с пешеходным переходом посередине.
 *
 * Система координат: дорога идёт вдоль оси Z, ось X — поперёк, Y — вверх
 * (правая тройка, как в three.js). Правостороннее движение: у каждого
 * направления полосы лежат со своей правой стороны по ходу движения. Для
 * машины, едущей в сторону +Z, "право" — это -X (правило правой руки:
 * right = (-Fz, 0, Fx) для вектора движения F); для машины, едущей в
 * сторону -Z, "право" — это +X. Поэтому полосы "вперёд" (N) лежат при
 * X < 0, полосы "назад" (K) — при X > 0. Переход — зона вокруг Z = 0.
 */
export interface RoadGeometry {
  laneWidth: number;
  lanesForward: number;
  lanesBackward: number;
  roadLength: number;
  crossingWidth: number;
  /** правая (по X) граница проезжей части (машины+трамвай+автобус) — дальний край полос "назад" */
  rightEdge: number;
  /** левая (по X) граница проезжей части — дальний край полос "вперёд", отрицательная */
  leftEdge: number;
  /** то же самое, но с учётом велополосы (если есть) — именно от этой границы стоят столбы/тротуар */
  outerRightEdge: number;
  outerLeftEdge: number;
  bikeRightWidth: number;
  bikeLeftWidth: number;
  hasTramForward: boolean;
  hasTramBackward: boolean;
  hasBusForward: boolean;
  hasBusBackward: boolean;
  hasBikeForward: boolean;
  hasBikeBackward: boolean;
  tramStopForward: StopPosition;
  tramStopBackward: StopPosition;
  busStopForward: StopPosition;
  busStopBackward: StopPosition;
  crossingHalf: number;
  poleOffset: number;
  stopOffset: number;
  /** предел, в котором можно ставить ИТС-объекты кликом (по X и по Z) */
  placementMarginX: number;
  placementMarginZ: number;
}

const POLE_OFFSET = 1.0; // отступ столба светофора от края проезжей части (считая велополосу)
const STOP_OFFSET = 1.0; // отступ стоп-линии/столба от края перехода
const PLACEMENT_PADDING = 12; // насколько дальше края дороги можно ставить объекты
const SIDEWALK_OFFSET = 1.4; // отступ тротуара (старта пешехода) от края проезжей части (считая велополосу)
export const BIKE_LANE_WIDTH = 1.8; // велополоса добавляет ширину, а не отъедает у проезжей части

export function roadGeometry(crossing: Crossing): RoadGeometry {
  const laneWidth = crossing.lane_width;
  const lanesForward = crossing.lanes_forward;
  const lanesBackward = crossing.lanes_backward;
  const rightEdge = lanesBackward * laneWidth;
  const leftEdge = -lanesForward * laneWidth;
  const bikeLeftWidth = crossing.has_bike_forward ? BIKE_LANE_WIDTH : 0;
  const bikeRightWidth = crossing.has_bike_backward ? BIKE_LANE_WIDTH : 0;
  return {
    laneWidth,
    lanesForward,
    lanesBackward,
    roadLength: crossing.road_length,
    crossingWidth: crossing.crossing_width,
    rightEdge,
    leftEdge,
    outerRightEdge: rightEdge + bikeRightWidth,
    outerLeftEdge: leftEdge - bikeLeftWidth,
    bikeRightWidth,
    bikeLeftWidth,
    hasTramForward: crossing.has_tram_forward,
    hasTramBackward: crossing.has_tram_backward,
    hasBusForward: crossing.has_bus_forward,
    hasBusBackward: crossing.has_bus_backward,
    hasBikeForward: crossing.has_bike_forward,
    hasBikeBackward: crossing.has_bike_backward,
    tramStopForward: crossing.tram_stop_forward,
    tramStopBackward: crossing.tram_stop_backward,
    busStopForward: crossing.bus_stop_forward,
    busStopBackward: crossing.bus_stop_backward,
    crossingHalf: crossing.crossing_width / 2,
    poleOffset: POLE_OFFSET,
    stopOffset: STOP_OFFSET,
    placementMarginX: Math.max(rightEdge + bikeRightWidth, -leftEdge + bikeLeftWidth) + PLACEMENT_PADDING,
    placementMarginZ: crossing.road_length,
  };
}

/** Индекс полосы (считая от осевой линии — см. laneCenterX), которую занимает трамвай: самая "левая". */
export function tramLaneIndex(): number {
  return 0;
}

/** Индекс полосы, которую занимает автобус: самая "правая" (ближе к обочине) из полос направления. */
export function busLaneIndex(geo: RoadGeometry, dir: "forward" | "backward"): number {
  const count = dir === "forward" ? geo.lanesForward : geo.lanesBackward;
  return count - 1;
}

export function isTramLane(geo: RoadGeometry, dir: "forward" | "backward", lane: number): boolean {
  const has = dir === "forward" ? geo.hasTramForward : geo.hasTramBackward;
  return has && lane === tramLaneIndex();
}

export function isBusLane(geo: RoadGeometry, dir: "forward" | "backward", lane: number): boolean {
  const has = dir === "forward" ? geo.hasBusForward : geo.hasBusBackward;
  return has && lane === busLaneIndex(geo, dir);
}

/** Индексы полос, свободных под обычные машины/спецтехнику — без трамвайной/автобусной. */
export function carLaneIndices(geo: RoadGeometry, dir: "forward" | "backward"): number[] {
  const count = dir === "forward" ? geo.lanesForward : geo.lanesBackward;
  const result: number[] = [];
  for (let lane = 0; lane < count; lane += 1) {
    if (isTramLane(geo, dir, lane) || isBusLane(geo, dir, lane)) continue;
    result.push(lane);
  }
  return result;
}

/** Зажимает точку клика в разумные пределы сцены для установки ИТС-объекта. */
export function clampPlacement(geo: RoadGeometry, x: number, z: number): [number, number] {
  const cx = Math.min(Math.max(x, -geo.placementMarginX), geo.placementMarginX);
  const cz = Math.min(Math.max(z, -geo.placementMarginZ), geo.placementMarginZ);
  return [Math.round(cx * 10) / 10, Math.round(cz * 10) / 10];
}

/** Зажимает точку клика на полотно дороги — для индукционной петли. */
export function clampToRoad(geo: RoadGeometry, x: number, z: number): [number, number] {
  const cx = Math.min(Math.max(x, geo.leftEdge), geo.rightEdge);
  const cz = Math.min(Math.max(z, -geo.roadLength), geo.roadLength);
  return [Math.round(cx * 10) / 10, Math.round(cz * 10) / 10];
}

/** Столб стоит перед переходом со стороны, откуда едет обслуживаемое им направление. */
export interface PoleSpec {
  key: "forward" | "backward";
  x: number;
  z: number;
  /** курс (рад.) автомобильного сигнала — навстречу обслуживаемому потоку */
  vehicleFacing: number;
  /** курс (рад.) пешеходного сигнала — к пешеходам, ждущим на этой стороне */
  pedestrianFacing: number;
}

export function poles(geo: RoadGeometry): PoleSpec[] {
  const list: PoleSpec[] = [];
  if (geo.lanesForward > 0) {
    list.push({
      key: "forward",
      x: geo.outerLeftEdge - geo.poleOffset,
      z: -(geo.crossingHalf + geo.stopOffset),
      vehicleFacing: Math.PI, // смотрит в сторону -Z, навстречу машинам, едущим в +Z
      pedestrianFacing: Math.PI / 2, // смотрит в сторону +X, через дорогу
    });
  }
  if (geo.lanesBackward > 0) {
    list.push({
      key: "backward",
      x: geo.outerRightEdge + geo.poleOffset,
      z: geo.crossingHalf + geo.stopOffset,
      vehicleFacing: 0, // смотрит в сторону +Z, навстречу машинам, едущим в -Z
      pedestrianFacing: -Math.PI / 2, // смотрит в сторону -X, через дорогу
    });
  }
  return list;
}

/** Центр полосы для машины: индекс 0 — ближайшая к осевой (для левого поворота в старой схеме). */
export function laneCenterX(geo: RoadGeometry, dir: "forward" | "backward", lane: number): number {
  const offset = (lane + 0.5) * geo.laneWidth;
  return dir === "forward" ? -offset : offset;
}

/** Отступ тротуара от края проезжей части (считая велополосу, если есть) — там же "начало" пешеходного потока. */
export function sidewalkX(geo: RoadGeometry, side: "left" | "right"): number {
  return side === "left" ? geo.outerLeftEdge - SIDEWALK_OFFSET : geo.outerRightEdge + SIDEWALK_OFFSET;
}

const STOP_MARKER_EXTRA = 4; // отступ платформы от стоп-линии/перехода
export const STOP_MARKER_LENGTH = 8;

/** Позиция (x, z) остановочной платформы — null, если остановки нет. */
export function stopMarkerPosition(
  geo: RoadGeometry,
  dir: "forward" | "backward",
  lane: number,
  position: StopPosition,
): { x: number; z: number } | null {
  if (position === "none") return null;
  const dirSign = dir === "forward" ? 1 : -1;
  const x = laneCenterX(geo, dir, lane);
  const half = STOP_MARKER_LENGTH / 2;
  // "before" — до перехода, по ходу движения ЭТОГО направления (там же, где стоп-линия);
  // "after" — после перехода, дальше по ходу движения
  const z =
    position === "before"
      ? -dirSign * (geo.crossingHalf + geo.stopOffset + STOP_MARKER_EXTRA + half)
      : dirSign * (geo.crossingHalf + STOP_MARKER_EXTRA + half);
  return { x, z };
}

