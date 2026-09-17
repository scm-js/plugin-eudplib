/**
 * The Python side, proven without a browser: the built worker module (`dist/worker.js`,
 * the Python inlined) run under Node with the `pyodide` npm package standing in for the
 * CDN, on a captured build request — a map plus its euddraft sections — with the
 * Magenta plugin's Python passed as a caller's `sources`. The built archive is put
 * together with the same code the plugin uses and opened again to count its triggers.
 *
 *   npm run smoke -- <request.json> [magenta.py] [expected triggers]
 */
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { assembleMap, countTriggers, splitMap } from "../src/archive";
import { normalizeSections, normalizeSources } from "../src/compose";
import type { FromWorker, ToWorker } from "../src/protocol";
import { WHEEL_FILE } from "../src/version";

const [reqPath, magentaPath, expectedArg] = process.argv.slice(2);
if (!reqPath) { console.error("usage: smoke <request.json> [magenta.py] [expected triggers]"); process.exit(2); }
const root = resolve(dirname(new URL(import.meta.url).pathname), "..");
const require = createRequire(import.meta.url);
const pyodideDir = dirname(require.resolve("pyodide/package.json"));

const worker = (await import(pathToFileURL(resolve(root, "dist/worker.js")).href)) as { start(scope: Scope, boot: { pyodideBase: string; wheel: string }): Promise<void> };
interface Scope { postMessage(m: unknown): void; onmessage: ((e: { data: ToWorker }) => void) | null; close(): void }

const t0 = performance.now();
const lap = (label: string) => console.log(`${label}: ${((performance.now() - t0) / 1000).toFixed(2)} s`);
let onMessage: (m: FromWorker) => void = () => {};
/** A fresh interpreter per build, as the plugin does it: eudplib cannot load a second map into one. */
async function startRuntime(): Promise<Scope> {
  const scope: Scope = { postMessage: (m) => onMessage(m as FromWorker), onmessage: null, close: () => {} };
  const ready = new Promise<void>((res, rej) => { onMessage = (m) => { if (m.type === "ready") res(); else if (m.type === "fatal") rej(new Error(m.message)); else if (m.type === "stage") console.log(`  ${m.text}`); }; });
  void worker.start(scope, { pyodideBase: `${pyodideDir}/`, wheel: resolve(root, "dist", WHEEL_FILE) });
  await ready;
  return scope;
}

const req = JSON.parse(readFileSync(reqPath, "utf8")) as { map: string; plugins: Record<string, Record<string, string | number>> };
const map = new Uint8Array(Buffer.from(req.map, "base64"));
const sources = magentaPath ? { magenta: readFileSync(magentaPath, "utf8") } : {};
const files: Record<string, string> = {};

async function build(id: number) {
  const scope = await startRuntime();
  lap(`runtime ${id} ready`);
  const split = await splitMap(map);
  const lines: string[] = [];
  const answer = new Promise<{ name: string; locale: number; data: Uint8Array }[]>((res, rej) => {
    onMessage = (m) => { if (m.type === "log") lines.push(m.line); else if (m.type === "result") res(m.members); else if (m.type === "error") rej(new Error(m.message)); };
  });
  const msg: ToWorker = { type: "build", id, chk: split.chk, names: split.names, raw: map, sections: normalizeSections(req.plugins), sources: normalizeSources(sources), files, shuffle: true, sectorSize: 15 };
  scope.onmessage!({ data: msg });
  const members = await answer;
  const out = await assembleMap(members, split.extras);
  const back = await splitMap(out.map);
  return { bytes: out.map.length, chk: out.chk.length, triggers: countTriggers(back.chk), log: lines };
}

const expected = expectedArg ? Number(expectedArg) : null;
let failed = false;
for (const id of [1, 2]) {
  try {
    const r = await build(id);
    lap(`build ${id} done`);
    console.log(`  archive ${r.bytes} bytes, scenario ${r.chk} bytes, ${r.triggers} triggers; ${r.log.length} log lines`);
    if (expected !== null && r.triggers !== expected) { console.log(`  EXPECTED ${expected} triggers`); failed = true; }
  } catch (err) {
    console.log(`build ${id} FAILED: ${(err as Error).message}`);
    failed = true;
  }
}
process.exit(failed ? 1 : 0);
