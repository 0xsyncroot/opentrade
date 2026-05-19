// `opentrade send <chain> <token> <amount> <to|@alias>`
//
// Implements the multi-layer send safety described in the plan:
//  1. Resolve @alias against the address book, OR raw address lookup
//  2. First-time-address protocol — require add-to-book + cooldown
//  3. Whitelist-only mode (config.whitelistOnly)
//  4. Contract address detection — block unless --allow-contract
//  5. Tiered amount confirm (decideTier with isSend=true → T2)
//
// Actual native transfer (viem / @solana/web3.js) is not part of v1 — we surface
// a clear "send pipe needs wallet signer" message if `--yes` is passed without
// --dry-run. `--dry-run` still walks all safety layers, which is the whole point
// of letting users practice the muscle memory first.

import { defineCommand } from 'citty';
import type { Chain } from '@hiepht/opentrade-core/chains';
import { isEvmChain, NATIVE_INPUT_TOKEN, NATIVE_SYMBOL, nativeAmountToWei } from '@hiepht/opentrade-core/chains';
import { SendIntentSchema, type SendIntent } from '@hiepht/opentrade-core/schemas';
import { bootstrap, exitWithError, flag, parseChainArg } from './_shared.js';
import { decideTier, runConfirmation } from '../safety/confirm.js';
import { emitJson, log, color } from '../render/cli-renderer.js';
import { walletFor } from '../config/wallets.js';
import { readAddressBook, writeAddressBook } from '../config/load.js';
import type { AddressBookEntry } from '../config/schema.js';

const EVM_RE = /^0x[a-fA-F0-9]{40}$/;
const SOL_RE = /^[1-9A-HJ-NP-Za-km-z]{32,44}$/;

export const sendCmd = defineCommand({
  meta: { name: 'send', description: 'same-chain native send (CEX/cold wallet)' },
  args: {
    chain: { type: 'positional', required: true },
    token: { type: 'positional', required: true, description: "'native' or token address" },
    amount: { type: 'positional', required: true },
    to: { type: 'positional', required: true, description: 'address or @alias' },
    'allow-contract': { type: 'boolean', description: 'allow sending to a contract' },
    yes: { type: 'boolean' },
    'dry-run': { type: 'boolean' },
    json: { type: 'boolean' },
  },
  async run({ args }) {
    const ctx = await bootstrap();
    const chain = parseChainArg(args.chain, ctx.loaded.config.defaultChain) as Chain;
    const wallet = walletFor(ctx.loaded.config, chain);
    if (!wallet) exitWithError(`no wallet for chain '${chain}'`);

    // Resolve destination (alias or raw address)
    const ab = readAddressBook(ctx.loaded.paths);
    let destination: string | undefined;
    let abEntry: AddressBookEntry | undefined;
    if (args.to.startsWith('@')) {
      const alias = args.to.slice(1);
      abEntry = ab.entries.find((e) => e.alias === alias && e.chain === chain);
      if (!abEntry) exitWithError(`alias not found in address book: @${alias} (chain=${chain})`);
      destination = abEntry.address;
    } else {
      destination = args.to;
      abEntry = ab.entries.find((e) => e.address.toLowerCase() === args.to.toLowerCase() && e.chain === chain);
    }

    // Validate format
    if (isEvmChain(chain) && !EVM_RE.test(destination!)) exitWithError(`destination is not a valid ${chain} address`);
    if (chain === 'sol' && !SOL_RE.test(destination!)) exitWithError('destination is not a valid Solana address');

    // Whitelist-only check
    if (ctx.loaded.config.whitelistOnly && !(abEntry && abEntry.whitelisted)) {
      exitWithError(
        `config.whitelistOnly=true — destination must be a whitelisted address-book entry. Add with: opentrade ab add ${chain} <alias> ${destination}`,
      );
    }

    // First-time-address protocol
    if (!abEntry) {
      log.warn(
        `${color.yellow('!')} first-time send to this address. Add it to the address book first: opentrade ab add ${chain} <alias> ${destination}`,
      );
      if (!flag(args as Record<string, unknown>, 'dry-run') && !flag(args as Record<string, unknown>, 'yes')) {
        process.exit(2);
      }
    } else {
      const ageSec = (Date.now() - Date.parse(abEntry.addedAtUtc)) / 1000;
      if (ageSec < 60) {
        log.warn(
          `${color.yellow('!')} address added ${ageSec.toFixed(0)}s ago — 60s cooldown active. Wait before sending.`,
        );
        if (!flag(args as Record<string, unknown>, 'dry-run')) process.exit(2);
      }
      if (abEntry.isContract && !flag(args as Record<string, unknown>, 'allow-contract')) {
        exitWithError('address-book entry marked as contract — pass --allow-contract to send');
      }
    }

    // Build intent
    const tokenAddr =
      args.token.toLowerCase() === 'native' ? NATIVE_INPUT_TOKEN[chain] : args.token;
    const amountWei = nativeAmountToWei(chain, Number(args.amount)).toString();
    const intent: SendIntent = SendIntentSchema.parse({
      kind: 'send',
      chain,
      token: tokenAddr,
      amountWei,
      to: destination!,
    });

    const decision = decideTier({ intent, isSend: true, noConfirm: ctx.loaded.config.noConfirm });
    const preview = [
      `${color.bold('Send')} ${args.amount} ${NATIVE_SYMBOL[chain]} on ${chain}`,
      `  to ${destination} ${abEntry ? `(@${abEntry.alias})` : ''}`,
      `  tier=${decision.tier}  reason=${decision.reason}`,
    ];

    if (flag(args as Record<string, unknown>, 'dry-run')) {
      emitJson({ kind: 'dry-run', intent, abEntry, preview });
      return;
    }

    const ok = await runConfirmation({
      tier: decision.tier,
      intent,
      previewLines: preview,
      forceYes: flag(args as Record<string, unknown>, 'yes'),
    });
    if (!ok) {
      log.warn('cancelled');
      process.exit(1);
    }

    // v1: the actual native transfer requires a signer; core service throws a
    // descriptive error. Surface it.
    log.error(
      'send: native chain RPC transfer not yet wired in v1. Use a wallet UI for the final on-chain send, or wait for the viem/@solana/web3.js integration in a follow-up.',
    );
    process.exit(2);
  },
});

// -- sub-helpers --------------------------------------------------------------

export function detectIfContract(_chain: Chain, _addr: string): boolean {
  // v1: no on-chain RPC call — caller decides via address-book flag.
  return false;
}

export { readAddressBook, writeAddressBook };
