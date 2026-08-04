#!/usr/bin/env node
import { existsSync, readFileSync } from 'node:fs';
import { isAbsolute, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(fileURLToPath(import.meta.url), '../..');
const args = process.argv.slice(2);
const strict = args.includes('--strict');
const deprecatedEnvFile = readArg('--env-file');
const envFile = readArg('--store-env-file') ?? deprecatedEnvFile;
const results = [];
const loadedEnvFile = envFile ? loadEnvFile(envFile) : null;

const packageJson = readJson('package.json');
const packageLock = readJson('package-lock.json');
const appJson = readJson('app.json');
const easJson = readJson('eas.json');
const storeConfig = readJson('store.config.json');
const metroConfig = readText('metro.config.js');

check(Boolean(packageJson), 'package.json parses');
if (deprecatedEnvFile) {
  warn(false, 'Use --store-env-file instead of --env-file for mobile release preflight');
}
if (envFile) {
  check(Boolean(loadedEnvFile?.exists), `${strict ? 'strict: ' : ''}env file ${envFile} exists`);
}
check(Boolean(packageLock?.packages?.['']?.dependencies?.expo), 'package-lock.json is scoped to mobile app');
check(Boolean(appJson?.expo), 'app.json expo config parses');
check(Boolean(easJson?.build?.production), 'eas.json production build profile exists');
check(Boolean(storeConfig?.apple), 'store.config.json Apple metadata exists');
check(Boolean(metroConfig), 'metro.config.js exists');

if (appJson?.expo) {
  const expo = appJson.expo;
  const splash = getPluginConfig(expo.plugins, 'expo-splash-screen');
  const notifications = getPluginConfig(expo.plugins, 'expo-notifications');
  check(expo.name === 'AliStore Native', 'Expo app name is set');
  check(expo.slug === 'alistore-native', 'Expo slug is stable');
  check(Boolean(expo.icon), 'Expo icon is configured');
  check(Boolean(splash?.image), 'Expo splash image is configured');
  check(Boolean(notifications), 'Expo Notifications plugin is configured');
  check(notifications?.defaultChannel === 'orders', 'Expo Notifications default channel is orders');
  check(Boolean(expo.ios?.bundleIdentifier), 'iOS bundleIdentifier is configured');
  check(Boolean(expo.ios?.buildNumber), 'iOS buildNumber is configured');
  check(expo.ios?.config?.usesNonExemptEncryption === false, 'iOS non-exempt encryption flag is false');
  check(Boolean(expo.android?.package), 'Android package is configured');
  check(Number.isInteger(expo.android?.versionCode), 'Android versionCode is configured');
  check(Boolean(expo.android?.adaptiveIcon?.foregroundImage), 'Android adaptive icon foreground is configured');
  check(Boolean(expo.runtimeVersion), 'runtimeVersion is configured for OTA safety');
  check(expo.updates?.enabled === true, 'Expo Updates are explicitly enabled');
  checkAsset(expo.icon, 1024, 1024, 'App icon is 1024x1024 PNG');
  checkAsset(expo.android?.adaptiveIcon?.foregroundImage, 1024, 1024, 'Adaptive icon is 1024x1024 PNG');
  checkAsset(splash?.image, 1290, 2796, 'Splash image is 1290x2796 PNG');
}

if (packageJson?.scripts) {
  for (const script of ['store:assets', 'store:preflight', 'store:preflight:production', 'eas:build:ios', 'eas:build:android', 'eas:submit:ios', 'eas:submit:android']) {
    check(Boolean(packageJson.scripts[script]), `package script ${script} exists`);
  }
}

check(
  packageJson?.expo?.autolinking?.legacy_shallowReactNativeLinking === true,
  'Expo autolinking scans only direct mobile native dependencies'
);
check(packageJson?.dependencies?.['react-dom'] === '19.2.3', 'Mobile react-dom peer is pinned to React 19');
check(packageJson?.dependencies?.['expo-notifications'] === '~57.0.3', 'Expo Notifications dependency is pinned');
check(packageJson?.dependencies?.['expo-device'] === '~57.0.0', 'Expo Device dependency is pinned');
check(packageLock?.packages?.['node_modules/react']?.version === '19.2.3', 'Mobile lock pins React 19');
check(packageLock?.packages?.['node_modules/react-dom']?.version === '19.2.3', 'Mobile lock pins React DOM 19');
check(packageLock?.packages?.['node_modules/expo-notifications']?.version === '57.0.3', 'Mobile lock pins Expo Notifications');
check(packageLock?.packages?.['node_modules/expo-device']?.version === '57.0.0', 'Mobile lock pins Expo Device');

if (metroConfig) {
  check(metroConfig.includes('getDefaultConfig'), 'Metro config extends Expo defaults');
  check(metroConfig.includes('nodeModulesPaths'), 'Metro config pins module resolution order');
  check(metroConfig.includes("react: path.resolve(projectRoot, 'node_modules/react')"), 'Metro config pins React to mobile workspace');
  check(metroConfig.includes("'react-native': path.resolve(projectRoot, 'node_modules/react-native')"), 'Metro config pins React Native to mobile workspace');
}

if (easJson?.build?.production) {
  const prod = easJson.build.production;
  check(prod.distribution === 'store', 'EAS production distribution is store');
  check(prod.autoIncrement === true, 'EAS production autoIncrement is enabled');
  check(prod.android?.buildType === 'app-bundle', 'Android production buildType is app-bundle');
  check(Boolean(prod.ios?.resourceClass), 'iOS production resourceClass is configured');
  check(easJson.submit?.production?.android?.track === 'internal', 'Google Play starts on internal track');
  check(easJson.submit?.production?.android?.serviceAccountKeyPath === './google-service-account.json', 'Google Play submit service account path is configured');
}

if (storeConfig?.apple?.info) {
  for (const [locale, info] of Object.entries(storeConfig.apple.info)) {
    checkText(info.title, 30, `${locale} title is <=30 characters`);
    checkText(info.subtitle, 30, `${locale} subtitle is <=30 characters`);
    const keywords = Array.isArray(info.keywords) ? info.keywords.join(',') : String(info.keywords ?? '');
    check(keywords.length > 0 && keywords.length <= 100, `${locale} keywords are 1..100 characters`);
    checkText(info.description, 4000, `${locale} description is <=4000 characters`);
    checkHttps(info.privacyPolicyUrl, `${locale} privacyPolicyUrl is https`);
    checkHttps(info.supportUrl, `${locale} supportUrl is https`);
  }
}

for (const path of [
  '.eas/workflows/release.yml',
  'store/google-play-listing.md',
  'store/privacy-data.md',
  'store/release-runbook.md',
  'store/review-checklist.md',
  '.env.production.example',
]) {
  check(existsSync(join(root, path)), `${path} exists`);
}

const apiBase = process.env.EXPO_PUBLIC_API_BASE;
const apiReady = Boolean(apiBase && /^https:\/\//.test(apiBase) && !/localhost|127\.0\.0\.1|0\.0\.0\.0/.test(apiBase));
const easProjectId = appJson?.expo?.extra?.eas?.projectId ?? process.env.EXPO_PUBLIC_EAS_PROJECT_ID;
const pushProjectReady = typeof easProjectId === 'string' && easProjectId.trim().length > 0;
const ascKeyFileReady = process.env.EXPO_ASC_API_KEY_PATH
  ? existsSync(resolveLocalPath(process.env.EXPO_ASC_API_KEY_PATH))
  : false;
const appleReady = Boolean(
  process.env.EXPO_APPLE_TEAM_ID ||
    (process.env.EXPO_ASC_API_KEY_ID &&
      process.env.EXPO_ASC_API_KEY_ISSUER_ID &&
      (ascKeyFileReady || process.env.EXPO_ASC_API_KEY_P8_BASE64))
);
const googleServiceAccountFileReady = process.env.GOOGLE_SERVICE_ACCOUNT_KEY_PATH
  ? existsSync(resolveLocalPath(process.env.GOOGLE_SERVICE_ACCOUNT_KEY_PATH))
  : existsSync(join(root, 'google-service-account.json'));
const googleReady = Boolean(
  process.env.EXPO_ANDROID_SERVICE_ACCOUNT_KEY_BASE64 ||
    googleServiceAccountFileReady
);
if (strict) {
  check(apiReady, 'strict: EXPO_PUBLIC_API_BASE is a production HTTPS API URL');
  check(pushProjectReady, 'strict: EAS project id is configured for Expo push tokens');
  check(Boolean(process.env.EXPO_TOKEN), 'strict: EXPO_TOKEN is configured for EAS automation');
  check(appleReady, 'strict: Apple team/API credentials are configured');
  check(googleReady, 'strict: Google Play service account is configured');
} else {
  warn(apiReady, 'EXPO_PUBLIC_API_BASE is not a production HTTPS URL; strict store preflight will require it');
  warn(pushProjectReady, 'EAS project id is not configured; native push token registration will be unavailable');
}

const failed = results.filter((result) => result.level === 'fail');
const warnings = results.filter((result) => result.level === 'warn');
for (const result of results) {
  const marker = result.level === 'pass' ? 'PASS' : result.level === 'warn' ? 'WARN' : 'FAIL';
  console.log(`[${marker}] ${result.message}`);
}
console.log(`Store preflight: ${failed.length ? 'failed' : 'passed'} (${failed.length} failed, ${warnings.length} warnings)`);
if (failed.length) process.exit(1);

function readArg(name) {
  const index = args.indexOf(name);
  if (index === -1) return null;
  const value = args[index + 1];
  return value && !value.startsWith('--') ? value : null;
}

function readJson(path) {
  try {
    return JSON.parse(readFileSync(join(root, path), 'utf8'));
  } catch {
    return null;
  }
}

function readText(path) {
  try {
    return readFileSync(join(root, path), 'utf8');
  } catch {
    return '';
  }
}

function loadEnvFile(path) {
  const fullPath = resolveLocalPath(path);
  if (!existsSync(fullPath)) return { exists: false };
  for (const line of readFileSync(fullPath, 'utf8').split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const match = trimmed.match(/^([A-Za-z_][A-Za-z0-9_]*)=(.*)$/);
    if (!match) continue;
    const [, key, rawValue] = match;
    if (process.env[key] !== undefined) continue;
    process.env[key] = unquote(rawValue.trim());
  }
  return { exists: true };
}

function resolveLocalPath(path) {
  return isAbsolute(path) ? path : join(root, path);
}

function unquote(value) {
  if (
    (value.startsWith('"') && value.endsWith('"')) ||
    (value.startsWith("'") && value.endsWith("'"))
  ) {
    return value.slice(1, -1);
  }
  return value;
}

function checkAsset(path, expectedWidth, expectedHeight, message) {
  if (!path) {
    check(false, message);
    return;
  }
  const fullPath = join(root, path);
  const size = readPngSize(fullPath);
  check(Boolean(size && size.width === expectedWidth && size.height === expectedHeight), message);
}

function getPluginConfig(plugins, name) {
  if (!Array.isArray(plugins)) return null;
  for (const plugin of plugins) {
    if (plugin === name) return {};
    if (Array.isArray(plugin) && plugin[0] === name) return plugin[1] ?? {};
  }
  return null;
}

function readPngSize(path) {
  if (!existsSync(path)) return null;
  const buffer = readFileSync(path);
  const signature = '89504e470d0a1a0a';
  if (buffer.subarray(0, 8).toString('hex') !== signature) return null;
  return {
    width: buffer.readUInt32BE(16),
    height: buffer.readUInt32BE(20),
  };
}

function checkText(value, max, message) {
  check(typeof value === 'string' && value.length > 0 && value.length <= max, message);
}

function checkHttps(value, message) {
  check(typeof value === 'string' && /^https:\/\//.test(value) && !value.includes('example.'), message);
}

function check(condition, message) {
  results.push({ level: condition ? 'pass' : 'fail', message });
}

function warn(condition, message) {
  if (!condition) results.push({ level: 'warn', message });
}
