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
