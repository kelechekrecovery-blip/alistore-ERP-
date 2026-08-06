#!/bin/sh
set -eu

NODE='/opt/homebrew/Cellar/node/25.9.0_3/bin/node'
NODE_SHA256='fba87e4402c55ea4fc7ca9b9838790c32534e3e77c9c7834c37073752d070678'
MANIFEST_SHA256='617430f62efe9d84295d25d3dd57b0b43a6264b57352805e21990512c57f5c90'
TRUSTED_COMMON_GIT_DIR='/Users/alistore/Desktop/alistore-erp/.git'

repository_error() {
  echo 'Could not resolve a trusted canonical Git worktree.' >&2
  exit 1
}

canonical_directory() {
  [ -d "$1" ] && [ ! -L "$1" ] || return 1
  (CDPATH= cd "$1" 2>/dev/null && /bin/pwd -P)
}

read_metadata_line() {
  [ -f "$1" ] && [ ! -L "$1" ] || return 1
  LC_ALL=C /usr/bin/awk '
    NR > 1 || index($0, "\r") != 0 { exit 1 }
    END { if (NR != 1 || length($0) == 0) exit 1 }
  ' "$1" >/dev/null || return 1
  METADATA_LINE=$(/bin/cat "$1") || return 1
}

ROOT=$(/bin/pwd -P) || repository_error
[ -d "$ROOT" ] && [ ! -L "$ROOT" ] || repository_error
GIT_MARKER="$ROOT/.git"

if [ -d "$GIT_MARKER" ] && [ ! -L "$GIT_MARKER" ]; then
  GIT_DIR=$(canonical_directory "$GIT_MARKER") || repository_error
  COMMON_GIT_DIR=$GIT_DIR
