import type { ThreeEvent } from "@react-three/fiber";
import { useLayoutEffect, useMemo, useRef } from "react";
import * as THREE from "three";

import type { Crossing } from "../types";
import {
  busLaneIndex,
  isBusLane,
  isTramLane,
  laneCenterX,
  roadGeometry,
  STOP_MARKER_LENGTH,
  stopMarkerPosition,
  tramLaneIndex,
} from "./layout";

interface Box {
  x: number;
  z: number;
  sx: number;
  sz: number;
  /** поворот вокруг Y (рад.) — нужен для диагональных сегментов (напр. "ломаной" у остановки) */
  rot?: number;
}

const ASPHALT = "#23262d";
const PAINT = "#d8dde6";
const ZEBRA = "#e9edf4";
const BIKE_LANE_COLOR = "#1f4d38";
const BIKE_LANE_STRIPE = "#8fe3b8";
const BUS_LANE_TINT = "#3a2420";
const TRAM_RAIL = "#9aa3ad";
const STOP_ZIGZAG = "#eab308";

function InstancedBoxes({
  items,
  color,
  y,
  height = 0.02,
}: {
  items: Box[];
  color: string;
  y: number;
  height?: number;
}) {
  const ref = useRef<THREE.InstancedMesh>(null);

  useLayoutEffect(() => {
    const mesh = ref.current;
    if (!mesh) return;
    const matrix = new THREE.Matrix4();
    const position = new THREE.Vector3();
    const quaternion = new THREE.Quaternion();
    const scale = new THREE.Vector3();
    const upAxis = new THREE.Vector3(0, 1, 0);
    items.forEach((box, index) => {
      position.set(box.x, y, box.z);
      quaternion.setFromAxisAngle(upAxis, box.rot ?? 0);
      scale.set(box.sx, height, box.sz);
      matrix.compose(position, quaternion, scale);
      mesh.setMatrixAt(index, matrix);
    });
    mesh.count = items.length;
    mesh.instanceMatrix.needsUpdate = true;
  }, [items, y, height]);

  if (items.length === 0) return null;
  return (
    <instancedMesh key={items.length} ref={ref} args={[undefined, undefined, items.length]}>
      <boxGeometry />
      <meshStandardMaterial color={color} roughness={0.85} />
    </instancedMesh>
  );
}

/** Разметка: осевая сплошная, прерывистые между полосами, стоп-линии. */
function useMarkings(crossing: Crossing): Box[] {
  return useMemo(() => {
    const geo = roadGeometry(crossing);
    const boxes: Box[] = [];
    const w = geo.laneWidth;
    const L = geo.roadLength;
    const gap = geo.crossingHalf;

    // двойная сплошная по осевой — только если движение в обе стороны
    if (geo.lanesForward > 0 && geo.lanesBackward > 0) {
      const segments: [number, number][] = [
        [-L, -gap],
        [gap, L],
      ];
      for (const [from, to] of segments) {
        const len = to - from;
        if (len <= 0) continue;
        const mid = (from + to) / 2;
        boxes.push({ x: 0.18, z: mid, sx: 0.14, sz: len });
        boxes.push({ x: -0.18, z: mid, sx: 0.14, sz: len });
      }
    }

    // прерывистые между обычными полосами одного направления; но если с
    // одной из сторон границы — трамвайная/автобусная полоса, разметка
    // сплошная (как в жизни — на такую полосу не перестраиваются)
    const dashed = (x: number) => {
      for (let z = -L + 3; z < -gap - 1; z += 6) boxes.push({ x, z: z + 1.5, sx: 0.12, sz: 3 });
      for (let z = gap + 1; z < L - 3; z += 6) boxes.push({ x, z: z + 1.5, sx: 0.12, sz: 3 });
    };
    const solid = (x: number) => boxes.push({ x, z: 0, sx: 0.14, sz: L * 2 });
    const isReservedLane = (dir: "forward" | "backward", lane: number) =>
      isTramLane(geo, dir, lane) || isBusLane(geo, dir, lane);
    for (let i = 1; i < geo.lanesForward; i += 1) {
      const boundarySpecial = isReservedLane("forward", i - 1) || isReservedLane("forward", i);
      (boundarySpecial ? solid : dashed)(-i * w);
    }
    for (let i = 1; i < geo.lanesBackward; i += 1) {
      const boundarySpecial = isReservedLane("backward", i - 1) || isReservedLane("backward", i);
      (boundarySpecial ? solid : dashed)(i * w);
    }

    // сплошные по внешним краям проезжей части
    if (geo.rightEdge > 0) boxes.push({ x: geo.rightEdge - 0.07, z: 0, sx: 0.14, sz: L * 2 });
    if (geo.leftEdge < 0) boxes.push({ x: geo.leftEdge + 0.07, z: 0, sx: 0.14, sz: L * 2 });

    // стоп-линии перед переходом, для каждого направления, что реально едет
    if (geo.lanesForward > 0) {
      boxes.push({
        x: geo.leftEdge / 2,
        z: -(gap + geo.stopOffset - 0.3),
        sx: -geo.leftEdge,
        sz: 0.4,
      });
    }
    if (geo.lanesBackward > 0) {
      boxes.push({
        x: geo.rightEdge / 2,
        z: gap + geo.stopOffset - 0.3,
        sx: geo.rightEdge,
        sz: 0.4,
      });
    }

    return boxes;
  }, [crossing]);
}

