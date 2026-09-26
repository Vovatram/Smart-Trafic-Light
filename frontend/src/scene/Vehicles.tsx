import { useFrame } from "@react-three/fiber";
import { useMemo, useRef } from "react";
import type { RefObject } from "react";
import * as THREE from "three";

import type { Frame, Layout } from "../types";

const MAX_VEHICLES = 600;
const BODY_HEIGHT = 1.0;
const CABIN_HEIGHT = 0.6;
const SMOOTHING = 14; // чем больше, тем жёстче машина притягивается к серверной позиции

const PALETTE = [
  "#e2e8f0",
  "#7dd3fc",
  "#fca5a5",
  "#fcd34d",
  "#86efac",
  "#c4b5fd",
  "#f9a8d4",
  "#94a3b8",
];

interface Smoothed {
  x: number;
  z: number;
  h: number;
}

/**
 * Машины рисуются двумя instanced-мешами (кузов и кабина) и обновляются
 * напрямую в useFrame: React не перерисовывается на каждый кадр симуляции.
 */
export function Vehicles({
  frameRef,
  layout,
}: {
  frameRef: RefObject<Frame | null>;
  layout: Layout;
}) {
  const bodyRef = useRef<THREE.InstancedMesh>(null);
  const cabinRef = useRef<THREE.InstancedMesh>(null);
  const smoothed = useRef(new Map<number, Smoothed>());
  const dummy = useMemo(() => new THREE.Object3D(), []);
  const color = useMemo(() => new THREE.Color(), []);
  const carLength = layout.vehicle.length;
  const carWidth = layout.vehicle.width;

  useFrame((_, delta) => {
    const frame = frameRef.current;
    const body = bodyRef.current;
    const cabin = cabinRef.current;
    if (!body || !cabin) return;

    if (!frame) {
      body.count = 0;
      cabin.count = 0;
      return;
    }

    const alpha = 1 - Math.exp(-SMOOTHING * Math.min(delta, 0.1));
    const map = smoothed.current;
    const alive = new Set<number>();
    let index = 0;

    for (const vehicle of frame.vehicles) {
      if (index >= MAX_VEHICLES) break;
      alive.add(vehicle.id);
      let state = map.get(vehicle.id);
      if (state === undefined) {
        state = { x: vehicle.x, z: vehicle.z, h: vehicle.h };
        map.set(vehicle.id, state);
      } else {
        state.x += (vehicle.x - state.x) * alpha;
        state.z += (vehicle.z - state.z) * alpha;
        let deltaH = vehicle.h - state.h;
        while (deltaH > Math.PI) deltaH -= 2 * Math.PI;
        while (deltaH < -Math.PI) deltaH += 2 * Math.PI;
        state.h += deltaH * alpha;
      }

      dummy.rotation.set(0, state.h, 0);
      dummy.position.set(state.x, BODY_HEIGHT / 2 + 0.08, state.z);
      dummy.updateMatrix();
      body.setMatrixAt(index, dummy.matrix);
      body.setColorAt(index, color.set(PALETTE[vehicle.id % PALETTE.length]));

      // кабина сдвинута назад по локальной оси движения (+Z смотрит вперёд)
      dummy.position.set(
        state.x - Math.sin(state.h) * 0.35,
        BODY_HEIGHT + CABIN_HEIGHT / 2 + 0.08,
        state.z - Math.cos(state.h) * 0.35,
      );
      dummy.updateMatrix();
      cabin.setMatrixAt(index, dummy.matrix);

      index += 1;
    }

    for (const id of map.keys()) {
      if (!alive.has(id)) map.delete(id);
    }

    body.count = index;
    cabin.count = index;
    body.instanceMatrix.needsUpdate = true;
    cabin.instanceMatrix.needsUpdate = true;
    if (body.instanceColor) body.instanceColor.needsUpdate = true;
  });

  return (
    <group>
      <instancedMesh ref={bodyRef} args={[undefined, undefined, MAX_VEHICLES]} castShadow>
        <boxGeometry args={[carWidth, BODY_HEIGHT, carLength]} />
        <meshStandardMaterial roughness={0.45} metalness={0.25} />
      </instancedMesh>
      <instancedMesh ref={cabinRef} args={[undefined, undefined, MAX_VEHICLES]} castShadow>
        <boxGeometry args={[carWidth * 0.86, CABIN_HEIGHT, carLength * 0.5]} />
        <meshStandardMaterial color="#0f172a" roughness={0.25} metalness={0.1} />
      </instancedMesh>
    </group>
  );
}
