import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import type { Crossing, PedestrianSignal, VehicleSignal } from "../types";

const TICK_MS = 200;
const YELLOW_S = 3; // жёлтая фаза машинам перед переходом в красный — не настраивается

export interface LiveSignal {
  vehicle: VehicleSignal;
  pedestrian: PedestrianSignal;
  /** секунды до следующей смены автомобильного сигнала; null — нет расписания ("АУ") */
  vehicleSecondsLeft: number | null;
  /** то же самое для пешеходного */
  pedestrianSecondsLeft: number | null;
  /** "АУ" (нет расписания) / число секунд строкой / "" — бейдж скрыт (ручной режим) */
  vehicleLabel: string;
  pedestrianLabel: string;
  /** только режим "Кнопка": вызов нажат, ждём минимальный зелёный машинам */
  callPending: boolean;
}

type ButtonPhase = "cars" | "yellow" | "clear_to_peds" | "peds" | "clear_to_cars";

interface ButtonState {
  phase: ButtonPhase;
  elapsed: number;
  callPending: boolean;
}

function label(seconds: number | null): string {
  return seconds === null ? "АУ" : String(Math.ceil(seconds));
}

const IDLE: LiveSignal = {
  vehicle: "red",
  pedestrian: "stop",
  vehicleSecondsLeft: null,
  pedestrianSecondsLeft: null,
  vehicleLabel: "",
  pedestrianLabel: "",
  callPending: false,
};

/**
 * Цикл: зелёный машинам -> жёлтый -> красный всем -> зелёный пешеходам ->
 * красный всем -> сначала. Две отдельных красных фазы: после машин (через
 * жёлтый) и после пешеходов. Секунды считаются раздельно для каждого
 * сигнала — до его СЛЕДУЮЩЕЙ смены цвета, а не до конца всей фазы: машины
 * остаются красными на протяжении и "красный после машин", и "зелёный
 * пешеходам", и "красный после пешеходов" разом.
 */
function cyclePhase(
  greenCarsS: number,
  allRedAfterCarsS: number,
  greenPedsS: number,
  allRedAfterPedsS: number,
  t: number,
): Omit<LiveSignal, "vehicleLabel" | "pedestrianLabel" | "callPending"> {
  const p0 = greenCarsS; // конец зелёного машинам
  const p1 = p0 + YELLOW_S; // конец жёлтого
  const p2 = p1 + allRedAfterCarsS; // конец первого "красный всем" (после машин)
  const p3 = p2 + greenPedsS; // конец зелёного пешеходам
  const total = p3 + allRedAfterPedsS; // конец второго "красный всем" (после пешеходов) = длина цикла

  let vehicle: VehicleSignal;
  let vehicleChangeAt: number;
  if (t < p0) {
    vehicle = "green";
    vehicleChangeAt = p0;
  } else if (t < p1) {
    vehicle = "yellow";
    vehicleChangeAt = p1;
  } else {
    vehicle = "red"; // остаётся красным через весь "красный/пешеходы/красный", до конца цикла
    vehicleChangeAt = total;
  }

  let pedestrian: PedestrianSignal;
  let pedChangeAt: number;
  if (t < p2) {
    pedestrian = "stop";
    pedChangeAt = p2;
  } else if (t < p3) {
    pedestrian = "walk";
    pedChangeAt = p3;
  } else {
    pedestrian = "stop";
    pedChangeAt = total;
  }

  return {
    vehicle,
    pedestrian,
    vehicleSecondsLeft: vehicleChangeAt - t,
    pedestrianSecondsLeft: pedChangeAt - t,
  };
}

