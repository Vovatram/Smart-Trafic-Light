export type Direction = "N" | "E" | "S" | "W";
export type Turn = "left" | "straight" | "right";
export type SignalState = "green" | "yellow" | "red";
export type PhaseState = "green" | "yellow" | "all_red";

export const DIRECTIONS: Direction[] = ["N", "E", "S", "W"];
export const TURNS: Turn[] = ["left", "straight", "right"];

export const DIRECTION_LABEL: Record<Direction, string> = {
  N: "Север",
  E: "Восток",
  S: "Юг",
  W: "Запад",
};

export const TURN_LABEL: Record<Turn, string> = {
  left: "налево",
  straight: "прямо",
  right: "направо",
};

export interface ApproachLayout {
  direction: Direction;
  heading: [number, number];
  lanes_in: number;
  lanes_out: number;
  stop_distance: number;
  speed_limit_kmh: number;
}

export interface Layout {
  type: "layout";
  lane_width: number;
  approach_length: number;
  half_width_ns: number;
  half_width_ew: number;
  vehicle: { length: number; width: number };
  approaches: ApproachLayout[];
}

export interface VehicleFrame {
  id: number;
  x: number;
  z: number;
  h: number;
  v: number;
  d: Direction;
  t: Turn;
}

export interface DirectionStats {
  queue: number;
  avg_wait: number;
  departed: number;
  spawned: number;
}

export interface Frame {
  type: "frame";
  time: number;
  phase: { index: number; state: PhaseState; remaining: number };
  signals: Partial<Record<Direction, Record<Turn, SignalState>>>;
  vehicles: VehicleFrame[];
  stats: Partial<Record<Direction, DirectionStats>>;
}

export interface Approach {
  id: number;
  direction: Direction;
  lanes_in: number;
  lanes_out: number;
  speed_limit_kmh: number;
  arrival_rate_vph: number;
  turn_ratios: Partial<Record<Turn, number>>;
}

export interface Phase {
  id: number;
  position: number;
  green_s: number;
  yellow_s: number;
  all_red_s: number;
  movements: Partial<Record<Direction, Turn[]>>;
}

export interface Program {
  id: number;
  name: string;
  is_active: boolean;
  phases: Phase[];
}

export interface IntersectionBrief {
  id: number;
  slug: string;
  name: string;
}

export interface Intersection extends IntersectionBrief {
  lane_width: number;
  approach_length: number;
  created_at: string;
  approaches: Approach[];
  programs: Program[];
}

export interface Run {
  id: number;
  intersection_id: number;
  program_id: number;
  status: "running" | "stopped";
  seed: number;
  started_at: string;
  stopped_at: string | null;
  sim_duration_s: number;
}
