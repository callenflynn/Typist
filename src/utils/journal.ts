type JournalDay = { path: string; date: string };
type TreeEntry = { name: string; path: string; directory: boolean; children?: TreeEntry[] };

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

/** Case-insensitive subsequence fuzzy score. Returns a score (higher = better) or null. */
export function fuzzyScore(query: string, target: string): number | null {
  const q = query.toLowerCase().trim();
  if (!q) return 0;
  const t = target.toLowerCase();
  let score = 0;
  let qi = 0;
  let last = -1;
  for (let ti = 0; ti < t.length && qi < q.length; ti++) {
    if (t[ti] === q[qi]) {
      const gap = ti - last - 1;
      // reward adjacency and word boundaries
      score += 10 - Math.min(gap, 6);
      if (ti === 0 || /[\s\-_/]/.test(t[ti - 1])) score += 6;
      last = ti;
      qi++;
    }
  }
  if (qi !== q.length) return null;
  return score;
}

export function fuzzyFilter<T>(query: string, items: T[], getText: (item: T) => string): T[] {
  if (!query.trim()) return [...items];
  return items
    .map((item) => ({ item, s: fuzzyScore(query, getText(item)) }))
    .filter((x) => x.s !== null)
    .sort((a, b) => (b.s ?? 0) - (a.s ?? 0))
    .map((x) => x.item);
}

export function isJournalFile(name: string): boolean {
  return DATE_RE.test(name.replace(/\.md$/i, ""));
}

export function groupJournalDays(days: JournalDay[]): { month: string; days: JournalDay[] }[] {
  const groups = new Map<string, JournalDay[]>();
  for (const day of days) {
    const month = day.date.slice(0, 7);
    if (!groups.has(month)) groups.set(month, []);
    groups.get(month)!.push(day);
  }
  return [...groups.entries()]
    .sort((a, b) => b[0].localeCompare(a[0]))
    .map(([month, list]) => ({
      month,
      days: list.sort((a, b) => b.date.localeCompare(a.date)),
    }));
}

export function monthLabel(ym: string): string {
  const [y, m] = ym.split("-").map(Number);
  const d = new Date(y, (m ?? 1) - 1, 1);
  return d.toLocaleString(undefined, { month: "long", year: "numeric" });
}

export function dayLabel(date: string, today: string): string {
  if (date === today) return "Today";
  const d = new Date(`${date}T12:00:00`);
  return d.toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric" });
}

export function fullDateLabel(date: string): string {
  const d = new Date(`${date}T12:00:00`);
  return d.toLocaleDateString(undefined, { weekday: "long", month: "long", day: "numeric" });
}

export function flattenNotes(entries: TreeEntry[]): TreeEntry[] {
  const flat: TreeEntry[] = [];
  const walk = (list: TreeEntry[]) => {
    for (const entry of list) {
      if (!entry.directory && /\.(md|markdown)$/i.test(entry.name) && !isJournalFile(entry.name)) flat.push(entry);
      if (entry.children) walk(entry.children);
    }
  };
  walk(entries);
  return flat.sort((a, b) => a.name.localeCompare(b.name));
}

export function looksLikeJournalName(name: string): boolean {
  return isJournalFile(name);
}
