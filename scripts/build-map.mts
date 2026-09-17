/**
 * Build one map from the command line, the way the plugin does it in the editor but under
 * Node (the `pyodide` npm package stands in for the CDN): for scripts that make maps, such
 * as Magenta's probe maps. The plugin sections come as JSON; extra euddraft plugins as
 * `name=path.py`.
 *
 *   npm run build:map -- <in.scx> <out.scx> <plugins.json> [name=plugin.py ...]
 */
import { readFileSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { assembleMap, countTriggers, splitMap } from "../src/archive";
import { normalizeSections, normalizeSources } from "../src/compose";
import type { FromWorker, ToWorker } from "../src/protocol";
import { WHEEL_FILE } from "../src/version";

const [inPath, outPath, pluginsPath, ...extra] = process.argv.slice(2);
if (!inPath || !outPath || !pluginsPath) { console.error("usage: build-map <in.scx> <out.scx> <plugins.json> [name=plugin.py ...]"); process.exit(2); }
const root = resolve(dirname(new URL(import.meta.url).pathname), "..");
const require = createRequire(import.meta.url);
const pyodideDir = dirname(require.resolve("pyodide/package.json"));
interface Scope { postMessage(m: unknown): void; onmessage: ((e: { data: ToWorker }) => void) | null; close(): void }
const worker = (await import(pathToFileURL(resolve(root, "dist/worker.js")).href)) as { start(scope: Scope, boot: { pyodideBase: string; wheel: string }): Promise<void> };

let onMessage: (m: FromWorker) => void = () => {};
const scope: Scope = { postMessage: (m) => onMessage(m as FromWorker), onmessage: null, close: () => {} };
const ready = new Promise<void>((res, rej) => { onMessage = (m) => { if (m.type === "ready") res(); else if (m.type === "fatal") rej(new Error(m.message)); }; });
void worker.start(scope, { pyodideBase: `${pyodideDir}/`, wheel: resolve(root, "dist", WHEEL_FILE) });
await ready;

const map = new Uint8Array(readFileSync(inPath));
const plugins = JSON.parse(readFileSync(pluginsPath, "utf8")) as Record<string, Record<string, string | number>>;
const sources: Record<string, string> = {};
for (const e of extra) { const i = e.indexOf("="); if (i < 0) { console.error(`expected name=path.py, got ${e}`); process.exit(2); } sources[e.slice(0, i)] = readFileSync(e.slice(i + 1), "utf8"); }
const split = await splitMap(map);
const lines: string[] = [];
const answer = new Promise<{ name: string; locale: number; data: Uint8Array }[]>((res, rej) => {
  onMessage = (m) => { if (m.type === "log") lines.push(m.line); else if (m.type === "result") res(m.members); else if (m.type === "error") rej(new Error(m.message)); };
});
const msg: ToWorker = { type: "build", id: 1, chk: split.chk, names: split.names, raw: map, sections: normalizeSections(plugins), sources: normalizeSources(sources), shuffle: true, sectorSize: 15 };
scope.onmessage!({ data: msg });
try {
  const members = await answer;
  const out = await assembleMap(members, split.extras);
  writeFileSync(outPath, out.map);
  console.log(`${outPath}: ${out.map.length} bytes, ${countTriggers((await splitMap(out.map)).chk)} triggers`);
  if (process.env.EUDPLIB_LOG) console.log(lines.join("\n"));
} catch (err) {
  console.error(`build failed: ${(err as Error).message}\n${lines.join("\n")}`);
  process.exit(1);
}
process.exit(0);
