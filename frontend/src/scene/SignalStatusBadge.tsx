import { Html } from "@react-three/drei";
import { useMemo } from "react";

import type { Crossing } from "../types";
import { poles, roadGeometry } from "./layout";

const BADGE_Y = 5.6; // чуть выше автомобильной головы светофора

/** "N сек до смены фазы" или "АУ" над каждым столбом — скрыт в ручном режиме. */
export function SignalStatusBadge({ crossing, label }: { crossing: Crossing; label: string }) {
  const geo = useMemo(() => roadGeometry(crossing), [crossing]);
  const items = useMemo(() => poles(geo), [geo]);

  if (!label) return null;

  return (
    <>
      {items.map((pole) => (
        <Html key={pole.key} position={[pole.x, BADGE_Y, pole.z]} center>
          <div className="rounded-full border border-slate-600 bg-slate-900/90 px-2.5 py-1 text-xs font-semibold tabular-nums text-slate-100 shadow-lg">
            {label}
          </div>
        </Html>
      ))}
    </>
  );
}
