#!/usr/bin/env node

import { spawn } from 'node:child_process';
import {
  chmod,
  mkdir,
  mkdtemp,
  readFile,
  rename,
  rm,
  writeFile,
} from 'node:fs/promises';
import { homedir, tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import {
  acquireBackupLock,
  loadProductionEnvironment,
  resolveBackupConfig,
} from './production-postgres-backup.mjs';

const rootDir = join(dirname(fileURLToPath(import.meta.url)), '..');
const label = 'kg.alistore.backup';

export async function activateProductionBackup({
  projectRoot = rootDir,
  userHome = homedir(),
  uid = process.getuid(),
  nodePath = process.execPath,
  apply = false,
  runNow = false,
  allowEphemeralRoot = false,
  run = runCommand,
  inspectService = defaultInspectService,
  acquireCoordinationLock = defaultAcquireCoordinationLock,
  makeDirectory = mkdir,
  read = readFile,
  write = writeFile,
  move = rename,
  remove = rm,
} = {}) {
  if (runNow && !apply) throw new Error('--run-now requires --apply');
  if (apply && !allowEphemeralRoot && isEphemeralRoot(projectRoot)) {
    throw new Error('refusing to install a LaunchAgent from a temporary worktree; run from the stable checkout');
  }
  await run(nodePath, [join(projectRoot, 'scripts', 'production-postgres-backup.mjs'), '--check'], {
    cwd: projectRoot,
  });

  const template = await read(join(projectRoot, 'infra', 'macos', `${label}.plist.template`), 'utf8');
  const plist = template
    .replaceAll('__NODE_PATH__', xmlEscape(nodePath))
    .replaceAll('__PROJECT_ROOT__', xmlEscape(projectRoot))
    .replaceAll('__USER_HOME__', xmlEscape(userHome));
  const temporaryDirectory = await mkdtemp(join(tmpdir(), 'alistore-backup-agent-'));
  const temporaryPlist = join(temporaryDirectory, `${label}.plist`);

  try {
    await writeFile(temporaryPlist, plist, { mode: 0o600 });
    await run('/usr/bin/plutil', ['-lint', temporaryPlist]);
    if (!apply) return { activated: false, reason: 'dry-run', plist };

    const releaseCoordinationLock = await acquireCoordinationLock(projectRoot);
    let coordinationReleased = false;
    const releaseCoordinationLockOnce = async () => {
      if (coordinationReleased) return;
      coordinationReleased = true;
      await releaseCoordinationLock();
    };
    try {
      const launchAgents = join(userHome, 'Library', 'LaunchAgents');
      const installedPlist = join(launchAgents, `${label}.plist`);
      const stagedPlist = `${installedPlist}.new`;
      const rollbackPlist = `${installedPlist}.rollback`;
      const domain = `gui/${uid}`;
      const service = `${domain}/${label}`;
      let serviceState = await inspectService(service, run);
      if (serviceState.running) throw new Error('refusing to replace a production backup job while it is running');

      let previousPlist = null;
      try {
        previousPlist = await read(installedPlist);
      } catch (error) {
        if (error?.code !== 'ENOENT') throw error;
      }
      await makeDirectory(launchAgents, { recursive: true });
      await remove(stagedPlist, { force: true });
      await remove(rollbackPlist, { force: true });
      await write(stagedPlist, plist, { mode: 0o600 });

      let activationStarted = false;
      let activationCommitted = false;
      try {
        serviceState = await inspectService(service, run);
        if (serviceState.running) {
          throw new Error('backup started during activation preparation; refusing to bootout');
        }
        activationStarted = true;
        if (serviceState.loaded) await run('/bin/launchctl', ['bootout', service]);
        await move(stagedPlist, installedPlist);
        await run('/bin/launchctl', ['bootstrap', domain, installedPlist]);
        activationCommitted = true;
        if (runNow) {
          await releaseCoordinationLockOnce();
          await run('/bin/launchctl', ['kickstart', '-k', service]);
        }
        return { activated: true, installedPlist, service };
      } catch (activationError) {
        if (!activationStarted) throw activationError;
        if (activationCommitted) {
          throw new Error('LaunchAgent activated, but explicit run-now failed; installed agent was not rolled back', {
            cause: activationError,
          });
        }
        const rollbackFailures = [];
        await run('/bin/launchctl', ['bootout', service]).catch((error) => rollbackFailures.push(error));
        try {
          if (previousPlist) {
            await write(rollbackPlist, previousPlist, { mode: 0o600 });
            await move(rollbackPlist, installedPlist);
            if (serviceState.loaded) await run('/bin/launchctl', ['bootstrap', domain, installedPlist]);
          } else {
            await remove(installedPlist, { force: true });
          }
        } catch (error) {
          rollbackFailures.push(error);
        }
        const suffix = rollbackFailures.length === 0
          ? previousPlist ? 'previous LaunchAgent restored' : 'rejected LaunchAgent removed'
          : `rollback incomplete (${rollbackFailures.length} failure(s))`;
        throw new Error(`production backup activation failed; ${suffix}`, { cause: activationError });
      } finally {
        await remove(stagedPlist, { force: true });
        await remove(rollbackPlist, { force: true });
      }
    } finally {
      await releaseCoordinationLockOnce();
    }
  } finally {
    await rm(temporaryDirectory, { recursive: true, force: true });
  }
}

async function defaultInspectService(service, run) {
  try {
    const output = await run('/bin/launchctl', ['print', service], { capture: true, quiet: true });
    return { loaded: true, running: parseLaunchctlRunningState(output) };
  } catch {
    return { loaded: false, running: false };
  }
}

export function parseLaunchctlRunningState(output) {
  return /\bstate\s*=\s*running\b/u.test(output)
    || Number(output.match(/^\s*active count\s*=\s*(\d+)/mu)?.[1] ?? 0) > 0;
}

async function defaultAcquireCoordinationLock(projectRoot) {
  const environment = await loadProductionEnvironment({ root: projectRoot });
  const config = resolveBackupConfig(environment);
  await mkdir(config.backupDir, { recursive: true, mode: 0o700 });
  await chmod(config.backupDir, 0o700);
  return await acquireBackupLock(config.backupDir, new Date(), {
    purpose: 'launchagent-activation',
  });
}

async function runCommand(command, args, { cwd, capture = false, quiet = false } = {}) {
  return await new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      cwd,
      stdio: ['ignore', capture ? 'pipe' : quiet ? 'ignore' : 'inherit', quiet ? 'ignore' : 'inherit'],
    });
    let stdout = '';
    if (capture) child.stdout.setEncoding('utf8').on('data', (chunk) => { stdout += chunk; });
    child.once('error', reject);
    child.once('exit', (code) => code === 0 ? resolve(stdout) : reject(new Error(`${command} exited with ${code}`)));
  });
}

function xmlEscape(value) {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&apos;');
}

function isEphemeralRoot(path) {
  return path.includes('/.codex/worktrees/') || path.startsWith('/private/tmp/') || path.startsWith('/tmp/');
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  const apply = process.argv.includes('--apply');
  const runNow = process.argv.includes('--run-now');
  activateProductionBackup({ apply, runNow }).then((result) => {
    console.log(result.activated
      ? `Production backup LaunchAgent activated: ${result.service}`
      : 'Production backup LaunchAgent gate passed (dry run); launchd was not changed.');
  }).catch((error) => {
    console.error(`Production backup activation refused: ${error.message}`);
    process.exitCode = 1;
  });
}
