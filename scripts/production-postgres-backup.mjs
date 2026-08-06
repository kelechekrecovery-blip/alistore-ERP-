#!/usr/bin/env node

import {
  DeleteObjectCommand,
  GetObjectCommand,
  HeadObjectCommand,
  ListObjectsV2Command,
  PutObjectCommand,
  S3Client,
} from '@aws-sdk/client-s3';
import { spawn } from 'node:child_process';
import { createHash, randomUUID } from 'node:crypto';
import { constants, createReadStream, createWriteStream } from 'node:fs';
import {
  access,
  chmod,
  link,
  mkdir,
  mkdtemp,
  open,
  readFile,
  readdir,
  rm,
  stat,
  unlink,
} from 'node:fs/promises';
import { homedir, tmpdir } from 'node:os';
import { basename, dirname, join } from 'node:path';
import { pipeline } from 'node:stream/promises';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { createGunzip, createGzip } from 'node:zlib';
import dotenv from 'dotenv';

const projectRoot = join(dirname(fileURLToPath(import.meta.url)), '..');
const DEFAULT_BUCKET = 'alistore-backups-prod';
const OBJECT_PREFIX = 'postgres/alistore-production/';
const OWNED_FILE_PATTERN = /^alistore-\d{4}-\d{2}-\d{2}T\d{2}-\d{2}-\d{2}-\d{3}Z\.(?:dump|sql)\.gz\.age$/u;
const PRIVACY_ATTESTATION_MAX_AGE_MS = 15 * 60 * 1000;
const SAFE_LIBPQ_PARAMETERS = new Set([
  'application_name',
  'connect_timeout',
  'options',
  'sslcert',
  'sslkey',
  'sslmode',
  'sslrootcert',
]);

export async function loadProductionEnvironment({ root = projectRoot, base = process.env } = {}) {
  const result = { ...base };
  const protectedKeys = new Set(Object.keys(base));
  const loadedKeys = new Set();
  const candidates = [
    'apps/api/.env.production.local',
    'apps/api/.env.production',
    '.env.production.local',
    '.env.production',
  ];
  for (const name of candidates) {
    let parsed;
    try {
      parsed = dotenv.parse(await readFile(join(root, name), 'utf8'));
    } catch (error) {
      if (error?.code === 'ENOENT') continue;
      throw new Error(`Unable to read ${name}`);
    }
    for (const [key, value] of Object.entries(parsed)) {
      if (!protectedKeys.has(key) && !loadedKeys.has(key)) {
        result[key] = value;
        loadedKeys.add(key);
      }
    }
  }
  return result;
}

export function resolveBackupConfig(environment, { userHome = homedir() } = {}) {
  const database = secureLibpqUrl(required(environment, 'DATABASE_URL'));
  const expectedIdentity = required(environment, 'BACKUP_EXPECTED_DATABASE_IDENTITY');
  if (database.identity !== expectedIdentity) {
    throw new Error(`DATABASE_URL identity does not match BACKUP_EXPECTED_DATABASE_IDENTITY (${database.identity})`);
  }

  const endpointUrl = new URL(required(environment, 'S3_ENDPOINT'));
  if (endpointUrl.protocol !== 'https:') throw new Error('S3_ENDPOINT must use HTTPS');
  if (!endpointUrl.hostname.endsWith('.r2.cloudflarestorage.com')) {
    throw new Error('S3_ENDPOINT must be a Cloudflare R2 S3 endpoint');
  }
  if (endpointUrl.username || endpointUrl.password) throw new Error('S3_ENDPOINT must not contain credentials');
  const endpointAccountId = endpointUrl.hostname.split('.')[0];
  if (!/^[a-f0-9]{32}$/iu.test(endpointAccountId)) throw new Error('S3_ENDPOINT does not contain a valid account ID');

  const bucket = environment.S3_BACKUP_BUCKET?.trim() || DEFAULT_BUCKET;
  if (bucket !== DEFAULT_BUCKET) throw new Error(`S3_BACKUP_BUCKET must be ${DEFAULT_BUCKET}`);
  const accessKeyId = environment.AWS_ACCESS_KEY_ID?.trim() || environment.MINIO_ROOT_USER?.trim();
  const secretAccessKey = environment.AWS_SECRET_ACCESS_KEY?.trim()
    || environment.MINIO_ROOT_PASSWORD?.trim();
  if (!accessKeyId) throw new Error('AWS_ACCESS_KEY_ID or MINIO_ROOT_USER is required');
  if (!secretAccessKey) throw new Error('AWS_SECRET_ACCESS_KEY or MINIO_ROOT_PASSWORD is required');

  const format = environment.BACKUP_FORMAT?.trim().toLowerCase() || 'custom';
  if (!['custom', 'plain'].includes(format)) throw new Error('BACKUP_FORMAT must be custom or plain');
  const ageRecipient = required(environment, 'BACKUP_AGE_RECIPIENT');
  const keepDays = parsePositiveInteger(environment.BACKUP_KEEP_DAYS ?? '14', 'BACKUP_KEEP_DAYS');
  const backupDir = environment.BACKUP_DIR?.trim()
    || join(userHome, 'Library', 'Application Support', 'AliStore', 'backups', 'postgres');

  const privacyGate = resolvePrivacyGate(environment);
  if (privacyGate.type === 'cloudflare' && privacyGate.accountId.toLowerCase() !== endpointAccountId.toLowerCase()) {
    throw new Error('CLOUDFLARE_ACCOUNT_ID does not match S3_ENDPOINT');
  }
  return {
    accessKeyId,
    ageRecipient,
    backupDir,
    bucket,
    database,
    endpoint: endpointUrl.toString().replace(/\/$/u, ''),
    format,
    keepDays,
    privacyGate,
    region: environment.S3_REGION?.trim() || 'auto',
    secretAccessKey,
  };
}

