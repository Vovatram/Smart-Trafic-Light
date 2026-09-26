import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { api } from "../api/client";
import { buildReplayFrame, type ReplayFrame } from "../scene/replay";
import type { Crossing, SceneSnapshot, SignalLogEntry, TrafficMetricSnapshot } from "../types";

const TICK_MS = 200;

export type HistoryTab = "journal" | "charts";
/** "crossing" — журнал уровня перехода (device_id IS NULL); число — журнал конкретного датчика */
export type HistoryTarget = "crossing" | number;

export interface HistoryPlayback {
  open: boolean;
  tab: HistoryTab;
  setTab: (tab: HistoryTab) => void;
  openHistory: (tab: HistoryTab, target?: HistoryTarget) => void;
  close: () => void;

  loading: boolean;
  error: string | null;
  visibleLogs: SignalLogEntry[];
  visibleMetrics: TrafficMetricSnapshot[];
  /** кадр сцены на момент viewTime — интерполяция записанных снимков позиций; null, пока панель закрыта или данных нет */
  replay: ReplayFrame | null;

  viewTime: number;
  rangeMin: number;
  rangeMax: number;
  playing: boolean;
  speed: number;
  setPlaying: (playing: boolean) => void;
  setSpeed: (speed: number) => void;
  setViewTime: (time: number) => void;
  jumpToNow: () => void;
}

/**
 * Данные и таймлайн панели "История" — журнал, графики интенсивности И
 * покадровый replay сцены, все три под общим ползунком времени. Вынесено из
 * HistoryPanel в хук, чтобы App.tsx тоже мог использовать текущий viewTime
 * для подмены живой 3D-сцены историческим кадром (SceneView.replay).
 */
export function useHistoryPlayback(crossing: Crossing | null): HistoryPlayback {
  const [open, setOpen] = useState(false);
  const [tab, setTab] = useState<HistoryTab>("journal");
  const [target, setTarget] = useState<HistoryTarget>("crossing");

  const [logs, setLogs] = useState<SignalLogEntry[]>([]);
  const [metrics, setMetrics] = useState<TrafficMetricSnapshot[]>([]);
  const [sceneSnapshots, setSceneSnapshots] = useState<SceneSnapshot[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const rangeMaxRef = useRef(Date.now());
  const [viewTime, setViewTime] = useState(() => Date.now());
  const [playing, setPlaying] = useState(false);
  const [speed, setSpeed] = useState(1);

  const rangeMin = rangeMaxRef.current - (crossing?.log_retention_hours ?? 24) * 3600 * 1000;
  const rangeMax = rangeMaxRef.current;

  const openHistory = useCallback((nextTab: HistoryTab, nextTarget: HistoryTarget = "crossing") => {
    setTab(nextTab);
    setTarget(nextTarget);
    setOpen(true);
  }, []);
  const close = useCallback(() => setOpen(false), []);
  const jumpToNow = useCallback(() => {
    rangeMaxRef.current = Date.now();
    setViewTime(rangeMaxRef.current);
    setPlaying(false);
  }, []);

  const crossingId = crossing?.id ?? null;

  useEffect(() => {
    if (!open || crossingId === null) return;
    rangeMaxRef.current = Date.now();
    setViewTime(Date.now());
    setPlaying(false);
    setLoading(true);
    setError(null);
    const deviceId = target === "crossing" ? 0 : target;
    Promise.all([
      api.logs(crossingId, deviceId),
      api.metrics(crossingId),
      api.sceneSnapshots(crossingId),
    ])
      .then(([logEntries, snapshots, sceneRows]) => {
        setLogs(logEntries);
        setMetrics(snapshots);
        setSceneSnapshots(sceneRows);
      })
      .catch((cause: Error) => setError(cause.message))
      .finally(() => setLoading(false));
  }, [open, crossingId, target]);

  useEffect(() => {
    if (!open || !playing) return;
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
  }, [open, playing, speed, rangeMax]);

  const visibleLogs = useMemo(
    () => logs.filter((entry) => new Date(entry.at).getTime() <= viewTime),
    [logs, viewTime],
  );
  const visibleMetrics = useMemo(
    () => metrics.filter((snap) => new Date(snap.at).getTime() <= viewTime),
    [metrics, viewTime],
  );
  const replay = useMemo(
    () => (open ? buildReplayFrame(sceneSnapshots, viewTime) : null),
    [open, sceneSnapshots, viewTime],
  );

  return {
    open,
    tab,
    setTab,
    openHistory,
    close,
    loading,
    error,
    visibleLogs,
    visibleMetrics,
    replay,
    viewTime,
    rangeMin,
    rangeMax,
    playing,
    speed,
    setPlaying,
    setSpeed,
    setViewTime,
    jumpToNow,
  };
}
