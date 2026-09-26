export type VehicleSignal = "green" | "yellow" | "red";
export type PedestrianSignal = "walk" | "stop";
export type CameraSide = "left" | "right";

export interface CameraPole {
  id: number;
  side: CameraSide;
  height: number;
  rotation_deg: number;
}

export type CameraPolePatch = Partial<Pick<CameraPole, "side" | "height" | "rotation_deg">>;

export interface CrossingBrief {
  id: number;
  slug: string;
  name: string;
}

export interface Crossing extends CrossingBrief {
  lane_width: number;
  lanes_forward: number; // N: полосы в направлении +Z, 0-5
  lanes_backward: number; // K: полосы в направлении -Z, 0-5
  road_length: number;
  crossing_width: number;
  vehicle_signal: VehicleSignal;
  pedestrian_signal: PedestrianSignal;
  created_at: string;
  camera_poles: CameraPole[];
}

export type CrossingPatch = Partial<
  Pick<
    Crossing,
    | "name"
    | "lane_width"
    | "lanes_forward"
    | "lanes_backward"
    | "road_length"
    | "crossing_width"
    | "vehicle_signal"
    | "pedestrian_signal"
  >
>;
