/**
 * Lightweight prompt-similarity heuristics for "already well-written" detection.
 * Avoids O(n*m) edit distance — uses normalized text + word-set Jaccard.
 */

export type ChangeLevel = 'identical' | 'minimal' | 'substantial';

export interface ChangeAnalysis {
  level: ChangeLevel;
  jaccard: number;
  lengthRatio: number;
}

function normalize(s: string): string {
  return s.toLowerCase().replace(/\s+/g, ' ').trim();
}

function wordSet(s: string): Set<string> {
  return new Set(normalize(s).split(' ').filter(Boolean));
}

/**
 * Compare original vs enhanced prompts and classify how much actually changed.
 * - `identical`: trimmed text is exactly equal.
 * - `minimal`: heavy word overlap AND similar length — model decided the input was already good.
 * - `substantial`: real rewrite.
 */
export function analyzeChange(original: string, enhanced: string): ChangeAnalysis {
  if (normalize(original) === normalize(enhanced)) {
    return { level: 'identical', jaccard: 1, lengthRatio: 1 };
  }
  const a = wordSet(original);
  const b = wordSet(enhanced);
  if (a.size === 0 || b.size === 0) {
    return { level: 'substantial', jaccard: 0, lengthRatio: 0 };
  }
  let intersect = 0;
  for (const w of a) if (b.has(w)) intersect++;
  const union = a.size + b.size - intersect;
  const jaccard = union === 0 ? 0 : intersect / union;
  const lenA = original.length || 1;
  const lenB = enhanced.length || 1;
  const lengthRatio = Math.min(lenA, lenB) / Math.max(lenA, lenB);

  const level: ChangeLevel = jaccard >= 0.85 && lengthRatio >= 0.85 ? 'minimal' : 'substantial';
  return { level, jaccard, lengthRatio };
}
