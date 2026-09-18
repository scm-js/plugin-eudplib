import { describe, expect, it } from "vitest";
import { Contributions, mergeInputs } from "../src/contributions";
import type { EudplibBuildEvent, EudplibBuildRequest, EudplibContribution } from "../contract";

const MAP = new Uint8Array([1, 2, 3]);
const contribution = (id: string, over: Partial<EudplibContribution> = {}): EudplibContribution => ({
  id, label: id.toUpperCase(), applies: () => true,
  collect: async () => ({ plugins: { [id]: { ir: `/work/files/${id}.json` } }, sources: { [id]: `# ${id}` }, files: { [`${id}.json`]: "{}" } }),
  ...over,
});
/** A build that records what it was asked and answers a map naming the plugins it got. */
function builder() {
  const requests: EudplibBuildRequest[] = [];
  const reasons: (string | undefined)[] = [];
  const build = async (request: EudplibBuildRequest, opts: { onLog?: (line: string) => void; reason?: string }) => {
    requests.push(request); reasons.push(opts.reason);
    opts.onLog?.("building");
    return { map: new Uint8Array([9]), log: "building", chkBytes: 1, ms: 5 };
  };
  return { requests, reasons, build };
}
const run = (c: Contributions, b: ReturnType<typeof builder>) => c.run({ map: MAP, purpose: "save", signal: new AbortController().signal }, b.build, (labels) => `${labels} needs it`);

describe("Contributions", () => {
  it("builds once with everything that applies, in the order it was contributed", async () => {
    const c = new Contributions();
    c.add(contribution("trigscript"));
    c.add(contribution("magenta"));
    c.add(contribution("idle", { applies: () => false }));
    c.add(contribution("broken", { applies: () => { throw new Error("no"); } }));
    const b = builder();
    expect(await run(c, b)).toEqual(new Uint8Array([9]));
    expect(b.requests).toHaveLength(1);
    expect(b.requests[0].map).toBe(MAP);
    expect(Object.keys(b.requests[0].plugins)).toEqual(["trigscript", "magenta"]);
    expect(Object.keys(b.requests[0].files!)).toEqual(["trigscript.json", "magenta.json"]);
    expect(b.reasons).toEqual(["TRIGSCRIPT, MAGENTA needs it"]);
  });

  it("applies only while something does, and a disposed or replaced contribution is gone", () => {
    const c = new Contributions();
    expect(c.applying()).toEqual([]);
    const first = c.add(contribution("a", { applies: () => false }));
    expect(c.applying()).toEqual([]);
    c.add(contribution("a"));
    expect(c.applying().map((x) => x.id)).toEqual(["a"]);
    first.dispose(); // the replaced one: nothing to take out
    expect(c.applying()).toHaveLength(1);
  });

  it("names the contribution whose collect failed, and builds nothing", async () => {
    const c = new Contributions();
    c.add(contribution("trigscript", { label: "TrigScript", collect: async () => { throw new Error("main.ts:3 — no such unit"); } }));
    const events: EudplibBuildEvent[] = [];
    c.onBuild((e) => events.push(e));
    const b = builder();
    await expect(run(c, b)).rejects.toThrow("TrigScript: main.ts:3 — no such unit");
    expect(b.requests).toEqual([]);
    expect(events.at(-1)).toMatchObject({ kind: "failed", from: "trigscript", message: "main.ts:3 — no such unit" });
  });

  it("tells listeners how a build went, the log included", async () => {
    const c = new Contributions();
    c.add(contribution("a"));
    const events: EudplibBuildEvent[] = [];
    const sub = c.onBuild((e) => events.push(e));
    await run(c, builder());
    expect(events.map((e) => e.kind)).toEqual(["start", "log", "done"]);
    expect(events[2]).toMatchObject({ contributors: ["a"], chkBytes: 1, ms: 5 });
    await expect(run(c, { ...builder(), build: async () => { throw new Error("eudplib said no"); } })).rejects.toThrow("eudplib said no");
    expect(events.at(-1)).toMatchObject({ kind: "failed", from: null, message: "eudplib said no" });
    sub.dispose();
    const n = events.length;
    await run(c, builder());
    expect(events).toHaveLength(n);
  });
});

describe("mergeInputs", () => {
  const from = (label: string) => ({ id: label, label });
  it("lets two contributions ask for the same bundled plugin the same way", () => {
    const merged = mergeInputs([
      { from: from("A"), input: { plugins: { eudTurbo: {}, a: { k: 1 } } } },
      { from: from("B"), input: { plugins: { eudTurbo: {}, b: { k: 2 } } } },
    ]);
    expect(Object.keys(merged.plugins)).toEqual(["eudTurbo", "a", "b"]);
  });
  it("refuses two different things under one name, and says who", () => {
    expect(() => mergeInputs([
      { from: from("A"), input: { plugins: { a: {} }, files: { "ir.json": "1" } } },
      { from: from("B"), input: { plugins: { b: {} }, files: { "ir.json": "2" } } },
    ])).toThrow(/A and B both bring 'ir.json'/);
    expect(() => mergeInputs([{ from: from("A"), input: {} as never }])).toThrow(/A brought nothing/);
  });
});
