/**
 * Prompt Enhancer proxy.
 *
 * Receives { prompt: string, style?: StyleId, customBrief?: string } from the
 * extension, calls OpenAI (or OpenRouter if its key is set), returns
 * { enhanced: string }. The provider key lives as a Wrangler secret so it
 * never reaches the client.
 *
 * The `style` field is OPTIONAL — when omitted, defaults to `auto` (the
 * original behavior), so older extension builds keep working unchanged.
 *
 * Rate limiting: simple in-memory per-IP sliding window (per Worker isolate).
 * Cloudflare assigns requests from the same IP to the same isolate most of
 * the time but not always — for stricter limits use Cloudflare's WAF / Rate
 * Limit rules in the dashboard. The in-memory window is best-effort.
 */

export interface Env {
  OPENAI_API_KEY?: string;
  OPENROUTER_API_KEY?: string;
  ALLOWED_EXTENSION_IDS?: string;
  RATE_LIMIT_PER_HOUR?: string;
}

const OPENAI_URL = 'https://api.openai.com/v1/chat/completions';
const OPENROUTER_URL = 'https://openrouter.ai/api/v1/chat/completions';
const OPENAI_MODEL = 'gpt-4o-mini';
const OPENROUTER_MODEL = 'openai/gpt-4o-mini';

const MIN_INPUT = 3;
const MAX_INPUT = 8000;
const MAX_OUTPUT_TOKENS = 1024;
const RATE_WINDOW_MS = 60 * 60 * 1000;
const MAX_CUSTOM_BRIEF = 200;

type StyleId = 'auto' | 'concise' | 'detailed' | 'code' | 'academic' | 'marketing';

const BASE_RULES = `Rules:
- Preserve the user's original intent exactly. Do not invent new requirements.
- Make the goal explicit. Add a brief role or context if it improves clarity.
- Specify the desired output format (length, structure, tone) when reasonable.
- Break complex requests into numbered steps or bullet points.
- Remove vagueness, filler, and ambiguity.
- If the input is already clear, specific, and well-structured, return it nearly verbatim — do NOT rewrite for the sake of rewriting. Small polish only.
- Output only the rewritten prompt. No preamble, no explanation, no markdown code fences.`;

const STYLE_PROMPTS: Record<StyleId, string> = {
  auto: `You are a prompt engineering assistant. Your job is to rewrite the user's rough prompt into a clear, structured, highly effective prompt for a large language model.\n\n${BASE_RULES}`,
  concise: `You are a prompt engineering assistant. Rewrite the user's prompt to be as concise and clear as possible. Strip all filler. Target under 60 words. Keep only what is essential to convey intent.\n\n${BASE_RULES}`,
  detailed: `You are a prompt engineering assistant. Rewrite the user's prompt with maximum structure: explicit role, audience, success criteria, desired format, and step-by-step expectations where helpful. Aim for a thorough, complete brief.\n\n${BASE_RULES}`,
  code: `You are a prompt engineering assistant specializing in software development prompts. Rewrite the user's prompt to include: target language/runtime/framework, expected input and output, edge cases to handle, and whether examples or tests are wanted. Be precise about technical constraints.\n\n${BASE_RULES}`,
  academic: `You are a prompt engineering assistant for academic and research work. Rewrite the user's prompt with a formal, precise tone. Define key terms, request citations or evidence where relevant, specify the discipline and expected depth.\n\n${BASE_RULES}`,
  marketing: `You are a prompt engineering assistant for marketing and copywriting. Rewrite the user's prompt to specify: target audience, tone (e.g. playful, authoritative), call-to-action, and channel (e.g. tweet, landing page, email subject).\n\n${BASE_RULES}`,
};

const VALID_STYLES = new Set<StyleId>([
  'auto',
  'concise',
  'detailed',
  'code',
  'academic',
  'marketing',
]);

function isValidStyle(v: unknown): v is StyleId {
  return typeof v === 'string' && VALID_STYLES.has(v as StyleId);
}

// Allow a short user-provided brief to nudge the style. Stays out of the
// system prompt — appended to the user message — so it can't override
// our instructions or escalate privileges.
function hasControlChars(s: string): boolean {
  for (let i = 0; i < s.length; i++) {
    const c = s.charCodeAt(i);
    if (c < 0x20 || c === 0x7f) return true;
  }
  return false;
}

function sanitizeCustomBrief(v: unknown): string | null {
  if (typeof v !== 'string') return null;
  const trimmed = v.trim();
  if (trimmed.length === 0) return null;
  if (trimmed.length > MAX_CUSTOM_BRIEF) return null;
  if (hasControlChars(trimmed)) return null;
  return trimmed;
}

// Per-isolate sliding window. Memory resets when the isolate recycles.
const ipBuckets = new Map<string, number[]>();

function corsHeaders(origin: string | null): Record<string, string> {
  return {
    'Access-Control-Allow-Origin': origin ?? '*',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Max-Age': '86400',
    Vary: 'Origin',
  };
}

