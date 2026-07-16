#!/usr/bin/env node
import { spawnSync } from 'node:child_process';

const args = new Set(process.argv.slice(2));
const strictExternal = args.has('--strict-external');
const nativeUi = args.has('--native-ui');
const skipIos = args.has('--skip-ios');
const skipAndroid = args.has('--skip-android');

const steps = [
  [
    'Web/API MVP gate',
    'npm',
    ['run', 'mvp:verify', ...(strictExternal ? ['--', '--strict-external'] : [])],
  ],
];

if (!skipIos) {
  steps.push(
    ['iOS project generation', 'npm', ['run', 'ios:generate']],
    ['iOS all-target simulator build', 'npm', ['run', 'ios:build']],
    ['iOS shared XCTest contracts', 'npm', ['run', 'ios:test']],
  );
  if (nativeUi) {
    steps.push(['iOS packaged application UI smoke', 'npm', ['run', 'ios:ui']]);
  }
}

if (!skipAndroid) {
  steps.push(
    ['Android four-APK build', 'npm', ['run', 'android:build']],
    ['Android JVM tests and Lint', 'npm', ['run', 'android:test']],
  );
  if (nativeUi) {
    steps.push([
      'Android API/device Compose UI tests',
      'npm',
      ['run', 'android:ui'],
    ]);
  }
}

for (const [label, command, commandArgs, cwd = process.cwd()] of steps) {
  console.log(`\n==> ${label}`);
  const result = spawnSync(command, commandArgs, {
    cwd,
    env: process.env,
    shell: false,
    stdio: 'inherit',
  });
  if (result.status !== 0) {
    console.error(`\nEcosystem verification failed at: ${label}`);
    process.exit(result.status ?? 1);
  }
}

console.log('\nEcosystem software verification complete.');
if (!nativeUi) {
  console.log('Android connected UI tests were not run; use npm run ecosystem:verify:ui with a booted emulator/device.');
}
if (!nativeUi) {
  console.log('iOS packaged XCUITest smoke was not run; use npm run ecosystem:verify:ui with an available simulator.');
}
console.log('XCUITest does not replace physical push/camera/maps/scanner/printer/payment-terminal certification, which remains a separate release gate.');
