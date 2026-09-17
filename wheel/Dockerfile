# Toolchain for building eudplib's Rust extension as a Pyodide wheel (spike, 2026-09-17).
# The host Python must match the Pyodide target (3.14); pyodide-build fetches the
# cross-build environment and Emscripten SDK itself on first use into $HOME's cache.
FROM python:3.14-bookworm
RUN apt-get update && apt-get install -y --no-install-recommends curl git build-essential cmake xz-utils ca-certificates \
 && rm -rf /var/lib/apt/lists/*
RUN curl -fsSL https://nodejs.org/dist/v24.13.0/node-v24.13.0-linux-x64.tar.xz | tar -xJ -C /usr/local --strip-components=1 \
 && node --version
RUN pip install --no-cache-dir "pyodide-build==0.39.0" "maturin>=1,<2" build
ENV RUSTUP_HOME=/opt/rustup CARGO_HOME=/opt/cargo PATH=/opt/cargo/bin:$PATH
RUN curl -sSf https://sh.rustup.rs | sh -s -- -y --no-modify-path --default-toolchain none --profile minimal
WORKDIR /work
