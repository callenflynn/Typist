import { useEffect, useRef, useState } from "react";
import { readTextFile } from "@tauri-apps/plugin-fs";
import { Search } from "lucide-react";
import { fuzzyFilter, dayLabel } from "../utils/journal";

type JournalDay = { path: string; date: string };
type CommandPaletteProps = {
  days: JournalDay[];
  onSelect: (path: string) => void;
  onClose: () => void;
  today: string;
};

type Result = { day: JournalDay; snippet?: string; score: number };

export function CommandPalette({ days, onSelect, onClose, today }: CommandPaletteProps) {
  const [query, setQuery] = useState("");
  const [index, setIndex] = useState(0);
  const [results, setResults] = useState<Result[]>([]);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => { inputRef.current?.focus(); }, []);

  useEffect(() => {
    const q = query.trim();
    if (!q) {
      setResults(days.slice(0, 30).map((day) => ({ day, score: 0 })));
      setIndex(0);
      return;
    }
    // fuzzy over dates / labels
    const fuzzyDays = fuzzyFilter(q, days, (d) => `${d.date} ${dayLabel(d.date, today)}`);
    const fuzzy = fuzzyDays.map((day) => ({ day, score: 1 }));
    const merged = new Map<string, Result>();
    for (const r of fuzzy) merged.set(r.day.path, r);

    // content search over the first 200 days (async, debounced by React render)
    Promise.all(days.slice(0, 200).map(async (day) => {
      try {
        const text = await readTextFile(day.path);
        const i = text.toLowerCase().indexOf(q.toLowerCase());
        if (i >= 0) {
          const snippet = text.slice(Math.max(0, i - 40), i + 80).replace(/\s+/g, " ").trim();
          return { day, snippet, score: 2 };
        }
      } catch { /* unreadable; skip */ }
      return null;
    })).then((hits) => {
      for (const h of hits) if (h) merged.set(h.day.path, { ...h, score: h.score + (merged.get(h.day.path)?.score ?? 0) });
      const list = [...merged.values()].sort((a, b) => b.score - a.score || b.day.date.localeCompare(a.day.date)).slice(0, 40);
      setResults(list);
      setIndex(0);
    }).catch(() => undefined);
  }, [query, days, today]);

  const choose = (result?: Result) => {
    const target = result ?? results[index];
    if (target) { onSelect(target.day.path); onClose(); }
  };

  return (
    <div className="fixed inset-0 z-50 grid place-items-start justify-center bg-black/20 pt-24 backdrop-blur-sm" onClick={onClose}>
      <div className="w-full max-w-xl overflow-hidden rounded-3xl border border-[var(--border)] bg-[var(--glass)] shadow-2xl backdrop-blur-xl" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center gap-3 border-b border-[var(--border)] px-5 py-4">
          <Search size={18} className="text-[var(--text-muted)]" />
          <input
            ref={inputRef}
            value={query}
            onChange={(e) => { setQuery(e.target.value); setIndex(0); }}
            onKeyDown={(e) => {
              if (e.key === "ArrowDown") { e.preventDefault(); setIndex((i) => Math.min(results.length - 1, i + 1)); }
              else if (e.key === "ArrowUp") { e.preventDefault(); setIndex((i) => Math.max(0, i - 1)); }
              else if (e.key === "Enter") { e.preventDefault(); choose(); }
              else if (e.key === "Escape") onClose();
            }}
            placeholder="Jump to a day…"
            className="w-full bg-transparent text-base outline-none placeholder:text-[var(--text-muted)]"
          />
          <kbd className="rounded-md border border-[var(--border)] bg-white/10 px-2 py-0.5 text-[10px] leading-relaxed text-[var(--text-muted)]">ESC</kbd>
        </div>
        <div className="max-h-80 overflow-auto p-2">
          {results.length === 0 ? (
            <p className="px-4 py-8 text-center text-sm text-[var(--text-muted)]">No matching days</p>
          ) : results.map((result, i) => (
            <button key={result.day.path} onClick={() => choose(result)} onMouseEnter={() => setIndex(i)} className={`flex w-full items-center gap-3 rounded-2xl px-3 py-2.5 text-left ${i === index ? "bg-[var(--accent)]/10" : ""}`}>
              <span className={`h-1.5 w-1.5 shrink-0 rounded-full ${result.day.date === today ? "bg-[var(--accent)]" : "bg-transparent"}`} />
              <span className="min-w-0 flex-1">
                <span className="block text-sm font-medium">{dayLabel(result.day.date, today)}</span>
                <span className="block truncate text-xs text-[var(--text-muted)]">{result.day.date}{result.snippet ? ` · ${result.snippet}` : ""}</span>
              </span>
              {i === index && <span className="text-[11px] text-[var(--text-muted)]">↵</span>}
            </button>
          ))}
        </div>
        <div className="flex items-center gap-4 border-t border-[var(--border)] px-5 py-2.5 text-[11px] text-[var(--text-muted)]">
          <span>↑↓ Navigate</span><span>↵ Open</span><span>Esc Close</span>
        </div>
      </div>
    </div>
  );
}
