#!/usr/bin/env bash
set -euo pipefail

# Captures App Store visual evidence for every AliStore iOS app on the Apple base
# device classes (6.9" iPhone and 13" iPad). Usage:
#   bash apps/ios/scripts/visual-capture.sh                 # all apps, both devices
#   bash apps/ios/scripts/visual-capture.sh client staff    # selected apps
#   IOS_VISUAL_DEVICES="iphone" bash apps/ios/scripts/visual-capture.sh pos

repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/../../.." && pwd)"
ios_root="$repo_root/apps/ios"
developer_dir="${DEVELOPER_DIR:-/Applications/Xcode.app/Contents/Developer}"
# xcode-select may point at CommandLineTools, where `xcrun simctl` does not exist.
simctl="$developer_dir/usr/bin/simctl"

metadata_value() {
  node -e "const fs=require('fs');const m=JSON.parse(fs.readFileSync(process.argv[1],'utf8'));const parts=process.argv[2].split('.');let v=m;for(const p of parts){v=v?.[p]}if(v===undefined||v===null){process.exit(1)}console.log(v)" \
    "$1" "$2"
}

# Apple only accepts the base classes, so a missing simulator must be created rather
# than silently falling back to whatever device happens to be installed.
resolve_simulator_udid() {
  local simulator="$1" udid runtime device_type

  udid="$(
    "$simctl" list devices available -j |
      node -e "let s='';process.stdin.on('data',d=>s+=d).on('end',()=>{const j=JSON.parse(s);const d=Object.values(j.devices).flat().find(x=>x.name===process.argv[1]&&x.isAvailable);if(!d)process.exit(1);console.log(d.udid)})" \
        "$simulator" 2>/dev/null
  )" || udid=""

  if [[ -n "$udid" ]]; then
    printf '%s\n' "$udid"
    return 0
  fi

  device_type="$(
    "$simctl" list devicetypes -j |
      node -e "let s='';process.stdin.on('data',d=>s+=d).on('end',()=>{const j=JSON.parse(s);const t=j.devicetypes.find(x=>x.name===process.argv[1]);if(!t)process.exit(1);console.log(t.identifier)})" \
        "$simulator"
  )" || {
    printf 'ios visual capture: no simulator device type named "%s" is installed\n' "$simulator" >&2
    return 1
  }

  runtime="$(
    "$simctl" list runtimes -j |
      node -e "let s='';process.stdin.on('data',d=>s+=d).on('end',()=>{const j=JSON.parse(s);const r=j.runtimes.filter(x=>x.isAvailable&&x.identifier.includes('iOS')).pop();if(!r)process.exit(1);console.log(r.identifier)})"
  )" || {
    printf 'ios visual capture: no available iOS runtime to create "%s"\n' "$simulator" >&2
    return 1
  }

  printf 'ios visual capture: creating missing simulator "%s" (%s)\n' "$simulator" "$runtime" >&2
  "$simctl" create "$simulator" "$device_type" "$runtime"
}

run_ui_test() {
  local simulator_udid="$1" test_identifier="$2" result_bundle="$3" label="$4"
  local attempt

  for attempt in 1 2 3; do
    rm -rf "$result_bundle"
    if DEVELOPER_DIR="$developer_dir" \
      xcodebuild test \
        -project "$ios_root/AliStoreNative.xcodeproj" \
        -scheme AliStoreUITests \
        -destination "platform=iOS Simulator,id=$simulator_udid" \
        -only-testing:"$test_identifier" \
        -resultBundlePath "$result_bundle" \
        CODE_SIGNING_ALLOWED=NO; then
      return 0
    fi

    if [[ "$attempt" -eq 3 ]]; then
      printf 'ios visual capture (%s): %s failed after %s attempts\n' \
        "$label" "$test_identifier" "$attempt" >&2
      return 1
    fi

    printf 'ios visual capture (%s): retrying %s after simulator restart\n' \
      "$label" "$test_identifier" >&2
    "$simctl" shutdown "$simulator_udid" || true
  done
}