function resolvePrivacyGate(environment) {
  const accountId = environment.CLOUDFLARE_ACCOUNT_ID?.trim();
  const cloudflareToken = environment.BACKUP_CLOUDFLARE_READ_TOKEN?.trim();
  const externalUrl = environment.BACKUP_PRIVACY_GATE_URL?.trim();
  const externalToken = environment.BACKUP_PRIVACY_GATE_TOKEN?.trim();
  if (accountId || cloudflareToken) {
    if (!accountId || !cloudflareToken) {
      throw new Error('CLOUDFLARE_ACCOUNT_ID and BACKUP_CLOUDFLARE_READ_TOKEN are both required');
    }
    if (!/^[a-f0-9]{32}$/iu.test(accountId)) throw new Error('CLOUDFLARE_ACCOUNT_ID is invalid');
    return { accountId, token: cloudflareToken, type: 'cloudflare' };
  }
  if (externalUrl || externalToken) {
    if (!externalUrl || !externalToken) {
      throw new Error('BACKUP_PRIVACY_GATE_URL and BACKUP_PRIVACY_GATE_TOKEN are both required');
    }
    const url = new URL(externalUrl);
    if (url.protocol !== 'https:') throw new Error('BACKUP_PRIVACY_GATE_URL must use HTTPS');
    if (url.username || url.password) throw new Error('BACKUP_PRIVACY_GATE_URL must not contain credentials');
    return { token: externalToken, type: 'external', url: url.toString() };
  }
  throw new Error('a Cloudflare read token or authenticated external privacy gate is required');
}

