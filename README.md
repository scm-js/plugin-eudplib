# eudplib

A plugin for [scmJS](https://github.com/scm-js/scm-js), the browser-based StarCraft 1 /
Brood War map editor. It is a **library**: it has no editor of its own. It runs
[eudplib](https://github.com/armoha/eudplib), the trigger compiler behind
[euddraft](https://github.com/armoha/euddraft) that StarCraft: Remastered EUD maps are built
with, inside the editor — in a Web Worker, through [Pyodide](https://pyodide.org) — and holds
it out as a service other plugins build maps through. Magenta and TrigScript use it. Nothing
about a map leaves the machine, and there is no server.

## Install

In scmJS: **Plugins ▸ Manage Plugins…**, paste

```
https://github.com/scm-js/plugin-eudplib
```

and add it. A plugin that needs it names it in its manifest, so installing that plugin
installs this one with it.

## The first build

The runtime is not part of the plugin: it is downloaded once, on the first build, after a
dialog says what it is and how big — about 15 MB from cdn.jsdelivr.net (Pyodide, a Python
for the browser, and the eudplib wheel), kept by the browser for later builds. Cancel and the
build does not happen; the next one asks again. **Plugins ▸ eudplib…** shows what is
installed, the versions, and has Install and Remove.

Each build starts a fresh Python from the download, about two seconds, then eudplib's own
work — a second or two for a typical map. A build cannot be paused, only stopped.

## For plugin authors

Depend on it in your manifest, and reach the service by name:

```json
{ "requires": ["github:scm-js/plugin-eudplib"] }
```

```ts
import type { EudplibService } from "@scm-js/plugin-eudplib/contract";   // or copy contract.d.ts

api.services.watch<EudplibService>("eudplib.build", (eudplib) => { /* null until the library is on */ });
```

`ensure()` asks the user for the download when it is absent and answers true once the runtime
is in; `build()` calls it itself. A build request is the map's bytes, the euddraft plugin
sections as data (the `.eds` sections: name → settings), and any euddraft plugins of your own as
Python source, loaded like the bundled ones — `settings` in their globals, `onPluginStart` /
`beforeTriggerExec` / `afterTriggerExec` hooks. The bundled ones are euddraft's eight: `MSQC`,
`bgmplayer`, `cammove`, `chatEvent`, `dataDumper`, `eudTurbo`, `noAirCollision`, `unlimiter`.

The contract (`contract.d.ts`, `ServiceInfo.version` 1):

```ts
export interface EudplibBuildRequest {
  map: Uint8Array;                                                   // a .scm/.scx archive (a bare .chk is taken too)
  plugins: Record<string, Record<string, string | number>>;          // .eds sections, name → settings
  sources?: Record<string, string>;                                  // your euddraft plugins, module name → Python
  files?: Record<string, string>;                                    // data files, name → text, at /work/files/<name> for a setting to name
  options?: { shufflePayload?: boolean; sectorSize?: number };       // euddraft's; shuffle on and 15 by default
}
export interface EudplibBuildResult { map: Uint8Array; log: string; chkBytes: number; ms: number }
export type EudplibState = "absent" | "installing" | "ready" | "failed";
export interface EudplibService {
  versions: { plugin: string; eudplib: string; pyodide: string; euddraft: string };
  state(): EudplibState;
  downloadBytes: number;
  ensure(opts?: { reason?: string }): Promise<boolean>;             // false when the user declined
  build(request: EudplibBuildRequest, opts?: { signal?: AbortSignal; onLog?: (line: string) => void }): Promise<EudplibBuildResult>;
}
```

A request is checked before anything runs: a section's values may be strings or numbers
(numbers become strings), a key may not contain `[ ] : =` or a line break, a value may not
name a file, and `main` and `freeze` are the library's own. What euddraft would have read is in
the log as `.eds` text.

The built map is a new archive: the scenario eudplib wrote, every member of the input that its
listfile names, and whatever the plugins added, PKWARE-compressed, readable by every StarCraft
build. A member the input's listfile does not name cannot be carried and the log says so.

## How it works

- `dist/<wheel>` is eudplib built for Pyodide; `wheel/` says how and holds the one patch.
- The worker (`src/eudplib.worker.ts` → `dist/worker.js`) is fetched from this repository at
  the plugin's version tag on jsDelivr, never from the plugin's own module, which the editor
  may have compiled into itself. Pyodide comes from its own CDN folder at a pinned version.
- eudplib's Python is untouched. Two things are arranged around it at run time
  (`python/driver.py`): the archive API it expects from StormLib is `python/mpqshim.py`, an
  in-memory registry the main thread fills with the scenario and the listfile's names and
  reads the built members back from (mopaq does the archive); and `platform.system()` answers
  Linux while eudplib imports, since its epscript loader indexes a Windows / Linux / macOS
  table at import time.
- "Installed" means the browser's Cache API holds every file of the download
  (`src/urls.ts` lists them with their sizes). The worker fetches the same addresses, which
  the install has just put in the HTTP cache too.
- A `runtimeBase` setting in the plugin's storage (a folder serving this repository, such as
  `http://localhost:8080/`) points the worker and the wheel somewhere else for development.

## Develop

```sh
npm install
npm run typecheck && npm test && npm run build      # dist/plugin.js and dist/worker.js
npm run smoke -- <request.json> [magenta.py] [expected triggers]
```

`npm run smoke` runs the built worker module under Node with the `pyodide` npm package standing
in for the CDN: a captured `{map, plugins}` request (base64 map, sections) is built twice, the
archive put together and opened again, and its trigger count checked — the Python side proven
without a browser. `wheel/README.md` covers rebuilding the wheel and the byte-for-byte
comparison against a native euddraft.

## Licence

MIT. See ATTRIBUTION.md for eudplib, euddraft, Pyodide and mopaq.
