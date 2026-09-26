import { useState } from "react";

import type { Crossing, SignalMode } from "../types";
import { Button, Card, Stepper, TextField } from "./ui";

const MODE_LABEL: Record<SignalMode, string> = {
  manual: "Ручной",
  adaptive: "Адаптивное управление",
  cycle: "Циклы",
  button: "Кнопка",
};
const MODE_ORDER: SignalMode[] = ["manual", "adaptive", "cycle", "button"];

interface CycleDraft {
  name: string;
  green_cars_s: number;
  green_peds_s: number;
}

const NEW_CYCLE: CycleDraft = { name: "", green_cars_s: 40, green_peds_s: 15 };

export function SignalModePanel({
  crossing,
  busy,
  callPending,
  onSetMode,
  onSelectCycle,
  onAddCycle,
  onDeleteCycle,
  onAllRedAfterCarsChange,
  onAllRedAfterPedsChange,
  onButtonMinGreenChange,
  onButtonPedsChange,
  onPressButton,
}: {
  crossing: Crossing;
  busy: boolean;
  /** режим "Кнопка": вызов нажат, ждём минимальный зелёный машинам */
  callPending: boolean;
  onSetMode: (mode: SignalMode) => void;
  onSelectCycle: (id: number) => void;
  onAddCycle: (draft: CycleDraft) => void;
  onDeleteCycle: (id: number) => void;
  onAllRedAfterCarsChange: (value: number) => void;
  onAllRedAfterPedsChange: (value: number) => void;
  onButtonMinGreenChange: (value: number) => void;
  onButtonPedsChange: (value: number) => void;
  onPressButton: () => void;
}) {
  const [adding, setAdding] = useState(false);
  const [draft, setDraft] = useState<CycleDraft>(NEW_CYCLE);

  const startAdding = () => {
    setDraft(NEW_CYCLE);
    setAdding(true);
  };
  const saveDraft = () => {
    if (!draft.name.trim()) return;
    onAddCycle({ ...draft, name: draft.name.trim() });
    setAdding(false);
  };

  return (
    <Card title="Режим светофора">
      <div className="space-y-3">
        <div className="grid grid-cols-2 gap-2">
          {MODE_ORDER.map((mode) => (
            <Button
              key={mode}
              active={crossing.signal_mode === mode}
              disabled={busy}
              onClick={() => onSetMode(mode)}
            >
              {MODE_LABEL[mode]}
            </Button>
          ))}
        </div>

        {crossing.signal_mode === "adaptive" && (
          <p className="text-[11px] leading-snug text-slate-500">
            Заглушка: постоянно зелёный пешеходам, красный машинам.
          </p>
        )}

        {crossing.signal_mode === "cycle" && (
          <div className="space-y-2 border-t border-slate-800 pt-3">
            <span className="block text-xs text-slate-400">Циклы перехода</span>
            <div className="space-y-1.5">
              {crossing.cycles.map((cycle) => (
                <div key={cycle.id} className="flex items-center gap-1.5">
                  <Button
                    active={crossing.active_cycle_id === cycle.id}
                    disabled={busy}
                    className="flex-1 text-left"
                    onClick={() => onSelectCycle(cycle.id)}
                  >
                    {cycle.name}
                    <span className="ml-1.5 text-[11px] text-slate-400">
                      {cycle.green_cars_s}с / {cycle.green_peds_s}с
                    </span>
                  </Button>
                  <button
                    disabled={busy}
                    onClick={() => onDeleteCycle(cycle.id)}
                    className="text-xs text-slate-500 hover:text-rose-400 disabled:opacity-40"
                    aria-label={`Удалить цикл ${cycle.name}`}
                  >
                    ✕
                  </button>
                </div>
              ))}
              {crossing.cycles.length === 0 && !adding && (
                <p className="text-[11px] text-slate-500">Пока нет ни одного цикла.</p>
              )}
            </div>

            {adding ? (
              <div className="space-y-2 rounded-lg border border-slate-800 p-2.5">
                <TextField
                  label="Название"
                  value={draft.name}
                  placeholder="Например, «Вечер»"
                  onCommit={(name) => setDraft((d) => ({ ...d, name }))}
                />
                <Stepper
                  label="Зелёный машинам"
                  value={draft.green_cars_s}
                  unit=" с"
                  min={3}
                  max={180}
                  step={5}
                  onChange={(green_cars_s) => setDraft((d) => ({ ...d, green_cars_s }))}
                />
                <Stepper
                  label="Зелёный пешеходам"
                  value={draft.green_peds_s}
                  unit=" с"
                  min={3}
                  max={120}
                  step={5}
                  onChange={(green_peds_s) => setDraft((d) => ({ ...d, green_peds_s }))}
                />
                <div className="flex gap-2">
                  <Button variant="primary" className="flex-1" onClick={saveDraft}>
                    Сохранить
                  </Button>
                  <Button className="flex-1" onClick={() => setAdding(false)}>
                    Отмена
                  </Button>
                </div>
              </div>
            ) : (
              <Button className="w-full" disabled={busy} onClick={startAdding}>
                + Добавить цикл
              </Button>
            )}
          </div>
        )}

        {crossing.signal_mode === "button" && (
          <div className="space-y-2 border-t border-slate-800 pt-3">
            <Stepper
              label="Мин. зелёный машинам"
              value={crossing.button_min_green_s}
              unit=" с"
              min={3}
              max={180}
              step={5}
              disabled={busy}
              onChange={onButtonMinGreenChange}
            />
            <Stepper
              label="Зелёный пешеходам"
              value={crossing.button_peds_s}
              unit=" с"
              min={3}
              max={120}
              step={5}
              disabled={busy}
              onChange={onButtonPedsChange}
            />
            <Button
              variant={callPending ? "ghost" : "primary"}
              className="w-full"
              disabled={busy || callPending}
              onClick={onPressButton}
            >
              {callPending ? "Вызов ожидает минимальный зелёный…" : "🔘 Нажать кнопку вызова"}
            </Button>
          </div>
        )}

        {crossing.signal_mode !== "manual" && (
          <div className="space-y-2 border-t border-slate-800 pt-3">
            <Stepper
              label="Красный всем после машин"
              value={crossing.all_red_after_cars_s}
              unit=" с"
              min={1}
              max={15}
              step={1}
              disabled={busy}
              onChange={onAllRedAfterCarsChange}
            />
            <Stepper
              label="Красный всем после пешеходов"
              value={crossing.all_red_after_peds_s}
              unit=" с"
              min={1}
              max={15}
              step={1}
              disabled={busy}
              onChange={onAllRedAfterPedsChange}
            />
          </div>
        )}
      </div>
    </Card>
  );
}
