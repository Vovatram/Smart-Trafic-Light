import type { TrafficMetricSnapshot } from "../types";

interface Series {
  label: string;
  color: string;
  values: number[];
}

const CHART_W = 560;
const CHART_H = 120;

/** Простой линейный график без внешних зависимостей — несколько рядов на одних осях. */
function LineChart({ series }: { series: Series[] }) {
  const n = Math.max(...series.map((s) => s.values.length), 2);
  const maxY = Math.max(1, ...series.flatMap((s) => s.values));
  const x = (i: number) => (n <= 1 ? 0 : (i / (n - 1)) * CHART_W);
  const y = (v: number) => CHART_H - (v / maxY) * CHART_H;

  return (
    <svg viewBox={`0 0 ${CHART_W} ${CHART_H}`} className="h-auto w-full" preserveAspectRatio="none">
      {[0, 0.25, 0.5, 0.75, 1].map((f) => (
        <line
          key={f}
          x1={0}
          x2={CHART_W}
          y1={CHART_H * f}
          y2={CHART_H * f}
          stroke="#334155"
          strokeWidth={1}
        />
      ))}
      {series.map((s) =>
        s.values.length > 1 ? (
          <polyline
            key={s.label}
            fill="none"
            stroke={s.color}
            strokeWidth={2}
            points={s.values.map((v, i) => `${x(i)},${y(v)}`).join(" ")}
          />
        ) : null,
      )}
    </svg>
  );
}

function Legend({ series }: { series: Series[] }) {
  return (
    <div className="mt-1 flex flex-wrap gap-3">
      {series.map((s) => (
        <span key={s.label} className="flex items-center gap-1.5 text-[11px] text-slate-400">
          <span className="inline-block h-2 w-2 rounded-full" style={{ backgroundColor: s.color }} />
          {s.label}
        </span>
      ))}
    </div>
  );
}

/** Два графика: интенсивность машин по направлениям и пешеходов по направлениям. */
export function IntensityCharts({ snapshots }: { snapshots: TrafficMetricSnapshot[] }) {
  const vehicles: Series[] = [
    { label: "Машины →", color: "#38bdf8", values: snapshots.map((s) => s.forward_count) },
    { label: "Машины ←", color: "#f97316", values: snapshots.map((s) => s.backward_count) },
  ];
  const pedestrians: Series[] = [
    { label: "Пешеходы →", color: "#22c55e", values: snapshots.map((s) => s.ped_left_count) },
    { label: "Пешеходы ←", color: "#ec4899", values: snapshots.map((s) => s.ped_right_count) },
  ];

  if (snapshots.length === 0) {
    return <p className="text-xs text-slate-500">Пока нет данных — снимки пишутся каждые 30 с.</p>;
  }

  return (
    <div className="space-y-4">
      <div>
        <span className="mb-1 block text-xs text-slate-400">Машины по направлениям</span>
        <LineChart series={vehicles} />
        <Legend series={vehicles} />
      </div>
      <div>
        <span className="mb-1 block text-xs text-slate-400">Пешеходы по направлениям</span>
        <LineChart series={pedestrians} />
        <Legend series={pedestrians} />
      </div>
    </div>
  );
}
