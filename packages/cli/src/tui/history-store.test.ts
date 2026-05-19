// Unit tests for the input-history persistence module.

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  HISTORY_MAX,
  flushPendingSaves,
  loadHistory,
  saveHistory,
  scheduleSave,
} from './history-store.js';

let tmpDir: string;
let historyFile: string;

beforeEach(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'opentrade-hist-'));
  historyFile = path.join(tmpDir, 'history.json');
});

afterEach(async () => {
  await flushPendingSaves();
  try {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  } catch {
    /* best effort */
  }
});

describe('loadHistory', () => {
  it('returns [] on missing file', () => {
    expect(loadHistory(historyFile)).toEqual([]);
  });

  it('returns [] on corrupt JSON', () => {
    fs.writeFileSync(historyFile, '{ not json');
    expect(loadHistory(historyFile)).toEqual([]);
  });

  it('returns [] when file contains non-array', () => {
    fs.writeFileSync(historyFile, JSON.stringify({ foo: 'bar' }));
    expect(loadHistory(historyFile)).toEqual([]);
  });

  it('filters out non-string entries', () => {
    fs.writeFileSync(historyFile, JSON.stringify(['ok', 42, null, '', 'still ok']));
    expect(loadHistory(historyFile)).toEqual(['ok', 'still ok']);
  });

  it('caps entries to HISTORY_MAX', () => {
    const arr = Array.from({ length: HISTORY_MAX + 10 }, (_, i) => `e${i}`);
    fs.writeFileSync(historyFile, JSON.stringify(arr));
    const got = loadHistory(historyFile);
    expect(got).toHaveLength(HISTORY_MAX);
    // keeps the tail (most recent)
    expect(got[0]).toBe(`e${10}`);
    expect(got[got.length - 1]).toBe(`e${HISTORY_MAX + 9}`);
  });
});

describe('saveHistory + loadHistory roundtrip', () => {
  it('persists and reads back identical entries', async () => {
    const entries = ['0xabc', 'pepe', '0xfeed'];
    await saveHistory(historyFile, entries);
    expect(loadHistory(historyFile)).toEqual(entries);
  });

  it('overwrites existing file', async () => {
    await saveHistory(historyFile, ['one']);
    await saveHistory(historyFile, ['two', 'three']);
    expect(loadHistory(historyFile)).toEqual(['two', 'three']);
  });

  it('creates parent directory if missing', async () => {
    const nested = path.join(tmpDir, 'deep', 'nested', 'history.json');
    await saveHistory(nested, ['x']);
    expect(loadHistory(nested)).toEqual(['x']);
  });

  it('caps writes to HISTORY_MAX entries', async () => {
    const arr = Array.from({ length: HISTORY_MAX + 5 }, (_, i) => `e${i}`);
    await saveHistory(historyFile, arr);
    const got = loadHistory(historyFile);
    expect(got).toHaveLength(HISTORY_MAX);
    expect(got[got.length - 1]).toBe(`e${HISTORY_MAX + 4}`);
  });
});

describe('saveHistory atomicity', () => {
  it('writes via a .tmp file then renames (no partial state mid-write)', async () => {
    // Spy on fs.writeFileSync + fs.renameSync to confirm the tmp-then-rename
    // order. This guarantees a crash mid-write can't leave a corrupt
    // history.json (only an orphan .tmp).
    const writes: string[] = [];
    const renames: { from: string; to: string }[] = [];
    const realWrite = fs.writeFileSync;
    const realRename = fs.renameSync;
    const writeSpy = vi.spyOn(fs, 'writeFileSync').mockImplementation((p, data, opts) => {
      writes.push(String(p));
      return realWrite(p, data, opts);
    });
    const renameSpy = vi.spyOn(fs, 'renameSync').mockImplementation((from, to) => {
      renames.push({ from: String(from), to: String(to) });
      return realRename(from, to);
    });
    try {
      await saveHistory(historyFile, ['a', 'b']);
    } finally {
      writeSpy.mockRestore();
      renameSpy.mockRestore();
    }
    // Final write should be to the .tmp path, then a single rename .tmp -> final.
    expect(writes).toContain(`${historyFile}.tmp`);
    expect(writes).not.toContain(historyFile); // never write directly to the final file
    expect(renames).toEqual([{ from: `${historyFile}.tmp`, to: historyFile }]);
    expect(loadHistory(historyFile)).toEqual(['a', 'b']);
  });

  it('written file is mode 0o600', async () => {
    await saveHistory(historyFile, ['x']);
    const stat = fs.statSync(historyFile);
    // mask out type bits; just check perm bits
    expect(stat.mode & 0o777).toBe(0o600);
  });
});

describe('scheduleSave debouncing', () => {
  it('coalesces multiple rapid calls into one write (fake timers)', async () => {
    vi.useFakeTimers();
    try {
      scheduleSave(historyFile, ['a'], 500);
      scheduleSave(historyFile, ['a', 'b'], 500);
      scheduleSave(historyFile, ['a', 'b', 'c'], 500);
      // Before the 500ms timer fires, no file exists.
      expect(fs.existsSync(historyFile)).toBe(false);
      // Advance past the debounce.
      vi.advanceTimersByTime(600);
      // Run microtasks so the saveHistory promise resolves.
      vi.useRealTimers();
      await flushPendingSaves(historyFile);
    } finally {
      vi.useRealTimers();
    }
    expect(loadHistory(historyFile)).toEqual(['a', 'b', 'c']);
  });

  it('flushPendingSaves writes immediately even without timer fire', async () => {
    vi.useFakeTimers();
    scheduleSave(historyFile, ['only'], 9999);
    vi.useRealTimers();
    await flushPendingSaves(historyFile);
    expect(loadHistory(historyFile)).toEqual(['only']);
  });
});
