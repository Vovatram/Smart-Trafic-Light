import type { ButtonHTMLAttributes, ReactNode } from "react";

export function Card({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="rounded-xl border border-slate-700/60 bg-slate-900/75 p-3 shadow-lg backdrop-blur-sm">
      <h2 className="mb-2 text-xs font-semibold tracking-wide text-slate-400 uppercase">{title}</h2>
      {children}
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
}: {
  label: string;
  value: number;
  unit?: string;
  min: number;
  max: number;
  step?: number;
  onChange: (value: number) => void;
  disabled?: boolean;
}) {
  const round = (n: number) => Math.round(n * 100) / 100;
  return (
    <div className="flex items-center justify-between gap-2">
      <span className="text-sm text-slate-300">{label}</span>
      <div className="flex items-center gap-1.5">
        <Button
          disabled={disabled || value <= min}
          onClick={() => onChange(round(Math.max(min, value - step)))}
          className="!px-2 !py-1"
        >
          −
        </Button>
        <span className="w-12 text-center text-sm tabular-nums text-slate-100">
          {value}
          {unit}
        </span>
        <Button
          disabled={disabled || value >= max}
          onClick={() => onChange(round(Math.min(max, value + step)))}
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
