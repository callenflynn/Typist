# Typist — Product Goal: Daily Journal, No Distraction

## The single outcome

Turn Typist from a generic Markdown editor into a **quiet, local-first daily journal**.
Opening the app puts the cursor directly into today's entry. You write; it saves.
Typora-inspired single writing surface, no source pane, no vault, no account, no cloud.

The app must still work as a general Markdown editor (other `.md` files open normally),
but the default experience is the journal.

---

## Look & feel (design language)

Keep the existing foundation — it's already right:

- **Palette** from `src/index.css` CSS variables (`--canvas`, `--text-primary`, `--text-muted`, `--glass`, `--code`, `--accent`, `--border`). Light + `.dark` variants exist. Never inline hex in components; only use the vars.
- **Type**: Inter (system fallback), generous line-height (`1.9` in the editor), letter-spaced muted labels. This is the macOS-quiet aesthetic already in place.
- **Chrome**: borderless Tauri window with in-app title bar (required for Hyprland — keep the `data-tauri-drag-region` header). Subtle 1px borders, glass header/footer, rounded-3xl modals, soft shadows.

Refine toward "quiet journal":

1. **Centered writing column** — the editor content is constrained to a comfortable measure (~680px max, centered), like Typora/Medium. Margins breathe; the surface is the hero.
2. **Date, not filename** — the header reads as a date ("Tuesday, November 3"), large and calm, not as `2026-11-03.md`. The file is still date-named; the UI just doesn't show the raw name.
3. **Accent is sparing** — blue accent only for interactive affordances, links, the caret, and the "unsaved" dot. Everything else is monochrome.
4. **Default stance is distraction-free** — on open, the sidebar is hidden (auto-reveals on a slim left grip/hover). You are writing within one keystroke of launch.
5. **Motion is quiet** — existing framer-motion use is fine; keep transitions 150–200ms, ease-out, opacity/transform only.

---

## Features to add

Each item states what, the how, and the acceptance criteria. Agents should
implement in the order listed (foundation first).

### 1. Journal-first launch

**What.** Opening Typist always lands in today's journal. Never `Welcome.md`.

**How.** `src-tauri/src/commands.rs` already registers `open_daily_journal` and
`create_vault` — but `src/App.tsx` never calls them. Wire them up:
- `open_daily_journal` resolves today's date (`YYYY-MM-DD`, system local date) and
  returns `~/Documents/Typist/<date>.md`, creating it (with a `# <date>` heading)
  if missing.
- Replace the `initialize_workspace` → select `welcome` logic in `Sidebar.tsx` /
  `App.tsx` with: initialize workspace, then open today's journal.
- Keep `Welcome.md` out of the launch path entirely.

**Acceptance.** Launching the app opens `~/Documents/Typist/2026-11-03.md` (today),
created on first run with a date heading. `Welcome.md` never auto-opens.

### 2. Journal sidebar (replaces the raw file tree)

**What.** The left rail becomes a reverse-chronological list of journal days,
grouped by month, with "Today" pinned and labeled. Non-`YYYY-MM-DD.md` markdown
files appear in a separate "Notes" section so the app stays a general editor.

**How.**
- Add a Rust command (e.g. `list_journal_days`) that scans the workspace for
  `YYYY-MM-DD.md`, sorts descending, and returns them grouped by `YYYY-MM`.
  Reuse the existing `safe_path`/`canonical_workspace` path guards.
- Rework `Sidebar.tsx` into a `JournalSidebar`: month group headers (collapsible),
  day rows showing "Today" (with an accent dot) or the weekday/short date,
  then a "Notes" section for other `.md` files. Refresh on change.
- Clicking a day loads that file.

**Acceptance.** Sidebar lists days newest-first under month headers; Today is
pinned at top with a label; notes section lists other markdown; clicking a day opens it.

### 3. Distraction-free as the default

**What.** The sidebar auto-hides. A slim left grip reveals it on hover. An
"immersive" mode hides all chrome (header + footer) too. `Ctrl/Cmd+Shift+F`
cycles: normal → focused → immersive.

**How.** Extend the existing `focusMode` state in `App.tsx`. Default `focusMode`
= true on launch. Add a third `immersive` state. When the rail is hidden, render
an 8px hover strip on the left that expands the sidebar on hover (CSS transition).
Immersive hides the header/footer entirely; `Esc` or the shortcut exits.

**Acceptance.** On launch the sidebar is hidden and the cursor is in the editor.
Hovering the left edge reveals the rail. `Ctrl/Cmd+Shift+F` cycles all three states.

### 4. Command palette (fix the advertised-but-missing ⌘P)

**What.** `Ctrl/Cmd+P` opens a fuzzy palette to jump to any journal day by date or
content. This is already advertised in `FirstLaunchIntro.tsx` but was never
implemented — that's a real gap to close.

**How.** New `src/components/CommandPalette.tsx`: modal (rounded-3xl, glass, the
existing modal pattern), input + result list, `↑/↓` to move, `Enter` to open,
`Esc` to close. Fuzzy-match over journal filenames (dates) plus a lightweight
content search (scan journal files for the query; keep it capped, e.g. first 200
files). No new state library. A tiny fuzzy util (≤60 lines) is acceptable.

**Acceptance.** `Ctrl/Cmd+P` opens the palette; typing "oct" lists October days;
`Enter` opens the selected entry; `Esc` closes. Content search surfaces matches.

### 5. Inline formatting shortcuts + selection toolbar (Typora feel)

