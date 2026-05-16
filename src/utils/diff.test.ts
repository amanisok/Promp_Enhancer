import { describe, expect, it } from 'vitest';
import { wordDiff } from './diff';

describe('wordDiff', () => {
  it('returns all-eq for identical input', () => {
    const r = wordDiff('hello world', 'hello world');
    expect(r).not.toBeNull();
    expect(r!.every((t) => t.op === 'eq')).toBe(true);
    expect(r!.map((t) => t.text).join('')).toBe('hello world');
  });

  it('handles pure insertion at the end', () => {
    const r = wordDiff('hello', 'hello world')!;
    expect(r.some((t) => t.op === 'ins')).toBe(true);
    expect(r.some((t) => t.op === 'eq')).toBe(true);
    expect(r.find((t) => t.op === 'ins')?.text).toMatch(/world/);
  });

  it('handles pure deletion at the end', () => {
    const r = wordDiff('hello world', 'hello')!;
    expect(r.some((t) => t.op === 'del')).toBe(true);
    expect(r.find((t) => t.op === 'del')?.text).toMatch(/world/);
  });

  it('handles replacement as del + ins', () => {
    const r = wordDiff('the quick brown fox', 'the quick red fox')!;
    expect(r.some((t) => t.op === 'del' && /brown/.test(t.text))).toBe(true);
    expect(r.some((t) => t.op === 'ins' && /red/.test(t.text))).toBe(true);
  });

  it('returns empty array for two empty inputs', () => {
    expect(wordDiff('', '')).toEqual([]);
  });

  it('returns a single ins token when original is empty', () => {
    const r = wordDiff('', 'brand new text')!;
    expect(r).toHaveLength(1);
    expect(r[0].op).toBe('ins');
  });

  it('returns a single del token when enhanced is empty', () => {
    const r = wordDiff('removed completely', '')!;
    expect(r).toHaveLength(1);
    expect(r[0].op).toBe('del');
  });

  it('merges adjacent tokens of the same op', () => {
    // Inserting two new words at the start should produce ONE ins token, not two.
    const r = wordDiff('end', 'start middle end')!;
    const insTokens = r.filter((t) => t.op === 'ins');
    expect(insTokens).toHaveLength(1);
    expect(insTokens[0].text).toMatch(/start/);
    expect(insTokens[0].text).toMatch(/middle/);
  });

  it('returns null when input is too large to diff', () => {
    const big = 'word '.repeat(2000).trim();
    expect(wordDiff(big, 'short')).toBeNull();
    expect(wordDiff('short', big)).toBeNull();
  });

  it('reconstructs the enhanced text from eq + ins tokens', () => {
    const r = wordDiff('the cat sat', 'the brown cat sat on a mat')!;
    const enhanced = r
      .filter((t) => t.op !== 'del')
      .map((t) => t.text)
      .join('');
    expect(enhanced.trim()).toBe('the brown cat sat on a mat');
  });
});
