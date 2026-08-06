export const FEATURE_FLAG_CUTOVER_ACK = 'drain-and-fence-v1';
export const FEATURE_FLAG_EVIDENCE_MIGRATION = '20260807_feature_flag_override_evidence_binding';
export const FEATURE_FLAG_DEPLOY_PROCESS_TIMEOUT_MS = 15 * 60 * 1000;
export const FEATURE_FLAG_CUTOVER_DEPLOY_TIMEOUT_MS =
  FEATURE_FLAG_DEPLOY_PROCESS_TIMEOUT_MS + 30 * 1000;
const FEATURE_FLAG_CUTOVER_IDLE_TIMEOUT_GRACE_MS = 30 * 1000;
export const FEATURE_FLAG_KEYS = Object.freeze([
  'supply.to_order_checkout',
  'supply.cancellation',
  'supply.auto_refund',
  'supply.owner_resolution',
  'supply.partial_handover',
  'supply.quarantine_conversion',
]);
export const FEATURE_FLAG_LOCK_NAMES = Object.freeze(
  FEATURE_FLAG_KEYS.map((key) => `feature-flag-override:${key}`).sort(),
);

export function validateFeatureFlagCutoverAcknowledgement({
  production,
  cutoverPending,
  registryExists,
  releaseSha,
  acknowledgement,
  acknowledgedSha,
}) {
  if (!production || !cutoverPending || !registryExists) return;
  if (!/^[a-f0-9]{40}$/u.test(releaseSha ?? '')) {
    throw new Error(
      'RENDER_GIT_COMMIT or ALISTORE_RELEASE_SHA must identify the production cutover revision',
    );
  }
  if (acknowledgement !== FEATURE_FLAG_CUTOVER_ACK) {
    throw new Error(
      `FEATURE_FLAG_CUTOVER_ACK must equal ${FEATURE_FLAG_CUTOVER_ACK} after owner controls are frozen`,
    );
  }
  if (acknowledgedSha !== releaseSha) {
    throw new Error('FEATURE_FLAG_CUTOVER_ACK_SHA must exactly match the candidate release SHA');
  }
}

/**
 * Hold every application-level per-key mutation lock across Prisma deployment.
 * Existing cooperative mutations drain before the first lock is acquired; new
 * ones wait until the migrations have installed the database fail-closed guard.
 */
export async function deployWithFeatureFlagCutoverGate({
  client,
  production = false,
  releaseSha,
  acknowledgement,
  acknowledgedSha,
  deploy,
  deployTimeoutMs = FEATURE_FLAG_CUTOVER_DEPLOY_TIMEOUT_MS,
  log = () => {},
}) {
  requirePositiveTimeout(deployTimeoutMs);
  let transactionOpen = false;
  await client.connect();
  try {
    const state = await inspectFeatureFlagCutoverState(client);
    const cutoverPending = state.registryExists && !state.cutoverComplete;
    validateFeatureFlagCutoverAcknowledgement({
      production,
      cutoverPending,
      registryExists: state.registryExists,
      releaseSha,
      acknowledgement,
      acknowledgedSha,
    });

    if (!cutoverPending) {
      await deploy();
      return { frozen: false, cutoverPending: false };
    }

    await client.query('BEGIN');
    transactionOpen = true;
    await client.query("SET LOCAL lock_timeout = '30s'");
    await client.query(
      "SELECT set_config('idle_in_transaction_session_timeout', $1, true) AS timeout",
      [`${deployTimeoutMs + FEATURE_FLAG_CUTOVER_IDLE_TIMEOUT_GRACE_MS}ms`],
    );
    for (const lockName of FEATURE_FLAG_LOCK_NAMES) {
      await client.query(
        'SELECT pg_advisory_xact_lock(hashtextextended($1, 0)) AS locked',
        [lockName],
      );
    }
    log('Feature-flag owner mutations drained; holding the cutover freeze across Prisma deploy.');
    await runWithDeadline(deploy, deployTimeoutMs);
    const verified = await migrationComplete(client);
    if (!verified) {
      throw new Error('feature-flag evidence migration was not recorded after Prisma deploy');
    }
    log('Feature-flag cutover migration verified; legacy mutations now fail closed.');
    return { frozen: true, cutoverPending: true };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(`Feature-flag cutover gate failed: ${redactDatabaseUrls(message)}`);
  } finally {
    if (transactionOpen) await client.query('ROLLBACK').catch(() => undefined);
    await client.end();
  }
}

async function runWithDeadline(work, timeoutMs) {
  let timer;
  const deadline = new Promise((_, reject) => {
    timer = setTimeout(() => {
      reject(new Error(`Prisma deploy exceeded the ${timeoutMs}ms cutover deadline`));
    }, timeoutMs);
  });
  try {
    return await Promise.race([Promise.resolve().then(work), deadline]);
  } finally {
    clearTimeout(timer);
  }
}

function requirePositiveTimeout(timeoutMs) {
  if (!Number.isSafeInteger(timeoutMs) || timeoutMs <= 0) {
    throw new Error('Feature-flag cutover deploy timeout must be a positive integer');
  }
}

export async function inspectFeatureFlagCutoverState(client) {
  const result = await client.query(`
    SELECT
      to_regclass('"FeatureFlagOverride"') IS NOT NULL AS registry_exists,
      to_regclass('_prisma_migrations') IS NOT NULL AS migrations_exists
  `);
  const registryExists = result.rows[0]?.registry_exists === true;
  const migrationsExists = result.rows[0]?.migrations_exists === true;
  return {
    registryExists,
    cutoverComplete: migrationsExists ? await migrationComplete(client) : false,
  };
}

async function migrationComplete(client) {
  const result = await client.query(`
    SELECT EXISTS (
      SELECT 1
      FROM _prisma_migrations
      WHERE migration_name = $1
        AND finished_at IS NOT NULL
        AND rolled_back_at IS NULL
    ) AS complete
  `, [FEATURE_FLAG_EVIDENCE_MIGRATION]);
  return result.rows[0]?.complete === true;
}

function redactDatabaseUrls(message) {
  return message.replace(/postgres(?:ql)?:\/\/[^\s]+/giu, '[redacted database URL]');
}
