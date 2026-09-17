# The wheel

`dist/eudplib-<version>-cp314-abi3-pyemscripten_2026_0_wasm32.whl` is eudplib built for
Pyodide (CPython 3.14 on Emscripten). It is eudplib's own source at the pinned release with
one patch of build configuration, `eudplib-wasm.patch`:

- `src/rust/Cargo.toml` and `src/rust/src/lib.rs`: the StormLib wrapper (`mpqapi`) behind a
  `stormlib` cargo feature, on by default. Off, the crate needs no cmake and no C++; the
  plugin supplies `eudplib.bindings._rust.mpqapi` itself (`python/mpqshim.py`).
- `pyproject.toml`: the plain `maturin` build backend — no epscript C library build, no
  babel (`.mo` files are skipped; gettext falls back to English).

Nothing in eudplib's Python is changed.

## Rebuild

Needs Docker. Python 3.14 on the build host has to match Pyodide's, which is why it is an image.

```sh
cd wheel
docker build -t eudplib-wasm .                       # python:3.14 + pyodide-build 0.39 + rustup + node 24
mkdir -p src && pip download --no-deps --no-binary :all: eudplib==0.81.0 -d . \
  && tar xzf eudplib-0.81.0.tar.gz --strip-components=1 -C src
( cd src && patch -p1 < ../eudplib-wasm.patch )
./run.sh sh -c 'rustup toolchain install 1.93.0 --profile minimal --target wasm32-unknown-emscripten && rustup default 1.93.0 \
  && cd /work/src && pyodide build . -o /work/dist -C build-args="--no-default-features --features extension-module"'
cp dist/eudplib-*.whl ../dist/
```

`pyodide config get rust_toolchain` and `pyodide config get emscripten_version` say what the
installed pyodide-build wants (1.93.0 and 5.0.3 for Pyodide 314.0.7); the Emscripten SDK is
downloaded on first use into `home/`, which `run.sh` keeps between runs. The Rust build
itself takes a few seconds. Then update `EUDPLIB_VERSION` / `PYODIDE_VERSION` / `WHEEL_FILE`
in `src/version.ts`, the sizes in `src/urls.ts`, and run `npm run smoke`.

## Proving a wheel

`harness/` is the comparison the wheel was first checked with (2026-09-17, from the spike in
scm-js's history): `capture-proxy.py` records `{map, plugins}` requests and replies while
sitting in front of a euddraft build server; `native-ref2.py` runs the same driver natively
in that server's image with `harness.py`'s determinism patches (payload shuffle off, `random`
seeded, `os.urandom` replaced); `run.mts` runs the wasm side under Node the same way and
hashes the built scenario against the native one. Three of four captured Magenta maps came
out byte-identical; the fourth differed by ten bytes where a hash-ordered collection inside
eudplib puts two elements — the order follows Python's hash seed, and a 32-bit hash lands on
the other one — so both are valid output. The paths in `run.mts` point at that session's
scratch folder and want editing before it runs again.
