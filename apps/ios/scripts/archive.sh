#!/usr/bin/env bash
set -euo pipefail

# Архивирует все четыре релизных приложения (или подмножество через --scheme).
# Раньше эта команда жила только в тексте runbook на один Client — Staff, Courier
# и POS собирались руками, и любая опечатка в аргументах давала архив с другим
# API_BASE_URL или без production APNs, о чём узнавали уже в App Store Connect.

fail() {
  printf 'ios-archive: %s\n' "$1" >&2
  exit 1
}

repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/../../.." && pwd)"
ios_root="$repo_root/apps/ios"
env_file=""
# Список схем держим строкой, а не массивом: bash 3.2 из macOS падает на
# `"${arr[@]}"` пустого массива при `set -u`.
requested_schemes=""
all_schemes="AliStoreClient AliStoreStaff AliStoreCourier AliStorePOS"

while [[ $# -gt 0 ]]; do
  case "$1" in
    --env-file)
      [[ $# -ge 2 ]] || fail '--env-file requires a path'
      env_file="$2"
      shift 2
      ;;
    --scheme)
      [[ $# -ge 2 ]] || fail '--scheme requires a scheme name'
      requested_schemes="$requested_schemes $2"
      shift 2
      ;;
    --help|-h)
      cat <<'USAGE'
Usage: apps/ios/scripts/archive.sh [--env-file path] [--scheme NAME]...

Archives the release apps into apps/ios/build/<Scheme>.xcarchive.
Without --scheme, all four are archived: AliStoreClient, AliStoreStaff,
AliStoreCourier, AliStorePOS.

If --env-file is omitted and apps/ios/.env.production exists, it is loaded.
Required: ALISTORE_API_BASE_URL (production HTTPS), DEVELOPMENT_TEAM.
Optional: IOS_ALLOW_PROVISIONING_UPDATE=true to let Xcode create/download
profiles, IOS_SKIP_XCODEGEN=true to skip regenerating the Xcode project.
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

[[ -n "$api_base" ]] || fail 'ALISTORE_API_BASE_URL is required'
[[ "$api_base" == https://* ]] || fail 'ALISTORE_API_BASE_URL must use HTTPS'
case "$api_base" in
  *localhost*|*127.0.0.1*|*0.0.0.0*|*staging*|*sandbox*|*dev*)
    fail 'ALISTORE_API_BASE_URL points to a local, staging, sandbox, or development endpoint'
    ;;
esac
[[ -n "$team_id" ]] || fail 'DEVELOPMENT_TEAM or APPLE_DEVELOPMENT_TEAM is required'
[[ "$team_id" =~ ^[A-Z0-9]{10}$ ]] || fail 'Apple team id must be a 10-character identifier'

if [[ -z "${requested_schemes// /}" ]]; then
  requested_schemes="$all_schemes"
else
  for scheme in $requested_schemes; do
    case " $all_schemes " in
      *" $scheme "*) ;;
      *) fail "unknown scheme: $scheme (expected one of $all_schemes)" ;;
    esac
  done
fi

export DEVELOPER_DIR="${DEVELOPER_DIR:-/Applications/Xcode.app/Contents/Developer}"

if [[ "${IOS_SKIP_XCODEGEN:-}" != "true" ]]; then
  command -v xcodegen >/dev/null 2>&1 || fail 'xcodegen is required (or set IOS_SKIP_XCODEGEN=true)'
  (cd "$ios_root" && xcodegen generate) >/dev/null || fail 'xcodegen generate failed'
fi

[[ -d "$ios_root/AliStoreNative.xcodeproj" ]] || fail 'AliStoreNative.xcodeproj is missing; run npm run ios:generate'

mkdir -p "$ios_root/build"

for scheme in $requested_schemes; do
  archive_path="$ios_root/build/$scheme.xcarchive"
  rm -rf "$archive_path"

  archive_args=(
    -project "$ios_root/AliStoreNative.xcodeproj"
    -scheme "$scheme"
    -configuration Release
    -destination 'generic/platform=iOS'
    -archivePath "$archive_path"
    DEVELOPMENT_TEAM="$team_id"
    ALISTORE_API_BASE_URL="$api_base"
  )
  if [[ "${IOS_ALLOW_PROVISIONING_UPDATE:-}" == "true" ]]; then
    archive_args+=(-allowProvisioningUpdates)
  fi

  printf 'ios-archive: archiving %s\n' "$scheme"
  xcodebuild "${archive_args[@]}" archive || fail "xcodebuild archive failed for $scheme"

  [[ -d "$archive_path/Products/Applications" ]] \
    || fail "$scheme: archive produced no application payload"
  printf 'ios-archive: %s -> %s\n' "$scheme" "$archive_path"
done

printf 'ios-archive: archived%s into %s\n' "$(printf ' %s' $requested_schemes)" "$ios_root/build"
