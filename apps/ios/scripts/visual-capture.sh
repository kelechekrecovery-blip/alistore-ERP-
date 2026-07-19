#!/usr/bin/env bash
set -euo pipefail

repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/../../.." && pwd)"
ios_root="$repo_root/apps/ios"
metadata_file="$ios_root/store/client-metadata.json"
developer_dir="/Applications/Xcode.app/Contents/Developer"

capture_device() {
  local device_key="$1"
  local simulator source attachments_dir expected_attachment_count attachment_count simulator_udid
  local part attempt result_bundle part_attachments

  simulator="$(
    node -e "const fs=require('fs'); const m=JSON.parse(fs.readFileSync(process.argv[1], 'utf8')); console.log(m.screenshots.devices[process.argv[2]].simulator)" \
      "$metadata_file" "$device_key"
  )"
  source="$(
    node -e "const fs=require('fs'); const m=JSON.parse(fs.readFileSync(process.argv[1], 'utf8')); console.log(m.screenshots.devices[process.argv[2]].source)" \
      "$metadata_file" "$device_key"
  )"
  expected_attachment_count="$(
    node -e "const fs=require('fs'); const m=JSON.parse(fs.readFileSync(process.argv[1], 'utf8')); console.log(m.screenshots.requiredPngCount)" \
      "$metadata_file"
  )"
  attachments_dir="$repo_root/$source"
  simulator_udid="$(
    DEVELOPER_DIR="$developer_dir" xcrun simctl list devices available -j |
      node -e "let s=''; process.stdin.on('data',d=>s+=d).on('end',()=>{const j=JSON.parse(s); const d=Object.values(j.devices).flat().find(x=>x.name===process.argv[1]&&x.isAvailable); if(!d) process.exit(1); console.log(d.udid)})" \
        "$simulator"
  )"

  rm -rf "$attachments_dir"
  mkdir -p "$attachments_dir"

  for part in 1 2 3; do
    result_bundle="$ios_root/build/AliStoreClientVisual-${device_key}-part${part}.xcresult"
    part_attachments="$ios_root/build/AliStoreClientVisual-${device_key}-part${part}-attachments"
    rm -rf "$result_bundle" "$part_attachments"

    for attempt in 1 2 3; do
      if DEVELOPER_DIR="$developer_dir" \
        xcodebuild test \
          -project "$ios_root/AliStoreNative.xcodeproj" \
          -scheme AliStoreUITests \
          -destination "platform=iOS Simulator,id=$simulator_udid" \
          -only-testing:"AliStoreClientUITests/AliStoreClientUITests/testClientPrototypeVisualEvidencePart${part}" \
          -resultBundlePath "$result_bundle" \
          CODE_SIGNING_ALLOWED=NO; then
        break
      fi

      if [[ "$attempt" -eq 3 ]]; then
        printf 'ios visual capture (%s): part %s failed after %s attempts\n' \
          "$device_key" "$part" "$attempt" >&2
        exit 1
      fi

      printf 'ios visual capture (%s): retrying part %s after simulator restart\n' \
        "$device_key" "$part" >&2
      rm -rf "$result_bundle"
      DEVELOPER_DIR="$developer_dir" xcrun simctl shutdown "$simulator_udid" || true
    done

    DEVELOPER_DIR="$developer_dir" \
      xcrun xcresulttool export attachments \
        --path "$result_bundle" \
        --output-path "$part_attachments" >/dev/null
  done

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
  " "$attachments_dir" \
    "$ios_root/build/AliStoreClientVisual-${device_key}-part1-attachments" \
    "$ios_root/build/AliStoreClientVisual-${device_key}-part2-attachments" \
    "$ios_root/build/AliStoreClientVisual-${device_key}-part3-attachments"

  attachment_count="$(find "$attachments_dir" -type f -name '*.png' -print | wc -l | tr -d ' ')"
  [[ "$attachment_count" -eq "$expected_attachment_count" ]] || {
    printf 'ios visual capture (%s): expected %s PNG attachments, got %s\n' \
      "$device_key" "$expected_attachment_count" "$attachment_count" >&2
    exit 1
  }

  printf 'ios visual capture (%s): passed with %s PNG attachments on %s\n' \
    "$device_key" "$attachment_count" "$simulator"
}

capture_device iphone
capture_device ipad