export async function runProductionBackup({
  environment,
  now = new Date(),
  runCommand = defaultRunCommand,
  fetchImpl = fetch,
  client,
  signal,
  clock = () => new Date(),
  getProcessStartToken = defaultProcessStartToken,
  onStaleLock = defaultStaleLockAlert,
} = {}) {
  const runtimeEnvironment = environment ?? await loadProductionEnvironment();
  const config = resolveBackupConfig(runtimeEnvironment);
  const childBase = minimalChildEnvironment(runtimeEnvironment);
  const s3 = client ?? createS3Client(config);
  await mkdir(config.backupDir, { recursive: true, mode: 0o700 });
  await chmod(config.backupDir, 0o700);
  const releaseLock = await acquireBackupLock(config.backupDir, now, {
    getProcessStartToken,
    onStaleLock,
    purpose: 'production-backup',
  });
  let workDir;
  let encryptedPath;
  let keepEncryptedCopy = false;

  try {
    throwIfAborted(signal);
    await validateAgeRecipient(config.ageRecipient, runCommand, childBase, signal);
    await verifyPrivateSurfaces(config, fetchImpl, now, signal);
    workDir = await mkdtemp(join(tmpdir(), 'alistore-production-backup-'));
    await chmod(workDir, 0o700);

    const stamp = now.toISOString().replace(/[:.]/gu, '-');
    const extension = config.format === 'custom' ? 'dump' : 'sql';
    const fileName = `alistore-${stamp}.${extension}.gz.age`;
    const objectKey = `${OBJECT_PREFIX}${fileName}`;
    const rawPath = join(workDir, `database.${extension}`);
    const gzipPath = `${rawPath}.gz`;
    encryptedPath = join(config.backupDir, fileName);
    const pgEnvironment = minimalChildEnvironment(runtimeEnvironment, config.database.environment);

    await execute(runCommand, 'pg_dump', [
      `--format=${config.format}`,
      '--no-owner',
      '--no-acl',
      '--file',
      rawPath,
      '--dbname',
      config.database.url,
    ], { env: pgEnvironment, signal });
    await verifyDump({ config, rawPath, runCommand, childEnvironment: pgEnvironment, signal });
    await pipeline(
      createReadStream(rawPath),
      createGzip({ level: 9 }),
      createWriteStream(gzipPath, { mode: 0o600 }),
      { signal },
    );
    await execute(runCommand, 'age', [
      '--encrypt',
      '--recipient',
      config.ageRecipient,
      '--output',
      encryptedPath,
      gzipPath,
    ], { env: childBase, signal });
    await chmod(encryptedPath, 0o600);
    const encryptedStat = await stat(encryptedPath);
    if (encryptedStat.size === 0) throw new Error('age produced an empty encrypted backup');
    const sha256 = await hashFile(encryptedPath);
    keepEncryptedCopy = true;

    await s3.send(new PutObjectCommand({
      Bucket: config.bucket,
      Key: objectKey,
      Body: createReadStream(encryptedPath),
      ContentLength: encryptedStat.size,
      ContentType: 'application/octet-stream',
      Metadata: { sha256, 'dump-format': config.format, encryption: 'age' },
    }), { abortSignal: signal });
    try {
      await verifyRemoteObject(s3, config, objectKey, encryptedStat.size, sha256, signal);
      await verifyAnonymousS3Access(fetchImpl, config, objectKey, signal);
      await verifyPrivateSurfaces(config, fetchImpl, clock(), signal);
    } catch (error) {
      await s3.send(new DeleteObjectCommand({ Bucket: config.bucket, Key: objectKey })).catch(() => undefined);
      throw error;
    }

    const removedRemote = await pruneRemote(s3, config, objectKey, now, signal);
    const removedLocal = await pruneLocal(config, fileName, now);
    return {
      bytes: encryptedStat.size,
      file: encryptedPath,
      key: objectKey,
      removedLocal,
      removedRemote,
      sha256,
    };
  } finally {
    if (workDir) await rm(workDir, { recursive: true, force: true });
    if (encryptedPath && !keepEncryptedCopy) await rm(encryptedPath, { force: true });
    await releaseLock();
  }
}

