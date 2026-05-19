import { describe, expect, it } from 'vitest';
import { mkdtempSync, rmSync, readdirSync, readFileSync, existsSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { formatTradeBlock, recordTrade } from '../audit/trade-log.js';
import { resolvePaths } from '../config/paths.js';
import type { TradeRecord } from '@hiepht/opentrade-core/actions';

const sampleSuccess: TradeRecord = {
  kind: 'buy',
  intent: {
    kind: 'buy',
    chain: 'base',
    token: '0x0000000000000000000000000000000000000abc',
    amountWei: '10000000000000000',
    slippageBps: 800,
    antiMev: 'auto',
  },
  result: {
    orderId: 'ord_1',
    txHash: '0xdead',
    status: 'submitted',
    raw: {},
  },
  timestampUtc: '2026-05-19T12:00:00Z',
};

const sampleFail: TradeRecord = {
  kind: 'sell',
  intent: {
    kind: 'sell',
    chain: 'sol',
    token: 'So1aBcDeFg',
    percent: 100,
    slippageBps: 500,
    antiMev: 'auto',
  },
  error: { message: 'GMGN code=1234: rejected', code: 1234 },
  timestampUtc: '2026-05-19T12:01:00Z',
};

describe('audit log', () => {
  it('formats a success block with yaml frontmatter shape', () => {
    const block = formatTradeBlock(sampleSuccess);
    expect(block).toContain('## trade');
    expect(block).toContain('kind: buy');
    expect(block).toContain('chain: base');
    expect(block).toContain('tx_hash: 0xdead');
    expect(block).toContain('result: success');
    expect(block).toContain('source: opentrade-cli');
  });

  it('formats a fail block with error fields', () => {
    const block = formatTradeBlock(sampleFail);
    expect(block).toContain('result: fail');
    expect(block).toContain('error_message:');
    expect(block).toContain('error_code: 1234');
  });

  it('appends to daily file under configDir', async () => {
    const home = mkdtempSync(path.join(os.tmpdir(), 'ot-aud-'));
    try {
      const paths = resolvePaths({ homeOverride: home });
      await recordTrade(sampleSuccess, { paths });
      // file pattern: trades_YYYY-MM-DD.md
      const files = readdirSync(paths.configDir).filter((f) => f.startsWith('trades_'));
      expect(files.length).toBeGreaterThan(0);
      const full = readFileSync(path.join(paths.configDir, files[0]!), 'utf8');
      expect(full).toContain('## trade');
      expect(full).toContain('chain: base');
    } finally {
      rmSync(home, { recursive: true, force: true });
    }
  });

  it('appends a second block on subsequent call (idempotent)', async () => {
    const home = mkdtempSync(path.join(os.tmpdir(), 'ot-aud-'));
    try {
      const paths = resolvePaths({ homeOverride: home });
      await recordTrade(sampleSuccess, { paths });
      await recordTrade(sampleFail, { paths });
      const files = readdirSync(paths.configDir).filter((f) => f.startsWith('trades_'));
      const full = readFileSync(path.join(paths.configDir, files[0]!), 'utf8');
      const matches = full.match(/## trade/g) ?? [];
      expect(matches.length).toBe(2);
    } finally {
      rmSync(home, { recursive: true, force: true });
    }
  });

  it('does not throw on missing workspace dual-write target', async () => {
    const home = mkdtempSync(path.join(os.tmpdir(), 'ot-aud-'));
    try {
      const paths = resolvePaths({ homeOverride: home });
      // No workspace root → only primary write
      await expect(recordTrade(sampleSuccess, { paths })).resolves.not.toThrow();
      expect(existsSync(paths.configDir)).toBe(true);
    } finally {
      rmSync(home, { recursive: true, force: true });
    }
  });
});
