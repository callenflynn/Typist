const PRESETS_KEY = "typist-journal-presets";
const DEFAULT_PRESET_KEY = "typist-default-journal-preset";

export type JournalPreset = {
  id: string;
  name: string;
  template: string;
  builtIn: boolean;
};

const slug = (name: string): string =>
  name.toLowerCase().trim().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "") || "preset";

export const BUILT_IN: JournalPreset[] = [
  {
    id: "blank",
    name: "Blank",
    template: "",
    builtIn: true,
  },
  {
    id: "daily-log",
    name: "Daily Log",
    template: "# {date}\n\n## What happened\n- \n\n## On my mind\n- ",
    builtIn: true,
  },
  {
    id: "gratitude",
    name: "Gratitude",
    template: "# {date}\n\n## Grateful for\n- \n\n## Today's focus\n- ",
    builtIn: true,
  },
  {
    id: "standup",
    name: "Stand-up",
    template: "# {date}\n\n## Yesterday\n- \n\n## Today\n- \n\n## Blockers\n- ",
    builtIn: true,
  },
];

/** Every preset available to choose from: built-ins plus user-made ones. */
export function allPresets(): JournalPreset[] {
  return [...BUILT_IN, ...customPresets()];
}

/** Presets the user has written themselves. */
export function customPresets(): JournalPreset[] {
  try {
    const raw = localStorage.getItem(PRESETS_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed)) return parsed as JournalPreset[];
  } catch {
    // Local storage may be unavailable or corrupt; treat as no presets.
  }
  return [];
}

export function builtInPresets(): JournalPreset[] {
  return BUILT_IN;
}

/** Persists a custom preset (create or update). */
export function saveCustomPreset(preset: Omit<JournalPreset, "builtIn">): JournalPreset {
  const next = customPresets().filter((p) => p.id !== preset.id);
  const saved: JournalPreset = { ...preset, builtIn: false };
  next.push(saved);
  try {
    localStorage.setItem(PRESETS_KEY, JSON.stringify(next));
  } catch {
    // Storage unavailable; preset is lost on reload but the app still works.
  }
  return saved;
}

/** Removes a custom preset. Resets the default to Blank if it was selected. */
export function deleteCustomPreset(id: string): void {
  const next = customPresets().filter((p) => p.id !== id);
  try {
    localStorage.setItem(PRESETS_KEY, JSON.stringify(next));
  } catch {}
  if (getDefaultPresetId() === id) {
    setDefaultPresetId("blank");
  }
}

export function getDefaultPresetId(): string | undefined {
  try {
    return localStorage.getItem(DEFAULT_PRESET_KEY) || undefined;
  } catch {
    return undefined;
  }
}

export function setDefaultPresetId(id: string): void {
  try {
    localStorage.setItem(DEFAULT_PRESET_KEY, id);
  } catch {}
}

/** The preset used when a new journal is created, falling back to Blank. */
export function resolveDefaultPreset(): JournalPreset {
  const id = getDefaultPresetId();
  const found = id ? allPresets().find((p) => p.id === id) : undefined;
  return (
    found ??
    BUILT_IN.find((p) => p.id === "blank") ??
    BUILT_IN[0]
  );
}

/** Creates a unique id for a new custom preset from its name. */
export function presetId(name: string): string {
  const base = slug(name);
  const taken = new Set([...BUILT_IN, ...customPresets()].map((p) => p.id));
  let id = base;
  let counter = 1;
  while (taken.has(id)) {
    id = `${base}-${counter}`;
    counter += 1;
  }
  return id;
}

/** Replaces `{date}` with the given `YYYY-MM-DD` date in a template. */
export function applyPreset(template: string, date: string): string {
  return template.replace(/\{date\}/g, date);
}