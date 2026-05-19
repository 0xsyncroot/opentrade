// `opentrade limit <buy|sell> <chain> <token> <amount> --at <price>`
//
// STATUS: gated for v0.0.6 — the limit-order dispatcher in core/actions
// still returns a stub error ("limit orders: dispatcher path lands with
// Phase 2 CLI integration"). Rather than walking the user through the full
// safety / tier / confirm flow only to fail at the end, this command
// short-circuits with a clear message. Re-enable once the GMGN
// strategy-create endpoint is wired into core/services + dispatcher.

import { defineCommand } from 'citty';
import { flag } from './_shared.js';
import { emitJson, log, color } from '../render/cli-renderer.js';

export const limitCmd = defineCommand({
  meta: { name: 'limit', description: 'place a limit order (coming soon)' },
  args: {
    side: { type: 'positional', required: false, description: 'buy | sell' },
    chain: { type: 'positional', required: false },
    token: { type: 'positional', required: false },
    amount: { type: 'positional', required: false, description: 'native amount or percent' },
    at: { type: 'string', description: 'trigger price (USD)' },
    expire: { type: 'string', description: 'expire window (e.g. 24h)' },
    slip: { type: 'string', description: 'slippage %' },
    yes: { type: 'boolean' },
    'dry-run': { type: 'boolean' },
    'allow-risky': { type: 'boolean' },
    json: { type: 'boolean' },
  },
  run({ args }) {
    if (flag(args as Record<string, unknown>, 'json')) {
      emitJson({ ok: false, reason: 'not_implemented', message: 'limit orders not yet wired' });
    } else {
      log.error(
        color.red(
          'opentrade limit — GMGN strategy-create endpoint not yet wired in this build.',
        ),
      );
      log.info(
        color.dim(
          'Use the GMGN web UI for limit orders, or wait for an upcoming release. Track progress at https://github.com/0xsyncroot/opentrade/issues.',
        ),
      );
    }
    process.exit(2);
  },
});