elif [ -f "$GIT_MARKER" ] && [ ! -L "$GIT_MARKER" ]; then
  read_metadata_line "$GIT_MARKER" || repository_error
  case "$METADATA_LINE" in
    'gitdir: '*) git_dir_reference=${METADATA_LINE#gitdir: } ;;
    *) repository_error ;;
  esac
  [ -n "$git_dir_reference" ] || repository_error
  case "$git_dir_reference" in
    /*) git_dir_candidate=$git_dir_reference ;;
    *) git_dir_candidate="$ROOT/$git_dir_reference" ;;
  esac
  GIT_DIR=$(canonical_directory "$git_dir_candidate") || repository_error

  read_metadata_line "$GIT_DIR/commondir" || repository_error
  common_reference=$METADATA_LINE
  case "$common_reference" in
    /*) common_candidate=$common_reference ;;
    *) common_candidate="$GIT_DIR/$common_reference" ;;
  esac
  COMMON_GIT_DIR=$(canonical_directory "$common_candidate") || repository_error
  worktrees_directory=$(/usr/bin/dirname "$GIT_DIR")
  [ "$(/usr/bin/basename "$worktrees_directory")" = 'worktrees' ] || repository_error
  [ "$(/usr/bin/dirname "$worktrees_directory")" = "$COMMON_GIT_DIR" ] || repository_error

  read_metadata_line "$GIT_DIR/gitdir" || repository_error
  backpointer_reference=$METADATA_LINE
  case "$backpointer_reference" in
    /*) backpointer_candidate=$backpointer_reference ;;
    *) backpointer_candidate="$GIT_DIR/$backpointer_reference" ;;
  esac
  backpointer_parent=$(canonical_directory "$(/usr/bin/dirname "$backpointer_candidate")") \
    || repository_error
  backpointer="$backpointer_parent/$(/usr/bin/basename "$backpointer_candidate")"
  [ "$backpointer" = "$GIT_MARKER" ] || repository_error
else
  repository_error
fi

PINNED_COMMON_GIT_DIR=$(canonical_directory "$TRUSTED_COMMON_GIT_DIR") || repository_error
[ "$COMMON_GIT_DIR" = "$PINNED_COMMON_GIT_DIR" ] || repository_error

GIT_ENV_HOME=${HOME:-$ROOT}
trusted_git() {
  /usr/bin/env -i HOME="$GIT_ENV_HOME" LANG=C PATH=/usr/bin:/bin \
    GIT_CONFIG_GLOBAL=/dev/null GIT_CONFIG_NOSYSTEM=1 GIT_NO_REPLACE_OBJECTS=1 \
    /usr/bin/git --git-dir="$GIT_DIR" --work-tree="$ROOT" --no-replace-objects "$@"
}

[ "$(trusted_git rev-parse --path-format=absolute --show-toplevel)" = "$ROOT" ] \
  || repository_error
[ "$(trusted_git rev-parse --path-format=absolute --absolute-git-dir)" = "$GIT_DIR" ] \
  || repository_error
[ "$(trusted_git rev-parse --path-format=absolute --git-common-dir)" = "$COMMON_GIT_DIR" ] \
  || repository_error
[ "$(trusted_git rev-parse --is-inside-work-tree)" = 'true' ] || repository_error

MANIFEST="$ROOT/scripts/node-runtime-manifest.sha256"

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

TRUSTED_RUNTIME=$(/usr/bin/mktemp -d -t alistore-committed-runtime)
/bin/mkdir "$TRUSTED_RUNTIME/scripts"
cleanup() {
  /bin/chmod 700 "$TRUSTED_RUNTIME" "$TRUSTED_RUNTIME/scripts" 2>/dev/null || true
  /bin/rm -f \
    "$TRUSTED_RUNTIME/bootstrap-head" \
    "$TRUSTED_RUNTIME/scripts/ecosystem-contract-audit.mjs" \
    "$TRUSTED_RUNTIME/scripts/record-ecosystem-evidence.mjs" \
    "$TRUSTED_RUNTIME/scripts/trusted-npm.mjs" \
    "$TRUSTED_RUNTIME/scripts/toolchain-hashes.mjs" \
    "$TRUSTED_RUNTIME/scripts/trusted-git.mjs"
  /bin/rmdir "$TRUSTED_RUNTIME/scripts" 2>/dev/null || true
  /bin/rmdir "$TRUSTED_RUNTIME" 2>/dev/null || true
}
trap cleanup EXIT HUP INT TERM
case "$0" in
  /*) BOOTSTRAP_PATH=$0 ;;
  *) BOOTSTRAP_PATH="$ROOT/$0" ;;
esac
[ -f "$BOOTSTRAP_PATH" ] && [ ! -L "$BOOTSTRAP_PATH" ] || repository_error
for committed_file in \
  scripts/run-trusted-ecosystem-node.sh \
  "$1" \
  scripts/trusted-npm.mjs \
  scripts/toolchain-hashes.mjs \
  scripts/trusted-git.mjs
do
  if [ "$committed_file" = 'scripts/run-trusted-ecosystem-node.sh' ]; then
    committed_snapshot="$TRUSTED_RUNTIME/bootstrap-head"
  else
    committed_snapshot="$TRUSTED_RUNTIME/$committed_file"
  fi
  if ! trusted_git show "HEAD:$committed_file" >"$committed_snapshot"; then
    echo "Could not read committed bootstrap dependency: $committed_file" >&2
    exit 1
  fi
  if [ "$committed_file" = 'scripts/run-trusted-ecosystem-node.sh' ]; then
    worktree_file=$BOOTSTRAP_PATH
  else
    worktree_file="$ROOT/$committed_file"
    worktree_parent=$(/usr/bin/dirname "$worktree_file")
    canonical_parent=$(canonical_directory "$worktree_parent") || repository_error
    [ "$canonical_parent" = "$worktree_parent" ] || repository_error
  fi
  [ -f "$worktree_file" ] && [ ! -L "$worktree_file" ] || repository_error
  if ! /usr/bin/cmp -s "$committed_snapshot" "$worktree_file"; then
    echo "Bootstrap dependency differs from committed HEAD: $committed_file" >&2
    exit 1
  fi
  /bin/chmod 400 "$committed_snapshot"
done
/bin/chmod 500 "$TRUSTED_RUNTIME" "$TRUSTED_RUNTIME/scripts"

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
set -- "$NODE" "$TRUSTED_RUNTIME/$script" "$@"

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
    set -- "$port_name=$port_value" "$@"
  fi
done

if [ -n "${E2E_REUSE_EXISTING_SERVER:-}" ]; then
  case "$E2E_REUSE_EXISTING_SERVER" in
    true|false) set -- "E2E_REUSE_EXISTING_SERVER=$E2E_REUSE_EXISTING_SERVER" "$@" ;;
    *) echo 'E2E_REUSE_EXISTING_SERVER must be true or false.' >&2; exit 2 ;;
  esac
fi

if [ -n "${DATABASE_URL:-}" ] || [ -n "${E2E_DATABASE_URL:-}" ]; then
  echo 'Trusted evidence accepts only the validated TEST_DATABASE_URL override.' >&2
  exit 2
fi
if [ -n "${TEST_DATABASE_URL:-}" ] || [ -n "${ALISTORE_EVIDENCE_DATABASE_CONFIRMED:-}" ]; then
  if [ -z "${TEST_DATABASE_URL:-}" ] || \
     [ "${ALISTORE_EVIDENCE_DATABASE_CONFIRMED:-}" != '1' ]; then
    echo 'Trusted evidence database override requires TEST_DATABASE_URL and explicit confirmation.' >&2
    exit 2
  fi
  set -- \
    "ALISTORE_EVIDENCE_DATABASE_CONFIRMED=1" \
    "TEST_DATABASE_URL=$TEST_DATABASE_URL" \
    "$@"
fi

set -- \
  'ALISTORE_TRUSTED_BOOTSTRAP_FD=3' \
  "ALISTORE_TRUSTED_WORK_TREE=$ROOT" \
  "HOME=${HOME:-$ROOT}" \
  'LANG=C' \
  'PATH=/opt/homebrew/Cellar/node/25.9.0_3/bin:/usr/bin:/bin:/usr/sbin:/sbin' \
  "TMPDIR=${TMPDIR:-/tmp}" \
  "$@"
/usr/bin/env -i "$@"
