import { useMemo } from "react";
import type { ThreeEvent } from "@react-three/fiber";
import * as THREE from "three";

import type { Crossing, DeviceType, ItsDevice } from "../types";
import { colorForDevice } from "./deviceColors";

const DEG2RAD = Math.PI / 180;
const POLE_COLOR = "#3b4252";

/** Полупрозрачный сектор обзора: половина угла и дальность заданы устройством. */
function FovWedge({ halfAngleDeg, length, color }: { halfAngleDeg: number; length: number; color: string }) {
  const geometry = useMemo(() => {
    const half = Math.max(1, halfAngleDeg) * DEG2RAD;
    const segments = 10;
    const positions: number[] = [0, 0, 0];
    for (let i = 0; i <= segments; i += 1) {
      const a = -half + (2 * half * i) / segments;
      positions.push(Math.sin(a) * length, 0, Math.cos(a) * length);
    }
    const index: number[] = [];
    for (let i = 1; i < segments + 1; i += 1) index.push(0, i, i + 1);
    const geo = new THREE.BufferGeometry();
    geo.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
    geo.setIndex(index);
    return geo;
  }, [halfAngleDeg, length]);

  return (
    <mesh geometry={geometry} position={[0, 0.03, 0]} renderOrder={1}>
      <meshBasicMaterial color={color} transparent opacity={0.16} side={THREE.DoubleSide} depthWrite={false} />
    </mesh>
  );
}

function CameraHead({
  device,
  color,
  showWedge,
}: {
  device: ItsDevice;
  color: string;
  showWedge: boolean;
}) {
  return (
    <group rotation={[0, (device.rotation_deg ?? 0) * DEG2RAD, 0]}>
      <mesh castShadow>
        <boxGeometry args={[0.24, 0.24, 0.5]} />
        <meshStandardMaterial color="#e5e7eb" roughness={0.4} metalness={0.5} />
      </mesh>
      <mesh position={[0, 0, 0.28]} rotation={[Math.PI / 2, 0, 0]} castShadow>
        <cylinderGeometry args={[0.1, 0.1, 0.14, 16]} />
        <meshStandardMaterial color="#0f172a" roughness={0.15} metalness={0.2} />
      </mesh>
      <mesh position={[0, 0.16, 0.21]}>
        <sphereGeometry args={[0.03, 8, 8]} />
        <meshStandardMaterial color={color} emissive={color} emissiveIntensity={1.5} />
      </mesh>
      {showWedge && (
        <FovWedge halfAngleDeg={(device.fov_deg ?? 60) / 2} length={device.view_radius ?? 35} color={color} />
      )}
    </group>
  );
}

function MicrowaveHead({
  device,
  color,
  showWedge,
}: {
  device: ItsDevice;
  color: string;
  showWedge: boolean;
}) {
  return (
    <group rotation={[0, (device.rotation_deg ?? 0) * DEG2RAD, 0]}>
      <mesh castShadow>
        <boxGeometry args={[0.3, 0.3, 0.22]} />
        <meshStandardMaterial color="#4c1d95" roughness={0.5} metalness={0.3} />
      </mesh>
      <mesh position={[0, 0, 0.13]} rotation={[Math.PI / 2, 0, 0]}>
        <torusGeometry args={[0.11, 0.02, 8, 16]} />
        <meshStandardMaterial color={color} emissive={color} emissiveIntensity={0.6} />
      </mesh>
      {showWedge && (
        <FovWedge halfAngleDeg={(device.fov_deg ?? 25) / 2} length={device.view_radius ?? 18} color={color} />
      )}
    </group>
  );
}

function PoleDevice({
  device,
  color,
  selectable,
  showWedge,
  onSelect,
}: {
  device: ItsDevice;
  color: string;
  selectable: boolean;
  showWedge: boolean;
  onSelect: (id: number, additive: boolean) => void;
}) {
  const height = device.height ?? 5;
  const handleClick = (event: ThreeEvent<MouseEvent>) => {
    event.stopPropagation();
    if (selectable) onSelect(device.id, event.ctrlKey || event.metaKey);
  };

  return (
    <group
      position={[device.x, 0, device.z]}
      onClick={handleClick}
      onPointerOver={() => selectable && (document.body.style.cursor = "pointer")}
      onPointerOut={() => (document.body.style.cursor = "auto")}
    >
      <mesh position={[0, height / 2, 0]} castShadow>
        <cylinderGeometry args={[0.08, 0.11, height, 12]} />
        <meshStandardMaterial color={POLE_COLOR} roughness={0.6} metalness={0.3} />
      </mesh>
      <group position={[0, height, 0]}>
        {device.device_type === "camera" ? (
          <CameraHead device={device} color={color} showWedge={showWedge} />
        ) : (
          <MicrowaveHead device={device} color={color} showWedge={showWedge} />
        )}
      </group>
    </group>
  );
}