merge_attachment_dirs() {
  node -e "
    const fs = require('fs');
    const path = require('path');
    const output = process.argv[1];
    const sources = process.argv.slice(2);
    const combined = [];
    for (const [index, source] of sources.entries()) {
      const manifest = JSON.parse(fs.readFileSync(path.join(source, 'manifest.json'), 'utf8'));
      for (const entry of manifest) {
        for (const attachment of entry.attachments ?? []) {
          const original = attachment.exportedFileName;
          const renamed = 'part' + (index + 1) + '-' + original;
          fs.copyFileSync(path.join(source, original), path.join(output, renamed));
          attachment.exportedFileName = renamed;
        }
        combined.push(entry);
      }
    }
    fs.writeFileSync(path.join(output, 'manifest.json'), JSON.stringify(combined, null, 2) + '\n');
  " "$@"
}

capture_app_device() {
  local app_key="$1" device_key="$2"
  local metadata_file title test_class test_names simulator source attachments_dir
  local expected_count actual_count simulator_udid label part_dirs part_index test_name

  metadata_file="$ios_root/store/${app_key}-metadata.json"
  case "$app_key" in
    client)
      title="Client"
      test_class="AliStoreClientUITests"
      # The Client evidence is split into three tests so a single run stays under the timeout.
      test_names="testClientPrototypeVisualEvidencePart1 testClientPrototypeVisualEvidencePart2 testClientPrototypeVisualEvidencePart3"
      ;;
    staff) title="Staff"; test_class="AliStoreStaffUITests"; test_names="testPublicStoreVisualEvidence" ;;
    courier) title="Courier"; test_class="AliStoreCourierUITests"; test_names="testPublicStoreVisualEvidence" ;;
    pos) title="POS"; test_class="AliStorePOSUITests"; test_names="testPublicStoreVisualEvidence" ;;
    *) printf 'ios visual capture: unknown app "%s"\n' "$app_key" >&2; exit 1 ;;
  esac

  label="$app_key/$device_key"
  simulator="$(metadata_value "$metadata_file" "screenshots.devices.$device_key.simulator")"
  source="$(metadata_value "$metadata_file" "screenshots.devices.$device_key.source")"
  expected_count="$(metadata_value "$metadata_file" 'screenshots.requiredPngCount')"
  attachments_dir="$repo_root/$source"
  simulator_udid="$(resolve_simulator_udid "$simulator")"

  rm -rf "$attachments_dir"
  mkdir -p "$attachments_dir"

  part_dirs=()
  part_index=0
  for test_name in $test_names; do
    part_index=$((part_index + 1))
    local result_bundle="$ios_root/build/AliStore${title}Visual-${device_key}-part${part_index}.xcresult"
    local part_attachments="$ios_root/build/AliStore${title}Visual-${device_key}-part${part_index}-attachments"
    rm -rf "$result_bundle" "$part_attachments"

    run_ui_test "$simulator_udid" "${test_class}/${test_class}/${test_name}" \
      "$result_bundle" "$label" || exit 1

    DEVELOPER_DIR="$developer_dir" \
      xcrun xcresulttool export attachments \
        --path "$result_bundle" \
        --output-path "$part_attachments" >/dev/null
    part_dirs+=("$part_attachments")
  done

  merge_attachment_dirs "$attachments_dir" "${part_dirs[@]}"

  actual_count="$(find "$attachments_dir" -type f -name '*.png' -print | wc -l | tr -d ' ')"
  [[ "$actual_count" -eq "$expected_count" ]] || {
    printf 'ios visual capture (%s): expected %s PNG attachments, got %s\n' \
      "$label" "$expected_count" "$actual_count" >&2
    exit 1
  }

  printf 'ios visual capture (%s): passed with %s PNG attachments on %s\n' \
    "$label" "$actual_count" "$simulator"
}

apps=("$@")
if [[ "${#apps[@]}" -eq 0 ]]; then
  # shellcheck disable=SC2206
  apps=(${IOS_VISUAL_APPS:-client staff courier pos})
fi
# shellcheck disable=SC2206
devices=(${IOS_VISUAL_DEVICES:-iphone ipad})

for device in "${devices[@]}"; do
  for app in "${apps[@]}"; do
    capture_app_device "$app" "$device"
  done
done
