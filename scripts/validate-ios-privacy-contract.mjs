#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { DOMParser } from '@xmldom/xmldom';
import plist from 'plist';

const PROJECT_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const APP_FUNCTIONALITY = 'NSPrivacyCollectedDataTypePurposeAppFunctionality';
const PLIST_VALUE_TAGS = new Set([
  'array',
  'data',
  'date',
  'dict',
  'false',
  'integer',
  'real',
  'string',
  'true',
]);

const APP_CONTRACTS = {
  client: {
    directory: 'Client',
    dataTypes: [
      'NSPrivacyCollectedDataTypeDeviceID',
      'NSPrivacyCollectedDataTypeName',
      'NSPrivacyCollectedDataTypeEmailAddress',
      'NSPrivacyCollectedDataTypePhoneNumber',
      'NSPrivacyCollectedDataTypePhysicalAddress',
      'NSPrivacyCollectedDataTypePurchaseHistory',
      'NSPrivacyCollectedDataTypePhotosorVideos',
      'NSPrivacyCollectedDataTypeOtherDataTypes',
    ],
    usesLocation: false,
  },
  staff: {
    directory: 'Staff',
    dataTypes: [
      'NSPrivacyCollectedDataTypeDeviceID',
      'NSPrivacyCollectedDataTypeName',
      'NSPrivacyCollectedDataTypePhoneNumber',
      'NSPrivacyCollectedDataTypePurchaseHistory',
      'NSPrivacyCollectedDataTypePhotosorVideos',
    ],
    usesLocation: false,
  },
  courier: {
    directory: 'Courier',
    dataTypes: [
      'NSPrivacyCollectedDataTypeDeviceID',
      'NSPrivacyCollectedDataTypePhoneNumber',
      'NSPrivacyCollectedDataTypePhysicalAddress',
      'NSPrivacyCollectedDataTypePurchaseHistory',
      'NSPrivacyCollectedDataTypePhotosorVideos',
    ],
    usesLocation: false,
    requiredReviewNote: 'does not request device location access',
  },
  pos: {
    directory: 'POS',
    dataTypes: [
      'NSPrivacyCollectedDataTypeDeviceID',
      'NSPrivacyCollectedDataTypePhoneNumber',
      'NSPrivacyCollectedDataTypePurchaseHistory',
      'NSPrivacyCollectedDataTypePhotosorVideos',
    ],
    usesLocation: false,
  },
};

function elementChildren(node) {
  return Array.from(node.childNodes ?? []).filter((child) => child.nodeType === 1);
}

function assertWhitespaceOutsideElements(node) {
  for (const child of Array.from(node.childNodes ?? [])) {
    if ((child.nodeType === 3 || child.nodeType === 4) && child.data.trim() !== '') {
      throw new Error(`unexpected text inside <${node.tagName}>`);
    }
    if (![1, 3, 4, 8].includes(child.nodeType)) {
      throw new Error(`unsupported XML node inside <${node.tagName}>`);
    }
  }
}

function assertScalarValue(element) {
  for (const child of Array.from(element.childNodes ?? [])) {
    if (![3, 4, 8].includes(child.nodeType)) {
      throw new Error(`<${element.tagName}> cannot contain child elements or processing instructions`);
    }
  }
  const value = element.textContent.trim();
  if (element.tagName === 'integer' && !/^[+-]?\d+$/u.test(value)) {
    throw new Error('<integer> must contain a base-10 integer');
  }
  if (
    element.tagName === 'real' &&
    !/^[+-]?(?:\d+(?:\.\d*)?|\.\d+)(?:[eE][+-]?\d+)?$/u.test(value)
  ) {
    throw new Error('<real> must contain a decimal number');
  }
  if (element.tagName === 'date' && !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z$/u.test(value)) {
    throw new Error('<date> must use the UTC plist date format');
  }
  if (element.tagName === 'data') {
    const compact = element.textContent.replace(/\s/gu, '');
    if (!/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/u.test(compact)) {
      throw new Error('<data> must contain valid base64');
    }
  }
}

function assertPlistValue(element) {
  if (!PLIST_VALUE_TAGS.has(element.tagName)) {
    throw new Error(`unsupported plist value <${element.tagName}>`);
  }

  const children = elementChildren(element);
  if (element.tagName === 'dict') {
    assertWhitespaceOutsideElements(element);
    if (children.length % 2 !== 0) throw new Error('value missing for key inside <dict>');
    for (let index = 0; index < children.length; index += 2) {
      const key = children[index];
      if (key.tagName !== 'key') throw new Error('dictionary entries must start with <key>');
      if (elementChildren(key).length > 0) throw new Error('<key> cannot contain child elements');
      assertScalarValue(key);
      assertPlistValue(children[index + 1]);
    }
    return;
  }

  if (element.tagName === 'array') {
    assertWhitespaceOutsideElements(element);
    for (const child of children) assertPlistValue(child);
    return;
  }

  if (children.length > 0) throw new Error(`<${element.tagName}> cannot contain child elements`);
  assertScalarValue(element);
  if ((element.tagName === 'true' || element.tagName === 'false') && element.textContent.trim() !== '') {
    throw new Error(`<${element.tagName}> cannot contain text`);
  }
}

