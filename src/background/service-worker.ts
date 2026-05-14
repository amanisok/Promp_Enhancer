/**
 * Background service worker. Owns rate limiting and usage stats. State lives in
 * chrome.storage.local — service workers are ephemeral and may be terminated.
 */

import { LIMITS, MESSAGES, STORAGE_KEYS } from '../utils/constants';
import { storageGet, storageSet } from '../utils/storage';

interface RateCheckResponse {
  allowed: boolean;
  used: number;
  limit: number;
  resetMs: number;
}

interface UsageStatsResponse {
  used: number;
  limit: number;
  windowMs: number;
  resetMs: number;
}

async function getTimestamps(): Promise<number[]> {
  const arr = await storageGet<number[]>(STORAGE_KEYS.USAGE_TIMESTAMPS);
  return Array.isArray(arr) ? arr : [];
}

function pruneExpired(ts: number[], now: number): number[] {
  const cutoff = now - LIMITS.RATE_LIMIT_WINDOW_MS;
  return ts.filter((t) => t > cutoff);
}

async function rateCheck(): Promise<RateCheckResponse> {
  const now = Date.now();
  const ts = pruneExpired(await getTimestamps(), now);
  await storageSet(STORAGE_KEYS.USAGE_TIMESTAMPS, ts);
  const used = ts.length;
  const allowed = used < LIMITS.RATE_LIMIT_PER_HOUR;
  const oldest = ts[0] ?? now;
  const resetMs = Math.max(0, oldest + LIMITS.RATE_LIMIT_WINDOW_MS - now);
  return { allowed, used, limit: LIMITS.RATE_LIMIT_PER_HOUR, resetMs };
}

async function incrementUsage(): Promise<{ ok: boolean }> {
  const now = Date.now();
  const ts = pruneExpired(await getTimestamps(), now);
  ts.push(now);
  await storageSet(STORAGE_KEYS.USAGE_TIMESTAMPS, ts);
  return { ok: true };
}

async function getUsageStats(): Promise<UsageStatsResponse> {
  const now = Date.now();
  const ts = pruneExpired(await getTimestamps(), now);
  const used = ts.length;
  const oldest = ts[0] ?? now;
  const resetMs = used >= LIMITS.RATE_LIMIT_PER_HOUR
    ? Math.max(0, oldest + LIMITS.RATE_LIMIT_WINDOW_MS - now)
    : 0;
  return {
    used,
    limit: LIMITS.RATE_LIMIT_PER_HOUR,
    windowMs: LIMITS.RATE_LIMIT_WINDOW_MS,
    resetMs,
  };
}

async function resetUsage(): Promise<{ ok: boolean }> {
  await storageSet(STORAGE_KEYS.USAGE_TIMESTAMPS, []);
  return { ok: true };
}

chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  const handle = async (): Promise<unknown> => {
    switch (msg?.type) {
      case MESSAGES.CHECK_RATE_LIMIT:
        return rateCheck();
      case MESSAGES.INCREMENT_USAGE:
        return incrementUsage();
      case MESSAGES.GET_USAGE_STATS:
        return getUsageStats();
      case MESSAGES.RESET_USAGE:
        return resetUsage();
      default:
        return { error: 'unknown_message' };
    }
  };
  handle().then(sendResponse).catch((err) => sendResponse({ error: String(err) }));
  return true;
});
