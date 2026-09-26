export type VehicleSignal = "green" | "yellow" | "red";
export type PedestrianSignal = "walk" | "stop";
export type DeviceType = "camera" | "microwave" | "loop";
export type SignalMode = "manual" | "adaptive" | "cycle" | "button";

export interface SignalCycle {
  id: number;
  name: string;
  green_cars_s: number;
  green_peds_s: number;
}

export type SignalCyclePatch = Partial<Pick<SignalCycle, "name" | "green_cars_s" | "green_peds_s">>;

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
  /** машин/час, направление N (вперёд) */
  vph_forward: number;
  /** машин/час, направление K (назад) */
  vph_backward: number;
  /** пешеходов/час, стартующих с левой обочины перехода */
  peds_left_vph: number;
  /** пешеходов/час, стартующих с правой обочины перехода */
  peds_right_vph: number;
  signal_mode: SignalMode;
  active_cycle_id: number | null;
  /** "красный всем" между фазами — и в циклах, и в кнопочном режиме */
  all_red_s: number;
  /** минимум зелёного машинам в режиме "Кнопка", прежде чем честь вызов */
  button_min_green_s: number;
  /** длительность зелёного пешеходам в режиме "Кнопка" после срабатывания */
  button_peds_s: number;
  created_at: string;
  its_devices: ItsDevice[];
  cycles: SignalCycle[];
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
    | "vph_forward"
    | "vph_backward"
    | "peds_left_vph"
    | "peds_right_vph"
    | "signal_mode"
    | "active_cycle_id"
    | "all_red_s"
    | "button_min_green_s"
    | "button_peds_s"
  >
>;
