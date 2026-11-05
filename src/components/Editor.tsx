import { Editor, rootCtx, defaultValueCtx, editorViewCtx, parserCtx, commandsCtx } from "@milkdown/core";
import { commonmark } from "@milkdown/preset-commonmark";
import { gfm } from "@milkdown/preset-gfm";
import { listener, listenerCtx } from "@milkdown/plugin-listener";
import { $shortcut } from "@milkdown/utils";
import { $prose } from "@milkdown/utils";
import type { Ctx } from "@milkdown/ctx";
import { Plugin as ProsePlugin, PluginKey, TextSelection } from "@milkdown/prose/state";
import type { EditorView } from "@milkdown/prose/view";
import { useEffect, useRef, useState } from "react";
import { Bold, Italic, Code2, Link2, Quote, List, Heading1, Heading2, Heading3, CheckSquare, Code, Minus, Image } from "lucide-react";

type EditorProps = { value: string; onChange: (markdown: string) => void };
type MenuState = { top: number; left: number; index: number } | null;
type ToolbarState = { top: number; left: number } | null;

const SLASH_ITEMS = [
  { label: "Heading 1", icon: Heading1, action: "h1" },
  { label: "Heading 2", icon: Heading2, action: "h2" },
  { label: "Heading 3", icon: Heading3, action: "h3" },
  { label: "Task list", icon: CheckSquare, action: "task" },
  { label: "Bullet list", icon: List, action: "list" },
  { label: "Blockquote", icon: Quote, action: "quote" },
  { label: "Code block", icon: Code, action: "code" },
  { label: "Divider", icon: Minus, action: "hr" },
  { label: "Link", icon: Link2, action: "link" },
  { label: "Image", icon: Image, action: "image" },
] as const;

type SlashAction = (typeof SLASH_ITEMS)[number]["action"];

const shortcuts = $shortcut((ctx: Ctx) => {
  const commands = ctx.get(commandsCtx);
  return {
    "Mod-k": () => commands.call("ToggleLink", {}),
    "Mod-Shift-x": () => commands.call("ToggleStrikeThrough"),
  };
});

