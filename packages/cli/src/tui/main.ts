// Ink TUI entry. Loaded lazily by bin/opentrade.mjs when:
//   - argv is empty
//   - stdin + stdout are TTYs
//   - --plain was NOT passed
//
// Responsibilities:
//   1. Read XDG config (~/.config/opentrade/config.json) — fail loudly if missing
//   2. Build the GMGN client with API key + Ed25519 PEM
//   3. Render the App component (no altScreen — see render() options)
//   4. Wire Ctrl+C / SIGINT / SIGTERM to a graceful shutdown that also stops the
//      Telegram bot (if running) before unmounting Ink.

import { readFileSync } from 'node:fs';
import process from 'node:process';
import React from 'react';
import { render } from 'ink';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { gmgn } from '@0xsyncroot/opentrade-core';
import type { Chain } from '@0xsyncroot/opentrade-core/chains';
import { App } from './App.js';
import {
  ConfigError,
  loadConfig,
  resolveApiKey,
  resolvePrivateKeyPath,
  resolveWalletAddress,
  type OpentradeConfig,
} from './hooks/useConfig.js';
import { stopBotSafely } from './bot-lifecycle.js';
import { useTuiStore } from './store/index.js';

function readPemSafe(path: string | undefined): string | undefined {
  if (!path) return undefined;
  try {
    return readFileSync(path, 'utf8');
  } catch {
    return undefined;
  }
}

async function main(): Promise<void> {
  let config: OpentradeConfig | undefined;
  try {
    config = loadConfig();
  } catch (err) {
    if (err instanceof ConfigError) {
      process.stderr.write(`opentrade: ${err.message}\n`);
      process.stderr.write(`hint: ${err.hint}\n`);
      // Continue with undefined config — the TUI will render a "no client" state
      // and accept `/init` once Phase 2 ships, but still surface help / quit.
      config = undefined;
    } else {
      throw err;
    }
  }

  const chain: Chain = (config?.defaultChain ?? 'base') as Chain;
  const walletAddress = resolveWalletAddress(config, chain) ?? '';
  const apiKey = resolveApiKey(config);
  const pemPath = resolvePrivateKeyPath(config);
  const privateKeyPem = readPemSafe(pemPath);

  let client: ReturnType<typeof gmgn.GmgnClient.prototype.call> extends never
    ? never
    : InstanceType<typeof gmgn.GmgnClient> | undefined = undefined;
  if (apiKey) {
    try {
      client = new gmgn.GmgnClient({
        apiKey,
        ...(privateKeyPem ? { privateKeyPem } : {}),
      });
    } catch (err) {
      process.stderr.write(`opentrade: failed to construct GMGN client: ${(err as Error).message}\n`);
      client = undefined;
    }
  } else {
    process.stderr.write('opentrade: no GMGN_API_KEY found — run `opentrade init` or set env var.\n');
  }

  const qc = new QueryClient({
    defaultOptions: {
      queries: {
        retry: 1,
        refetchOnWindowFocus: false,
        refetchOnReconnect: false,
        // Re-render only when data changes (keeps Ink quiet).
        structuralSharing: true,
      },
    },
  });

  const tree = React.createElement(
    QueryClientProvider,
    { client: qc },
    React.createElement(App, {
      client,
      config,
      initialChain: chain,
      walletAddress,
    }),
  );

  // render() with exitOnCtrlC=false so we can run cleanup before unmount;
  // patchConsole defaults to true which keeps console.log from corrupting
  // the Ink frame.
  const instance = render(tree, {
    exitOnCtrlC: false,
  });

  const shutdown = async (signal: string): Promise<void> => {
    try {
      const handle = useTuiStore.getState().botHandle;
      await stopBotSafely(handle);
    } catch {
      // best effort
    }
    try {
      instance.unmount();
    } finally {
      // Allow Ink to flush remaining frame before exiting.
      setTimeout(() => process.exit(signal === 'SIGTERM' ? 143 : 0), 50);
    }
  };

  process.on('SIGINT', () => void shutdown('SIGINT'));
  process.on('SIGTERM', () => void shutdown('SIGTERM'));

  await instance.waitUntilExit().catch(() => undefined);
  await shutdown('NORMAL');
}

void main().catch((err) => {
  process.stderr.write(`opentrade fatal: ${(err as Error).stack ?? err}\n`);
  process.exit(1);
});