**What.** Keyboard formatting that works without leaving the text, plus a floating
formatting toolbar on mouse text-selection.

**How.**
- Wire the Milkdown keymap: `Ctrl/Cmd+B` bold, `Ctrl/Cmd+I` italic,
  `Ctrl/Cmd+E` inline code, `Ctrl/Cmd+K` link, `Ctrl/Cmd+Shift+X` strikethrough.
- A floating toolbar (small, glass, appears above the selection on mouse drag):
  bold, italic, code, link, quote, bullet list. Never on keyboard selection/typing.
  Lives in `Editor.tsx` or a small `SelectionToolbar.tsx`.

**Acceptance.** The shortcuts toggle formatting inline. A formatting bar appears
on mouse text selection and disappears on blur/click-away.

### 6. Slash command insert menu

**What.** `/` on an empty line opens an inline insert menu: heading (H1/H2/H3),
task list, blockquote, code block, divider, link, image.

**How.** A lightweight Milkdown plugin or React overlay triggered by the listener
when the line is empty and starts with `/`. Arrow keys navigate, `Enter` inserts,
`Esc` closes. Reuse the existing modal styling for the popover.

**Acceptance.** `/` shows the menu; each entry inserts the correct block; the menu
closes on selection, Esc, or click-away.

### 7. Save & reliability hardening

**What.** Autosave stays (700ms debounce). Add flush on window blur and on close,
a last-modified timestamp in the footer, and a visible retry affordance on write
failure.

**How.**
- In `App.tsx`, flush the pending debounce in the `blur`/`beforeunload` handlers
  (there's already a `saveTimer` ref and `saveNow`).
- Footer shows the saved time ("Saved 14:32") once saved, and a retry button when
  `saveState === "error"` (currently it just silently sets the state).
- Keep undo/redo (`Ctrl/Cmd+Z` / `Ctrl/Cmd+Shift+Z`) working — don't intercept them.

**Acceptance.** Switching windows or closing flushes pending changes. Footer shows
last-modified time. A failed write shows a retry affordance that re-saves.

### 8. Theme & appearance

**What.** Light/dark already works and persists. Add: follow-system as the default,
and a font-size control for the editor.

**How.** Read `prefers-color-scheme` when no saved choice exists; persist the
choice (`localStorage`, existing `typist-theme` key — extend its value set to
`system | light | dark`). Add a small font-size stepper (e.g. ± in the header or a
settings popover) that sets an editor CSS var. Keep it minimal.

**Acceptance.** First run follows the OS theme. Manual override persists. Font-size
control changes the editor scale and persists.

### 9. First-run journal intro

**What.** Replace the `Welcome.md`-style intro and the stale `FirstLaunchIntro.tsx`
(which advertises the unimplemented ⌘P). First run seeds a short "getting started"
journal entry into today's file and shows a one-time card.

**How.** Seed today's file with a 3–4 line quick start (date heading + "This is
your journal. Everything stays on this computer." + the three keybinds that
actually work). Show the intro card once, dismiss on any key or click. Remove the
⌘P lie from the keybind list (or only show keybinds that are implemented).

**Acceptance.** First run shows a dismissible intro and seeds today's entry. No
unimplemented keybinds are advertised.

### 10. (Optional, low priority) Writing micro-features

Only if the harness finishes the above cleanly:
- A soft "word goal" line for the day (e.g. `# today 512 words`) — purely cosmetic.
- A 1-hour streak heat strip in the sidebar (last 7 days, tiny dots) — read-only,
  derived from file mtimes.

---

## Non-goals (explicitly out of scope)

- No cloud sync, no account, no authentication.
- No "vault" concept beyond the local workspace folder (the `create_vault`
  command is legacy — leave it, don't build on it).
- No source/preview split or HTML export.
- No state management library (React state is sufficient at this scale).
- Don't break the Arch package recipe (`packaging/arch`) or the Hyprland
  borderless-window workaround.

## Technical guardrails

- Keep all styling in `index.css` CSS vars — no new hard-coded hex in components.
- Reuse the existing `safe_path`/`canonical_workspace` path guards in `commands.rs`;
  never bypass them.
- Date handling: system local date at launch, `YYYY-MM-DD` filenames, no frontmatter
  timestamps (files stay plain, human-readable, Typora-like).
- Minimal dependencies: a fuzzy util is the only new code expected; a state library
  or UI framework is a scope violation.

## Verification (done before the goal is considered met)

1. `make check` passes with zero new errors (typecheck + production web build).
2. `make tauri-dev` on this machine opens directly into today's journal, created on
   first run with a date heading.
3. Sidebar shows journal days newest-first under month headers; Today pinned;
   other markdown files under Notes; clicking a day loads it.
4. `Ctrl/Cmd+P` fuzzy palette opens, filters by date and content, Enter opens.
5. `Ctrl/Cmd+B`/`I`/`E`/`K` toggle formatting; selection toolbar appears on mouse drag.
6. `/` insert menu works for heading/task/quote/code/divider.
7. Sidebar hidden on launch; hover-grip reveals it; `Ctrl/Cmd+Shift+F` cycles
   normal → focused → immersive.
8. Autosave flushes on blur and close; footer shows last-modified; failed write
   shows retry.
9. Theme follows system by default; manual override persists; font-size control works.
10. No new heavyweight dependencies.
11. Arch package recipe and Hyprland borderless window still behave (window is
    borderless, draggable, resizable; launcher works).
