import { APPROACH_COLOR } from "../scene/ApproachMarkers";
import type { ViewName } from "../scene/SceneView";
import type { Intersection, IntersectionBrief, Layout } from "../types";
import { DIRECTION_LABEL, DIRECTIONS } from "../types";
import { Button, Card, Select } from "./ui";

const VIEW_LABEL: Record<ViewName, string> = {
  perspective: "Перспектива",
  top: "Сверху",
  north: "С севера",
  east: "С востока",
};

const VIEW_ORDER: ViewName[] = ["perspective", "top", "north", "east"];

export function InfoPanel({
  intersections,
  selectedId,
  onSelect,
  intersection,
  layout,
  view,
  onView,
}: {
  intersections: IntersectionBrief[];
  selectedId: number | null;
  onSelect: (id: number) => void;
  intersection: Intersection | null;
  layout: Layout | null;
  view: ViewName;
  onView: (view: ViewName) => void;
}) {
  return (
    <>
      <Card title="Участок">
        <div className="space-y-3">
          <Select
            value={selectedId ?? ""}
            onChange={(value) => onSelect(Number(value))}
            disabled={intersections.length === 0}
          >
            {intersections.length === 0 && <option value="">нет данных</option>}
            {intersections.map((item) => (
              <option key={item.id} value={item.id}>
                {item.name}
              </option>
            ))}
          </Select>

          {layout && (
            <dl className="grid grid-cols-2 gap-x-3 gap-y-1 text-xs text-slate-400">
              <dt>ширина полосы</dt>
              <dd className="text-right text-slate-200">{layout.lane_width} м</dd>
              <dt>длина подхода</dt>
              <dd className="text-right text-slate-200">{layout.approach_length} м</dd>
              <dt>ширина Ю-С</dt>
              <dd className="text-right text-slate-200">{layout.half_width_ns * 2} м</dd>
              <dt>ширина З-В</dt>
              <dd className="text-right text-slate-200">{layout.half_width_ew * 2} м</dd>
            </dl>
          )}
        </div>
      </Card>

      <Card title="Камера">
        <div className="grid grid-cols-2 gap-2">
          {VIEW_ORDER.map((name) => (
            <Button key={name} active={view === name} onClick={() => onView(name)}>
              {VIEW_LABEL[name]}
            </Button>
          ))}
        </div>
        <p className="mt-2 text-[11px] leading-snug text-slate-500">
          Мышь: левая кнопка — поворот, колесо — приближение, правая — сдвиг.
        </p>
      </Card>

      <Card title="Направления">
        <table className="w-full text-xs tabular-nums">
          <thead className="text-slate-500">
            <tr>
              <th className="text-left font-medium">сторона</th>
              <th className="text-right font-medium">въезд</th>
              <th className="text-right font-medium">выезд</th>
              <th className="text-right font-medium">км/ч</th>
            </tr>
          </thead>
          <tbody>
            {DIRECTIONS.map((direction) => {
              const approach = intersection?.approaches.find(
                (item) => item.direction === direction,
              );
              if (!approach) return null;
              return (
                <tr key={direction}>
                  <td className="flex items-center gap-1.5 py-0.5 text-slate-300">
                    <span
                      className="inline-block size-2.5 rounded-sm"
                      style={{ backgroundColor: APPROACH_COLOR[direction] }}
                    />
                    {DIRECTION_LABEL[direction]}
                  </td>
                  <td className="py-0.5 text-right">{approach.lanes_in}</td>
                  <td className="py-0.5 text-right">{approach.lanes_out}</td>
                  <td className="py-0.5 text-right">{approach.speed_limit_kmh}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
        <p className="mt-2 text-[11px] leading-snug text-slate-500">
          Цветные торцы на концах дорог совпадают с цветами в таблице.
        </p>
      </Card>
    </>
  );
}
