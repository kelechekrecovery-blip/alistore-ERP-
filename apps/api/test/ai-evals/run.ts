import { readFileSync } from 'node:fs';
import path from 'node:path';
import 'reflect-metadata';
import { CategorizeService } from '../../src/ai/categorize.service';
import { GradingService } from '../../src/ai/grading.service';
import { ModerationService } from '../../src/ai/moderation.service';
import { PriceScoutService } from '../../src/ai/price-scout.service';
import { DeviceGrade } from '../../src/ai/valuation';
import { resolveLlmClient } from '../../src/ai/llm/llm.factory';

/**
 * Offline AI evaluation harness (BACKLOG:20 — "add offline eval thresholds").
 *
 * Scores the configured AI providers against golden datasets and fails when a metric
 * drops below the threshold, so a provider/model/prompt change that regresses quality is
 * caught before release. Requires a provider key to evaluate the LLM path; with no key it
 * evaluates the keyless rule baseline. Kept OUT of the default Jest gate (it may call a
 * paid API and needs network) — run explicitly via `npm run ai:eval`.
 *
 * Modelled on Anthropic Cookbooks `misc/building_evals.ipynb`. Covers categorize, grade
 * and moderation (services with no DB deps). describe is intentionally excluded — it needs
 * Prisma and is largely templated.
 */

const THRESHOLD = Number(process.env.AI_EVAL_MIN_ACCURACY ?? '0.85');
const PROVIDER = resolveLlmClient()?.source ?? 'rules (no key)';

function read<T>(file: string): T {
  return JSON.parse(readFileSync(path.join(__dirname, file), 'utf8')) as T;
}

/** Print one eval's metric + misses; return whether it clears the threshold. */
function report(label: string, correct: number, total: number, misses: string[]): boolean {
  const accuracy = total === 0 ? 1 : correct / total;
  console.log(`\n[${label}] provider=${PROVIDER}`);
  console.log(`  accuracy: ${(accuracy * 100).toFixed(1)}% (${correct}/${total}), threshold ${(THRESHOLD * 100).toFixed(0)}%`);
  if (misses.length) console.log(misses.join('\n'));
  return accuracy >= THRESHOLD;
}

interface CategorizeCase {
  name: string;
  attrs?: Record<string, unknown>;
  expected: string;
}

async function runCategorizeEval(): Promise<boolean> {
  const dataset = read<CategorizeCase[]>('dataset.categorize.json');
  const service = new CategorizeService();
  let correct = 0;
  const misses: string[] = [];
  for (const c of dataset) {
    const got = await service.suggest(c.name, c.attrs ?? {});
    if (got.category === c.expected) correct += 1;
    else misses.push(`  ✗ "${c.name}" → ${got.category} (expected ${c.expected})`);
  }
  return report('categorize', correct, dataset.length, misses);
}

interface GradeCase {
  labels: string[];
  observedDefects?: string[];
  claimedGrade?: DeviceGrade;
  expected: DeviceGrade;
}

async function runGradeEval(): Promise<boolean> {
  const dataset = read<GradeCase[]>('dataset.grade.json');
  const service = new GradingService();
  let correct = 0;
  const misses: string[] = [];
  for (const c of dataset) {
    const got = await service.grade({
      photos: c.labels.map((label) => ({ label })),
      observedDefects: c.observedDefects,
      claimedGrade: c.claimedGrade,
    });
    if (got.grade === c.expected) correct += 1;
    else misses.push(`  ✗ [${c.labels.join(', ')}] → ${got.grade} (expected ${c.expected})`);
  }
  return report('grade', correct, dataset.length, misses);
}

interface ModerationCase {
  text: string;
  expectedAllowed: boolean;
}

async function runModerationEval(): Promise<boolean> {
  const dataset = read<ModerationCase[]>('dataset.moderation.json');
  const service = new ModerationService();
  let correct = 0;
  const misses: string[] = [];
  for (const c of dataset) {
    const got = await service.moderate(c.text);
    if (got.allowed === c.expectedAllowed) correct += 1;
    else misses.push(`  ✗ "${c.text}" → allowed=${got.allowed} (expected ${c.expectedAllowed})`);
  }
  return report('moderation', correct, dataset.length, misses);
}

interface PriceScoutCase {
  name: string;
  basePrice: number;
  observedListings?: { price: number }[];
  expectedPrice: number;
  tolerance?: number;
}

async function runPriceScoutEval(): Promise<boolean> {
  const dataset = read<PriceScoutCase[]>('dataset.price-scout.json');
  const service = new PriceScoutService({} as never); // inline cases (no sku) never touch Prisma
  let correct = 0;
  const misses: string[] = [];
  for (const c of dataset) {
    const got = await service.scout({ name: c.name, basePrice: c.basePrice, observedListings: c.observedListings });
    const off = Math.abs(got.recommendedPrice - c.expectedPrice) / c.expectedPrice;
    if (off <= (c.tolerance ?? 0.15)) correct += 1;
    else misses.push(`  ✗ "${c.name}" → ${got.recommendedPrice} (expected ≈${c.expectedPrice}, off ${(off * 100).toFixed(1)}%)`);
  }
  return report('price-scout', correct, dataset.length, misses);
}

async function main() {
  console.log('AliStore AI evals');
  const results = [await runCategorizeEval(), await runGradeEval(), await runModerationEval(), await runPriceScoutEval()];
  const passed = results.every(Boolean);
  console.log(passed ? '\nRESULT: PASS' : '\nRESULT: FAIL');
  process.exit(passed ? 0 : 1);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
