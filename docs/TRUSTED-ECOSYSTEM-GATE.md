# Trusted ecosystem gate

The audit and evidence recorder must execute the bootstrap bytes committed in `HEAD`, not the worktree copy and not an npm lifecycle command. The system Git invocation below has an empty environment, explicit repository paths, disabled replacement objects and disabled global/system configuration.

```bash
TRUSTED_GIT_DIR=/Users/alistore/Desktop/alistore-erp/.git
TRUSTED_WORK_TREE=/Users/alistore/Desktop/alistore-erp
TRUSTED_BOOTSTRAP=$(/usr/bin/mktemp -t alistore-bootstrap)
trap '/bin/rm -f "$TRUSTED_BOOTSTRAP"' EXIT HUP INT TERM

if ! /usr/bin/env -i HOME="$HOME" LANG=C PATH=/usr/bin:/bin \
  GIT_CONFIG_GLOBAL=/dev/null GIT_CONFIG_NOSYSTEM=1 GIT_NO_REPLACE_OBJECTS=1 \
  /usr/bin/git --git-dir="$TRUSTED_GIT_DIR" --work-tree="$TRUSTED_WORK_TREE" \
  --no-replace-objects show HEAD:scripts/run-trusted-ecosystem-node.sh \
  >"$TRUSTED_BOOTSTRAP"; then
  exit 1
fi

/bin/sh "$TRUSTED_BOOTSTRAP" scripts/ecosystem-contract-audit.mjs
gate_status=$?
/bin/rm -f "$TRUSTED_BOOTSTRAP"
trap - EXIT HUP INT TERM
exit "$gate_status"
```

Append `--strict` for the release audit. To record the reconciled software matrix, replace the final argument with:

```text
scripts/record-ecosystem-evidence.mjs reconciled-e2e
```

The committed bootstrap verifies its pinned Node runtime manifest with system `shasum` before Node starts, clears the process environment, and then the recorder/audit verifies the repository, toolchain and evidence contracts. Direct execution of the worktree bootstrap, direct Node execution and `npm run` are not authoritative evidence entrypoints.
