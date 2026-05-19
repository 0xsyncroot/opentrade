// /unlock <daily-code> — optional 2FA stub. v1 is single-owner whitelist, so
// this is a no-op acknowledgement; an opt-in TOTP/HMAC code check can be wired
// here once the parent `opentrade init` wizard supports it.

import type { Context } from 'grammy';

export function makeUnlockHandler() {
  return async function handleUnlock(ctx: Context): Promise<void> {
    await ctx.reply(
      'Unlock is a stub in v1. Whitelist chat_id is the only gate. ' +
        'Re-run `opentrade init` to enable a rotating daily code.',
    );
  };
}
