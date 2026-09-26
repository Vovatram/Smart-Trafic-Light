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

function trySpawnPeds(pool: Slot[], geo: RoadGeometry, crossing: Crossing, dt: number) {
  if (crossing.peds_left_vph > 0) {
    if (Math.random() < (crossing.peds_left_vph / 3600) * dt) {
      const slot = pool.find((s) => !s.active);
      if (slot) {
        slot.active = true;
        slot.dir = 1;
        slot.x = geo.leftEdge - 1.4;
        slot.z = (Math.random() - 0.5) * geo.crossingWidth * 0.6;
      }
    }
  }
  if (crossing.peds_right_vph > 0) {
    if (Math.random() < (crossing.peds_right_vph / 3600) * dt) {
      const slot = pool.find((s) => !s.active);
      if (slot) {
        slot.active = true;
        slot.dir = -1;
        slot.x = geo.rightEdge + 1.4;
        slot.z = (Math.random() - 0.5) * geo.crossingWidth * 0.6;
      }
    }
  }
}

function advanceCars(pool: Slot[], speed: number, dt: number, roadLength: number) {
  for (const s of pool) {
    if (!s.active) continue;
    s.z += s.dir * speed * dt;
    if (s.z > roadLength || s.z < -roadLength) s.active = false;
  }
}

function advancePeds(pool: Slot[], speed: number, dt: number, geo: RoadGeometry) {
  const rightBound = geo.rightEdge + 2;
  const leftBound = geo.leftEdge - 2;
  for (const s of pool) {
    if (!s.active) continue;
    s.x += s.dir * speed * dt;
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
    const carSpeed = crossing.vehicle_signal === "green" ? CAR_SPEED : 0;
    const pedSpeed = crossing.pedestrian_signal === "walk" ? PED_SPEED : 0;

    trySpawnCars(cars.current, geo, crossing, dt);
    trySpawnPeds(peds.current, geo, crossing, dt);
    advanceCars(cars.current, carSpeed, dt, geo.roadLength);
    advancePeds(peds.current, pedSpeed, dt, geo);

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
