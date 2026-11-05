import {
  ChevronDown,
  ChevronRight,
  FilePlus2,
  FileText,
  Folder,
  FolderPlus,
  Pencil,
  RefreshCw,
  Trash2,
} from "lucide-react";
import { useEffect, useState } from "react";
import type { TreeEntry } from "../lib/notes";
import { basename, dirname } from "../lib/paths";

type SidebarProps = {
  root?: string;
  entries: TreeEntry[];
  activePath?: string;
  onOpen: (path: string) => void;
  onCreate: (kind: "note" | "folder", directory: string) => Promise<unknown>;
  onRename: (path: string, name: string) => Promise<unknown>;
  onDelete: (path: string) => Promise<unknown>;
  onRefresh: () => void;
};

type RowContext = {
  activePath?: string;
  target?: string;
  renaming?: { path: string; value: string };
  confirming?: string;
  onOpen: (path: string) => void;
  onTarget: (path: string) => void;
  onRenameStart: (entry: TreeEntry) => void;
  onRenameChange: (value: string) => void;
  onRenameCommit: () => void;
  onRenameCancel: () => void;
  onDeleteStart: (path: string) => void;
  onDeleteConfirm: (path: string) => void;
  onDeleteCancel: () => void;
};

function errorText(reason: unknown): string {
  if (typeof reason === "string") return reason;
  if (reason instanceof Error) return reason.message;
  return "Something went wrong.";
}

const noteName = (name: string) => name.replace(/\.md$/i, "");

function treeHas(entries: TreeEntry[], path: string): boolean {
  return entries.some(
    (entry) => entry.path === path || (entry.children ? treeHas(entry.children, path) : false),
  );
}

export function Sidebar({
  root,
  entries,
  activePath,
  onOpen,
  onCreate,
  onRename,
  onDelete,
  onRefresh,
}: SidebarProps) {
  const [target, setTarget] = useState(root);
  const [renaming, setRenaming] = useState<{ path: string; value: string }>();
  const [confirming, setConfirming] = useState<string>();
  const [error, setError] = useState<string>();
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    setTarget(root);
  }, [root]);

  useEffect(() => {
    if (activePath) setTarget(dirname(activePath));
  }, [activePath]);

  // A folder can be renamed or removed outside the app; never create into a
  // directory that no longer appears in the tree.
  useEffect(() => {
    if (!target || !root || target === root || entries.length === 0) return;
    if (!treeHas(entries, target)) setTarget(root);
  }, [entries, root, target]);

  const create = async (kind: "note" | "folder") => {
    if (!target || busy) return;
    setBusy(true);
    setError(undefined);
    try {
      await onCreate(kind, target);
    } catch (reason) {
      setError(errorText(reason));
    } finally {
      setBusy(false);
    }
  };

  const commitRename = async () => {
    if (!renaming) return;
    const { path, value } = renaming;
    setRenaming(undefined);
    setError(undefined);
    const trimmed = value.trim();
    if (!trimmed || trimmed === noteName(basename(path))) return;
    try {
      await onRename(path, trimmed);
    } catch (reason) {
      setError(errorText(reason));
    }
  };

  const commitDelete = async (path: string) => {
    setConfirming(undefined);
    setError(undefined);
    try {
      await onDelete(path);
    } catch (reason) {
      setError(errorText(reason));
    }
  };

  const ctx: RowContext = {
    activePath,
    target,
    renaming,
    confirming,
    onOpen,
    onTarget: setTarget,
    onRenameStart: (entry) => {
      setConfirming(undefined);
      setRenaming({
        path: entry.path,
        value: entry.directory ? entry.name : noteName(entry.name),
      });
    },
    onRenameChange: (value) =>
      setRenaming((current) => (current ? { ...current, value } : current)),
    onRenameCommit: () => void commitRename(),
    onRenameCancel: () => setRenaming(undefined),
    onDeleteStart: (path) => {
      setRenaming(undefined);
      setConfirming(path);
    },
    onDeleteConfirm: (path) => void commitDelete(path),
    onDeleteCancel: () => setConfirming(undefined),
  };

  return (
    <aside className="flex h-full w-[228px] shrink-0 flex-col border-r border-[var(--border)] bg-[var(--glass)]">
      <div className="flex h-9 shrink-0 items-center gap-0.5 border-b border-[var(--border)] px-1.5">
        <button
          type="button"
          aria-label="New note"
          title="New note"
          disabled={busy}
          onClick={() => void create("note")}
          className="rounded-md p-1.5 text-[var(--text-muted)] hover:bg-black/5 hover:text-[var(--text-primary)] disabled:opacity-40 dark:hover:bg-white/10"
        >
          <FilePlus2 size={15} />
        </button>
        <button
          type="button"
          aria-label="New folder"
          title="New folder"
          disabled={busy}
          onClick={() => void create("folder")}
          className="rounded-md p-1.5 text-[var(--text-muted)] hover:bg-black/5 hover:text-[var(--text-primary)] disabled:opacity-40 dark:hover:bg-white/10"
        >
          <FolderPlus size={15} />
        </button>
        <span className="flex-1" />
        <button
          type="button"
          aria-label="Refresh files"
          title="Refresh files"
          onClick={onRefresh}
          className="rounded-md p-1.5 text-[var(--text-muted)] hover:bg-black/5 hover:text-[var(--text-primary)] dark:hover:bg-white/10"
        >
          <RefreshCw size={14} />
        </button>
      </div>

      <div
        className="min-h-0 flex-1 overflow-auto px-1.5 py-2"
        onClick={(event) => {
          if (event.target === event.currentTarget) setTarget(root);
        }}
      >
        {entries.map((entry) => (
          <TreeRow key={entry.path} entry={entry} ctx={ctx} />
        ))}
        {entries.length === 0 && (
          <p className="px-2 py-1.5 text-xs text-[var(--text-muted)]">No notes yet.</p>
        )}
      </div>

      {error && (
        <p
          role="alert"
          className="border-t border-[var(--border)] px-2.5 py-1.5 text-[11px] leading-4 text-red-500"
        >
          {error}
        </p>
      )}
    </aside>
  );
}