export async function verifyOffsiteRestoreDrill({
  environment,
  runCommand = defaultRunCommand,
  fetchImpl = fetch,
  client,
  signal,
  now = new Date(),
  getProcessStartToken = defaultProcessStartToken,
  onStaleLock = defaultStaleLockAlert,
} = {}) {
  const runtimeEnvironment = environment ?? await loadProductionEnvironment();
  const config = resolveBackupConfig(runtimeEnvironment);
  const objectKey = required(runtimeEnvironment, 'BACKUP_DRILL_OBJECT_KEY');
  if (!isOwnedObjectKey(objectKey)) throw new Error('BACKUP_DRILL_OBJECT_KEY is not owned by this backup job');
  const identityFile = required(runtimeEnvironment, 'BACKUP_AGE_IDENTITY_FILE');
  const drillDatabase = secureLibpqUrl(required(runtimeEnvironment, 'BACKUP_DRILL_DATABASE_URL'));
  const expectedDrillIdentity = required(runtimeEnvironment, 'BACKUP_EXPECTED_DRILL_DATABASE_IDENTITY');
  if (drillDatabase.identity !== expectedDrillIdentity) {
    throw new Error('BACKUP_DRILL_DATABASE_URL identity does not match BACKUP_EXPECTED_DRILL_DATABASE_IDENTITY');
  }
  if (drillDatabase.identity === config.database.identity || drillDatabase.name === config.database.name) {
    throw new Error('restore drill must not use the production database name or identity');
  }
  const expectedSentinel = required(runtimeEnvironment, 'BACKUP_EXPECTED_DRILL_SENTINEL');
  if (runtimeEnvironment.BACKUP_ALLOW_DRILL_RESTORE !== 'YES_I_UNDERSTAND') {
    throw new Error('BACKUP_ALLOW_DRILL_RESTORE=YES_I_UNDERSTAND is required');
  }

  const s3 = client ?? createS3Client(config);
  const childBase = minimalChildEnvironment(runtimeEnvironment);
  const drillPgEnvironment = minimalChildEnvironment(runtimeEnvironment, drillDatabase.environment);
  await mkdir(config.backupDir, { recursive: true, mode: 0o700 });
  await chmod(config.backupDir, 0o700);
  const releaseLock = await acquireBackupLock(config.backupDir, now, {
    getProcessStartToken,
    onStaleLock,
    purpose: 'offsite-restore-drill',
  });
  let workDir;
  try {
    await verifyPrivateSurfaces(config, fetchImpl, now, signal);
    await verifyDrillDatabaseSentinel({
      drillDatabase,
      expectedSentinel,
      productionDatabaseName: config.database.name,
      runCommand,
      childEnvironment: drillPgEnvironment,
      signal,
    });
    workDir = await mkdtemp(join(tmpdir(), 'alistore-offsite-drill-'));
    await chmod(workDir, 0o700);
    const encryptedPath = join(workDir, basename(objectKey));
    const gzipPath = join(workDir, 'database.gz');
    const format = objectKey.endsWith('.dump.gz.age') ? 'custom' : 'plain';
    const rawPath = join(workDir, format === 'custom' ? 'database.dump' : 'database.sql');
    const remote = await s3.send(new GetObjectCommand({ Bucket: config.bucket, Key: objectKey }), {
      abortSignal: signal,
    });
    if (!remote.Body) throw new Error('offsite backup body is missing');
    await pipeline(remote.Body, createWriteStream(encryptedPath, { mode: 0o600 }), { signal });
    const downloadedHash = await hashFile(encryptedPath);
    if (
      !remote.Metadata?.sha256
      || downloadedHash !== remote.Metadata.sha256
      || remote.Metadata.encryption !== 'age'
      || remote.Metadata['dump-format'] !== format
    ) {
      throw new Error('offsite backup byte checksum verification failed');
    }
    await execute(runCommand, 'age', [
      '--decrypt',
      '--identity',
      identityFile,
      '--output',
      gzipPath,
      encryptedPath,
    ], { env: childBase, signal });
    await pipeline(createReadStream(gzipPath), createGunzip(), createWriteStream(rawPath, { mode: 0o600 }), { signal });
    await verifyDump({ config: { format }, rawPath, runCommand, childEnvironment: drillPgEnvironment, signal });
    if (format === 'custom') {
      await execute(runCommand, 'pg_restore', [
        '--clean',
        '--if-exists',
        '--no-owner',
        '--no-acl',
        '--exit-on-error',
        '--single-transaction',
        '--dbname',
        drillDatabase.url,
        rawPath,
      ], { env: drillPgEnvironment, signal });
    } else {
      await execute(runCommand, 'psql', [
        '--set',
        'ON_ERROR_STOP=on',
        '--single-transaction',
        '--dbname',
        drillDatabase.url,
        '--file',
        rawPath,
      ], { env: drillPgEnvironment, signal });
    }
    return { key: objectKey, restoredTo: drillDatabase.identity, sha256: downloadedHash };
  } finally {
    if (workDir) await rm(workDir, { recursive: true, force: true });
    await releaseLock();
  }
}

async function verifyDrillDatabaseSentinel({
  drillDatabase,
  expectedSentinel,
  productionDatabaseName,
  runCommand,
  childEnvironment,
  signal,
}) {
  const query = [
    "SELECT json_build_object('database', current_database(), 'sentinel',",
    "COALESCE(shobj_description(oid, 'pg_database'), ''))::text",
    'FROM pg_database WHERE datname = current_database()',
  ].join(' ');
  const output = await execute(runCommand, 'psql', [
    '--no-psqlrc',
    '--set',
    'ON_ERROR_STOP=on',
    '--tuples-only',
    '--no-align',
    '--dbname',
    drillDatabase.url,
    '--command',
    query,
  ], {
    capture: true,
    env: { ...childEnvironment, PGOPTIONS: '-cdefault_transaction_read_only=on' },
    signal,
  });
  let observed;
  try {
    const rows = output.split('\n').map((line) => line.trim()).filter(Boolean);
    if (rows.length !== 1) throw new Error('unexpected row count');
    observed = JSON.parse(rows[0]);
  } catch {
    throw new Error('restore drill server identity query returned an invalid response');
  }
  if (observed.database === productionDatabaseName) {
    throw new Error('restore drill server reports the production database name');
  }
  if (observed.database !== drillDatabase.name) {
    throw new Error('restore drill server database name does not match the pinned drill target');
  }
  if (typeof observed.sentinel !== 'string' || observed.sentinel !== expectedSentinel) {
    throw new Error('restore drill server sentinel is missing or does not match');
  }
}

