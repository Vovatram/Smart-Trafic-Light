import type { ThreeEvent } from "@react-three/fiber";
import { useMemo } from "react";

import type { Crossing, PedestrianSignal, VehicleSignal } from "../types";
import { poles, roadGeometry } from "./layout";

// экспортируются — SignalStatusBadge красит текст тем же цветом, что горит на лампе
export const VEHICLE_COLOR: Record<VehicleSignal, string> = {
  red: "#f43f5e",
  yellow: "#facc15",
  green: "#22c55e",
};
const VEHICLE_ORDER: VehicleSignal[] = ["red", "yellow", "green"];

export const PEDESTRIAN_COLOR: Record<PedestrianSignal, string> = {
  stop: "#f43f5e",
  walk: "#22c55e",
};

const POLE_HEIGHT = 4.6;
// панель светофора выносится вперёд от оси столба вдоль направления, куда
// она смотрит — иначе плоская панель (глубина 0.12) утопает внутри радиуса
// самого столба (0.11-0.14) и цвет сигнала почти не виден
const HEAD_OFFSET = 0.32;
// экспортируются — на них ориентируется SignalStatusBadge, чтобы поставить
// бейджи именно над соответствующей головой, а не абы где на столбе
export const VEHICLE_HEAD_Y = 4.3;
export const PEDESTRIAN_HEAD_Y = 2.5;

const HOUSING_DEPTH = 0.12; // современные светофоры — тонкая плоская панель, не глубокий короб
const LAMP_Z = HOUSING_DEPTH / 2 + 0.01;

/** Плоский круглый сигнал — как на современных LED-светофорах (не лампа-шар). */
function FlatLamp({ color, active, y }: { color: string; active: boolean; y: number }) {
  return (
    <mesh position={[0, y, LAMP_Z]}>
      <circleGeometry args={[0.15, 24]} />
      <meshStandardMaterial
        color={active ? color : "#1f2430"}
        emissive={active ? color : "#000000"}
        emissiveIntensity={active ? 2.4 : 0}
        roughness={0.35}
      />
    </mesh>
  );
}

/**
 * Плоская пиктограмма человечка — как на современных пешеходных
 * светофорах: "стоп" — фигура стоит прямо, ноги вместе; "идите" — в
 * движении, ноги в шаге, руки отведены. Собрана из тонких плоских боксов.
 */
function PersonIcon({
  walking,
  color,
  active,
  y,
}: {
  walking: boolean;
  color: string;
  active: boolean;
  y: number;
}) {
  const mat = active ? color : "#1f2430";
  const emissive = active ? color : "#000000";
  const depth = 0.02;

  const parts: Array<{ x: number; y: number; w: number; h: number; rot?: number }> = walking
    ? [
        { x: 0, y: 0.135, w: 0.07, h: 0.07 }, // голова
        { x: 0.005, y: 0.03, w: 0.09, h: 0.13, rot: 0.15 }, // торс, чуть наклонён вперёд
        { x: -0.11, y: 0.06, w: 0.1, h: 0.035, rot: 0.5 }, // рука назад
        { x: 0.1, y: 0.08, w: 0.1, h: 0.035, rot: -0.6 }, // рука вперёд
        { x: -0.06, y: -0.09, w: 0.09, h: 0.04, rot: -0.5 }, // нога назад
        { x: 0.07, y: -0.1, w: 0.11, h: 0.04, rot: 0.45 }, // нога вперёд, широкий шаг
      ]
    : [
        { x: 0, y: 0.135, w: 0.07, h: 0.07 }, // голова
        { x: 0, y: 0.03, w: 0.08, h: 0.14 }, // торс прямо
        { x: -0.055, y: 0.04, w: 0.03, h: 0.1 }, // рука вдоль тела
        { x: 0.055, y: 0.04, w: 0.03, h: 0.1 }, // рука вдоль тела
        { x: 0, y: -0.1, w: 0.05, h: 0.14 }, // ноги вместе
      ];

  return (
    <group position={[0, y, LAMP_Z]}>
      {parts.map((p, i) => (
        <mesh key={i} position={[p.x, p.y, 0]} rotation={[0, 0, p.rot ?? 0]}>
          <boxGeometry args={[p.w, p.h, depth]} />
          <meshStandardMaterial color={mat} emissive={emissive} emissiveIntensity={active ? 1.6 : 0} roughness={0.4} />
        </mesh>
      ))}
    </group>
  );
}

