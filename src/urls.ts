/**
 * Where the runtime comes from. Pyodide is published on jsDelivr by its own project; the
 * worker module and the eudplib wheel are this repository's `dist/` at this release's tag,
 * also through jsDelivr. The plugin's own module URL is no help for finding them: the
 * editor imports a fetched plugin through a `blob:` URL, and a plugin compiled into the
 * editor is a chunk under the editor's `assets/` — an `http(s)` address on a web build, so
 * the scheme alone says nothing. So the tag is the address, and a module served as this
 * repository's own `plugin.ts` or `dist/plugin.js` from another origin than the page (a
 * dev server) or the `runtimeBase` storage override points somewhere else for development.
 * On the page's own origin the module is the editor's copy — `plugins/eudplib/plugin.ts`
 * under the editor's dev server — whose folder has the source and none of `dist/`.
 *
 * An editor may also carry the runtime itself: the scmJS desktop app and container image
 * copy the files `runtime.json` lists into `plugin-runtime/eudplib/<version>/` beside the
 * page, so a build there needs no network. `findBundled` looks for that copy; one made for
 * another release of the plugin is not this one's, and the CDN stands.
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
 * setting (a folder serving this repository: `http://localhost:8080/`), which wins;
 * `pageUrl` is the editor page's address (`document.baseURI`), where there is one.
 */
export function runtimeUrls(entryUrl: string, override: string | null | undefined, pageUrl?: string): RuntimeUrls {
  const base = override?.trim() ? withSlash(override.trim()) : servedFromRepository(entryUrl, pageUrl) ? repositoryRoot(entryUrl) : RELEASE_BASE;
  return { pyodideBase: PYODIDE_BASE, worker: `${base}dist/worker.js`, wheel: `${base}dist/${WHEEL_FILE}` };
}

/**
 * Whether the module is this repository served over http(s) — its `plugin.ts` or
 * `dist/plugin.js`, as a dev server has it — rather than a chunk an editor compiled it into
 * (`https://editor.scmjs.dev/assets/plugin-1a2b.js`) or the editor's own copy of the source
 * (`http://localhost:5173/plugins/eudplib/plugin.ts` under its dev server), whose folders
 * hold none of the runtime. Both of those are on the page's origin; a repository served for
 * development is on its own.
 */
export function servedFromRepository(entryUrl: string, pageUrl?: string): boolean {
  if (!/^https?:/.test(entryUrl) || !/\/(?:dist\/plugin\.js|plugin\.ts)(?:[?#].*)?$/.test(entryUrl)) return false;
  return !pageUrl || originOf(pageUrl) !== originOf(entryUrl);
}

const originOf = (url: string) => { try { return new URL(url).origin; } catch { return null; } };

const withSlash = (s: string) => (s.endsWith("/") ? s : `${s}/`);

/** The folder holding plugin.json: the module is `plugin.ts` at the root or `dist/plugin.js` under it. */
const repositoryRoot = (entryUrl: string) => new URL("./", entryUrl.replace(/[?#].*$/, "")).href.replace(/\/dist\/$/, "/");

/** One file of the download: its address and its size on the CDN, measured for this Pyodide release. */
export interface RuntimeFile { url: string; bytes: number }

/** Pyodide's files a build loads, by name in its release folder, with their sizes. */
const PYODIDE_FILES: [name: string, bytes: number][] = [
  ["pyodide.mjs", 17_931],
  ["pyodide.asm.mjs", 1_250_344],
  ["pyodide.asm.wasm", 9_598_218],
  ["python_stdlib.zip", 2_545_637],
  ["pyodide-lock.json", 119_077],
  [TYPING_EXTENSIONS_FILE, 44_614],
];
const WHEEL_BYTES = 993_692;
const WORKER_BYTES = 92_375;

/**
 * Every file a first build fetches — the list "installed" is measured against, and what
 * the install dialog's size comes from. Sizes are the files' own (the CDN sends them
 * compressed, so the wire cost is lower).
 */
export function runtimeFiles(urls: RuntimeUrls): RuntimeFile[] {
  return [
    ...PYODIDE_FILES.map(([name, bytes]) => ({ url: `${urls.pyodideBase}${name}`, bytes })),
    { url: urls.wheel, bytes: WHEEL_BYTES },
    { url: urls.worker, bytes: WORKER_BYTES },
  ];
}

export const downloadBytes = (urls: RuntimeUrls) => runtimeFiles(urls).reduce((n, f) => n + f.bytes, 0);

/** The Cache API bucket for this release; older ones are dropped at activation. */
export const CACHE_NAME = `eudplib-${VERSION}-${EUDPLIB_VERSION}-py${PYODIDE_VERSION}`;
export const CACHE_PREFIX = "eudplib-";

/** Where an editor that carries this release's runtime keeps it, relative to its page. */
export const BUNDLED_PATH = `plugin-runtime/eudplib/${VERSION}/`;

/** The addresses inside a bundled copy: Pyodide's folder, and `dist/` as it is in this repository. */
export function bundledUrls(base: string): RuntimeUrls {
  const b = withSlash(base);
  return { pyodideBase: `${b}pyodide/`, worker: `${b}dist/worker.js`, wheel: `${b}dist/${WHEEL_FILE}` };
}

/**
 * `runtime.json`, what an editor reads to carry the runtime: each file's place in the
 * bundled copy and where to get it — an absolute address, or a path in this repository at
 * this release's tag. The editor copies the manifest in beside them, and that copy is what
 * `findBundled` looks for. `npm run manifest` writes it; a test keeps it current.
 */
export interface RuntimeManifest {
  plugin: "eudplib";
  version: string;
  files: { path: string; from: string }[];
}

export function runtimeManifest(): RuntimeManifest {
  return {
    plugin: "eudplib",
    version: VERSION,
    files: [
      ...PYODIDE_FILES.map(([name]) => ({ path: `pyodide/${name}`, from: `${PYODIDE_BASE}${name}` })),
      { path: `dist/${WHEEL_FILE}`, from: `dist/${WHEEL_FILE}` },
      { path: "dist/worker.js", from: "dist/worker.js" },
      // Not loaded by a build; they travel with a copy an editor carries.
      ...LICENSES,
    ],
  };
}

/** The licences of what a carried copy redistributes, and the notes saying which is whose. */
const LICENSES = [
  { path: "licenses/LICENSE", from: "LICENSE" },
  { path: "licenses/ATTRIBUTION.md", from: "ATTRIBUTION.md" },
  { path: "licenses/euddraft-LICENSE.txt", from: "python/euddraft/LICENSE.txt" },
  { path: "licenses/pyodide-LICENSE", from: `https://raw.githubusercontent.com/pyodide/pyodide/${PYODIDE_VERSION}/LICENSE` },
];

/**
 * The runtime the editor carries for this release, or null. `pageUrl` is the page's base
 * (`document.baseURI`). A copy for another release is not this one's; neither is a page
 * answering every address with index.html, which fails to parse.
 */
export async function findBundled(pageUrl: string, fetcher: typeof fetch = fetch): Promise<RuntimeUrls | null> {
  let base: string;
  try { base = new URL(BUNDLED_PATH, pageUrl).href; } catch { return null; }
  try {
    const res = await fetcher(`${base}runtime.json`, { cache: "no-cache" });
    if (!res.ok) return null;
    const m = (await res.json()) as Partial<RuntimeManifest> | null;
    return m?.plugin === "eudplib" && m.version === VERSION ? bundledUrls(base) : null;
  } catch {
    return null;
  }
}
