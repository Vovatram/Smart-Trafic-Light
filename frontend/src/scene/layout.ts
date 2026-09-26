import type { Crossing } from "../types";

/**
 * Геометрия прямого участка дороги с пешеходным переходом посередине.
 *
 * Система координат: дорога идёт вдоль оси Z, ось X — поперёк. Правостороннее
 * движение: полосы направления "вперёд" (N, едут в сторону +Z) лежат справа
 * от осевой, то есть при X > 0; полосы направления "назад" (K, едут в сторону
 * -Z) лежат слева, при X < 0. Переход — зона вокруг Z = 0.
 */
export interface RoadGeometry {
  laneWidth: number;
  lanesForward: number;
  lanesBackward: number;
  roadLength: number;
  crossingWidth: number;
  /** правая граница дороги (X), т.е. дальний край полос "вперёд" */
  rightEdge: number;
  /** левая граница дороги (X), т.е. дальний край полос "назад" (отрицательная) */
  leftEdge: number;
  crossingHalf: number;
  poleOffset: number;
  stopOffset: number;
}

const POLE_OFFSET = 1.0; // отступ столба от края проезжей части
const STOP_OFFSET = 1.0; // отступ стоп-линии/столба от края перехода

export function roadGeometry(crossing: Crossing): RoadGeometry {
  const laneWidth = crossing.lane_width;
  const lanesForward = crossing.lanes_forward;
  const lanesBackward = crossing.lanes_backward;
  return {
    laneWidth,
    lanesForward,
    lanesBackward,
    roadLength: crossing.road_length,
    crossingWidth: crossing.crossing_width,
    rightEdge: lanesForward * laneWidth,
    leftEdge: -lanesBackward * laneWidth,
    crossingHalf: crossing.crossing_width / 2,
    poleOffset: POLE_OFFSET,
    stopOffset: STOP_OFFSET,
  };
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
      x: geo.rightEdge + geo.poleOffset,
      z: -(geo.crossingHalf + geo.stopOffset),
      vehicleFacing: Math.PI, // смотрит в сторону -Z, навстречу машинам, едущим в +Z
      pedestrianFacing: -Math.PI / 2, // смотрит в сторону -X, через дорогу
    });
  }
  if (geo.lanesBackward > 0) {
    list.push({
      key: "backward",
      x: geo.leftEdge - geo.poleOffset,
      z: geo.crossingHalf + geo.stopOffset,
      vehicleFacing: 0, // смотрит в сторону +Z, навстречу машинам, едущим в -Z
      pedestrianFacing: Math.PI / 2, // смотрит в сторону +X, через дорогу
    });
  }
  return list;
}
