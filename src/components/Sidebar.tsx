import { ChevronDown, ChevronRight, FileText, Folder, RefreshCw } from "lucide-react";
import { useEffect, useState } from "react";
import { invoke } from "@tauri-apps/api/core";

type TreeEntry = { name: string; path: string; directory: boolean; children?: TreeEntry[] };
type WorkspaceInfo = { root: string; welcome: string };
type SidebarProps = { onSelectFile?: (path: string) => void };
const isTauri = () => Boolean((window as Window & { __TAURI_INTERNALS__?: unknown }).__TAURI_INTERNALS__);

export function Sidebar({ onSelectFile }: SidebarProps) {
  const [entries, setEntries] = useState<TreeEntry[]>([]);
  const [workspace, setWorkspace] = useState<string>();
  const [error, setError] = useState<string>();

  const refresh = (path: string) => invoke<TreeEntry[]>("list_workspace", { path })
    .then(setEntries)
    .catch((reason) => setError(String(reason)));

  useEffect(() => {
    if (!isTauri()) return;
    invoke<WorkspaceInfo>("initialize_workspace")
      .then(({ root, welcome }) => {
        setWorkspace(root);
        onSelectFile?.(welcome);
        return refresh(root);
      })
      .catch((reason) => setError(String(reason)));
  }, [onSelectFile]);

  const markdownEntries = entries.filter((entry) => entry.directory || /\.(md|markdown)$/i.test(entry.name));

  return (
    <aside className="flex h-full w-[220px] shrink-0 flex-col border-r border-[var(--border)] bg-[var(--glass)]">
      <div className="flex h-12 shrink-0 items-center justify-between border-b border-[var(--border)] px-4">
        <span className="text-xs font-semibold uppercase tracking-[0.14em] text-[var(--text-muted)]">Typist</span>
        {workspace && <button aria-label="Refresh files" title="Refresh files" onClick={() => void refresh(workspace)} className="rounded-lg p-1.5 text-[var(--text-muted)] hover:bg-black/5 dark:hover:bg-white/10"><RefreshCw size={14} /></button>}
      </div>
      <div className="flex-1 overflow-auto px-2 py-3">
        <p className="px-2 pb-2 text-[11px] uppercase tracking-[0.12em] text-[var(--text-muted)]">Documents</p>
        {error ? <p className="px-2 py-3 text-xs text-red-500">{error}</p> : markdownEntries.map((entry) => <TreeItem key={entry.path} entry={entry} onSelectFile={onSelectFile} />)}
      </div>
    </aside>
  );
}

function TreeItem({ entry, onSelectFile, depth = 0 }: { entry: TreeEntry; onSelectFile?: (path: string) => void; depth?: number }) {
  const [open, setOpen] = useState(depth < 1);
  const children = entry.children?.filter((child) => child.directory || /\.(md|markdown)$/i.test(child.name));
  return <div>
    <button onClick={() => entry.directory ? setOpen(!open) : onSelectFile?.(entry.path)} className="flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-left text-sm hover:bg-black/5 dark:hover:bg-white/10" style={{ paddingLeft: 8 + depth * 14 }}>
      {entry.directory ? (open ? <ChevronDown size={14} /> : <ChevronRight size={14} />) : <span className="w-3.5" />}
      {entry.directory ? <Folder size={15} className="text-[var(--accent)]" /> : <FileText size={15} className="text-[var(--text-muted)]" />}
      <span className="truncate">{entry.name}</span>
    </button>
    {entry.directory && open && children?.map((child) => <TreeItem key={child.path} entry={child} depth={depth + 1} onSelectFile={onSelectFile} />)}
  </div>;
}