function VehicleHead({
  position,
  rotation,
  state,
  onClick,
}: {
  position: [number, number, number];
  rotation: number;
  state: VehicleSignal;
  onClick?: () => void;
}) {
  const handleClick = (event: ThreeEvent<MouseEvent>) => {
    event.stopPropagation();
    onClick?.();
  };
  return (
    <group
      position={position}
      rotation={[0, rotation, 0]}
      onClick={onClick && handleClick}
      onPointerOver={() => onClick && (document.body.style.cursor = "pointer")}
      onPointerOut={() => (document.body.style.cursor = "auto")}
    >
      <mesh castShadow>
        <boxGeometry args={[0.42, 1.15, HOUSING_DEPTH]} />
        <meshStandardMaterial color="#111520" roughness={0.5} metalness={0.2} />
      </mesh>
      {VEHICLE_ORDER.map((lamp, index) => (
        <FlatLamp key={lamp} color={VEHICLE_COLOR[lamp]} active={state === lamp} y={0.38 - index * 0.38} />
      ))}
    </group>
  );
}

function PedestrianHead({
  position,
  rotation,
  state,
  onClick,
}: {
  position: [number, number, number];
  rotation: number;
  state: PedestrianSignal;
  onClick?: () => void;
}) {
  const handleClick = (event: ThreeEvent<MouseEvent>) => {
    event.stopPropagation();
    onClick?.();
  };
  return (
    <group
      position={position}
      rotation={[0, rotation, 0]}
      onClick={onClick && handleClick}
      onPointerOver={() => onClick && (document.body.style.cursor = "pointer")}
      onPointerOut={() => (document.body.style.cursor = "auto")}
    >
      <mesh castShadow>
        <boxGeometry args={[0.36, 0.62, HOUSING_DEPTH]} />
        <meshStandardMaterial color="#111520" roughness={0.5} metalness={0.2} />
      </mesh>
      <PersonIcon walking={false} color={PEDESTRIAN_COLOR.stop} active={state === "stop"} y={0.16} />
      <PersonIcon walking color={PEDESTRIAN_COLOR.walk} active={state === "walk"} y={-0.16} />
    </group>
  );
}

function Pole({
  x,
  z,
  vehicleFacing,
  pedestrianFacing,
  vehicleSignal,
  pedestrianSignal,
  onClickVehicle,
  onClickPedestrian,
}: {
  x: number;
  z: number;
  vehicleFacing: number;
  pedestrianFacing: number;
  vehicleSignal: VehicleSignal;
  pedestrianSignal: PedestrianSignal;
  onClickVehicle?: () => void;
  onClickPedestrian?: () => void;
}) {
  // каждая голова выносится вперёд по СВОЕЙ оси обзора (у авто- и
  // пешеходной голов разные facing — они смотрят в разные стороны)
  const vx = x + Math.sin(vehicleFacing) * HEAD_OFFSET;
  const vz = z + Math.cos(vehicleFacing) * HEAD_OFFSET;
  const px = x + Math.sin(pedestrianFacing) * HEAD_OFFSET;
  const pz = z + Math.cos(pedestrianFacing) * HEAD_OFFSET;

  return (
    <group>
      <mesh position={[x, POLE_HEIGHT / 2, z]} castShadow>
        <cylinderGeometry args={[0.11, 0.14, POLE_HEIGHT, 12]} />
        <meshStandardMaterial color="#3b4252" roughness={0.6} metalness={0.3} />
      </mesh>
      <VehicleHead
        position={[vx, VEHICLE_HEAD_Y, vz]}
        rotation={vehicleFacing}
        state={vehicleSignal}
        onClick={onClickVehicle}
      />
      <PedestrianHead
        position={[px, PEDESTRIAN_HEAD_Y, pz]}
        rotation={pedestrianFacing}
        state={pedestrianSignal}
        onClick={onClickPedestrian}
      />
    </group>
  );
}

export function SignalMasts({
  crossing,
  vehicleSignal,
  pedestrianSignal,
  onClickVehicle,
  onClickPedestrian,
}: {
  crossing: Crossing;
  /** текущий сигнал для отрисовки ламп — из useSignalState, не обязательно crossing.vehicle_signal */
  vehicleSignal: VehicleSignal;
  pedestrianSignal: PedestrianSignal;
  onClickVehicle?: () => void;
  onClickPedestrian?: () => void;
}) {
  const geo = useMemo(() => roadGeometry(crossing), [crossing]);
  const items = useMemo(() => poles(geo), [geo]);

  return (
    <group>
      {items.map((pole) => (
        <Pole
          key={pole.key}
          x={pole.x}
          z={pole.z}
          vehicleFacing={pole.vehicleFacing}
          pedestrianFacing={pole.pedestrianFacing}
          vehicleSignal={vehicleSignal}
          pedestrianSignal={pedestrianSignal}
          onClickVehicle={onClickVehicle}
          onClickPedestrian={onClickPedestrian}
        />
      ))}
    </group>
  );
}
