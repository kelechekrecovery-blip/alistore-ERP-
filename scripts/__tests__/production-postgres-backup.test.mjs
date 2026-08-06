import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { Readable } from 'node:stream';
import { gzipSync } from 'node:zlib';
import {
  copyFile,
  mkdir,
  mkdtemp,
  readFile,
  stat,
  utimes,
  writeFile,
} from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import {
  DeleteObjectCommand,
  GetObjectCommand,
  HeadObjectCommand,
  ListObjectsV2Command,
  PutObjectCommand,
} from '@aws-sdk/client-s3';

import {
  acquireBackupLock,
  loadProductionEnvironment,
  redactBackupSecrets,
  resolveBackupConfig,
  runProductionBackup,
  secureLibpqUrl,
  verifyOffsiteRestoreDrill,
  verifyPrivateSurfaces,
} from '../production-postgres-backup.mjs';

const now = new Date('2026-08-07T03:17:00.000Z');
const recipient = 'age1test-recipient-validated-by-the-real-age-probe';

test('production env selection is local-first fallback with process environment highest', async (t) => {
  const root = await temporaryDirectory(t, 'alistore-backup-env-');
  await writeFile(join(root, '.env.production.local'), 'LOCAL_ONLY=local\nSHARED=local\n', 'utf8');
  await writeFile(join(root, '.env.production'), 'PRODUCTION_ONLY=production\nSHARED=production\nPROCESS_WINS=file\n', 'utf8');
  const environment = await loadProductionEnvironment({ root, base: { PROCESS_WINS: 'process' } });
  assert.equal(environment.LOCAL_ONLY, 'local');
  assert.equal(environment.PRODUCTION_ONLY, 'production');
  assert.equal(environment.SHARED, 'local');
  assert.equal(environment.PROCESS_WINS, 'process');
});

test('stable checkout loads apps/api production files before root compatibility fallbacks', async (t) => {
  const root = await temporaryDirectory(t, 'alistore-backup-stable-env-');
  await mkdir(join(root, 'apps', 'api'), { recursive: true });
  await writeFile(
    join(root, 'apps', 'api', '.env.production.local'),
    'APPS_LOCAL=present\nSHARED=apps-local\n',
    'utf8',
  );
  await writeFile(
    join(root, 'apps', 'api', '.env.production'),
    'APPS_BASE=present\nSHARED=apps-base\n',
    'utf8',
  );
  await writeFile(join(root, '.env.production.local'), 'ROOT_FALLBACK=present\nSHARED=root\n', 'utf8');
  const environment = await loadProductionEnvironment({ root, base: { PROCESS_WINS: 'process' } });
  assert.equal(environment.APPS_LOCAL, 'present');
  assert.equal(environment.APPS_BASE, 'present');
  assert.equal(environment.ROOT_FALLBACK, 'present');
  assert.equal(environment.SHARED, 'apps-local');
  assert.equal(environment.PROCESS_WINS, 'process');
});

test('configuration pins the exact production database identity and privacy gate', () => {
  const base = backupEnvironment('/tmp/backups');
  assert.equal(resolveBackupConfig(base).database.identity, 'db.example:5432/alistore_prod');
  assert.throws(
    () => resolveBackupConfig({ ...base, BACKUP_EXPECTED_DATABASE_IDENTITY: 'other.example:5432/alistore_prod' }),
    /identity does not match/u,
  );
  assert.throws(
    () => resolveBackupConfig({ ...base, BACKUP_PRIVACY_GATE_URL: '', BACKUP_PRIVACY_GATE_TOKEN: '' }),
    /privacy gate/u,
  );
  assert.throws(
    () => resolveBackupConfig({ ...cloudflareGateEnvironment('/tmp/backups'), CLOUDFLARE_ACCOUNT_ID: 'b'.repeat(32) }),
    /does not match S3_ENDPOINT/u,
  );
});

