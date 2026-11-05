import { readTextFile, writeTextFile } from "@tauri-apps/plugin-fs";
import { invoke } from "@tauri-apps/api/core";
import { Bell, Minus, Moon, Square, Sun, X, RotateCcw } from "lucide-react";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { useEffect, useRef, useState } from "react";
import { Sidebar } from "./components/Sidebar";
import { MarkdownEditor } from "./components/Editor";
import { CommandPalette } from "./components/CommandPalette";
import { FirstLaunchIntro } from "./components/FirstLaunchIntro";
import { hasNewerCommit, releasesUrl } from "./utils/updateChecker";
import { fullDateLabel } from "./utils/journal";
import typistLogo from "../assets/typist.png";
import "./index.css";

const currentCommit = import.meta.env.VITE_COMMIT_SHA ?? "";
const appVersion = import.meta.env.VITE_APP_VERSION ?? "0.1.1";

const isTauri = () => Boolean((window as Window & { __TAURI_INTERNALS__?: unknown }).__TAURI_INTERNALS__);
type ThemeChoice = "system" | "light" | "dark";
type ViewMode = "normal" | "focused" | "immersive";
type JournalDay = { path: string; date: string };

function startUrl() {
  return import.meta.env.VITE_COMMIT_SHA ?? "";
}