function LoopDevice({
  device,
  color,
  selectable,
  onSelect,
}: {
  device: ItsDevice;
  color: string;
  selectable: boolean;
  onSelect: (id: number, additive: boolean) => void;
}) {
  const size = device.loop_length ?? 2;
  const handleClick = (event: ThreeEvent<MouseEvent>) => {
    event.stopPropagation();
    if (selectable) onSelect(device.id, event.ctrlKey || event.metaKey);
  };

  return (
    <group
      position={[device.x, 0.03, device.z]}
      onClick={handleClick}
      onPointerOver={() => selectable && (document.body.style.cursor = "pointer")}
      onPointerOut={() => (document.body.style.cursor = "auto")}
    >
      <LoopOutline size={size} color={color} fillOpacity={0.1} />
    </group>
  );
}

function LoopOutline({ size, color, fillOpacity }: { size: number; color: string; fillOpacity: number }) {
  const edge = 0.08;
  return (
    <>
      <mesh rotation={[-Math.PI / 2, 0, 0]}>
        <planeGeometry args={[size, size]} />
        <meshBasicMaterial color={color} transparent opacity={fillOpacity} depthWrite={false} />
      </mesh>
      {[
        [0, size / 2 - edge / 2, size, edge],
        [0, -(size / 2 - edge / 2), size, edge],
        [size / 2 - edge / 2, 0, edge, size],
        [-(size / 2 - edge / 2), 0, edge, size],
      ].map(([ex, ez, sx, sz], i) => (
        <mesh key={i} position={[ex, 0.001, ez]} rotation={[-Math.PI / 2, 0, 0]}>
          <planeGeometry args={[sx, sz]} />
          <meshBasicMaterial color={color} transparent opacity={Math.min(1, fillOpacity * 8)} depthWrite={false} />
        </mesh>
      ))}
    </>
  );
}

export function ItsDevices({
  crossing,
  selectable,
  selectedIds,
  onSelect,
}: {
  crossing: Crossing;
  selectable: boolean;
  /** выбранные объекты — сектор обзора виден у каждого из них (одного или нескольких) */
  selectedIds: ReadonlySet<number>;
  onSelect: (id: number, additive: boolean) => void;
}) {
  return (
    <group>
      {crossing.its_devices.map((device) => {
        const color = colorForDevice(crossing.its_devices, device.id);
        return device.device_type === "loop" ? (
          <LoopDevice key={device.id} device={device} color={color} selectable={selectable} onSelect={onSelect} />
        ) : (
          <PoleDevice
            key={device.id}
            device={device}
            color={color}
            selectable={selectable}
            showWedge={selectedIds.has(device.id)}
            onSelect={onSelect}
          />
        );
      })}
    </group>
  );
}

const GHOST_DEFAULTS: Record<DeviceType, { height?: number; loopLength?: number }> = {
  camera: { height: 5 },
  microwave: { height: 5 },
  loop: { loopLength: 2 },
};

/** Полупрозрачный предпросмотр — куда встанет объект, если кликнуть сейчас. */
export function PlacementGhost({ type, x, z }: { type: DeviceType; x: number; z: number }) {
  const defaults = GHOST_DEFAULTS[type];

  if (type === "loop") {
    return (
      <group position={[x, 0.04, z]}>
        <LoopOutline size={defaults.loopLength ?? 2} color="#67e8f9" fillOpacity={0.22} />
      </group>
    );
  }

  const height = defaults.height ?? 5;
  return (
    <group position={[x, 0, z]}>
      <mesh position={[0, height / 2, 0]}>
        <cylinderGeometry args={[0.08, 0.11, height, 12]} />
        <meshStandardMaterial color={POLE_COLOR} transparent opacity={0.45} depthWrite={false} />
      </mesh>
      <mesh position={[0, height, 0]}>
        <boxGeometry args={[0.28, 0.28, type === "camera" ? 0.5 : 0.22]} />
        <meshStandardMaterial
          color={type === "camera" ? "#e5e7eb" : "#4c1d95"}
          transparent
          opacity={0.55}
          depthWrite={false}
        />
      </mesh>
      <mesh position={[0, 0.02, 0]} rotation={[-Math.PI / 2, 0, 0]}>
        <ringGeometry args={[0.35, 0.42, 24]} />
        <meshBasicMaterial color="#67e8f9" transparent opacity={0.6} depthWrite={false} />
      </mesh>
    </group>
  );
}
