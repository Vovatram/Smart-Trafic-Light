import type { ThreeEvent } from "@react-three/fiber";
import { useLayoutEffect, useMemo, useRef } from "react";
import * as THREE from "three";

import type { Crossing } from "../types";
import { roadGeometry } from "./layout";

interface Box {
  x: number;
  z: number;
  sx: number;
  sz: number;
}

const ASPHALT = "#23262d";
const PAINT = "#d8dde6";
const ZEBRA = "#e9edf4";

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
    items.forEach((box, index) => {
      matrix.makeScale(box.sx, height, box.sz);
      matrix.setPosition(box.x, y, box.z);
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

    // прерывистые между полосами одного направления
    const dashed = (x: number) => {
      for (let z = -L + 3; z < -gap - 1; z += 6) boxes.push({ x, z: z + 1.5, sx: 0.12, sz: 3 });
      for (let z = gap + 1; z < L - 3; z += 6) boxes.push({ x, z: z + 1.5, sx: 0.12, sz: 3 });
    };
    for (let i = 1; i < geo.lanesForward; i += 1) dashed(-i * w);
    for (let i = 1; i < geo.lanesBackward; i += 1) dashed(i * w);

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

function useZebra(crossing: Crossing): Box[] {
  return useMemo(() => {
    const geo = roadGeometry(crossing);
    const boxes: Box[] = [];
    const stripeWidth = 0.6;
    const gapWidth = 0.6;
    const step = stripeWidth + gapWidth;
    let x = geo.leftEdge + stripeWidth / 2;
    while (x < geo.rightEdge) {
      boxes.push({ x, z: 0, sx: stripeWidth, sz: geo.crossingWidth });
      x += step;
    }
    return boxes;
  }, [crossing]);
}

export function Roads({
  crossing,
  onGroundClick,
}: {
  crossing: Crossing;
  onGroundClick?: (event: ThreeEvent<MouseEvent>) => void;
}) {
  const markings = useMarkings(crossing);
  const zebra = useZebra(crossing);
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

      <InstancedBoxes items={markings} color={PAINT} y={0.02} />
      <InstancedBoxes items={zebra} color={ZEBRA} y={0.021} />
    </group>
  );
}