test('libpq URL removes password and Prisma-only parameters while retaining a canonical identity', () => {
  const result = secureLibpqUrl(
    'postgresql://backup:p%40ss@DB.Example/alistore_prod?schema=public&connection_limit=5&sslmode=require',
  );
  assert.equal(result.url, 'postgresql://backup@db.example/alistore_prod?sslmode=require');
  assert.deepEqual(result.environment, { PGPASSWORD: 'p@ss' });
  assert.equal(result.identity, 'db.example:5432/alistore_prod');
});

test('Cloudflare control-plane privacy check rejects managed and custom public surfaces', async () => {
  const config = resolveBackupConfig(cloudflareGateEnvironment('/tmp/backups'));
  const responseFor = (managed, custom) => async (url) => ({
    status: 200,
    json: async () => ({ success: true, result: url.endsWith('/managed') ? managed : custom }),
  });
  await verifyPrivateSurfaces(config, responseFor({ enabled: false }, { domains: [] }), now);
  await assert.rejects(
    verifyPrivateSurfaces(config, responseFor({ enabled: true }, { domains: [] }), now),
    /managed or custom public domain/u,
  );
  await assert.rejects(
    verifyPrivateSurfaces(config, responseFor({ enabled: false }, { domains: [{ domain: 'backup.example' }] }), now),
    /managed or custom public domain/u,
  );
});

test('authenticated external privacy attestations must be complete and fresh', async () => {
  const config = resolveBackupConfig(backupEnvironment('/tmp/backups'));
  const valid = privacyFetch(now);
  await verifyPrivateSurfaces(config, valid, now);
  await assert.rejects(
    verifyPrivateSurfaces(config, privacyFetch(new Date(now.getTime() - 16 * 60 * 1000)), now),
    /stale/u,
  );
  await assert.rejects(
    verifyPrivateSurfaces(config, async () => ({
      status: 200,
      json: async () => ({
        bucket: 'alistore-backups-prod',
        checkedAt: now.toISOString(),
        customDomains: [],
        managedDomainEnabled: false,
        private: true,
        s3Endpoint: `https://${'b'.repeat(32)}.r2.cloudflarestorage.com`,
      }),
    }), now),
    /attestation/u,
  );
});

test('backup validates age, verifies remote bytes, uses least-privilege children and exact retention ownership', async (t) => {
  const root = await temporaryDirectory(t, 'alistore-backup-run-');
  const backupDir = join(root, 'backups');
  await mkdir(backupDir);
  const staleLocal = join(backupDir, 'alistore-2026-01-01T00-00-00-000Z.dump.gz.age');
  const unownedLocal = join(backupDir, 'alistore-old.dump.gz.age');
  await writeFile(staleLocal, 'old');
  await writeFile(unownedLocal, 'keep');
  await utimes(staleLocal, new Date('2026-01-01'), new Date('2026-01-01'));
  await utimes(unownedLocal, new Date('2026-01-01'), new Date('2026-01-01'));
  const commands = [];
  const runCommand = fakeBackupTools(commands);
  const client = new FakeS3Client();
  const ownedStale = 'postgres/alistore-production/alistore-2026-01-01T00-00-00-000Z.dump.gz.age';
  client.listContents = [
    { Key: ownedStale, LastModified: new Date('2026-01-01') },
    { Key: 'postgres/alistore-production/alistore-old.dump.gz.age', LastModified: new Date('2026-01-01') },
    { Key: 'postgres/alistore-other/alistore-2026-01-01T00-00-00-000Z.dump.gz.age', LastModified: new Date('2026-01-01') },
  ];

  const result = await runProductionBackup({
    environment: backupEnvironment(backupDir),
    now,
    clock: () => now,
    runCommand,
    client,
    fetchImpl: privacyAndAnonymousFetch(now),
  });

  assert.match(result.key, /^postgres\/alistore-production\/alistore-.*\.dump\.gz\.age$/u);
  assert.deepEqual(result.removedRemote, [ownedStale]);
  assert.deepEqual(result.removedLocal, [staleLocal]);
  assert.equal(await readFile(unownedLocal, 'utf8'), 'keep');
  assert.ok(client.commands.some((command) => command instanceof HeadObjectCommand));
  assert.ok(client.commands.some((command) => command instanceof GetObjectCommand));
  assert.ok(client.commands.some((command) => command instanceof ListObjectsV2Command));
  const put = client.commands.find((command) => command instanceof PutObjectCommand);
  assert.equal(put.input.Metadata.encryption, 'age');
  assert.equal('ACL' in put.input, false);

  const pgDump = commands.find((entry) => entry.command === 'pg_dump');
  assert.equal(pgDump.options.env.PGPASSWORD, 'p@ss');
  for (const secret of ['DATABASE_URL', 'AWS_ACCESS_KEY_ID', 'AWS_SECRET_ACCESS_KEY', 'BACKUP_PRIVACY_GATE_TOKEN', 'HOME']) {
    assert.equal(secret in pgDump.options.env, false);
  }
  assert.equal(commands[0].command, 'age');
  assert.equal(commands[0].args.at(-1), '/dev/null');
});

