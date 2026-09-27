import type { ItsDevice } from "../types";
import { colorForDevice } from "./deviceColors";

const DEG2RAD = Math.PI / 180;

/**
 * Обычные направленные сенсоры (камера/микроволновый) — петля не в счёт (нет
 * конуса обзора), i2v тоже не в счёт: он не должен детектировать машин/
 * пешеходов вообще, только трамвай/автобус/спецтехнику через отдельный
 * список (см. i2vDevices) — иначе, будучи всенаправленным (fov=360) и
 * дальнобойным (300м), он бы "видел" почти все машины на сцене как обычный
 * широкоугольный сенсор. Выключенные устройства не детектируют.
 */
export function sensorDevices(devices: ItsDevice[]): ItsDevice[] {
  return devices.filter(
    (d) =>
      d.enabled &&
      d.device_type !== "loop" &&
      d.device_type !== "i2v" &&
      d.fov_deg != null &&
      d.view_radius != null,
  );
}

/** i2v-устройства — видят только трамвай/автобус/спецтехнику, см. TrafficSimulation. */
export function i2vDevices(devices: ItsDevice[]): ItsDevice[] {
  return devices.filter((d) => d.enabled && d.device_type === "i2v");
}

/** true, если точка (px,pz) лежит в секторе обзора устройства d. */
export function isWithinFov(d: ItsDevice, px: number, pz: number): boolean {
  const dx = px - d.x;
  const dz = pz - d.z;
  const distance = Math.hypot(dx, dz);
  if (distance > (d.view_radius ?? 0)) return false;
  const angleToTarget = Math.atan2(dx, dz);
  const facing = (d.rotation_deg ?? 0) * DEG2RAD;
  let delta = angleToTarget - facing;
  while (delta > Math.PI) delta -= 2 * Math.PI;
  while (delta < -Math.PI) delta += 2 * Math.PI;
  return Math.abs(delta) <= ((d.fov_deg ?? 0) / 2) * DEG2RAD;
}

/**
 * Цвета всех устройств из allDevices (для стабильного индекса палитры),
 * видящих точку (px,pz) среди sensors (обычно = sensorDevices(allDevices)).
 */
export function detectingColors(
  sensors: ItsDevice[],
  allDevices: ItsDevice[],
  px: number,
  pz: number,
): string[] {
  const colors: string[] = [];
  for (const d of sensors) {
    if (isWithinFov(d, px, pz)) colors.push(colorForDevice(allDevices, d.id));
  }
  return colors;
}
