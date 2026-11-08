import { getCurrentWindow } from "@tauri-apps/api/window";
import { Minus, Moon, Square, Sun, Settings as Gear, X } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import typistLogo from "../assets/typist.png";
import { Calendar } from "./components/Calendar";
import { CommandPalette } from "./components/CommandPalette";
import { MarkdownEditor } from "./components/Editor";
import { Settings } from "./components/Settings";
import {
  initializeWorkspace,
  listNotes,
  openDailyJournal,
  readNote,
  type TreeEntry,
  writeNote,
} from "./lib/notes";
import { basename } from "./lib/paths";
import { createSaveQueue, type SaveState } from "./lib/saveQueue";
import {
  applyPreset,
  getDefaultPresetId,
  resolveDefaultPreset,
  setDefaultPresetId,
  type JournalPreset,
} from "./lib/presets";
import { dayLabel, fullDateLabel, isJournalFile, localToday } from "./utils/journal";
import "./index.css";

const LAST_FILE_KEY = "typist-last-file";
const THEME_KEY = "typist-theme";
const NATIVE_TITLEBAR_KEY = "typist-native-titlebar";
const SAVE_DELAY_MS = 600;

type OpenNote = { id: number; path: string; text: string };
type SaveStatus = "saved" | "unsaved" | "saving" | "error";

const isDesktop = () =>
  Boolean((window as Window & { __TAURI_INTERNALS__?: unknown }).__TAURI_INTERNALS__);

function errorMessage(reason: unknown): string {
  if (typeof reason === "string") return reason;
  if (reason instanceof Error) return reason.message;
  return "Something went wrong.";
}

function readStored(key: string): string | undefined {
  try {
    return localStorage.getItem(key) ?? undefined;
  } catch {
    return undefined;
  }
}

function writeStored(key: string, value: string) {
  try {
    localStorage.setItem(key, value);
  } catch {
    // Storage can be unavailable in restricted webviews; the app still works.
  }
}

function initialTheme(): "light" | "dark" {
  const stored = readStored(THEME_KEY);
  if (stored === "dark" || stored === "light") return stored;
  return window.matchMedia?.("(prefers-color-scheme: dark)").matches ? "dark" : "light";
}