test('plain format verifies the SQL header and uploads an exact owned .sql key', async (t) => {
  const root = await temporaryDirectory(t, 'alistore-backup-plain-');
  const commands = [];
  const result = await runProductionBackup({
    environment: { ...backupEnvironment(root), BACKUP_FORMAT: 'plain' },
    now,
    clock: () => now,
    client: new FakeS3Client(),
    fetchImpl: privacyAndAnonymousFetch(now),
    runCommand: async (command, args, options) => {
      commands.push({ command, args, options });
      if (command === 'age' && args.at(-1) === '/dev/null') {
        await writeFile(args[args.indexOf('--output') + 1], 'age-probe');
      } else if (command === 'pg_dump') {
        await writeFile(args[args.indexOf('--file') + 1], '-- PostgreSQL database dump\nSELECT 1;\n');
      } else if (command === 'age') {
        await copyFile(args.at(-1), args[args.indexOf('--output') + 1]);
      }
      return '';
    },
  });
  assert.match(result.key, /^postgres\/alistore-production\/alistore-.*\.sql\.gz\.age$/u);
  assert.equal(commands.some((entry) => entry.command === 'pg_restore'), false);
});

test('an invalid age recipient fails before pg_dump or upload', async (t) => {
  const root = await temporaryDirectory(t, 'alistore-backup-age-');
  const commands = [];
  await assert.rejects(
    runProductionBackup({
      environment: { ...backupEnvironment(root), BACKUP_AGE_RECIPIENT: 'invalid' },
      now,
      clock: () => now,
      runCommand: async (command, args) => {
        commands.push([command, ...args]);
        throw new Error('age rejected recipient');
      },
      client: new FakeS3Client(),
      fetchImpl: privacyAndAnonymousFetch(now),
    }),
    /not accepted by age/u,
  );
  assert.equal(commands.some((call) => call[0] === 'pg_dump'), false);
});

test('verified live PID/start-token lock prevents concurrent backup and is not removed', async (t) => {
  const root = await temporaryDirectory(t, 'alistore-backup-lock-');
  const metadata = {
    pid: 4242,
    processStartToken: 'live-start-token',
    purpose: 'production-backup',
    startedAt: now.toISOString(),
  };
  await writeFile(join(root, '.production-backup.lock'), JSON.stringify(metadata));
  await assert.rejects(
    runProductionBackup({
      environment: backupEnvironment(root),
      now,
      clock: () => now,
      getProcessStartToken: async (pid) => pid === process.pid ? 'current-start-token' : 'live-start-token',
      runCommand: fakeBackupTools([]),
      client: new FakeS3Client(),
      fetchImpl: privacyAndAnonymousFetch(now),
    }),
    /lock is live/u,
  );
  assert.deepEqual(JSON.parse(await readFile(join(root, '.production-backup.lock'), 'utf8')), metadata);
});

