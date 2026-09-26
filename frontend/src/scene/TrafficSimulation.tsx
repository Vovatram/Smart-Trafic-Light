import { useFrame } from "@react-three/fiber";
import { useMemo, useRef } from "react";
import * as THREE from "three";

import type { Crossing } from "../types";
import { detectingColors, sensorDevices } from "./detection";
import { laneCenterX, roadGeometry, type RoadGeometry } from "./layout";

const CAR_SPEED = 8; // м/с
const PED_SPEED = 1.3; // м/с
const CAR_POOL = 24;
const PED_POOL = 24;
const CAR_MIN_GAP = 6.5; // м — минимальная дистанция до идущей впереди машины в той же полосе
const PED_MIN_GAP = 1.0; // м — то же самое для пешеходов на одной "дорожке"
const LANE_EPS = 0.5; // допуск, чтобы считать двух агентов "в одной полосе"
const HIDDEN_COLOR = "#334155"; // цвет "по умолчанию" — виден только пока идёт transition, реально не рендерится

/** Слот пула: переиспользуемое состояние одного агента (машины или пешехода). */
interface Slot {
  active: boolean;
  x: number;
  z: number;
  /** направление движения: для машин вдоль Z, для пешеходов вдоль X */
  dir: 1 | -1;
}

function makePool(n: number): Slot[] {
  return Array.from({ length: n }, () => ({ active: false, x: 0, z: 0, dir: 1 }));
}

function trySpawnCars(pool: Slot[], geo: RoadGeometry, crossing: Crossing, dt: number) {
  if (geo.lanesForward > 0 && crossing.vph_forward > 0) {
    if (Math.random() < (crossing.vph_forward / 3600) * dt) {
      const slot = pool.find((s) => !s.active);
      if (slot) {
        const lane = Math.floor(Math.random() * geo.lanesForward);
        slot.active = true;
        slot.dir = 1;
        slot.x = laneCenterX(geo, "forward", lane);
        slot.z = -geo.roadLength;
      }
    }
  }
  if (geo.lanesBackward > 0 && crossing.vph_backward > 0) {
    if (Math.random() < (crossing.vph_backward / 3600) * dt) {
      const slot = pool.find((s) => !s.active);
      if (slot) {
        const lane = Math.floor(Math.random() * geo.lanesBackward);
        slot.active = true;
        slot.dir = -1;
        slot.x = laneCenterX(geo, "backward", lane);
        slot.z = geo.roadLength;
      }
    }
  }
}

const PED_SPAWN_MARGIN = 1.0; // ближайший к бордюру край площадки ожидания
const PED_SPAWN_DEPTH = 2.0; // насколько вглубь тротуара разбросан спавн
const PED_SPAWN_HALF_WIDTH_EXTRA = 1.0; // площадка чуть шире самого перехода

function trySpawnPeds(pool: Slot[], geo: RoadGeometry, crossing: Crossing, dt: number) {
  const halfWidth = geo.crossingWidth / 2 + PED_SPAWN_HALF_WIDTH_EXTRA;
  if (crossing.peds_left_vph > 0) {
    if (Math.random() < (crossing.peds_left_vph / 3600) * dt) {
      const slot = pool.find((s) => !s.active);
      if (slot) {
        slot.active = true;
        slot.dir = 1;
        // площадка перед переходом, а не линия: разброс и вглубь тротуара, и вдоль дороги
        slot.x = geo.leftEdge - PED_SPAWN_MARGIN - Math.random() * PED_SPAWN_DEPTH;
        slot.z = (Math.random() - 0.5) * 2 * halfWidth;
      }
    }
  }
  if (crossing.peds_right_vph > 0) {
    if (Math.random() < (crossing.peds_right_vph / 3600) * dt) {
      const slot = pool.find((s) => !s.active);
      if (slot) {
        slot.active = true;
        slot.dir = -1;
        slot.x = geo.rightEdge + PED_SPAWN_MARGIN + Math.random() * PED_SPAWN_DEPTH;
        slot.z = (Math.random() - 0.5) * 2 * halfWidth;
      }
    }
  }
}

/**
 * Урезает желаемую скорость до 0, если впереди в той же полосе (тот же dir,
 * та же "боковая" координата с точностью LANE_EPS) слишком близко другой
 * активный агент — простая очередь без формул IDM, но без наложения машин
 * друг на друга у стоп-линии.
 */
