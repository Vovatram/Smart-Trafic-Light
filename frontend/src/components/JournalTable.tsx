import type { SignalLogEntry, SignalMode } from "../types";

const MODE_ABBR: Record<SignalMode, string> = {
  manual: "РУ",
  adaptive: "АУ",
  cycle: "ЦИ",
  button: "КН",
};

export function JournalTable({ entries }: { entries: SignalLogEntry[] }) {
  return (
    <div className="max-h-72 overflow-y-auto rounded border border-slate-800">
      <table className="w-full text-xs">
        <thead className="sticky top-0 bg-slate-900 text-slate-500">
          <tr>
            <th className="px-2 py-1 text-left font-medium">Время</th>
            <th className="px-2 py-1 text-left font-medium">Режим</th>
            <th className="px-2 py-1 text-left font-medium">Сигнал</th>
            <th className="px-2 py-1 text-left font-medium">Описание</th>
          </tr>
        </thead>
        <tbody>
          {[...entries].reverse().map((entry) => (
            <tr key={entry.id} className="border-t border-slate-800">
              <td className="px-2 py-1 whitespace-nowrap text-slate-300 tabular-nums">
                {new Date(entry.at).toLocaleString("ru-RU", {
                  day: "2-digit",
                  month: "2-digit",
                  hour: "2-digit",
                  minute: "2-digit",
                  second: "2-digit",
                })}
              </td>
              <td className="px-2 py-1 text-slate-300">{entry.mode ? MODE_ABBR[entry.mode] : "—"}</td>
              <td className="px-2 py-1 text-slate-300">{entry.active_signal ?? "—"}</td>
              <td className="px-2 py-1 text-slate-400">{entry.description}</td>
            </tr>
          ))}
          {entries.length === 0 && (
            <tr>
              <td colSpan={4} className="px-2 py-4 text-center text-slate-500">
                Пока пусто
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
}
