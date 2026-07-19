#!/usr/bin/env bash
set -euo pipefail

repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/../../.." && pwd)"
ios_root="$repo_root/apps/ios"
developer_dir="/Applications/Xcode.app/Contents/Developer"

capture_app_device() {
  local app_key="$1"
  local test_class="$2"
  local device_key="$3"
  local title metadata_file simulator source attachments_dir expected_count simulator_udid
  local attempt result_bundle

  case "$app_key" in
    staff) title="Staff" ;;
    courier) title="Courier" ;;
    pos) title="POS" ;;
    *) printf 'Unknown ecosystem app: %s\n' "$app_key" >&2; exit 1 ;;
  esac

  metadata_file="$ios_root/store/${app_key}-metadata.json"
  simulator="$(
    node -e "const fs=require('fs'); const m=JSON.parse(fs.readFileSync(process.argv[1], 'utf8')); console.log(m.screenshots.devices[process.argv[2]].simulator)" \
      "$metadata_file" "$device_key"
  )"
  source="$(
    node -e "const fs=require('fs'); const m=JSON.parse(fs.readFileSync(process.argv[1], 'utf8')); console.log(m.screenshots.devices[process.argv[2]].source)" \
      "$metadata_file" "$device_key"
  )"
  expected_count="$(
    node -e "const fs=require('fs'); const m=JSON.parse(fs.readFileSync(process.argv[1], 'utf8')); console.log(m.screenshots.requiredPngCount)" \
      "$metadata_file"
  )"
  attachments_dir="$repo_root/$source"
  result_bundle="$ios_root/build/AliStore${title}Visual-${device_key}.xcresult"
  simulator_udid="$(
    DEVELOPER_DIR="$developer_dir" xcrun simctl list devices available -j |
      node -e "let s=''; process.stdin.on('data',d=>s+=d).on('end',()=>{const j=JSON.parse(s); const d=Object.values(j.devices).flat().find(x=>x.name===process.argv[1]&&x.isAvailable); if(!d) process.exit(1); console.log(d.udid)})" \
        "$simulator"
  )"

  rm -rf "$attachments_dir" "$result_bundle"
  mkdir -p "$attachments_dir"

  for attempt in 1 2 3; do
    if DEVELOPER_DIR="$developer_dir" \
      xcodebuild test \
        -project "$ios_root/AliStoreNative.xcodeproj" \
        -scheme AliStoreUITests \
        -destination "platform=iOS Simulator,id=$simulator_udid" \
        -only-testing:"${test_class}/${test_class}/testPublicStoreVisualEvidence" \
        -resultBundlePath "$result_bundle" \
        CODE_SIGNING_ALLOWED=NO; then
      break
    fi

    if [[ "$attempt" -eq 3 ]]; then
      printf 'ios ecosystem visual (%s/%s): failed after %s attempts\n' \
        "$app_key" "$device_key" "$attempt" >&2
      exit 1
    fi

    printf 'ios ecosystem visual (%s/%s): retrying after simulator restart\n' \
      "$app_key" "$device_key" >&2
    rm -rf "$result_bundle"
    DEVELOPER_DIR="$developer_dir" xcrun simctl shutdown "$simulator_udid" || true
  done

  DEVELOPER_DIR="$developer_dir" \
    xcrun xcresulttool export attachments \
      --path "$result_bundle" \
      --output-path "$attachments_dir" >/dev/null

  local actual_count
  actual_count="$(find "$attachments_dir" -type f -name '*.png' -print | wc -l | tr -d ' ')"
  [[ "$actual_count" -eq "$expected_count" ]] || {
    printf 'ios ecosystem visual (%s/%s): expected %s PNG attachments, got %s\n' \
      "$app_key" "$device_key" "$expected_count" "$actual_count" >&2
    exit 1
  }

  printf 'ios ecosystem visual (%s/%s): passed with %s PNG attachments on %s\n' \
    "$app_key" "$device_key" "$actual_count" "$simulator"
}

apps="${ECOSYSTEM_APPS:-staff courier pos}"
devices="${ECOSYSTEM_DEVICES:-iphone ipad}"

for device in $devices; do
  for app in $apps; do
    case "$app" in
      staff) test_class="AliStoreStaffUITests" ;;
      courier) test_class="AliStoreCourierUITests" ;;
      pos) test_class="AliStorePOSUITests" ;;
      *) printf 'Unknown ecosystem app: %s\n' "$app" >&2; exit 1 ;;
    esac
    capture_app_device "$app" "$test_class" "$device"
  done
done
