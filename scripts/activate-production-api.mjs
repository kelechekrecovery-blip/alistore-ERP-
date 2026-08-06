#!/usr/bin/env node

import { spawn } from 'node:child_process';
import { mkdir, mkdtemp, readFile, rename, rm, writeFile } from 'node:fs/promises';
import { homedir, tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const rootDir = join(dirname(fileURLToPath(import.meta.url)), '..');

async function runCommand(command, args, options = {}) {
  await new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      cwd: options.cwd,
      stdio: options.quiet ? 'ignore' : 'inherit',
    });
    child.once('error', reject);
    child.once('exit', (code, signal) => {
      if (code === 0) {
        resolve();
        return;
      }
      reject(new Error(`${command} exited with ${code ?? signal}`));
    });
  });
}

async function defaultIsLoaded(service, run) {
  try {
    await run('/bin/launchctl', ['print', service], { quiet: true });
    return true;
  } catch {
    return false;
  }
}

async function waitUntilReady(fetchImpl, attempts = 30) {
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      const response = await fetchImpl('http://127.0.0.1:4000/api/health/ready', {
        signal: AbortSignal.timeout(5_000),
      });
      if (response.status === 200) return;
    } catch {
      // launchd may still be starting the process.
    }
    await new Promise((resolve) => setTimeout(resolve, 1_000));
  }
  throw new Error('Production API did not become ready on 127.0.0.1:4000.');
}

export async function activateProductionApi({
  projectRoot = rootDir,
  userHome = homedir(),
  uid = process.getuid(),
  nodePath = process.execPath,
  run = runCommand,
  isLoaded = defaultIsLoaded,
  makeDirectory = mkdir,
  makeTemporaryDirectory = mkdtemp,
  read = readFile,
  write = writeFile,
  move = rename,
  remove = rm,
  fetchImpl = fetch,
  warn = console.warn,
  dryRun = false,
} = {}) {
  // This is the safety barrier: no launchd state or installed plist is touched
  // unless both internal and external production readiness checks pass.
  await run('npm', ['run', 'launch:check'], { cwd: projectRoot });
  await run('npm', ['run', 'api:build'], { cwd: projectRoot });
  const sourcePlist = join(projectRoot, 'scripts', 'com.alistore.api.plist');
  const template = await read(sourcePlist, 'utf8');
  const renderedPlist = renderProductionApiPlist(template, { nodePath, projectRoot });
  const temporaryDirectory = await makeTemporaryDirectory(join(tmpdir(), 'alistore-api-agent-'));
  const temporaryPlist = join(temporaryDirectory, 'com.alistore.api.plist');
  let stagedPlist;
  let backupPlist;
  let removeBackupOnCleanup = false;
  const cleanupWarnings = [];

  try {
    await write(temporaryPlist, renderedPlist, { mode: 0o600 });
    await run('/usr/bin/plutil', ['-lint', temporaryPlist]);
    if (dryRun) return { activated: false, reason: 'dry-run', plist: renderedPlist, cleanupWarnings };

    const installedPlist = join(userHome, 'Library', 'LaunchAgents', 'com.alistore.api.plist');
    stagedPlist = `${installedPlist}.new`;
    backupPlist = `${installedPlist}.previous`;
    const domain = `gui/${uid}`;
    const service = `${domain}/com.alistore.api`;
    const wasLoaded = await isLoaded(service, run);
    let previousPlist = null;
    try {
      previousPlist = await read(installedPlist);
    } catch (error) {
      if (error?.code !== 'ENOENT') throw error;
    }

    try {
      await read(backupPlist);
      throw new Error(
        `Interrupted activation backup exists at ${backupPlist}; restore or remove it before retrying`,
      );
    } catch (error) {
      if (error?.code !== 'ENOENT') throw error;
    }

    await makeDirectory(dirname(installedPlist), { recursive: true });
    await remove(stagedPlist, { force: true });
    // Keep the previous bytes on disk until the replacement has passed its
    // health gate. The explicit marker covers a first install with no prior
    // agent, so a crash is still diagnosable and recoverable.
    await write(
      backupPlist,
      previousPlist ?? Buffer.from('ALISTORE_NO_PREVIOUS_PLIST\n'),
      { mode: 0o600 },
    );
    await write(stagedPlist, renderedPlist, { mode: 0o600 });
    await move(stagedPlist, installedPlist);

    let replacementBootstrapped = false;
    try {
      if (wasLoaded) await run('/bin/launchctl', ['bootout', service]);
      await run('/bin/launchctl', ['bootstrap', domain, installedPlist]);
      replacementBootstrapped = true;
      await run('/bin/launchctl', ['kickstart', '-k', service]);
      await waitUntilReady(fetchImpl);
      removeBackupOnCleanup = true;
    } catch (activationError) {
      const rollbackFailures = [];
      if (replacementBootstrapped) {
        await run('/bin/launchctl', ['bootout', service], { quiet: true })
          .catch((error) => rollbackFailures.push(error));
      }
      try {
        if (previousPlist !== null) {
          const durablePreviousPlist = await read(backupPlist);
          await write(stagedPlist, durablePreviousPlist, { mode: 0o600 });
          await move(stagedPlist, installedPlist);
          if (wasLoaded) {
            await run('/bin/launchctl', ['bootstrap', domain, installedPlist]);
            await run('/bin/launchctl', ['kickstart', '-k', service]);
          }
        } else {
          await remove(installedPlist, { force: true });
        }
      } catch (rollbackError) {
        rollbackFailures.push(rollbackError);
      }
      removeBackupOnCleanup = rollbackFailures.length === 0;
      const rollback = rollbackFailures.length === 0
        ? previousPlist !== null ? 'previous agent restored' : 'new agent removed'
        : `rollback incomplete (${rollbackFailures.length} failure(s))`;
      throw new Error(`Production API activation failed; ${rollback}`, { cause: activationError });
    }

    return { activated: true, service, cleanupWarnings };
  } finally {
    const cleanup = async (path, options) => {
      try {
        await remove(path, options);
      } catch (error) {
        cleanupWarnings.push(error);
        warn(`Production API activation cleanup warning for ${path}: ${error.message}`);
      }
    };
    if (stagedPlist) await cleanup(stagedPlist, { force: true });
    if (backupPlist && removeBackupOnCleanup) await cleanup(backupPlist, { force: true });
    await cleanup(temporaryDirectory, { recursive: true, force: true });
  }
}

export function renderProductionApiPlist(template, { nodePath, projectRoot }) {
  return template
    .replaceAll('__NODE_PATH__', xmlEscape(nodePath))
    .replaceAll('__PROJECT_ROOT__', xmlEscape(projectRoot));
}

function xmlEscape(value) {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&apos;');
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  const dryRun = process.argv.includes('--dry-run');
  activateProductionApi({ dryRun })
    .then((result) => {
      if (result.activated) {
        console.log(`Production API activated: ${result.service}`);
      } else {
        console.log('Production API activation gate passed (dry run); launchd was not changed.');
      }
    })
    .catch((error) => {
      console.error(`Production API activation refused: ${error.message}`);
      process.exitCode = 1;
    });
}
