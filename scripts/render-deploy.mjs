import { pathToFileURL } from 'node:url';
import { verifyGitHubReleaseHead } from './verify-github-release-head.mjs';

const SUCCESS = new Set(['live']);
const FAILURE = new Set(['build_failed', 'update_failed', 'canceled', 'deactivated']);
const TERMINAL = new Set([...SUCCESS, ...FAILURE]);
const SERVICE_MANIFEST = {
  staging: {
    api: { name: 'alistore-api-staging', type: 'web_service' },
    web: { name: 'alistore-web-staging', type: 'web_service' },
    worker: { name: 'alistore-worker-staging', type: 'background_worker' },
  },
  production: {
    api: { name: 'alistore-api-prod', type: 'web_service' },
    web: { name: 'alistore-web-prod', type: 'web_service' },
    worker: { name: 'alistore-worker-prod', type: 'background_worker' },
    backup: { name: 'alistore-backup-prod', type: 'cron_job' },
  },
};

export function serviceIdFromHook(hook) {
  const url = new URL(hook);
  if (url.origin !== 'https://api.render.com') {
    throw new Error('Render deploy hook must use https://api.render.com');
  }
  const match = url.pathname.match(/^\/deploy\/(srv-[0-9a-z]{20})$/);
  const serviceId = match?.[1];
  if (!serviceId || !url.searchParams.get('key')) throw new Error('Render deploy hook is malformed');
  return serviceId;
}

