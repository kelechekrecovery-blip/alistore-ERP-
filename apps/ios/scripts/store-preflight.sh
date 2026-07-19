#!/usr/bin/env bash
set -euo pipefail

fail() {
  printf 'store-preflight: %s\n' "$1" >&2
  exit 1
}

repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/../../.." && pwd)"
ios_root="$repo_root/apps/ios"
env_file=""
metadata_file="$ios_root/store/client-metadata.json"
strict_asc="0"
strict_signing="0"

while [[ $# -gt 0 ]]; do
  case "$1" in
    --env-file)
      [[ $# -ge 2 ]] || fail '--env-file requires a path'
      env_file="$2"
      shift 2
      ;;
    --strict-asc)
      strict_asc="1"
      shift
      ;;
    --strict-signing)
      strict_signing="1"
      shift
      ;;
    --help|-h)
      cat <<'USAGE'
Usage: apps/ios/scripts/store-preflight.sh [--env-file path] [--strict-asc] [--strict-signing]

Validates the native iOS Client release configuration without printing secrets.
If --env-file is omitted and apps/ios/.env.production exists, that file is loaded.
Use --strict-asc to verify the App Store Connect API key against Apple's API.
Use --strict-signing to verify Apple Distribution signing material is available.
USAGE
      exit 0
      ;;
    *)
      fail "unknown argument: $1"
      ;;
  esac
done

if [[ -z "$env_file" && -f "$ios_root/.env.production" ]]; then
  env_file="$ios_root/.env.production"
fi

if [[ -n "$env_file" ]]; then
  [[ -f "$env_file" ]] || fail "--env-file does not point to a file: $env_file"
  set -a
  # shellcheck disable=SC1090
  . "$env_file"
  set +a
fi

[[ -f "$metadata_file" ]] || fail 'apps/ios/store/client-metadata.json is required'

node "$repo_root/scripts/validate-ios-store-metadata.mjs" "$metadata_file" \
  || fail 'App Store metadata validation failed'

plist_buddy=/usr/libexec/PlistBuddy
client_plist="$ios_root/Client/Info.plist"
client_privacy="$ios_root/Client/PrivacyInfo.xcprivacy"
client_entitlements="$ios_root/Client/Client.entitlements"

[[ -f "$client_plist" ]] || fail 'Client Info.plist is missing'
[[ -f "$client_privacy" ]] || fail 'Client PrivacyInfo.xcprivacy is missing'
[[ -f "$client_entitlements" ]] || fail 'Client entitlements file is missing'

display_name="$("$plist_buddy" -c 'Print :CFBundleDisplayName' "$client_plist" 2>/dev/null || true)"
[[ "$display_name" == "AliStore" ]] || fail 'Client display name must be AliStore'
short_version="$("$plist_buddy" -c 'Print :CFBundleShortVersionString' "$client_plist" 2>/dev/null || true)"
[[ "$short_version" == '$(MARKETING_VERSION)' ]] || fail 'CFBundleShortVersionString must resolve from MARKETING_VERSION'
build_number="$("$plist_buddy" -c 'Print :CFBundleVersion' "$client_plist" 2>/dev/null || true)"
[[ "$build_number" == '$(CURRENT_PROJECT_VERSION)' ]] || fail 'CFBundleVersion must resolve from CURRENT_PROJECT_VERSION'
face_id_description="$("$plist_buddy" -c 'Print :NSFaceIDUsageDescription' "$client_plist" 2>/dev/null || true)"
[[ "$face_id_description" == "Быстрый и защищённый вход в AliStore" ]] || fail 'NSFaceIDUsageDescription must match the review metadata purpose'
tracking="$("$plist_buddy" -c 'Print :NSPrivacyTracking' "$client_privacy" 2>/dev/null || true)"
[[ "$tracking" == "false" ]] || fail 'PrivacyInfo.xcprivacy must declare NSPrivacyTracking=false'
aps_environment="$("$plist_buddy" -c 'Print :aps-environment' "$client_entitlements" 2>/dev/null || true)"
[[ "$aps_environment" == '$(APS_ENVIRONMENT)' ]] || fail 'Client APNs entitlement must be resolved from APS_ENVIRONMENT'

