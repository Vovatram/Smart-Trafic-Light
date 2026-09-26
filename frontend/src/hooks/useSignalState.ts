import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import type { Crossing, PedestrianSignal, VehicleSignal } from "../types";

const TICK_MS = 200;

export interface LiveSignal {
  vehicle: VehicleSignal;
  pedestrian: PedestrianSignal;
  /** сколько секунд осталось до конца текущей фазы; null — нечего показывать */
  secondsLeft: number | null;
  /** "АУ" для адаптивного режима, иначе округлённые secondsLeft строкой; "" — бейдж скрыт */
  label: string;
  /** только режим "Кнопка": вызов нажат, ждём минимальный зелёный машинам */
  callPending: boolean;
}

type ButtonPhase = "cars" | "clear_to_peds" | "peds" | "clear_to_cars";

interface ButtonState {
  phase: ButtonPhase;
  elapsed: number;
  callPending: boolean;
}

const IDLE: LiveSignal = {
  vehicle: "red",
  pedestrian: "stop",
  secondsLeft: null,
  label: "",
  callPending: false,
};

function cycleSignal(
  greenCarsS: number,
  allRedS: number,
  greenPedsS: number,
  t: number,
): LiveSignal {
  const gap1End = greenCarsS + allRedS;
  const pedsEnd = gap1End + greenPedsS;
  const total = pedsEnd + allRedS;
  if (t < greenCarsS) {
    return { vehicle: "green", pedestrian: "stop", secondsLeft: greenCarsS - t, label: "", callPending: false };
  }
  if (t < gap1End) {
    return { vehicle: "red", pedestrian: "stop", secondsLeft: gap1End - t, label: "", callPending: false };
  }
  if (t < pedsEnd) {
    return { vehicle: "red", pedestrian: "walk", secondsLeft: pedsEnd - t, label: "", callPending: false };
  }
  return { vehicle: "red", pedestrian: "stop", secondsLeft: total - t, label: "", callPending: false };
}

/**
 * Живое состояние светофора перехода: в manual — просто то, что хранится в
 * БД (правится кликом по светофору); в остальных режимах считается на
 * клиенте каждые TICK_MS, без обращений к серверу. Тикер не зависит от
 * TrafficSimulation (та работает через useFrame внутри Canvas) — здесь
 * обычный React-хук, потому что светофору хватает точности ~200мс, а
 * бейдж и SignalMasts живут и вне, и внутри Canvas.
 */
export function useSignalState(crossing: Crossing | null): {
  live: LiveSignal;
  requestCall: () => void;
} {
  const [tick, setTick] = useState(0);
  const buttonRef = useRef<ButtonState>({ phase: "cars", elapsed: 0, callPending: false });
  const modeKeyRef = useRef<string | null>(null);
  const lastTickRef = useRef(performance.now());

  useEffect(() => {
    const id = setInterval(() => setTick((n) => n + 1), TICK_MS);
    return () => clearInterval(id);
  }, []);

  // новый переход или смена режима — сбрасываем автомат "кнопки" с нуля
  const modeKey = crossing ? `${crossing.id}:${crossing.signal_mode}` : null;
  useEffect(() => {
    if (modeKey !== modeKeyRef.current) {
      modeKeyRef.current = modeKey;
      buttonRef.current = { phase: "cars", elapsed: 0, callPending: false };
      lastTickRef.current = performance.now();
    }
  }, [modeKey]);

  const requestCall = useCallback(() => {
    buttonRef.current.callPending = true;
  }, []);

  // Намеренно нечистая функция внутри useMemo: автомат режима "Кнопка"
  // продвигается ровно на один шаг за пересчёт. Это безопасно, поскольку
  // пересчёт идёт строго по tick (раз в TICK_MS) и никогда не задваивается
  // в рамках одного рендера.
  const live = useMemo<LiveSignal>(() => {
    if (!crossing) return IDLE;

    if (crossing.signal_mode === "manual") {
      return {
        vehicle: crossing.vehicle_signal,
        pedestrian: crossing.pedestrian_signal,
        secondsLeft: null,
        label: "",
        callPending: false,
      };
    }

    if (crossing.signal_mode === "adaptive") {
      return { vehicle: "red", pedestrian: "walk", secondsLeft: null, label: "АУ", callPending: false };
    }

    if (crossing.signal_mode === "cycle") {
      const active = crossing.cycles.find((c) => c.id === crossing.active_cycle_id) ?? crossing.cycles[0];
      if (!active) return { ...IDLE, label: "нет цикла" };
      const total = active.green_cars_s + crossing.all_red_s * 2 + active.green_peds_s;
      const t = (performance.now() / 1000) % total;
      const signal = cycleSignal(active.green_cars_s, crossing.all_red_s, active.green_peds_s, t);
      return { ...signal, label: String(Math.ceil(signal.secondsLeft ?? 0)) };
    }

    // button
    const now = performance.now();
    const dt = Math.min((now - lastTickRef.current) / 1000, 1);
    lastTickRef.current = now;
    const st = buttonRef.current;
    st.elapsed += dt;

    if (st.phase === "cars") {
      if (st.callPending && st.elapsed >= crossing.button_min_green_s) {
        st.phase = "clear_to_peds";
        st.elapsed = 0;
        st.callPending = false;
      } else {
        const secondsLeft = st.callPending
          ? Math.max(0, crossing.button_min_green_s - st.elapsed)
          : null;
        return {
          vehicle: "green",
          pedestrian: "stop",
          secondsLeft,
          label: secondsLeft === null ? "" : String(Math.ceil(secondsLeft)),
          callPending: st.callPending,
        };
      }
    }
    if (st.phase === "clear_to_peds") {
      if (st.elapsed >= crossing.all_red_s) {
        st.phase = "peds";
        st.elapsed = 0;
      } else {
        const secondsLeft = crossing.all_red_s - st.elapsed;
        return {
          vehicle: "red",
          pedestrian: "stop",
          secondsLeft,
          label: String(Math.ceil(secondsLeft)),
          callPending: false,
        };
      }
    }
    if (st.phase === "peds") {
      if (st.elapsed >= crossing.button_peds_s) {
        st.phase = "clear_to_cars";
        st.elapsed = 0;
      } else {
        const secondsLeft = crossing.button_peds_s - st.elapsed;
        return {
          vehicle: "red",
          pedestrian: "walk",
          secondsLeft,
          label: String(Math.ceil(secondsLeft)),
          callPending: false,
        };
      }
    }
    // clear_to_cars
    if (st.elapsed >= crossing.all_red_s) {
      st.phase = "cars";
      st.elapsed = 0;
      return { vehicle: "green", pedestrian: "stop", secondsLeft: null, label: "", callPending: false };
    }
    const secondsLeft = crossing.all_red_s - st.elapsed;
    return {
      vehicle: "red",
      pedestrian: "stop",
      secondsLeft,
      label: String(Math.ceil(secondsLeft)),
      callPending: false,
    };
    // tick растёт каждые TICK_MS — единственная причина пересчитывать это каждый интервал
  }, [crossing, tick]);

  return { live, requestCall };
}