test('crash-stale lock is recovered using PID/start-token verification, alerted, and archived', async (t) => {
  const root = await temporaryDirectory(t, 'alistore-backup-stale-lock-');
  const stale = {
    pid: 4242,
    processStartToken: 'dead-process-start-token',
    purpose: 'production-backup',
    startedAt: new Date('2026-08-06T03:17:00.000Z').toISOString(),
  };
  await writeFile(join(root, '.production-backup.lock'), JSON.stringify(stale), { mode: 0o600 });
  const alerts = [];
  const release = await acquireBackupLock(root, now, {
    getProcessStartToken: async (pid) => pid === process.pid ? 'current-process-start-token' : null,
    onStaleLock: (alert) => alerts.push(alert),
    purpose: 'offsite-restore-drill',
  });
  assert.equal(alerts.length, 1);
  assert.equal(alerts[0].reason, 'owner-process-exited');
  assert.deepEqual(JSON.parse(await readFile(alerts[0].archivePath, 'utf8')), stale);
  await release();
  await assert.rejects(stat(join(root, '.production-backup.lock')), { code: 'ENOENT' });
  assert.equal((await import('node:fs/promises').then(({ readdir }) => readdir(root))).length, 1);
});

test('reused PID with a different start token is recovered as stale', async (t) => {
  const root = await temporaryDirectory(t, 'alistore-backup-reused-pid-');
  await writeFile(join(root, '.production-backup.lock'), JSON.stringify({
    pid: 4242,
    processStartToken: 'old-start-token',
    purpose: 'production-backup',
    startedAt: new Date('2026-08-06T03:17:00.000Z').toISOString(),
  }));
  const alerts = [];
  const release = await acquireBackupLock(root, now, {
    getProcessStartToken: async (pid) => pid === process.pid ? 'current-start-token' : 'new-start-token',
    onStaleLock: (alert) => alerts.push(alert),
  });
  assert.equal(alerts[0].reason, 'pid-reused-with-different-start-token');
  await release();
});

test('abort releases the concurrency lock and leaves no partial encrypted backup', async (t) => {
  const root = await temporaryDirectory(t, 'alistore-backup-abort-');
  const controller = new AbortController();
  const running = runProductionBackup({
    environment: backupEnvironment(root),
    now,
    clock: () => now,
    client: new FakeS3Client(),
    fetchImpl: privacyAndAnonymousFetch(now),
    signal: controller.signal,
    runCommand: async (command, args) => {
      if (command === 'age' && args.at(-1) === '/dev/null') return '';
      if (command === 'pg_dump') {
        controller.abort(new Error('SIGTERM'));
        throw new Error('terminated');
      }
      return '';
    },
  });
  await assert.rejects(running, /pg_dump failed/u);
  await assert.rejects(stat(join(root, '.production-backup.lock')), { code: 'ENOENT' });
  const remaining = await import('node:fs/promises').then(({ readdir }) => readdir(root));
  assert.deepEqual(remaining, []);
});

test('corrupt downloaded R2 bytes fail verification, delete the new object, and skip retention', async (t) => {
  const root = await temporaryDirectory(t, 'alistore-backup-corrupt-');
  const client = new FakeS3Client();
  client.corruptGet = true;
  await assert.rejects(
    runProductionBackup({
      environment: backupEnvironment(root),
      now,
      clock: () => now,
      runCommand: fakeBackupTools([]),
      client,
      fetchImpl: privacyAndAnonymousFetch(now),
    }),
    /byte checksum/u,
  );
  assert.equal(client.commands.filter((command) => command instanceof DeleteObjectCommand).length, 1);
  assert.equal(client.commands.some((command) => command instanceof ListObjectsV2Command), false);
});

