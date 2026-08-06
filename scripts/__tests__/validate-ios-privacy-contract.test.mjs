import assert from 'node:assert/strict';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import {
  assertMetadataMatchesCapabilities,
  assertPrivacyManifest,
  parsePlist,
  validateIosPrivacyContract,
} from '../validate-ios-privacy-contract.mjs';

const PROJECT_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');

const manifest = (records) => `
<plist version="1.0"><dict>
  <key>NSPrivacyTracking</key><false/>
  <key>NSPrivacyCollectedDataTypes</key><array>${records}</array>
</dict></plist>`;

const record = (type, purpose = 'NSPrivacyCollectedDataTypePurposeAppFunctionality') => `
<dict>
  <key>NSPrivacyCollectedDataType</key><string>${type}</string>
  <key>NSPrivacyCollectedDataTypeLinked</key><true/>
  <key>NSPrivacyCollectedDataTypeTracking</key><false/>
  <key>NSPrivacyCollectedDataTypePurposes</key><array><string>${purpose}</string></array>
</dict>`;

test('requires an exact, duplicate-free set of collected data declarations', () => {
  assert.doesNotThrow(() => assertPrivacyManifest('client', manifest(record('DeviceID')), ['DeviceID']));
  assert.throws(
    () => assertPrivacyManifest('client', manifest(record('PhoneNumber')), ['DeviceID']),
    /DeviceID is missing/u,
  );
  assert.throws(
    () => assertPrivacyManifest('client', manifest(record('DeviceID') + record('DeviceID')), ['DeviceID']),
    /duplicate DeviceID/u,
  );
  assert.throws(
    () => assertPrivacyManifest('client', manifest(record('DeviceID') + record('Email')), ['DeviceID']),
    /unexpected Email/u,
  );
});

test('requires App Functionality in the actual purposes array', () => {
  assert.throws(
    () =>
      assertPrivacyManifest(
        'client',
        manifest(record('DeviceID', 'NSPrivacyCollectedDataTypePurposeAnalytics')),
        ['DeviceID'],
      ),
    /must declare only App Functionality/u,
  );
});

test('uses a real plist parser and rejects malformed XML entities and structure', () => {
  assert.throws(() => parsePlist('client', '<plist><dict><key>A</key><string>A & B</string></dict></plist>'));
  assert.throws(() => parsePlist('client', '<plist><dict><dict></dict></plist>'));
  assert.throws(
    () => parsePlist('client', '<plist><dict><key>A</key></dict></plist>'),
    /value missing for key/u,
  );
  assert.doesNotThrow(() =>
    parsePlist(
      'client',
      '<plist><!-- A & B --><dict><key>A</key><string><![CDATA[A & B]]></string></dict></plist>',
    ),
  );
  assert.throws(
    () => parsePlist('client', '<plist><dict><![CDATA[garbage]]></dict></plist>'),
    /unexpected text inside <dict>/u,
  );
  assert.throws(
    () => parsePlist('client', '<plist><dict><key>A</key><integer>wat</integer></dict></plist>'),
    /base-10 integer/u,
  );
  assert.throws(
    () => parsePlist('client', '<plist><dict><key>A</key><data>not base64!</data></dict></plist>'),
    /valid base64/u,
  );
  assert.throws(
    () => parsePlist('client', '<plist><dict><key>A<?pi x?></key><string>B</string></dict></plist>'),
    /processing instructions/u,
  );
});

test('enforces the declared location capability and canonical review disclosure', () => {
  const noLocationPlist = '<plist><dict><key>CFBundleName</key><string>Courier</string></dict></plist>';
  const locationPlist =
    '<plist><dict><key>NSLocationWhenInUseUsageDescription</key><string>Route</string></dict></plist>';
  const contract = {
    usesLocation: false,
    requiredReviewNote: 'does not request device location access',
  };
  const metadata = {
    review: { appReviewNotes: 'The app does not request device location access.' },
  };
  assert.doesNotThrow(() =>
    assertMetadataMatchesCapabilities('courier', metadata, noLocationPlist, contract),
  );
  assert.throws(
    () => assertMetadataMatchesCapabilities('courier', metadata, locationPlist, contract),
    /location capability does not match/u,
  );
  assert.throws(
    () =>
      assertMetadataMatchesCapabilities(
        'courier',
        metadata,
        '<plist><dict><key>NSLocationWhenInUseUsageDescription</key><string></string></dict></plist>',
        contract,
      ),
    /must be a non-empty string/u,
  );
  assert.throws(
    () => assertMetadataMatchesCapabilities('courier', { review: {} }, noLocationPlist, contract),
    /required capability disclosure/u,
  );
});

test('the repository privacy contract covers all four shipped apps', () => {
  assert.doesNotThrow(() => validateIosPrivacyContract(PROJECT_ROOT));
});
