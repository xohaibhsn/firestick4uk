/**
 * F4UK-MULTI-106 — local word-level text diff (LCS). No new dependency. Client-safe.
 * Caps input size; callers must fall back to "show both versions" when tooLarge is true.
 */

export const TEXT_DIFF_MAX_CHARS = 20_000;
/** Max LCS table cells (after trimming common prefix/suffix) — protects the browser main thread. */
export const TEXT_DIFF_MAX_CELLS = 4_000_000;

export type DiffOp =
  | { type: "equal"; text: string }
  | { type: "insert"; text: string }
  | { type: "delete"; text: string };

export type TextDiffResult = {
  ops: DiffOp[];
  tooLarge: boolean;
};

/** Strip HTML tags for text-mode diff (keeps text nodes roughly intact). */
export function stripHtmlForDiff(html: string): string {
  return String(html || "")
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/gi, " ")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'")
    .replace(/&amp;/gi, "&")
    .replace(/\s+/g, " ")
    .trim();
}

function tokenizeWords(text: string): string[] {
  const s = String(text || "");
  if (!s) return [];
  // Keep trailing whitespace attached so concatenating ops reproduces the text.
  return s.match(/\S+\s*|\s+/g) || [s];
}

function pushMerged(ops: DiffOp[], type: DiffOp["type"], text: string) {
  if (!text) return;
  const last = ops[ops.length - 1];
  if (last && last.type === type) last.text += text;
  else ops.push({ type, text });
}

/** Classic LCS-based word diff (delete-before-insert within a changed hunk). */
export function diffWords(a: string, b: string, maxChars = TEXT_DIFF_MAX_CHARS): TextDiffResult {
  const left = String(a ?? "");
  const right = String(b ?? "");
  if (left.length > maxChars || right.length > maxChars) {
    return { ops: [], tooLarge: true };
  }
  if (left === right) {
    return { ops: left ? [{ type: "equal", text: left }] : [], tooLarge: false };
  }

  const A = tokenizeWords(left);
  const B = tokenizeWords(right);

  // Trim common prefix / suffix tokens so the LCS table stays small.
  let start = 0;
  while (start < A.length && start < B.length && A[start] === B[start]) start++;
  let endA = A.length;
  let endB = B.length;
  while (endA > start && endB > start && A[endA - 1] === B[endB - 1]) {
    endA--;
    endB--;
  }
  const midA = A.slice(start, endA);
  const midB = B.slice(start, endB);
  const n = midA.length;
  const m = midB.length;
  if ((n + 1) * (m + 1) > TEXT_DIFF_MAX_CELLS) {
    return { ops: [], tooLarge: true };
  }

  const width = m + 1;
  const table = new Uint32Array((n + 1) * width);
  for (let i = 1; i <= n; i++) {
    for (let j = 1; j <= m; j++) {
      if (midA[i - 1] === midB[j - 1]) {
        table[i * width + j] = table[(i - 1) * width + (j - 1)] + 1;
      } else {
        const up = table[(i - 1) * width + j];
        const lf = table[i * width + (j - 1)];
        table[i * width + j] = up >= lf ? up : lf;
      }
    }
  }

  const rawMid: DiffOp[] = [];
  let i = n;
  let j = m;
  while (i > 0 || j > 0) {
    if (i > 0 && j > 0 && midA[i - 1] === midB[j - 1]) {
      rawMid.push({ type: "equal", text: midA[i - 1] });
      i--;
      j--;
    } else if (j > 0 && (i === 0 || table[i * width + (j - 1)] >= table[(i - 1) * width + j])) {
      rawMid.push({ type: "insert", text: midB[j - 1] });
      j--;
    } else if (i > 0) {
      rawMid.push({ type: "delete", text: midA[i - 1] });
      i--;
    }
  }
  rawMid.reverse();

  const ops: DiffOp[] = [];
  pushMerged(ops, "equal", A.slice(0, start).join(""));
  for (const op of rawMid) pushMerged(ops, op.type, op.text);
  pushMerged(ops, "equal", A.slice(endA).join(""));
  return { ops, tooLarge: false };
}

export function valuesEqual(a: unknown, b: unknown): boolean {
  if (a === b) return true;
  if (a == null && b == null) return true;
  return String(a ?? "") === String(b ?? "");
}