async function verifyDump({ config, rawPath, runCommand, childEnvironment, signal }) {
  const dumpStat = await stat(rawPath);
  if (dumpStat.size === 0) throw new Error('pg_dump produced an empty backup');
  if (config.format === 'custom') {
    const toc = await execute(runCommand, 'pg_restore', ['--list', rawPath], {
      capture: true,
      env: childEnvironment,
      signal,
    });
    const entries = toc.split('\n').filter((line) => line.trim() && !line.startsWith(';'));
    if (entries.length === 0) throw new Error('pg_restore found no objects in the custom backup');
    return;
  }
  const handle = await open(rawPath, 'r');
  const buffer = Buffer.alloc(Math.min(16_384, dumpStat.size));
  try {
    await handle.read(buffer, 0, buffer.length, 0);
  } finally {
    await handle.close();
  }
  if (!buffer.toString('utf8').includes('PostgreSQL database dump')) {
    throw new Error('plain backup is missing the PostgreSQL dump header');
  }
}

export async function verifyPrivateSurfaces(config, fetchImpl, now = new Date(), signal) {
  if (config.privacyGate.type === 'external') {
    const response = await fetchImpl(config.privacyGate.url, {
      headers: { authorization: `Bearer ${config.privacyGate.token}` },
      redirect: 'error',
      signal,
    });
    if (response.status !== 200) throw new Error(`external privacy gate failed (HTTP ${response.status})`);
    const attestation = await response.json();
    const checkedAt = Date.parse(attestation.checkedAt);
    const fresh = Number.isFinite(checkedAt)
      && checkedAt <= now.getTime() + 60_000
      && now.getTime() - checkedAt <= PRIVACY_ATTESTATION_MAX_AGE_MS;
    if (
      attestation.bucket !== config.bucket
      || attestation.s3Endpoint !== config.endpoint
      || attestation.private !== true
      || attestation.managedDomainEnabled !== false
      || !Array.isArray(attestation.customDomains)
      || attestation.customDomains.length !== 0
      || !fresh
    ) throw new Error('external privacy attestation is missing, stale, or not private');
    return;
  }

  const base = `https://api.cloudflare.com/client/v4/accounts/${config.privacyGate.accountId}`
    + `/r2/buckets/${encodeURIComponent(config.bucket)}/domains`;
  const request = async (kind) => {
    const response = await fetchImpl(`${base}/${kind}`, {
      headers: { authorization: `Bearer ${config.privacyGate.token}` },
      redirect: 'error',
      signal,
    });
    if (response.status !== 200) throw new Error(`Cloudflare ${kind} domain check failed (HTTP ${response.status})`);
    const body = await response.json();
    if (body.success !== true) throw new Error(`Cloudflare ${kind} domain check was not successful`);
    return body.result;
  };
  const managed = await request('managed');
  const customResult = await request('custom');
  const customDomains = Array.isArray(customResult) ? customResult : customResult?.domains;
  if (managed?.enabled !== false || !Array.isArray(customDomains) || customDomains.length !== 0) {
    throw new Error('Cloudflare R2 bucket has a managed or custom public domain');
  }
}

async function verifyRemoteObject(client, config, key, expectedBytes, expectedHash, signal) {
  const head = await client.send(new HeadObjectCommand({ Bucket: config.bucket, Key: key }), {
    abortSignal: signal,
  });
  if (head.ContentLength !== expectedBytes) throw new Error('R2 upload size verification failed');
  if (head.Metadata?.sha256 !== expectedHash || head.Metadata?.encryption !== 'age') {
    throw new Error('R2 upload metadata verification failed');
  }
  const downloaded = await client.send(new GetObjectCommand({ Bucket: config.bucket, Key: key }), {
    abortSignal: signal,
  });
  if (!downloaded.Body) throw new Error('R2 uploaded body is missing');
  const remoteHash = createHash('sha256');
  let remoteBytes = 0;
  for await (const chunk of downloaded.Body) {
    throwIfAborted(signal);
    remoteHash.update(chunk);
    remoteBytes += chunk.length;
  }
  if (remoteBytes !== expectedBytes || remoteHash.digest('hex') !== expectedHash) {
    throw new Error('R2 uploaded byte checksum verification failed');
  }
}

