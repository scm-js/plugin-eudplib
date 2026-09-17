/**
 * The `eudplib.build` service, as other plugins see it. Types only: take this file (or
 * the `@scm-js/plugin-eudplib` copy in the README) with `import type` and reach the object
 * through `api.services.watch("eudplib.build", …)`. The provider's `ServiceInfo.version` is
 * 1 for this shape.
 */

export interface EudplibBuildRequest {
  /** The map as a .scm/.scx archive (a bare .chk is taken too). */
  map: Uint8Array;
  /** euddraft plugin sections, name → settings: the .eds sections, values strings or numbers. */
  plugins: Record<string, Record<string, string | number>>;
  /**
   * Extra euddraft plugins the caller brings as Python source, module name → code. A name
   * here may also appear in `plugins` with its settings; it is loaded like a bundled one
   * (`settings` in its globals, `onPluginStart` / `beforeTriggerExec` / `afterTriggerExec`).
   */
  sources?: Record<string, string>;
  options?: {
    /** Shuffle the payload's objects, as euddraft does by default. */
    shufflePayload?: boolean;
    /** euddraft's `sectorSize` (the archive sector is 512 << n); 15 by default. */
    sectorSize?: number;
  };
}

export interface EudplibBuildResult {
  /** The built map, an archive every StarCraft build reads. */
  map: Uint8Array;
  /** eudplib's and the plugins' output, line by line. */
  log: string;
  /** The built scenario's size. */
  chkBytes: number;
  /** Wall time of the build, the runtime's start included when it had to start. */
  ms: number;
}

export type EudplibState = "absent" | "installing" | "ready" | "failed";

export interface EudplibService {
  /** The plugin's version, eudplib's, Pyodide's, and the euddraft commit its loader and plugins come from. */
  versions: { plugin: string; eudplib: string; pyodide: string; euddraft: string };
  state(): EudplibState;
  /** Size of the first-use download in bytes, for a caller that wants to say it before `ensure()`. */
  downloadBytes: number;
  /**
   * Make the runtime available: true when it is, false when the user declined. When the
   * runtime is absent this opens the install dialog (with `reason` as one line, "Magenta
   * needs it to build this map"); concurrent callers share one install.
   */
  ensure(opts?: { reason?: string }): Promise<boolean>;
  /**
   * Build. Calls `ensure()` itself. `signal` stops the build (the runtime is thrown away
   * and started again for the next one); `onLog` gets each output line as it is written.
   */
  build(request: EudplibBuildRequest, opts?: { signal?: AbortSignal; onLog?: (line: string) => void }): Promise<EudplibBuildResult>;
}
