/**
 * The plugin's version as code: `plugin.json` is what the editor reads, but the worker and
 * the wheel are fetched from this release's own tag on the CDN, and the plugin's module
 * cannot import JSON. `tests/version.test.ts` keeps this equal to the manifest's.
 */
export const VERSION = "0.3.0";
/** The eudplib release the wheel in `dist/` was built from (see `wheel/`). */
export const EUDPLIB_VERSION = "0.81.0";
/** The euddraft commit `python/euddraft/` was copied from. */
export const EUDDRAFT_COMMIT = "a00aef1bd7001891a6ca01abbb1f3240a5b00280";
/** The Pyodide release the wheel is built for (its CPython is 3.14). */
export const PYODIDE_VERSION = "314.0.7";
export const WHEEL_FILE = `eudplib-${EUDPLIB_VERSION}-cp314-abi3-pyemscripten_2026_0_wasm32.whl`;