export function MarkdownEditor({ value, onChange }: EditorProps) {
  const rootRef = useRef<HTMLDivElement>(null);
  const editorRef = useRef<Editor | null>(null);
  const lastValueRef = useRef(value);
  const valueRef = useRef(value);
  const onChangeRef = useRef(onChange);
  const [menu, setMenu] = useState<MenuState>(null);
  const [toolbar, setToolbar] = useState<ToolbarState>(null);
  const menuRef = useRef<MenuState>(null);
  const toolbarRef = useRef<ToolbarState>(null);
  const mouseSelectRef = useRef(false);
  const runRef = useRef<(action: SlashAction) => void>(() => undefined);
  valueRef.current = value;
  onChangeRef.current = onChange;
  menuRef.current = menu;
  toolbarRef.current = toolbar;

  const syncEditor = (editor: Editor, nextValue: string) => {
    try {
      const view = editor.ctx.get(editorViewCtx);
      const next = editor.ctx.get(parserCtx)(nextValue);
      if (next && view.state.doc.textContent !== next.textContent) {
        view.dispatch(view.state.tr.replaceWith(0, view.state.doc.content.size, next.content));
      }
      lastValueRef.current = nextValue;
    } catch {
      // Milkdown may still be initializing; the create callback will retry.
    }
  };

  const dispatch = (cmdLiteral: string, arg?: unknown) => {
    const editor = editorRef.current;
    if (!editor) return;
    try {
      editor.ctx.get(commandsCtx).call(cmdLiteral, arg);
    } catch {
      // unavailable command; no-op
    }
  };

  const runAction = (action: SlashAction) => {
    const cmdMap: Record<SlashAction, () => void> = {
      h1: () => dispatch("WrapInHeading", 1),
      h2: () => dispatch("WrapInHeading", 2),
      h3: () => dispatch("WrapInHeading", 3),
      task: () => {
        const editor = editorRef.current;
        if (!editor) return;
        const view = editor.ctx.get(editorViewCtx);
        view.dispatch(view.state.tr.insertText("- [ ] "));
      },
      list: () => dispatch("WrapInBulletList"),
      quote: () => dispatch("WrapInBlockquote"),
      code: () => dispatch("CreateCodeBlock", ""),
      hr: () => dispatch("InsertHr"),
      link: () => dispatch("ToggleLink", {}),
      image: () => dispatch("InsertImage", { src: "", alt: "", title: "" }),
    };
    cmdMap[action]();
  };
  runRef.current = runAction;

  useEffect(() => {
    if (!rootRef.current) return;
    const root = rootRef.current;

    const interactionPlugin = $prose(() => new ProsePlugin({
      props: {
        handleDOMEvents: {
          mousedown(_v, e) {
            mouseSelectRef.current = true;
            if (menuRef.current) setMenu(null);
            return false;
          },
          mouseup() {
            mouseSelectRef.current = false;
            return false;
          },
          keydown() {
            if (toolbarRef.current) setToolbar(null);
            if (menuRef.current) setMenu(null);
            return false;
          },
          focus() {
            if (toolbarRef.current) setToolbar(null);
            return false;
          },
        },
        handleTextInput(view, _from, _to, text) {
          if (text !== "/") return false;
          const pos = view.state.selection.from;
          if (pos <= 1) return false;
          const $pos = view.state.doc.resolve(pos);
          const textBefore = $pos.parent.textBetween(0, $pos.parent.content.size) ?? "";
          // "/" is the only char on an empty line
          const lineBefore = textBefore.slice(0, $pos.parentOffset);
          if (lineBefore.trim() === "") {
            const coords = view.coordsAtPos(pos);
            const rect = root.getBoundingClientRect();
            setMenu({
              top: coords.bottom - rect.top + root.scrollTop + 6,
              left: coords.left - rect.left + root.scrollLeft,
              index: 0,
            });
            return true;
          }
          return false;
        },
      },
      view(editorView) {
        const update = () => {
          const sel = editorView.state.selection;
          const isSel = sel instanceof TextSelection && sel.to > sel.from;
          if (isSel && mouseSelectRef.current) {
            const coords = editorView.coordsAtPos(sel.from);
            const rect = root.getBoundingClientRect();
            const next = { top: coords.top - rect.top + root.scrollTop, left: coords.left - rect.left + root.scrollLeft };
            if (!toolbarRef.current || Math.abs(toolbarRef.current.top - next.top) > 2 || Math.abs(toolbarRef.current.left - next.left) > 2) {
              setToolbar(next);
            }
          } else if (toolbarRef.current && !isSel) {
            setToolbar(null);
          }
        };
        const timer = setTimeout(update, 0);
        return { update, destroy: () => { clearTimeout(timer); setToolbar(null); } };
      },
    }));

    const slashKeymap = $shortcut(() => ({
      ArrowDown: {
        key: "ArrowDown",
        priority: 100,
        onRun: () => () => {
          if (menuRef.current) { const m = menuRef.current; setMenu({ ...m, index: (m.index + 1) % SLASH_ITEMS.length }); return true; }
          return false;
        },
      },
      ArrowUp: {
        key: "ArrowUp",
        priority: 100,
        onRun: () => () => {
          if (menuRef.current) { const m = menuRef.current; setMenu({ ...m, index: (m.index - 1 + SLASH_ITEMS.length) % SLASH_ITEMS.length }); return true; }
          return false;
        },
      },
      Enter: {
        key: "Enter",
        priority: 100,
        onRun: () => () => {
          if (menuRef.current) {
            const m = menuRef.current;
            const editor = editorRef.current;
            if (editor) {
              const view = editor.ctx.get(editorViewCtx);
              const { state, dispatch: d } = view;
              const tr = state.tr.delete(state.selection.from - 1, state.selection.from);
              d(tr);
            }
            runRef.current(SLASH_ITEMS[m.index].action);
            setMenu(null);
            return true;
          }
          return false;
        },
      },
      Escape: {
        key: "Escape",
        priority: 100,
        onRun: () => () => {
          if (menuRef.current) { setMenu(null); return true; }
          return false;
        },
      },
    }));

    const editor = Editor.make()
      .config((ctx) => {
        ctx.set(rootCtx, rootRef.current);
        ctx.set(defaultValueCtx, value);
        ctx.get(listenerCtx).markdownUpdated((_, markdown) => {
          lastValueRef.current = markdown;
          onChangeRef.current(markdown);
        });
      })
      .use(commonmark)
      .use(gfm)
      .use(listener)
      .use(shortcuts)
      .use(interactionPlugin)
      .use(slashKeymap);

    editorRef.current = editor;
    editor.create().then(() => syncEditor(editor, valueRef.current)).catch(() => undefined);
    return () => {
      editor.destroy().catch(() => undefined);
      editorRef.current = null;
    };
  }, []);

  useEffect(() => {
    const editor = editorRef.current;
    if (!editor || value === lastValueRef.current) return;
    syncEditor(editor, value);
  }, [value]);

  const tool = (identity: string, label: string, Icon: typeof Bold, literal: string, arg?: unknown) => (
    <button key={identity} aria-label={label} title={label} onMouseDown={(e) => { e.preventDefault(); dispatch(literal, arg); }} className="rounded-md p-1.5 hover:bg-black/5 dark:hover:bg-white/10">
      <Icon size={15} />
    </button>
  );

  return (
    <div className="relative min-h-0 flex-1">
      <div ref={rootRef} aria-label="Markdown document" className="markdown-editor min-h-full px-6 py-12" />

      {toolbar && (
        <div className="absolute z-20 flex -translate-x-1/2 -translate-y-full items-center gap-1 rounded-xl border border-[var(--border)] bg-[var(--glass)] p-1 shadow-lg backdrop-blur-xl" style={{ top: toolbar.top - 8, left: toolbar.left }}>
          {tool("b", "Bold", Bold, "ToggleStrong")}
          {tool("i", "Italic", Italic, "ToggleEmphasis")}
          {tool("c", "Code", Code2, "ToggleInlineCode")}
          {tool("l", "Link", Link2, "ToggleLink", {})}
          {tool("q", "Quote", Quote, "WrapInBlockquote")}
          {tool("u", "Bullet list", List, "WrapInBulletList")}
        </div>
      )}

      {menu && (
        <div className="absolute z-30 w-56 overflow-hidden rounded-2xl border border-[var(--border)] bg-[var(--glass)] p-1 shadow-xl backdrop-blur-xl" style={{ top: menu.top, left: menu.left }} onMouseDown={(e) => e.preventDefault()}>
          {SLASH_ITEMS.map((item, i) => (
            <button key={item.label} onMouseEnter={() => setMenu({ ...menu!, index: i })} onClick={() => {
              const editor = editorRef.current;
              if (editor) {
                const view = editor.ctx.get(editorViewCtx);
                const { state, dispatch: d } = view;
                const tr = state.tr.delete(state.selection.from - 1, state.selection.from);
                d(tr);
              }
              runRef.current(item.action);
              setMenu(null);
            }} className={`flex w-full items-center gap-2 rounded-xl px-3 py-2 text-left text-sm ${i === menu.index ? "bg-[var(--accent)]/10 text-[var(--text-primary)]" : "text-[var(--text-muted)] hover:bg-black/5 dark:hover:bg-white/10"}`}>
              <item.icon size={15} />
              {item.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
