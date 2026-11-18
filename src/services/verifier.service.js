import { detect } from './detector.service.js';
import { AppleAdapter } from '../adapters/apple.adapter.js';
import { RokuAdapter } from '../adapters/roku.adapter.js';
import { AmazonAdapter } from '../adapters/amazon.adapter.js';
import { SamsungAdapter } from '../adapters/samsung.adapter.js';
import { LGAdapter } from '../adapters/lg.adapter.js';
import { createResult, Status } from '../models/result.js';
import { matches } from '../utils/compare.js';
import { config } from '../config.js';
import { logger } from '../utils/logger.js';

const CACHE_TTL_MS = 10 * 60 * 1000; // 10 minutes
const cache = new Map();

const adapters = Object.fromEntries(
  [new AppleAdapter(), new RokuAdapter(), new AmazonAdapter(), new SamsungAdapter(), new LGAdapter()].map(
    (a) => [a.platform, a]
  )
);

async function run({ url, expectedName, expectedDeveloper }) {
  const info = detect(url || '');
  const base = { url, platform: info.platform, appId: info.appId };

  if (info.platform === 'invalid') return createResult({ ...base, status: Status.BROKEN, notes: 'Invalid URL' });
  if (info.platform === 'unsupported') {
    return createResult({ ...base, status: Status.REVIEW, notes: 'Unsupported store domain' });
  }

  try {
    const out = await adapters[info.platform].verify(url, info);
    const result = createResult({ ...base, ...out });

    if (result.status === Status.VERIFIED) {
      const problems = [];
      if (!matches(result.appName, expectedName)) problems.push(`name differs (expected "${expectedName}")`);
      if (!matches(result.developer, expectedDeveloper)) {
        problems.push(`developer differs (expected "${expectedDeveloper}")`);
      }
      if (problems.length) {
        result.status = Status.MISMATCH;
        result.notes = [result.notes, ...problems].filter(Boolean).join('; ');
      }
    }
    return result;
  } catch (err) {
    logger.warn('verify failed', url, err.message);
    return createResult({ ...base, status: Status.REVIEW, notes: `Check failed: ${err.message}` });
  }
}

// Wraps run(): serves recent answers from cache and records how long the check took.
export async function verifyOne(input) {
  const key = `${(input.url || '').trim()}|${input.expectedName || ''}|${input.expectedDeveloper || ''}`;
  const t0 = performance.now();

  const hit = cache.get(key);
  if (hit && Date.now() - hit.at < CACHE_TTL_MS) {
    const result = {
      ...hit.result,
      notes: [hit.result.notes, 'cached result'].filter(Boolean).join('; '),
      durationMs: Math.round(performance.now() - t0),
      checkedAt: new Date().toISOString(),
    };
    logger.info(`[timing] ${result.platform} ${result.status} from cache in ${result.durationMs} ms`);
    return result;
  }

  const result = await run(input);
  result.durationMs = Math.round(performance.now() - t0);
  logger.info(`[timing] ${result.platform} ${result.status} in ${result.durationMs} ms`);

  // Only remember definite answers, never "Needs Review" (blocked or failed checks should retry)
  if (result.status !== Status.REVIEW) cache.set(key, { at: Date.now(), result });
  return result;
}

// Runs items through verifyOne with a concurrency limit, preserving order.
export async function verifyBatch(items) {
  const results = new Array(items.length);
  let next = 0;
  const worker = async () => {
    while (next < items.length) {
      const i = next++;
      results[i] = await verifyOne(items[i]);
    }
  };
  await Promise.all(Array.from({ length: Math.min(config.concurrency, items.length) }, worker));
  return results;
}