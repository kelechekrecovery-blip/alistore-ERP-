import { pathToFileURL } from 'node:url';

const ALLOWED_BRANCHES = new Set(['main', 'master']);

export async function verifyGitHubReleaseHead({
  repository,
  branch,
  releaseSha,
  token,
  fetchImpl = fetch,
}) {
  if (!/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/.test(repository ?? '')) {
    throw new Error('RELEASE_REPOSITORY is invalid');
  }
  if (!ALLOWED_BRANCHES.has(branch)) throw new Error('RELEASE_BRANCH is not allowed');
  if (!/^[0-9a-f]{40}$/.test(releaseSha ?? '')) throw new Error('RELEASE_SHA must be a full commit SHA');
  if (!token) throw new Error('RELEASE_HEAD_TOKEN is required');

  const response = await fetchImpl(`https://api.github.com/repos/${repository}/git/ref/heads/${branch}`, {
    headers: {
      Accept: 'application/vnd.github+json',
      Authorization: `Bearer ${token}`,
      'X-GitHub-Api-Version': '2022-11-28',
    },
    redirect: 'error',
  });
  if (!response.ok) throw new Error(`GitHub release-head verification failed (HTTP ${response.status})`);
  const payload = await response.json();
  if (payload?.object?.sha !== releaseSha) {
    throw new Error(`CI-certified SHA is no longer the tip of ${branch}`);
  }
  return releaseSha;
}

const invokedPath = process.argv[1] ? pathToFileURL(process.argv[1]).href : '';
if (import.meta.url === invokedPath) {
  verifyGitHubReleaseHead({
    repository: process.env.RELEASE_REPOSITORY,
    branch: process.env.RELEASE_BRANCH,
    releaseSha: process.env.RELEASE_SHA,
    token: process.env.RELEASE_HEAD_TOKEN,
  }).then(() => {
    process.stdout.write('Release SHA is still the current protected branch head.\n');
  }).catch((error) => {
    process.stderr.write(`Release-head verification failed: ${error.message}\n`);
    process.exitCode = 1;
  });
}
