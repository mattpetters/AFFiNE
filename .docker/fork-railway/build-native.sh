#!/bin/sh
# Builds the server's native module for linux/amd64 in Docker.
#
#   AFFINE_PRO_PUBLIC_KEY="$(cat key.pem)" \
#     .docker/fork-railway/build-native.sh <git-ref> <out-dir>
#
# Writes <out-dir>/server-native.x64.node. A self-hosted server refuses to
# start unless the license public key is embedded at compile time, so the key
# is required. Pass the result to build.sh through NATIVE_X64.
set -eu

REF="${1:?git ref to build}"
OUT="${2:?output directory}"
: "${AFFINE_PRO_PUBLIC_KEY:?set AFFINE_PRO_PUBLIC_KEY to the PEM public key}"
REPO="$(git rev-parse --show-toplevel)"

SRC="$(mktemp -d)"
trap 'rm -rf "$SRC"' EXIT
git -C "$REPO" archive "$REF" | tar -x -C "$SRC"
mkdir -p "$OUT"
OUT="$(cd "$OUT" && pwd)"

# the cargo target lives in a volume: bind mounts are slow and the cache
# makes rebuilds incremental
docker volume create affine-native-target >/dev/null
docker run --rm --platform linux/amd64 -e AFFINE_PRO_PUBLIC_KEY \
  -v "$SRC":/src -v "$OUT":/out -v affine-native-target:/cargo-target \
  node:22-bookworm sh -euc '
    export DEBIAN_FRONTEND=noninteractive
    apt-get update -qq
    apt-get install -y -qq --no-install-recommends \
      clang cmake build-essential pkg-config perl curl ca-certificates git >/dev/null
    toolchain=$(grep channel /src/rust-toolchain.toml | cut -d\" -f2)
    curl -sSf https://sh.rustup.rs |
      sh -s -- -y --default-toolchain "$toolchain" --profile minimal >/dev/null
    . "$HOME/.cargo/env"
    cd /src
    node .yarn/releases/yarn-4.18.0.cjs workspaces focus @affine/server-native
    export CC="clang -D_BSD_SOURCE" TARGET_CC="clang -D_BSD_SOURCE"
    export CARGO_TARGET_DIR=/cargo-target
    node .yarn/releases/yarn-4.18.0.cjs workspace @affine/server-native build \
      --target x86_64-unknown-linux-gnu
    cp packages/backend/native/server-native.node /out/server-native.x64.node
  '
echo "native module ready: $OUT/server-native.x64.node"
