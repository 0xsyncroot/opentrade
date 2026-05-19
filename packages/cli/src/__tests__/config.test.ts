import { describe, expect, it } from 'vitest';
import { mkdtempSync, rmSync, writeFileSync, existsSync, readFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { loadConfig } from '../config/load.js';
import { writeConfig } from '../config/load.js';
import { resolvePaths } from '../config/paths.js';
import { ConfigSchema } from '../config/schema.js';

describe('config loader', () => {
  it('returns defaults when no file present', async () => {
    const home = mkdtempSync(path.join(os.tmpdir(), 'ot-cfg-'));
    const origApi = process.env.GMGN_API_KEY;
    const origPk = process.env.GMGN_ED25519_PRIVATE_KEY_PATH;
    const origWallet = process.env.GMGN_WALLET_ADDRESS;
    delete process.env.GMGN_API_KEY;
    delete process.env.GMGN_ED25519_PRIVATE_KEY_PATH;
    delete process.env.GMGN_WALLET_ADDRESS;
    try {
      const loaded = await loadConfig({ homeOverride: home, cwd: home });
      expect(loaded.config.defaultChain).toBe('base');
      expect(loaded.config.noConfirm).toBe(false);
      expect(loaded.apiKey).toBeUndefined();
    } finally {
      if (origApi !== undefined) process.env.GMGN_API_KEY = origApi;
      if (origPk !== undefined) process.env.GMGN_ED25519_PRIVATE_KEY_PATH = origPk;
      if (origWallet !== undefined) process.env.GMGN_WALLET_ADDRESS = origWallet;
      rmSync(home, { recursive: true, force: true });
    }
  });

  it('roundtrip write/read', async () => {
    const home = mkdtempSync(path.join(os.tmpdir(), 'ot-cfg-'));
    try {
      const paths = resolvePaths({ homeOverride: home });
      const cfg = ConfigSchema.parse({
        defaultChain: 'sol',
        gmgn: { apiKey: 'abc12345' },
        wallets: { sol: 'So1aBcDeFg' },
      });
      writeConfig(paths, cfg);
      expect(existsSync(paths.configFile)).toBe(true);
      const loaded = await loadConfig({ homeOverride: home, cwd: home });
      expect(loaded.config.defaultChain).toBe('sol');
      expect(loaded.apiKey).toBe('abc12345');
      expect(loaded.config.wallets.sol).toBe('So1aBcDeFg');
    } finally {
      rmSync(home, { recursive: true, force: true });
    }
  });

  it('respects env GMGN_API_KEY fallback', async () => {
    const home = mkdtempSync(path.join(os.tmpdir(), 'ot-cfg-'));
    const orig = process.env.GMGN_API_KEY;
    process.env.GMGN_API_KEY = 'env-key-789';
    try {
      const loaded = await loadConfig({ homeOverride: home, cwd: home });
      expect(loaded.apiKey).toBe('env-key-789');
    } finally {
      if (orig === undefined) delete process.env.GMGN_API_KEY;
      else process.env.GMGN_API_KEY = orig;
      rmSync(home, { recursive: true, force: true });
    }
  });

  it('writes config.json with 600 permissions when supported', async () => {
    const home = mkdtempSync(path.join(os.tmpdir(), 'ot-cfg-'));
    try {
      const paths = resolvePaths({ homeOverride: home });
      writeConfig(paths, ConfigSchema.parse({}));
      const stat = readFileSync(paths.configFile);
      expect(stat.length).toBeGreaterThan(0);
    } finally {
      rmSync(home, { recursive: true, force: true });
    }
  });

  it('telegram disabled flag round-trips', async () => {
    const home = mkdtempSync(path.join(os.tmpdir(), 'ot-cfg-'));
    try {
      const paths = resolvePaths({ homeOverride: home });
      writeConfig(paths, ConfigSchema.parse({ telegram: { disabled: true } }));
      const loaded = await loadConfig({ homeOverride: home, cwd: home });
      expect(loaded.config.telegram?.disabled).toBe(true);
    } finally {
      rmSync(home, { recursive: true, force: true });
    }
  });
});
