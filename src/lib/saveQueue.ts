export type SaveState = "pending" | "saving" | "saved" | "error";

export type SaveWriter = (path: string, contents: string) => Promise<void>;

export type SaveQueue = {
  enqueue: (path: string, contents: string) => void;
  flush: () => Promise<boolean>;
  pending: (path?: string) => boolean;
};

/**
 * Serialises writes so a slower, older save can never land after a newer one.
 *
 * Only one write is in flight at a time. Each path keeps at most one queued
 * version of its contents, so rapid edits collapse to the latest text and
 * switching documents cannot interleave writes. A failed write stays queued
 * (unless a newer version replaced it) and is retried by the next enqueue or
 * flush, while the caller keeps the text in memory.
 */
export function createSaveQueue(
  write: SaveWriter,
  onState: (state: SaveState, path: string) => void = () => {},
): SaveQueue {
  const queued = new Map<string, string>();
  let running: Promise<void> | undefined;
  let failed = false;

  async function drain(): Promise<void> {
    while (queued.size > 0) {
      const [path, contents] = queued.entries().next().value as [string, string];
      queued.delete(path);
      onState("saving", path);

      try {
        await write(path, contents);
        failed = false;
      } catch {
        failed = true;
        onState("error", path);
        // A newer edit for this note is already queued; try that one instead of
        // stopping on stale text. Otherwise keep the failed text for a retry.
        if (queued.has(path)) continue;
        queued.set(path, contents);
        return;
      }

      onState(queued.size > 0 ? "pending" : "saved", path);
    }
  }

  function start(): Promise<void> {
    running ??= drain().finally(() => {
      running = undefined;
    });
    return running;
  }

  return {
    enqueue(path, contents) {
      failed = false;
      queued.set(path, contents);
      onState("pending", path);
      void start();
    },

    async flush() {
      await start();
      while (queued.size > 0 && !failed) await start();
      return queued.size === 0 && !failed;
    },

    pending(path) {
      return path ? queued.has(path) : queued.size > 0;
    },
  };
}