async function verifyAnonymousS3Access(fetchImpl, config, key, signal) {
  const url = `${config.endpoint}/${encodeURIComponent(config.bucket)}/${key.split('/').map(encodeURIComponent).join('/')}`;
  let response;
  try {
    response = await fetchImpl(url, { method: 'HEAD', redirect: 'manual', signal });
  } catch {
    throw new Error('Unable to verify anonymous R2 S3 access');
  }
  if (![401, 403, 404].includes(response.status)) {
    throw new Error(`R2 S3 surface did not fail closed (HTTP ${response.status})`);
  }
}

async function pruneRemote(client, config, justUploaded, now, signal) {
  const cutoff = now.getTime() - config.keepDays * 86_400_000;
  const stale = [];
  let continuationToken;
  do {
    const page = await client.send(new ListObjectsV2Command({
      Bucket: config.bucket,
      Prefix: OBJECT_PREFIX,
      ContinuationToken: continuationToken,
    }), { abortSignal: signal });
    for (const object of page.Contents ?? []) {
      if (!object.Key || object.Key === justUploaded || !isOwnedObjectKey(object.Key)) continue;
      if (object.LastModified && object.LastModified.getTime() < cutoff) stale.push(object.Key);
    }
    continuationToken = page.IsTruncated ? page.NextContinuationToken : undefined;
  } while (continuationToken);
  for (const key of stale) {
    await client.send(new DeleteObjectCommand({ Bucket: config.bucket, Key: key }), { abortSignal: signal });
  }
  return stale;
}

async function pruneLocal(config, justCreated, now) {
  const cutoff = now.getTime() - config.keepDays * 86_400_000;
  const removed = [];
  for (const entry of await readdir(config.backupDir, { withFileTypes: true })) {
    if (!entry.isFile() || entry.name === justCreated || !OWNED_FILE_PATTERN.test(entry.name)) continue;
    const path = join(config.backupDir, entry.name);
    if ((await stat(path)).mtimeMs < cutoff) {
      await unlink(path);
      removed.push(path);
    }
  }
  return removed;
}

function isOwnedObjectKey(key) {
  return key.startsWith(OBJECT_PREFIX) && OWNED_FILE_PATTERN.test(key.slice(OBJECT_PREFIX.length));
}