export async function deployAndWait({
  services, commit, apiKey, deploymentEnvironment, databaseRuntimeUrl, databaseRuntimePoolUrl, databaseBackupUrl,
  fetchImpl = fetch, verifyCandidate = async () => {}, pollDelayMs = 15_000, maxPolls = 120,
}) {
  if (!commit || !apiKey || !databaseRuntimeUrl) {
    throw new Error('GITHUB_SHA, RENDER_API_KEY and DATABASE_RUNTIME_URL are required');
  }
  if (services.length === 0 || services.some(({ hook }) => !hook)) {
    throw new Error('All Render service deploy hooks are required');
  }
  const manifest = SERVICE_MANIFEST[deploymentEnvironment];
  if (!manifest) throw new Error('DEPLOY_ENVIRONMENT must be staging or production');

  const targets = services.map((service) => ({
    ...service,
    ...manifest[service.name],
    logicalName: service.name,
    serviceId: serviceIdFromHook(service.hook),
  }));
  if (targets.some(({ name, type }) => !name || !type)) {
    throw new Error(`Unexpected Render service for ${deploymentEnvironment}`);
  }
  if (new Set(targets.map(({ logicalName }) => logicalName)).size !== targets.length ||
      new Set(targets.map(({ serviceId }) => serviceId)).size !== targets.length) {
    throw new Error('Render service names and ids must be unique');
  }
  if (deploymentEnvironment === 'production' && targets.some(({ logicalName }) => logicalName === 'api') && !databaseRuntimePoolUrl) {
    throw new Error('DATABASE_RUNTIME_POOL_URL is required for the production API');
  }
  const backupTarget = targets.find(({ logicalName }) => logicalName === 'backup');
  if ((databaseBackupUrl && !backupTarget) || (!databaseBackupUrl && backupTarget)) {
    throw new Error('DATABASE_BACKUP_URL and the backup deploy hook are required together');
  }
  for (const target of targets) {
    const serviceResponse = await fetchImpl(`https://api.render.com/v1/services/${target.serviceId}`, {
      headers: { Authorization: `Bearer ${apiKey}`, Accept: 'application/json' }, redirect: 'error',
    });
    if (!serviceResponse.ok) {
      throw new Error(`Render service identity lookup failed for ${target.logicalName} (HTTP ${serviceResponse.status})`);
    }
    const servicePayload = await serviceResponse.json();
    const service = servicePayload?.service ?? servicePayload;
    if (service?.id !== target.serviceId || service?.name !== target.name || service?.type !== target.type) {
      throw new Error(`Render service identity mismatch for ${target.logicalName}`);
    }
    const response = await fetchImpl(`https://api.render.com/v1/services/${target.serviceId}/deploys?limit=1`, {
      headers: { Authorization: `Bearer ${apiKey}`, Accept: 'application/json' }, redirect: 'error',
    });
    if (!response.ok) throw new Error(`Render deploy preflight failed for ${target.logicalName} (HTTP ${response.status})`);
    const payload = await response.json();
    const item = Array.isArray(payload) ? payload[0] : payload?.deploys?.[0];
    const status = item?.deploy?.status ?? item?.status;
    if (status && !TERMINAL.has(status)) throw new Error(`Render ${target.logicalName} already has an active deploy`);
  }
  // A newer CI run may complete while this serialized workflow waits on an
  // environment approval or Render preflight. Recheck at the mutation boundary.
  await verifyCandidate();
  const changes = targets.flatMap((target) => {
    if (target.logicalName === 'api') return [{ serviceId: target.serviceId, key: 'DATABASE_URL', value: databaseRuntimePoolUrl ?? databaseRuntimeUrl }];
    if (target.logicalName === 'worker') return [{ serviceId: target.serviceId, key: 'DATABASE_URL', value: databaseRuntimeUrl }];
    if (target.logicalName === 'backup') return [
      { serviceId: target.serviceId, key: 'DATABASE_URL', value: databaseRuntimeUrl },
      { serviceId: target.serviceId, key: 'DATABASE_BACKUP_URL', value: databaseBackupUrl },
    ];
    return [];
  });
  const previous = [];
  for (const change of changes) {
    previous.push({ ...change, value: await readEnvironmentVariable(fetchImpl, apiKey, change.serviceId, change.key) });
  }
  const applied = [];
  try {
    for (const change of changes) {
      await updateEnvironmentVariable(fetchImpl, apiKey, change.serviceId, change.key, change.value);
      applied.push(change);
    }
  } catch (error) {
    const rollback = await Promise.allSettled(applied.reverse().map((change) => {
      const prior = previous.find(({ serviceId, key }) => serviceId === change.serviceId && key === change.key);
      return updateEnvironmentVariable(fetchImpl, apiKey, change.serviceId, change.key, prior.value);
    }));
    if (rollback.some(({ status }) => status === 'rejected')) {
      throw new Error('Render credential switch failed and rollback was incomplete');
    }
    throw error;
  }

  const deploys = [];
  try {
    for (const { logicalName: name, hook, serviceId } of targets) {
      // If a newer certified SHA appears during the multi-service handoff,
      // abort and cancel any hooks already accepted for this older release.
      await verifyCandidate();
      const hookUrl = new URL(hook);
      hookUrl.searchParams.set('ref', commit);
      const response = await fetchImpl(hookUrl, { method: 'POST', redirect: 'error' });
      if (response.status !== 200) {
        throw new Error(`Render rejected ${name} commit-bound deploy (HTTP ${response.status})`);
      }
      const payload = await response.json();
      const deployId = payload?.id ?? payload?.deploy?.id;
      if (!deployId) throw new Error(`Render did not return a deploy id for ${name}`);
      deploys.push({ name, deployId, serviceId });
      process.stdout.write(`Render accepted ${name} deploy ${deployId} for ${commit}.\n`);
    }

    for (const deploy of deploys) {
      let completed = false;
      for (let poll = 0; poll < maxPolls; poll += 1) {
        await verifyCandidate();
        const response = await fetchImpl(
          `https://api.render.com/v1/services/${encodeURIComponent(deploy.serviceId)}/deploys/${encodeURIComponent(deploy.deployId)}`,
          { headers: { Authorization: `Bearer ${apiKey}`, Accept: 'application/json' }, redirect: 'error' },
        );
        if (!response.ok) throw new Error(`Render deploy status lookup failed for ${deploy.name} (HTTP ${response.status})`);
        const payload = await response.json();
        const status = payload?.status ?? payload?.deploy?.status;
        if (SUCCESS.has(status)) {
          // The status lookup itself is a network race boundary. Do not accept
          // an older release as live if the protected branch moved meanwhile.
          await verifyCandidate();
          process.stdout.write(`Render ${deploy.name} deploy ${deploy.deployId} is live.\n`);
          completed = true;
          break;
        }
        if (FAILURE.has(status)) throw new Error(`Render ${deploy.name} deploy ${deploy.deployId} ended with ${status}`);
        if (poll + 1 < maxPolls) await new Promise((resolve) => setTimeout(resolve, pollDelayMs));
      }
      if (!completed) throw new Error(`Timed out waiting for Render ${deploy.name} deploy ${deploy.deployId}`);
    }
  } catch (error) {
    const cancellations = await Promise.allSettled(deploys.map(async (deploy) => {
      const response = await fetchImpl(
        `https://api.render.com/v1/services/${deploy.serviceId}/deploys/${deploy.deployId}/cancel`,
        { method: 'POST', headers: { Authorization: `Bearer ${apiKey}` }, redirect: 'error' },
      );
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
    }));
    if (cancellations.some(({ status }) => status === 'rejected')) {
      throw new Error(`Render deployment failed and cancellation was incomplete: ${error.message}`);
    }
    throw error;
  }
}

