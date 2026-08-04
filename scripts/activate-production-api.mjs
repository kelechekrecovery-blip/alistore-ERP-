#!/usr/bin/env node

import { spawn } from 'node:child_process';
import { copyFile, mkdir } from 'node:fs/promises';
import { homedir } from 'node:os';
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
  run = runCommand,
  isLoaded = defaultIsLoaded,
  copy = copyFile,
  makeDirectory = mkdir,
  fetchImpl = fetch,
  dryRun = false,
} = {}) {
  // This is the safety barrier: no launchd state or installed plist is touched
  // unless both internal and external production readiness checks pass.
  await run('npm', ['run', 'launch:check'], { cwd: projectRoot });
  await run('npm', ['run', 'api:build'], { cwd: projectRoot });
  await run('/usr/bin/plutil', ['-lint', join(projectRoot, 'scripts', 'com.alistore.api.plist')]);

  if (dryRun) return { activated: false, reason: 'dry-run' };

  const sourcePlist = join(projectRoot, 'scripts', 'com.alistore.api.plist');
  const installedPlist = join(userHome, 'Library', 'LaunchAgents', 'com.alistore.api.plist');
  const domain = `gui/${uid}`;
  const service = `${domain}/com.alistore.api`;

  await makeDirectory(dirname(installedPlist), { recursive: true });
  await copy(sourcePlist, installedPlist);

  if (await isLoaded(service, run)) {
    await run('/bin/launchctl', ['bootout', service]);
  }
  await run('/bin/launchctl', ['bootstrap', domain, installedPlist]);
  await run('/bin/launchctl', ['kickstart', '-k', service]);
  await waitUntilReady(fetchImpl);

  return { activated: true, service };
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
