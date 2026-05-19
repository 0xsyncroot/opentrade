// `opentrade init [--tg-only] [--dry-run]`
//
// Interactive first-time wizard. Order:
//   1. default chain
//   2. Ed25519 keypair choice (generate / import / reuse auto-trading)
//   3. if just generated OR no API key: print pubkey + clipboard + dashboard steps + pause
//   4. masked GMGN API key
//   5. wallet addresses per chain (paste or skip)
//   6. Telegram — MANDATORY first-class step with 3 explicit options
//   7. write config.json mode 600
//
// `--tg-only` jumps straight to step 6 (idempotent — won't re-prompt other
// steps). Useful for users who skipped Telegram on first run.

import fs from 'node:fs';
import path from 'node:path';
import * as p from '@clack/prompts';
import { defineCommand } from 'citty';
import { generateEd25519Keypair, extractPublicFromPrivate } from '@hiepht/opentrade-core/gmgn';
import { CHAINS, type Chain } from '@hiepht/opentrade-core/chains';
import { ConfigSchema, type OpentradeConfig } from '../config/schema.js';
import { writeConfig, ensureDir, resolvePaths } from '../config/load.js';
import { copyToClipboard } from '../clipboard.js';
import { log, color } from '../render/cli-renderer.js';
import { printDashboardSteps } from './keygen.js';

