#!/bin/sh
set -eu

APP_DIR=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)
REPO_DIR=$(CDPATH= cd -- "$APP_DIR/../../../.." && pwd)
cd "$REPO_DIR"

# Use Node 22 and a Rust toolchain >= 1.77.2. Set RUSTUP_TOOLCHAIN to
# override the monorepo's pinned Rust version without changing it globally.
PUBLIC_PATH=/ node tools/cli/bin/runner.js affine.ts bundle -p @affine/web
node "$APP_DIR/prepare.mjs"
cd "$APP_DIR"
npx --yes --package @tauri-apps/cli@2.12.1 tauri build --bundles app "$@"
