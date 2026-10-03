import { Editor, rootCtx, defaultValueCtx, editorViewCtx, parserCtx } from "@milkdown/core";
import { commonmark } from "@milkdown/preset-commonmark";
import { gfm } from "@milkdown/preset-gfm";
import { listener, listenerCtx } from "@milkdown/plugin-listener";
import { useEffect, useRef } from "react";

type EditorProps = { value: string; onChange: (markdown: string) => void };

export function MarkdownEditor({ value, onChange }: EditorProps) {
  const rootRef = useRef<HTMLDivElement>(null);
  const editorRef = useRef<Editor | null>(null);
  const lastValueRef = useRef(value);
  const valueRef = useRef(value);
  const onChangeRef = useRef(onChange);
  valueRef.current = value;
  onChangeRef.current = onChange;

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

  useEffect(() => {
    if (!rootRef.current) return;
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
      .use(listener);
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

  return <div ref={rootRef} aria-label="Markdown document" className="markdown-editor mx-auto min-h-0 w-full max-w-3xl flex-1 overflow-auto px-6 py-12" />;
}
