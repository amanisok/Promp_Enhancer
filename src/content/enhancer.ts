/**
 * Enhancement service. Calls the Cloudflare Worker proxy which holds the
 * upstream API key. The extension itself never sees the key.
 */

import { LIMITS, MESSAGES, PROXY_URL } from '../utils/constants';
import { validateLength } from '../utils/sanitize';

export type EnhancerErrorCode =
  | 'INVALID_INPUT'
  | 'RATE_LIMITED'
  | 'PROXY_MISCONFIGURED'
  | 'SERVER_ERROR'
  | 'NETWORK'
  | 'TIMEOUT'
  | 'EMPTY_RESPONSE'
  | 'UNKNOWN';

export class EnhancerError extends Error {
  public readonly code: EnhancerErrorCode;
  constructor(code: EnhancerErrorCode, message: string) {
    super(message);
    this.name = 'EnhancerError';
    this.code = code;
  }
}

interface ProxyResponse {
  enhanced?: string;
  remaining?: number;
  error?: string;
  message?: string;
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

async function checkRateLimit(): Promise<void> {
  const res = await chrome.runtime.sendMessage({ type: MESSAGES.CHECK_RATE_LIMIT });
  if (!res?.allowed) {
    throw new EnhancerError(
      'RATE_LIMITED',
      `Hourly limit reached (${LIMITS.RATE_LIMIT_PER_HOUR}/hr). Try again later.`
    );
  }
}

async function recordUsage(): Promise<void> {
  await chrome.runtime.sendMessage({ type: MESSAGES.INCREMENT_USAGE });
}

async function callProxy(userPrompt: string): Promise<string> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), LIMITS.REQUEST_TIMEOUT_MS);

  let response: Response;
  try {
    response = await fetch(PROXY_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ prompt: userPrompt }),
      signal: controller.signal,
    });
  } catch (err) {
    clearTimeout(timer);
    if ((err as Error).name === 'AbortError') {
      throw new EnhancerError('TIMEOUT', 'Request timed out.');
    }
    throw new EnhancerError('NETWORK', 'Could not reach the enhancer service.');
  }
  clearTimeout(timer);

  let data: ProxyResponse;
  try {
    data = (await response.json()) as ProxyResponse;
  } catch {
    throw new EnhancerError('SERVER_ERROR', 'Bad response from enhancer service.');
  }

  if (response.status === 429) {
    throw new EnhancerError(
      'RATE_LIMITED',
      data.message ?? 'Service is busy. Try again shortly.'
    );
  }
  if (response.status === 500 && data.error === 'server_misconfigured') {
    throw new EnhancerError(
      'PROXY_MISCONFIGURED',
      'The enhancer service is not configured. Contact the extension owner.'
    );
  }
  if (response.status >= 500) {
    throw new EnhancerError('SERVER_ERROR', 'Enhancer service is having trouble.');
  }
  if (!response.ok) {
    throw new EnhancerError('UNKNOWN', data.message ?? `Unexpected status ${response.status}.`);
  }
  if (!data.enhanced) {
    throw new EnhancerError('EMPTY_RESPONSE', 'No content returned.');
  }
  return data.enhanced;
}

function isRetryable(err: unknown): boolean {
  if (!(err instanceof EnhancerError)) return false;
  return err.code === 'NETWORK' || err.code === 'TIMEOUT' || err.code === 'SERVER_ERROR';
}

/**
 * Enhance a rough prompt into a structured, effective prompt.
 * Throws EnhancerError on any failure.
 */
export async function enhancePrompt(raw: string): Promise<string> {
  const v = validateLength(raw);
  if (!v.ok || !v.value) {
    throw new EnhancerError('INVALID_INPUT', v.reason ?? 'Invalid input.');
  }

  await checkRateLimit();

  let lastError: unknown;
  for (let attempt = 0; attempt < LIMITS.RETRY_MAX_ATTEMPTS; attempt++) {
    try {
      const result = await callProxy(v.value);
      await recordUsage();
      return result;
    } catch (err) {
      lastError = err;
      if (!isRetryable(err) || attempt === LIMITS.RETRY_MAX_ATTEMPTS - 1) {
        throw err;
      }
      const delay = LIMITS.RETRY_BASE_DELAY_MS * Math.pow(2, attempt);
      await sleep(delay);
    }
  }

  throw lastError instanceof EnhancerError
    ? lastError
    : new EnhancerError('UNKNOWN', 'Unknown error during enhancement.');
}
