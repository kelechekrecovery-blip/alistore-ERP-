#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

export const TRUSTED_ANDROID_SDK_ROOT = '/Users/alistore/Library/Android/sdk';
export const TRUSTED_GRADLE_USER_HOME = '/Users/alistore/.gradle';
export const TRUSTED_JAVA_HOME = '/opt/homebrew/opt/openjdk@17';
export const TRUSTED_GRADLE_VERSION = '9.1.0';

const sandboxExecutable = '/usr/bin/sandbox-exec';
const defaultProjectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const androidUiTasks = [
  ':core:connectedDebugAndroidTest',
  ':app:connectedDebugAndroidTest',
  ':staff:connectedDebugAndroidTest',
  ':courier:connectedDebugAndroidTest',
  ':pos:connectedDebugAndroidTest',
];

const lstatIfPresent = (targetPath) => {
  try {
    return fs.lstatSync(targetPath);
  } catch (error) {
    if (error?.code === 'ENOENT') return null;
    throw error;
  }
};

const sandboxString = (value) =>
  `"${value.replaceAll('\\', '\\\\').replaceAll('"', '\\"').replaceAll('\n', '\\n')}"`;

const deniedGradleConfiguration = (
  projectRoot,
  gradleUserHome,
  distributionInitDirectory,
) => ({
  literals: [
    path.join(projectRoot, 'apps', 'android', 'local.properties'),
    path.join(gradleUserHome, 'gradle.properties'),
    path.join(gradleUserHome, 'init.gradle'),
    path.join(gradleUserHome, 'init.gradle.kts'),
  ],
  subpaths: [path.join(gradleUserHome, 'init.d'), distributionInitDirectory].filter(Boolean),
});

export const androidSandboxProfile = ({
  projectRoot,
  gradleUserHome,
  distributionInitDirectory,
}) => {
  const denied = deniedGradleConfiguration(
    projectRoot,
    gradleUserHome,
    distributionInitDirectory,
  );
  const filters = [
    ...denied.literals.map((targetPath) => `(literal ${sandboxString(targetPath)})`),
    ...denied.subpaths.map((targetPath) => `(subpath ${sandboxString(targetPath)})`),
  ].join(' ');
  return `(version 1) (allow default) (deny file-read* ${filters}) (deny file-write* ${filters})`;
};

const assertCanonicalDirectory = (directoryPath, label) => {
  const stat = lstatIfPresent(directoryPath);
  if (
    !stat?.isDirectory() ||
    stat.isSymbolicLink() ||
    fs.realpathSync(directoryPath) !== directoryPath
  ) {
    throw new Error(`${label} is missing, non-canonical, or symbolic: ${directoryPath}`);
  }
};

const assertCanonicalExecutable = (executablePath, label) => {
  const stat = lstatIfPresent(executablePath);
  if (
    !stat?.isFile() ||
    stat.isSymbolicLink() ||
    fs.realpathSync(executablePath) !== executablePath ||
    (stat.mode & 0o111) === 0
  ) {
    throw new Error(
      `${label} is missing, non-regular, non-canonical, symbolic, or not executable: ${executablePath}`,
    );
  }
};

const assertAbsentGradleConfiguration = (projectRoot, gradleUserHome) => {
  const denied = deniedGradleConfiguration(projectRoot, gradleUserHome);
  const present = [...denied.literals, ...denied.subpaths].filter(lstatIfPresent);
  if (present.length > 0) {
    throw new Error(
      `Refusing Android evidence while untrusted Gradle configuration exists: ${present.join(', ')}`,
    );
  }
};

const resolveDistributionInitDirectory = (gradleUserHome) => {
  const distributionParent = path.join(
    gradleUserHome,
    'wrapper',
    'dists',
    `gradle-${TRUSTED_GRADLE_VERSION}-bin`,
  );
  assertCanonicalDirectory(distributionParent, 'Trusted Gradle distribution parent');
  const candidates = fs.readdirSync(distributionParent, { withFileTypes: true })
    .filter((entry) => entry.isDirectory() && !entry.isSymbolicLink())
    .map((entry) => path.join(
      distributionParent,
      entry.name,
      `gradle-${TRUSTED_GRADLE_VERSION}`,
      'init.d',
    ))
    .filter((candidate) => lstatIfPresent(candidate)?.isDirectory());
  if (candidates.length !== 1) {
    throw new Error('Trusted Gradle distribution must resolve to exactly one init.d directory.');
  }
  assertCanonicalDirectory(candidates[0], 'Trusted Gradle distribution init directory');
  return candidates[0];
};

export function assertTrustedAndroidUiEnvironment({
  projectRoot = defaultProjectRoot,
  sdkRoot = TRUSTED_ANDROID_SDK_ROOT,
  gradleUserHome = TRUSTED_GRADLE_USER_HOME,
} = {}) {
  assertCanonicalDirectory(projectRoot, 'Trusted project root');
  assertCanonicalDirectory(path.join(projectRoot, 'apps', 'android'), 'Trusted Android project');
  assertCanonicalDirectory(sdkRoot, 'Trusted Android SDK root');
  assertCanonicalDirectory(gradleUserHome, 'Trusted Gradle user home');
  assertAbsentGradleConfiguration(projectRoot, gradleUserHome);
  const distributionInitDirectory = resolveDistributionInitDirectory(gradleUserHome);

  const adbPath = path.join(sdkRoot, 'platform-tools', 'adb');
  const gradlewPath = path.join(projectRoot, 'apps', 'android', 'gradlew');
  assertCanonicalExecutable(adbPath, 'Trusted Android adb');
  assertCanonicalExecutable(gradlewPath, 'Trusted Gradle wrapper');
  assertCanonicalExecutable(sandboxExecutable, 'Trusted macOS sandbox');

  return {
    adbPath,
    distributionInitDirectory,
    gradlewPath,
    projectRoot,
    sdkRoot,
    gradleUserHome,
  };
}

export function runTrustedAndroidUi(options = {}) {
  const trusted = assertTrustedAndroidUiEnvironment(options);
  const profile = androidSandboxProfile(trusted);
  const run = spawnSync(
    sandboxExecutable,
    [
      '-p',
      profile,
      trusted.gradlewPath,
      '--no-daemon',
      '--no-configuration-cache',
      '--no-parallel',
      '--max-workers=1',
      ...androidUiTasks,
    ],
    {
      cwd: path.join(trusted.projectRoot, 'apps', 'android'),
      env: {
        ALISTORE_EVIDENCE_MODE: '1',
        ANDROID_HOME: trusted.sdkRoot,
        ANDROID_SDK_ROOT: trusted.sdkRoot,
        GRADLE_USER_HOME: trusted.gradleUserHome,
        HOME: '/Users/alistore',
        JAVA_HOME: TRUSTED_JAVA_HOME,
        LANG: 'C',
        PATH: '/usr/bin:/bin:/usr/sbin:/sbin',
        TMPDIR: '/tmp',
      },
      shell: false,
      stdio: 'inherit',
    },
  );
  assertAbsentGradleConfiguration(trusted.projectRoot, trusted.gradleUserHome);
  if (run.error) throw run.error;
  if (run.signal) throw new Error(`Trusted Android UI runner terminated by ${run.signal}.`);
  return run.status ?? 1;
}

const isMain = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  if (process.argv.length !== 2) {
    console.error('Trusted Android UI runner takes no arguments.');
    process.exit(2);
  }
  try {
    process.exit(runTrustedAndroidUi());
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exit(1);
  }
}
