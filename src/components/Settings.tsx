import { Plus, X } from "lucide-react";
import { useCallback, useMemo, useRef, useState } from "react";
import {
  allPresets,
  applyPreset,
  customPresets,
  deleteCustomPreset,
  presetId,
  resolveDefaultPreset,
  saveCustomPreset,
  setDefaultPresetId,
  type JournalPreset,
} from "../lib/presets";
import { localToday } from "../utils/journal";

type SettingsTab = "journal" | "window";

type SettingsProps = {
  open: boolean;
  onClose: () => void;
  defaultPresetId: string;
  onDefaultPresetChange: (id: string) => void;
  nativeTitlebar: boolean;
  onNativeTitlebarChange: (value: boolean) => void;
};

export function Settings({
  open,
  onClose,
  defaultPresetId,
  onDefaultPresetChange,
  nativeTitlebar,
  onNativeTitlebarChange,
}: SettingsProps) {
  const [customName, setCustomName] = useState("");
  const [customTemplate, setCustomTemplate] = useState("");
  const [customError, setCustomError] = useState<string>();
  const [tab, setTab] = useState<SettingsTab>("journal");
  const [query, setQuery] = useState("");
  const nameRef = useRef<HTMLInputElement>(null);

  const today = localToday();

  const allPresetList = allPresets();
  const defaultPreset =
    allPresetList.find((p) => p.id === defaultPresetId) ?? resolveDefaultPreset();

  const filteredPresets = useMemo(
    () =>
      allPresetList.filter(
        (p) =>
          p.name.toLowerCase().includes(query.toLowerCase()) ||
          p.template.toLowerCase().includes(query.toLowerCase()),
      ),
    [allPresetList, query],
  );

  const filteredCustomPresets = useMemo(
    () =>
      customPresets().filter(
        (p) =>
          p.name.toLowerCase().includes(query.toLowerCase()) ||
          p.template.toLowerCase().includes(query.toLowerCase()),
      ),
    [query],
  );

  const windowMatches =
    query === "" ||
    query.toLowerCase().includes("native") ||
    query.toLowerCase().includes("titlebar") ||
    query.toLowerCase().includes("window");

  const handlePresetSelect = useCallback(
    (id: string) => {
      setDefaultPresetId(id);
      onDefaultPresetChange(id);
    },
    [onDefaultPresetChange],
  );

  const handleAddCustom = useCallback(() => {
    setCustomError(undefined);
    const name = customName.trim();
    if (!name) {
      setCustomError("Give the preset a name.");
      return;
    }
    if (allPresets().some((p) => p.name.toLowerCase() === name.toLowerCase())) {
      setCustomError("A preset with that name already exists.");
      return;
    }
    const saved = saveCustomPreset({ id: presetId(name), name, template: customTemplate });
    setDefaultPresetId(saved.id);
    onDefaultPresetChange(saved.id);
    setCustomName("");
    setCustomTemplate("");
    if (nameRef.current) nameRef.current.focus();
  }, [customName, customTemplate, onDefaultPresetChange]);

  const handleDelete = useCallback(
    (id: string) => {
      if (!window.confirm("Delete this preset?")) return;
      deleteCustomPreset(id);
      if (id === defaultPresetId) {
        onDefaultPresetChange("blank");
      }
    },
    [defaultPresetId, onDefaultPresetChange],
  );

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 grid place-items-end bg-black/20 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        className="fixed inset-y-0 right-0 z-50 w-full max-w-[440px] min-w-[320px] bg-[var(--glass)] border-l border-[var(--border)] p-6 shadow-2xl flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between mb-4 shrink-0">
          <h2 className="text-sm font-semibold">Settings</h2>
          <button
            type="button"
            aria-label="Close settings"
            onClick={onClose}
            className="rounded p-1 text-[var(--text-muted)] hover:bg-black/5 dark:hover:bg-white/10"
          >
            <X size={16} />
          </button>
        </div>

        <input
          type="search"
          placeholder="Search settings..."
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          className="w-full flex-shrink-0 rounded border border-[var(--border)] bg-[var(--code)] px-3 py-1.5 text-sm text-[var(--text-primary)] outline-none focus:ring-1 focus:ring-[var(--accent)] mb-4"
        />

        <div className="flex gap-1 shrink-0 mb-4 border-b border-[var(--border)]/50 pb-1">
          <button
            type="button"
            role="tab"
            aria-selected={tab === "journal"}
            onClick={() => setTab("journal")}
            className={`flex-1 py-2 text-xs font-medium transition-colors ${tab === "journal" ? "text-[var(--text-primary)] border-b-2 border-[var(--accent)]" : "text-[var(--text-muted)] hover:text-[var(--text-primary)]"}`}
          >
            Journal
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={tab === "window"}
            onClick={() => setTab("window")}
            className={`flex-1 py-2 text-xs font-medium transition-colors ${tab === "window" ? "text-[var(--text-primary)] border-b-2 border-[var(--accent)]" : "text-[var(--text-muted)] hover:text-[var(--text-primary)]"}`}
          >
            Window
          </button>
        </div>

        <div className="flex-1 overflow-y-auto space-y-4">
          {tab === "journal" ? (
            <>
              <p className="text-[11px] font-medium text-[var(--text-muted)] uppercase tracking-wider">
                Default preset for new journals
              </p>
              <div className="space-y-1.5">
                {filteredPresets.length === 0 ? (
                  <p className="text-[11px] text-[var(--text-muted)]">No matching presets</p>
                ) : (
                  filteredPresets.map((preset) => {
                    const active = preset.id === defaultPresetId;
                    return (
                      <button
                        key={preset.id}
                        type="button"
                        onClick={() => handlePresetSelect(preset.id)}
                        className={`flex w-full items-center gap-2.5 px-3 py-2 rounded-lg text-left text-sm transition-colors ${active ? "bg-[var(--accent)]/10 text-[var(--text-primary)] border border-[var(--accent)]/40" : "hover:bg-black/5 dark:hover:bg-white/10 text-[var(--text-muted)]"}`}
                      >
                        <span className="flex-1">
                          <span className="block">{preset.name}</span>
                          <span className="text-[10px] text-[var(--text-muted)]">
                            {preset.builtIn ? "Built-in" : "Custom"} {"·"} {preset.template ? applyPreset(preset.template, today).slice(0, 60) : "(blank)"}
                          </span>
                        </span>
                        {active && <span className="shrink-0 text-[var(--accent)]">✓</span>}
                      </button>
                    );
                  })
                )}
              </div>

              {(() => {
                const userPresets = filteredCustomPresets;
                if (userPresets.length === 0) return null;
                return (
                  <>
                    <p className="text-[11px] font-medium text-[var(--text-muted)] uppercase tracking-wider">
                      Your presets
                    </p>
                    <div className="space-y-2">
                      {userPresets.map((preset) => (
                        <div
                          key={preset.id}
                          className="flex items-center gap-2.5 px-3 py-2 rounded-lg border border-[var(--border)]/50 text-sm"
                        >
                          <span className="flex-1">
                            <span className="block text-[var(--text-primary)]">
                              {preset.name}
                            </span>
                            <span className="text-[10px] text-[var(--text-muted)] truncate">
                              {applyPreset(preset.template, today) || "(blank)"}
                            </span>
                          </span>
                          <button
                            type="button"
                            aria-label={`Delete ${preset.name}`}
                            onClick={() => handleDelete(preset.id)}
                            className="rounded p-1 text-[var(--text-muted)] hover:text-red-500 hover:bg-red-500/10"
                          >
                            <X size={14} />
                          </button>
                        </div>
                      ))}
                    </div>
                  </>
                );
              })()}

              <div className="mt-4 pt-4 border-t border-[var(--border)]/50 space-y-2">
                <p className="text-[11px] font-medium text-[var(--text-muted)] uppercase tracking-wider">
                  Create your own preset
                </p>
                <input
                  ref={nameRef}
                  defaultValue=""
                  onChange={(e) => setCustomName(e.target.value)}
                  placeholder="Preset name (e.g. Gratitude)"
                  className="min-w-0 flex-1 rounded border border-[var(--border)] bg-[var(--code)] px-2.5 py-1.5 text-sm text-[var(--text-primary)] outline-none focus:ring-1 focus:ring-[var(--accent)]"
                />
                <textarea
                  value={customTemplate}
                  onChange={(e) => setCustomTemplate(e.target.value)}
                  placeholder="Use {date} for today's date.

## Grateful for
- "
                  rows={4}
                  className="min-w-0 flex-1 rounded border border-[var(--border)] bg-[var(--code)] px-2.5 py-1.5 text-sm text-[var(--text-primary)] outline-none focus:ring-1 focus:ring-[var(--accent)]"
                />
                {customError && (
                  <p className="text-[10px] text-red-500">{customError}</p>
                )}
                <button
                  type="button"
                  onClick={handleAddCustom}
                  disabled={!customName.trim()}
                  className="flex w-full justify-center gap-1.5 rounded bg-[var(--accent)] px-3 py-1.5 text-xs text-white hover:opacity-90 disabled:opacity-40 disabled:pointer-events-none"
                >
                  <Plus size={14} /> Add preset
                </button>
              </div>

              <div className="mt-4 pt-4 border-t border-[var(--border)]/50 space-y-1">
                <p className="text-[11px] font-medium text-[var(--text-muted)] uppercase tracking-wider">
                  Preview for {today}
                </p>
                <div className="rounded border border-[var(--border)] bg-[var(--code)] p-3 text-[12px] text-[var(--text-primary)] whitespace-pre-wrap break-words max-h-40 overflow-y-auto">
                  {applyPreset(defaultPreset.template, today) || "(empty — start typing)"}
                </div>
                <p className="text-[10px] text-[var(--text-muted)]">
                  {"{date}"} is replaced with today's date when a new journal is created.
                </p>
              </div>
            </>
          ) : (
            <>
              <p className="text-[11px] font-medium text-[var(--text-muted)] uppercase tracking-wider">
                Window
              </p>
              {windowMatches ? (
                <button
                  type="button"
                  onClick={() => onNativeTitlebarChange(!nativeTitlebar)}
                  className="flex w-full items-center justify-between gap-2.5 px-3 py-2 rounded-lg text-left text-sm transition-colors hover:bg-black/5 dark:hover:bg-white/10"
                >
                  <span className="flex-1">
                    <span className="block text-[var(--text-primary)]">Native titlebar</span>
                    <span className="text-[10px] text-[var(--text-muted)]">
                      Use the operating system's title bar instead of Typist's
                    </span>
                  </span>
                  <span className={nativeTitlebar ? "shrink-0 rounded p-1 bg-[var(--accent)] text-white" : "shrink-0 rounded p-1 text-[var(--text-muted)] hover:bg-black/5 dark:hover:bg-white/10"}>
                    {nativeTitlebar ? "✓" : ""}
                  </span>
                </button>
              ) : (
                <p className="text-[11px] text-[var(--text-muted)]">No matching settings</p>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}
