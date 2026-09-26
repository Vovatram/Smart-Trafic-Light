import { useEffect, useRef, useState } from "react";

import { runStreamUrl } from "../api/client";
import type { Frame, Layout } from "../types";

export interface Hud {
  time: number;
  phase: Frame["phase"];
  signals: Frame["signals"];
  stats: Frame["stats"];
  vehicles: number;
}

const HUD_INTERVAL_MS = 200;

/**
 * Держит WebSocket с прогоном: кадры складываются в ref (их читает сцена
 * на каждом кадре рендера), а панель обновляется не чаще 5 раз в секунду.
 */
export function useRunStream(runId: number | null) {
  const frameRef = useRef<Frame | null>(null);
  const [layout, setLayout] = useState<Layout | null>(null);
  const [hud, setHud] = useState<Hud | null>(null);
  const [connected, setConnected] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    frameRef.current = null;
    setHud(null);
    setError(null);
    if (runId == null) {
      setConnected(false);
      return;
    }

    const socket = new WebSocket(runStreamUrl(runId));
    let lastHudAt = 0;

    socket.onopen = () => setConnected(true);
    socket.onclose = (event) => {
      setConnected(false);
      if (event.code === 4404) setError("прогон не запущен на сервере");
    };
    socket.onerror = () => setError("не удалось подключиться к потоку симуляции");
    socket.onmessage = (event) => {
      const message = JSON.parse(event.data as string) as Layout | Frame;
      if (message.type === "layout") {
        setLayout(message);
        return;
      }
      frameRef.current = message;
      const now = performance.now();
      if (now - lastHudAt >= HUD_INTERVAL_MS) {
        lastHudAt = now;
        setHud({
          time: message.time,
          phase: message.phase,
          signals: message.signals,
          stats: message.stats,
          vehicles: message.vehicles.length,
        });
      }
    };

    return () => {
      socket.onclose = null;
      socket.close();
    };
  }, [runId]);

  return { frameRef, layout, setLayout, hud, connected, error };
}