function assertPlistStructure(document) {
  const root = document.documentElement;
  if (!root || root.tagName !== 'plist') throw new Error('root element must be <plist>');
  assertWhitespaceOutsideElements(root);
  const values = elementChildren(root);
  if (values.length !== 1) throw new Error('<plist> must contain exactly one value');
  assertPlistValue(values[0]);
}

export function parsePlist(appKey, xml) {
  const entityCheckedXml = xml
    .replace(/<!--[\s\S]*?-->/gu, '')
    .replace(/<!\[CDATA\[[\s\S]*?\]\]>/gu, '');
  if (/&(?!amp;|lt;|gt;|quot;|apos;|#\d+;|#x[0-9A-Fa-f]+;)/u.test(entityCheckedXml)) {
    throw new Error(`${appKey}: malformed plist: invalid XML entity`);
  }

  try {
    const document = new DOMParser({
      onError(level, message) {
        throw new Error(`${level}: ${message}`);
      },
    }).parseFromString(xml, 'application/xml');
    assertPlistStructure(document);
    const parsed = plist.parse(xml);
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
      throw new Error('root must be a dictionary');
    }
    return parsed;
  } catch (error) {
    throw new Error(`${appKey}: malformed plist: ${error.message}`);
  }
}

export function assertPrivacyManifest(appKey, xml, expectedTypes) {
  const manifest = parsePlist(appKey, xml);
  if (manifest.NSPrivacyTracking !== false) {
    throw new Error(`${appKey}: NSPrivacyTracking must be false`);
  }
  if (!Array.isArray(manifest.NSPrivacyCollectedDataTypes)) {
    throw new Error(`${appKey}: NSPrivacyCollectedDataTypes must be an array`);
  }

  const seen = new Set();
  for (const record of manifest.NSPrivacyCollectedDataTypes) {
    const type = record?.NSPrivacyCollectedDataType;
    if (typeof type !== 'string' || type.length === 0) {
      throw new Error(`${appKey}: collected data type must be a non-empty string`);
    }
    if (seen.has(type)) throw new Error(`${appKey}: duplicate ${type}`);
    seen.add(type);
    if (record.NSPrivacyCollectedDataTypeLinked !== true) {
      throw new Error(`${appKey}: ${type} must be user-linked`);
    }
    if (record.NSPrivacyCollectedDataTypeTracking !== false) {
      throw new Error(`${appKey}: ${type} must not be used for tracking`);
    }
    const purposes = record.NSPrivacyCollectedDataTypePurposes;
    if (!Array.isArray(purposes) || purposes.length !== 1 || purposes[0] !== APP_FUNCTIONALITY) {
      throw new Error(`${appKey}: ${type} must declare only App Functionality purpose`);
    }
  }

  const expected = new Set(expectedTypes);
  for (const type of expected) {
    if (!seen.has(type)) throw new Error(`${appKey}: ${type} is missing`);
  }
  for (const type of seen) {
    if (!expected.has(type)) throw new Error(`${appKey}: unexpected ${type}`);
  }
}

export function assertMetadataMatchesCapabilities(appKey, metadata, infoPlistXml, contract) {
  const infoPlist = parsePlist(`${appKey} Info.plist`, infoPlistXml);
  const locationKeys = [
    'NSLocationWhenInUseUsageDescription',
    'NSLocationAlwaysAndWhenInUseUsageDescription',
  ].filter((key) => Object.prototype.hasOwnProperty.call(infoPlist, key));
  for (const key of locationKeys) {
    if (typeof infoPlist[key] !== 'string' || infoPlist[key].trim() === '') {
      throw new Error(`${appKey}: ${key} must be a non-empty string when declared`);
    }
  }
  const declaresLocation = locationKeys.length > 0;
  if (declaresLocation !== contract.usesLocation) {
    throw new Error(
      `${appKey}: Info.plist location capability does not match the privacy contract`,
    );
  }
  if (contract.requiredReviewNote) {
    const notes = String(metadata?.review?.appReviewNotes ?? '').toLowerCase();
    if (!notes.includes(contract.requiredReviewNote.toLowerCase())) {
      throw new Error(`${appKey}: review notes do not contain the required capability disclosure`);
    }
  }
}

export function validateIosPrivacyContract(projectRoot = PROJECT_ROOT) {
  for (const [appKey, contract] of Object.entries(APP_CONTRACTS)) {
    const base = path.join(projectRoot, 'apps', 'ios', contract.directory);
    const manifest = fs.readFileSync(path.join(base, 'PrivacyInfo.xcprivacy'), 'utf8');
    const infoPlist = fs.readFileSync(path.join(base, 'Info.plist'), 'utf8');
    const metadata = JSON.parse(
      fs.readFileSync(path.join(projectRoot, 'apps', 'ios', 'store', `${appKey}-metadata.json`), 'utf8'),
    );
    assertPrivacyManifest(appKey, manifest, contract.dataTypes);
    assertMetadataMatchesCapabilities(appKey, metadata, infoPlist, contract);
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    validateIosPrivacyContract();
    console.log('ios-privacy-contract: all four apps match their declared privacy capabilities');
  } catch (error) {
    console.error(`ios-privacy-contract: ${error.message}`);
    process.exit(1);
  }
}