async function updateEnvironmentVariable(fetchImpl, apiKey, serviceId, key, value) {
  const response = await fetchImpl(
    `https://api.render.com/v1/services/${encodeURIComponent(serviceId)}/env-vars/${encodeURIComponent(key)}`,
    {
      method: 'PUT', redirect: 'error',
      headers: { Authorization: `Bearer ${apiKey}`, Accept: 'application/json', 'Content-Type': 'application/json' },
      body: JSON.stringify({ value }),
    },
  );
  if (!response.ok) throw new Error(`Render rejected ${key} switch for ${serviceId} (HTTP ${response.status})`);
}

async function readEnvironmentVariable(fetchImpl, apiKey, serviceId, key) {
  const response = await fetchImpl(
    `https://api.render.com/v1/services/${encodeURIComponent(serviceId)}/env-vars/${encodeURIComponent(key)}`,
    { headers: { Authorization: `Bearer ${apiKey}`, Accept: 'application/json' }, redirect: 'error' },
  );
  if (!response.ok) throw new Error(`Render could not read ${key} for ${serviceId} (HTTP ${response.status})`);
  const payload = await response.json();
  if (typeof payload?.value !== 'string' || payload.value.length === 0) {
    throw new Error(`Render returned an invalid ${key} value for ${serviceId}`);
  }
  return payload.value;
}

const invokedPath = process.argv[1] ? pathToFileURL(process.argv[1]).href : '';
if (import.meta.url === invokedPath) {
  const verifyCandidate = process.env.DEPLOY_ENVIRONMENT === 'production'
    ? () => verifyGitHubReleaseHead({
      repository: process.env.RELEASE_REPOSITORY,
      branch: process.env.RELEASE_BRANCH,
      releaseSha: process.env.RELEASE_SHA,
      token: process.env.RELEASE_HEAD_TOKEN,
    })
    : async () => {};
  deployAndWait({
    commit: process.env.GITHUB_SHA,
    apiKey: process.env.RENDER_API_KEY,
    deploymentEnvironment: process.env.DEPLOY_ENVIRONMENT,
    databaseRuntimeUrl: process.env.DATABASE_RUNTIME_URL,
    databaseRuntimePoolUrl: process.env.DATABASE_RUNTIME_POOL_URL,
    databaseBackupUrl: process.env.DATABASE_BACKUP_URL,
    verifyCandidate,
    services: [
      { name: 'api', hook: process.env.RENDER_DEPLOY_HOOK_API },
      { name: 'web', hook: process.env.RENDER_DEPLOY_HOOK_WEB },
      { name: 'worker', hook: process.env.RENDER_DEPLOY_HOOK_WORKER },
      ...(process.env.RENDER_DEPLOY_HOOK_BACKUP
        ? [{ name: 'backup', hook: process.env.RENDER_DEPLOY_HOOK_BACKUP }]
        : []),
    ],
  }).catch((error) => {
    process.stderr.write(`Render deployment failed: ${error.message}\n`);
    process.exitCode = 1;
  });
}
