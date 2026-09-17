/**
 * The build worker's module: Pyodide, the eudplib wheel, euddraft's loader and bundled
 * plugins, the archive shim and the driver, all staged into the interpreter's file
 * system, then one build per message. It is bundled alone (`dist/worker.js`) and
 * imported by a bootstrap worker from the CDN at the plugin's version tag — never from
 * the plugin's own module, which the editor may have compiled into itself. One build per
 * worker: eudplib's map and main loop are module state and cannot be loaded twice.
 */
import type { BuildMessage, FromWorker, ToWorker } from "./protocol";
import { FILES_DIR } from "./compose";
import driverSource from "../python/driver.py";
import shimSource from "../python/mpqshim.py";
import pluginLoaderSource from "../python/euddraft/pluginLoader.py";
import MSQC from "../python/euddraft/plugins/MSQC.py";
import bgmplayer from "../python/euddraft/plugins/bgmplayer.py";
import cammove from "../python/euddraft/plugins/cammove.py";
import chatEvent from "../python/euddraft/plugins/chatEvent.py";
import dataDumper from "../python/euddraft/plugins/dataDumper.py";
import eudTurbo from "../python/euddraft/plugins/eudTurbo.py";
import noAirCollision from "../python/euddraft/plugins/noAirCollision.py";
import unlimiter from "../python/euddraft/plugins/unlimiter.py";

/** euddraft's eight plugins, at the commit `version.ts` names. */
export const BUNDLED_PLUGINS: Record<string, string> = { MSQC, bgmplayer, cammove, chatEvent, dataDumper, eudTurbo, noAirCollision, unlimiter };

const SITE_PACKAGES = "/lib/python3.14/site-packages";
const ED = "/ed";
const PY = "/py";

interface Pyodide {
  version: string;
  FS: { writeFile(path: string, data: Uint8Array | string): void; readFile(path: string, opts?: { encoding: "utf8" }): Uint8Array | string; mkdirTree(path: string): void; unlink(path: string): void; rmdir(path: string): void; readdir(path: string): string[] };
  loadPackage(name: string): Promise<unknown>;
  runPython(code: string): unknown;
}

let py: Pyodide | null = null;
let current: number | null = null;

/** The worker's global, as much of it as is used. */
export interface WorkerScope { postMessage(message: unknown): void; onmessage: ((e: MessageEvent<ToWorker>) => void) | null; close?(): void }

export async function start(self: WorkerScope, boot: { pyodideBase: string; wheel: string }): Promise<void> {
  const post = (m: FromWorker) => self.postMessage(m);
  const log = (line: string) => post({ type: "log", id: current, line });
  try {
    post({ type: "stage", text: "Loading Python" });
    const mod = (await import(/* @vite-ignore */ `${boot.pyodideBase}pyodide.mjs`)) as { loadPyodide(o: Record<string, unknown>): Promise<Pyodide> };
    py = await mod.loadPyodide({ indexURL: boot.pyodideBase, stdout: log, stderr: log });
    post({ type: "stage", text: "Installing eudplib" });
    await py.loadPackage("typing-extensions");
    await py.loadPackage(boot.wheel);
    py.FS.mkdirTree(`${ED}/plugins`); py.FS.mkdirTree(PY); py.FS.mkdirTree("/work");
    py.FS.writeFile(`${ED}/pluginLoader.py`, pluginLoaderSource);
    for (const [name, source] of Object.entries(BUNDLED_PLUGINS)) py.FS.writeFile(`${ED}/plugins/${name}.py`, source);
    py.FS.writeFile(`${PY}/mpqshim.py`, shimSource);
    py.FS.writeFile(`${PY}/driver.py`, driverSource);
    py.runPython(`import sys\nsys.path.insert(0, ${JSON.stringify(PY)})\nimport driver, mpqshim\ndriver.prepare(${JSON.stringify(SITE_PACKAGES)})`);
    post({ type: "ready" });
  } catch (err) {
    post({ type: "fatal", message: describe(err) });
    return;
  }
  self.onmessage = (e: MessageEvent<ToWorker>) => {
    const m = e.data;
    if (m.type !== "build") return;
    current = m.id;
    try {
      post({ type: "result", id: m.id, members: build(py!, m) });
    } catch (err) {
      post({ type: "error", id: m.id, message: describe(err) });
    } finally {
      current = null;
      // eudplib cannot build twice in one interpreter; the main thread starts a new worker for the next map.
      self.close?.();
    }
  };
}

function build(py: Pyodide, m: BuildMessage): { name: string; locale: number; data: Uint8Array }[] {
  const dir = `/work/${m.id}`;
  py.FS.mkdirTree(`${dir}/out`);
  py.FS.writeFile(`${dir}/in.scx`, m.raw);
  py.FS.writeFile(`${dir}/chk.bin`, m.chk);
  py.FS.writeFile(`${dir}/request.json`, JSON.stringify({ names: m.names, sections: m.sections, shuffle: m.shuffle, sectorSize: m.sectorSize }));
  // The caller's own plugins go beside the bundled ones, where euddraft's loader looks them up by name.
  for (const [name, code] of Object.entries(m.sources)) py.FS.writeFile(`${ED}/plugins/${name}.py`, code);
  // The caller's data files, at the one address a plugin setting can name.
  py.FS.mkdirTree(FILES_DIR);
  for (const [name, text] of Object.entries(m.files)) py.FS.writeFile(`${FILES_DIR}/${name}`, text);
  py.runPython(`
import json, mpqshim, driver
_d = ${JSON.stringify(dir)}
with open(_d + "/request.json") as f: _req = json.load(f)
with open(_d + "/chk.bin", "rb") as f: _chk = f.read()
mpqshim.register(_d + "/in.scx", {"staredit\\\\scenario.chk": _chk}, _req["names"])
driver.build(${JSON.stringify(ED)}, _d + "/in.scx", _d + "/out.scx", _req["sections"], shuffle=_req["shuffle"], sector_size=_req["sectorSize"])
_index = []
for _i, (_name, _locale, _data) in enumerate(mpqshim.collect(_d + "/out.scx")):
    with open(f"{_d}/out/{_i}.bin", "wb") as f: f.write(_data)
    _index.append({"name": _name, "locale": _locale})
with open(_d + "/out/index.json", "w") as f: json.dump(_index, f)
`);
  const index = JSON.parse(py.FS.readFile(`${dir}/out/index.json`, { encoding: "utf8" }) as string) as { name: string; locale: number }[];
  return index.map((e, i) => ({ ...e, data: py.FS.readFile(`${dir}/out/${i}.bin`) as Uint8Array }));
}

function describe(err: unknown): string {
  if (err && typeof err === "object" && "message" in err) return String((err as { message: unknown }).message);
  return String(err);
}
