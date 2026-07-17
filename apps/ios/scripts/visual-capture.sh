#!/usr/bin/env bash
set -euo pipefail

repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/../../.." && pwd)"
ios_root="$repo_root/apps/ios"
result_bundle="$ios_root/build/AliStoreClientVisual.xcresult"
attachments_dir="$ios_root/build/AliStoreClientVisual-attachments"

rm -rf "$result_bundle" "$attachments_dir"

DEVELOPER_DIR="${DEVELOPER_DIR:-/Applications/Xcode.app/Contents/Developer}" \
  xcodebuild test \
    -project "$ios_root/AliStoreNative.xcodeproj" \
    -scheme AliStoreUITests \
    -destination 'platform=iOS Simulator,name=iPhone 17 Pro' \
    -only-testing:AliStoreClientUITests/AliStoreClientUITests/testClientPrototypeVisualEvidence \
    -resultBundlePath "$result_bundle" \
    CODE_SIGNING_ALLOWED=NO

DEVELOPER_DIR="${DEVELOPER_DIR:-/Applications/Xcode.app/Contents/Developer}" \
  xcrun xcresulttool export attachments \
    --path "$result_bundle" \
    --output-path "$attachments_dir" >/dev/null

expected_attachment_count=17
attachment_count="$(find "$attachments_dir" -type f -name '*.png' -print | wc -l | tr -d ' ')"
[[ "$attachment_count" -eq "$expected_attachment_count" ]] || {
  printf 'ios visual capture: expected %s PNG attachments, got %s\n' "$expected_attachment_count" "$attachment_count" >&2
  exit 1
}

printf 'ios visual capture passed with %s PNG attachments\n' "$attachment_count"
