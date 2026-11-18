/**
 * Pure helper: re-read until two consecutive hashes match.
 * No I/O. sleep is injectable for tests.
 */
"use strict";

/**
 * @param {() => Promise<{ hash: string, len: number, text: string, [k: string]: unknown }>} readFn
 * @param {{ maxReads?: number, intervalMs?: number, sleep?: (ms: number) => Promise<void> }} [opts]
 * @returns {Promise<{ final: object|null, stable: boolean, reads: number, distinctHashes: number }>}
 */
async function readUntilStable(readFn, opts = {}) {
  const maxReads = opts.maxReads == null ? 6 : opts.maxReads;
  const intervalMs = opts.intervalMs == null ? 1500 : opts.intervalMs;
  const sleep =
    opts.sleep ||
    ((ms) => new Promise((r) => setTimeout(r, ms)));

  let prev = null;
  const seen = new Set();
  let reads = 0;
  let final = null;

  for (let i = 0; i < maxReads; i++) {
    const cur = await readFn();
    reads++;
    final = cur;
    if (cur && cur.hash) seen.add(cur.hash);
    if (prev && cur && prev.hash && cur.hash && prev.hash === cur.hash) {
      return {
        final: cur,
        stable: true,
        reads,
        distinctHashes: seen.size,
      };
    }
    prev = cur;
    if (i < maxReads - 1) {
      await sleep(intervalMs);
    }
  }

  return {
    final,
    stable: false,
    reads,
    distinctHashes: seen.size,
  };
}

module.exports = { readUntilStable };