function gapLimitedSpeed(pool: Slot[], self: Slot, axis: "x" | "z", desired: number, minGap: number): number {
  if (desired === 0) return 0;
  let nearestGap = Infinity;
  for (const other of pool) {
    if (other === self || !other.active || other.dir !== self.dir) continue;
    const lateral = axis === "z" ? other.x - self.x : other.z - self.z;
    if (Math.abs(lateral) > LANE_EPS) continue;
    const primary = axis === "z" ? other.z - self.z : other.x - self.x;
    const ahead = self.dir > 0 ? primary : -primary;
    if (ahead > 0 && ahead < nearestGap) nearestGap = ahead;
  }
  return nearestGap < minGap ? 0 : desired;
}

/**
 * Двигает агента вдоль его оси на gap-limited скорости и, если сигнал не
 * пускает и он ещё не пересёк границу (gate, симметрично ±gate от центра),
 * не даёт ему проехать дальше неё — сама скорость при этом не трогается,
 * поэтому агент едет к границе нормально и тормозит уже вплотную к ней, а
 * не сразу при спавне. Тот, кто уже за границей, идёт дальше без ограничений.
 */
function advanceWithGate(
  pool: Slot[],
  dt: number,
  axis: "x" | "z",
  speed: number,
  minGap: number,
  go: boolean,
  gate: number,
  bound: { min: number; max: number },
) {
  for (const s of pool) {
    if (!s.active) continue;
    const coord = axis === "z" ? s.z : s.x;
    const crossedGate = s.dir > 0 ? coord >= -gate : coord <= gate;
    const limited = gapLimitedSpeed(pool, s, axis, speed, minGap);
    let next = coord + s.dir * limited * dt;
    if (!go && !crossedGate) {
      next = s.dir > 0 ? Math.min(next, -gate) : Math.max(next, gate);
    }
    if (axis === "z") s.z = next;
    else s.x = next;
    if (next > bound.max || next < bound.min) s.active = false;
  }
}

/**
 * Машины продолжают появляться и ехать даже на красный — просто тормозят
 * перед стоп-линией (crossingHalf + stopOffset от центра) и ждут зелёного.
 * Та, что уже проехала эту границу, доезжает переход не останавливаясь.
 */
function advanceCars(pool: Slot[], crossing: Crossing, dt: number, geo: RoadGeometry) {
  const green = crossing.vehicle_signal === "green";
  const stopZ = geo.crossingHalf + geo.stopOffset;
  advanceWithGate(pool, dt, "z", CAR_SPEED, CAR_MIN_GAP, green, stopZ, {
    min: -geo.roadLength,
    max: geo.roadLength,
  });
}

/**
 * Пешеходы так же продолжают выходить на тротуар и на красный — но
 * останавливаются на границе проезжей части. Кто уже ступил на переход,
 * когда сигнал был "идите", договаривает его до конца при любом сигнале.
 */
function advancePeds(pool: Slot[], crossing: Crossing, dt: number, geo: RoadGeometry) {
  const walk = crossing.pedestrian_signal === "walk";
  // "граница дороги" в терминах gate — расстояние от центра (0) до края
  // проезжей части ближе к её "своей" стороне (leftEdge/rightEdge — со
  // знаком, gate в advanceWithGate считается симметрично от 0)
  const gateLeft = -geo.leftEdge; // leftEdge отрицательный — переводим в положительную "дистанцию от 0"
  const gateRight = geo.rightEdge;
  // площадки спавна разной глубины слева/справа возможны при разных lane-counts,
  // поэтому despawn считаем по каждой стороне отдельно, а не общим gate
  const spawnDepth = PED_SPAWN_MARGIN + PED_SPAWN_DEPTH;
  const rightBound = geo.rightEdge + spawnDepth + 1;
  const leftBound = geo.leftEdge - spawnDepth - 1;

  for (const s of pool) {
    if (!s.active) continue;
    const gate = s.dir > 0 ? gateLeft : gateRight;
    const crossedGate = s.dir > 0 ? s.x >= -gateLeft : s.x <= gateRight;
    const limited = gapLimitedSpeed(pool, s, "x", PED_SPEED, PED_MIN_GAP);
    let next = s.x + s.dir * limited * dt;
    if (!walk && !crossedGate) {
      next = s.dir > 0 ? Math.min(next, -gate) : Math.max(next, gate);
    }
    s.x = next;
    if (s.x > rightBound || s.x < leftBound) s.active = false;
  }
}

