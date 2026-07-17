#!/usr/bin/env bash
set -euo pipefail

fail() {
  printf 'store-preflight: %s\n' "$1" >&2
  exit 1
}

repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/../../.." && pwd)"
ios_root="$repo_root/apps/ios"
env_file=""

while [[ $# -gt 0 ]]; do
  case "$1" in
    --env-file)
      [[ $# -ge 2 ]] || fail '--env-file requires a path'
      env_file="$2"
      shift 2
      ;;
    --help|-h)
      cat <<'USAGE'
Usage: apps/ios/scripts/store-preflight.sh [--env-file path]

Validates the native iOS Client release configuration without printing secrets.
If --env-file is omitted and apps/ios/.env.production exists, that file is loaded.
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

api_base="${ALISTORE_API_BASE_URL:-${API_BASE_URL:-}}"
team_id="${DEVELOPMENT_TEAM:-${APPLE_DEVELOPMENT_TEAM:-}}"
asc_key_path="${ASC_API_KEY_PATH:-}"
issuer_id="${ASC_ISSUER_ID:-}"

[[ -n "$api_base" ]] || fail 'ALISTORE_API_BASE_URL is required'
[[ "$api_base" == https://* ]] || fail 'ALISTORE_API_BASE_URL must use HTTPS'
case "$api_base" in
  *localhost*|*127.0.0.1*|*0.0.0.0*|*staging*|*sandbox*|*dev*)
    fail 'ALISTORE_API_BASE_URL points to a local, staging, sandbox, or development endpoint'
    ;;
esac

[[ -n "$team_id" ]] || fail 'DEVELOPMENT_TEAM or APPLE_DEVELOPMENT_TEAM is required'
[[ "$team_id" =~ ^[A-Z0-9]{10}$ ]] || fail 'Apple team id must be a 10-character identifier'
[[ -n "$asc_key_path" ]] || fail 'ASC_API_KEY_PATH is required for App Store Connect submission'
[[ -f "$asc_key_path" ]] || fail 'ASC_API_KEY_PATH does not point to a file'
[[ -n "$issuer_id" ]] || fail 'ASC_ISSUER_ID is required for App Store Connect submission'
[[ "$issuer_id" =~ ^[0-9A-Fa-f]{8}-[0-9A-Fa-f]{4}-[0-9A-Fa-f]{4}-[0-9A-Fa-f]{4}-[0-9A-Fa-f]{12}$ ]] || fail 'ASC_ISSUER_ID must be a UUID'

settings="$(DEVELOPER_DIR="${DEVELOPER_DIR:-/Applications/Xcode.app/Contents/Developer}" \
  xcodebuild -project "$ios_root/AliStoreNative.xcodeproj" \
  -scheme AliStoreClient -configuration Release -showBuildSettings \
  DEVELOPMENT_TEAM="$team_id" ALISTORE_API_BASE_URL="$api_base" 2>/dev/null)" \
  || fail 'xcodebuild could not resolve Release settings'

resolved_api="$(printf '%s\n' "$settings" | awk -F' = ' '$1 ~ /API_BASE_URL$/ {print $2; exit}')"
[[ "$resolved_api" == "$api_base" ]] || fail 'Release API_BASE_URL did not resolve to ALISTORE_API_BASE_URL'
resolved_aps="$(printf '%s\n' "$settings" | awk -F' = ' '$1 ~ /APS_ENVIRONMENT$/ {print $2; exit}')"
[[ "$resolved_aps" == "production" ]] || fail 'Release APS_ENVIRONMENT must resolve to production'

printf 'store-preflight: Release API URL resolved to HTTPS\n'
printf 'store-preflight: Release APNs environment resolved to production\n'
printf 'store-preflight: Apple team and App Store Connect credentials are present\n'
printf 'store-preflight: native Client configuration passed\n'
