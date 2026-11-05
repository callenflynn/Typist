import { describe, expect, test } from "bun:test";
import { createSaveQueue, type SaveState } from "../src/lib/saveQueue";

type Write = [path: string, contents: string];

function recorder() {
  const writes: Write[] = [];
  const states: [SaveState, string][] = [];
  let gate: Promise<void> | undefined;
  let release: (() => void) | undefined;

  const block = () => {
    gate = new Promise<void>((resolve) => {
      release = resolve;
    });
  };

  const write = async (path: string, contents: string) => {
    writes.push([path, contents]);
    if (gate) await gate;
  };

  const unblock = () => {
    release?.();
    gate = undefined;
  };

  return {
    writes,
    states,
    write,
    block,
    unblock,
    onState: (state: SaveState, path: string) => states.push([state, path]),
  };
}

describe("save queue", () => {
  test("writes queued edits in order", async () => {
    const harness = recorder();
    harness.block();
    const queue = createSaveQueue(harness.write, harness.onState);

    queue.enqueue("note.md", "one");
    queue.enqueue("note.md", "two");
    expect(harness.writes).toEqual([["note.md", "one"]]);

    harness.unblock();
    expect(await queue.flush()).toBe(true);
    expect(harness.writes).toEqual([
      ["note.md", "one"],
      ["note.md", "two"],
    ]);
  });

  test("an older save can never land after a newer one", async () => {
    const harness = recorder();
    harness.block();
    const queue = createSaveQueue(harness.write, harness.onState);

    queue.enqueue("note.md", "first");
    queue.enqueue("note.md", "second");
    queue.enqueue("note.md", "third");
    harness.unblock();
    await queue.flush();

    const latest = harness.writes.at(-1)!;
    expect(latest).toEqual(["note.md", "third"]);
    expect(harness.writes.filter(([, text]) => text === "third")).toHaveLength(1);
  });

  test("keeps separate documents apart across rapid switching", async () => {
    const harness = recorder();
    harness.block();
    const queue = createSaveQueue(harness.write, harness.onState);

    queue.enqueue("a.md", "alpha");
    queue.enqueue("b.md", "beta");
    harness.unblock();
    await queue.flush();

    expect(harness.writes).toContainEqual(["a.md", "alpha"]);
    expect(harness.writes).toContainEqual(["b.md", "beta"]);
    expect(queue.pending()).toBe(false);
  });

  test("reports saved only after every write succeeded", async () => {
    const harness = recorder();
    const queue = createSaveQueue(harness.write, harness.onState);

    queue.enqueue("note.md", "text");
    await queue.flush();

    expect(harness.states).toEqual([
      ["pending", "note.md"],
      ["saving", "note.md"],
      ["saved", "note.md"],
    ]);
  });

  test("keeps the text and reports an error when a write fails", async () => {
    const writes: Write[] = [];
    let attempts = 0;
    const states: [SaveState, string][] = [];
    const queue = createSaveQueue(
      async (path, contents) => {
        attempts += 1;
        if (attempts === 1) throw new Error("disk full");
        writes.push([path, contents]);
      },
      (state, path) => states.push([state, path]),
    );

    queue.enqueue("note.md", "precious");
    expect(await queue.flush()).toBe(false);
    expect(states).toContainEqual(["error", "note.md"]);
    expect(queue.pending("note.md")).toBe(true);

    queue.enqueue("note.md", "precious");
    expect(await queue.flush()).toBe(true);
    expect(writes).toEqual([["note.md", "precious"]]);
  });

  test("does not drop text enqueued while a failed write was in flight", async () => {
    const writes: Write[] = [];
    const queue = createSaveQueue(async (path, contents) => {
      writes.push([path, contents]);
      if (contents === "first") throw new Error("write failed");
    });

    queue.enqueue("note.md", "first");
    queue.enqueue("note.md", "second");
    await queue.flush();

    expect(writes.at(-1)).toEqual(["note.md", "second"]);
    expect(queue.pending()).toBe(false);
  });
});
