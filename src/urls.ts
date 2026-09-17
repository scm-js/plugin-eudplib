/**
 * Where the runtime comes from. Pyodide is published on jsDelivr by its own project; the
 * worker module and the eudplib wheel are this repository's `dist/` at this release's tag,
 * also through jsDelivr. The plugin's own module URL is no help for finding them: the
 * editor imports a fetched plugin through a `blob:` URL, and a plugin compiled into the
 * editor is a chunk under the editor's `assets/`. So the tag is the address, and an
 * `http(s)` module URL (a plugin served from a dev server) or the `runtimeBase` storage
 * override points somewhere else for development.
 */
import { EUDPLIB_VERSION, PYODIDE_VERSION, VERSION, WHEEL_FILE } from "./version";

export const PYODIDE_BASE = `https://cdn.jsdelivr.net/pyodide/v${PYODIDE_VERSION}/full/`;
export const CDN_HOST = "cdn.jsdelivr.net";
export const RELEASE_BASE = `https://cdn.jsdelivr.net/gh/scm-js/plugin-eudplib@v${VERSION}/`;

/** typing_extensions is eudplib's one Python dependency; Pyodide's own distribution carries it. */
export const TYPING_EXTENSIONS_FILE = "typing_extensions-4.15.0-py3-none-any.whl";

export interface RuntimeUrls {
  /** Pyodide's `indexURL`: the folder holding pyodide.mjs and its files. */
  pyodideBase: string;
  /** The worker module, `dist/worker.js`. */
  worker: string;
  /** The eudplib wheel. */
  wheel: string;
}

/**
 * `entryUrl` is `import.meta.url` of the plugin's module; `override` is the `runtimeBase`
 * setting (a folder serving this repository: `http://localhost:8080/`), which wins.
 */
export function runtimeUrls(entryUrl: string, override: string | null | undefined): RuntimeUrls {
  const base = override?.trim() ? withSlash(override.trim()) : /^https?:/.test(entryUrl) ? repositoryRoot(entryUrl) : RELEASE_BASE;
  return { pyodideBase: PYODIDE_BASE, worker: `${base}dist/worker.js`, wheel: `${base}dist/${WHEEL_FILE}` };
}

const withSlash = (s: string) => (s.endsWith("/") ? s : `${s}/`);

/** The folder holding plugin.json: the module is `plugin.ts` at the root or `dist/plugin.js` under it. */
const repositoryRoot = (entryUrl: string) => new URL("./", entryUrl).href.replace(/\/dist\/$/, "/");

/** One file of the download: its address and its size on the CDN, measured for this Pyodide release. */
export interface RuntimeFile { url: string; bytes: number }

/**
 * Every file a first build fetches — the list "installed" is measured against, and what
 * the install dialog's size comes from. Sizes are the files' own (the CDN sends them
 * compressed, so the wire cost is lower).
 */
export function runtimeFiles(urls: RuntimeUrls): RuntimeFile[] {
  const p = urls.pyodideBase;
  return [
    { url: `${p}pyodide.mjs`, bytes: 17_931 },
    { url: `${p}pyodide.asm.mjs`, bytes: 1_250_344 },
    { url: `${p}pyodide.asm.wasm`, bytes: 9_598_218 },
    { url: `${p}python_stdlib.zip`, bytes: 2_545_637 },
    { url: `${p}pyodide-lock.json`, bytes: 119_077 },
    { url: `${p}${TYPING_EXTENSIONS_FILE}`, bytes: 44_614 },
    { url: urls.wheel, bytes: 993_692 },
    { url: urls.worker, bytes: 92_375 },
  ];
}

export const downloadBytes = (urls: RuntimeUrls) => runtimeFiles(urls).reduce((n, f) => n + f.bytes, 0);

/** The Cache API bucket for this release; older ones are dropped at activation. */
export const CACHE_NAME = `eudplib-${VERSION}-${EUDPLIB_VERSION}-py${PYODIDE_VERSION}`;
export const CACHE_PREFIX = "eudplib-";
