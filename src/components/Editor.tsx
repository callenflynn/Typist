import { Editor, defaultValueCtx, editorViewCtx, rootCtx } from "@milkdown/core";
import { listener, listenerCtx } from "@milkdown/plugin-listener";
import { commonmark } from "@milkdown/preset-commonmark";
import { gfm } from "@milkdown/preset-gfm";
import { useEffect, useRef } from "react";

type EditorProps = {
  /** Markdown for one document. The parent keys the editor per document. */
  initialValue: string;
  onChange: (markdown: string) => void;
};

/**
 * A single Milkdown instance per open document.
 *
 * The editor owns its document while it is mounted; React never pushes new
 * text into a live editor. Switching notes remounts the component with the
 * next document's text, which removes the whole class of "which side is the
 * source of truth" races and keeps the cursor, undo history, and formatting
 * local to the file being edited.
 */
export function MarkdownEditor({ initialValue, onChange }: EditorProps) {
  const rootRef = useRef<HTMLDivElement>(null);
  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;

  useEffect(() => {
    const root = rootRef.current;
    if (!root) return;

    let disposed = false;
    const editor = Editor.make()
      .config((ctx) => {
        ctx.set(rootCtx, root);
        ctx.set(defaultValueCtx, initialValue);
        ctx.get(listenerCtx).markdownUpdated((_, markdown) => {
          if (!disposed) onChangeRef.current(markdown);
        });
      })
      .use(commonmark)
      .use(gfm)
      .use(listener);

    editor
      .create()
      .then(() => {
        if (disposed) {
          void editor.destroy();
          return;
        }
        try {
          editor.ctx.get(editorViewCtx).focus();
        } catch {
          // The view is not ready; the editor stays usable without focus.
        }
      })
      .catch(() => undefined);

    return () => {
      disposed = true;
      void editor.destroy().catch(() => undefined);
    };
  }, [initialValue]);

  return (
    <div
      ref={rootRef}
      aria-label="Markdown document"
      className="markdown-editor text-[var(--text-primary)]"
    />
  );
}
