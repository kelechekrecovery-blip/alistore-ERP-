#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import crypto from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { inspectHeadWorktree, resolveTrustedGit, trustedGitArgs } from './trusted-git.mjs';
import { resolveTrustedNpm, verifyTrustedBootstrap } from './trusted-npm.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const screensDir = path.join(root, 'design_handoff_alistore', 'screens');
const args = new Set(process.argv.slice(2));
const strict = args.has('--strict');
const json = args.has('--json');
const outputIndex = process.argv.indexOf('--output');
const outputPath = outputIndex >= 0 ? process.argv[outputIndex + 1] : null;
verifyTrustedBootstrap(root);
const npm = resolveTrustedNpm(root);
const trustedGit = resolveTrustedGit(root);

const normalize = (value) => value.normalize('NFC');
const read = (relativePath) => fs.readFileSync(path.join(root, relativePath), 'utf8');
const sha256 = (value) => crypto.createHash('sha256').update(value).digest('hex');
const git = (args, options = {}) => execFileSync(
  trustedGit.executablePath,
  trustedGitArgs(trustedGit, root, args),
  { cwd: root, env: trustedGit.environment, ...options },
);

const sourcePaths = [
  'apps',
  'e2e',
  'scripts',
  'design_handoff_alistore/screens',
  'package.json',
  'package-lock.json',
  'playwright.config.ts',
];
const sourceHeadStatus = inspectHeadWorktree(trustedGit, root, sourcePaths);
const sourceFiles = sourceHeadStatus.files;
const currentSourceCommit = git(['rev-list', '-1', 'HEAD', '--', ...sourcePaths], {
  encoding: 'utf8',
}).trim();
const sourceTreeHash = crypto.createHash('sha256');
for (const file of sourceFiles) {
  sourceTreeHash.update(file).update('\0').update(fs.readFileSync(path.join(root, file))).update('\0');
}
const sourceTreeSha256 = sourceTreeHash.digest('hex');
const dirtySourceTree = git(
  [
    'status',
    '--porcelain',
    '--untracked-files=all',
    '--',
    'apps',
    'e2e',
    'scripts',
    'design_handoff_alistore/screens',
    'package.json',
    'package-lock.json',
    'playwright.config.ts',
  ],
  { encoding: 'utf8' },
).trim();

const trackedFiles = git(
  ['ls-files', '-z', '--', 'design_handoff_alistore/screens/*.dc.html'],
  { encoding: 'utf8' },
)
  .split('\0')
  .filter(Boolean)
  .map((name) => path.basename(name))
  .map(normalize)
  .sort((a, b) => a.localeCompare(b, 'ru'));
const tracked = new Set(trackedFiles);
const linked = new Set();
let rawLinkOccurrences = 0;
let presentLinkOccurrences = 0;

