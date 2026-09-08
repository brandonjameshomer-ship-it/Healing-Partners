#!/bin/zsh
# Open the Healing Partners pages in real mobile Safari on the iOS Simulator and
# screenshot each one. Needs Xcode with an iOS runtime installed.
#
#   sim/run.sh                       # default devices, light + dark
#   sim/run.sh "iPhone SE (3rd generation)"
#   BASE=http://localhost:8788 sim/run.sh
#
# Screenshots land in shots/sim-<device>/<page>-<appearance>.png
set -u
cd "${0:A:h}/.."                                   # playwright-mobile-demo/

# Prefer a full Xcode even if xcode-select still points at the Command Line Tools.
if [[ -z "${DEVELOPER_DIR:-}" && -d /Applications/Xcode.app/Contents/Developer ]]; then
  export DEVELOPER_DIR=/Applications/Xcode.app/Contents/Developer
fi
if ! xcrun simctl help >/dev/null 2>&1; then
  echo "simctl not available — install Xcode and an iOS runtime first (see sim/SIMULATOR.md)"; exit 1
fi

BASE=${BASE:-http://localhost:8788}
PAGES=(
  "hub|/index.html"
  "hub-vr|/index.html#vr"
  "hub-voice|/index.html#voice"
  "hub-plot|/index.html#plot"
  "interview|/remember-them/"
  "designer|/remember-them/designer.html"
  "intake|/remember-them/intake.html"
  "life-interview|/apps/life-interview/"
)
DEFAULT_DEVICES=("iPhone SE (3rd generation)" "iPhone 16" "iPhone 16 Pro Max" "iPad (10th generation)")
DEVICES=("$@"); (( ${#DEVICES} )) || DEVICES=("${DEFAULT_DEVICES[@]}")

# Serve the repo if nothing is listening.
if ! curl -s -o /dev/null "$BASE/index.html"; then
  (node tests/serve.cjs .. 8788 >/dev/null 2>&1 &)
  for i in {1..50}; do curl -s -o /dev/null "$BASE/index.html" && break; sleep 0.2; done
  STARTED_SERVER=1
fi

available() { xcrun simctl list devices available | grep -F "$1 (" | head -1 | sed -E 's/.*\(([0-9A-F-]{36})\).*/\1/'; }

for dev in "${DEVICES[@]}"; do
  udid=$(available "$dev")
  if [[ -z "$udid" ]]; then echo "skip: no available simulator named '$dev'"; continue; fi
  slug=${dev//[^A-Za-z0-9]/-}
  out="shots/sim-$slug"; mkdir -p "$out"
  echo "== $dev ($udid)"
  xcrun simctl boot "$udid" 2>/dev/null || true
  xcrun simctl bootstatus "$udid" -b >/dev/null
  open -a Simulator --args -CurrentDeviceUDID "$udid" >/dev/null 2>&1 || true

  for appearance in light dark; do
    xcrun simctl ui "$udid" appearance "$appearance" >/dev/null
    for entry in "${PAGES[@]}"; do
      name=${entry%%|*}; path=${entry#*|}
      xcrun simctl openurl "$udid" "$BASE$path"
      sleep 3                                     # let Safari settle; the hub scrolls to #panels
      xcrun simctl io "$udid" screenshot "$out/$name-$appearance.png" >/dev/null
      echo "   $name ($appearance) -> $out/$name-$appearance.png"
    done
  done
done

echo "Done. Simulators are left booted; run 'xcrun simctl shutdown all' to stop them."
(( ${STARTED_SERVER:-0} )) && pkill -f "tests/serve.cjs .. 8788" 2>/dev/null
exit 0
