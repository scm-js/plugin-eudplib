/**
 * `npm run manifest`: write `runtime.json` from `src/urls.ts` — the files an editor copies
 * in to carry the runtime itself (see `runtimeManifest`). `tests/urls.test.ts` fails when
 * the committed file has fallen behind.
 */
import { writeFileSync } from "node:fs";
import { runtimeManifest } from "../src/urls";

writeFileSync(new URL("../runtime.json", import.meta.url), `${JSON.stringify(runtimeManifest(), null, 2)}\n`);
console.log("runtime.json written.");
