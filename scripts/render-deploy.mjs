import { pathToFileURL } from 'node:url';

const SUCCESS = new Set(['live']);
const FAILURE = new Set(['build_failed', 'update_failed', 'canceled', 'deactivated']);
const TERMINAL = new Set([...SUCCESS, ...FAILURE]);

export function serviceIdFromHook(hook) {
  const url = new URL(hook);
  if (url.protocol !== 'https:' || url.hostname !== 'api.render.com') {
    throw new Error('Render deploy hook must use https://api.render.com');
  }
  const serviceId = url.pathname.split('/').filter(Boolean).at(-1);
  if (!serviceId?.startsWith('srv-')) throw new Error('Render deploy hook does not contain a service id');
  return serviceId;
}

export async function deployAndWait({ services, commit, apiKey, fetchImpl = fetch, pollDelayMs = 15_000, maxPolls = 120 }) {
  if (!commit || !apiKey) throw new Error('GITHUB_SHA and RENDER_API_KEY are required');
  if (services.length === 0 || services.some(({ hook }) => !hook)) {
    throw new Error('All Render service deploy hooks are required');
  }

  const targets = services.map((service) => ({ ...service, serviceId: serviceIdFromHook(service.hook) }));
  for (const target of targets) {
    const response = await fetchImpl(`https://api.render.com/v1/services/${target.serviceId}/deploys?limit=1`, {
      headers: { Authorization: `Bearer ${apiKey}`, Accept: 'application/json' }, redirect: 'error',
    });
    if (!response.ok) throw new Error(`Render deploy preflight failed for ${target.name} (HTTP ${response.status})`);
    const payload = await response.json();
    const item = Array.isArray(payload) ? payload[0] : payload?.deploys?.[0];
    const status = item?.deploy?.status ?? item?.status;
    if (status && !TERMINAL.has(status)) throw new Error(`Render ${target.name} already has an active deploy`);
  }

  const deploys = [];
  try {
    for (const { name, hook, serviceId } of targets) {
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
        const response = await fetchImpl(
          `https://api.render.com/v1/services/${encodeURIComponent(deploy.serviceId)}/deploys/${encodeURIComponent(deploy.deployId)}`,
          { headers: { Authorization: `Bearer ${apiKey}`, Accept: 'application/json' }, redirect: 'error' },
        );
        if (!response.ok) throw new Error(`Render deploy status lookup failed for ${deploy.name} (HTTP ${response.status})`);
        const payload = await response.json();
        const status = payload?.status ?? payload?.deploy?.status;
        if (SUCCESS.has(status)) {
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
    await Promise.allSettled(deploys.map((deploy) => fetchImpl(
      `https://api.render.com/v1/services/${deploy.serviceId}/deploys/${deploy.deployId}/cancel`,
      { method: 'POST', headers: { Authorization: `Bearer ${apiKey}` }, redirect: 'error' },
    )));
    throw error;
  }
}

const invokedPath = process.argv[1] ? pathToFileURL(process.argv[1]).href : '';
if (import.meta.url === invokedPath) {
  deployAndWait({
    commit: process.env.GITHUB_SHA,
    apiKey: process.env.RENDER_API_KEY,
    services: [
      { name: 'api', hook: process.env.RENDER_DEPLOY_HOOK_API },
      { name: 'web', hook: process.env.RENDER_DEPLOY_HOOK_WEB },
      { name: 'worker', hook: process.env.RENDER_DEPLOY_HOOK_WORKER },
    ],
  }).catch((error) => {
    process.stderr.write(`Render deployment failed: ${error.message}\n`);
    process.exitCode = 1;
  });
}
