import { useMemo } from "react";

import type { Frame, Layout, SignalState, Turn } from "../types";
import { TURNS } from "../types";
import { approachFrames, point, type ApproachFrame } from "./layout";

const LAMP_COLOR: Record<SignalState, string> = {
  red: "#f43f5e",
  yellow: "#facc15",
  green: "#22c55e",
};

const LAMP_ORDER: SignalState[] = ["red", "yellow", "green"];

const MAST_HEIGHT = 6.2;
const HEAD_HEIGHT = 5.0;

function Lamp({ state, active, y }: { state: SignalState; active: boolean; y: number }) {
  return (
    <mesh position={[0, y, 0.2]}>
      <sphereGeometry args={[0.17, 16, 12]} />
      <meshStandardMaterial
        color={active ? LAMP_COLOR[state] : "#1f2430"}
        emissive={active ? LAMP_COLOR[state] : "#000000"}
        emissiveIntensity={active ? 2.2 : 0}
        roughness={0.4}
      />
    </mesh>
  );
}

/** Стрелка под линзами: локальный +X у головы смотрит влево по ходу движения. */
function Arrow({ turn }: { turn: Turn }) {
  const rotation = turn === "left" ? -Math.PI / 2 : turn === "right" ? Math.PI / 2 : 0;
  return (
    <group position={[0, -0.92, 0.19]} rotation={[0, 0, rotation]}>
      <mesh position={[0, -0.06, 0]}>
        <boxGeometry args={[0.05, 0.16, 0.02]} />
        <meshBasicMaterial color="#94a3b8" />
      </mesh>
      <mesh position={[0, 0.08, 0]}>
        <coneGeometry args={[0.09, 0.14, 4]} />
        <meshBasicMaterial color="#94a3b8" />
      </mesh>
    </group>
  );
}

function SignalHead({
  position,
  rotation,
  state,
  turn,
}: {
  position: [number, number, number];
  rotation: number;
  state: SignalState;
  turn: Turn;
}) {
  return (
    <group position={position} rotation={[0, rotation, 0]}>
      <mesh castShadow>
        <boxGeometry args={[0.5, 1.4, 0.35]} />
        <meshStandardMaterial color="#111520" roughness={0.7} />
      </mesh>
      {LAMP_ORDER.map((lamp, index) => (
        <Lamp key={lamp} state={lamp} active={state === lamp} y={0.45 - index * 0.45} />
      ))}
      <Arrow turn={turn} />
    </group>
  );
}

function Mast({
  frame,
  laneWidth,
  signals,
}: {
  frame: ApproachFrame;
  laneWidth: number;
  signals: Record<Turn, SignalState>;
}) {
  const block = frame.lanes_in * laneWidth;
  const travel = frame.stop_distance - 0.6;

  // мачта стоит на обочине справа по ходу движения, консоль нависает над полосами
  const [poleX, poleZ] = point(frame, travel, block + 1.2);
  const [armEndX, armEndZ] = point(frame, travel, 0.4);
  const armCenter: [number, number, number] = [
    (poleX + armEndX) / 2,
    MAST_HEIGHT - 0.2,
    (poleZ + armEndZ) / 2,
  ];
  const armLength = Math.hypot(armEndX - poleX, armEndZ - poleZ);
  const armRotation = Math.atan2(armEndX - poleX, armEndZ - poleZ);

  // светофор смотрит навстречу машинам, то есть против направления движения
  const facing = Math.atan2(-frame.h[0], -frame.h[1]);

  return (
    <group>
      <mesh position={[poleX, MAST_HEIGHT / 2, poleZ]} castShadow>
        <cylinderGeometry args={[0.14, 0.18, MAST_HEIGHT, 12]} />
        <meshStandardMaterial color="#3b4252" roughness={0.6} metalness={0.3} />
      </mesh>
      <mesh position={armCenter} rotation={[0, armRotation, 0]} castShadow>
        <boxGeometry args={[0.12, 0.12, armLength]} />
        <meshStandardMaterial color="#3b4252" roughness={0.6} metalness={0.3} />
      </mesh>
      {TURNS.map((turn, index) => {
        const lateral = (block * (index + 0.5)) / TURNS.length;
        const [x, z] = point(frame, travel, lateral);
        return (
          <SignalHead
            key={turn}
            turn={turn}
            state={signals[turn] ?? "red"}
            position={[x, HEAD_HEIGHT, z]}
            rotation={facing}
          />
        );
      })}
    </group>
  );
}

export function SignalMasts({
  layout,
  signals,
}: {
  layout: Layout;
  signals: Frame["signals"] | undefined;
}) {
  const frames = useMemo(() => approachFrames(layout), [layout]);
  const allRed: Record<Turn, SignalState> = { left: "red", straight: "red", right: "red" };

  return (
    <group>
      {frames.map((frame) => (
        <Mast
          key={frame.direction}
          frame={frame}
          laneWidth={layout.lane_width}
          signals={signals?.[frame.direction] ?? allRed}
        />
      ))}
    </group>
  );
}
