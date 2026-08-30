#!/usr/bin/env bash
# Build for iOS Simulator, boot simulator (if needed), install and launch the app.
# Does not require a paid Apple Developer account.
#
# Usage:
#   npm run run:ios
#   ./scripts/run-ios-simulator.sh
#
# Env overrides:
#   IOS_SIMULATOR_UDID=<uuid>  — target simulator (default: booted, else first iPhone)
#   SKIP_BUILD=1               — skip `npm run build:ios`
#   SKIP_XCODEBUILD=1          — skip compile (reuse last .app in derived data)
#   SHOW_LOGS=1                — print recent simulator logs after launch

set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

APP_ID="$(node --input-type=module -e "import { readCapacitorAppId } from './scripts/capacitor-config.mjs'; console.log(readCapacitorAppId(process.cwd()));")"
DERIVED_DATA="$ROOT/.derived-data/ios"
APP_BUNDLE="$DERIVED_DATA/Build/Products/Debug-iphonesimulator/App.app"
IOS_WORKSPACE="ios/App/App.xcworkspace"

log() {
  printf '[run:ios] %s\n' "$*" >&2
}

fail() {
  printf '[run:ios] ERROR: %s\n' "$*" >&2
  exit 1
}

require_cmd() {
  command -v "$1" >/dev/null 2>&1 || fail "Missing command: $1"
}

simulator_udid() {
  if [[ -n "${IOS_SIMULATOR_UDID:-}" ]]; then
    printf '%s' "$IOS_SIMULATOR_UDID"
    return
  fi

  local booted
  booted="$(xcrun simctl list devices booted 2>/dev/null | grep -Eo '[0-9A-F-]{36}' | head -1 || true)"
  if [[ -n "$booted" ]]; then
    printf '%s' "$booted"
    return
  fi

  local first_iphone
  first_iphone="$(xcrun simctl list devices available 2>/dev/null \
    | grep -E '^\s+iPhone' \
    | grep -Eo '[0-9A-F-]{36}' \
    | head -1 || true)"
  [[ -n "$first_iphone" ]] || fail 'No iOS Simulator found. Install an iPhone runtime in Xcode → Settings → Platforms'
  printf '%s' "$first_iphone"
}

focus_simulator() {
  local udid="$1"
  defaults write com.apple.iphonesimulator CurrentDeviceUDID "$udid" 2>/dev/null || true
  open -a Simulator >/dev/null 2>&1 || true
}

ensure_simulator() {
  local udid="$1"
  local state
  state="$(xcrun simctl list devices 2>/dev/null | grep "$udid" | grep -Eo '\([^)]+\)' | tr -d '()' || true)"

  if [[ "$state" != "Booted" ]]; then
    log "Booting simulator $udid"
    xcrun simctl boot "$udid" 2>/dev/null || true
  fi

  focus_simulator "$udid"
  xcrun simctl bootstatus "$udid" -b >/dev/null
  printf '%s' "$udid"
}

[[ "$(uname -s)" == "Darwin" ]] || fail 'iOS Simulator requires macOS with Xcode'

require_cmd npm
require_cmd xcodebuild
require_cmd xcrun

if [[ "${SKIP_BUILD:-}" != "1" ]]; then
  log 'Running npm run build:ios...'
  npm run build:ios
else
  log 'SKIP_BUILD=1 — skipping Capacitor web + sync build'
fi

[[ -d "$IOS_WORKSPACE" ]] || fail "Missing $IOS_WORKSPACE — run npm run build:ios first"

UDID="$(simulator_udid)"
UDID="$(ensure_simulator "$UDID")"
log "Using simulator: $UDID"

if [[ "${SKIP_XCODEBUILD:-}" != "1" ]]; then
  if [[ "${SKIP_BUILD:-}" == "1" ]]; then
    log 'Applying iOS native templates (SKIP_BUILD=1)...'
    node scripts/apply-ios-native.mjs pre-sync
    if [[ ! -f ios/App/Podfile.lock ]]; then
      require_cmd pod
      log 'Resolving iOS pods after Podfile change...'
      (cd ios/App && pod install --repo-update)
    fi
    node scripts/apply-ios-native.mjs
  fi
  log 'Compiling for iOS Simulator (xcodebuild)...'
  xcodebuild \
    -workspace "$IOS_WORKSPACE" \
    -scheme App \
    -configuration Debug \
    -destination "id=$UDID" \
    -derivedDataPath "$DERIVED_DATA" \
    build
else
  log 'SKIP_XCODEBUILD=1 — reusing existing build in .derived-data/ios'
fi

[[ -d "$APP_BUNDLE" ]] || fail "App bundle not found at $APP_BUNDLE"

focus_simulator "$UDID"

log "Installing $APP_BUNDLE"
xcrun simctl install "$UDID" "$APP_BUNDLE"

log "Launching $APP_ID"
PID="$(xcrun simctl launch --terminate-running-process "$UDID" "$APP_ID")"
log "Launched with pid: $PID"

sleep 1
focus_simulator "$UDID"

log 'Done — app should be open in iOS Simulator'

if [[ "${SHOW_LOGS:-}" == "1" ]]; then
  log 'Recent App process logs:'
  xcrun simctl spawn "$UDID" log show \
    --predicate 'process == "App"' \
    --last 1m \
    --style compact 2>/dev/null | tail -40 || true
fi