test('offsite drill retrieves bytes, checks metadata, decrypts and restores only to a pinned non-production DB', async (t) => {
  const root = await temporaryDirectory(t, 'alistore-backup-drill-');
  const objectKey = 'postgres/alistore-production/alistore-2026-08-07T03-17-00-000Z.dump.gz.age';
  const encrypted = gzipSync('custom-dump');
  const client = new FakeS3Client();
  client.downloaded = encrypted;
  client.downloadMetadata = { sha256: sha256(encrypted), encryption: 'age', 'dump-format': 'custom' };
  const commands = [];
  const result = await verifyOffsiteRestoreDrill({
    environment: {
      ...backupEnvironment(root),
      BACKUP_DRILL_OBJECT_KEY: objectKey,
      BACKUP_AGE_IDENTITY_FILE: '/secure/offline/backup-identity.txt',
      BACKUP_DRILL_DATABASE_URL: 'postgresql://restore:drill-secret@localhost/alistore_restore_check',
      BACKUP_EXPECTED_DRILL_DATABASE_IDENTITY: 'localhost:5432/alistore_restore_check',
      BACKUP_EXPECTED_DRILL_SENTINEL: 'alistore-restore-drill:test-sentinel',
      BACKUP_ALLOW_DRILL_RESTORE: 'YES_I_UNDERSTAND',
    },
    now,
    client,
    fetchImpl: privacyFetch(now),
    runCommand: async (command, args, options) => {
      commands.push({ command, args, options });
      if (command === 'psql' && args.includes('--command')) {
        return JSON.stringify({
          database: 'alistore_restore_check',
          sentinel: 'alistore-restore-drill:test-sentinel',
        });
      }
      if (command === 'age') await copyFile(args.at(-1), args[args.indexOf('--output') + 1]);
      if (command === 'pg_restore' && args[0] === '--list') return '1; 1 0 TABLE public orders backup\n';
      return '';
    },
  });
  assert.equal(result.restoredTo, 'localhost:5432/alistore_restore_check');
  assert.equal(commands[0].command, 'psql');
  assert.ok(commands[0].args.includes('--command'));
  assert.equal(commands[0].options.env.PGOPTIONS, '-cdefault_transaction_read_only=on');
  assert.ok(client.commands.some((command) => command instanceof GetObjectCommand));
  const restore = commands.find((entry) => entry.command === 'pg_restore' && entry.args.includes('--dbname'));
  assert.ok(restore);
  assert.equal(restore.options.env.PGPASSWORD, 'drill-secret');
  assert.equal('DATABASE_URL' in restore.options.env, false);
  assert.doesNotMatch(restore.args.join(' '), /drill-secret/u);
});

test('restore drill rejects production DB name through DNS aliases, tunnels, and alternate endpoints', async () => {
  for (const host of ['prod-alias.internal', '127.0.0.1', 'alternate.example']) {
    await assert.rejects(
      verifyOffsiteRestoreDrill({
        environment: {
          ...backupEnvironment('/tmp/backups'),
          BACKUP_DRILL_OBJECT_KEY: 'postgres/alistore-production/alistore-2026-08-07T03-17-00-000Z.dump.gz.age',
          BACKUP_AGE_IDENTITY_FILE: '/secure/key',
          BACKUP_DRILL_DATABASE_URL: `postgresql://restore@${host}/alistore_prod`,
          BACKUP_EXPECTED_DRILL_DATABASE_IDENTITY: `${host}:5432/alistore_prod`,
          BACKUP_EXPECTED_DRILL_SENTINEL: 'alistore-restore-drill:test-sentinel',
          BACKUP_ALLOW_DRILL_RESTORE: 'YES_I_UNDERSTAND',
        },
      }),
      /production database name or identity/u,
    );
  }
});

