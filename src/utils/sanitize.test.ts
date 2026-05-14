import { describe, expect, it } from 'vitest';
import { LIMITS } from './constants';
import { escapeForApi, stripHtml, validateLength } from './sanitize';

describe('validateLength', () => {
  it('accepts a normal-length prompt and returns the trimmed value', () => {
    const r = validateLength('  write a blog post about cats  ');
    expect(r.ok).toBe(true);
    expect(r.value).toBe('write a blog post about cats');
    expect(r.reason).toBeUndefined();
  });

  it('rejects an empty string', () => {
    const r = validateLength('');
    expect(r.ok).toBe(false);
    expect(r.reason).toMatch(/too short/i);
  });

  it('rejects whitespace-only input (after trim it is empty)', () => {
    const r = validateLength('   \n\t  ');
    expect(r.ok).toBe(false);
    expect(r.reason).toMatch(/too short/i);
  });

  it('rejects input shorter than MIN_INPUT_CHARS', () => {
    const r = validateLength('ab');
    expect(r.ok).toBe(false);
  });

  it('accepts input exactly at MIN_INPUT_CHARS (lower boundary)', () => {
    const r = validateLength('a'.repeat(LIMITS.MIN_INPUT_CHARS));
    expect(r.ok).toBe(true);
  });

  it('accepts input exactly at MAX_INPUT_CHARS (upper boundary)', () => {
    const r = validateLength('a'.repeat(LIMITS.MAX_INPUT_CHARS));
    expect(r.ok).toBe(true);
  });

  it('rejects input one char over MAX_INPUT_CHARS', () => {
    const r = validateLength('a'.repeat(LIMITS.MAX_INPUT_CHARS + 1));
    expect(r.ok).toBe(false);
    expect(r.reason).toMatch(/exceeds/i);
  });

  it('reports the configured max in its rejection reason', () => {
    const r = validateLength('a'.repeat(LIMITS.MAX_INPUT_CHARS + 100));
    expect(r.reason).toContain(String(LIMITS.MAX_INPUT_CHARS));
  });
});

describe('stripHtml', () => {
  it('removes simple tags', () => {
    expect(stripHtml('<b>hello</b> world')).toBe('hello world');
  });

  it('collapses whitespace', () => {
    expect(stripHtml('a    b\n\n  c')).toBe('a b c');
  });

  it('leaves plain text untouched (except trim)', () => {
    expect(stripHtml('  plain text  ')).toBe('plain text');
  });
});

describe('escapeForApi', () => {
  it('escapes backslashes and quotes', () => {
    expect(escapeForApi('he said "hi" \\\\')).toBe('he said \\"hi\\" \\\\\\\\');
  });

  it('escapes newlines and tabs', () => {
    expect(escapeForApi('a\nb\tc')).toBe('a\\nb\\tc');
  });
});
