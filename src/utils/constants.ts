/**
 * Application-wide constants. Never hardcode these values elsewhere.
 */

/**
 * Proxy URL. Injected at build time via esbuild's `define` from `process.env.PROXY_URL`.
 * Set it in your shell before building:
 *   PROXY_URL='https://my-worker.workers.dev/enhance' npm run build:prod
 *
 * Falls back to a placeholder so unset builds fail loudly instead of silently
 * pointing at someone else's Worker. Deploy your own Worker first — see proxy/README.md.
 */
declare const process: { env: { PROXY_URL?: string } };
export const PROXY_URL: string =
  process.env.PROXY_URL ?? 'https://YOUR-WORKER-SUBDOMAIN.workers.dev/enhance';

export const LIMITS = {
  MAX_INPUT_CHARS: 8000,
  MIN_INPUT_CHARS: 3,
  MAX_OUTPUT_TOKENS: 1024,
  RATE_LIMIT_PER_HOUR: 20,
  RATE_LIMIT_WINDOW_MS: 60 * 60 * 1000,
  REQUEST_TIMEOUT_MS: 30000,
  RETRY_MAX_ATTEMPTS: 3,
  RETRY_BASE_DELAY_MS: 600,
} as const;

export const STORAGE_KEYS = {
  USAGE_TIMESTAMPS: 'pe_usage_ts',
} as const;

export const MESSAGES = {
  CHECK_RATE_LIMIT: 'checkRateLimit',
  INCREMENT_USAGE: 'incrementUsage',
  GET_USAGE_STATS: 'getUsageStats',
  RESET_USAGE: 'resetUsage',
} as const;

export const SYSTEM_PROMPT = `You are a prompt engineering assistant. Your job is to rewrite the user's rough prompt into a clear, structured, highly effective prompt for a large language model.

Rules:
- Preserve the user's original intent exactly. Do not invent new requirements.
- Make the goal explicit. Add a brief role or context if it improves clarity.
- Specify the desired output format (length, structure, tone) when reasonable.
- Break complex requests into numbered steps or bullet points.
- Remove vagueness, filler, and ambiguity.
- If the input is already clear, specific, and well-structured, return it nearly verbatim — do NOT rewrite for the sake of rewriting. Small polish only.
- Output only the rewritten prompt. No preamble, no explanation, no markdown code fences.`;

export const PE_CLASS = {
  BUTTON: 'pe-enhance-btn',
  BUTTON_LOADING: 'pe-enhance-btn--loading',
  BUTTON_DISABLED: 'pe-enhance-btn--disabled',
  MODAL_OVERLAY: 'pe-modal-overlay',
  MODAL_CARD: 'pe-modal-card',
  ROOT: 'pe-root',
} as const;