test('restore drill fails before retrieval on missing, production, or wrong server sentinel', async (t) => {
  const root = await temporaryDirectory(t, 'alistore-backup-sentinel-');
  const objectKey = 'postgres/alistore-production/alistore-2026-08-07T03-17-00-000Z.dump.gz.age';
  const cases = [
    { database: 'alistore_restore_check', sentinel: '', expected: /sentinel is missing/u },
    { database: 'alistore_restore_check', sentinel: 'production', expected: /sentinel is missing/u },
    { database: 'alistore_prod', sentinel: 'alistore-restore-drill:test-sentinel', expected: /server reports the production/u },
  ];
  for (const observed of cases) {
    const client = new FakeS3Client();
    await assert.rejects(
      verifyOffsiteRestoreDrill({
        environment: {
          ...backupEnvironment(root),
          BACKUP_DRILL_OBJECT_KEY: objectKey,
          BACKUP_AGE_IDENTITY_FILE: '/secure/key',
          BACKUP_DRILL_DATABASE_URL: 'postgresql://restore@localhost/alistore_restore_check',
          BACKUP_EXPECTED_DRILL_DATABASE_IDENTITY: 'localhost:5432/alistore_restore_check',
          BACKUP_EXPECTED_DRILL_SENTINEL: 'alistore-restore-drill:test-sentinel',
          BACKUP_ALLOW_DRILL_RESTORE: 'YES_I_UNDERSTAND',
        },
        now,
        client,
        fetchImpl: privacyFetch(now),
        runCommand: async (command, args) => {
          if (command === 'psql' && args.includes('--command')) return JSON.stringify(observed);
          throw new Error(`unexpected destructive command ${command}`);
        },
      }),
      observed.expected,
    );
    assert.equal(client.commands.some((command) => command instanceof GetObjectCommand), false);
  }
});

test('drill refuses production identity and unowned object keys', async () => {
  const base = {
    ...backupEnvironment('/tmp/backups'),
    BACKUP_DRILL_OBJECT_KEY: 'postgres/someone-else.dump.gz.age',
    BACKUP_AGE_IDENTITY_FILE: '/secure/key',
    BACKUP_DRILL_DATABASE_URL: 'postgresql://restore@db.example/alistore_prod',
    BACKUP_EXPECTED_DRILL_DATABASE_IDENTITY: 'db.example:5432/alistore_prod',
    BACKUP_EXPECTED_DRILL_SENTINEL: 'alistore-restore-drill:test-sentinel',
    BACKUP_ALLOW_DRILL_RESTORE: 'YES_I_UNDERSTAND',
  };
  await assert.rejects(verifyOffsiteRestoreDrill({ environment: base }), /not owned/u);
  await assert.rejects(
    verifyOffsiteRestoreDrill({
      environment: {
        ...base,
        BACKUP_DRILL_OBJECT_KEY: 'postgres/alistore-production/alistore-2026-08-07T03-17-00-000Z.dump.gz.age',
      },
    }),
    /must not use the production/u,
  );
});

test('CLI redaction removes DB, S3, Cloudflare and drill credentials', () => {
  const environment = {
    ...backupEnvironment('/tmp/backups'),
    BACKUP_DRILL_DATABASE_URL: 'postgresql://restore:drill-secret@localhost/restore',
  };
  const message = Object.values(environment).join(' / ') + ' / p@ss / drill-secret';
  const safe = redactBackupSecrets(message, environment);
  assert.doesNotMatch(safe, /p@ss|p%40ss|access-key|secret-key|privacy-token|drill-secret|postgresql:/u);
});

