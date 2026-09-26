/**
 * У каждого ИТС-объекта — свой цвет: им подсвечивается сектор обзора и
 * машины/пешеходы, которых этот объект обнаружил. Индекс — по порядку
 * объектов у перехода (стабильный, т.к. сервер отдаёт их по id).
 */
const PALETTE = [
  "#f97316", // оранжевый
  "#22c55e", // зелёный
  "#38bdf8", // голубой
  "#eab308", // жёлтый
  "#ec4899", // розовый
  "#a78bfa", // фиолетовый
  "#14b8a6", // бирюзовый
  "#ef4444", // красный
];

export function colorForDevice(devices: { id: number }[], id: number): string {
  const index = devices.findIndex((d) => d.id === id);
  return PALETTE[(index < 0 ? 0 : index) % PALETTE.length];
}