export default function App() {
  const [theme, setTheme] = useState<ThemeChoice>(() => {
    const saved = localStorage.getItem("typist-theme");
    return saved === "light" || saved === "dark" ? saved : "system";
  });
  const [dark, setDark] = useState(false);
  const [selectedFile, setSelectedFile] = useState<string>();
  const [content, setContent] = useState("");
  const [loading, setLoading] = useState(false);
  const [isDirty, setIsDirty] = useState(false);
  const [updateAvailable, setUpdateAvailable] = useState(false);
  const [isMaximized, setIsMaximized] = useState(false);
  const [mode, setMode] = useState<ViewMode>("focused");
  const [saveState, setSaveState] = useState<"saved" | "saving" | "error">("saved");
  const [lastSavedAt, setLastSavedAt] = useState<Date | null>(null);
  const [showIntro, setShowIntro] = useState(false);
  const [paletteOpen, setPaletteOpen] = useState(false);
  const [days, setDays] = useState<JournalDay[]>([]);
  const [sidebarRefresh, setSidebarRefresh] = useState(0);
  const [fontSize, setFontSize] = useState(() => {
    const saved = Number(localStorage.getItem("typist-font-size"));
    return saved >= 14 && saved <= 22 ? saved : 17;
  });
  const saveTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const fileRef = useRef<string | undefined>(undefined);
  const contentRef = useRef("");
  const windowControls = isTauri() ? getCurrentWindow() : undefined;

  // --- theme ---
  useEffect(() => {
    const mq = window.matchMedia("(prefers-color-scheme: dark)");
    const apply = () => setDark(theme === "system" ? mq.matches : theme === "dark");
    apply();
    mq.addEventListener("change", apply);
    localStorage.setItem("typist-theme", theme);
    return () => mq.removeEventListener("change", apply);
  }, [theme]);

  useEffect(() => {
    document.documentElement.classList.toggle("dark", dark);
  }, [dark]);

  useEffect(() => {
    document.documentElement.style.setProperty("--editor-font-size", `${fontSize}px`);
    localStorage.setItem("typist-font-size", String(fontSize));
  }, [fontSize]);

  // --- boot: workspace -> today's journal -> first-run intro ---
  useEffect(() => {
    hasNewerCommit(startUrl()).then(setUpdateAvailable).catch(() => undefined);
    if (windowControls) windowControls.isMaximized().then(setIsMaximized).catch(() => undefined);
    if (!isTauri()) return;
    invoke<{ root: string; welcome: string }>("initialize_workspace")
      .then(async () => {
        try { setDays(await invoke<JournalDay[]>("list_journal_days")); } catch { setDays([]); }
        const firstRun = !localStorage.getItem("typist-intro-seen");
        if (firstRun) setShowIntro(true);
        const today = await invoke<string>("open_daily_journal");
        fileRef.current = today;
        setSelectedFile(today);
        return invoke<JournalDay[]>("list_journal_days").then(setDays).catch(() => undefined);
      })
      .catch(() => undefined);
  }, []);

  // --- load selected file ---
  useEffect(() => {
    if (!selectedFile || !isTauri()) {
      if (!selectedFile) { setContent(""); setIsDirty(false); setSaveState("saved"); }
      return;
    }
    let active = true;
    setLoading(true);
    readTextFile(selectedFile)
      .then((text) => { if (active) { setContent(text); contentRef.current = text; setIsDirty(false); setSaveState("saved"); } })
      .catch(() => active && (setContent(""), setSaveState("error")))
      .finally(() => active && setLoading(false));
    return () => { active = false; };
  }, [selectedFile]);

  // --- saving ---
  const saveNow = useRef<() => Promise<void>>(async () => {});
  saveNow.current = async () => {
    const file = fileRef.current;
    if (!file || !isTauri()) return;
    if (saveTimer.current) clearTimeout(saveTimer.current);
    setSaveState("saving");
    try {
      await writeTextFile(file, contentRef.current);
      setIsDirty(false);
      setSaveState("saved");
      setLastSavedAt(new Date());
    } catch {
      setSaveState("error");
    }
  };

  const commit = useRef<() => void>(() => {});
  commit.current = () => {
    if (saveTimer.current) clearTimeout(saveTimer.current);
    void saveNow.current();
  };

  useEffect(() => () => { if (saveTimer.current) clearTimeout(saveTimer.current); }, []);

  // flush pending save on blur / close
  useEffect(() => {
    const flush = () => { void commit.current(); };
    const onBeforeUnload = (e: BeforeUnloadEvent) => {
      const file = fileRef.current;
      if (file && isTauri()) {
        // best-effort synchronous-ish flush via visible write
        try { void saveNow.current(); } catch { /* ignore */ }
      }
    };
    window.addEventListener("blur", flush);
    window.addEventListener("beforeunload", onBeforeUnload);
    return () => { window.removeEventListener("blur", flush); window.removeEventListener("beforeunload", onBeforeUnload); };
  }, []);

  const handleChange = (next: string) => {
    setContent(next);
    contentRef.current = next;
    const file = fileRef.current;
    if (!file || !isTauri()) return;
    setIsDirty(true);
    setSaveState("saving");
    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(() => {
      writeTextFile(file, next)
        .then(() => { setIsDirty(false); setSaveState("saved"); setLastSavedAt(new Date()); })
        .catch(() => setSaveState("error"));
    }, 700);
  };

  // --- shortcuts ---
  useEffect(() => {
    const handleShortcut = (event: KeyboardEvent) => {
      if (!(event.metaKey || event.ctrlKey)) return;
      const key = event.key.toLowerCase();
      if (key === "s") { event.preventDefault(); void saveNow.current(); }
      if (key === "p") { event.preventDefault(); setPaletteOpen(true); }
      if (event.shiftKey && key === "f") {
        event.preventDefault();
        setMode((m) => (m === "normal" ? "focused" : m === "focused" ? "immersive" : "normal"));
      }
    };
    const onEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape" && mode === "immersive") setMode("focused");
    };
    window.addEventListener("keydown", handleShortcut);
    window.addEventListener("keydown", onEscape);
    return () => { window.removeEventListener("keydown", handleShortcut); window.removeEventListener("keydown", onEscape); };
  }, [mode]);

  const openFile = (path: string) => {
    setSelectedFile(path);
    fileRef.current = path;
    setSidebarRefresh((n) => n + 1);
  };

  const refreshDays = () => {
    if (isTauri()) invoke<JournalDay[]>("list_journal_days").then(setDays).catch(() => undefined);
  };

  const dismissIntro = () => {
    setShowIntro(false);
    localStorage.setItem("typist-intro-seen", "1");
    refreshDays();
  };

  const wordCount = content.trim() ? content.trim().split(/\s+/).length : 0;
  const fileName = selectedFile?.split(/[\\/]/).pop() ?? "Untitled.md";
  const journalDate = /^\d{4}-\d{2}-\d{2}\.md$/.test(fileName) ? fileName.replace(".md", "") : null;
  const headerTitle = journalDate ? fullDateLabel(journalDate) : fileName;
  const railVisible = mode === "normal";
  const chromeHidden = mode === "immersive";
  const savedLabel = lastSavedAt
    ? `Saved ${lastSavedAt.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}`
    : "Saved locally";

  return (
    <main className={`flex h-screen min-h-0 flex-col overflow-hidden bg-[var(--canvas)] text-[var(--text-primary)]`}>
      {!chromeHidden && (
        <header data-tauri-drag-region className="flex h-12 shrink-0 items-center justify-between border-b border-[var(--border)] px-4 pl-20">
          <div className="pointer-events-none flex items-center gap-2 text-sm font-semibold tracking-[-0.02em]"><img src={typistLogo} alt="Typist logo" className="h-6 w-6 rounded-md object-contain" />Typist <span className="text-xs font-normal text-[var(--text-muted)]">{appVersion}</span>
            <span className="ml-2 hidden text-xs font-normal text-[var(--text-muted)] md:inline">{headerTitle}</span>
          </div>
          <div className="flex items-center gap-1" data-tauri-drag-region="false">
            <div className="mr-1 flex items-center gap-1">
              <button aria-label="Decrease font size" onClick={() => setFontSize((s) => Math.max(14, s - 1))} className="rounded-lg px-1.5 py-1 text-xs text-[var(--text-muted)] hover:bg-black/5 dark:hover:bg-white/10">A−</button>
              <span className="w-6 text-center text-[11px] text-[var(--text-muted)]">{fontSize}</span>
              <button aria-label="Increase font size" onClick={() => setFontSize((s) => Math.min(22, s + 1))} className="rounded-lg px-1.5 py-1 text-xs text-[var(--text-muted)] hover:bg-black/5 dark:hover:bg-white/10">A+</button>
            </div>
            {updateAvailable && <a href={releasesUrl} target="_blank" rel="noreferrer" aria-label="Update available" className="rounded-lg p-2 text-[var(--accent)] hover:bg-black/5 dark:hover:bg-white/10"><Bell size={16} /></a>}
            <button aria-label="Cycle theme" title={`Theme: ${theme} (click to change)`} onClick={() => setTheme((t) => (t === "system" ? "light" : t === "light" ? "dark" : "system"))} className="rounded-lg p-2 text-[var(--text-muted)] hover:bg-black/5 dark:hover:bg-white/10">{theme === "dark" || (theme === "system" && dark) ? <Sun size={16} /> : <Moon size={16} />}</button>
            {windowControls && <div className="ml-2 flex items-center"><button aria-label="Minimize window" onClick={() => void windowControls.minimize()} className="p-2 text-[var(--text-muted)] hover:bg-black/5 dark:hover:bg-white/10"><Minus size={15} /></button><button aria-label={isMaximized ? "Restore window" : "Maximize window"} onClick={() => { void windowControls.toggleMaximize(); setIsMaximized((value) => !value); }} className="p-2 text-[var(--text-muted)] hover:bg-black/5 dark:hover:bg-white/10">{isMaximized ? <span className="text-xs">▣</span> : <Square size={12} />}</button><button aria-label="Close window" onClick={() => void windowControls.close()} className="p-2 text-[var(--text-muted)] hover:bg-red-500 hover:text-white"><X size={15} /></button></div>}
          </div>
        </header>
      )}

      <div className="relative flex min-h-0 flex-1">
        {!railVisible && !chromeHidden && (
          <div
            className="group absolute inset-y-0 left-0 z-10 w-2 cursor-pointer"
            onMouseEnter={() => setMode("normal")}
            onClick={() => setMode("normal")}
            aria-label="Show journal sidebar"
          >
            <div className="h-full w-[3px] bg-[var(--border)] opacity-0 transition-opacity duration-150 group-hover:opacity-100" />
          </div>
        )}
        {railVisible && (
          <div onMouseLeave={() => setMode("focused")}>
            <Sidebar onSelectFile={openFile} activePath={selectedFile} refreshKey={sidebarRefresh} />
          </div>
        )}

        <section className="flex min-w-0 flex-1 flex-col">
          {!chromeHidden && (
            <div className="flex h-10 shrink-0 items-center justify-between border-b border-[var(--border)] px-6 text-xs text-[var(--text-muted)]">
              <span className="truncate">{fileName}{isDirty && <span className="ml-2 inline-block h-1.5 w-1.5 rounded-full bg-[var(--accent)] align-middle" aria-label="Unsaved changes" />}</span>
              <span className="hidden sm:inline">{mode === "focused" ? "Writing · Ctrl/Cmd+Shift+F for more focus" : "Ctrl/Cmd+S to save · Ctrl/Cmd+P to find a day"}</span>
            </div>
          )}
          {loading ? <div className="flex flex-1 items-center justify-center text-sm text-[var(--text-muted)]">Opening document…</div> : <MarkdownEditor value={content} onChange={handleChange} />}
          {!chromeHidden && (
            <footer className="flex h-8 shrink-0 items-center justify-between border-t border-[var(--border)] px-6 text-[11px] text-[var(--text-muted)]">
              <span>{wordCount.toLocaleString()} {wordCount === 1 ? "word" : "words"}</span>
              <span aria-live="polite" className="flex items-center gap-2">
                {saveState === "saving" ? "Saving…" : saveState === "error" ? (
                  <button onClick={() => void saveNow.current()} className="flex items-center gap-1 rounded-md px-2 py-0.5 font-medium text-red-500 hover:bg-red-500/10"><RotateCcw size={12} /> Could not save — retry</button>
                ) : selectedFile ? savedLabel : "Local draft"}
              </span>
            </footer>
          )}
        </section>
      </div>

      {paletteOpen && <CommandPalette days={days} onSelect={openFile} onClose={() => setPaletteOpen(false)} today={new Date().toLocaleDateString("en-CA")} />}
      {showIntro && <FirstLaunchIntro onDismiss={dismissIntro} />}
    </main>
  );
}
