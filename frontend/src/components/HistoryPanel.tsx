import type { HistoryPlayback } from "../hooks/useHistoryPlayback";
import { IntensityCharts } from "./IntensityChart";
import { JournalTable } from "./JournalTable";
import { Button } from "./ui";

const SPEEDS = [1, 4, 16, 60];

function formatClock(ms: number): string {
  return new Date(ms).toLocaleTimeString("ru-RU", { hour: "2-digit", minute: "2-digit", second: "2-digit" });
}

/**
 * Нижняя выдвижная панель: журнал/графики + общий таймлайн. Тот же
 * viewTime, которым таймлайн скроллит журнал и графики, одновременно
 * подменяет и саму 3D-сцену на записанный исторический кадр (см.
 * useHistoryPlayback.replay → App.tsx → SceneView.replay) — все три вида
 * истории мотаются одним ползунком.
 */
export function HistoryPanel({ playback }: { playback: HistoryPlayback }) {
  const { tab, setTab, close, loading, error, visibleLogs, visibleMetrics } = playback;

  return (
    <div className="absolute inset-x-4 bottom-4 z-10 mx-auto max-w-3xl rounded-xl border border-slate-700/60 bg-slate-900/95 shadow-2xl backdrop-blur-sm">
      <div className="flex items-center justify-between border-b border-slate-800 px-3 py-2">
        <div className="flex gap-2">
          <Button active={tab === "journal"} onClick={() => setTab("journal")}>
            Журнал
          </Button>
          <Button active={tab === "charts"} onClick={() => setTab("charts")}>
            Графики
          </Button>
        </div>
        <button onClick={close} className="text-slate-500 hover:text-slate-200" aria-label="Закрыть">
          ✕
        </button>
      </div>

      <div className="max-h-[40vh] overflow-y-auto px-3 py-3">
        {error && <p className="text-sm text-rose-300">{error}</p>}
        {!error && loading && <p className="text-sm text-slate-500">Загрузка…</p>}
        {!error && !loading && tab === "journal" && <JournalTable entries={visibleLogs} />}
        {!error && !loading && tab === "charts" && <IntensityCharts snapshots={visibleMetrics} />}
      </div>

      <TimelineControls playback={playback} />
    </div>
  );
}

/** Один ползунок сразу для журнала, графиков и replay сцены — отдельно, чтобы не раздувать HistoryPanel. */
function TimelineControls({ playback }: { playback: HistoryPlayback }) {
  const { viewTime, rangeMin, rangeMax, playing, speed, setPlaying, setSpeed, setViewTime, jumpToNow } =
    playback;

  return (
    <div className="flex items-center gap-3 border-t border-slate-800 px-3 py-2">
      <Button className="!px-2.5 !py-1" onClick={() => setPlaying(!playing)}>
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
  );
}
