// The wasm side of the spike: Pyodide in Node, the patched eudplib wheel, the archive shim, the
// shared driver; the map's CHK in and the built CHK out, compared with the native reference.
import { readFileSync, writeFileSync, readdirSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { createHash } from "node:crypto";
import { loadPyodide } from "pyodide";
const { loadMap, saveMap, readExtras } = await import("/home/jeany/github/scm-js/src/formats/mpq/scm.ts");
const { parseScenario } = await import("/home/jeany/github/scm-js/src/formats/chk/scenario.ts");

const S = "<scratchpad>";
const n = process.argv[2] ?? "4";
const t0 = performance.now(); const lap = (label: string) => console.log(`${label}: ${((performance.now() - t0) / 1000).toFixed(2)} s`);

const py = await loadPyodide({ indexURL: join(S, "node/node_modules/pyodide"), env: { PYTHONHASHSEED: "0" } });
lap("pyodide loaded");
await py.loadPackage("typing-extensions");
await py.loadPackage(join(S, "spike/dist/eudplib-0.81.0-cp314-abi3-pyemscripten_2026_0_wasm32.whl"));
lap("wheels installed");

// euddraft's loader + plugins, the Magenta plugin, the shim and the driver into the in-memory FS.
const put = (dst: string, src: string) => py.FS.writeFile(dst, readFileSync(src));
py.FS.mkdirTree("/ed/plugins"); py.FS.mkdirTree("/shim"); py.FS.mkdirTree("/work/out");
put("/ed/pluginLoader.py", join(S, "ed/pluginLoader.py"));
for (const f of readdirSync(join(S, "ed/plugins"))) if (f.endsWith(".py")) put(`/ed/plugins/${f}`, join(S, "ed/plugins", f));
put("/ed/plugins/magenta.py", "/home/jeany/github/eud-server/plugins/magenta.py");
put("/shim/mpqshim.py", join(S, "spike/shim/mpqshim.py")); put("/shim/harness.py", join(S, "spike/shim/harness.py"));

const req = JSON.parse(readFileSync(join(S, `captures/${n}-request.json`), "utf8"));
const mapBytes = new Uint8Array(Buffer.from(req.map, "base64"));
const loaded = await loadMap(mapBytes);
const extras = loaded.archive ? await readExtras(loaded.archive, loaded.files) : new Map<string, Uint8Array>();
py.FS.writeFile("/work/in.scx", mapBytes);
py.FS.writeFile("/work/chk.bin", loaded.chk);
py.FS.writeFile("/work/names.json", JSON.stringify(loaded.files ?? []));
py.FS.writeFile("/work/plugins.json", JSON.stringify(req.plugins));
lap("inputs staged");

py.runPython(`
import sys, json
sys.path.insert(0, "/shim")
import harness
harness.make_deterministic()
harness.install_shim("/lib/python3.14/site-packages")
import mpqshim
chk = open("/work/chk.bin", "rb").read()
names = json.load(open("/work/names.json"))
mpqshim.register("/work/in.scx", {"staredit\\\\scenario.chk": chk}, names)
harness.build("/ed", "/work/in.scx", "/work/out.scx", json.load(open("/work/plugins.json")))
index = []
for i, (name, locale, data) in enumerate(mpqshim.collect("/work/out.scx")):
    with open(f"/work/out/{i}.bin", "wb") as f: f.write(data)
    index.append({"name": name, "locale": locale, "size": len(data)})
with open("/work/out/index.json", "w") as f: json.dump(index, f)
`);
lap("build done");

const index = JSON.parse(py.FS.readFile("/work/out/index.json", { encoding: "utf8" })) as { name: string; locale: number; size: number }[];
const members = index.map((e, i) => ({ ...e, data: py.FS.readFile(`/work/out/${i}.bin`) as Uint8Array }));
for (const m of members) console.log(`  member ${m.name} locale ${m.locale.toString(16)} ${m.size} bytes`);
const real = members.find((m) => m.name === "staredit\\scenario.chk" && m.locale === 0x409)!;
mkdirSync(join(S, "ref"), { recursive: true });
writeFileSync(join(S, `ref/${n}-wasm-chk.bin`), real.data);
const sha = (b: Uint8Array) => createHash("sha256").update(b).digest("hex");
const nativeChk = readFileSync(join(S, `ref/${n}-native-chk-a.bin`));
console.log(`wasm chk   ${real.data.length} ${sha(real.data)}`);
console.log(`native chk ${nativeChk.length} ${sha(nativeChk)}`);
console.log(nativeChk.equals(Buffer.from(real.data)) ? "IDENTICAL" : "DIFFERENT");

// Write a playable archive with mopaq: the real CHK, the input's other members, whatever the plugins added.
for (const m of members) if (!(m.name === "staredit\\scenario.chk")) extras.set(m.name, m.data);
const scx = await saveMap(real.data, { extras, compress: "pkware", listfile: true });
writeFileSync(join(S, `ref/${n}-wasm.scx`), scx);
const back = parseScenario((await loadMap(scx)).chk);
console.log(`archive ${scx.length} bytes, opens with ${back.triggers.length} triggers`);
lap("total");
