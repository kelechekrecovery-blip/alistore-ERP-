import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import {
  hashDependencyTree,
  trustedWorkspaceSymlinkOptions,
} from '../toolchain-hashes.mjs';

const fixture = (t, prefix) => {
  const root = fs.mkdtempSync(path.join(fs.realpathSync(os.tmpdir()), prefix));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  return root;
};

const prismaGeneratedSource = (repositoryRoot) => `const config = {
  "generator": {
    "output": {
      "value": ${JSON.stringify(path.join(repositoryRoot, 'node_modules', '@prisma', 'client'))},
      "fromEnvVar": null
    },
    "previewFeatures": [],
    "sourceFilePath": ${JSON.stringify(path.join(repositoryRoot, 'apps', 'api', 'prisma', 'schema.prisma'))}
  },
  "relativePath": "../../../apps/api/prisma"
};
`;

const prismaRepositoryFixture = (t, prefix) => {
  const repository = fixture(t, prefix);
  const clientRoot = path.join(repository, 'node_modules', '.prisma', 'client');
  fs.mkdirSync(clientRoot, { recursive: true });
  fs.mkdirSync(path.join(repository, 'apps', 'api'), { recursive: true });
  fs.mkdirSync(path.join(repository, 'apps', 'web'), { recursive: true });
  const source = prismaGeneratedSource(repository);
  for (const name of ['index.js', 'edge.js']) {
    fs.writeFileSync(path.join(clientRoot, name), source);
  }
  return { clientRoot, repository, source };
};

test('tree records are length-framed against delimiter-shifting collisions', (t) => {
  const first = fixture(t, 'alistore-tree-frame-a-');
  const second = fixture(t, 'alistore-tree-frame-b-');
  fs.writeFileSync(path.join(first, 'a'), 'PAYLOAD');
  fs.writeFileSync(path.join(first, 'b'), 'SECOND');
  fs.writeFileSync(path.join(second, 'a'), 'PAYLOAD\0f\0b\0SECOND');

  assert.notEqual(hashDependencyTree(first), hashDependencyTree(second));
});

test('escaping and dangling symlinks fail closed', (t) => {
  const root = fixture(t, 'alistore-tree-link-root-');
  const outside = fixture(t, 'alistore-tree-link-outside-');
  fs.writeFileSync(path.join(outside, 'payload.js'), 'trusted\n');
  fs.symlinkSync(path.join(outside, 'payload.js'), path.join(root, 'external.js'));
  assert.throws(() => hashDependencyTree(root), /escapes its trusted root/u);

  fs.unlinkSync(path.join(root, 'external.js'));
  fs.symlinkSync(path.join(outside, 'missing.js'), path.join(root, 'dangling.js'));
  assert.throws(() => hashDependencyTree(root), /Dangling dependency-tree symlink/u);
});

test('an explicitly allowed external target is identity- and content-bound', (t) => {
  const root = fixture(t, 'alistore-tree-policy-root-');
  const outside = fixture(t, 'alistore-tree-policy-outside-');
  const target = path.join(outside, 'payload.js');
  fs.writeFileSync(target, 'trusted\n');
  fs.symlinkSync(target, path.join(root, 'external.js'));
  const options = {
    externalSymlinks: new Map([
      ['external.js', { expectedPath: target, identity: 'fixture:payload' }],
    ]),
  };

  const before = hashDependencyTree(root, options);
  fs.writeFileSync(target, 'tampered\n');
  assert.notEqual(hashDependencyTree(root, options), before);
});

test('workspace-local dependency bytes remain inside the trusted tree hash', (t) => {
  const repository = fixture(t, 'alistore-workspace-dependency-');
  const nodeModules = path.join(repository, 'node_modules');
  const api = path.join(repository, 'apps', 'api');
  const web = path.join(repository, 'apps', 'web');
  fs.mkdirSync(path.join(nodeModules, '@alistore'), { recursive: true });
  fs.mkdirSync(path.join(api, 'node_modules', 'pkg'), { recursive: true });
  fs.mkdirSync(web, { recursive: true });
  fs.writeFileSync(path.join(api, 'package.json'), '{"name":"@alistore/api"}\n');
  fs.writeFileSync(path.join(web, 'package.json'), '{"name":"@alistore/web"}\n');
  const dependency = path.join(api, 'node_modules', 'pkg', 'index.js');
  fs.writeFileSync(dependency, 'trusted\n');
  fs.symlinkSync(api, path.join(nodeModules, '@alistore', 'api'));
  fs.symlinkSync(web, path.join(nodeModules, '@alistore', 'web'));

  const options = trustedWorkspaceSymlinkOptions(repository);
  const before = hashDependencyTree(nodeModules, options);
  fs.writeFileSync(dependency, 'claimant-controlled\n');
  assert.notEqual(hashDependencyTree(nodeModules, options), before);
});