const TRAM_GAUGE = 0.9; // расстояние между "рельсами" — чисто визуальное, не настоящая колея
const ZIGZAG_AMPLITUDE = 0.7; // насколько зигзаг уходит вбок от центра полосы
const ZIGZAG_TEETH = 6; // сколько "зубцов" укладывается в STOP_MARKER_LENGTH
const ZIGZAG_THICKNESS = 0.14;

/** Разметка остановки — не сплошной блок, а жёлтая ломаная линия вдоль полосы (как в жизни). */
function zigzagLine(centerX: number, centerZ: number, length: number): Box[] {
  const half = length / 2;
  const step = length / ZIGZAG_TEETH;
  const points: { x: number; z: number }[] = [];
  for (let i = 0; i <= ZIGZAG_TEETH; i += 1) {
    points.push({ x: centerX + (i % 2 === 0 ? -ZIGZAG_AMPLITUDE : ZIGZAG_AMPLITUDE), z: centerZ - half + i * step });
  }
  const segments: Box[] = [];
  for (let i = 0; i < points.length - 1; i += 1) {
    const a = points[i];
    const b = points[i + 1];
    const dx = b.x - a.x;
    const dz = b.z - a.z;
    segments.push({
      x: (a.x + b.x) / 2,
      z: (a.z + b.z) / 2,
      sx: ZIGZAG_THICKNESS,
      sz: Math.hypot(dx, dz),
      rot: Math.atan2(dx, dz),
    });
  }
  return segments;
}

function useTransitOverlays(crossing: Crossing) {
  return useMemo(() => {
    const geo = roadGeometry(crossing);
    const L = geo.roadLength;
    const w = geo.laneWidth;

    const bikeFill: Box[] = [];
    const bikeStripes: Box[] = [];
    if (geo.hasBikeForward) {
      const x = geo.leftEdge - geo.bikeLeftWidth / 2;
      bikeFill.push({ x, z: 0, sx: geo.bikeLeftWidth, sz: L * 2 });
      for (let z = -L + 3; z < L - 3; z += 6) bikeStripes.push({ x, z: z + 1.5, sx: 0.1, sz: 3 });
    }
    if (geo.hasBikeBackward) {
      const x = geo.rightEdge + geo.bikeRightWidth / 2;
      bikeFill.push({ x, z: 0, sx: geo.bikeRightWidth, sz: L * 2 });
      for (let z = -L + 3; z < L - 3; z += 6) bikeStripes.push({ x, z: z + 1.5, sx: 0.1, sz: 3 });
    }

    const busFill: Box[] = [];
    if (geo.hasBusForward && geo.lanesForward > 0) {
      busFill.push({ x: laneCenterX(geo, "forward", busLaneIndex(geo, "forward")), z: 0, sx: w - 0.1, sz: L * 2 });
    }
    if (geo.hasBusBackward && geo.lanesBackward > 0) {
      busFill.push({ x: laneCenterX(geo, "backward", busLaneIndex(geo, "backward")), z: 0, sx: w - 0.1, sz: L * 2 });
    }

    const tramRails: Box[] = [];
    const rails = (centerX: number) => {
      tramRails.push({ x: centerX - TRAM_GAUGE / 2, z: 0, sx: 0.08, sz: L * 2 });
      tramRails.push({ x: centerX + TRAM_GAUGE / 2, z: 0, sx: 0.08, sz: L * 2 });
    };
    if (geo.hasTramForward && geo.lanesForward > 0) rails(laneCenterX(geo, "forward", tramLaneIndex()));
    if (geo.hasTramBackward && geo.lanesBackward > 0) rails(laneCenterX(geo, "backward", tramLaneIndex()));

    const stops: Box[] = [];
    const pushStop = (dir: "forward" | "backward", lane: number, position: Crossing["tram_stop_forward"]) => {
      const p = stopMarkerPosition(geo, dir, lane, position);
      if (p) stops.push(...zigzagLine(p.x, p.z, STOP_MARKER_LENGTH));
    };
    if (geo.hasTramForward) pushStop("forward", tramLaneIndex(), geo.tramStopForward);
    if (geo.hasTramBackward) pushStop("backward", tramLaneIndex(), geo.tramStopBackward);
    if (geo.hasBusForward) pushStop("forward", busLaneIndex(geo, "forward"), geo.busStopForward);
    if (geo.hasBusBackward) pushStop("backward", busLaneIndex(geo, "backward"), geo.busStopBackward);

    return { bikeFill, bikeStripes, busFill, tramRails, stops };
  }, [crossing]);
}