/** Два полу-блока рядом — так объект можно покрасить в 1 или 2 цвета сразу. */
function TwoTonePod({
  width,
  height,
  depth,
  y,
  refA,
  refB,
}: {
  width: number;
  height: number;
  depth: number;
  y: number;
  refA: (el: THREE.Mesh | null) => void;
  refB: (el: THREE.Mesh | null) => void;
}) {
  const half = width / 2;
  return (
    <>
      <mesh ref={refA} position={[-width / 4, y, 0]} castShadow>
        <boxGeometry args={[half, height, depth]} />
        <meshStandardMaterial color={HIDDEN_COLOR} roughness={0.5} />
      </mesh>
      <mesh ref={refB} position={[width / 4, y, 0]} castShadow>
        <boxGeometry args={[half, height, depth]} />
        <meshStandardMaterial color={HIDDEN_COLOR} roughness={0.5} />
      </mesh>
    </>
  );
}

function applyDetection(
  slot: Slot,
  group: THREE.Group | null,
  halfA: THREE.Mesh | null,
  halfB: THREE.Mesh | null,
  sensors: ReturnType<typeof sensorDevices>,
  allDevices: Crossing["its_devices"],
  axis: "x" | "z",
) {
  if (!group) return;
  if (!slot.active) {
    group.visible = false;
    return;
  }
  const colors = detectingColors(sensors, allDevices, slot.x, slot.z);
  if (colors.length === 0) {
    group.visible = false;
    return;
  }
  group.visible = true;
  group.position.set(slot.x, 0, slot.z);
  group.rotation.y =
    axis === "z" ? (slot.dir > 0 ? 0 : Math.PI) : slot.dir > 0 ? Math.PI / 2 : -Math.PI / 2;

  const colorA = colors[0];
  const colorB = colors.length > 1 ? colors[1] : colors[0];
  if (halfA) (halfA.material as THREE.MeshStandardMaterial).color.set(colorA);
  if (halfB) (halfB.material as THREE.MeshStandardMaterial).color.set(colorB);
}

/**
 * Процедурная генерация машин и пешеходов: спавн по интенсивности (в час) с
 * каждого из 4 "начал", движение только на зелёный/"идите", отрисовка —
 * только пока агент виден хотя бы одному датчику (камере/микроволновому),
 * цветом этого датчика (двумя цветами, если видят двое).
 */
export function TrafficSimulation({ crossing }: { crossing: Crossing }) {
  const geo = useMemo(() => roadGeometry(crossing), [crossing]);
  const sensors = useMemo(() => sensorDevices(crossing.its_devices), [crossing.its_devices]);

  const cars = useRef<Slot[]>(makePool(CAR_POOL));
  const peds = useRef<Slot[]>(makePool(PED_POOL));

  const carGroups = useRef<(THREE.Group | null)[]>([]);
  const carHalvesA = useRef<(THREE.Mesh | null)[]>([]);
  const carHalvesB = useRef<(THREE.Mesh | null)[]>([]);
  const pedGroups = useRef<(THREE.Group | null)[]>([]);
  const pedHalvesA = useRef<(THREE.Mesh | null)[]>([]);
  const pedHalvesB = useRef<(THREE.Mesh | null)[]>([]);

  useFrame((_, rawDelta) => {
    const dt = Math.min(rawDelta, 0.1);

    trySpawnCars(cars.current, geo, crossing, dt);
    trySpawnPeds(peds.current, geo, crossing, dt);
    advanceCars(cars.current, crossing, dt, geo);
    advancePeds(peds.current, crossing, dt, geo);

    cars.current.forEach((slot, i) =>
      applyDetection(
        slot,
        carGroups.current[i],
        carHalvesA.current[i],
        carHalvesB.current[i],
        sensors,
        crossing.its_devices,
        "z",
      ),
    );
    peds.current.forEach((slot, i) =>
      applyDetection(
        slot,
        pedGroups.current[i],
        pedHalvesA.current[i],
        pedHalvesB.current[i],
        sensors,
        crossing.its_devices,
        "x",
      ),
    );
  });

  return (
    <group>
      {Array.from({ length: CAR_POOL }).map((_, i) => (
        <group key={`car-${i}`} ref={(el) => (carGroups.current[i] = el)} visible={false}>
          <TwoTonePod
            width={1.8}
            height={1.0}
            depth={4.4}
            y={0.58}
            refA={(el) => (carHalvesA.current[i] = el)}
            refB={(el) => (carHalvesB.current[i] = el)}
          />
        </group>
      ))}
      {Array.from({ length: PED_POOL }).map((_, i) => (
        <group key={`ped-${i}`} ref={(el) => (pedGroups.current[i] = el)} visible={false}>
          <TwoTonePod
            width={0.5}
            height={1.6}
            depth={0.4}
            y={0.8}
            refA={(el) => (pedHalvesA.current[i] = el)}
            refB={(el) => (pedHalvesB.current[i] = el)}
          />
        </group>
      ))}
    </group>
  );
}
