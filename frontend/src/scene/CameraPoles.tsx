import { useMemo } from "react";
import * as THREE from "three";

import type { CameraPole as CameraPoleData, Crossing } from "../types";
import { cameraPolePosition, roadGeometry } from "./layout";

const DEG2RAD = Math.PI / 180;
const POLE_COLOR = "#3b4252";
const FOV_LENGTH = 8;
const FOV_HALF_ANGLE_DEG = 28;

/** Полупрозрачный треугольник, показывающий сектор обзора камеры. */
function FovWedge() {
  const geometry = useMemo(() => {
    const half = FOV_HALF_ANGLE_DEG * DEG2RAD;
    const geo = new THREE.BufferGeometry();
    const positions = new Float32Array([
      0,
      0,
      0,
      Math.sin(-half) * FOV_LENGTH,
      0,
      Math.cos(-half) * FOV_LENGTH,
      Math.sin(half) * FOV_LENGTH,
      0,
      Math.cos(half) * FOV_LENGTH,
    ]);
    geo.setAttribute("position", new THREE.BufferAttribute(positions, 3));
    geo.setIndex([0, 1, 2]);
    return geo;
  }, []);

  return (
    <mesh geometry={geometry} renderOrder={1}>
      <meshBasicMaterial
        color="#facc15"
        transparent
        opacity={0.16}
        side={THREE.DoubleSide}
        depthWrite={false}
      />
    </mesh>
  );
}

function CameraHead({ rotationDeg }: { rotationDeg: number }) {
  return (
    <group rotation={[0, rotationDeg * DEG2RAD, 0]}>
      <mesh castShadow>
        <boxGeometry args={[0.24, 0.24, 0.5]} />
        <meshStandardMaterial color="#e5e7eb" roughness={0.4} metalness={0.5} />
      </mesh>
      <mesh position={[0, 0, 0.28]} rotation={[Math.PI / 2, 0, 0]} castShadow>
        <cylinderGeometry args={[0.1, 0.1, 0.14, 16]} />
        <meshStandardMaterial color="#0f172a" roughness={0.15} metalness={0.2} />
      </mesh>
      {/* индикатор — красная точка записи */}
      <mesh position={[0, 0.16, 0.21]}>
        <sphereGeometry args={[0.03, 8, 8]} />
        <meshStandardMaterial color="#ef4444" emissive="#ef4444" emissiveIntensity={1.5} />
      </mesh>
      <FovWedge />
    </group>
  );
}

function Pole({ pole, x, z }: { pole: CameraPoleData; x: number; z: number }) {
  return (
    <group>
      <mesh position={[x, pole.height / 2, z]} castShadow>
        <cylinderGeometry args={[0.08, 0.11, pole.height, 12]} />
        <meshStandardMaterial color={POLE_COLOR} roughness={0.6} metalness={0.3} />
      </mesh>
      <mesh position={[x, pole.height - 0.05, z]}>
        <boxGeometry args={[0.05, 0.05, 0.4]} />
        <meshStandardMaterial color={POLE_COLOR} roughness={0.6} metalness={0.3} />
      </mesh>
      <group position={[x, pole.height, z]}>
        <CameraHead rotationDeg={pole.rotation_deg} />
      </group>
    </group>
  );
}

export function CameraPoles({ crossing }: { crossing: Crossing }) {
  const geo = useMemo(() => roadGeometry(crossing), [crossing]);

  return (
    <group>
      {crossing.camera_poles.map((pole) => {
        const [x, z] = cameraPolePosition(geo, pole.side);
        return <Pole key={pole.id} pole={pole} x={x} z={z} />;
      })}
    </group>
  );
}
