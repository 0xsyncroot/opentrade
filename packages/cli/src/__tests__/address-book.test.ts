import { describe, expect, it } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { readAddressBook, writeAddressBook } from '../config/load.js';
import { resolvePaths } from '../config/paths.js';
import { AddressBookFileSchema } from '../config/schema.js';

describe('address book', () => {
  it('roundtrip empty → entries', () => {
    const home = mkdtempSync(path.join(os.tmpdir(), 'ot-ab-'));
    try {
      const paths = resolvePaths({ homeOverride: home });
      const empty = readAddressBook(paths);
      expect(empty.entries.length).toBe(0);
      writeAddressBook(paths, {
        version: 1,
        entries: [
          {
            alias: 'cold',
            chain: 'base',
            address: '0xdeadbeefdeadbeefdeadbeefdeadbeefdeadbeef',
            whitelisted: true,
            isContract: false,
            addedAtUtc: '2026-05-19T10:00:00Z',
          },
        ],
      });
      const read = readAddressBook(paths);
      expect(read.entries.length).toBe(1);
      expect(read.entries[0]!.alias).toBe('cold');
      expect(read.entries[0]!.whitelisted).toBe(true);
    } finally {
      rmSync(home, { recursive: true, force: true });
    }
  });

  it('schema rejects invalid chain', () => {
    const result = AddressBookFileSchema.safeParse({
      version: 1,
      entries: [
        {
          alias: 'x',
          chain: 'mars',
          address: '0xabc',
          whitelisted: false,
          isContract: false,
          addedAtUtc: 'now',
        },
      ],
    });
    expect(result.success).toBe(false);
  });
});