for (const file of trackedFiles) {
  const source = fs.readFileSync(path.join(screensDir, file), 'utf8');
  for (const match of source.matchAll(/href=["']([^"']+\.dc\.html)["']/giu)) {
    const target = normalize(decodeURIComponent(match[1]).replace(/^\.\//, ''));
    rawLinkOccurrences += 1;
    linked.add(target);
    if (tracked.has(target)) presentLinkOccurrences += 1;
  }
}

const linkedFiles = [...linked].sort((a, b) => a.localeCompare(b, 'ru'));
const missingLinkedFiles = linkedFiles.filter((name) => !tracked.has(name));
const packageJson = JSON.parse(read('package.json'));
const scripts = packageJson.scripts ?? {};
const ecosystemVerify = read('scripts/ecosystem-verify.mjs');
const evidencePath = 'docs/acceptance/ecosystem-evidence.json';
const evidence = JSON.parse(read(evidencePath));
const evidenceHeadStatus = inspectHeadWorktree(trustedGit, root, [
  'design_handoff_alistore/screens',
  evidencePath,
]);
const dirtyEvidence = git(
  ['status', '--porcelain', '--', 'design_handoff_alistore/screens', evidencePath],
  { encoding: 'utf8' },
).trim();
const masterPrompt = fs.existsSync(path.join(root, 'CODEX_PROMPT.md'))
  ? read('CODEX_PROMPT.md')
  : '';

const isNoop = (command = '') => /^(?:true|:|echo(?:\s+.+)?|printf(?:\s+.+)?)$/u.test(command.trim());
const posRefundCommand = 'playwright test e2e/ecosystem-reconciliation.spec.ts';
const courierCodCommand = 'playwright test e2e/ecosystem-courier-cod.spec.ts';
const serviceLoanerCommand = 'npm --prefix apps/api test -- --runInBand test/service-center.e2e-spec.ts test/service-loaner.e2e-spec.ts test/warranty-rbac.e2e-spec.ts && playwright test e2e/service-center-ui.spec.ts';
const procurementSaleCommand = 'npm --prefix apps/api test -- --runInBand test/procurement.e2e-spec.ts && playwright test e2e/ecosystem-procurement-sale.spec.ts';
const reconciledE2eCommand = 'node scripts/run-reconciled-ecosystem-e2e.mjs';
const reconciledProfile = JSON.parse(read('scripts/ecosystem-reconciliation-profile.json'));
const expectedReconciledProfile = {
  schemaVersion: 1,
  steps: [
    { id: 'pos-refund', packageScript: 'ecosystem:pos-refund:e2e' },
    { id: 'courier-cod', packageScript: 'ecosystem:courier-cod:e2e' },
    { id: 'service-loaner', packageScript: 'ecosystem:service-loaner:e2e' },
    { id: 'procurement-sale', packageScript: 'ecosystem:procurement-sale:e2e' },
  ],
};
const reconciledProfileExact =
  JSON.stringify(reconciledProfile) === JSON.stringify(expectedReconciledProfile);
const reconciledCommandsExact =
  scripts['ecosystem:pos-refund:e2e'] === posRefundCommand &&
  scripts['ecosystem:courier-cod:e2e'] === courierCodCommand &&
  scripts['ecosystem:service-loaner:e2e'] === serviceLoanerCommand &&
  scripts['ecosystem:procurement-sale:e2e'] === procurementSaleCommand;
const acceptedGateScripts = new Map([
  ['visual', 'visual:e2e'],
  ['ios-app-ui', 'ios:ui'],
  ['android-app-ui', 'android:ui'],
  ['pos-refund-reconciliation', 'ecosystem:pos-refund:e2e'],
  ['courier-cod-reconciliation', 'ecosystem:courier-cod:e2e'],
  ['service-loaner-reconciliation', 'ecosystem:service-loaner:e2e'],
  ['procurement-sale-reconciliation', 'ecosystem:procurement-sale:e2e'],
  ['reconciled-e2e', 'ecosystem:e2e'],
]);
const visualSpecPath = 'e2e/visual-acceptance.spec.ts';
const visualSnapshotDirectory = `${visualSpecPath}-snapshots`;
const visualSpec = fs.existsSync(path.join(root, visualSpecPath)) ? read(visualSpecPath) : '';
const visualSnapshots = fs.existsSync(path.join(root, visualSnapshotDirectory))
  ? fs.readdirSync(path.join(root, visualSnapshotDirectory))
      .filter((name) => name.endsWith('.png'))
      .map((name) => path.join(visualSnapshotDirectory, name))
      .sort()
  : [];
const expectedVisualSnapshots = [
  'erp-desktop-chromium-darwin.png',
  'storefront-desktop-chromium-darwin.png',
  'storefront-mobile-chromium-darwin.png',
].map((name) => path.join(visualSnapshotDirectory, name));
const visualBaselinesAccepted =
  scripts['visual:e2e'] === 'node scripts/run-visual-acceptance.mjs' &&
  read('scripts/run-visual-acceptance.mjs').includes("stats.skipped === 0") &&
  expectedVisualSnapshots.every((snapshot) =>
    visualSpec.includes(path.basename(snapshot).replace('-chromium-darwin', '')),
  ) &&
  visualSnapshots.length === expectedVisualSnapshots.length &&
  expectedVisualSnapshots.every((snapshot) => visualSnapshots.includes(snapshot)) &&
  inspectHeadWorktree(trustedGit, root, [visualSpecPath, ...visualSnapshots]).matches &&
  visualSnapshots.every((snapshot) => {
    try {
      git(['ls-files', '--error-unmatch', '--', snapshot], { stdio: 'ignore' });
      return !git(['status', '--porcelain', '--', snapshot], { encoding: 'utf8' }).trim();
    } catch {
      return false;
    }
  });
const acceptedGate = (id, commandPattern) => {
  const gate = evidence.gates?.[id];
  const packageCommand = scripts[gate?.packageScript] ?? '';
  const declaredCommand = gate?.packageScript ? `npm run ${gate.packageScript}` : '';
  if (
    !gate ||
    gate.packageScript !== acceptedGateScripts.get(id) ||
    gate.packageScript.startsWith('-') ||
    gate.status !== 'accepted' ||
    gate.command !== declaredCommand ||
    isNoop(packageCommand) ||
    !commandPattern.test(packageCommand)
  ) return false;
  if (!Array.isArray(gate.artifacts) || gate.artifacts.length === 0) return false;
  let resultEvidenceFound = false;
  const artifactsValid = gate.artifacts.every((artifact) => {
    if (!artifact?.path || !/^[a-f0-9]{64}$/u.test(artifact.sha256 ?? '')) return false;
    const normalizedPath = path.normalize(artifact.path);
    if (
      path.isAbsolute(normalizedPath) ||
      normalizedPath.startsWith('..') ||
      !normalizedPath.startsWith(`docs${path.sep}acceptance${path.sep}artifacts${path.sep}`)
    ) return false;
    const absolute = path.join(root, normalizedPath);
    if (!fs.existsSync(absolute)) return false;
    const artifactStat = fs.lstatSync(absolute);
    if (artifactStat.isSymbolicLink() || !artifactStat.isFile()) return false;
    const artifactRoot = fs.realpathSync(path.join(root, 'docs', 'acceptance', 'artifacts'));
    const artifactRealPath = fs.realpathSync(absolute);
    if (!artifactRealPath.startsWith(`${artifactRoot}${path.sep}`)) return false;
    if (!inspectHeadWorktree(trustedGit, root, [normalizedPath]).matches) return false;
    try {
      git(['ls-files', '--error-unmatch', '--', normalizedPath], {
        stdio: 'ignore',
      });
    } catch {
      return false;
    }
    const artifactDirty = git(['status', '--porcelain', '--', normalizedPath], {
      encoding: 'utf8',
    }).trim();
    if (artifactDirty) return false;
    const digest = sha256(fs.readFileSync(absolute));
    if (digest !== artifact.sha256) return false;
    if (artifact.kind === 'result') {
      try {
        const result = JSON.parse(fs.readFileSync(absolute, 'utf8'));
        const completedAt = Date.parse(result.completedAt ?? '');
        const environment = result.executionEnvironment;
        const expectedExecutionCommand = id === 'reconciled-e2e'
          ? `${process.execPath} scripts/run-reconciled-ecosystem-e2e.mjs`
          : declaredCommand;
        const currentToolchain = (() => {
          try {
            if (id === 'ios-app-ui') {
              return execFileSync('xcodebuild', ['-version'], {
                encoding: 'utf8',
                env: {
                  ...process.env,
                  DEVELOPER_DIR: '/Applications/Xcode.app/Contents/Developer',
                },
              }).trim();
            }
            if (id === 'android-app-ui') {
              const adb = path.join(
                process.env.ANDROID_HOME ?? `${process.env.HOME}/Library/Android/sdk`,
                'platform-tools',
                'adb',
              );
              return execFileSync(adb, ['version'], { encoding: 'utf8' }).trim();
            }
            return execFileSync(process.execPath, ['--version'], { encoding: 'utf8' }).trim();
          } catch {
            return null;
          }
        })();
        const sourceCommitExists = /^[a-f0-9]{40}$/u.test(result.sourceCommit ?? '') && (() => {
          try {
            git(['merge-base', '--is-ancestor', result.sourceCommit, 'HEAD'], {
              stdio: 'ignore',
            });
            return true;
          } catch {
            return false;
          }
        })();
        resultEvidenceFound =
          result.command === declaredCommand &&
          result.executionCommand === expectedExecutionCommand &&
          result.exitCode === 0 &&
          result.packageCommandSha256 === sha256(packageCommand) &&
          result.sourceTreeSha256 === sourceTreeSha256 &&
          result.sourceCommit === currentSourceCommit &&
          sourceCommitExists &&
          environment?.platform === process.platform &&
          environment?.architecture === process.arch &&
          environment?.node === process.version &&
          environment?.gitPath === trustedGit.executablePath &&
          environment?.gitSha256 === trustedGit.executableSha256 &&
          environment?.npmCliPath === npm.cliPath &&
          environment?.npmCliSha256 === npm.cliSha256 &&
          environment?.npmTreeSha256 === npm.npmTreeSha256 &&
          environment?.scriptShellPath === npm.scriptShellPath &&
          environment?.scriptShellSha256 === npm.scriptShellSha256 &&
          environment?.nodePath === npm.nodePath &&
          environment?.nodeSha256 === npm.nodeSha256 &&
          environment?.nodeKegSha256 === npm.nodeKegSha256 &&
          environment?.nodeRuntimeLibrariesSha256 === npm.nodeRuntimeLibrariesSha256 &&
          environment?.browserPath === npm.browserPath &&
          environment?.browserSha256 === npm.browserSha256 &&
          environment?.browserAppTreeSha256 === npm.browserAppTreeSha256 &&
          environment?.packageLockSha256 === npm.packageLockSha256 &&
          environment?.nodeModulesTreeSha256 === npm.nodeModulesTreeSha256 &&
          environment?.playwrightCliPath === npm.playwrightCliPath &&
          environment?.playwrightCliSha256 === npm.playwrightCliSha256 &&
          JSON.stringify(environment?.playwrightShim) === JSON.stringify(npm.playwrightShim) &&
          environment?.jestCliPath === npm.jestCliPath &&
          environment?.jestCliSha256 === npm.jestCliSha256 &&
          JSON.stringify(environment?.jestShim) === JSON.stringify(npm.jestShim) &&
          environment?.acceptanceDatabaseIdentity === npm.acceptanceDatabaseIdentity &&
          environment?.toolchain === currentToolchain &&
          result.executionEnvironmentSha256 === sha256(JSON.stringify(environment)) &&
          Number.isFinite(completedAt) &&
          new Date(completedAt).toISOString() === result.completedAt &&
          completedAt <= Date.now() + 60_000 &&
          completedAt >= Date.now() - 30 * 24 * 60 * 60 * 1000;
      } catch {
        return false;
      }
    }
    return true;
  });
  return artifactsValid && resultEvidenceFound;
};

const retirements = evidence.designRetirements ?? [];
const validRetirements = retirements.every(
  (item) =>
    typeof item?.file === 'string' &&
    typeof item?.ownerApprovalRef === 'string' &&
    item.ownerApprovalRef.length > 0 &&
    /^\d{4}-\d{2}-\d{2}T/u.test(item?.approvedAt ?? ''),
);
const retired = new Set(retirements.map((item) => normalize(item.file)));
const unresolvedMissingFiles = missingLinkedFiles.filter((name) => !retired.has(name));
const androidUi = scripts['android:ui'] ?? '';

const checks = [
  {
    id: 'canonical-master-prompt',
    pass: masterPrompt.length > 0,
    detail: 'Root CODEX_PROMPT.md exists.',
  },
  {
    id: 'master-prompt-honest-readiness',
    pass:
      masterPrompt.includes('Do not claim') &&
      masterPrompt.includes('XCUITest') &&
      masterPrompt.includes('reconciled ecosystem E2E'),
    detail: 'Prompt forbids readiness claims without native and reconciled E2E evidence.',
  },
  {
    id: 'durable-visual-acceptance-contract',
    pass: visualBaselinesAccepted && acceptedGate('visual', /^node scripts\/run-visual-acceptance\.mjs$/u),
    detail: 'Accepted visual command has committed, hash-verified baseline artifacts.',
  },
  {
    id: 'clean-design-evidence',
    pass: dirtyEvidence.length === 0 && evidenceHeadStatus.matches,
    detail: 'Tracked handoffs and the acceptance manifest exactly match HEAD without special index flags.',
  },
  {
    id: 'clean-source-tree',
    pass: dirtySourceTree.length === 0 && sourceHeadStatus.matches,
    detail: 'Tested source exactly matches HEAD, has no untracked changes or special index flags.',
  },
  {
    id: 'approved-design-retirements',
    pass: validRetirements,
    detail: 'Every retired handoff records an owner approval reference and timestamp.',
  },
  {
    id: 'web-api-gate',
    pass: Boolean(scripts['mvp:verify']),
    detail: 'Web/API MVP verification command exists.',
  },
  {
    id: 'native-build-gates',
    pass: Boolean(scripts['ios:build'] && scripts['android:build']),
    detail: 'iOS all-target and Android four-APK build commands exist.',
  },
  {
    id: 'ios-app-ui-gate',
    pass:
      /xcodebuild\s+test/u.test(scripts['ios:ui'] ?? '') &&
      /UITests/u.test(scripts['ios:ui'] ?? '') &&
      acceptedGate('ios-app-ui', /xcodebuild\s+test/u),
    detail: 'App-specific XCUITest command and hash-verified result evidence are accepted.',
  },
  {
    id: 'android-app-ui-gate',
    pass:
      ['app', 'staff', 'courier', 'pos'].every((module) =>
        androidUi.includes(`:${module}:connectedDebugAndroidTest`),
      ) && acceptedGate('android-app-ui', /connectedDebugAndroidTest/u),
    detail: 'All four packaged Android modules have connected-test evidence.',
  },
  {
    id: 'pos-refund-reconciliation-gate',
    pass:
      /playwright/u.test(scripts['ecosystem:pos-refund:e2e'] ?? '') &&
      acceptedGate('pos-refund-reconciliation', /playwright/u),
    detail: 'POS sale, customer return, approved refund and warehouse quarantine have hash-verified exact reconciliation evidence.',
  },
  {
    id: 'courier-cod-reconciliation-gate',
    pass:
      /playwright/u.test(scripts['ecosystem:courier-cod:e2e'] ?? '') &&
      acceptedGate('courier-cod-reconciliation', /playwright/u),
    detail: 'Web COD checkout, warehouse picking, courier delivery, cash handover and exact accounting/inventory reconciliation have hash-verified evidence.',
  },
  {
    id: 'service-loaner-reconciliation-gate',
    pass:
      scripts['ecosystem:service-loaner:e2e'] === serviceLoanerCommand &&
      acceptedGate('service-loaner-reconciliation', /^npm --prefix apps\/api test -- --runInBand test\/service-center\.e2e-spec\.ts test\/service-loaner\.e2e-spec\.ts test\/warranty-rbac\.e2e-spec\.ts && playwright test e2e\/service-center-ui\.spec\.ts$/u),
    detail: 'Warranty repair, paid service collection and loaner custody have hash-verified money, inventory and Event Ledger evidence.',
  },
  {
    id: 'procurement-sale-reconciliation-gate',
    pass:
      scripts['ecosystem:procurement-sale:e2e'] === procurementSaleCommand &&
      acceptedGate('procurement-sale-reconciliation', /^npm --prefix apps\/api test -- --runInBand test\/procurement\.e2e-spec\.ts && playwright test e2e\/ecosystem-procurement-sale\.spec\.ts$/u),
    detail: 'Partial procurement receiving, supplier liability, serialized stock and a subsequent POS sale have hash-verified exact reconciliation evidence.',
  },
  {
    id: 'reconciled-ecosystem-e2e',
    pass:
      scripts['ecosystem:e2e'] === reconciledE2eCommand &&
      reconciledProfileExact &&
      reconciledCommandsExact &&
      acceptedGate('reconciled-e2e', /^node scripts\/run-reconciled-ecosystem-e2e\.mjs$/u),
    detail: 'The exact four-vertical software matrix has fail-fast, hash-verified reconciliation evidence.',
  },
  {
    id: 'ecosystem-gate-discloses-native-limit',
    pass: ecosystemVerify.includes('XCUITest') && ecosystemVerify.includes('physical'),
    detail: 'Composite gate states what remains outside local software verification.',
  },
];

const report = {
  generatedAt: new Date().toISOString(),
  designCorpus: {
    tracked: trackedFiles.length,
    linked: linkedFiles.length,
    presentLinked: linkedFiles.length - missingLinkedFiles.length,
    missing: unresolvedMissingFiles.length,
    rawLinkOccurrences,
    presentLinkOccurrences,
    missingLinkOccurrences: rawLinkOccurrences - presentLinkOccurrences,
    impliedNamespace: new Set([...trackedFiles, ...linkedFiles]).size,
    missingFiles: unresolvedMissingFiles,
    retiredFiles: [...retired].sort((a, b) => a.localeCompare(b, 'ru')),
  },
  checks,
  blocking: [
    ...(unresolvedMissingFiles.length > 0
      ? [`${unresolvedMissingFiles.length} linked design handoffs are absent or not explicitly retired.`]
      : []),
    ...checks.filter((check) => !check.pass).map((check) => `${check.id}: ${check.detail}`),
  ],
};

if (json) {
  const serialized = `${JSON.stringify(report, null, 2)}\n`;
  if (outputPath) {
    const absoluteOutput = path.resolve(root, outputPath);
    fs.mkdirSync(path.dirname(absoluteOutput), { recursive: true });
    fs.writeFileSync(absoluteOutput, serialized);
  } else {
    process.stdout.write(serialized);
  }
} else {
  console.log('AliStore ecosystem contract audit');
  console.log(
    `Design corpus: ${report.designCorpus.tracked} tracked, ${report.designCorpus.linked} linked, ` +
      `${report.designCorpus.presentLinked} present, ${report.designCorpus.missing} missing.`,
  );
  console.log(
    `Link graph: ${report.designCorpus.rawLinkOccurrences} occurrences, ` +
      `${report.designCorpus.missingLinkOccurrences} broken, ${report.designCorpus.impliedNamespace} implied designs.`,
  );
  for (const check of checks) {
    console.log(`${check.pass ? 'PASS' : 'GAP '} ${check.id} - ${check.detail}`);
  }
  if (unresolvedMissingFiles.length > 0) {
    console.log('\nMissing linked handoffs:');
    for (const file of unresolvedMissingFiles) console.log(`- ${file}`);
  }
}

if (strict && report.blocking.length > 0) {
  console.error(`\nStrict ecosystem contract failed with ${report.blocking.length} blocker(s).`);
  process.exit(1);
}
