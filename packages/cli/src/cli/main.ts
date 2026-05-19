// Non-TUI fast-path entry (citty subcommands).
//
// Loaded by bin/opentrade.mjs when:
//   - any arg present
//   - stdin/stdout not a TTY
//   - --plain flag passed

import { defineCommand, runMain } from 'citty';
import { buyCmd } from '../commands/buy.js';
import { sellCmd } from '../commands/sell.js';
import { limitCmd } from '../commands/limit.js';
import { quoteCmd } from '../commands/quote.js';
import { psCmd } from '../commands/ps.js';
import { wCmd } from '../commands/w.js';
import { holdingsCmd } from '../commands/holdings.js';
import { infoCmd } from '../commands/info.js';
import { ordersCmd } from '../commands/orders.js';
import { sendCmd } from '../commands/send.js';
import { abCmd } from '../commands/ab.js';
import { aliasCmd } from '../commands/alias.js';
import { feedCmd } from '../commands/feed.js';
import { configCmd } from '../commands/config.js';
import { initCmd } from '../commands/init.js';
import { keygenCmd } from '../commands/keygen.js';
import { botCmd } from '../commands/bot.js';

const main = defineCommand({
  meta: {
    name: 'opentrade',
    version: '0.0.8',
    description:
      'Fast GMGN trading CLI — interactive TUI (zero-arg) + non-interactive subcommands. Base / Solana / ETH / BSC.',
  },
  args: {
    plain: { type: 'boolean', description: 'force non-TUI plain output (handled by shim)' },
  },
  subCommands: {
    buy: buyCmd,
    b: buyCmd,
    sell: sellCmd,
    s: sellCmd,
    limit: limitCmd,
    quote: quoteCmd,
    ps: psCmd,
    w: wCmd,
    holdings: holdingsCmd,
    info: infoCmd,
    orders: ordersCmd,
    send: sendCmd,
    ab: abCmd,
    alias: aliasCmd,
    feed: feedCmd,
    config: configCmd,
    init: initCmd,
    keygen: keygenCmd,
    bot: botCmd,
  },
  run({ rawArgs }) {
    // citty calls the root `run` even after dispatching a subcommand. Suppress
    // the banner when the user provided one — we only want this for plain
    // `opentrade --plain` (subcommand-less fast-path invocation).
    const hasSubcommand = rawArgs.some((a) => !a.startsWith('-'));
    if (hasSubcommand) return;
    process.stdout.write(
      [
        'opentrade — fast GMGN trading CLI',
        '',
        'Usage:',
        '  opentrade                              # interactive TUI (zero-arg in a TTY)',
        '  opentrade <subcommand> ...             # non-interactive fast-path',
        '',
        'Top subcommands:',
        '  buy | sell | limit | quote             trading',
        '  ps | w | holdings | info               read state',
        '  orders                                 GMGN strategy orders',
        '  send | ab | alias                      transfer + helpers',
        '  feed                                   trending / sm / kol / kline',
        '  init | keygen | config | bot           setup + lifecycle',
        '',
        'Run `opentrade <subcommand> --help` for flags.',
        '',
      ].join('\n'),
    );
  },
});

runMain(main);
