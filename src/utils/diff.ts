/**
 * Word-level diff for the enhanced-prompt view.
 *
 * Uses Longest Common Subsequence over whitespace-delimited tokens. Returns
 * an array of {op, text} tokens that the modal renders as colored spans.
 *
 * Complexity is O(n*m). We bail out for very large inputs to keep the UI
 * responsive — beyond MAX_DIFF_WORDS, return a single "substantial" token so
 * the modal can fall back to the plain side-by-side view.
 */

export type DiffOp = 'eq' | 'del' | 'ins';

export interface DiffToken {
  op: DiffOp;
  text: string;
}

const MAX_DIFF_WORDS = 1500;

/**
 * Tokenize a string preserving the whitespace that separated each word.
 * Each word token includes its trailing whitespace so rendering stays faithful.
 */
function tokenize(s: string): string[] {
  if (s === '') return [];
  // Match either a run of non-whitespace, or a run of whitespace.
  return s.match(/\S+\s*|\s+/g) ?? [];
}

/**
 * Compute a word-level diff. Returns either tokens or `null` if the inputs
 * are too large to diff efficiently — caller should render plain in that case.
 */
export function wordDiff(original: string, enhanced: string): DiffToken[] | null {
  const a = tokenize(original);
  const b = tokenize(enhanced);

  if (a.length > MAX_DIFF_WORDS || b.length > MAX_DIFF_WORDS) return null;

  // Trivial cases.
  if (a.length === 0 && b.length === 0) return [];
  if (a.length === 0) return [{ op: 'ins', text: enhanced }];
  if (b.length === 0) return [{ op: 'del', text: original }];

  // LCS via DP. lcs[i][j] = length of longest common subsequence of a[0..i] and b[0..j].
  const m = a.length;
  const n = b.length;
  const lcs: number[][] = Array.from({ length: m + 1 }, () => new Array(n + 1).fill(0));

  // Compare ignoring trailing whitespace for equality.
  const eq = (i: number, j: number): boolean => a[i].trimEnd() === b[j].trimEnd();

  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      lcs[i][j] = eq(i - 1, j - 1) ? lcs[i - 1][j - 1] + 1 : Math.max(lcs[i - 1][j], lcs[i][j - 1]);
    }
  }

  // Walk back from (m, n) to build the diff in reverse.
  const out: DiffToken[] = [];
  let i = m;
  let j = n;
  while (i > 0 && j > 0) {
    if (eq(i - 1, j - 1)) {
      // Use the enhanced version's text for eq tokens — its whitespace is what
      // the rendered output should preserve.
      out.push({ op: 'eq', text: b[j - 1] });
      i--;
      j--;
    } else if (lcs[i - 1][j] >= lcs[i][j - 1]) {
      out.push({ op: 'del', text: a[i - 1] });
      i--;
    } else {
      out.push({ op: 'ins', text: b[j - 1] });
      j--;
    }
  }
  while (i > 0) {
    out.push({ op: 'del', text: a[i - 1] });
    i--;
  }
  while (j > 0) {
    out.push({ op: 'ins', text: b[j - 1] });
    j--;
  }

  return mergeAdjacent(out.reverse());
}

/**
 * Merge consecutive tokens with the same op for cleaner rendering.
 */
function mergeAdjacent(tokens: DiffToken[]): DiffToken[] {
  const merged: DiffToken[] = [];
  for (const t of tokens) {
    const last = merged[merged.length - 1];
    if (last && last.op === t.op) {
      last.text += t.text;
    } else {
      merged.push({ ...t });
    }
  }
  return merged;
}
