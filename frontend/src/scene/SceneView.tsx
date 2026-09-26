import { OrbitControls } from "@react-three/drei";
import { Canvas, useFrame, useThree } from "@react-three/fiber";
import type { ThreeEvent } from "@react-three/fiber";
import { useEffect, useRef } from "react";
import type { RefObject } from "react";
import * as THREE from "three";
import type { OrbitControls as OrbitControlsImpl } from "three-stdlib";

import type { Crossing, DeviceType } from "../types";
import { ItsDevices } from "./ItsDevices";
import { clampPlacement, clampToRoad, roadGeometry } from "./layout";
import { Roads } from "./Roads";
import { SignalMasts } from "./SignalMasts";

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
  onSelectDevice,
}: {
  crossing: Crossing | null;
  view: ViewName;
  placingType?: DeviceType | null;
  onPlace?: (x: number, z: number) => void;
  onSelectDevice?: (id: number) => void;
}) {
  const controls = useRef<OrbitControlsImpl>(null);
  const roadLength = crossing?.road_length ?? 40;
  const positions = viewPositions(roadLength);

  const handleGroundClick = (event: ThreeEvent<MouseEvent>) => {
    if (!placingType || !crossing || !onPlace) return;
    event.stopPropagation();
    const geo = roadGeometry(crossing);
    const [x, z] =
      placingType === "loop"
        ? clampToRoad(geo, event.point.x, event.point.z)
        : clampPlacement(geo, event.point.x, event.point.z);
    onPlace(x, z);
  };

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
          <Roads crossing={crossing} onGroundClick={placingType ? handleGroundClick : undefined} />
          <SignalMasts crossing={crossing} />
          <ItsDevices
            crossing={crossing}
            selectable={!placingType}
            onSelect={onSelectDevice ?? (() => {})}
          />
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
