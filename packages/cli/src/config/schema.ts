// Zod schemas for the user-writable config files under ~/.config/opentrade/.
//
// All files are JSON. Loose validation — unknown fields are dropped so an older
// CLI doesn't choke on a newer field.

import { z } from 'zod';

export const ChainEnum = z.enum(['base', 'sol', 'eth', 'bsc']);
export type CfgChain = z.infer<typeof ChainEnum>;

export const ConfigSchema = z.object({
  version: z.literal(1).default(1),
  defaultChain: ChainEnum.default('base'),
  gmgn: z
    .object({
      apiKey: z.string().min(1).optional(),
      privateKeyPath: z.string().optional(),
      privateKeyPassphrase: z.string().optional(),
    })
    .default({}),
  wallets: z.record(ChainEnum, z.string()).default({}),
  telegram: z
    .object({
      botToken: z.string().optional(),
      ownerChatId: z.union([z.string(), z.number()]).optional(),
      /** User has explicitly opted out — TUI must not auto-spawn the bot. */
      disabled: z.boolean().optional(),
      /** User skipped the init step but didn't opt out — TUI shows a hint. */
      deferred: z.boolean().optional(),
    })
    .optional(),
  noConfirm: z.boolean().default(false),
  whitelistOnly: z.boolean().default(false),
  /** Override the audit log dual-write target (defaults: configDir + workspace). */
  auditLogDir: z.string().optional(),
});
export type OpentradeConfig = z.infer<typeof ConfigSchema>;

export const AddressBookEntrySchema = z.object({
  alias: z.string().min(1),
  chain: ChainEnum,
  address: z.string().min(1),
  note: z.string().optional(),
  whitelisted: z.boolean().default(false),
  isContract: z.boolean().default(false),
  addedAtUtc: z.string(),
});
export type AddressBookEntry = z.infer<typeof AddressBookEntrySchema>;

export const AddressBookFileSchema = z.object({
  version: z.literal(1).default(1),
  entries: z.array(AddressBookEntrySchema).default([]),
});
export type AddressBookFile = z.infer<typeof AddressBookFileSchema>;

export const AliasSchema = z.object({
  name: z.string().min(1),
  chain: ChainEnum,
  token: z.string(),
  defaultAmount: z.number().optional(),
  defaultSlippageBps: z.number().int().optional(),
  tpPct: z.number().int().optional(),
  slPct: z.number().int().optional(),
});
export type Alias = z.infer<typeof AliasSchema>;

export const AliasesFileSchema = z.object({
  version: z.literal(1).default(1),
  aliases: z.record(z.string(), AliasSchema).default({}),
});
export type AliasesFile = z.infer<typeof AliasesFileSchema>;

export const HistoryFileSchema = z.object({
  version: z.literal(1).default(1),
  recent: z.array(z.string()).default([]),
});
export type HistoryFile = z.infer<typeof HistoryFileSchema>;