export const initCmd = defineCommand({
  meta: { name: 'init', description: 'first-time interactive wizard' },
  args: {
    'tg-only': { type: 'boolean', description: 'run only the Telegram step' },
    'dry-run': { type: 'boolean', description: 'print steps without prompting (CI safe)' },
  },
  async run({ args }) {
    const paths = resolvePaths();
    ensureDir(paths.configDir, 0o700);
    ensureDir(paths.secretsDir, 0o700);

    // Load existing config if any (start from defaults if missing/invalid).
    let cfg: OpentradeConfig;
    try {
      const raw = fs.existsSync(paths.configFile)
        ? JSON.parse(fs.readFileSync(paths.configFile, 'utf8'))
        : {};
      cfg = ConfigSchema.parse(raw);
    } catch {
      cfg = ConfigSchema.parse({});
    }

    if (args['dry-run']) {
      log.info(color.dim('dry-run — printing wizard outline:'));
      process.stdout.write(`
  1) default chain
  2) Ed25519 keypair (generate / import / reuse auto-trading)
  3) GMGN dashboard onboarding (clipboard + numbered steps + pause)
  4) GMGN API key (masked input)
  5) wallet addresses per chain
  6) Telegram (mandatory): paste now | skip & defer | opt out
  7) write ${paths.configFile} (mode 600)
`);
      return;
    }

    p.intro(color.bold('opentrade init'));

    if (args['tg-only']) {
      const telegram = await runTelegramStep(cfg);
      cfg = { ...cfg, telegram };
      writeConfig(paths, cfg);
      p.outro(color.green(`telegram updated → ${paths.configFile}`));
      return;
    }

    // -- Step 1: default chain ---------------------------------------------
    const chainChoice = await p.select({
      message: 'Default chain for new commands:',
      options: CHAINS.map((c) => ({ value: c, label: c })),
      initialValue: cfg.defaultChain,
    });
    if (p.isCancel(chainChoice)) {
      p.cancel('cancelled');
      return;
    }
    cfg = { ...cfg, defaultChain: chainChoice as Chain };

    // -- Step 2: Ed25519 keypair -------------------------------------------
    const hasExisting = fs.existsSync(paths.edPrivPem);
    const hasLegacy = paths.legacyEdPrivPem && fs.existsSync(paths.legacyEdPrivPem);

    const keyOptions: { value: string; label: string }[] = [
      { value: 'generate', label: 'Generate a NEW Ed25519 keypair (recommended for first time)' },
      { value: 'import', label: 'Import an existing PEM file (paste path)' },
    ];
    if (hasExisting) keyOptions.unshift({ value: 'keep', label: `Keep existing key at ${paths.edPrivPem}` });
    if (hasLegacy)
      keyOptions.push({ value: 'reuse', label: `Reuse auto-trading key (${paths.legacyEdPrivPem})` });

    const keyChoice = await p.select({
      message: 'Ed25519 keypair (required for GMGN critical-tier signing):',
      options: keyOptions,
    });
    if (p.isCancel(keyChoice)) {
      p.cancel('cancelled');
      return;
    }

    let pubPemForDashboard: string | undefined;
    let justGenerated = false;

    if (keyChoice === 'generate') {
      const passphrase = await p.password({
        message: 'Optional passphrase (empty = unencrypted):',
      });
      if (p.isCancel(passphrase)) {
        p.cancel('cancelled');
        return;
      }
      const { privatePem, publicPem } = generateEd25519Keypair(
        typeof passphrase === 'string' && passphrase ? passphrase : undefined,
      );
      fs.writeFileSync(paths.edPrivPem, privatePem, { mode: 0o600 });
      fs.chmodSync(paths.edPrivPem, 0o600);
      fs.writeFileSync(paths.edPubPem, publicPem, { mode: 0o644 });
      fs.chmodSync(paths.edPubPem, 0o644);
      pubPemForDashboard = publicPem;
      justGenerated = true;
      if (typeof passphrase === 'string' && passphrase) {
        cfg = { ...cfg, gmgn: { ...cfg.gmgn, privateKeyPassphrase: passphrase } };
      }
      p.log.success(`generated ${paths.edPrivPem} (600) + ${paths.edPubPem} (644)`);
    } else if (keyChoice === 'import') {
      const importPath = await p.text({
        message: 'Path to existing Ed25519 PEM:',
        validate: (v) => (fs.existsSync(v) ? undefined : 'file not found'),
      });
      if (p.isCancel(importPath)) {
        p.cancel('cancelled');
        return;
      }
      const pem = fs.readFileSync(String(importPath), 'utf8');
      fs.writeFileSync(paths.edPrivPem, pem, { mode: 0o600 });
      fs.chmodSync(paths.edPrivPem, 0o600);
      try {
        const pub = extractPublicFromPrivate(pem);
        fs.writeFileSync(paths.edPubPem, pub, { mode: 0o644 });
        fs.chmodSync(paths.edPubPem, 0o644);
        pubPemForDashboard = pub;
      } catch (e) {
        p.log.warn(`could not extract pubkey (encrypted?): ${(e as Error).message}`);
      }
      p.log.success('imported');
    } else if (keyChoice === 'reuse' && paths.legacyEdPrivPem) {
      const pem = fs.readFileSync(paths.legacyEdPrivPem, 'utf8');
      fs.writeFileSync(paths.edPrivPem, pem, { mode: 0o600 });
      fs.chmodSync(paths.edPrivPem, 0o600);
      try {
        const pub = extractPublicFromPrivate(pem);
        fs.writeFileSync(paths.edPubPem, pub, { mode: 0o644 });
        fs.chmodSync(paths.edPubPem, 0o644);
        pubPemForDashboard = pub;
      } catch {
        /* */
      }
      p.log.success(`reused ${paths.legacyEdPrivPem}`);
    } else if (keyChoice === 'keep') {
      const pem = fs.readFileSync(paths.edPrivPem, 'utf8');
      try {
        pubPemForDashboard = extractPublicFromPrivate(pem);
      } catch {
        /* */
      }
    }
    cfg = { ...cfg, gmgn: { ...cfg.gmgn, privateKeyPath: paths.edPrivPem } };

    // -- Step 3: dashboard onboarding --------------------------------------
    const needsDashboard = justGenerated || !cfg.gmgn.apiKey;
    if (needsDashboard && pubPemForDashboard) {
      p.log.step(color.bold('Onboard your key with GMGN:'));
      process.stdout.write('\n');
      process.stdout.write(pubPemForDashboard);
      process.stdout.write('\n');
      const copied = await copyToClipboard(pubPemForDashboard);
      if (copied) p.log.info(color.dim('(public key copied to clipboard)'));
      printDashboardSteps();
      const wait = await p.confirm({
        message: 'Press Enter when you have the API key in hand…',
        initialValue: true,
      });
      if (p.isCancel(wait)) {
        p.cancel('cancelled');
        return;
      }
    }

    // -- Step 4: API key ---------------------------------------------------
    if (!cfg.gmgn.apiKey) {
      const apiKey = await p.password({
        message: 'Paste your GMGN API key (input is masked):',
        validate: (v) => (v && v.length > 8 ? undefined : 'API key too short'),
      });
      if (p.isCancel(apiKey)) {
        p.cancel('cancelled');
        return;
      }
      cfg = { ...cfg, gmgn: { ...cfg.gmgn, apiKey: String(apiKey) } };
    } else {
      const replace = await p.confirm({
        message: 'An API key is already set. Replace it?',
        initialValue: false,
      });
      if (replace === true) {
        const apiKey = await p.password({ message: 'New API key:' });
        if (!p.isCancel(apiKey)) {
          cfg = { ...cfg, gmgn: { ...cfg.gmgn, apiKey: String(apiKey) } };
        }
      }
    }

    // -- Step 5: wallets ---------------------------------------------------
    const wallets = { ...(cfg.wallets as Partial<Record<Chain, string>>) };
    for (const c of CHAINS) {
      const existing = wallets[c];
      const v = await p.text({
        message: `Wallet for ${c} (leave empty to skip):`,
        ...(existing ? { initialValue: existing } : { initialValue: '' }),
      });
      if (p.isCancel(v)) {
        p.cancel('cancelled');
        return;
      }
      const trimmed = String(v).trim();
      if (trimmed) wallets[c] = trimmed;
    }
    cfg = { ...cfg, wallets: wallets as OpentradeConfig['wallets'] };

    // -- Step 6: Telegram (mandatory) -------------------------------------
    const telegram = await runTelegramStep(cfg);
    cfg = { ...cfg, telegram };

    // -- Step 7: write -----------------------------------------------------
    writeConfig(paths, cfg);
    p.outro(color.green(`wrote ${paths.configFile} (mode 600). You're ready.`));
  },
});

