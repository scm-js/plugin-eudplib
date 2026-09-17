/**
 * The `eudplib.build` service: what a dependent plugin holds. `ensure()` owns the one
 * install dialog and one in-flight install; `build()` validates the request, takes the
 * archive apart, runs the worker and puts the built map together.
 */
import type { PluginApi } from "@scm-js/plugin-api";
import type { EudplibBuildRequest, EudplibBuildResult, EudplibService, EudplibState } from "../contract";
import { assembleMap, splitMap } from "./archive";
import { normalizeSections, normalizeSources } from "./compose";
import { askInstall } from "./dialogs";
import type { Runtime } from "./runtime";
import { downloadBytes } from "./urls";
import { EUDDRAFT_COMMIT, EUDPLIB_VERSION, PYODIDE_VERSION, VERSION } from "./version";

export function createService(api: PluginApi, runtime: Runtime): EudplibService & { refresh(): Promise<void>; installing(): boolean } {
  let state: EudplibState = "absent";
  let installing: Promise<boolean> | null = null;
  const refresh = async () => { if (installing) return; state = runtime.failed ? "failed" : (await runtime.installed()) ? "ready" : "absent"; };
  void refresh();

  const ensure = (opts: { reason?: string } = {}): Promise<boolean> => {
    if (installing) return installing;
    installing = (async () => {
      await refresh();
      if (state === "ready") return true;
      state = "installing";
      const ok = await askInstall(api, runtime, opts.reason ?? null);
      state = ok ? "ready" : runtime.failed ? "failed" : "absent";
      return ok;
    })().finally(() => { installing = null; });
    return installing;
  };

  const build = async (request: EudplibBuildRequest, opts: { signal?: AbortSignal; onLog?: (line: string) => void } = {}): Promise<EudplibBuildResult> => {
    const sections = normalizeSections(request.plugins);
    const sources = normalizeSources(request.sources);
    if (!(request.map instanceof Uint8Array) || !request.map.length) throw new Error("The request needs the map's bytes.");
    if (!(await ensure({ reason: api.i18n.t("A plugin needs it to build this map.") }))) throw new Error("The build runtime is not installed.");
    const started = performance.now();
    const lines: string[] = [];
    const onLog = (line: string) => { lines.push(line); opts.onLog?.(line); };
    const split = await splitMap(request.map);
    if (split.unnamed) onLog(api.i18n.t("{n, plural, one {# member of the archive has no name in its listfile and is not carried into the built map.} other {# members of the archive have no name in its listfile and are not carried into the built map.}}", { n: split.unnamed }));
    const members = await runtime.build({
      chk: split.chk, names: split.names, raw: request.map, sections, sources,
      shuffle: request.options?.shufflePayload ?? true, sectorSize: request.options?.sectorSize ?? 15,
    }, { signal: opts.signal, onLog });
    const out = await assembleMap(members, split.extras);
    return { map: out.map, log: lines.join("\n"), chkBytes: out.chk.length, ms: Math.round(performance.now() - started) };
  };

  return {
    versions: { plugin: VERSION, eudplib: EUDPLIB_VERSION, pyodide: PYODIDE_VERSION, euddraft: EUDDRAFT_COMMIT.slice(0, 7) },
    state: () => state,
    downloadBytes: downloadBytes(runtime.urls),
    ensure, build, refresh, installing: () => installing !== null,
  };
}
