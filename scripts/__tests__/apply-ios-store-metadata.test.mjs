import test from 'node:test';
import assert from 'node:assert/strict';
import {
  APP_KEYS,
  ASC_APP_IDS,
  appInfoState,
  assertCredentials,
  desiredMetadata,
  planChanges,
  readStoreMetadata,
  resolveOutcome,
  selectAppInfo,
} from '../apply-ios-store-metadata.mjs';

test('ecosystem metadata maps to the App Store Connect enums', () => {
  const desired = desiredMetadata({
    app: { category: 'BUSINESS', contentRights: 'DOES_NOT_USE_THIRD_PARTY_CONTENT' },
  });
  assert.deepEqual(desired, {
    primaryCategory: 'BUSINESS',
    contentRightsDeclaration: 'DOES_NOT_USE_THIRD_PARTY_CONTENT',
  });
});

test('the storefront "with rights" wording maps to the enum App Store Connect accepts', () => {
  // apps/ios/store/client-metadata.json says USES_THIRD_PARTY_CONTENT_WITH_RIGHTS,
  // but contentRightsDeclaration only accepts USES_THIRD_PARTY_CONTENT.
  const desired = desiredMetadata({
    app: { category: 'SHOPPING', contentRights: 'USES_THIRD_PARTY_CONTENT_WITH_RIGHTS' },
  });
  assert.equal(desired.contentRightsDeclaration, 'USES_THIRD_PARTY_CONTENT');
});

test('an unknown category or content-rights value fails instead of being sent to Apple', () => {
  assert.throws(
    () => desiredMetadata({ app: { category: 'NOT_A_CATEGORY', contentRights: 'DOES_NOT_USE_THIRD_PARTY_CONTENT' } }),
    /category/iu,
  );
  assert.throws(
    () => desiredMetadata({ app: { category: 'BUSINESS', contentRights: 'MAYBE' } }),
    /content rights/iu,
  );
});

test('matching remote state produces no changes, so a re-run writes nothing', () => {
  const desired = { primaryCategory: 'BUSINESS', contentRightsDeclaration: 'DOES_NOT_USE_THIRD_PARTY_CONTENT' };
  const changes = planChanges(desired, {
    primaryCategory: 'BUSINESS',
    contentRightsDeclaration: 'DOES_NOT_USE_THIRD_PARTY_CONTENT',
  });
  assert.deepEqual(changes, []);
});

test('an unset remote state produces one change per missing field', () => {
  const desired = { primaryCategory: 'BUSINESS', contentRightsDeclaration: 'DOES_NOT_USE_THIRD_PARTY_CONTENT' };
  const changes = planChanges(desired, { primaryCategory: null, contentRightsDeclaration: null });
  assert.deepEqual(changes.map((change) => change.field).sort(), [
    'contentRightsDeclaration',
    'primaryCategory',
  ]);
  const category = changes.find((change) => change.field === 'primaryCategory');
  assert.equal(category.from, null);
  assert.equal(category.to, 'BUSINESS');
});

test('only the field that actually differs is changed', () => {
  const desired = { primaryCategory: 'BUSINESS', contentRightsDeclaration: 'DOES_NOT_USE_THIRD_PARTY_CONTENT' };
  const changes = planChanges(desired, {
    primaryCategory: 'BUSINESS',
    contentRightsDeclaration: null,
  });
  assert.equal(changes.length, 1);
  assert.equal(changes[0].field, 'contentRightsDeclaration');
});

test('read-only checks inspect submitted appInfo while apply remains fail-closed', () => {
  const submitted = { id: 'submitted', attributes: { appStoreState: 'WAITING_FOR_REVIEW' } };
  const editable = { id: 'editable', attributes: { appStoreState: 'PREPARE_FOR_SUBMISSION' } };

  assert.equal(selectAppInfo([submitted], 'check'), submitted);
  assert.equal(selectAppInfo([submitted], 'dry-run'), submitted);
  assert.equal(selectAppInfo([submitted], 'apply'), null);
  assert.equal(selectAppInfo([submitted, editable], 'apply'), editable);
  assert.equal(appInfoState(submitted), 'WAITING_FOR_REVIEW');
  assert.equal(appInfoState({}), 'UNKNOWN');
});

test('incomplete App Store Connect credentials fail closed', () => {
  assert.throws(() => assertCredentials({ keyPath: '', keyId: 'A38GZ3M6DB', issuerId: '11111111-2222-3333-4444-555555555555' }), /key/iu);
  assert.throws(() => assertCredentials({ keyPath: '/k.p8', keyId: 'short', issuerId: '11111111-2222-3333-4444-555555555555' }), /key id/iu);
  assert.throws(() => assertCredentials({ keyPath: '/k.p8', keyId: 'A38GZ3M6DB', issuerId: 'not-a-uuid' }), /issuer/iu);
  assert.doesNotThrow(() => assertCredentials({
    keyPath: '/k.p8',
    keyId: 'A38GZ3M6DB',
    issuerId: '11111111-2222-3333-4444-555555555555',
  }));
});

test('--check fails on drift so a release gate can catch it', () => {
  // The whole point: category and content rights silently went missing once and
  // nothing noticed until three apps could not be submitted.
  assert.equal(resolveOutcome({ mode: 'check', pending: 2 }).exitCode, 1);
  assert.equal(resolveOutcome({ mode: 'check', pending: 0 }).exitCode, 0);
});

test('dry run and apply report drift without failing', () => {
  assert.equal(resolveOutcome({ mode: 'dry-run', pending: 2 }).exitCode, 0);
  assert.equal(resolveOutcome({ mode: 'apply', applied: 2 }).exitCode, 0);
  assert.match(resolveOutcome({ mode: 'dry-run', pending: 0 }).message, /no changes/iu);
  assert.match(resolveOutcome({ mode: 'apply', applied: 2 }).message, /2/u);
});

test('every shipped app declares values this script can apply', () => {
  assert.deepEqual(APP_KEYS, ['client', 'staff', 'courier', 'pos']);
  for (const key of APP_KEYS) {
    assert.match(ASC_APP_IDS[key], /^\d+$/u, `${key} needs an App Store Connect app id`);
    const desired = desiredMetadata(readStoreMetadata(key));
    assert.ok(desired.primaryCategory, `${key} declares no category`);
    assert.ok(desired.contentRightsDeclaration, `${key} declares no content rights`);
  }
});
