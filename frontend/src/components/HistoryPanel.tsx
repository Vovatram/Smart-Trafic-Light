import { useEffect, useMemo, useRef, useState } from "react";

import { api } from "../api/client";
import type { Crossing, SignalLogEntry, TrafficMetricSnapshot } from "../types";
import { IntensityCharts } from "./IntensityChart";
import { JournalTable } from "./JournalTable";
import { Button } from "./ui";

const TICK_MS = 200;
const SPEEDS = [1, 4, 16, 60];

export type HistoryTab = "journal" | "charts";
/** "crossing" — журнал уровня перехода (device_id IS NULL); число — журнал конкретного датчика */
export type HistoryTarget = "crossing" | number;

function formatClock(ms: number): string {
  return new Date(ms).toLocaleTimeString("ru-RU", { hour: "2-digit", minute: "2-digit", second: "2-digit" });
}

/**
 * Нижняя выдвижная панель: журнал/графики + таймлайн для прокрутки истории.
 * Таймлайн скроллит именно эти данные (журнал и графики), не саму 3D-сцену —
 * симуляция потока процедурная и не записывается кадр-в-кадр, воспроизвести
 * её позиции машин "как было в 15:32" нечем.
 */
export function HistoryPanel({
  crossing,
  target,
  tab,
  onTabChange,
  onClose,
}: {
  crossing: Crossing;
  target: HistoryTarget;
  tab: HistoryTab;
  onTabChange: (tab: HistoryTab) => void;
  onClose: () => void;
}) {
  const [logs, setLogs] = useState<SignalLogEntry[]>([]);
  const [metrics, setMetrics] = useState<TrafficMetricSnapshot[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const rangeMaxRef = useRef(Date.now());
  const [viewTime, setViewTime] = useState(() => Date.now());
  const [playing, setPlaying] = useState(false);
  const [speed, setSpeed] = useState(1);

  const rangeMin = rangeMaxRef.current - crossing.log_retention_hours * 3600 * 1000;
  const rangeMax = rangeMaxRef.current;

  useEffect(() => {
    rangeMaxRef.current = Date.now();
    setViewTime(Date.now());
    setPlaying(false);
    setLoading(true);
    setError(null);
    const deviceId = target === "crossing" ? 0 : target;
    Promise.all([api.logs(crossing.id, deviceId), api.metrics(crossing.id)])
      .then(([logEntries, snapshots]) => {
        setLogs(logEntries);
        setMetrics(snapshots);
      })
      .catch((cause: Error) => setError(cause.message))
      .finally(() => setLoading(false));
  }, [crossing.id, target]);

  useEffect(() => {
    if (!playing) return;
    const id = setInterval(() => {
      setViewTime((t) => {
        const next = t + speed * TICK_MS;
        if (next >= rangeMax) {
          setPlaying(false);
          return rangeMax;
        }
        return next;
      });
    }, TICK_MS);
    return () => clearInterval(id);
  }, [playing, speed, rangeMax]);

  const visibleLogs = useMemo(
    () => logs.filter((entry) => new Date(entry.at).getTime() <= viewTime),
    [logs, viewTime],
  );
  const visibleMetrics = useMemo(
    () => metrics.filter((snap) => new Date(snap.at).getTime() <= viewTime),
    [metrics, viewTime],
  );

  const jumpToNow = () => {
    rangeMaxRef.current = Date.now();
    setViewTime(rangeMaxRef.current);
    setPlaying(false);
  };

  return (
    <div className="absolute inset-x-4 bottom-4 z-10 mx-auto max-w-3xl rounded-xl border border-slate-700/60 bg-slate-900/95 shadow-2xl backdrop-blur-sm">
      <div className="flex items-center justify-between border-b border-slate-800 px-3 py-2">
        <div className="flex gap-2">
          <Button active={tab === "journal"} onClick={() => onTabChange("journal")}>
            Журнал
          </Button>
          <Button active={tab === "charts"} onClick={() => onTabChange("charts")}>
            Графики
          </Button>
        </div>
        <button onClick={onClose} className="text-slate-500 hover:text-slate-200" aria-label="Закрыть">
          ✕
        </button>
      </div>

      <div className="max-h-[40vh] overflow-y-auto px-3 py-3">
        {error && <p className="text-sm text-rose-300">{error}</p>}
        {!error && loading && <p className="text-sm text-slate-500">Загрузка…</p>}
        {!error && !loading && tab === "journal" && <JournalTable entries={visibleLogs} />}
        {!error && !loading && tab === "charts" && <IntensityCharts snapshots={visibleMetrics} />}
      </div>

      <div className="flex items-center gap-3 border-t border-slate-800 px-3 py-2">
        <Button className="!px-2.5 !py-1" onClick={() => setPlaying((p) => !p)}>
          {playing ? "⏸" : "▶"}
        </Button>
        <div className="flex gap-1">
          {SPEEDS.map((s) => (
            <Button key={s} active={speed === s} className="!px-2 !py-1 text-xs" onClick={() => setSpeed(s)}>
              ×{s}
            </Button>
          ))}
        </div>
        <input
          type="range"
          min={rangeMin}
          max={rangeMax}
          value={viewTime}
          onChange={(event) => {
            setPlaying(false);
            setViewTime(Number(event.target.value));
          }}
          className="flex-1 accent-sky-500"
        />
        <span className="w-16 shrink-0 text-right text-xs tabular-nums text-slate-300">
          {formatClock(viewTime)}
        </span>
        <Button className="!px-2.5 !py-1 text-xs" onClick={jumpToNow}>
          Сейчас
        </Button>
      </div>
    </div>
  );
}
