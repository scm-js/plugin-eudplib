#!/bin/sh
# Run a command in the spike toolchain with caches persisted under ./home
exec docker run --rm --user "$(id -u):$(id -g)" -v "$PWD:/work" -w /work \
  -e HOME=/work/home -e RUSTUP_HOME=/work/home/rustup -e CARGO_HOME=/work/home/cargo \
  -e PATH=/work/home/cargo/bin:/opt/cargo/bin:/usr/local/bin:/usr/bin:/bin \
  eudplib-wasm-spike "$@"