function useZebra(crossing: Crossing): Box[] {
  return useMemo(() => {
    const geo = roadGeometry(crossing);
    const boxes: Box[] = [];
    const stripeWidth = 0.6;
    const gapWidth = 0.6;
    const step = stripeWidth + gapWidth;
    // через полный габарит, включая велополосу — переход есть и для велосипедистов
    let x = geo.outerLeftEdge + stripeWidth / 2;
    while (x < geo.outerRightEdge) {
      boxes.push({ x, z: 0, sx: stripeWidth, sz: geo.crossingWidth });
      x += step;
    }
    return boxes;
  }, [crossing]);
}

export function Roads({
  crossing,
  onGroundClick,
  onGroundPointerMove,
  onGroundPointerLeave,
}: {
  crossing: Crossing;
  onGroundClick?: (event: ThreeEvent<MouseEvent>) => void;
  onGroundPointerMove?: (event: ThreeEvent<PointerEvent>) => void;
  onGroundPointerLeave?: () => void;
}) {
  const markings = useMarkings(crossing);
  const zebra = useZebra(crossing);
  const transit = useTransitOverlays(crossing);
  const geo = roadGeometry(crossing);
  const width = Math.max(geo.rightEdge - geo.leftEdge, geo.laneWidth);
  const centerX = (geo.rightEdge + geo.leftEdge) / 2;

  return (
    <group>
      <mesh
        rotation={[-Math.PI / 2, 0, 0]}
        position={[0, -0.02, 0]}
        receiveShadow
        onClick={onGroundClick}
        onPointerMove={onGroundPointerMove}
        onPointerLeave={onGroundPointerLeave}
      >
        <planeGeometry args={[width + 100, (geo.roadLength + 30) * 2]} />
        <meshStandardMaterial color="#141821" roughness={1} />
      </mesh>

      <mesh
        rotation={[-Math.PI / 2, 0, 0]}
        position={[centerX, 0.002, 0]}
        receiveShadow
      >
        <planeGeometry args={[width, geo.roadLength * 2]} />
        <meshStandardMaterial color={ASPHALT} roughness={0.9} />
      </mesh>

      <InstancedBoxes items={transit.busFill} color={BUS_LANE_TINT} y={0.003} height={0.006} />
      <InstancedBoxes items={transit.bikeFill} color={BIKE_LANE_COLOR} y={0.0025} height={0.005} />
      <InstancedBoxes items={markings} color={PAINT} y={0.02} />
      <InstancedBoxes items={zebra} color={ZEBRA} y={0.021} />
      <InstancedBoxes items={transit.bikeStripes} color={BIKE_LANE_STRIPE} y={0.022} />
      <InstancedBoxes items={transit.tramRails} color={TRAM_RAIL} y={0.03} height={0.04} />
      <InstancedBoxes items={transit.stops} color={STOP_ZIGZAG} y={0.023} height={0.02} />
    </group>
  );
}
