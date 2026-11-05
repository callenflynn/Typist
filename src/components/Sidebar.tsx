import { ChevronDown, ChevronRight, FileText, RefreshCw } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { dayLabel, flattenNotes, groupJournalDays, monthLabel } from "../utils/journal";

type JournalDay = { path: string; date: string };
type TreeEntry = { name: string; path: string; directory: boolean; children?: TreeEntry[] };
type WorkspaceInfo = { root: string; welcome: string };
type SidebarProps = { onSelectFile?: (path: string) => void; activePath?: string; refreshKey?: number };

const isTauri = () => Boolean((window as Window & { __TAURI_INTERNALS__?: unknown }).__TAURI_INTERNALS__);
const todayStr = () => new Date().toLocaleDateString("en-CA");

export function Sidebar({ onSelectFile, activePath, refreshKey = 0 }: SidebarProps) {
  const [days, setDays] = useState<JournalDay[]>([]);
  const [notes, setNotes] = useState<TreeEntry[]>([]);
  const [workspace, setWorkspace] = useState<string>();
  const [error, setError] = useState<string>();
  const [openMonths, setOpenMonths] = useState<Set<string>>(new Set());

  const load = useCallback(async (root?: string) => {
    if (!isTauri()) return;
    const base = root ?? workspace;
    if (!base) return;
    try {
      const [dayList, tree] = await Promise.all([
        invoke<JournalDay[]>("list_journal_days"),
        invoke<TreeEntry[]>("list_workspace", { path: base }),
      ]);
      setDays(dayList);
      setNotes(flattenNotes(tree));
      setError(undefined);
      const months = groupJournalDays(dayList);
      setOpenMonths(new Set(months.slice(0, 3).map((g) => g.month)));
    } catch (reason) {
      setError(String(reason));
    }
  }, [workspace]);

  useEffect(() => {
    if (!isTauri()) return;
    invoke<WorkspaceInfo>("initialize_workspace")
      .then(({ root }) => {
        setWorkspace(root);
        load(root);
      })
      .catch((reason) => setError(String(reason)));
  }, []);

  useEffect(() => {
    if (refreshKey > 0) void load();
  }, [refreshKey, load]);

  const groups = groupJournalDays(days);
  const today = todayStr();
  const toggleMonth = (month: string) =>
    setOpenMonths((prev) => {
      const next = new Set(prev);
      if (next.has(month)) next.delete(month); else next.add(month);
      return next;
    });

  return (
    <aside className="flex h-full w-[230px] shrink-0 flex-col border-r border-[var(--border)] bg-[var(--glass)]">
      <div className="flex h-12 shrink-0 items-center justify-between border-b border-[var(--border)] px-4">
        <span className="text-xs font-semibold uppercase tracking-[0.14em] text-[var(--text-muted)]">Journal</span>
        {workspace && <button aria-label="Refresh journal" title="Refresh journal" onClick={() => void load()} className="rounded-lg p-1.5 text-[var(--text-muted)] hover:bg-black/5 dark:hover:bg-white/10"><RefreshCw size={14} /></button>}
      </div>
      <div className="flex-1 overflow-auto px-2 py-3">
        {error ? <p className="px-2 py-3 text-xs text-red-500">{error}</p> : (
          <>
            {groups.map((group) => {
              const open = openMonths.has(group.month);
              return (
                <div key={group.month} className="mb-2">
                  <button onClick={() => toggleMonth(group.month)} className="flex w-full items-center gap-1.5 rounded-lg px-2 py-1.5 text-left text-[11px] font-semibold uppercase tracking-[0.12em] text-[var(--text-muted)] hover:bg-black/5 dark:hover:bg-white/10">
                    {open ? <ChevronDown size={13} /> : <ChevronRight size={13} />}
                    <span className="flex-1">{monthLabel(group.month)}</span>
                    <span className="text-[10px] font-normal">{group.days.length}</span>
                  </button>
                  {open && group.days.map((day) => (
                    <button key={day.path} onClick={() => onSelectFile?.(day.path)} className={`flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-left text-sm ${activePath === day.path ? "bg-[var(--accent)]/10 text-[var(--text-primary)]" : "hover:bg-black/5 dark:hover:bg-white/10"}`}>
                      <span className={`h-1.5 w-1.5 rounded-full ${day.date === today ? "bg-[var(--accent)]" : "bg-transparent"}`} />
                      <span className="flex-1">{dayLabel(day.date, today)}</span>
                      <span className="text-[11px] text-[var(--text-muted)]">{day.date.slice(5)}</span>
                    </button>
                  ))}
                </div>
              );
            })}
            {notes.length > 0 && (
              <div className="mt-4 border-t border-[var(--border)] pt-3">
                <p className="px-2 pb-2 text-[11px] uppercase tracking-[0.12em] text-[var(--text-muted)]">Notes</p>
                {notes.map((entry) => (
                  <button key={entry.path} onClick={() => onSelectFile?.(entry.path)} className={`flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-left text-sm ${activePath === entry.path ? "bg-[var(--accent)]/10" : "hover:bg-black/5 dark:hover:bg-white/10"}`}>
                    <FileText size={14} className="shrink-0 text-[var(--text-muted)]" />
                    <span className="truncate">{entry.name}</span>
                  </button>
                ))}
              </div>
            )}
            {days.length === 0 && notes.length === 0 && !error && (
              <p className="px-2 py-6 text-center text-xs text-[var(--text-muted)]">No entries yet.<br />Start writing.</p>
            )}
          </>
        )}
      </div>
    </aside>
  );
}
