import { readTextFile, writeTextFile } from "@tauri-apps/plugin-fs";
import { invoke } from "@tauri-apps/api/core";
import { Bell, Maximize2, Minimize2, Minus, Moon, PanelLeft, RotateCcw, Square, Sun, X } from "lucide-react";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { useReducedMotion } from "framer-motion";
import { useCallback, useEffect, useRef, useState } from "react";
import { Sidebar } from "./components/Sidebar";
import { MarkdownEditor } from "./components/Editor";
import { CommandPalette } from "./components/CommandPalette";
import { FirstLaunchIntro } from "./components/FirstLaunchIntro";
import { hasNewerCommit, releasesUrl } from "./utils/updateChecker";
import { fullDateLabel } from "./utils/journal";
import { StatusOrb } from "./utils/statusOrb";
import typistLogo from "../assets/typist.png";
import "./index.css";

const currentCommit = import.meta.env.VITE_COMMIT_SHA ?? "";
const appVersion = import.meta.env.VITE_APP_VERSION ?? "0.1.1";

/** A short look at the edge is enough; a fold waits a little longer. */
const HOVER_OPEN_DELAY = 150;
const HOVER_CLOSE_DELAY = 300;

/** The width of the invisible hover strip at the left edge. */
const EDGE_STRIP_WIDTH = 12;

/** Motion token: how far the sidebar slides (negative = off-canvas left). */
const SIDEBAR_TRANSITION_X = -260;

const isTauri = () => Boolean((window as Window & { __TAURI_INTERNALS__?: unknown }).__TAURI_INTERNALS__);
type ThemeChoice = "system" | "light" | "dark";
type JournalDay = { path: string; date: string };

function startUrl() {
  return import.meta.env.VITE_COMMIT_SHA ?? "";
}

