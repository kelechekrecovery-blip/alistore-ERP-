import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { once } from 'node:events';
import { spawn } from 'node:child_process';
import test from 'node:test';

import {
  assertTrustedAndroidUiEnvironment,
  runTrustedAndroidUi,
  TRUSTED_GRADLE_VERSION,
} from '../run-trusted-android-ui.mjs';

const fixture = (t) => {
  const root = fs.realpathSync(
    fs.mkdtempSync(path.join(os.tmpdir(), 'alistore-trusted-android-ui-')),
  );
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const projectRoot = path.join(root, 'project');
  const androidRoot = path.join(projectRoot, 'apps', 'android');
  const sdkRoot = path.join(root, 'sdk');
  const gradleUserHome = path.join(root, 'gradle-home');
  const distributionInitDirectory = path.join(
    gradleUserHome,
    'wrapper',
    'dists',
    `gradle-${TRUSTED_GRADLE_VERSION}-bin`,
    'fixture-hash',
    `gradle-${TRUSTED_GRADLE_VERSION}`,
    'init.d',
  );
  fs.mkdirSync(androidRoot, { recursive: true });
  fs.mkdirSync(path.join(sdkRoot, 'platform-tools'), { recursive: true });
  fs.mkdirSync(distributionInitDirectory, { recursive: true });
  fs.writeFileSync(path.join(distributionInitDirectory, 'readme.txt'), 'Gradle init scripts.\n');
  fs.writeFileSync(path.join(sdkRoot, 'platform-tools', 'adb'), '#!/bin/sh\n', { mode: 0o755 });
  fs.writeFileSync(path.join(androidRoot, 'gradlew'), '#!/bin/sh\nexit 0\n', { mode: 0o755 });
  return {
    androidRoot,
    distributionInitDirectory,
    gradleUserHome,
    projectRoot,
    root,
    sdkRoot,
  };
};

test('accepts absent overrides and canonical regular Android tools', (t) => {
  const paths = fixture(t);
  assert.deepEqual(assertTrustedAndroidUiEnvironment(paths), {
    adbPath: path.join(paths.sdkRoot, 'platform-tools', 'adb'),
    distributionInitDirectory: paths.distributionInitDirectory,
    gradlewPath: path.join(paths.androidRoot, 'gradlew'),
    gradleUserHome: paths.gradleUserHome,
    projectRoot: paths.projectRoot,
    sdkRoot: paths.sdkRoot,
  });
});

test('rejects project and user Gradle configuration', async (t) => {
  for (const [name, claimantPath] of [
    ['regular local.properties', (paths) => path.join(paths.androidRoot, 'local.properties')],
    ['dangling local.properties', (paths) => path.join(paths.androidRoot, 'local.properties')],
    ['user gradle.properties', (paths) => path.join(paths.gradleUserHome, 'gradle.properties')],
    ['user init.d', (paths) => path.join(paths.gradleUserHome, 'init.d')],
  ]) {
    await t.test(name, (subtest) => {
      const paths = fixture(subtest);
      const target = claimantPath(paths);
      if (name === 'dangling local.properties') fs.symlinkSync(path.join(paths.root, 'missing'), target);
      else if (name === 'user init.d') fs.mkdirSync(target);
      else fs.writeFileSync(target, 'claimant=true\n');
      assert.throws(() => assertTrustedAndroidUiEnvironment(paths), /untrusted Gradle configuration/u);
    });
  }
});