function TreeRow({
  entry,
  depth = 0,
  ctx,
}: {
  entry: TreeEntry;
  depth?: number;
  ctx: RowContext;
}) {
  const [open, setOpen] = useState(depth === 0 && entry.directory);
  const active = !entry.directory && entry.path === ctx.activePath;
  const target = entry.directory && entry.path === ctx.target;
  const renaming = ctx.renaming?.path === entry.path;
  const confirming = ctx.confirming === entry.path;
  const label = entry.directory ? entry.name : noteName(entry.name);

  return (
    <div>
      <div
        className={`group flex items-center gap-1 rounded-md pr-1 ${
          active ? "tree-active" : target ? "tree-target" : "hover:bg-black/5 dark:hover:bg-white/10"
        }`}
        style={{ paddingLeft: 4 + depth * 12 }}
      >
        {renaming ? (
          <input
            autoFocus
            value={ctx.renaming?.value ?? ""}
            onChange={(event) => ctx.onRenameChange(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter") {
                event.preventDefault();
                ctx.onRenameCommit();
              } else if (event.key === "Escape") {
                event.preventDefault();
                ctx.onRenameCancel();
              }
            }}
            onBlur={ctx.onRenameCancel}
            aria-label={`Rename ${label}`}
            className="my-0.5 min-w-0 flex-1 rounded border border-[var(--accent)] bg-[var(--canvas)] px-1.5 py-0.5 text-[13px] outline-none"
          />
        ) : confirming ? (
          <div className="flex min-w-0 flex-1 items-center gap-1 py-1 text-xs">
            <span className="min-w-0 flex-1 truncate text-[var(--text-muted)]">
              Delete {label}
              {entry.directory ? " and its notes" : ""}?
            </span>
            <button
              type="button"
              onClick={() => ctx.onDeleteConfirm(entry.path)}
              className="rounded px-1.5 py-0.5 font-medium text-red-500 hover:bg-red-500/10"
            >
              Delete
            </button>
            <button
              type="button"
              onClick={ctx.onDeleteCancel}
              className="rounded px-1.5 py-0.5 text-[var(--text-muted)] hover:bg-black/5"
            >
              Cancel
            </button>
          </div>
        ) : (
          <>
            <button
              type="button"
              title={entry.path}
              onClick={() => {
                if (entry.directory) {
                  setOpen((value) => !value);
                  ctx.onTarget(entry.path);
                } else {
                  ctx.onOpen(entry.path);
                }
              }}
              className="flex min-w-0 flex-1 items-center gap-1.5 py-1 text-left text-[13px]"
            >
              {entry.directory ? (
                open ? (
                  <ChevronDown size={13} className="shrink-0 text-[var(--text-muted)]" />
                ) : (
                  <ChevronRight size={13} className="shrink-0 text-[var(--text-muted)]" />
                )
              ) : (
                <span className="w-[13px] shrink-0" />
              )}
              {entry.directory ? (
                <Folder size={14} className="shrink-0 text-[var(--accent)]" />
              ) : (
                <FileText size={14} className="shrink-0 text-[var(--text-muted)]" />
              )}
              <span className={`truncate ${active ? "font-medium" : ""}`}>{label}</span>
            </button>

            <div className="flex shrink-0 items-center opacity-0 transition-opacity focus-within:opacity-100 group-hover:opacity-100">
              <button
                type="button"
                aria-label={`Rename ${label}`}
                title="Rename"
                onClick={() => ctx.onRenameStart(entry)}
                className="rounded p-1 text-[var(--text-muted)] hover:bg-black/5 dark:hover:bg-white/10"
              >
                <Pencil size={12} />
              </button>
              <button
                type="button"
                aria-label={`Delete ${label}`}
                title="Delete"
                onClick={() => ctx.onDeleteStart(entry.path)}
                className="rounded p-1 text-[var(--text-muted)] hover:bg-red-500/10 hover:text-red-500"
              >
                <Trash2 size={12} />
              </button>
            </div>
          </>
        )}
      </div>

      {entry.directory &&
        open &&
        entry.children?.map((child) => (
          <TreeRow key={child.path} entry={child} depth={depth + 1} ctx={ctx} />
        ))}
    </div>
  );
}