const focusEditor = () => {
  document
    .querySelector<HTMLElement>(".markdown-editor [contenteditable='true']")
    ?.focus();
};

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
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [chromeHidden, setChromeHidden] = useState(false);
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
  const sidebarRef = useRef<HTMLElement | null>(null);
  const closeTimer = useRef<number | undefined>(undefined);
  const focusOnOpen = useRef(false);
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

  useEffect(() => () => {
    if (saveTimer.current) clearTimeout(saveTimer.current);
    window.clearTimeout(openTimer.current);
    window.clearTimeout(closeTimer.current);
  }, []);

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

  // --- sidebar: always-mounted transform slide, hover-region wrapper -------

  /* The hover region contains the 12px edge strip + the sidebar panel.
     Pointer events on this wrapper drive the open/close state. No other
     element may call setSidebarOpen — this is the one source of truth. */

  const hoverRegionRef = useRef<HTMLDivElement | null>(null);
  const openTimer = useRef<number | undefined>(undefined);
  const [sidebarAnimating, setSidebarAnimating] = useState(false);
  const reduceMotion = useReducedMotion();

  const openSidebarNow = useCallback(() => {
    window.clearTimeout(openTimer.current);
    window.clearTimeout(closeTimer.current);
    setSidebarAnimating(true);
    setSidebarOpen(true);
  }, [setSidebarAnimating, setSidebarOpen]);

  const hideSidebar = useCallback(() => {
    setSidebarAnimating(true);
    // Schedule the state flip after the exit animation completes.
    window.setTimeout(() => {
      setSidebarOpen(false);
      setSidebarAnimating(false);
      if (sidebarRef.current?.contains(document.activeElement)) focusEditor();
    }, reduceMotion ? 150 : 300);
  }, [reduceMotion, setSidebarAnimating, setSidebarOpen, sidebarRef, focusEditor]);

  const toggleSidebar = useCallback(() => {
    if (sidebarOpen) {
      hideSidebar();
      focusEditor();
    } else {
      openSidebarNow();
      const firstSidebarRow = document.querySelector('[data-sidebar-row]');
      if (firstSidebarRow) {
        (firstSidebarRow as HTMLElement).focus();
      }
    }
  }, [sidebarOpen, hideSidebar, openSidebarNow, focusEditor]);

  const requestSidebarOpen = useCallback(() => {
    window.clearTimeout(closeTimer.current);
    if (sidebarOpen || openTimer.current) return;
    openTimer.current = window.setTimeout(() => {
      openTimer.current = undefined;
      openSidebarNow();
    }, HOVER_OPEN_DELAY);
  }, [HOVER_OPEN_DELAY, openSidebarNow]);

  const requestSidebarClose = useCallback(() => {
    window.clearTimeout(openTimer.current);
    openTimer.current = undefined;
    if (!sidebarOpen) return;
    window.clearTimeout(closeTimer.current);
    closeTimer.current = window.setTimeout(() => {
      closeTimer.current = undefined;
      hideSidebar();
    }, HOVER_CLOSE_DELAY);
  }, [HOVER_CLOSE_DELAY, hideSidebar]);

  /* Reduced‑motion aware animation state */
  useEffect(() => {
    // When sidebarAnimating changes, toggle the CSS class that drops
    // backdrop-filter during the slide. The class is defined in index.css.
    const className = reduceMotion ? "sidebar-animating-reduced" : "sidebar-animating";
    const element = document.body;
    if (sidebarAnimating) {
      element.classList.add(className);
    } else {
      element.classList.remove(className);
    }
  }, [sidebarAnimating, reduceMotion]);

  // --- shortcuts ---
  useEffect(() => {
    const handleShortcut = (event: KeyboardEvent) => {
      if (!(event.metaKey || event.ctrlKey)) return;
      const key = event.key.toLowerCase();
      if (key === "s") { event.preventDefault(); void saveNow.current(); }
      if (key === "p") { event.preventDefault(); setPaletteOpen(true); }
      // Ctrl/Cmd+\ toggles the journal rail (Ctrl/Cmd+B belongs to bold).
      if (event.code === "Backslash" || key === "\\") {
        event.preventDefault();
        toggleSidebar();
      }
      if (event.shiftKey && key === "f") {
        event.preventDefault();
        setChromeHidden((hidden) => !hidden);
      }
    };
    const onEscape = (event: KeyboardEvent) => {
      if (event.key !== "Escape" || paletteOpen || showIntro) return;
      if (!sidebarOpen && !chromeHidden) return;
      window.clearTimeout(openTimer.current);
      window.clearTimeout(closeTimer.current);
      hideSidebar();
      setChromeHidden(false);
      focusEditor();
    };
    window.addEventListener("keydown", handleShortcut);
    window.addEventListener("keydown", onEscape);
    return () => { window.removeEventListener("keydown", handleShortcut); window.removeEventListener("keydown", onEscape); };
  }, [chromeHidden, paletteOpen, showIntro, toggleSidebar]);

  // A freshly opened entry is ready to write in.
  useEffect(() => {
    if (loading || !selectedFile || paletteOpen || showIntro) return;
    const active = document.activeElement;
    if (!active || active === document.body) focusEditor();
  }, [loading, selectedFile, paletteOpen, showIntro]);

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
  const savedLabel = lastSavedAt
    ? `Saved ${lastSavedAt.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}`
    : "Saved locally";
  const iconButton = "press grid h-11 w-11 place-items-center rounded-lg text-[var(--text-muted)] hover:bg-[var(--surface-hover)]";
  const closeButton = "press grid h-11 w-11 place-items-center rounded-lg text-[var(--text-muted)] hover:bg-[var(--danger)] hover:text-white";

  return (
    <main className={`flex h-screen min-h-0 flex-col overflow-hidden bg-[var(--canvas)] text-[var(--text-primary)]`}>
      {!chromeHidden && (
        <header data-tauri-drag-region className="flex h-12 shrink-0 items-center justify-between border-b border-[var(--border)] px-4 pl-20">
          <div className="pointer-events-none flex min-w-0 items-center gap-2 text-sm font-semibold tracking-[-0.02em]"><img src={typistLogo} alt="Typist logo" className="h-6 w-6 rounded-md object-contain" />Typist <span className="text-xs font-normal text-[var(--text-muted)]">{appVersion}</span>
            <span className="ml-2 hidden truncate text-xs font-normal text-[var(--text-muted)] md:inline">{headerTitle}</span>
          </div>
          <div className="flex shrink-0 items-center gap-0.5" data-tauri-drag-region="false">
            <button
              type="button"
              onClick={toggleSidebar}
              aria-label={sidebarOpen ? "Hide journal sidebar" : "Show journal sidebar"}
              aria-expanded={sidebarOpen}
              aria-controls="journal-sidebar"
              aria-keyshortcuts="Control+Backslash Meta+Backslash"
              title="Journal sidebar (Ctrl/Cmd+\\)"
              className={iconButton}
            >
              <PanelLeft size={16} />
            </button>
            <div className="mr-1 flex items-center">
              <button type="button" aria-label="Decrease font size" onClick={() => setFontSize((s) => Math.max(14, s - 1))} className={`${iconButton} text-xs`}>A−</button>
              <span aria-live="polite" className="w-6 text-center text-[11px] text-[var(--text-muted)]">{fontSize}</span>
              <button type="button" aria-label="Increase font size" onClick={() => setFontSize((s) => Math.min(22, s + 1))} className={`${iconButton} text-xs`}>A+</button>
            </div>
            {updateAvailable && <a href={releasesUrl} target="_blank" rel="noreferrer" aria-label="Update available" className={`${iconButton} text-[var(--accent)]`}><Bell size={16} /></a>}
            <button type="button" aria-label={`Theme: ${theme}. Change theme`} title={`Theme: ${theme} (click to change)`} onClick={() => setTheme((t) => (t === "system" ? "light" : t === "light" ? "dark" : "system"))} className={iconButton}>{theme === "dark" || (theme === "system" && dark) ? <Sun size={16} /> : <Moon size={16} />}</button>
            <button type="button" aria-label="Hide window chrome" title="Immersive writing (Ctrl/Cmd+Shift+F, Esc to exit)" onClick={() => setChromeHidden(true)} className={iconButton}><Maximize2 size={16} /></button>
            {windowControls && <div className="ml-1 flex items-center"><button type="button" aria-label="Minimize window" onClick={() => void windowControls.minimize()} className={iconButton}><Minus size={15} /></button><button type="button" aria-label={isMaximized ? "Restore window" : "Maximize window"} onClick={() => { void windowControls.toggleMaximize(); setIsMaximized((value) => !value); }} className={iconButton}>{isMaximized ? <span className="text-xs">▣</span> : <Square size={12} />}</button><button type="button" aria-label="Close window" onClick={() => void windowControls.close()} className={closeButton}><X size={15} /></button></div>}
          </div>
        </header>
      )}

      <div className="relative flex min-h-0 flex-1">
        {/* Edge strip: 12px wide hover zone at the left edge. Placed before the sidebar so
         * it receives pointer events even when the sidebar is open and covers the edge. */}
        <div
          className="edge-strip absolute inset-block left-0 z-10 pointer-events-auto"
          onMouseEnter={requestSidebarOpen}
          onMouseLeave={requestSidebarClose}
          aria-hidden="true"
        />
        <Sidebar
          open={sidebarOpen}
          onRequestOpen={requestSidebarOpen}
          onRequestClose={requestSidebarClose}
          onOpenNow={openSidebarNow}
          onCloseNow={hideSidebar}
          onSelectFile={openFile}
          activePath={selectedFile}
          refreshKey={sidebarRefresh}
          navRef={sidebarRef}
        />

        {chromeHidden && (
          <button
            type="button"
            onClick={() => { setChromeHidden(false); focusEditor(); }}
            aria-label="Show window chrome (Esc)"
            title="Show window chrome (Esc)"
            className="press material absolute right-3 top-3 z-40 grid h-11 w-11 place-items-center rounded-full border border-[var(--border)] text-[var(--text-muted)] hover:text-[var(--text-primary)]"
          >
            <Minimize2 size={16} />
          </button>
        )}

        <section className="flex min-w-0 flex-1 flex-col">
          {!chromeHidden && (
            <div className="flex h-10 shrink-0 items-center justify-between gap-4 border-b border-[var(--border)] px-6 text-xs text-[var(--text-muted)]">
              <span className="truncate">{fileName}{isDirty && <span className="ml-2 inline-block h-1.5 w-1.5 rounded-full bg-[var(--accent)] align-middle" aria-label="Unsaved changes" />}</span>
              <span className="hidden shrink-0 sm:inline">Ctrl/⌘ \ for the journal · Ctrl/⌘ P to find a day</span>
            </div>
          )}
          {loading ? (
            <div role="status" aria-live="polite" className="flex flex-1 items-center justify-center gap-2 text-sm text-[var(--text-muted)]">
              <StatusOrb status="loading" label="Opening document" />
              <span>Opening document…</span>
            </div>
          ) : <MarkdownEditor value={content} onChange={handleChange} />}
          {!chromeHidden && (
            <footer className="flex h-8 shrink-0 items-center justify-between border-t border-[var(--border)] px-6 text-[11px] text-[var(--text-muted)]">
              <span>{wordCount.toLocaleString()} {wordCount === 1 ? "word" : "words"}</span>
              <span aria-live="polite" className="flex items-center gap-2">
                {saveState === "saving" ? "Saving…" : saveState === "error" ? (
                  <button type="button" onClick={() => void saveNow.current()} className="press flex min-h-6 items-center gap-1 rounded-md px-2 font-medium text-[var(--danger)] hover:bg-[var(--danger-soft)]"><RotateCcw size={12} /> Could not save — retry</button>
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
