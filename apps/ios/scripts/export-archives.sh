#!/usr/bin/env bash
set -euo pipefail

# Экспортирует .ipa из архивов четырёх приложений.
#
# exportOptions.plist генерируется здесь из переменных окружения и кладётся в
# apps/ios/build/exportOptions/ (каталог под .gitignore). Раньше runbook предлагал
# «создать plist в CI или локально вне Git» — то есть единственный файл, от которого
# зависит метод подписи и выбор профиля, не воспроизводился и нигде не хранился:
# два релиза с одной и той же командой могли дать разные бинари. Имена профилей и
# team id — это не секреты, но и они не коммитятся: скрипт читает их из окружения.

fail() {
  printf 'ios-export: %s\n' "$1" >&2
  exit 1
}

repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/../../.." && pwd)"
ios_root="$repo_root/apps/ios"
env_file=""
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
Usage: apps/ios/scripts/export-archives.sh [--env-file path] [--scheme NAME]...

Generates apps/ios/build/exportOptions/<Scheme>-exportOptions.plist from the
environment and exports apps/ios/build/<Scheme>.xcarchive into
apps/ios/build/export/<Scheme>/<App>.ipa.

If --env-file is omitted and apps/ios/.env.production exists, it is loaded.

Required:
  DEVELOPMENT_TEAM            10-character Apple team id

Optional:
  IOS_EXPORT_METHOD           app-store-connect (default) | release-testing |
                              enterprise | debugging
  IOS_EXPORT_UPLOAD_SYMBOLS   true (default) | false
  IOS_EXPORT_SIGNING_CERT     signing certificate, default "Apple Distribution"
  IOS_PROFILE_CLIENT          App Store profile name for kg.alistore.client
  IOS_PROFILE_STAFF           App Store profile name for kg.alistore.staff
  IOS_PROFILE_COURIER         App Store profile name for kg.alistore.courier
  IOS_PROFILE_POS             App Store profile name for kg.alistore.pos
  IOS_ALLOW_PROVISIONING_UPDATE=true  allow Xcode to fetch profiles (automatic
                              signing); combined with ASC_API_KEY_PATH /
                              ASC_KEY_ID / ASC_ISSUER_ID it authenticates
                              non-interactively.

A scheme with its IOS_PROFILE_* set is exported with manual signing and that
exact profile; without it the scheme falls back to automatic signing.
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

team_id="${DEVELOPMENT_TEAM:-${APPLE_DEVELOPMENT_TEAM:-}}"
[[ -n "$team_id" ]] || fail 'DEVELOPMENT_TEAM or APPLE_DEVELOPMENT_TEAM is required'
[[ "$team_id" =~ ^[A-Z0-9]{10}$ ]] || fail 'Apple team id must be a 10-character identifier'

export_method="${IOS_EXPORT_METHOD:-app-store-connect}"
case "$export_method" in
  app-store-connect|release-testing|enterprise|debugging|app-store|ad-hoc|development) ;;
  *) fail "IOS_EXPORT_METHOD is not a known xcodebuild export method: $export_method" ;;
esac

upload_symbols="${IOS_EXPORT_UPLOAD_SYMBOLS:-true}"
case "$upload_symbols" in
  true|false) ;;
  *) fail 'IOS_EXPORT_UPLOAD_SYMBOLS must be true or false' ;;
esac

signing_certificate="${IOS_EXPORT_SIGNING_CERT:-Apple Distribution}"

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

options_dir="$ios_root/build/exportOptions"
mkdir -p "$options_dir"

bundle_id_for() {
  case "$1" in
    AliStoreClient) printf 'kg.alistore.client' ;;
    AliStoreStaff) printf 'kg.alistore.staff' ;;
    AliStoreCourier) printf 'kg.alistore.courier' ;;
    AliStorePOS) printf 'kg.alistore.pos' ;;
    *) fail "no bundle id mapping for $1" ;;
  esac
}

