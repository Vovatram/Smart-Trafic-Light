export type VehicleSignal = "green" | "yellow" | "red";
export type PedestrianSignal = "walk" | "stop";
export type DeviceType = "camera" | "microwave" | "loop";

export interface ItsDevice {
  id: number;
  device_type: DeviceType;
  x: number;
  z: number;
  height: number | null;
  rotation_deg: number | null;
  fov_deg: number | null;
  view_radius: number | null;
  stream_url: string | null;
  loop_length: number | null;
}

export type ItsDeviceCreate = Pick<ItsDevice, "device_type" | "x" | "z"> &
  Partial<Pick<ItsDevice, "height" | "rotation_deg" | "fov_deg" | "view_radius" | "stream_url" | "loop_length">>;

export type ItsDevicePatch = Partial<
  Pick<ItsDevice, "x" | "z" | "height" | "rotation_deg" | "fov_deg" | "view_radius" | "stream_url" | "loop_length">
>;

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
  its_devices: ItsDevice[];
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
