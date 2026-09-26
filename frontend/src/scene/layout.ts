import type { Crossing } from "../types";

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
  /** правая (по X) граница дороги — дальний край полос "назад" */
  rightEdge: number;
  /** левая (по X) граница дороги — дальний край полос "вперёд", отрицательная */
  leftEdge: number;
  crossingHalf: number;
  poleOffset: number;
  stopOffset: number;
  /** предел, в котором можно ставить ИТС-объекты кликом (по X и по Z) */
  placementMarginX: number;
  placementMarginZ: number;
}

const POLE_OFFSET = 1.0; // отступ столба светофора от края проезжей части
const STOP_OFFSET = 1.0; // отступ стоп-линии/столба от края перехода
const PLACEMENT_PADDING = 12; // насколько дальше края дороги можно ставить объекты

export function roadGeometry(crossing: Crossing): RoadGeometry {
  const laneWidth = crossing.lane_width;
  const lanesForward = crossing.lanes_forward;
  const lanesBackward = crossing.lanes_backward;
  const rightEdge = lanesBackward * laneWidth;
  const leftEdge = -lanesForward * laneWidth;
  return {
    laneWidth,
    lanesForward,
    lanesBackward,
    roadLength: crossing.road_length,
    crossingWidth: crossing.crossing_width,
    rightEdge,
    leftEdge,
    crossingHalf: crossing.crossing_width / 2,
    poleOffset: POLE_OFFSET,
    stopOffset: STOP_OFFSET,
    placementMarginX: Math.max(rightEdge, -leftEdge) + PLACEMENT_PADDING,
    placementMarginZ: crossing.road_length,
  };
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
      x: geo.leftEdge - geo.poleOffset,
      z: -(geo.crossingHalf + geo.stopOffset),
      vehicleFacing: Math.PI, // смотрит в сторону -Z, навстречу машинам, едущим в +Z
      pedestrianFacing: Math.PI / 2, // смотрит в сторону +X, через дорогу
    });
  }
  if (geo.lanesBackward > 0) {
    list.push({
      key: "backward",
      x: geo.rightEdge + geo.poleOffset,
      z: geo.crossingHalf + geo.stopOffset,
      vehicleFacing: 0, // смотрит в сторону +Z, навстречу машинам, едущим в -Z
      pedestrianFacing: -Math.PI / 2, // смотрит в сторону -X, через дорогу
    });
  }
  return list;
}
