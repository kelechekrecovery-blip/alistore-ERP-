import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import YAML from 'yaml';
import { verifyGitHubReleaseHead } from '../verify-github-release-head.mjs';

const root = new URL('../..', import.meta.url);
const loadWorkflow = (name) => YAML.parse(readFileSync(new URL(`.github/workflows/${name}`, root), 'utf8'));
const production = loadWorkflow('cd-production.yml');
const ci = loadWorkflow('ci.yml');

const needs = (job) => Array.isArray(job.needs) ? job.needs : [job.needs].filter(Boolean);
const checkoutSteps = Object.entries(production.jobs).flatMap(([jobName, job]) =>
  (job.steps ?? [])
    .filter((step) => String(step.uses ?? '').startsWith('actions/checkout@'))
    .map((step) => ({ jobName, step })),
);

test('production CD is triggered only by a completed CI workflow', () => {
  assert.deepEqual(production.on.workflow_run.workflows, ['CI']);
  assert.deepEqual(production.on.workflow_run.types, ['completed']);
  assert.deepEqual(production.on.workflow_run.branches, ['main', 'master']);
  assert.equal(production.on.push, undefined);
  assert.equal(production.on.workflow_dispatch, undefined);
  assert.equal(ci.name, 'CI');
  assert.deepEqual(ci.on.push.branches.slice(0, 2), ['main', 'master']);
});

test('release authorization rejects failed, PR, fork and unexpected-branch runs', () => {
  const condition = production.jobs['authorize-release'].if;
  for (const required of [
    "conclusion == 'success'",
    "event == 'push'",
    'head_repository.full_name == github.repository',
    'workflow_run.head_branch',
    'main',
    'master',
  ]) {
    assert.match(condition, new RegExp(required.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
  }
  assert.ok(needs(production.jobs['migration-rehearsal']).includes('authorize-release'));
  assert.ok(needs(production.jobs['release-preflight']).includes('authorize-release'));
});

test('every production job checks out the CI-certified SHA', () => {
  assert.equal(production.env.RELEASE_SHA, '${{ github.event.workflow_run.head_sha }}');
  assert.equal(production.env.RELEASE_BRANCH, '${{ github.event.workflow_run.head_branch }}');
  assert.ok(checkoutSteps.length >= 5);
  for (const { jobName, step } of checkoutSteps) {
    assert.equal(step.with?.ref, '${{ env.RELEASE_SHA }}', `${jobName} checkout must pin RELEASE_SHA`);
    assert.equal(step.with?.['persist-credentials'], false, `${jobName} must not persist the GitHub token`);
  }
});

test('privileged mutations verify the current branch head at their mutation boundary', () => {
  const authorize = production.jobs['authorize-release'].steps.find((step) => String(step.name ?? '').startsWith('Reject a'));
  assert.equal(authorize?.run, 'node scripts/verify-github-release-head.mjs');
  const migrate = production.jobs['migrate-production'].steps.find((step) => step.name === 'Apply production migrations with the owner credential');
  assert.ok(migrate.run.indexOf('verify-github-release-head.mjs') < migrate.run.indexOf('db:deploy'));
  const deploy = production.jobs.deploy.steps.find((step) => step.name === 'Deploy the exact tested commit and wait for all services');
  assert.equal(deploy?.env?.GITHUB_SHA, '${{ env.RELEASE_SHA }}');
  assert.equal(deploy?.env?.RELEASE_REPOSITORY, '${{ github.repository }}');
  assert.equal(deploy?.env?.RELEASE_HEAD_TOKEN, '${{ github.token }}');
});

test('GitHub release-head verifier fails closed without exposing the token', async () => {
  const releaseSha = 'a'.repeat(40);
  const calls = [];
  await assert.rejects(verifyGitHubReleaseHead({
    repository: 'owner/repository', branch: 'main', releaseSha, token: 'secret-token',
    fetchImpl: async (url, init) => {
      calls.push({ url, init });
      return new Response(JSON.stringify({ object: { sha: 'b'.repeat(40) } }), { status: 200 });
    },
  }), /no longer the tip/);
  assert.equal(calls.length, 1);
  assert.equal(calls[0].init.headers.Authorization, 'Bearer secret-token');
  await assert.rejects(verifyGitHubReleaseHead({
    repository: 'owner/repository', branch: 'feature', releaseSha, token: 'secret-token',
    fetchImpl: async () => { throw new Error('must not fetch'); },
  }), /not allowed/);
});