test('internal links cannot smuggle mutable bytes through an ignored subtree', (t) => {
  const root = fixture(t, 'alistore-tree-ignored-link-');
  fs.mkdirSync(path.join(root, '.cache'));
  fs.writeFileSync(path.join(root, '.cache', 'payload.js'), 'claimant-controlled\n');
  fs.symlinkSync('.cache/payload.js', path.join(root, 'visible.js'));

  assert.throws(
    () => hashDependencyTree(root, { ignoredPaths: ['.cache'] }),
    /targets an ignored subtree/u,
  );
});

test('allowlisted external targets must not be symlink aliases', (t) => {
  const root = fixture(t, 'alistore-tree-policy-alias-root-');
  const outside = fixture(t, 'alistore-tree-policy-alias-outside-');
  const target = path.join(outside, 'payload.js');
  const alias = path.join(outside, 'alias.js');
  fs.writeFileSync(target, 'trusted\n');
  fs.symlinkSync(target, alias);
  fs.symlinkSync(alias, path.join(root, 'external.js'));

  assert.throws(
    () => hashDependencyTree(root, {
      externalSymlinks: new Map([
        ['external.js', { expectedPath: alias, identity: 'fixture:alias' }],
      ]),
    }),
    /policy target must be canonical/u,
  );
});

test('ignored generated workspace outputs must be absent before trust verification', (t) => {
  const repository = fixture(t, 'alistore-workspace-output-');
  fs.mkdirSync(path.join(repository, 'apps', 'api'), { recursive: true });
  fs.mkdirSync(path.join(repository, 'apps', 'web', '.next-e2e-3200'), { recursive: true });

  assert.throws(
    () => trustedWorkspaceSymlinkOptions(repository),
    /Generated workspace output must be absent/u,
  );
  assert.doesNotThrow(() => trustedWorkspaceSymlinkOptions(repository, {
    allowGeneratedOutputs: true,
  }));
});

test('Next type bootstrap is rejected before and ignored only after trusted execution', (t) => {
  const repository = fixture(t, 'alistore-next-env-output-');
  const nodeModules = path.join(repository, 'node_modules');
  const api = path.join(repository, 'apps', 'api');
  const web = path.join(repository, 'apps', 'web');
  fs.mkdirSync(path.join(nodeModules, '@alistore'), { recursive: true });
  fs.mkdirSync(api, { recursive: true });
  fs.mkdirSync(web, { recursive: true });
  fs.writeFileSync(path.join(api, 'package.json'), '{"name":"@alistore/api"}\n');
  fs.writeFileSync(path.join(web, 'package.json'), '{"name":"@alistore/web"}\n');
  fs.symlinkSync(api, path.join(nodeModules, '@alistore', 'api'));
  fs.symlinkSync(web, path.join(nodeModules, '@alistore', 'web'));

  const before = hashDependencyTree(
    nodeModules,
    trustedWorkspaceSymlinkOptions(repository, { allowGeneratedOutputs: true }),
  );
  fs.writeFileSync(path.join(web, 'next-env.d.ts'), 'generated\n');

  assert.throws(
    () => trustedWorkspaceSymlinkOptions(repository),
    /Generated workspace output must be absent/u,
  );
  assert.equal(
    hashDependencyTree(
      nodeModules,
      trustedWorkspaceSymlinkOptions(repository, { allowGeneratedOutputs: true }),
    ),
    before,
  );
});