test('rejects symbolic SDK paths and adb executables', async (t) => {
  await t.test('SDK root symlink', (subtest) => {
    const paths = fixture(subtest);
    const linkedSdk = path.join(path.dirname(paths.sdkRoot), 'linked-sdk');
    fs.symlinkSync(paths.sdkRoot, linkedSdk);
    assert.throws(
      () => assertTrustedAndroidUiEnvironment({ ...paths, sdkRoot: linkedSdk }),
      /non-canonical|symbolic/u,
    );
  });

  await t.test('adb symlink', (subtest) => {
    const paths = fixture(subtest);
    const adbPath = path.join(paths.sdkRoot, 'platform-tools', 'adb');
    const realAdb = path.join(paths.sdkRoot, 'platform-tools', 'adb-real');
    fs.renameSync(adbPath, realAdb);
    fs.symlinkSync(realAdb, adbPath);
    assert.throws(() => assertTrustedAndroidUiEnvironment(paths), /adb.*symbolic/u);
  });

  await t.test('platform-tools directory symlink', (subtest) => {
    const paths = fixture(subtest);
    const platformTools = path.join(paths.sdkRoot, 'platform-tools');
    const realPlatformTools = path.join(path.dirname(paths.sdkRoot), 'platform-tools-real');
    fs.renameSync(platformTools, realPlatformTools);
    fs.symlinkSync(realPlatformTools, platformTools);
    assert.throws(() => assertTrustedAndroidUiEnvironment(paths), /adb.*non-canonical/u);
  });
});

test('sandbox prevents concurrent project and distribution overrides from reaching Gradle', async (t) => {
  const paths = fixture(t);
  const startedPath = path.join(paths.androidRoot, 'runner-started');
  const readyPath = path.join(paths.androidRoot, 'claimant-ready');
  const removedPath = path.join(paths.androidRoot, 'claimant-removed');
  const localProperties = path.join(paths.androidRoot, 'local.properties');
  const distributionInit = path.join(paths.distributionInitDirectory, 'claimant.gradle');
  const localConsumedPath = path.join(paths.androidRoot, 'local-claimant-consumed');
  const initConsumedPath = path.join(paths.androidRoot, 'init-claimant-consumed');
  fs.writeFileSync(
    path.join(paths.androidRoot, 'gradlew'),
    `#!/bin/sh\nset -eu\n: > ${JSON.stringify(startedPath)}\nwhile [ ! -e ${JSON.stringify(readyPath)} ]; do /bin/sleep 0.01; done\nif /bin/cat ${JSON.stringify(localProperties)} > ${JSON.stringify(localConsumedPath)} 2>/dev/null; then exit 90; fi\nif /bin/cat ${JSON.stringify(distributionInit)} > ${JSON.stringify(initConsumedPath)} 2>/dev/null; then exit 91; fi\nwhile [ ! -e ${JSON.stringify(removedPath)} ]; do /bin/sleep 0.01; done\n`,
    { mode: 0o755 },
  );
  const writer = spawn(
    process.execPath,
    [
      '-e',
      `const fs=require('node:fs');const started=${JSON.stringify(startedPath)};const localTarget=${JSON.stringify(localProperties)};const initTarget=${JSON.stringify(distributionInit)};const ready=${JSON.stringify(readyPath)};const removed=${JSON.stringify(removedPath)};const timer=setInterval(()=>{if(!fs.existsSync(started))return;clearInterval(timer);fs.writeFileSync(localTarget,'sdk.dir=/tmp/claimant-sdk\\n');fs.writeFileSync(initTarget,'println("claimant")\\n');fs.writeFileSync(ready,'ready');setTimeout(()=>{fs.rmSync(localTarget);fs.rmSync(initTarget);fs.writeFileSync(removed,'removed')},100)},5)`,
    ],
    { stdio: 'inherit' },
  );
  t.after(() => {
    if (writer.exitCode === null) writer.kill('SIGKILL');
  });

  assert.equal(runTrustedAndroidUi(paths), 0);
  if (writer.exitCode === null) await once(writer, 'exit');
  assert.notEqual(fs.readFileSync(localConsumedPath, 'utf8'), 'sdk.dir=/tmp/claimant-sdk\n');
  assert.notEqual(fs.readFileSync(initConsumedPath, 'utf8'), 'println("claimant")\n');
  assert.equal(fs.existsSync(localProperties), false);
  assert.equal(fs.existsSync(distributionInit), false);
});
