import { useState } from "react";
import type { ButtonHTMLAttributes, ReactNode } from "react";

/**
 * Сворачиваемая карточка сайдбара. По умолчанию управляет своим открытием
 * сама (defaultOpen); передай open+onOpenChange, если открытие нужно
 * дёргать снаружи (например, автораскрытие по клику на светофор в сцене).
 */
export function Card({
  title,
  children,
  defaultOpen = true,
  open,
  onOpenChange,
}: {
  title: string;
  children: ReactNode;
  defaultOpen?: boolean;
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
}) {
  const [internalOpen, setInternalOpen] = useState(defaultOpen);
  const isOpen = open ?? internalOpen;
  const toggle = () => (onOpenChange ? onOpenChange(!isOpen) : setInternalOpen((o) => !o));

  return (
    <section className="rounded-xl border border-slate-700/60 bg-slate-900/75 shadow-lg backdrop-blur-sm">
      <button
        onClick={toggle}
        className="flex w-full items-center justify-between px-3 py-2.5 text-left"
      >
        <h2 className="text-xs font-semibold tracking-wide text-slate-400 uppercase">{title}</h2>
        <span className={`text-slate-500 transition-transform ${isOpen ? "rotate-180" : ""}`}>▾</span>
      </button>
      {isOpen && <div className="space-y-3 px-3 pb-3">{children}</div>}
    </section>
  );
}

type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: "primary" | "ghost" | "danger";
  active?: boolean;
};

export function Button({ variant = "ghost", active = false, className = "", ...rest }: ButtonProps) {
  const base =
    "rounded-lg px-3 py-1.5 text-sm font-medium transition disabled:cursor-not-allowed disabled:opacity-40";
  const styles = {
    primary: "bg-sky-500 text-slate-950 hover:bg-sky-400",
    danger: "bg-rose-500/90 text-slate-950 hover:bg-rose-400",
    ghost: active
      ? "bg-slate-200 text-slate-900"
      : "bg-slate-800 text-slate-200 hover:bg-slate-700",
  }[variant];
  return <button className={`${base} ${styles} ${className}`} {...rest} />;
}

export function Stepper({
  label,
  value,
  unit = "",
  min,
  max,
  step = 1,
  onChange,
  disabled,
  wrap = false,
}: {
  label: string;
  value: number;
  unit?: string;
  min: number;
  max: number;
  step?: number;
  onChange: (value: number) => void;
  disabled?: boolean;
  /** Циклический диапазон [min, max): "-" на min переходит к верхней границе, и наоборот. */
  wrap?: boolean;
}) {
  const round = (n: number) => Math.round(n * 100) / 100;
  const clamp = (n: number) => {
    if (!wrap) return round(Math.min(max, Math.max(min, n)));
    const period = max - min;
    return round(min + (((n - min) % period) + period) % period);
  };
  return (
    <div className="flex items-center justify-between gap-2">
      <span className="text-sm text-slate-300">{label}</span>
      <div className="flex items-center gap-1.5">
        <Button
          disabled={disabled || (!wrap && value <= min)}
          onClick={() => onChange(clamp(value - step))}
          className="!px-2 !py-1"
        >
          −
        </Button>
        <span className="w-12 text-center text-sm tabular-nums text-slate-100">
          {value}
          {unit}
        </span>
        <Button
          disabled={disabled || (!wrap && value >= max)}
          onClick={() => onChange(clamp(value + step))}
          className="!px-2 !py-1"
        >
          +
        </Button>
      </div>
    </div>
  );
}

export function TextField({
  label,
  value,
  placeholder,
  onCommit,
  disabled,
}: {
  label: string;
  value: string;
  placeholder?: string;
  onCommit: (value: string) => void;
  disabled?: boolean;
}) {
  return (
    <label className="block">
      <span className="mb-1 block text-xs text-slate-400">{label}</span>
      <input
        type="text"
        defaultValue={value}
        key={value}
        placeholder={placeholder}
        disabled={disabled}
        onBlur={(event) => {
          if (event.target.value !== value) onCommit(event.target.value);
        }}
        className="w-full rounded-lg border border-slate-700 bg-slate-800 px-2 py-1.5 text-sm text-slate-100 disabled:opacity-40"
      />
    </label>
  );
}

export function Checkbox({
  label,
  checked,
  onChange,
  disabled,
}: {
  label: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
  disabled?: boolean;
}) {
  return (
    <label
      className={`flex items-center gap-2 text-sm text-slate-300 ${disabled ? "opacity-40" : "cursor-pointer"}`}
    >
      <input
        type="checkbox"
        checked={checked}
        disabled={disabled}
        onChange={(event) => onChange(event.target.checked)}
        className="h-4 w-4 rounded border-slate-600 bg-slate-800 accent-sky-500"
      />
      {label}
    </label>
  );
}

export function Select({
  value,
  onChange,
  children,
  disabled,
}: {
  value: string | number;
  onChange: (value: string) => void;
  children: ReactNode;
  disabled?: boolean;
}) {
  return (
    <select
      value={value}
      disabled={disabled}
      onChange={(event) => onChange(event.target.value)}
      className="w-full rounded-lg border border-slate-700 bg-slate-800 px-2 py-1.5 text-sm text-slate-100 disabled:opacity-40"
    >
      {children}
    </select>
  );
}