export function secureLibpqUrl(value) {
  const url = new URL(value);
  if (!['postgres:', 'postgresql:'].includes(url.protocol)) throw new Error('DATABASE_URL must use postgresql://');
  const name = decodeURIComponent(url.pathname.replace(/^\//u, ''));
  if (!name) throw new Error('DATABASE_URL must include a database name');
  const password = decodeURIComponent(url.password);
  url.password = '';
  for (const key of [...url.searchParams.keys()]) {
    if (!SAFE_LIBPQ_PARAMETERS.has(key)) url.searchParams.delete(key);
  }
  const hostname = url.hostname.toLowerCase();
  url.hostname = hostname;
  const port = url.port || '5432';
  return {
    environment: password ? { PGPASSWORD: password } : {},
    identity: `${hostname}:${port}/${name}`,
    name,
    url: url.toString(),
  };
}

function minimalChildEnvironment(environment, additions = {}) {
  const result = {};
  for (const key of ['LANG', 'LC_ALL', 'PATH', 'TMPDIR', 'TZ']) {
    if (environment[key]) result[key] = environment[key];
  }
  result.PATH ??= '/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin';
  return { ...result, ...additions };
}

async function validateAgeRecipient(recipient, runCommand, childEnvironment, signal) {
  const directory = await mkdtemp(join(tmpdir(), 'alistore-age-recipient-'));
  try {
    await execute(runCommand, 'age', [
      '--encrypt',
      '--recipient',
      recipient,
      '--output',
      join(directory, 'probe.age'),
      '/dev/null',
    ], { env: childEnvironment, signal });
  } catch {
    throw new Error('BACKUP_AGE_RECIPIENT is not accepted by age');
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
}

export async function acquireBackupLock(backupDir, now, {
  getProcessStartToken = defaultProcessStartToken,
  onStaleLock = defaultStaleLockAlert,
  purpose = 'production-backup',
} = {}) {
  const lockPath = join(backupDir, '.production-backup.lock');
  const processStartToken = await getProcessStartToken(process.pid);
  if (!processStartToken) throw new Error('unable to determine current process start token for backup lock');
  const metadata = {
    pid: process.pid,
    processStartToken,
    purpose,
    startedAt: now.toISOString(),
  };
  const candidatePath = `${lockPath}.candidate-${process.pid}-${randomUUID()}`;
  let candidateHandle;
  let acquired = false;
  try {
    candidateHandle = await open(candidatePath, 'wx', 0o600);
    await candidateHandle.writeFile(JSON.stringify(metadata));
    await candidateHandle.sync();
    await candidateHandle.close();
    candidateHandle = undefined;

    for (let attempt = 0; attempt < 3 && !acquired; attempt += 1) {
      try {
        await link(candidatePath, lockPath);
        acquired = true;
      } catch (error) {
        if (error?.code !== 'EEXIST') throw error;
        const stale = await inspectExistingLock(lockPath, getProcessStartToken);
        if (!stale.recoverable) throw new Error(stale.message);
        const archivePath = join(
          backupDir,
          `.production-backup.stale-${now.toISOString().replace(/[:.]/gu, '-')}-${stale.metadata.pid}.json`,
        );
        try {
          await link(lockPath, archivePath);
          await unlink(lockPath);
        } catch (archiveError) {
          if (archiveError?.code === 'ENOENT') continue;
          throw archiveError;
        }
        onStaleLock({ archivePath, metadata: stale.metadata, reason: stale.reason });
      }
    }
  } finally {
    await candidateHandle?.close().catch(() => undefined);
    await rm(candidatePath, { force: true });
  }
  if (!acquired) throw new Error('unable to acquire production backup lock after stale-lock recovery');
  return async () => {
    let current;
    try {
      current = JSON.parse(await readFile(lockPath, 'utf8'));
    } catch (error) {
      if (error?.code === 'ENOENT') return;
      onStaleLock({ archivePath: lockPath, metadata, reason: 'lock-metadata-unreadable-during-release' });
      return;
    }
    if (current.pid !== metadata.pid || current.processStartToken !== metadata.processStartToken) {
      onStaleLock({ archivePath: lockPath, metadata: current, reason: 'lock-ownership-changed' });
      return;
    }
    await unlink(lockPath);
  };
}

async function inspectExistingLock(lockPath, getProcessStartToken) {
  let metadata;
  try {
    metadata = JSON.parse(await readFile(lockPath, 'utf8'));
  } catch {
    return { recoverable: false, message: 'production backup lock metadata is unreadable; manual review required' };
  }
  if (
    !Number.isSafeInteger(metadata.pid)
    || metadata.pid <= 0
    || typeof metadata.processStartToken !== 'string'
    || metadata.processStartToken.length === 0
    || typeof metadata.startedAt !== 'string'
    || !Number.isFinite(Date.parse(metadata.startedAt))
  ) {
    return { recoverable: false, message: 'production backup lock metadata is invalid; manual review required' };
  }
  let observedToken;
  try {
    observedToken = await getProcessStartToken(metadata.pid);
  } catch {
    return { recoverable: false, message: 'unable to verify production backup lock owner; failing closed' };
  }
  if (observedToken === metadata.processStartToken) {
    return { recoverable: false, message: `production backup lock is live (${metadata.purpose ?? 'unknown'})` };
  }
  return {
    metadata,
    reason: observedToken === null ? 'owner-process-exited' : 'pid-reused-with-different-start-token',
    recoverable: true,
  };
}

async function defaultProcessStartToken(pid) {
  return await new Promise((resolve, reject) => {
    const child = spawn('/bin/ps', ['-p', String(pid), '-o', 'lstart='], {
      env: { PATH: '/usr/bin:/bin' },
      stdio: ['ignore', 'pipe', 'ignore'],
    });
    let stdout = '';
    child.stdout.setEncoding('utf8').on('data', (chunk) => { stdout += chunk; });
    child.once('error', reject);
    child.once('exit', (code) => resolve(code === 0 && stdout.trim() ? stdout.trim() : null));
  });
}

function defaultStaleLockAlert({ archivePath, metadata, reason }) {
  console.error(`ALERT: production backup lock event (${reason}, pid ${metadata.pid}); metadata at ${archivePath}`);
}

function createS3Client(config) {
  return new S3Client({
    endpoint: config.endpoint,
    region: config.region,
    forcePathStyle: true,
    credentials: { accessKeyId: config.accessKeyId, secretAccessKey: config.secretAccessKey },
  });
}

async function hashFile(path) {
  const hash = createHash('sha256');
  for await (const chunk of createReadStream(path)) hash.update(chunk);
  return hash.digest('hex');
}

async function execute(runCommand, command, args, options = {}) {
  try {
    return await runCommand(command, args, options);
  } catch {
    throw new Error(`${basename(command)} failed`);
  }
}

export async function defaultRunCommand(command, args, {
  capture = false,
  env = minimalChildEnvironment(process.env),
  signal,
} = {}) {
  return await new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      env,
      signal,
      killSignal: 'SIGTERM',
      stdio: ['ignore', capture ? 'pipe' : 'ignore', 'ignore'],
    });
    let stdout = '';
    if (capture) child.stdout.setEncoding('utf8').on('data', (chunk) => { stdout += chunk; });
    child.once('error', reject);
    child.once('exit', (code) => code === 0 ? resolve(stdout) : reject(new Error(`exit ${code}`)));
  });
}