function json(
  body: unknown,
  status: number,
  origin: string | null,
  extra: Record<string, string> = {}
): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json', ...corsHeaders(origin), ...extra },
  });
}

function originAllowed(origin: string | null, env: Env): boolean {
  const allowed = (env.ALLOWED_EXTENSION_IDS ?? '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
  if (allowed.length === 0) return true; // open during development
  if (!origin) return false;
  // Origins look like "chrome-extension://<id>"
  return allowed.some((id) => origin === `chrome-extension://${id}`);
}

function checkRate(ip: string, limit: number): { allowed: boolean; remaining: number } {
  const now = Date.now();
  const cutoff = now - RATE_WINDOW_MS;
  const bucket = (ipBuckets.get(ip) ?? []).filter((t) => t > cutoff);
  if (bucket.length >= limit) {
    ipBuckets.set(ip, bucket);
    return { allowed: false, remaining: 0 };
  }
  bucket.push(now);
  ipBuckets.set(ip, bucket);
  return { allowed: true, remaining: Math.max(0, limit - bucket.length) };
}

interface ChatResponse {
  choices?: Array<{ message?: { content?: string } }>;
  error?: { message?: string };
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const origin = request.headers.get('Origin');

    if (request.method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: corsHeaders(origin) });
    }

    const url = new URL(request.url);
    if (url.pathname === '/health') {
      return json({ ok: true }, 200, origin);
    }

    if (request.method !== 'POST' || url.pathname !== '/enhance') {
      return json({ error: 'not_found' }, 404, origin);
    }

    if (!originAllowed(origin, env)) {
      return json({ error: 'origin_not_allowed' }, 403, origin);
    }

    const ip = request.headers.get('CF-Connecting-IP') ?? 'unknown';
    const limit = Number(env.RATE_LIMIT_PER_HOUR ?? '30') || 30;
    const rate = checkRate(ip, limit);
    if (!rate.allowed) {
      return json({ error: 'rate_limited', message: 'Hourly limit reached.' }, 429, origin);
    }

    let body: { prompt?: unknown; style?: unknown; customBrief?: unknown };
    try {
      body = (await request.json()) as typeof body;
    } catch {
      return json({ error: 'invalid_json' }, 400, origin);
    }
    const prompt = typeof body.prompt === 'string' ? body.prompt.trim() : '';
    if (prompt.length < MIN_INPUT) return json({ error: 'too_short' }, 400, origin);
    if (prompt.length > MAX_INPUT) return json({ error: 'too_long' }, 400, origin);

    // Style is optional; missing means 'auto'. Invalid means 400 (don't fail open).
    let style: StyleId = 'auto';
    if (body.style !== undefined) {
      if (!isValidStyle(body.style)) {
        return json({ error: 'invalid_style' }, 400, origin);
      }
      style = body.style;
    }
    const systemPrompt = STYLE_PROMPTS[style];

    // Optional custom brief — strict sanitization, appended to user message.
    const customBrief = sanitizeCustomBrief(body.customBrief);
    const userMessage = customBrief ? `${prompt}\n\n(Style note: ${customBrief})` : prompt;

    const useOpenRouter = !!env.OPENROUTER_API_KEY;
    const apiKey = env.OPENROUTER_API_KEY ?? env.OPENAI_API_KEY;
    if (!apiKey) {
      return json({ error: 'server_misconfigured' }, 500, origin);
    }
    const providerUrl = useOpenRouter ? OPENROUTER_URL : OPENAI_URL;
    const model = useOpenRouter ? OPENROUTER_MODEL : OPENAI_MODEL;
    const extraHeaders: Record<string, string> = useOpenRouter
      ? {
          'HTTP-Referer': 'https://prompt-enhancer.local',
          'X-Title': 'Prompt Enhancer',
        }
      : {};

    let upstream: Response;
    try {
      upstream = await fetch(providerUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${apiKey}`,
          ...extraHeaders,
        },
        body: JSON.stringify({
          model,
          temperature: 0.4,
          max_tokens: MAX_OUTPUT_TOKENS,
          messages: [
            { role: 'system', content: systemPrompt },
            { role: 'user', content: userMessage },
          ],
        }),
      });
    } catch {
      return json({ error: 'upstream_network' }, 502, origin);
    }

    if (upstream.status === 401) return json({ error: 'upstream_unauthorized' }, 502, origin);
    if (upstream.status === 429) return json({ error: 'upstream_rate_limited' }, 429, origin);
    if (upstream.status >= 500) return json({ error: 'upstream_server' }, 502, origin);
    if (!upstream.ok) {
      return json({ error: 'upstream_unexpected', status: upstream.status }, 502, origin);
    }

    const data = (await upstream.json()) as ChatResponse;
    const enhanced = data.choices?.[0]?.message?.content?.trim();
    if (!enhanced) return json({ error: 'empty_response' }, 502, origin);

    return json({ enhanced, remaining: rate.remaining, style }, 200, origin);
  },
};
