import { useLayoutEffect, useMemo, useRef } from "react";
import * as THREE from "three";

import type { Layout } from "../types";
import { approachFrames, point, travelAxis } from "./layout";

interface Box {
  x: number;
  z: number;
  sx: number;
  sz: number;
}

const ASPHALT = "#23262d";
const JUNCTION = "#2a2d35";
const PAINT = "#d8dde6";

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

/** Разметка: осевые линии, разделители полос, стоп-линии, «зебры». */
function useMarkings(layout: Layout): Box[] {
  return useMemo(() => {
    const boxes: Box[] = [];
    const w = layout.lane_width;
    const L = layout.approach_length;

    for (const frame of approachFrames(layout)) {
      const axis = travelAxis(frame);
      const along = (travel: number, lateral: number, lenAlong: number, lenAcross: number) => {
        const [x, z] = point(frame, travel, lateral);
        boxes.push({
          x,
          z,
          sx: axis === "x" ? lenAlong : lenAcross,
          sz: axis === "x" ? lenAcross : lenAlong,
        });
      };

      const stop = frame.stop_distance;

      // стоп-линия поперёк полос въезда
      along(stop, (frame.lanes_in * w) / 2, 0.5, frame.lanes_in * w);

      // двойная осевая от стоп-линии до края модели
      const centerLen = L - stop;
      along(stop + centerLen / 2, 0.18, centerLen, 0.14);
      along(stop + centerLen / 2, -0.18, centerLen, 0.14);

      // прерывистые разделители полос: въезд (lateral > 0) и выезд (lateral < 0)
      const dashed = (lateral: number) => {
        for (let travel = stop + 3; travel < L - 3; travel += 6) {
          along(travel + 1.5, lateral, 3, 0.12);
        }
      };
      for (let i = 1; i < frame.lanes_in; i += 1) dashed(i * w);
      for (let j = 1; j < frame.lanes_out; j += 1) dashed(-j * w);

      // пешеходный переход между стоп-линией и перекрёстком
      const zebraFrom = -(frame.lanes_out * w);
      const zebraTo = frame.lanes_in * w;
      for (let lateral = zebraFrom + 0.6; lateral < zebraTo; lateral += 1.3) {
        along(stop - 2.0, lateral, 2.6, 0.6);
      }
    }
    return boxes;
  }, [layout]);
}

export function Roads({ layout }: { layout: Layout }) {
  const markings = useMarkings(layout);
  const L = layout.approach_length;
  const ns = layout.half_width_ns;
  const ew = layout.half_width_ew;

  return (
    <group>
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.02, 0]} receiveShadow>
        <planeGeometry args={[(L + 60) * 2, (L + 60) * 2]} />
        <meshStandardMaterial color="#141821" roughness={1} />
      </mesh>

      {/* полотно дорог: север-юг и восток-запад, чуть разная высота против z-fighting */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.002, 0]} receiveShadow>
        <planeGeometry args={[ns * 2, L * 2]} />
        <meshStandardMaterial color={ASPHALT} roughness={0.9} />
      </mesh>
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.004, 0]} receiveShadow>
        <planeGeometry args={[L * 2, ew * 2]} />
        <meshStandardMaterial color={ASPHALT} roughness={0.9} />
      </mesh>
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.006, 0]} receiveShadow>
        <planeGeometry args={[ns * 2, ew * 2]} />
        <meshStandardMaterial color={JUNCTION} roughness={0.9} />
      </mesh>

      <InstancedBoxes items={markings} color={PAINT} y={0.02} />
    </group>
  );
}
