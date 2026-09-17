"""Inside the eud-server image: the shared harness natively (real StormLib), deterministic; writes the output CHK."""
import base64, json, os, sys
n, tag = sys.argv[1], sys.argv[2]
sys.path.insert(0, "/work/spike/shim"); import harness
harness.make_deterministic()
req = json.load(open(f"/work/captures/{n}-request.json"))
work = f"/tmp/ref-{tag}"; os.makedirs(work, exist_ok=True)
open(f"{work}/in.scx", "wb").write(base64.b64decode(req["map"]))
harness.build("/ed", f"{work}/in.scx", f"{work}/out.scx", req["plugins"])
from eudplib.bindings._rust import mpqapi
m = mpqapi.MPQ.open(f"{work}/out.scx"); m.set_file_locale(0x409)
chk = m.extract_file("staredit\\scenario.chk")
open(f"/work/ref/{n}-native-chk-{tag}.bin", "wb").write(chk)
open(f"/work/ref/{n}-native-{tag}.scx", "wb").write(open(f"{work}/out.scx", "rb").read())
print("native chk", len(chk), "names", m.get_file_names_from_listfile())
