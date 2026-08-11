#!/usr/bin/env bash
# Build debug APK, start Android emulator (if needed), install and launch the app.
#
# Usage:
#   npm run run:android
#   ./scripts/run-android-emulator.sh
#
# Env overrides:
#   ANDROID_AVD=<name>     — AVD to boot (default: first from `emulator -list-avds`)
#   ANDROID_HEADLESS=1     — no emulator window (CI / headless)
#   SKIP_BUILD=1           — skip `npm run build:android`
#   SKIP_GRADLE=1          — skip `./gradlew assembleDebug`
#   BOOT_TIMEOUT_SEC=300   — max wait for emulator boot
#   SHOW_LOGS=1            — tail Capacitor console after launch
#   JAVA_HOME=<path>       — JDK 21+ home (Capacitor 7); auto-detects Android Studio JBR if unset

set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

APP_ID="$(node --input-type=module -e "import { readCapacitorAppId } from './scripts/capacitor-config.mjs'; console.log(readCapacitorAppId(process.cwd()));")"
MAIN_ACTIVITY="${APP_ID}/.MainActivity"
APK_PATH="android/app/build/outputs/apk/debug/app-debug.apk"
BOOT_TIMEOUT_SEC="${BOOT_TIMEOUT_SEC:-300}"

log() {
  printf '[run:android] %s\n' "$*" >&2
}

fail() {
  printf '[run:android] ERROR: %s\n' "$*" >&2
  exit 1
}

require_cmd() {
  command -v "$1" >/dev/null 2>&1 || fail "Missing command: $1"
}

