import { describe, expect, it } from 'vitest';
import { analyzeChange } from './similarity';

describe('analyzeChange', () => {
  it('classifies exact match as identical', () => {
    const r = analyzeChange('write a blog post about cats', 'write a blog post about cats');
    expect(r.level).toBe('identical');
    expect(r.jaccard).toBe(1);
    expect(r.lengthRatio).toBe(1);
  });

  it('treats whitespace + case differences as identical (normalization)', () => {
    const r = analyzeChange('  Write a Blog Post  ', 'write a blog post');
    expect(r.level).toBe('identical');
  });

  it('classifies a small edit as minimal', () => {
    // Long-enough prompt that swapping one word keeps Jaccard >= 0.85.
    // 16 words, 15 in common → Jaccard = 15/17 ≈ 0.88.
    const original =
      'write a clear concise blog post about how to care for pet cats living indoors at home';
    const enhanced =
      'write a clear concise blog post about how to care for pet cats living indoors at houses';
    const r = analyzeChange(original, enhanced);
    expect(r.level).toBe('minimal');
    expect(r.jaccard).toBeGreaterThanOrEqual(0.85);
    expect(r.lengthRatio).toBeGreaterThanOrEqual(0.85);
  });

  it('classifies a full rewrite as substantial', () => {
    const original = 'cats';
    const enhanced =
      'Write a comprehensive guide for first-time pet owners about choosing, caring for, and bonding with a domestic cat. Include sections on diet, vet visits, and enrichment.';
    const r = analyzeChange(original, enhanced);
    expect(r.level).toBe('substantial');
  });

  it('handles empty original gracefully', () => {
    const r = analyzeChange('', 'a non-empty rewritten prompt about cats');
    expect(r.level).toBe('substantial');
    expect(r.jaccard).toBe(0);
  });

  it('handles empty enhanced gracefully', () => {
    const r = analyzeChange('original prompt about cats', '');
    expect(r.level).toBe('substantial');
    expect(r.jaccard).toBe(0);
  });

  it('jaccard never exceeds 1 and lengthRatio is between 0 and 1', () => {
    const r = analyzeChange('a quick brown fox', 'a quick brown fox jumps over a lazy dog');
    expect(r.jaccard).toBeGreaterThanOrEqual(0);
    expect(r.jaccard).toBeLessThanOrEqual(1);
    expect(r.lengthRatio).toBeGreaterThanOrEqual(0);
    expect(r.lengthRatio).toBeLessThanOrEqual(1);
  });
});