/**
 * Живое состояние светофора перехода: в manual — то, что хранится в БД
 * (правится кликом по светофору); в остальных режимах считается на клиенте
 * каждые TICK_MS, без обращений к серверу.
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
    // не сбрасываем elapsed — минимальный зелёный учитывает и то, что машины
    // ехали ДО нажатия: если уже 70с при минимуме 30, следующий тик сразу
    // начнёт переключение (elapsed >= min уже выполнено)
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
        vehicleSecondsLeft: null,
        pedestrianSecondsLeft: null,
        vehicleLabel: "",
        pedestrianLabel: "",
        callPending: false,
      };
    }

    if (crossing.signal_mode === "adaptive") {
      return {
        vehicle: "red",
        pedestrian: "walk",
        vehicleSecondsLeft: null,
        pedestrianSecondsLeft: null,
        vehicleLabel: "АУ",
        pedestrianLabel: "АУ",
        callPending: false,
      };
    }

    if (crossing.signal_mode === "cycle") {
      const active = crossing.cycles.find((c) => c.id === crossing.active_cycle_id) ?? crossing.cycles[0];
      if (!active) {
        return { ...IDLE, vehicleLabel: "нет цикла", pedestrianLabel: "нет цикла" };
      }
      const total =
        active.green_cars_s +
        YELLOW_S +
        crossing.all_red_after_cars_s +
        active.green_peds_s +
        crossing.all_red_after_peds_s;
      const t = (performance.now() / 1000) % total;
      const phase = cyclePhase(
        active.green_cars_s,
        crossing.all_red_after_cars_s,
        active.green_peds_s,
        crossing.all_red_after_peds_s,
        t,
      );
      return {
        ...phase,
        vehicleLabel: label(phase.vehicleSecondsLeft),
        pedestrianLabel: label(phase.pedestrianSecondsLeft),
        callPending: false,
      };
    }

    // button
    const now = performance.now();
    const dt = Math.min((now - lastTickRef.current) / 1000, 1);
    lastTickRef.current = now;
    const st = buttonRef.current;
    st.elapsed += dt;
    const minGreen = crossing.button_min_green_s;
    const pedsS = crossing.button_peds_s;
    const allRedAfterCarsS = crossing.all_red_after_cars_s;
    const allRedAfterPedsS = crossing.all_red_after_peds_s;

    if (st.phase === "cars" && st.callPending && st.elapsed >= minGreen) {
      st.phase = "yellow";
      st.elapsed = 0;
      st.callPending = false;
    }

    switch (st.phase) {
      case "cars": {
        const vehicleSecondsLeft = st.callPending ? Math.max(0, minGreen - st.elapsed) : null;
        const pedestrianSecondsLeft =
          vehicleSecondsLeft === null ? null : vehicleSecondsLeft + YELLOW_S + allRedAfterCarsS;
        return {
          vehicle: "green",
          pedestrian: "stop",
          vehicleSecondsLeft,
          pedestrianSecondsLeft,
          vehicleLabel: label(vehicleSecondsLeft),
          pedestrianLabel: label(pedestrianSecondsLeft),
          callPending: st.callPending,
        };
      }
      case "yellow": {
        if (st.elapsed >= YELLOW_S) {
          st.phase = "clear_to_peds";
          st.elapsed = 0;
          const vehicleSecondsLeft = allRedAfterCarsS + pedsS + allRedAfterPedsS;
          return {
            vehicle: "red",
            pedestrian: "stop",
            vehicleSecondsLeft,
            pedestrianSecondsLeft: allRedAfterCarsS,
            vehicleLabel: label(vehicleSecondsLeft),
            pedestrianLabel: label(allRedAfterCarsS),
            callPending: false,
          };
        }
        const vehicleSecondsLeft = YELLOW_S - st.elapsed;
        return {
          vehicle: "yellow",
          pedestrian: "stop",
          vehicleSecondsLeft,
          pedestrianSecondsLeft: vehicleSecondsLeft + allRedAfterCarsS,
          vehicleLabel: label(vehicleSecondsLeft),
          pedestrianLabel: label(vehicleSecondsLeft + allRedAfterCarsS),
          callPending: false,
        };
      }
      case "clear_to_peds": {
        if (st.elapsed >= allRedAfterCarsS) {
          st.phase = "peds";
          st.elapsed = 0;
          const vehicleSecondsLeft = pedsS + allRedAfterPedsS;
          return {
            vehicle: "red",
            pedestrian: "walk",
            vehicleSecondsLeft,
            pedestrianSecondsLeft: pedsS,
            vehicleLabel: label(vehicleSecondsLeft),
            pedestrianLabel: label(pedsS),
            callPending: false,
          };
        }
        const pedestrianSecondsLeft = allRedAfterCarsS - st.elapsed;
        const vehicleSecondsLeft = pedestrianSecondsLeft + pedsS + allRedAfterPedsS;
        return {
          vehicle: "red",
          pedestrian: "stop",
          vehicleSecondsLeft,
          pedestrianSecondsLeft,
          vehicleLabel: label(vehicleSecondsLeft),
          pedestrianLabel: label(pedestrianSecondsLeft),
          callPending: false,
        };
      }
      case "peds": {
        if (st.elapsed >= pedsS) {
          st.phase = "clear_to_cars";
          st.elapsed = 0;
          return {
            vehicle: "red",
            pedestrian: "stop",
            vehicleSecondsLeft: allRedAfterPedsS,
            pedestrianSecondsLeft: null,
            vehicleLabel: label(allRedAfterPedsS),
            pedestrianLabel: "АУ",
            callPending: false,
          };
        }
        const pedestrianSecondsLeft = pedsS - st.elapsed;
        const vehicleSecondsLeft = pedestrianSecondsLeft + allRedAfterPedsS;
        return {
          vehicle: "red",
          pedestrian: "walk",
          vehicleSecondsLeft,
          pedestrianSecondsLeft,
          vehicleLabel: label(vehicleSecondsLeft),
          pedestrianLabel: label(pedestrianSecondsLeft),
          callPending: false,
        };
      }
      case "clear_to_cars":
      default: {
        if (st.elapsed >= allRedAfterPedsS) {
          st.phase = "cars";
          st.elapsed = 0;
          return {
            vehicle: "green",
            pedestrian: "stop",
            vehicleSecondsLeft: null,
            pedestrianSecondsLeft: null,
            vehicleLabel: "АУ",
            pedestrianLabel: "АУ",
            callPending: false,
          };
        }
        const vehicleSecondsLeft = allRedAfterPedsS - st.elapsed;
        return {
          vehicle: "red",
          pedestrian: "stop",
          vehicleSecondsLeft,
          pedestrianSecondsLeft: null,
          vehicleLabel: label(vehicleSecondsLeft),
          pedestrianLabel: "АУ",
          callPending: false,
        };
      }
    }
    // tick растёт каждые TICK_MS — единственная причина пересчитывать это каждый интервал
  }, [crossing, tick]);

  return { live, requestCall };
}