async function runTelegramStep(
  cfg: OpentradeConfig,
): Promise<OpentradeConfig['telegram']> {
  p.log.step(color.bold('Telegram bot (companion to the TUI):'));
  p.log.info(
    [
      'How to get the two values:',
      '  1) Open @BotFather → /newbot → copy the bot token',
      '  2) Open @userinfobot → copy your chat ID (numeric)',
    ].join('\n'),
  );
  const choice = await p.select({
    message: 'Choose:',
    options: [
      { value: 'now', label: 'Yes — paste token + chat_id now' },
      { value: 'defer', label: "Skip — I'll add it later via `opentrade config set telegram.*`" },
      { value: 'disable', label: "I don't want Telegram (TUI will never try to spawn the bot)" },
    ],
  });
  if (p.isCancel(choice)) return cfg.telegram;

  if (choice === 'disable') {
    return { disabled: true };
  }
  if (choice === 'defer') {
    p.log.info(
      'Tip: when you have them, run:\n  opentrade config set telegram.botToken <token>\n  opentrade config set telegram.ownerChatId <chatId>',
    );
    return { deferred: true };
  }
  const botToken = await p.password({
    message: 'Bot token (from @BotFather):',
    validate: (v) =>
      v && /^\d+:[A-Za-z0-9_-]+$/.test(v.trim()) ? undefined : "format looks off (expected '<id>:<secret>')",
  });
  if (p.isCancel(botToken)) return cfg.telegram;

  const chatIdInput = await p.text({
    message: 'Your numeric chat_id (from @userinfobot):',
    validate: (v) => (/^-?\d+$/.test(v.trim()) ? undefined : 'must be numeric'),
  });
  if (p.isCancel(chatIdInput)) return cfg.telegram;

  return {
    botToken: String(botToken),
    ownerChatId: Number(chatIdInput),
  };
}
