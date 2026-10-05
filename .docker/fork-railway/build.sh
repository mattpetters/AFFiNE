#!/bin/sh
# Builds the Docker context for the fork overlay image.
#
#   .docker/fork-railway/build.sh <git-ref> <work-dir> [app-version]
#
# <work-dir> gets a detached worktree of <git-ref> (work-dir/src) and the
# finished Docker context (work-dir/ctx). Deploy the context with:
#
#   railway up <work-dir>/ctx --path-as-root -s affine -e production
#
# The app version must match the base image so clients see no version change.
#
# Set NATIVE_X64 to a server-native.x64.node from build-native.sh to ship the
# fork's native module. Without it the image keeps upstream's, and Rust-side
# changes in the fork are not deployed.
set -eu

REF="${1:?git ref to build}"
WORK="${2:?work directory}"
VERSION="${3:-2026.9.30-canary.909}"
REPO="$(git rev-parse --show-toplevel)"
SRC="$WORK/src"
CTX="$WORK/ctx"
NATIVE_X64="${NATIVE_X64:-}"
if [ -n "$NATIVE_X64" ]; then
  # the build changes directory, so pin the path now
  NATIVE_X64="$(cd "$(dirname "$NATIVE_X64")" && pwd)/$(basename "$NATIVE_X64")"
fi
yarn() { node "$SRC/.yarn/releases/yarn-4.18.0.cjs" "$@"; }

mkdir -p "$WORK"
if [ -d "$SRC" ]; then
  # the previous build left version bumps and placeholders behind
  git -C "$SRC" checkout --quiet --force --detach "$REF"
else
  git -C "$REPO" worktree add --quiet --detach "$SRC" "$REF"
fi

cd "$SRC"
yarn install --immutable
for dir in $(yarn workspaces list --json | jq -r '.location'); do
  if [ -f "$dir/package.json" ]; then
    jq --arg v "$VERSION" '.version = $v' "$dir/package.json" > "$dir/package.json.tmp"
    mv "$dir/package.json.tmp" "$dir/package.json"
  fi
done

# The server bundler copies every native module variant, so each must exist.
# Only main.js and, if given, the real x64 module go into the image.
for arch in x64 arm64 armv7; do
  : > "packages/backend/native/server-native.$arch.node"
done

export BUILD_TYPE=canary
yarn affine @affine/web build
yarn affine @affine/mobile build
yarn workspace @affine/server build

rm -rf "$CTX"
mkdir -p "$CTX/dist"
cp "$REPO/.docker/fork-railway/Dockerfile" "$REPO/.docker/fork-railway/railway.json" "$CTX/"
cp packages/backend/server/dist/main.js packages/backend/server/dist/main.js.map "$CTX/dist/"
NATIVE_FROM=upstream
if [ -n "$NATIVE_X64" ]; then
  test -s "$NATIVE_X64"
  cp "$NATIVE_X64" "$CTX/dist/server-native.x64.node"
  NATIVE_FROM=fork
fi
cp -R packages/frontend/apps/web/dist "$CTX/web"
cp -R packages/frontend/apps/mobile/dist "$CTX/mobile"
# like the upstream image, ship server sourcemaps only
find "$CTX/web" "$CTX/mobile" -name '*.map' -delete

test -s "$CTX/dist/main.js" && test -f "$CTX/web/index.html" && test -f "$CTX/mobile/index.html"
echo "context ready: $CTX ($(git rev-parse --short HEAD), version $VERSION, $NATIVE_FROM native module)"
