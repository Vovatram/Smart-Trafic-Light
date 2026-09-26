import { useMemo } from "react";

import type { Direction, Layout } from "../types";
import { approachFrames, point, travelAxis } from "./layout";

/** Цвета торцов дороги — те же, что в легенде интерфейса. */
export const APPROACH_COLOR: Record<Direction, string> = {
  N: "#60a5fa",
  E: "#fbbf24",
  S: "#fb7185",
  W: "#34d399",
};

/** Метки на концах участка, чтобы не терять ориентацию при вращении камеры. */
export function ApproachMarkers({ layout }: { layout: Layout }) {
  const markers = useMemo(() => {
    const w = layout.lane_width;
    return approachFrames(layout).map((frame) => {
      const width = (frame.lanes_in + frame.lanes_out) * w;
      const lateral = (frame.lanes_in * w - frame.lanes_out * w) / 2;
      const [x, z] = point(frame, layout.approach_length - 0.8, lateral);
      const alongX = travelAxis(frame) === "x";
      return {
        direction: frame.direction,
        position: [x, 0.35, z] as [number, number, number],
        size: [alongX ? 1.4 : width, 0.7, alongX ? width : 1.4] as [number, number, number],
      };
    });
  }, [layout]);

  return (
    <group>
      {markers.map((marker) => (
        <mesh key={marker.direction} position={marker.position} castShadow>
          <boxGeometry args={marker.size} />
          <meshStandardMaterial
            color={APPROACH_COLOR[marker.direction]}
            emissive={APPROACH_COLOR[marker.direction]}
            emissiveIntensity={0.35}
            roughness={0.5}
          />
        </mesh>
      ))}
    </group>
  );
}
