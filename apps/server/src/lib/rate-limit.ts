/**
 * Rate limit em memória (processo único, 5 pessoas — Redis seria overkill).
 * Chave: IP do cliente. Bloqueia por WINDOW_MS após MAX_ATTEMPTS falhas.
 */

const WINDOW_MS = 15 * 60 * 1000;
const MAX_ATTEMPTS = 10;

type Bucket = { failures: number; firstFailureAt: number; blockedUntil: number };

const buckets = new Map<string, Bucket>();

function now(): number {
  return Date.now();
}

function bucketFor(key: string): Bucket {
  const existing = buckets.get(key);
  if (existing && now() - existing.firstFailureAt > WINDOW_MS && existing.blockedUntil <= now()) {
    buckets.delete(key);
  }

  const bucket = buckets.get(key);
  if (bucket) return bucket;

  const fresh: Bucket = { failures: 0, firstFailureAt: now(), blockedUntil: 0 };
  buckets.set(key, fresh);
  return fresh;
}

export type RateLimitState = { allowed: true } | { allowed: false; retryAfterSec: number };

export function checkRateLimit(key: string): RateLimitState {
  const bucket = bucketFor(key);
  const blockedFor = bucket.blockedUntil - now();

  if (blockedFor > 0) {
    return { allowed: false, retryAfterSec: Math.ceil(blockedFor / 1000) };
  }

  return { allowed: true };
}

export function recordFailure(key: string): void {
  const bucket = bucketFor(key);
  bucket.failures += 1;

  if (bucket.failures >= MAX_ATTEMPTS) {
    bucket.blockedUntil = now() + WINDOW_MS;
    bucket.failures = 0;
    bucket.firstFailureAt = now();
  }
}

export function recordSuccess(key: string): void {
  buckets.delete(key);
}

/** Limpeza periódica para não vazar memória. */
setInterval(() => {
  const cutoff = now() - WINDOW_MS * 2;
  for (const [key, bucket] of buckets) {
    if (bucket.firstFailureAt < cutoff && bucket.blockedUntil < now()) buckets.delete(key);
  }
}, WINDOW_MS).unref();