api_base="${ALISTORE_API_BASE_URL:-${API_BASE_URL:-}}"
team_id="${DEVELOPMENT_TEAM:-${APPLE_DEVELOPMENT_TEAM:-}}"
asc_key_path="${ASC_API_KEY_PATH:-}"
asc_key_id="${ASC_KEY_ID:-}"
issuer_id="${ASC_ISSUER_ID:-}"

[[ -n "$api_base" ]] || fail 'ALISTORE_API_BASE_URL is required'
[[ "$api_base" == https://* ]] || fail 'ALISTORE_API_BASE_URL must use HTTPS'
case "$api_base" in
  *localhost*|*127.0.0.1*|*0.0.0.0*|*staging*|*sandbox*|*dev*)
    fail 'ALISTORE_API_BASE_URL points to a local, staging, sandbox, or development endpoint'
    ;;
esac

if [[ "$strict_asc" == "1" ]]; then
  [[ -n "$asc_key_path" ]] || fail 'ASC_API_KEY_PATH is required for App Store Connect submission'
  [[ -f "$asc_key_path" ]] || fail 'ASC_API_KEY_PATH does not point to a file'
  if [[ -z "$asc_key_id" && "$asc_key_path" =~ AuthKey_([A-Z0-9]{10})\.p8$ ]]; then
    asc_key_id="${BASH_REMATCH[1]}"
  fi
  [[ -n "$asc_key_id" ]] || fail 'ASC_KEY_ID is required or ASC_API_KEY_PATH must be named AuthKey_<KEYID>.p8'
  [[ "$asc_key_id" =~ ^[A-Z0-9]{10}$ ]] || fail 'ASC_KEY_ID must be a 10-character identifier'
  [[ -n "$issuer_id" ]] || fail 'ASC_ISSUER_ID is required for App Store Connect submission'
  [[ "$issuer_id" =~ ^[0-9A-Fa-f]{8}-[0-9A-Fa-f]{4}-[0-9A-Fa-f]{4}-[0-9A-Fa-f]{4}-[0-9A-Fa-f]{12}$ ]] || fail 'ASC_ISSUER_ID must be a UUID'
  node "$repo_root/scripts/verify-app-store-connect.mjs" "$asc_key_path" "$asc_key_id" "$issuer_id" \
    || fail 'App Store Connect API verification failed'
fi

if [[ "$strict_signing" == "1" ]]; then
  [[ -n "$team_id" ]] || fail 'DEVELOPMENT_TEAM or APPLE_DEVELOPMENT_TEAM is required'
  [[ "$team_id" =~ ^[A-Z0-9]{10}$ ]] || fail 'Apple team id must be a 10-character identifier'
  signing_identities="$(security find-identity -v -p codesigning 2>/dev/null || true)"
  if ! printf '%s\n' "$signing_identities" | grep -Eq "Apple Distribution: .+\\($team_id\\)"; then
    fail "Apple Distribution signing identity for team $team_id is required"
  fi

  profile_match="0"
  profile_dirs=(
    "$HOME/Library/MobileDevice/Provisioning Profiles"
    "$HOME/Library/Developer/Xcode/UserData/Provisioning Profiles"
  )
  for profile_dir in "${profile_dirs[@]}"; do
    [[ -d "$profile_dir" ]] || continue
    while IFS= read -r profile; do
      profile_plist="$(security cms -D -i "$profile" 2>/dev/null || true)"
      [[ -n "$profile_plist" ]] || continue
      application_id="$(printf '%s' "$profile_plist" | plutil -extract Entitlements.application-identifier raw -o - - 2>/dev/null || true)"
      profile_team="$(printf '%s' "$profile_plist" | plutil -extract TeamIdentifier.0 raw -o - - 2>/dev/null || true)"
      [[ "$profile_team" == "$team_id" ]] || continue
      case "$application_id" in
        "$team_id.kg.alistore.client"|"$team_id.*")
          profile_match="1"
          break
          ;;
      esac
    done < <(find "$profile_dir" -maxdepth 1 -type f -name '*.mobileprovision' -print)
    [[ "$profile_match" == "1" ]] && break
  done

  if [[ "$profile_match" != "1" && "${IOS_ALLOW_PROVISIONING_UPDATE:-}" != "true" ]]; then
    fail 'App Store provisioning profile for kg.alistore.client is required in MobileDevice or Xcode UserData profiles, or set IOS_ALLOW_PROVISIONING_UPDATE=true for an authenticated Xcode account'
  fi
