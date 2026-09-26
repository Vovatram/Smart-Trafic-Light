import { OrbitControls } from "@react-three/drei";
import { Canvas, useFrame, useThree } from "@react-three/fiber";
import type { ThreeEvent } from "@react-three/fiber";
import { useEffect, useRef, useState } from "react";
import type { RefObject } from "react";
import * as THREE from "three";
import type { OrbitControls as OrbitControlsImpl } from "three-stdlib";

import type { Crossing, CrossingPatch, DeviceType, PedestrianSignal, VehicleSignal } from "../types";
import { GenerationBadges } from "./GenerationBadges";
import { ItsDevices, PlacementGhost } from "./ItsDevices";
import { clampPlacement, clampToRoad, roadGeometry } from "./layout";
import { Roads } from "./Roads";
import { SignalMasts } from "./SignalMasts";
import { SignalStatusBadge } from "./SignalStatusBadge";
import { TrafficSimulation } from "./TrafficSimulation";

export type ViewName = "perspective" | "top" | "along" | "side";

export const VIEW_LABEL: Record<ViewName, string> = {
  perspective: "Перспектива",
  top: "Сверху",
  along: "Вдоль дороги",
  side: "Сбоку",
};

export const VIEW_ORDER: ViewName[] = ["perspective", "top", "along", "side"];

function viewPositions(roadLength: number): Record<ViewName, [number, number, number]> {
  const d = Math.max(roadLength, 20);
  return {
    perspective: [d * 0.55, d * 0.45, d * 0.7],
    top: [0, d * 1.6, 0.6],
    along: [0, d * 0.22, d * 1.1],
    side: [d * 1.1, d * 0.22, 0],
  };
}

/** Плавно переставляет камеру при выборе предустановленного вида. */
function CameraPose({
  target,
  controls,
}: {
  target: [number, number, number];
  controls: RefObject<OrbitControlsImpl | null>;
}) {
  const camera = useThree((state) => state.camera);
  const goal = useRef(new THREE.Vector3(...target));
  const moving = useRef(false);

  useEffect(() => {
    goal.current.set(...target);
    moving.current = true;
  }, [target]);

  useFrame((_, delta) => {
    if (!moving.current) return;
    const alpha = 1 - Math.exp(-6 * Math.min(delta, 0.1));
    camera.position.lerp(goal.current, alpha);
    controls.current?.update();
    if (camera.position.distanceTo(goal.current) < 0.4) {
      camera.position.copy(goal.current);
      moving.current = false;
    }
  });

  return null;
}

export function SceneView({
  crossing,
  view,
  placingType,
  onPlace,
  editingId,
  onSelectDevice,
  generationMode,
  onChangeCrossing,
  vehicleSignal,
  pedestrianSignal,
  vehicleStatusLabel,
  pedestrianStatusLabel,
  onClickVehicleLight,
  onClickPedestrianLight,
  onPedestrianWaiting,
}: {
  crossing: Crossing | null;
  view: ViewName;
  placingType?: DeviceType | null;
  onPlace?: (x: number, z: number) => void;
  editingId?: number | null;
  onSelectDevice?: (id: number) => void;
  generationMode?: boolean;
  onChangeCrossing?: (patch: CrossingPatch) => void;
  vehicleSignal: VehicleSignal;
  pedestrianSignal: PedestrianSignal;
  /** "N с" / "АУ" над автомобильным/пешеходным светофором; "" — скрыт (ручной режим) */
  vehicleStatusLabel: string;
  pedestrianStatusLabel: string;
  onClickVehicleLight?: () => void;
  onClickPedestrianLight?: () => void;
  onPedestrianWaiting?: () => void;
}) {
  const controls = useRef<OrbitControlsImpl>(null);
  const roadLength = crossing?.road_length ?? 40;
  const positions = viewPositions(roadLength);
  const [hover, setHover] = useState<[number, number] | null>(null);

  const clampForPlacement = (px: number, pz: number): [number, number] => {
    const geo = roadGeometry(crossing!);
    return placingType === "loop" ? clampToRoad(geo, px, pz) : clampPlacement(geo, px, pz);
  };

  const handleGroundMove = (event: ThreeEvent<PointerEvent>) => {
    if (!placingType || !crossing) return;
    setHover(clampForPlacement(event.point.x, event.point.z));
  };

  const handleGroundClick = (event: ThreeEvent<MouseEvent>) => {
    if (!placingType || !crossing || !onPlace) return;
    event.stopPropagation();
    const [x, z] = clampForPlacement(event.point.x, event.point.z);
    onPlace(x, z);
    setHover(null);
  };

  useEffect(() => {
    if (!placingType) setHover(null);
  }, [placingType]);

  return (
    <Canvas shadows camera={{ position: positions.perspective, fov: 42, near: 0.5, far: 900 }} dpr={[1, 2]}>
      <color attach="background" args={["#0b1120"]} />
      <fog attach="fog" args={["#0b1120", roadLength * 4, roadLength * 10]} />

      <hemisphereLight args={["#93b4d8", "#1a1f2b", 0.55]} />
      <ambientLight intensity={0.25} />
      <directionalLight
        position={[roadLength, roadLength * 1.5, roadLength * 0.8]}
        intensity={1.5}
        castShadow
        shadow-mapSize={[2048, 2048]}
        shadow-camera-left={-roadLength * 1.5}
        shadow-camera-right={roadLength * 1.5}
        shadow-camera-top={roadLength * 1.5}
        shadow-camera-bottom={-roadLength * 1.5}
        shadow-camera-near={1}
        shadow-camera-far={roadLength * 6}
      />

      {crossing && (
        <>
          <Roads
            crossing={crossing}
            onGroundClick={placingType ? handleGroundClick : undefined}
            onGroundPointerMove={placingType ? handleGroundMove : undefined}
            onGroundPointerLeave={placingType ? () => setHover(null) : undefined}
          />
          <SignalMasts
            crossing={crossing}
            vehicleSignal={vehicleSignal}
            pedestrianSignal={pedestrianSignal}
            onClickVehicle={onClickVehicleLight}
            onClickPedestrian={onClickPedestrianLight}
          />
          <SignalStatusBadge
            crossing={crossing}
            vehicleLabel={vehicleStatusLabel}
            pedestrianLabel={pedestrianStatusLabel}
          />
          <ItsDevices
            crossing={crossing}
            selectable={!placingType}
            editingId={editingId ?? null}
            onSelect={onSelectDevice ?? (() => {})}
          />
          {placingType && hover && <PlacementGhost type={placingType} x={hover[0]} z={hover[1]} />}
          <TrafficSimulation
            crossing={crossing}
            vehicleSignal={vehicleSignal}
            pedestrianSignal={pedestrianSignal}
            onPedestrianWaiting={onPedestrianWaiting}
          />
          {generationMode && onChangeCrossing && (
            <GenerationBadges crossing={crossing} onChange={onChangeCrossing} />
          )}
        </>
      )}

      <CameraPose target={positions[view]} controls={controls} />
      <OrbitControls
        ref={controls}
        target={[0, 0, 0]}
        enableDamping
        dampingFactor={0.08}
        minDistance={8}
        maxDistance={roadLength * 8}
        maxPolarAngle={Math.PI / 2 - 0.02}
      />
    </Canvas>
  );
}
