import type { ThreeEvent } from "@react-three/fiber";
import { useMemo } from "react";

import type { Crossing, PedestrianSignal, VehicleSignal } from "../types";
import { poles, roadGeometry } from "./layout";

const VEHICLE_COLOR: Record<VehicleSignal, string> = {
  red: "#f43f5e",
  yellow: "#facc15",
  green: "#22c55e",
};
const VEHICLE_ORDER: VehicleSignal[] = ["red", "yellow", "green"];

const PEDESTRIAN_COLOR: Record<PedestrianSignal, string> = {
  stop: "#f43f5e",
  walk: "#22c55e",
};

const POLE_HEIGHT = 4.6;
// экспортируются — на них ориентируется SignalStatusBadge, чтобы поставить
// бейджи именно над соответствующей головой, а не абы где на столбе
export const VEHICLE_HEAD_Y = 4.3;
export const PEDESTRIAN_HEAD_Y = 2.5;

function Lamp({ color, active, y }: { color: string; active: boolean; y: number }) {
  return (
    <mesh position={[0, y, 0.2]}>
      <sphereGeometry args={[0.15, 16, 12]} />
      <meshStandardMaterial
        color={active ? color : "#1f2430"}
        emissive={active ? color : "#000000"}
        emissiveIntensity={active ? 2.2 : 0}
        roughness={0.4}
      />
    </mesh>
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
        <boxGeometry args={[0.42, 1.15, 0.3]} />
        <meshStandardMaterial color="#111520" roughness={0.7} />
      </mesh>
      {VEHICLE_ORDER.map((lamp, index) => (
        <Lamp key={lamp} color={VEHICLE_COLOR[lamp]} active={state === lamp} y={0.38 - index * 0.38} />
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
        <boxGeometry args={[0.36, 0.62, 0.26]} />
        <meshStandardMaterial color="#111520" roughness={0.7} />
      </mesh>
      <Lamp color={PEDESTRIAN_COLOR.stop} active={state === "stop"} y={0.16} />
      <Lamp color={PEDESTRIAN_COLOR.walk} active={state === "walk"} y={-0.16} />
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
  return (
    <group>
      <mesh position={[x, POLE_HEIGHT / 2, z]} castShadow>
        <cylinderGeometry args={[0.11, 0.14, POLE_HEIGHT, 12]} />
        <meshStandardMaterial color="#3b4252" roughness={0.6} metalness={0.3} />
      </mesh>
      <VehicleHead
        position={[x, VEHICLE_HEAD_Y, z]}
        rotation={vehicleFacing}
        state={vehicleSignal}
        onClick={onClickVehicle}
      />
      <PedestrianHead
        position={[x, PEDESTRIAN_HEAD_Y, z]}
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