test('generated Prisma metadata hashes identically across canonical repository roots', (t) => {
  const first = prismaRepositoryFixture(t, 'alistore-prisma-root-a-');
  const second = prismaRepositoryFixture(t, 'alistore-prisma-root-b-');

  assert.equal(
    hashDependencyTree(
      path.join(first.repository, 'node_modules'),
      trustedWorkspaceSymlinkOptions(first.repository),
    ),
    hashDependencyTree(
      path.join(second.repository, 'node_modules'),
      trustedWorkspaceSymlinkOptions(second.repository),
    ),
  );
});

test('generated Prisma normalization rejects missing, duplicate, or unexpected fields', (t) => {
  const expectedOutput = (repository) => JSON.stringify(
    path.join(repository, 'node_modules', '@prisma', 'client'),
  );
  const expectedSchema = (repository) => JSON.stringify(
    path.join(repository, 'apps', 'api', 'prisma', 'schema.prisma'),
  );
  const cases = [
    ['missing output', (source) => source.replace('"output": {', '"renamedOutput": {')],
    ['duplicate output', (source) => source.replace('"previewFeatures": []', `"output": {
      "value": "duplicate",
      "fromEnvVar": null
    },
    "previewFeatures": []`)],
    ['unexpected output', (source, repository) => source.replace(
      expectedOutput(repository),
      '"/tmp/claimant-output"',
    )],
    ['missing source', (source) => source.replace('"sourceFilePath":', '"renamedSourceFilePath":')],
    ['duplicate source', (source) => source.replace('"sourceFilePath":', '"sourceFilePath": "duplicate",\n    "sourceFilePath":')],
    ['unexpected source', (source, repository) => source.replace(
      expectedSchema(repository),
      '"/tmp/claimant-schema.prisma"',
    )],
  ];

  for (const [label, mutate] of cases) {
    const current = prismaRepositoryFixture(t, `alistore-prisma-invalid-${label.replaceAll(' ', '-')}-`);
    fs.writeFileSync(path.join(current.clientRoot, 'index.js'), mutate(current.source, current.repository));
    assert.throws(
      () => hashDependencyTree(
        path.join(current.repository, 'node_modules'),
        trustedWorkspaceSymlinkOptions(current.repository),
      ),
      /Prisma generated metadata/u,
      label,
    );
  }
});

test('normalization keeps all non-metadata dependency bytes bound', (t) => {
  const first = prismaRepositoryFixture(t, 'alistore-prisma-bound-a-');
  const second = prismaRepositoryFixture(t, 'alistore-prisma-bound-b-');
  fs.appendFileSync(path.join(second.clientRoot, 'index.js'), 'claimant-controlled\n');

  const firstHash = hashDependencyTree(
    path.join(first.repository, 'node_modules'),
    trustedWorkspaceSymlinkOptions(first.repository),
  );
  assert.notEqual(
    firstHash,
    hashDependencyTree(
      path.join(second.repository, 'node_modules'),
      trustedWorkspaceSymlinkOptions(second.repository),
    ),
  );

  fs.writeFileSync(path.join(second.clientRoot, 'index.js'), second.source);
  fs.writeFileSync(path.join(first.clientRoot, 'browser.js'), first.repository);
  fs.writeFileSync(path.join(second.clientRoot, 'browser.js'), second.repository);
  assert.notEqual(
    hashDependencyTree(
      path.join(first.repository, 'node_modules'),
      trustedWorkspaceSymlinkOptions(first.repository),
    ),
    hashDependencyTree(
      path.join(second.repository, 'node_modules'),
      trustedWorkspaceSymlinkOptions(second.repository),
    ),
  );
});

test('non-reproducible optional native lifecycle outputs are rejected', (t) => {
  for (const [label, relativePath] of [
    ['cpu-features', ['cpu-features', 'build']],
    ['ssh2', ['ssh2', 'lib', 'protocol', 'crypto', 'build']],
  ]) {
    const current = prismaRepositoryFixture(t, `alistore-native-${label}-`);
    fs.mkdirSync(path.join(current.repository, 'node_modules', ...relativePath), {
      recursive: true,
    });

    assert.throws(
      () => trustedWorkspaceSymlinkOptions(current.repository),
      /Native dependency lifecycle output must be absent/u,
      label,
    );
  }
});