export async function checkProductionBackup({
  environment,
  runCommand = defaultRunCommand,
  fetchImpl = fetch,
  now = new Date(),
  signal,
} = {}) {
  const runtimeEnvironment = environment ?? await loadProductionEnvironment();
  const config = resolveBackupConfig(runtimeEnvironment);
  for (const command of ['pg_dump', 'age', ...(config.format === 'custom' ? ['pg_restore'] : [])]) {
    await findExecutable(command, runtimeEnvironment.PATH ?? process.env.PATH ?? '');
  }
  await validateAgeRecipient(config.ageRecipient, runCommand, minimalChildEnvironment(runtimeEnvironment), signal);
  await verifyPrivateSurfaces(config, fetchImpl, now, signal);
  return { bucket: config.bucket, databaseIdentity: config.database.identity, format: config.format };
}

async function findExecutable(command, pathValue) {
  for (const directory of pathValue.split(':')) {
    if (!directory) continue;
    try {
      await access(join(directory, command), constants.X_OK);
      return;
    } catch {
      // Continue through PATH.
    }
  }
  throw new Error(`${command} is required in PATH`);
}

function throwIfAborted(signal) {
  if (signal?.aborted) throw signal.reason ?? new Error('operation aborted');
}

function required(environment, name) {
  const value = environment[name]?.trim();
  if (!value) throw new Error(`${name} is required`);
  return value;
}

function parsePositiveInteger(value, name) {
  if (!/^\d+$/u.test(value) || Number(value) < 1) throw new Error(`${name} must be a positive integer`);
  return Number(value);
}

export function redactBackupSecrets(message, environment) {
  const secrets = [
    environment.AWS_ACCESS_KEY_ID,
    environment.AWS_SECRET_ACCESS_KEY,
    environment.MINIO_ROOT_USER,
    environment.MINIO_ROOT_PASSWORD,
    environment.DATABASE_URL,
    environment.BACKUP_CLOUDFLARE_READ_TOKEN,
    environment.BACKUP_PRIVACY_GATE_TOKEN,
    environment.BACKUP_DRILL_DATABASE_URL,
  ];
  for (const urlName of ['DATABASE_URL', 'BACKUP_DRILL_DATABASE_URL']) {
    try {
      const url = new URL(environment[urlName]);
      secrets.push(url.password, decodeURIComponent(url.password));
    } catch {
      // Validation reports malformed URLs without echoing their values.
    }
  }
  return secrets
    .filter((value) => typeof value === 'string' && value.length >= 4)
    .reduce((safe, value) => safe.replaceAll(value, '[redacted]'), String(message));
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  let cliEnvironment = process.env;
  const controller = new AbortController();
  let terminationSignal;
  const terminate = (name) => {
    terminationSignal = name;
    controller.abort(new Error(`received ${name}`));
  };
  process.once('SIGINT', () => terminate('SIGINT'));
  process.once('SIGTERM', () => terminate('SIGTERM'));
  void (async () => {
    cliEnvironment = await loadProductionEnvironment();
    let result;
    if (process.argv.includes('--check')) {
      result = await checkProductionBackup({ environment: cliEnvironment, signal: controller.signal });
      console.log(`Production backup configuration is valid (${result.format}, ${result.bucket}, ${result.databaseIdentity}).`);
    } else if (process.argv.includes('--restore-drill')) {
      result = await verifyOffsiteRestoreDrill({ environment: cliEnvironment, signal: controller.signal });
      console.log(`Offsite restore drill completed: ${result.key} -> ${result.restoredTo}.`);
    } else {
      result = await runProductionBackup({ environment: cliEnvironment, signal: controller.signal });
      console.log(`Production backup uploaded and byte-verified: ${result.key} (${result.bytes} bytes).`);
    }
  })().catch((error) => {
    console.error(`Production backup failed: ${redactBackupSecrets(error.message, cliEnvironment)}`);
    process.exitCode = terminationSignal === 'SIGTERM' ? 143 : terminationSignal === 'SIGINT' ? 130 : 1;
  });
}
