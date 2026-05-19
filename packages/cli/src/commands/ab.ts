// `opentrade ab {add|ls|rm|whitelist}` — address book.

import { defineCommand } from 'citty';
import type { Chain } from '@0xsyncroot/opentrade-core/chains';
import { EXPLORER_ADDR } from '@0xsyncroot/opentrade-core/chains';
import { bootstrap, exitWithError, flag, parseChainArg } from './_shared.js';
import { readAddressBook, writeAddressBook } from '../config/load.js';
import type { AddressBookEntry } from '../config/schema.js';
import { emitJson, log, renderTable } from '../render/cli-renderer.js';

export const abCmd = defineCommand({
  meta: { name: 'ab', description: 'address book (send recipients)' },
  args: {
    op: { type: 'positional', required: true, description: 'add | ls | rm | whitelist' },
    chain: { type: 'positional', required: false },
    alias: { type: 'positional', required: false },
    address: { type: 'positional', required: false },
    note: { type: 'string' },
    contract: { type: 'boolean', description: 'mark this entry as a contract (require --allow-contract)' },
    json: { type: 'boolean' },
  },
  async run({ args }) {
    const ctx = await bootstrap();
    const ab = readAddressBook(ctx.loaded.paths);

    switch (args.op) {
      case 'ls': {
        if (flag(args as Record<string, unknown>, 'json')) emitJson(ab);
        else
          renderTable(
            ['alias', 'chain', 'address', 'wl', 'contract', 'added'],
            ab.entries.map((e) => [
              e.alias,
              e.chain,
              e.address,
              e.whitelisted ? 'yes' : '-',
              e.isContract ? 'yes' : '-',
              e.addedAtUtc,
            ]),
          );
        return;
      }
      case 'add': {
        if (!args.chain || !args.alias || !args.address) exitWithError('ab add: chain alias address required');
        const chain = parseChainArg(args.chain, ctx.loaded.config.defaultChain) as Chain;
        if (ab.entries.find((e) => e.alias === args.alias && e.chain === chain))
          exitWithError(`alias '${args.alias}' already exists on ${chain}`);
        const entry: AddressBookEntry = {
          alias: args.alias,
          chain,
          address: args.address,
          ...(args.note ? { note: args.note } : {}),
          whitelisted: false,
          isContract: flag(args as Record<string, unknown>, 'contract'),
          addedAtUtc: new Date().toISOString(),
        };
        ab.entries.push(entry);
        writeAddressBook(ctx.loaded.paths, ab);
        log.success(`added @${entry.alias} (${entry.chain}) → ${entry.address}`);
        log.info(`verify on explorer: ${EXPLORER_ADDR[chain](entry.address)}`);
        log.info('60s cooldown before this address accepts sends.');
        return;
      }
      case 'rm': {
        if (!args.alias) exitWithError('ab rm: alias required');
        const before = ab.entries.length;
        ab.entries = ab.entries.filter((e) => !(e.alias === args.alias && (!args.chain || e.chain === args.chain)));
        writeAddressBook(ctx.loaded.paths, ab);
        log.success(`removed ${before - ab.entries.length} entries`);
        return;
      }
      case 'whitelist': {
        if (!args.alias) exitWithError('ab whitelist: alias required');
        const e = ab.entries.find((x) => x.alias === args.alias && (!args.chain || x.chain === args.chain));
        if (!e) exitWithError(`alias not found: ${args.alias}`);
        e.whitelisted = true;
        writeAddressBook(ctx.loaded.paths, ab);
        log.success(`whitelisted @${e.alias} (${e.chain})`);
        return;
      }
      default:
        exitWithError(`unknown ab op: ${args.op}`);
    }
  },
});