fi

settings="$(DEVELOPER_DIR="${DEVELOPER_DIR:-/Applications/Xcode.app/Contents/Developer}" \
  xcodebuild -project "$ios_root/AliStoreNative.xcodeproj" \
  -scheme AliStoreClient -configuration Release -showBuildSettings \
  DEVELOPMENT_TEAM="$team_id" ALISTORE_API_BASE_URL="$api_base" 2>/dev/null)" \
  || fail 'xcodebuild could not resolve Release settings'

resolved_api="$(printf '%s\n' "$settings" | awk -F' = ' '$1 ~ /^[[:space:]]*API_BASE_URL$/ {print $2; exit}')"
[[ "$resolved_api" == "$api_base" ]] || fail 'Release API_BASE_URL did not resolve to ALISTORE_API_BASE_URL'
resolved_bundle_id="$(printf '%s\n' "$settings" | awk -F' = ' '$1 ~ /^[[:space:]]*PRODUCT_BUNDLE_IDENTIFIER$/ {print $2; exit}')"
[[ "$resolved_bundle_id" == "kg.alistore.client" ]] || fail 'Release bundle identifier must be kg.alistore.client'
resolved_icon="$(printf '%s\n' "$settings" | awk -F' = ' '$1 ~ /^[[:space:]]*ASSETCATALOG_COMPILER_APPICON_NAME$/ {print $2; exit}')"
[[ "$resolved_icon" == "AppIcon" ]] || fail 'Release AppIcon asset catalog must be configured'
resolved_aps="$(printf '%s\n' "$settings" | awk -F' = ' '$1 ~ /^[[:space:]]*APS_ENVIRONMENT$/ {print $2; exit}')"
[[ "$resolved_aps" == "production" ]] || fail 'Release APS_ENVIRONMENT must resolve to production'
resolved_marketing_version="$(printf '%s\n' "$settings" | awk -F' = ' '$1 ~ /^[[:space:]]*MARKETING_VERSION$/ {print $2; exit}')"
[[ "$resolved_marketing_version" == "1.0.0" ]] || fail 'Release MARKETING_VERSION must resolve to 1.0.0'
resolved_build_number="$(printf '%s\n' "$settings" | awk -F' = ' '$1 ~ /^[[:space:]]*CURRENT_PROJECT_VERSION$/ {print $2; exit}')"
[[ "$resolved_build_number" == "1" ]] || fail 'Release CURRENT_PROJECT_VERSION must resolve to 1'

printf 'store-preflight: App Store metadata and privacy manifest are present\n'
printf 'store-preflight: Release API URL resolved to HTTPS\n'
printf 'store-preflight: Release bundle id and AppIcon are configured\n'
printf 'store-preflight: Release APNs environment resolved to production\n'
printf 'store-preflight: Release version resolved to 1.0.0 (1)\n'
if [[ "$strict_asc" == "1" ]]; then
  printf 'store-preflight: App Store Connect API credentials verified\n'
fi
if [[ "$strict_signing" == "1" ]]; then
  printf 'store-preflight: Apple Distribution signing material verified\n'
fi
if [[ "$strict_asc" != "1" && "$strict_signing" != "1" ]]; then
  printf 'store-preflight: Apple credentials skipped in non-strict mode\n'
fi
printf 'store-preflight: native Client configuration passed\n'
