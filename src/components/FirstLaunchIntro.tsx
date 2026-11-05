import { useEffect } from "react";
import { AnimatePresence, motion } from "framer-motion";
import typistLogo from "../../assets/typist.png";

type FirstLaunchIntroProps = { onDismiss?: () => void };

const keybinds = [
  ["⌘ / Ctrl", "B", "Bold"],
  ["⌘ / Ctrl", "K", "Link"],
  ["⌘ / Ctrl", "P", "Find a day"],
];

export function FirstLaunchIntro({ onDismiss }: FirstLaunchIntroProps) {
  const dismiss = () => onDismiss?.();

  useEffect(() => {
    const close = () => dismiss();
    window.addEventListener("keydown", close);
    return () => window.removeEventListener("keydown", close);
  }, []);

  return (
    <AnimatePresence>
      <motion.div role="dialog" aria-modal="true" aria-labelledby="intro-title" className="fixed inset-0 z-50 grid place-items-center bg-black/20 p-6 backdrop-blur-sm" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.18 }} onClick={dismiss}>
        <motion.section className="w-full max-w-md rounded-3xl border border-[var(--border)] bg-[var(--glass)] p-8 shadow-2xl backdrop-blur-xl" initial={{ opacity: 0, scale: 0.98 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.98 }} transition={{ duration: 0.18 }} onClick={(e) => e.stopPropagation()}>
          <div className="mb-5 flex items-center gap-3"><img src={typistLogo} alt="Typist logo" className="h-12 w-12 rounded-2xl object-contain shadow-sm" /><p className="text-sm font-medium text-[var(--accent)]">Welcome to Typist</p></div>
          <h1 id="intro-title" className="text-2xl font-semibold tracking-[-0.02em]">Write without getting in the way.</h1>
          <div className="mt-4 space-y-2 text-sm leading-relaxed text-[var(--text-muted)]">
            <p>This is your journal. Everything stays on this computer.</p>
            <p>Type normally — formatting appears as you write. Files save automatically.</p>
          </div>
          <div className="mt-6 space-y-2">
            {keybinds.map(([mod, key, label]) => (
              <div key={label} className="flex items-center justify-between rounded-xl bg-black/[0.03] px-3 py-2 dark:bg-white/[0.04]">
                <span className="text-sm text-[var(--text-muted)]">{label}</span>
                <span className="flex items-center gap-1.5"><kbd className="rounded-md border border-[var(--border)] bg-white/20 px-2 py-0.5 text-xs dark:bg-white/10">{mod}</kbd><kbd className="rounded-md border border-[var(--border)] bg-white/20 px-2 py-0.5 text-xs dark:bg-white/10">{key}</kbd></span>
              </div>
            ))}
          </div>
          <button onClick={dismiss} className="mt-7 w-full rounded-xl bg-[var(--accent)] px-4 py-2.5 text-sm font-medium text-white transition-opacity hover:opacity-90">Start writing</button>
          <p className="mt-3 text-center text-[11px] text-[var(--text-muted)]">Press any key to dismiss</p>
        </motion.section>
      </motion.div>
    </AnimatePresence>
  );
}
