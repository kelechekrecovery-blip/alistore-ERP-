#!/bin/sh
set -eu

ROOT='/Users/alistore/Desktop/alistore-erp'
NODE='/opt/homebrew/Cellar/node/25.9.0_3/bin/node'
NODE_SHA256='fba87e4402c55ea4fc7ca9b9838790c32534e3e77c9c7834c37073752d070678'
MANIFEST="$ROOT/scripts/node-runtime-manifest.sha256"
MANIFEST_SHA256='617430f62efe9d84295d25d3dd57b0b43a6264b57352805e21990512c57f5c90'

if [ "$#" -lt 1 ]; then
  echo 'A trusted ecosystem script is required.' >&2
  exit 2
fi

case "$1" in
  scripts/ecosystem-contract-audit.mjs|scripts/record-ecosystem-evidence.mjs) ;;
  *)
    echo 'The trusted ecosystem bootstrap only accepts audit and evidence scripts.' >&2
    exit 2
    ;;
esac

HEAD_BLOB=$(/usr/bin/mktemp -t alistore-head-blob)
cleanup() {
  /bin/rm -f "$HEAD_BLOB"
}
trap cleanup EXIT HUP INT TERM
for committed_file in "$1" scripts/trusted-npm.mjs scripts/trusted-git.mjs; do
  if ! /usr/bin/env -i HOME="${HOME:-$ROOT}" LANG=C PATH=/usr/bin:/bin \
    GIT_CONFIG_GLOBAL=/dev/null GIT_CONFIG_NOSYSTEM=1 GIT_NO_REPLACE_OBJECTS=1 \
    /usr/bin/git --git-dir="$ROOT/.git" --work-tree="$ROOT" --no-replace-objects \
    show "HEAD:$committed_file" >"$HEAD_BLOB"; then
    echo "Could not read committed bootstrap dependency: $committed_file" >&2
    exit 1
  fi
  if ! /usr/bin/cmp -s "$HEAD_BLOB" "$ROOT/$committed_file"; then
    echo "Bootstrap dependency differs from committed HEAD: $committed_file" >&2
    exit 1
  fi
done
cleanup
trap - EXIT HUP INT TERM

actual_node_sha256=$(/usr/bin/shasum -a 256 "$NODE" | /usr/bin/awk '{print $1}')
if [ "$actual_node_sha256" != "$NODE_SHA256" ]; then
  echo 'The Node launcher does not match the trusted ecosystem bootstrap.' >&2
  exit 1
fi
actual_manifest_sha256=$(/usr/bin/shasum -a 256 "$MANIFEST" | /usr/bin/awk '{print $1}')
if [ "$actual_manifest_sha256" != "$MANIFEST_SHA256" ]; then
  echo 'The Node runtime manifest does not match the trusted ecosystem bootstrap.' >&2
  exit 1
fi
(cd / && /usr/bin/shasum -a 256 -c "$MANIFEST" >/dev/null)

script=$1
shift
exec 3<"$MANIFEST"
env_args="ALISTORE_TRUSTED_BOOTSTRAP_FD=3 HOME=${HOME:-$ROOT} LANG=C PATH=/opt/homebrew/Cellar/node/25.9.0_3/bin:/usr/bin:/bin:/usr/sbin:/sbin TMPDIR=${TMPDIR:-/tmp}"

for port_name in E2E_API_PORT E2E_WEB_PORT; do
  port_value=$(eval "printf '%s' \"\${$port_name:-}\"")
  if [ -n "$port_value" ]; then
    case "$port_value" in
      *[!0-9]*) echo "$port_name must be a numeric port." >&2; exit 2 ;;
    esac
    if [ "$port_value" -lt 1 ] || [ "$port_value" -gt 65535 ]; then
      echo "$port_name is outside the valid port range." >&2
      exit 2
    fi
    env_args="$env_args $port_name=$port_value"
  fi
done

if [ -n "${E2E_REUSE_EXISTING_SERVER:-}" ]; then
  case "$E2E_REUSE_EXISTING_SERVER" in
    true|false) env_args="$env_args E2E_REUSE_EXISTING_SERVER=$E2E_REUSE_EXISTING_SERVER" ;;
    *) echo 'E2E_REUSE_EXISTING_SERVER must be true or false.' >&2; exit 2 ;;
  esac
fi

# The optional values above are validated as digits/booleans before word splitting.
# shellcheck disable=SC2086
exec /usr/bin/env -i $env_args "$NODE" "$ROOT/$script" "$@"