function backupEnvironment(backupDir) {
  return {
    DATABASE_URL: 'postgresql://backup:p%40ss@db.example/alistore_prod?schema=public',
    BACKUP_EXPECTED_DATABASE_IDENTITY: 'db.example:5432/alistore_prod',
    S3_ENDPOINT: `https://${'a'.repeat(32)}.r2.cloudflarestorage.com`,
    S3_BACKUP_BUCKET: 'alistore-backups-prod',
    AWS_ACCESS_KEY_ID: 'access-key',
    AWS_SECRET_ACCESS_KEY: 'secret-key',
    BACKUP_AGE_RECIPIENT: recipient,
    BACKUP_DIR: backupDir,
    BACKUP_KEEP_DAYS: '14',
    BACKUP_PRIVACY_GATE_URL: 'https://privacy.example.test/r2/alistore-backups-prod',
    BACKUP_PRIVACY_GATE_TOKEN: 'privacy-token',
    PATH: '/usr/bin:/bin',
    HOME: '/Users/test',
  };
}

function cloudflareGateEnvironment(backupDir) {
  const environment = backupEnvironment(backupDir);
  delete environment.BACKUP_PRIVACY_GATE_URL;
  delete environment.BACKUP_PRIVACY_GATE_TOKEN;
  return {
    ...environment,
    CLOUDFLARE_ACCOUNT_ID: 'a'.repeat(32),
    BACKUP_CLOUDFLARE_READ_TOKEN: 'cloudflare-read-token',
  };
}

function privacyFetch(checkedAt) {
  return async () => ({
    status: 200,
    json: async () => ({
      bucket: 'alistore-backups-prod',
      checkedAt: checkedAt.toISOString(),
      customDomains: [],
      managedDomainEnabled: false,
      private: true,
      s3Endpoint: `https://${'a'.repeat(32)}.r2.cloudflarestorage.com`,
    }),
  });
}

function privacyAndAnonymousFetch(checkedAt) {
  return async (url) => url.startsWith('https://privacy.example.test')
    ? privacyFetch(checkedAt)(url)
    : { status: 403 };
}

function fakeBackupTools(commands) {
  return async (command, args, options) => {
    commands.push({ command, args, options });
    if (command === 'age' && args.at(-1) === '/dev/null') {
      await writeFile(args[args.indexOf('--output') + 1], 'age-probe');
      return '';
    }
    if (command === 'pg_dump') {
      await writeFile(args[args.indexOf('--file') + 1], 'custom-dump');
      return '';
    }
    if (command === 'pg_restore') return '; archive header\n1; 1 0 TABLE public orders backup\n';
    if (command === 'age') {
      await copyFile(args.at(-1), args[args.indexOf('--output') + 1]);
      return '';
    }
    throw new Error(`unexpected command ${command}`);
  };
}

async function temporaryDirectory(t, prefix) {
  const root = await mkdtemp(join(tmpdir(), prefix));
  t.after(async () => import('node:fs/promises').then(({ rm }) => rm(root, { recursive: true, force: true })));
  return root;
}

function sha256(value) {
  return createHash('sha256').update(value).digest('hex');
}

class FakeS3Client {
  commands = [];
  listContents = [];
  uploaded = null;
  downloaded = null;
  downloadMetadata = null;
  corruptGet = false;

  async send(command) {
    this.commands.push(command);
    if (command instanceof PutObjectCommand) {
      const chunks = [];
      for await (const chunk of command.input.Body) chunks.push(chunk);
      this.uploaded = { ...command.input, bytes: Buffer.concat(chunks) };
      return { ETag: 'test' };
    }
    if (command instanceof HeadObjectCommand) {
      return { ContentLength: this.uploaded.bytes.length, Metadata: this.uploaded.Metadata };
    }
    if (command instanceof GetObjectCommand) {
      const source = this.downloaded ?? this.uploaded?.bytes;
      const bytes = this.corruptGet ? Buffer.concat([source, Buffer.from('corrupt')]) : source;
      return { Body: Readable.from([bytes]), Metadata: this.downloadMetadata ?? this.uploaded?.Metadata };
    }
    if (command instanceof ListObjectsV2Command) return { Contents: this.listContents, IsTruncated: false };
    if (command instanceof DeleteObjectCommand) return {};
    throw new Error(`unexpected S3 command ${command.constructor.name}`);
  }
}
