import { OrbitControls } from "@react-three/drei";
import { Canvas, useFrame, useThree } from "@react-three/fiber";
import { useEffect, useRef } from "react";
import type { RefObject } from "react";
import * as THREE from "three";
import type { OrbitControls as OrbitControlsImpl } from "three-stdlib";

import type { Frame, Layout } from "../types";
import { ApproachMarkers } from "./ApproachMarkers";
import { Roads } from "./Roads";
import { SignalMasts } from "./SignalMasts";
import { Vehicles } from "./Vehicles";

export type ViewName = "perspective" | "top" | "north" | "east";

export const VIEWS: Record<ViewName, [number, number, number]> = {
  perspective: [78, 62, 96],
  top: [0, 170, 0.6],
  north: [0, 26, 165],
  east: [165, 26, 0],
};

/** Плавно переставляет камеру при выборе предустановленного вида. */
function CameraPose({
  view,
  controls,
}: {
  view: ViewName;
  controls: RefObject<OrbitControlsImpl | null>;
}) {
  const camera = useThree((state) => state.camera);
  const target = useRef(new THREE.Vector3(...VIEWS[view]));
  const moving = useRef(false);

  useEffect(() => {
    target.current.set(...VIEWS[view]);
    moving.current = true;
  }, [view]);

  useFrame((_, delta) => {
    if (!moving.current) return;
    const alpha = 1 - Math.exp(-6 * Math.min(delta, 0.1));
    camera.position.lerp(target.current, alpha);
    controls.current?.update();
    if (camera.position.distanceTo(target.current) < 0.4) {
      camera.position.copy(target.current);
      moving.current = false;
    }
  });

  return null;
}

export function SceneView({
  layout,
  view,
  signals,
  frameRef,
}: {
  layout: Layout | null;
  view: ViewName;
  signals?: Frame["signals"];
  frameRef?: RefObject<Frame | null>;
}) {
  const controls = useRef<OrbitControlsImpl>(null);

  return (
    <Canvas
      shadows
      camera={{ position: VIEWS.perspective, fov: 42, near: 0.5, far: 1200 }}
      dpr={[1, 2]}
    >
      <color attach="background" args={["#0b1120"]} />
      <fog attach="fog" args={["#0b1120", 260, 620]} />

      <hemisphereLight args={["#93b4d8", "#1a1f2b", 0.55]} />
      <ambientLight intensity={0.25} />
      <directionalLight
        position={[80, 120, 60]}
        intensity={1.5}
        castShadow
        shadow-mapSize={[2048, 2048]}
        shadow-camera-left={-170}
        shadow-camera-right={170}
        shadow-camera-top={170}
        shadow-camera-bottom={-170}
        shadow-camera-near={1}
        shadow-camera-far={420}
      />

      {layout && (
        <>
          <Roads layout={layout} />
          <ApproachMarkers layout={layout} />
          <SignalMasts layout={layout} signals={signals} />
          {frameRef && <Vehicles layout={layout} frameRef={frameRef} />}
        </>
      )}

      <CameraPose view={view} controls={controls} />
      <OrbitControls
        ref={controls}
        target={[0, 0, 0]}
        enableDamping
        dampingFactor={0.08}
        minDistance={20}
        maxDistance={520}
        maxPolarAngle={Math.PI / 2 - 0.02}
      />
    </Canvas>
  );
}
