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
  /** "красный всем" после зелёного машинам (через жёлтый) */
  all_red_after_cars_s: number;
  /** "красный всем" после зелёного пешеходам */
  all_red_after_peds_s: number;
  /** минимум зелёного машинам в режиме "Кнопка", прежде чем честь вызов */
  button_min_green_s: number;
  /** длительность зелёного пешеходам в режиме "Кнопка" после срабатывания */
  button_peds_s: number;
  /** сколько часов хранить журнал и снимки интенсивности */
  log_retention_hours: number;
  created_at: string;
  its_devices: ItsDevice[];
  cycles: SignalCycle[];
}

export interface SignalLogEntry {
  id: number;
  /** null — запись уровня перехода (режим/фаза); иначе — запись по конкретному ИТС-объекту */
  device_id: number | null;
  at: string;
  mode: SignalMode | null;
  /** "П" — зелёный пешеходам, "А" — зелёный машинам, null — ни то ни другое (жёлтый/красный всем) */
  active_signal: "П" | "А" | null;
  description: string;
}

export type SignalLogEntryCreate = Partial<
  Pick<SignalLogEntry, "device_id" | "mode" | "active_signal" | "description">
>;

export interface TrafficMetricSnapshot {
  id: number;
  at: string;
  forward_count: number;
  backward_count: number;
  ped_left_count: number;
  ped_right_count: number;
}

export type TrafficMetricSnapshotCreate = Pick<
  TrafficMetricSnapshot,
  "forward_count" | "backward_count" | "ped_left_count" | "ped_right_count"
>;

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
    | "all_red_after_cars_s"
    | "all_red_after_peds_s"
    | "button_min_green_s"
    | "button_peds_s"
    | "log_retention_hours"
  >
>;