export default function App() {
  const desktop = isDesktop();
  const [theme, setTheme] = useState<"light" | "dark">(initialTheme);
  const [nativeTitlebar, setNativeTitlebar] = useState<boolean>(
    () => readStored(NATIVE_TITLEBAR_KEY) === "true",
  );
  const [root, setRoot] = useState<string>();
  const [entries, setEntries] = useState<TreeEntry[]>([]);
  const [note, setNote] = useState<OpenNote | null>(null);
  const [status, setStatus] = useState<SaveStatus>("saved");
  const [focusMode, setFocusMode] = useState(false);
  const [maximized, setMaximized] = useState(false);
  const [opening, setOpening] = useState(desktop);
  const [notice, setNotice] = useState<string>();
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [paletteOpen, setPaletteOpen] = useState(false);

  const today = localToday();
  const [defaultPresetId, setLocalDefaultPresetId] = useState<string>(
    () => getDefaultPresetId() ?? "blank",
  );
  const defaultPresetRef = useRef<JournalPreset>(resolveDefaultPreset());
  useEffect(() => {
    defaultPresetRef.current = resolveDefaultPreset();
  }, [defaultPresetId]);

  const noteRef = useRef<OpenNote | null>(null);
  const content = useRef("");
  const savedText = useRef("");
  const lastQueued = useRef<{ path: string; text: string } | undefined>(undefined);
  const debounce = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const nextId = useRef(1);
  const queue = useRef<ReturnType<typeof createSaveQueue> | undefined>(undefined);
  const rootRef = useRef<string | undefined>(undefined);
  const closing = useRef(false);
  const loadToken = useRef(0);

  // Keeps `rootRef` in sync so `openJournalDay` always uses the latest workspace root.
  useEffect(() => {
    rootRef.current = root;
  }, [root]);

  // Journal days already written to disk, used to mark existing days in the
  // calendar and to feed the fuzzy command palette.
  const journalDays = useMemo(() => {
    const days: { path: string; date: string }[] = [];
    const walk = (list: TreeEntry[]) => {
      for (const entry of list) {
        if (!entry.directory && isJournalFile(entry.name)) {
          days.push({ path: entry.path, date: entry.name.replace(/\.md$/i, "") });
        }
        if (entry.children) walk(entry.children);
      }
    };
    walk(entries);
    return days.sort((a, b) => b.date.localeCompare(a.date));
  }, [entries]);

  const journalDaysSet = useMemo(
    () => new Set(journalDays.map((day) => day.date)),
    [journalDays],
  );

  const noteDate = note ? basename(note.path).replace(/\.md$/i, "") : today;

  const handleSaveState = useCallback((state: SaveState, path: string) => {
    const current = noteRef.current;
    if (!current || current.path !== path) return;

    if (state === "saving") {
      setStatus("saving");
      return;
    }
    if (state === "pending") {
      setStatus("unsaved");
      return;
    }
    if (state === "error") {
      setStatus("error");
      return;
    }

    const queued = lastQueued.current;
    if (queued?.path === path) savedText.current = queued.text;
    if (content.current === savedText.current) {
      setStatus("saved");
      setNotice(undefined);
    } else {
      setStatus("unsaved");
    }
  }, []);

  if (!queue.current) queue.current = createSaveQueue(writeNote, handleSaveState);

  const refreshNotes = useCallback(async (): Promise<TreeEntry[]> => {
    if (!desktop) return [];
    try {
      const next = await listNotes();
      setEntries(next);
      return next;
    } catch (reason) {
      setNotice(errorMessage(reason));
      return [];
    }
  }, [desktop]);

  const showNote = useCallback((path: string, text: string) => {
    const next = { id: nextId.current++, path, text };
    noteRef.current = next;
    content.current = text;
    savedText.current = text;
    lastQueued.current = undefined;
    setNote(next);
    setStatus("saved");
    writeStored(LAST_FILE_KEY, path);
  }, []);

  /** Writes any pending edit for the open note and reports whether it landed. */
  const persist = useCallback(async (): Promise<boolean> => {
    clearTimeout(debounce.current);
    const current = noteRef.current;
    if (!current) return (await queue.current?.flush()) ?? true;
    if (content.current === savedText.current && !queue.current?.pending()) return true;

    lastQueued.current = { path: current.path, text: content.current };
    queue.current?.enqueue(current.path, content.current);
    return (await queue.current?.flush()) ?? true;
  }, []);

  const saveNow = useCallback(async () => {
    const current = noteRef.current;
    if (!current) return;
    clearTimeout(debounce.current);
    lastQueued.current = { path: current.path, text: content.current };
    queue.current?.enqueue(current.path, content.current);
    await queue.current?.flush();
  }, []);

  const handleChange = useCallback((markdown: string) => {
    content.current = markdown;
    setStatus("unsaved");
    clearTimeout(debounce.current);
    debounce.current = setTimeout(() => {
      const current = noteRef.current;
      if (!current) return;
      lastQueued.current = { path: current.path, text: content.current };
      queue.current?.enqueue(current.path, content.current);
    }, SAVE_DELAY_MS);
  }, []);

  const openNote = useCallback(
    async (path: string) => {
      if (!desktop || noteRef.current?.path === path) return;
      if (!(await persist())) {
        setNotice("Could not save the current note. It is still open — save it before switching.");
        return;
      }

      const token = ++loadToken.current;
      setOpening(true);
      try {
        const text = await readNote(path);
        // A newer click may have started another load; ignore the stale result.
        if (token !== loadToken.current) return;
        showNote(path, text);
        setNotice(undefined);
      } catch (reason) {
        setNotice(errorMessage(reason));
      } finally {
        setOpening(false);
      }
    },
    [desktop, persist, showNote],
  );

  const openJournalDay = useCallback(
    async (date: string) => {
      if (!desktop) return;
      const r = rootRef.current;
      if (!r) return;
      if (!(await persist())) {
        setNotice("Could not save the current note. Save it before switching days.");
        return;
      }
      const path = `${r}/${date}.md`;
      if (noteRef.current?.path === path) return;
      const token = ++loadToken.current;
      setOpening(true);
      try {
        const preset = defaultPresetRef.current;
        const resolved = await openDailyJournal(
          date,
          preset.template ? applyPreset(preset.template, date) : "",
        );
        // A newer click may have started another load; ignore the stale result.
        if (token !== loadToken.current) return;
        const text = await readNote(resolved);
        if (token !== loadToken.current) return;
        showNote(resolved, text);
        setNotice(undefined);
      } catch (reason) {
        setNotice(errorMessage(reason));
      } finally {
        setOpening(false);
      }
    },
    [desktop, persist],
  );

  useEffect(() => {
    document.documentElement.classList.toggle("dark", theme === "dark");
    writeStored(THEME_KEY, theme);
  }, [theme]);

  useEffect(() => {
    writeStored(NATIVE_TITLEBAR_KEY, String(nativeTitlebar));
  }, [nativeTitlebar]);

  useEffect(() => {
    if (!desktop) return;
    void getCurrentWindow().setDecorations(nativeTitlebar);
  }, [desktop, nativeTitlebar]);

  useEffect(() => {
    if (!desktop) {
      setOpening(false);
      return;
    }

    let cancelled = false;
    void (async () => {
      try {
        const info = await initializeWorkspace();
        if (cancelled) return;
        setRoot(info.root);
        await refreshNotes();
        if (cancelled) return;
        // Open today's journal, creating it with the default preset when missing.
        await openJournalDay(today);
      } catch (reason) {
        if (!cancelled) setNotice(errorMessage(reason));
      } finally {
        if (!cancelled) setOpening(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [desktop, refreshNotes, openJournalDay, today]);

  useEffect(() => {
    if (!desktop) return;
    const refresh = () => void refreshNotes();
    window.addEventListener("focus", refresh);
    document.addEventListener("visibilitychange", refresh);
    return () => {
      window.removeEventListener("focus", refresh);
      document.removeEventListener("visibilitychange", refresh);
    };
  }, [desktop, refreshNotes]);

  useEffect(() => {
    if (!desktop) return;
    const appWindow = getCurrentWindow();
    let alive = true;
    const sync = () =>
      appWindow
        .isMaximized()
        .then((value) => alive && setMaximized(value))
        .catch(() => undefined);
    void sync();
    window.addEventListener("resize", sync);
    return () => {
      alive = false;
      window.removeEventListener("resize", sync);
    };
  }, [desktop]);

  useEffect(() => {
    if (!desktop) return;
    const appWindow = getCurrentWindow();
    let unlisten: (() => void) | undefined;
    let disposed = false;

    appWindow
      .onCloseRequested(async (event) => {
        if (!noteRef.current) return;
        event.preventDefault();
        if (closing.current) return;
        closing.current = true;

        clearTimeout(debounce.current);
        const current = noteRef.current;
        lastQueued.current = { path: current.path, text: content.current };
        queue.current?.enqueue(current.path, content.current);
        await queue.current?.flush();
        await appWindow.destroy();
      })
      .then((stop) => {
        if (disposed) stop();
        else unlisten = stop;
      })
      .catch(() => undefined);

    return () => {
      disposed = true;
      unlisten?.();
    };
  }, [desktop]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (!(event.metaKey || event.ctrlKey)) return;
      const key = event.key.toLowerCase();
      if (key === "s" && !event.shiftKey) {
        event.preventDefault();
        void saveNow();
      } else if (key === "p") {
        event.preventDefault();
        setSettingsOpen(false);
        setPaletteOpen((value) => !value);
      } else if (key === "f" && event.shiftKey) {
        event.preventDefault();
        setFocusMode((value) => !value);
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [saveNow, setPaletteOpen, setSettingsOpen]);

  useEffect(() => () => clearTimeout(debounce.current), []);

  const appWindow = desktop ? getCurrentWindow() : undefined;
  const statusLabel =
    status === "error"
      ? "Could not save"
      : status === "saving"
        ? "Saving…"
        : status === "unsaved"
          ? "Unsaved"
          : "Saved";
  const statusClass =
    status === "error"
      ? "text-red-500"
      : status === "unsaved"
        ? "text-[var(--accent)]"
        : "text-[var(--text-muted)]";

  return (
    <main className="flex h-screen min-h-0 flex-col overflow-hidden bg-[var(--canvas)] text-[var(--text-primary)]">
      <header
        {...(nativeTitlebar ? {} : { "data-tauri-drag-region": "" })}
        className="flex h-11 shrink-0 items-center justify-between gap-6 border-b border-[var(--border)] pl-20 pr-1.5"
      >
        <div className="pointer-events-none flex min-w-0 items-center gap-2">
          <img src={typistLogo} alt="" className="h-5 w-5 rounded object-contain" />
          <span className="text-sm font-semibold tracking-[-0.02em]">Typist</span>
          {note && (
            <>
              <span className="text-[var(--text-muted)]">/</span>
              <span className="truncate text-sm text-[var(--text-muted)]">
                {fullDateLabel(noteDate)}
              </span>
              {noteDate !== today && (
                <button
                  type="button"
                  aria-label="Open today's journal"
                  onClick={() => void openJournalDay(today)}
                  className="ml-2 rounded-md px-2 py-0.5 text-[10px] font-medium text-[var(--text-muted)] hover:bg-black/5 dark:hover:bg-white/10"
                >
                  Today
                </button>
              )}
            </>
          )}
        </div>

        <div className="flex shrink-0 items-center gap-0.5">
          {note && (
            <span aria-live="polite" className={`mr-1 hidden text-xs sm:inline ${statusClass}`}>
              {statusLabel}
            </span>
          )}
          <button
            type="button"
            aria-label={theme === "dark" ? "Use light theme" : "Use dark theme"}
            title={theme === "dark" ? "Light theme" : "Dark theme"}
            onClick={() => setTheme((value) => (value === "dark" ? "light" : "dark"))}
            className="rounded-md p-2 text-[var(--text-muted)] hover:bg-black/5 hover:text-[var(--text-primary)] dark:hover:bg-white/10"
          >
            {theme === "dark" ? <Sun size={15} /> : <Moon size={15} />}
          </button>
          <button
            type="button"
            aria-label="Journal settings"
            onClick={() => {
              setPaletteOpen(false);
              setSettingsOpen((value) => !value);
            }}
            className="rounded-md p-2 text-[var(--text-muted)] hover:bg-black/5 hover:text-[var(--text-primary)] dark:hover:bg-white/10"
          >
            <Gear size={15} />
          </button>

          {appWindow && !nativeTitlebar && (
            <div className="ml-1 flex items-center" data-tauri-drag-region="false">
              <button
                type="button"
                aria-label="Minimize window"
                onClick={() => void appWindow.minimize()}
                className="rounded-md p-2 text-[var(--text-muted)] hover:bg-black/5 hover:text-[var(--text-primary)] dark:hover:bg-white/10"
              >
                <Minus size={14} />
              </button>
              <button
                type="button"
                aria-label={maximized ? "Restore window" : "Maximize window"}
                onClick={() => void appWindow.toggleMaximize()}
                className="rounded-md p-2 text-[var(--text-muted)] hover:bg-black/5 hover:text-[var(--text-primary)] dark:hover:bg-white/10"
              >
                {maximized ? <span className="px-[1px] text-[11px] leading-none">▣</span> : <Square size={11} />}
              </button>
              <button
                type="button"
                aria-label="Close window"
                onClick={() => void appWindow.close()}
                className="rounded-md p-2 text-[var(--text-muted)] hover:bg-red-500 hover:text-white"
              >
                <X size={14} />
              </button>
            </div>
          )}
        </div>
      </header>

      {notice && (
        <p
          role="alert"
          className="border-b border-[var(--border)] bg-[var(--code)] px-4 py-1.5 text-xs text-[var(--text-muted)]"
        >
          {notice}
        </p>
      )}

      <div className="flex min-h-0 flex-1">
        {desktop && !focusMode && (
          <Calendar
            selectedDate={noteDate}
            today={today}
            onSelect={openJournalDay}
            existingDays={journalDaysSet}
          />
        )}

        <section className="flex min-h-0 min-w-0 flex-1 flex-col">
          {!desktop ? (
            <div className="grid flex-1 place-items-center px-8 text-center">
              <div className="max-w-sm space-y-2">
                <p className="text-sm font-medium">Typist is a desktop app</p>
                <p className="text-sm text-[var(--text-muted)]">
                  Start it with <code className="rounded bg-[var(--code)] px-1.5 py-0.5">bun run tauri dev</code>{" "}
                  to write and save notes.
                </p>
              </div>
            </div>
          ) : opening && !note ? (
            <p className="grid flex-1 place-items-center text-sm text-[var(--text-muted)]">
              Opening your notes…
            </p>
          ) : note ? (
            <div className="min-h-0 flex-1 overflow-y-auto">
              <div className="mx-auto w-full max-w-3xl px-8 pb-32 pt-10">
                <MarkdownEditor
                  key={note.id}
                  initialValue={note.text}
                  onChange={handleChange}
                />
              </div>
            </div>
          ) : (
            <div className="grid flex-1 place-items-center px-8 text-center">
              <p className="text-sm text-[var(--text-muted)]">
                No notes yet. Create one from the sidebar.
              </p>
            </div>
          )}
        </section>
      </div>

      {paletteOpen && (
        <CommandPalette
          days={journalDays}
          onSelect={(path) => {
            const date = basename(path).replace(/\.md$/i, "");
            void openJournalDay(date);
            setPaletteOpen(false);
          }}
          onClose={() => setPaletteOpen(false)}
          today={today}
        />
      )}

      {settingsOpen && (
        <Settings
          open={settingsOpen}
          onClose={() => setSettingsOpen(false)}
          defaultPresetId={defaultPresetId}
          onDefaultPresetChange={setLocalDefaultPresetId}
          nativeTitlebar={nativeTitlebar}
          onNativeTitlebarChange={setNativeTitlebar}
        />
      )}

    </main>
  );
}
