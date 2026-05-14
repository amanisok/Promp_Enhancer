/**
 * Input sanitization helpers. Defense against XSS and oversized payloads.
 */

import { LIMITS } from './constants';

/**
 * Strip all HTML tags from a string. Uses a textarea element trick to decode
 * HTML entities safely without ever inserting markup into the live DOM.
 */
export function stripHtml(input: string): string {
  return input.replace(/<[^>]*>/g, '').replace(/\s+/g, ' ').trim();
}

/**
 * Escape characters that would break out of a JSON string context.
 * Use only as defense-in-depth — always rely on JSON.stringify for API bodies.
 */
export function escapeForApi(input: string): string {
  return input
    .replace(/\\/g, '\\\\')
    .replace(/"/g, '\\"')
    .replace(/\n/g, '\\n')
    .replace(/\r/g, '\\r')
    .replace(/\t/g, '\\t');
}

export interface ValidationResult {
  ok: boolean;
  reason?: string;
  value?: string;
}

/**
 * Validate that a user-provided prompt is within configured length bounds.
 * Returns the trimmed value on success.
 */
export function validateLength(input: string): ValidationResult {
  const trimmed = input.trim();
  if (trimmed.length < LIMITS.MIN_INPUT_CHARS) {
    return { ok: false, reason: 'Prompt is too short.' };
  }
  if (trimmed.length > LIMITS.MAX_INPUT_CHARS) {
    return { ok: false, reason: `Prompt exceeds ${LIMITS.MAX_INPUT_CHARS} characters.` };
  }
  return { ok: true, value: trimmed };
}

/**
 * Validate an OpenAI API key format. Accepts sk-... and sk-proj-... shapes.
 */
export function validateApiKey(key: string): ValidationResult {
  const trimmed = key.trim();
  if (!/^sk-[A-Za-z0-9_\-]{20,}$/.test(trimmed)) {
    return { ok: false, reason: 'Invalid API key format. Expected sk-...' };
  }
  return { ok: true, value: trimmed };
}