# Capacitor 7 compiles with JavaVersion.VERSION_21 — JDK must be 21+.
java_major_version() {
  local home="$1"
  local java_bin="$home/bin/java"
  [[ -x "$java_bin" ]] || return 1
  "$java_bin" -version 2>&1 | awk -F[\".] '/version/ { print ($2=="1" ? $3 : $2); exit }'
}

is_jdk_21_plus() {
  local major
  major="$(java_major_version "$1" 2>/dev/null || true)"
  [[ -n "$major" && "$major" -ge 21 ]]
}

resolve_java_home() {
  local candidates=()

  if [[ -n "${JAVA_HOME:-}" ]]; then
    candidates+=("$JAVA_HOME")
  fi

  candidates+=(
    "/Applications/Android Studio.app/Contents/jbr/Contents/Home"
    "/Applications/Android Studio.app/Contents/jre/Contents/Home"
    "$HOME/Applications/Android Studio.app/Contents/jbr/Contents/Home"
  )

  if command -v /usr/libexec/java_home >/dev/null 2>&1; then
    local brew_home
    brew_home="$(/usr/libexec/java_home -v 21 2>/dev/null || true)"
    [[ -n "$brew_home" ]] && candidates+=("$brew_home")
  fi

  local candidate
  for candidate in "${candidates[@]}"; do
    if [[ -d "$candidate" ]] && is_jdk_21_plus "$candidate"; then
      printf '%s' "$candidate"
      return 0
    fi
  done

  fail 'Capacitor 7 requires JDK 21+. Install Android Studio (bundled JBR) or set JAVA_HOME to a JDK 21+ path.'
}

resolve_android_home() {
  if [[ -n "${ANDROID_HOME:-}" && -d "$ANDROID_HOME" ]]; then
    printf '%s' "$ANDROID_HOME"
    return
  fi
  if [[ -n "${ANDROID_SDK_ROOT:-}" && -d "$ANDROID_SDK_ROOT" ]]; then
    printf '%s' "$ANDROID_SDK_ROOT"
    return
  fi
  local default="$HOME/Library/Android/sdk"
  if [[ -d "$default" ]]; then
    printf '%s' "$default"
    return
  fi
  fail 'Set ANDROID_HOME to your Android SDK path'
}

resolve_avd() {
  if [[ -n "${ANDROID_AVD:-}" ]]; then
    printf '%s' "$ANDROID_AVD"
    return
  fi
  local first
  first="$("$EMULATOR" -list-avds 2>/dev/null | head -1 || true)"
  [[ -n "$first" ]] || fail 'No AVD found. Create one in Android Studio → Device Manager, or set ANDROID_AVD'
  printf '%s' "$first"
}

adb_device_ready() {
  adb devices 2>/dev/null | awk 'NR>1 && $2=="device" { found=1 } END { exit !found }'
}

wait_for_boot() {
  local deadline=$((SECONDS + BOOT_TIMEOUT_SEC))
  log "Waiting for emulator boot (timeout ${BOOT_TIMEOUT_SEC}s)..."
  adb wait-for-device
  while (( SECONDS < deadline )); do
    local boot
    boot="$(adb shell getprop sys.boot_completed 2>/dev/null | tr -d '\r' || true)"
    if [[ "$boot" == "1" ]]; then
      log 'Emulator boot complete'
      return 0
    fi
    sleep 2
  done
  fail "Emulator did not finish booting within ${BOOT_TIMEOUT_SEC}s"
}

start_emulator() {
  local avd="$1"
  local args=(-avd "$avd" -no-snapshot-load)

  if [[ "${ANDROID_HEADLESS:-}" == "1" ]]; then
    args+=(-no-window -no-audio -no-boot-anim -gpu swiftshader_indirect)
    log "Starting headless emulator: $avd"
  else
    log "Starting emulator: $avd"
  fi

  "$EMULATOR" "${args[@]}" >/tmp/memora-emulator.log 2>&1 &
  log "Emulator log: /tmp/memora-emulator.log"
}

ensure_emulator() {
  if adb_device_ready; then
    log "Using connected device: $(adb devices | awk 'NR>1 && $2=="device" {print $1; exit}')"
    return 0
  fi

  local avd
  avd="$(resolve_avd)"
  start_emulator "$avd"
  wait_for_boot
}

ANDROID_HOME="$(resolve_android_home)"
export ANDROID_HOME
export PATH="$ANDROID_HOME/platform-tools:$ANDROID_HOME/emulator:$PATH"

JAVA_HOME="$(resolve_java_home)"
export JAVA_HOME
export PATH="$JAVA_HOME/bin:$PATH"
log "Using JAVA_HOME=$JAVA_HOME (Java $(java_major_version "$JAVA_HOME"))"

EMULATOR="$ANDROID_HOME/emulator/emulator"
ADB="$ANDROID_HOME/platform-tools/adb"

require_cmd npm
require_cmd java
require_cmd "$EMULATOR"
require_cmd "$ADB"

if [[ "${SKIP_BUILD:-}" != "1" ]]; then
  log 'Running npm run build:android...'
  npm run build:android
else
  log 'SKIP_BUILD=1 — skipping Capacitor web + sync build'
fi

if [[ "${SKIP_GRADLE:-}" != "1" ]]; then
  if [[ "${SKIP_BUILD:-}" == "1" ]]; then
    log 'Applying Android native templates (SKIP_BUILD=1)...'
    node scripts/apply-android-native.mjs
  fi
  log 'Compiling debug APK (./gradlew assembleDebug)...'
  (cd android && ./gradlew assembleDebug --no-daemon)
else
  log 'SKIP_GRADLE=1 — skipping Gradle assembleDebug'
fi

[[ -f "$APK_PATH" ]] || fail "APK not found at $APK_PATH"

"$ADB" start-server >/dev/null 2>&1 || true
ensure_emulator

log "Installing $APK_PATH"
"$ADB" install -r "$APK_PATH"

log "Launching $MAIN_ACTIVITY"
"$ADB" shell am start -n "$MAIN_ACTIVITY"

log "Done — app should be open on the emulator"
log "Package: $APP_ID"

if [[ "${SHOW_LOGS:-}" == "1" ]]; then
  log 'Tailing Capacitor console (Ctrl+C to stop)...'
  "$ADB" logcat -c
  "$ADB" logcat Capacitor/Console:I AndroidRuntime:E '*:S'
fi