profile_for() {
  case "$1" in
    AliStoreClient) printf '%s' "${IOS_PROFILE_CLIENT:-}" ;;
    AliStoreStaff) printf '%s' "${IOS_PROFILE_STAFF:-}" ;;
    AliStoreCourier) printf '%s' "${IOS_PROFILE_COURIER:-}" ;;
    AliStorePOS) printf '%s' "${IOS_PROFILE_POS:-}" ;;
    *) fail "no profile variable mapping for $1" ;;
  esac
}

for scheme in $requested_schemes; do
  archive_path="$ios_root/build/$scheme.xcarchive"
  [[ -d "$archive_path" ]] || fail "$scheme: $archive_path is missing; run npm run ios:archive first"

  bundle_id="$(bundle_id_for "$scheme")"
  profile_name="$(profile_for "$scheme")"
  case "$profile_name" in
    *'<'*|*'>'*|*'&'*) fail "$scheme: provisioning profile name must not contain XML markup characters" ;;
  esac

  options_plist="$options_dir/$scheme-exportOptions.plist"
  {
    printf '%s\n' '<?xml version="1.0" encoding="UTF-8"?>'
    printf '%s\n' '<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">'
    printf '%s\n' '<plist version="1.0">'
    printf '%s\n' '<dict>'
    printf '  <key>method</key><string>%s</string>\n' "$export_method"
    printf '  <key>teamID</key><string>%s</string>\n' "$team_id"
    printf '  <key>destination</key><string>export</string>\n'
    printf '  <key>uploadSymbols</key><%s/>\n' "$upload_symbols"
    printf '  <key>manageAppVersionAndBuildNumber</key><false/>\n'
    printf '  <key>stripSwiftSymbols</key><true/>\n'
    if [[ -n "$profile_name" ]]; then
      printf '  <key>signingStyle</key><string>manual</string>\n'
      printf '  <key>signingCertificate</key><string>%s</string>\n' "$signing_certificate"
      printf '  <key>provisioningProfiles</key>\n'
      printf '  <dict><key>%s</key><string>%s</string></dict>\n' "$bundle_id" "$profile_name"
    else
      printf '  <key>signingStyle</key><string>automatic</string>\n'
    fi
    printf '%s\n' '</dict>'
    printf '%s\n' '</plist>'
  } >"$options_plist"

  plutil -lint "$options_plist" >/dev/null || fail "$scheme: generated exportOptions.plist is not valid"

  export_path="$ios_root/build/export/$scheme"
  rm -rf "$export_path"
  mkdir -p "$export_path"

  export_args=(
    -exportArchive
    -archivePath "$archive_path"
    -exportOptionsPlist "$options_plist"
    -exportPath "$export_path"
  )
  if [[ -z "$profile_name" && "${IOS_ALLOW_PROVISIONING_UPDATE:-}" == "true" ]]; then
    export_args+=(-allowProvisioningUpdates)
    if [[ -n "${ASC_API_KEY_PATH:-}" && -n "${ASC_KEY_ID:-}" && -n "${ASC_ISSUER_ID:-}" ]]; then
      export_args+=(
        -authenticationKeyPath "$ASC_API_KEY_PATH"
        -authenticationKeyID "$ASC_KEY_ID"
        -authenticationKeyIssuerID "$ASC_ISSUER_ID"
      )
    fi
  fi

  printf 'ios-export: exporting %s (%s, %s signing)\n' \
    "$scheme" "$export_method" "$([[ -n "$profile_name" ]] && printf 'manual' || printf 'automatic')"
  xcodebuild "${export_args[@]}" || fail "xcodebuild -exportArchive failed for $scheme"

  ipa_path="$(find "$export_path" -maxdepth 1 -type f -name '*.ipa' -print | head -n 1)"
  [[ -n "$ipa_path" ]] || fail "$scheme: export produced no .ipa in $export_path"
  printf 'ios-export: %s -> %s\n' "$scheme" "$ipa_path"
done

printf 'ios-export: exported%s from %s\n' "$(printf ' %s' $requested_schemes)" "$ios_root/build/export"
