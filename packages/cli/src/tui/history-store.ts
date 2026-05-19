// Persistent input-history store.
//
// The TUI keeps the last N (50) submitted/pasted inputs so ↑/↓ navigation
// works across sessions. The file lives at `paths.historyFile`
// (`~/.config/opentrade/history.json`) and is written atomically (write to
// `.tmp` then `fs.renameSync`) so a crash mid-write can't leave a corrupt
// file behind.
//
// Concurrency: the caller (App.tsx useEffect) debounces the save so rapid
// input churn doesn't hammer the disk. We also expose a small in-module
// debouncer for callers that don't want to manage their own timer.

import fs from 'node:fs';
import path from 'node:path';

/** Hard cap on persisted history length — mirrors store.pushHistory cap. */
export const HISTORY_MAX = 50;

/**
 * Read a history file. Returns `[]` for any failure (missing, corrupt JSON,
 * wrong shape) — history is best-effort UX, never a fatal error.
 */
export function loadHistory(historyFile: string): string[] {
  try {
    const raw = fs.readFileSync(historyFile, 'utf8');
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    // Only keep string entries, cap to HISTORY_MAX, drop empties.
    const cleaned = parsed
      .filter((e): e is string => typeof e === 'string' && e.length > 0)
      .slice(-HISTORY_MAX);
    return cleaned;
  } catch {
    return [];
  }
}

/**
 * Atomically persist `entries` to `historyFile`. Strategy: write to
 * `<historyFile>.tmp`, fsync, then `renameSync` — POSIX rename is atomic on
 * the same filesystem. Caps at HISTORY_MAX. Sets mode 0o600 so the file isn't
 * world-readable (CAs aren't strictly secret but the user's trade history is
 * still PII-ish).
 *
 * Returns a Promise that resolves after the rename completes. Errors are
 * thrown — caller can choose to swallow.
 */
export async function saveHistory(
  historyFile: string,
  entries: string[],
): Promise<void> {
  const dir = path.dirname(historyFile);
  // Make sure the parent dir exists with safe permissions. If it already
  // exists this is a no-op.
  fs.mkdirSync(dir, { recursive: true, mode: 0o700 });

  const capped = entries.slice(-HISTORY_MAX);
  const json = JSON.stringify(capped);
  const tmp = `${historyFile}.tmp`;

  // Atomic write: tmp file -> rename. We use sync APIs because:
  //  - the data is tiny (≤50 short strings)
  //  - rename atomicity is what matters, not async
  //  - the caller already debounces, so we won't block frequently
  fs.writeFileSync(tmp, json, { encoding: 'utf8', mode: 0o600 });
  try {
    fs.chmodSync(tmp, 0o600);
  } catch {
    /* non-POSIX fs without chmod */
  }
  fs.renameSync(tmp, historyFile);
  try {
    fs.chmodSync(historyFile, 0o600);
  } catch {
    /* non-POSIX fs without chmod */
  }
}

// -- Debounced save helper ---------------------------------------------------
//
// A single module-level pending-state keyed by historyFile path. Used by
// App.tsx so the store/index.ts pushHistory action can stay a pure
// synchronous setter.

interface Pending {
  timer: NodeJS.Timeout;
  entries: string[];
}
const pending = new Map<string, Pending>();
const inflight = new Map<string, Promise<void>>();

/**
 * Schedule a debounced save (default 500ms). If called again before the
 * timer fires the previous timer is cancelled and the latest `entries`
 * snapshot wins.
 */
export function scheduleSave(
  historyFile: string,
  entries: string[],
  delayMs = 500,
): void {
  const existing = pending.get(historyFile);
  if (existing) clearTimeout(existing.timer);
  const timer = setTimeout(() => {
    const p = pending.get(historyFile);
    pending.delete(historyFile);
    if (!p) return;
    const promise = saveHistory(historyFile, p.entries).catch(() => {
      /* swallow — history failure must never break the TUI */
    });
    inflight.set(historyFile, promise);
    void promise.finally(() => {
      if (inflight.get(historyFile) === promise) inflight.delete(historyFile);
    });
  }, delayMs);
  pending.set(historyFile, { timer, entries: [...entries] });
}

/**
 * Await all pending debounced saves (and any in-flight save) for the given
 * file. If `historyFile` is omitted, flushes for all known files. Useful in
 * tests so we can flush before reading the file back.
 */
export async function flushPendingSaves(historyFile?: string): Promise<void> {
  const files = historyFile ? [historyFile] : Array.from(pending.keys());
  for (const f of files) {
    const p = pending.get(f);
    if (p) {
      clearTimeout(p.timer);
      pending.delete(f);
      await saveHistory(f, p.entries);
    }
  }
  const allFiles = historyFile ? [historyFile] : Array.from(inflight.keys());
  for (const f of allFiles) {
    const promise = inflight.get(f);
    if (promise) await promise;
  }
}
