import { OrbitControls } from "@react-three/drei";
import { Canvas, useFrame, useThree } from "@react-three/fiber";
import type { ThreeEvent } from "@react-three/fiber";
import { useEffect, useMemo, useRef, useState } from "react";
import type { RefObject } from "react";
import * as THREE from "three";
import type { OrbitControls as OrbitControlsImpl } from "three-stdlib";

import type { Crossing, CrossingPatch, DeviceType, PedestrianSignal, VehicleSignal } from "../types";
import { GenerationBadges } from "./GenerationBadges";
import { ItsDevices, PlacementGhost } from "./ItsDevices";
import { clampPlacement, clampToRoad, roadGeometry } from "./layout";
import type { ReplayFrame } from "./replay";
import { Roads } from "./Roads";
import { SignalMasts } from "./SignalMasts";
import { SignalStatusBadge } from "./SignalStatusBadge";
import { TrafficSimulation, type PedCountRefs, type SpawnKind } from "./TrafficSimulation";

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
  selectedDeviceIds,
  onSelectDevice,
  onClearSelection,
  generationMode,
  onChangeCrossing,
  vehicleSignal,
  pedestrianSignal,
  vehicleStatusLabel,
  pedestrianStatusLabel,
  onClickVehicleLight,
  onClickPedestrianLight,
  onPedestrianWaiting,
  showTrafficCounts,
  replay,
}: {
  crossing: Crossing | null;
  view: ViewName;
  placingType?: DeviceType | null;
  onPlace?: (x: number, z: number) => void;
  /** id выбранных ИТС-объектов — у каждого из них виден сектор обзора */
  selectedDeviceIds: ReadonlySet<number>;
  onSelectDevice?: (id: number) => void;
  /** клик по пустому месту сцены (вне режима установки) — сбросить выбор объектов */
  onClearSelection?: () => void;
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
  /** живые счётчики машин/пешеходов по направлениям — видны, пока открыта панель "Режим светофора" */
  showTrafficCounts?: boolean;
  /** не пусто — сцена в режиме исторического воспроизведения (таймлайн панели "История") */
  replay?: ReplayFrame | null;
}) {
  const controls = useRef<OrbitControlsImpl>(null);
  const pedCounts = useRef<PedCountRefs>({ pedLeft: null, pedRight: null });
  const manualSpawn = useRef<Set<SpawnKind>>(new Set());
  const roadLength = crossing?.road_length ?? 40;
  // useMemo — принципиально: без него target ниже была бы новым массивом на
  // каждый ре-рендер SceneView (а он перерисовывается от любой мелочи —
  // правки полос, ИТС-объектов, генерации), и CameraPose воспринимала бы
  // это как "выбрали новый вид", постоянно утаскивая камеру от свободного
  // вращения мышью обратно к пресету. Камера должна ехать к пресету только
  // когда реально сменили view (или геометрию — сменили переход).
  const positions = useMemo(() => viewPositions(roadLength), [roadLength]);
  const target = positions[view];
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
    if (placingType && crossing && onPlace) {
      event.stopPropagation();
      const [x, z] = clampForPlacement(event.point.x, event.point.z);
      onPlace(x, z);
      setHover(null);
      return;
    }
    // клик по пустому месту вне установки — сбросить выбор ИТС-объектов, если он есть
    if (!placingType && selectedDeviceIds.size > 0) onClearSelection?.();
  };

  useEffect(() => {
    if (!placingType) setHover(null);
  }, [placingType]);

  // без верхней границы на длину дороги камера должна видеть дальше 900 —
  // иначе на длинной дороге сцена сама себя обрезает по far-плоскости;
  // считаем от той же длины, что и туман, с запасом под orbit maxDistance
  const far = Math.max(900, roadLength * 10 + 100);

  return (
    <Canvas shadows camera={{ position: positions.perspective, fov: 42, near: 0.5, far }} dpr={[1, 2]}>
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
            onGroundClick={handleGroundClick}
            onGroundPointerMove={placingType ? handleGroundMove : undefined}
            onGroundPointerLeave={placingType ? () => setHover(null) : undefined}
          />
          <SignalMasts
            crossing={crossing}
            vehicleSignal={replay?.vehicleSignal ?? vehicleSignal}
            pedestrianSignal={replay?.pedestrianSignal ?? pedestrianSignal}
            onClickVehicle={onClickVehicleLight}
            onClickPedestrian={onClickPedestrianLight}
          />
          {/* во время replay бейджи-обратный отсчёт скрыты — они считаются от
              ЖИВОГО состояния и не соответствуют показанному историческому кадру;
              в режиме генерации скрыты тоже — там на сцене остаются только
              бейджи интенсивности (GenerationBadges), всё остальное не мешает */}
          {!replay && !generationMode && (
            <SignalStatusBadge
              crossing={crossing}
              vehicleLabel={vehicleStatusLabel}
              pedestrianLabel={pedestrianStatusLabel}
              vehicleSignal={vehicleSignal}
              pedestrianSignal={pedestrianSignal}
              pedCountRef={pedCounts}
            />
          )}
          <ItsDevices
            crossing={crossing}
            selectable={!placingType}
            selectedIds={selectedDeviceIds}
            onSelect={onSelectDevice ?? (() => {})}
          />
          {placingType && hover && <PlacementGhost type={placingType} x={hover[0]} z={hover[1]} />}
          <TrafficSimulation
            crossing={crossing}
            vehicleSignal={vehicleSignal}
            pedestrianSignal={pedestrianSignal}
            onPedestrianWaiting={onPedestrianWaiting}
            showCounts={!generationMode && showTrafficCounts}
            selectedSensorIds={selectedDeviceIds}
            replay={replay}
            pedCountRef={pedCounts}
            manualSpawnRef={manualSpawn}
          />
          {generationMode && onChangeCrossing && (
            <GenerationBadges crossing={crossing} onChange={onChangeCrossing} manualSpawnRef={manualSpawn} />
          )}
        </>
      )}

      <CameraPose target={target} controls={controls} />
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
