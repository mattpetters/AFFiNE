#!/bin/sh
# Builds the fork's iOS app and installs it on a connected iPhone.
#
#   packages/frontend/apps/ios/fork-install.sh [device-id]
#
# A free personal Apple team signs for 7 days, so rerun this weekly. Needs
# Node 22 on PATH, Xcode signed in to the Apple ID, CocoaPods, and the Rust
# target aarch64-apple-ios. Set IOS_DERIVED_DATA to reuse a build directory.
set -eu

APP_DIR=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)
REPO_DIR=$(CDPATH= cd -- "$APP_DIR/../../../.." && pwd)
BUNDLE_ID=cc.papertrails.affine
DERIVED="${IOS_DERIVED_DATA:-$REPO_DIR/target/ios-fork}"

DEVICE="${1:-${IOS_DEVICE_ID:-}}"
if [ -z "$DEVICE" ]; then
  # first paired physical device, e.g. 00008130-000260383EF2001C
  DEVICE=$(xcrun devicectl list devices | awk '
    /physical/ && !/unavailable/ {
      for (i = 1; i <= NF; i++)
        if ($i ~ /^[0-9A-F]+-[0-9A-F]+$/ && length($i) == 25) { print $i; exit }
    }')
fi
if [ -z "$DEVICE" ]; then
  echo "no connected iPhone found; pass its identifier" >&2
  exit 1
fi

# the affine CLI shells out to `yarn`, which is not always on PATH
if ! command -v yarn >/dev/null 2>&1; then
  SHIM=$(mktemp -d)
  trap 'rm -rf "$SHIM"' EXIT
  printf '#!/bin/sh\nexec node "%s/.yarn/releases/yarn-4.18.0.cjs" "$@"\n' "$REPO_DIR" > "$SHIM/yarn"
  chmod +x "$SHIM/yarn"
  PATH="$SHIM:$PATH"
  export PATH
fi

cd "$REPO_DIR"
BUILD_TYPE=canary PUBLIC_PATH=/ yarn affine @affine/ios build
yarn affine @affine/ios cap sync

cd "$APP_DIR/App"
xcodebuild -workspace App.xcworkspace -scheme App -configuration Release \
  -destination "id=$DEVICE" -derivedDataPath "$DERIVED" \
  -allowProvisioningUpdates -skipPackagePluginValidation -skipMacroValidation \
  build

xcrun devicectl device install app --device "$DEVICE" \
  "$DERIVED/Build/Products/Release-iphoneos/AFFiNE.app"
xcrun devicectl device process launch --device "$DEVICE" "$BUNDLE_ID" ||
  echo "installed; unlock the phone and open AFFiNE"
