/**
 * Hosting-account process/thread snapshot for Sidhu Server panel.
 * Reads /proc status + cwd only; never process environment files; never full argv.
 */

import fs from "fs";
import os from "os";
import path from "path";

export const SERVER_RUNTIME_PLAN_THREAD_LIMIT = 200;
export const SERVER_RUNTIME_MAX_PIDS = 2000;
export const SERVER_RUNTIME_CACHE_MS = 10_000;

export type ServerRuntimeProcessRow = {
  pid: number;
  name: string;
  threads: number;
  vmRssMb: number;
  site: string | null;
};

export type ServerRuntimeSelf = {
  pid: number;
  node: string;
  uptimeSec: number;
  memory: { rssMb: number; heapUsedMb: number };
  threads: number;
  cpuCount: number;
  loadavg: number[];
};

export type ServerRuntimeSnapshot = {
  available: boolean;
  self?: ServerRuntimeSelf;
  processes?: ServerRuntimeProcessRow[];
  totalThreads?: number;
  planThreadLimit?: number;
  scanned?: number;
  truncated?: boolean;
  fetchedAt?: string;
};

/** Parse Threads: / Uid: / VmRSS: from a /proc/<pid>/status body. */
export function parseProcStatus(body: string): {
  name: string;
  threads: number;
  uid: number | null;
  vmRssKb: number;
} {
  let name = "";
  let threads = 0;
  let uid: number | null = null;
  let vmRssKb = 0;
  for (const line of String(body || "").split(/\r?\n/)) {
    if (line.startsWith("Name:")) {
      name = line.slice(5).trim();
    } else if (line.startsWith("Threads:")) {
      const n = Number(line.slice(8).trim());
      threads = Number.isFinite(n) ? Math.max(0, Math.floor(n)) : 0;
    } else if (line.startsWith("Uid:")) {
      const parts = line.slice(4).trim().split(/\s+/);
      const n = Number(parts[0]);
      uid = Number.isFinite(n) ? Math.floor(n) : null;
    } else if (line.startsWith("VmRSS:")) {
      const m = line.match(/VmRSS:\s+(\d+)/i);
      vmRssKb = m ? Number(m[1]) || 0 : 0;
    }
  }
  return { name, threads, uid, vmRssKb };
}

/**
 * Site hint = basename of the folder after "domains/" in a resolved cwd
 * (e.g. .../domains/firestick4uk.com/public_html → firestick4uk.com).
 */
export function siteHintFromCwd(cwd: string | null | undefined): string | null {
  if (!cwd) return null;
  const norm = String(cwd).replace(/\\/g, "/");
  const parts = norm.split("/").filter(Boolean);
  const idx = parts.indexOf("domains");
  if (idx < 0 || idx + 1 >= parts.length) return null;
  const site = parts[idx + 1];
  if (!site || site === "." || site === "..") return null;
  return site;
}

function kbToMb(kb: number): number {
  return Math.round((kb / 1024) * 10) / 10;
}

function bytesToMb(bytes: number): number {
  return Math.round((bytes / (1024 * 1024)) * 10) / 10;
}

function readTextSafe(filePath: string): string | null {
  try {
    return fs.readFileSync(filePath, "utf8");
  } catch {
    return null;
  }
}

function readlinkSafe(linkPath: string): string | null {
  try {
    return fs.readlinkSync(linkPath);
  } catch {
    return null;
  }
}

function listProcPids(procRoot: string, maxPids: number): number[] {
  let entries: string[];
  try {
    entries = fs.readdirSync(procRoot);
  } catch {
    return [];
  }
  const pids: number[] = [];
  for (const ent of entries) {
    if (!/^\d+$/.test(ent)) continue;
    const n = Number(ent);
    if (!Number.isFinite(n) || n <= 0) continue;
    pids.push(n);
    if (pids.length >= maxPids) break;
  }
  return pids;
}

export type CollectServerRuntimeOptions = {
  procRoot?: string;
  maxPids?: number;
  selfPid?: number;
  nodeVersion?: string;
  uptimeSec?: number;
  memoryUsage?: NodeJS.MemoryUsage;
  cpuCount?: number;
  loadavg?: number[];
  /** Optional cwd resolver (tests). Default: readlink /proc/<pid>/cwd. */
  readCwd?: (pid: number, procRoot: string) => string | null;
};

/** Build snapshot. Fail-safe: missing/unreadable /proc → { available:false }. */
export function collectServerRuntime(
  options: CollectServerRuntimeOptions = {}
): ServerRuntimeSnapshot {
  const procRoot = options.procRoot ?? "/proc";
  const maxPids = options.maxPids ?? SERVER_RUNTIME_MAX_PIDS;

  let selfStatusRaw: string | null = null;
  try {
    if (!fs.existsSync(procRoot)) {
      return { available: false };
    }
    selfStatusRaw = readTextSafe(path.join(procRoot, "self", "status"));
    if (!selfStatusRaw) {
      return { available: false };
    }
  } catch {
    return { available: false };
  }

  const selfParsed = parseProcStatus(selfStatusRaw);
  const selfUid = selfParsed.uid;
  const mem = options.memoryUsage ?? process.memoryUsage();
  const selfPid = options.selfPid ?? process.pid;

  const self: ServerRuntimeSelf = {
    pid: selfPid,
    node: options.nodeVersion ?? process.version,
    uptimeSec: Math.floor(options.uptimeSec ?? process.uptime()),
    memory: {
      rssMb: bytesToMb(mem.rss),
      heapUsedMb: bytesToMb(mem.heapUsed),
    },
    threads: selfParsed.threads,
    cpuCount: options.cpuCount ?? os.cpus().length,
    loadavg: options.loadavg ?? os.loadavg(),
  };

  const pids = listProcPids(procRoot, maxPids);
  const truncated = pids.length >= maxPids;
  const processes: ServerRuntimeProcessRow[] = [];

  for (const pid of pids) {
    const statusRaw = readTextSafe(path.join(procRoot, String(pid), "status"));
    if (!statusRaw) continue;
    const parsed = parseProcStatus(statusRaw);
    if (selfUid == null || parsed.uid == null || parsed.uid !== selfUid) continue;
    const cwd = options.readCwd
      ? options.readCwd(pid, procRoot)
      : readlinkSafe(path.join(procRoot, String(pid), "cwd"));
    processes.push({
      pid,
      name: parsed.name || "unknown",
      threads: parsed.threads,
      vmRssMb: kbToMb(parsed.vmRssKb),
      site: siteHintFromCwd(cwd),
    });
  }

  processes.sort((a, b) => b.threads - a.threads || a.pid - b.pid);
  const totalThreads = processes.reduce((sum, p) => sum + p.threads, 0);

  return {
    available: true,
    self,
    processes,
    totalThreads,
    planThreadLimit: SERVER_RUNTIME_PLAN_THREAD_LIMIT,
    scanned: pids.length,
    truncated,
    fetchedAt: new Date().toISOString(),
  };
}

let cache: { at: number; payload: ServerRuntimeSnapshot } | null = null;

export function getCachedServerRuntime(
  options?: CollectServerRuntimeOptions
): ServerRuntimeSnapshot {
  const now = Date.now();
  if (cache && now - cache.at < SERVER_RUNTIME_CACHE_MS) {
    return cache.payload;
  }
  const payload = collectServerRuntime(options);
  cache = { at: now, payload };
  return payload;
}

/** Test helper — clear the 10s in-memory cache. */
export function clearServerRuntimeCache(): void {
  cache = null;
}
