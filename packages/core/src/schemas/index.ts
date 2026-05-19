// zod schemas — single source of truth for runtime validation across CLI args,
// TUI input, and Telegram payloads.

import { z } from 'zod';

export const ChainSchema = z.enum(['base', 'sol', 'eth', 'bsc']);
export type Chain = z.infer<typeof ChainSchema>;

const EVM_ADDR = /^0x[a-fA-F0-9]{40}$/;
const SOL_ADDR = /^[1-9A-HJ-NP-Za-km-z]{32,44}$/;

export const EvmAddressSchema = z.string().regex(EVM_ADDR, 'invalid EVM address');
export const SolAddressSchema = z.string().regex(SOL_ADDR, 'invalid Solana address');
export const AddressSchema = z.union([EvmAddressSchema, SolAddressSchema]);

export const AmountWeiSchema = z
  .string()
  .regex(/^\d+$/, 'amount must be a positive integer string (raw smallest unit)');

export const PercentSchema = z.number().int().min(1).max(100);
export const SlippageBpsSchema = z.number().int().min(1).max(9999);

export const TpSlTierSchema = z.object({
  pricePct: z.number().int().positive(), // e.g. 50 = +50%
  sellPct: z.number().int().min(1).max(100), // e.g. 50 = sell 50%
});
export type TpSlTier = z.infer<typeof TpSlTierSchema>;

// -- Intent (dispatcher payload). Sum-type. ---------------------------------

export const BuyIntentSchema = z.object({
  kind: z.literal('buy'),
  chain: ChainSchema,
  token: AddressSchema,
  amountWei: AmountWeiSchema,
  slippageBps: SlippageBpsSchema,
  antiMev: z.enum(['on', 'off', 'auto']).default('auto'),
  tp: z.array(TpSlTierSchema).optional(),
  sl: z.array(TpSlTierSchema).optional(),
  trailTpPct: z.number().int().positive().optional(),
  trailSlPct: z.number().int().positive().optional(),
});
export type BuyIntent = z.infer<typeof BuyIntentSchema>;

export const SellIntentSchema = z.object({
  kind: z.literal('sell'),
  chain: ChainSchema,
  token: AddressSchema,
  percent: PercentSchema,
  slippageBps: SlippageBpsSchema,
  antiMev: z.enum(['on', 'off', 'auto']).default('auto'),
});
export type SellIntent = z.infer<typeof SellIntentSchema>;

export const SendIntentSchema = z.object({
  kind: z.literal('send'),
  chain: ChainSchema,
  token: AddressSchema, // native sentinel = NATIVE_INPUT_TOKEN[chain]
  amountWei: AmountWeiSchema,
  to: z.string(), // resolved EVM/Sol address
});
export type SendIntent = z.infer<typeof SendIntentSchema>;

export const LimitIntentSchema = z.object({
  kind: z.literal('limit'),
  side: z.enum(['buy', 'sell']),
  chain: ChainSchema,
  token: AddressSchema,
  amountWei: AmountWeiSchema.optional(),
  amountPct: PercentSchema.optional(),
  triggerPriceUsd: z.number().positive(),
  slippageBps: SlippageBpsSchema.optional(),
  expireSec: z.number().int().positive().optional(),
});
export type LimitIntent = z.infer<typeof LimitIntentSchema>;

export const SwitchModeIntentSchema = z.object({
  kind: z.literal('switch_mode'),
  to: z.enum(['buy', 'sell']),
});

export const RefreshIntentSchema = z.object({ kind: z.literal('refresh') });
export const OpenPositionsIntentSchema = z.object({ kind: z.literal('open_positions') });
export const OpenSlashIntentSchema = z.object({ kind: z.literal('open_slash') });
export const SetChainIntentSchema = z.object({
  kind: z.literal('set_chain'),
  chain: ChainSchema,
});
export const QuitIntentSchema = z.object({ kind: z.literal('quit') });

export const IntentSchema = z.discriminatedUnion('kind', [
  BuyIntentSchema,
  SellIntentSchema,
  SendIntentSchema,
  LimitIntentSchema,
  SwitchModeIntentSchema,
  RefreshIntentSchema,
  OpenPositionsIntentSchema,
  OpenSlashIntentSchema,
  SetChainIntentSchema,
  QuitIntentSchema,
]);
export type Intent = z.infer<typeof IntentSchema>;

// -- Screen schema (renderer contract) --------------------------------------

export const SafetyGateSchema = z.object({
  key: z.string(), // 'honeypot', 'rug', 'top10', 'buy_tax', 'sell_tax', 'renounced', 'open_source'
  label: z.string(),
  value: z.string(),
  level: z.enum(['ok', 'warn', 'block']),
});
export type SafetyGate = z.infer<typeof SafetyGateSchema>;

export const BlockSchema = z.discriminatedUnion('type', [
  z.object({
    type: z.literal('text'),
    text: z.string(),
    tone: z.enum(['info', 'warn', 'error', 'success']).optional(),
  }),
  z.object({
    type: z.literal('kv'),
    pairs: z.array(z.tuple([z.string(), z.string()])),
  }),
  z.object({
    type: z.literal('table'),
    headers: z.array(z.string()),
    rows: z.array(z.array(z.string())),
  }),
  z.object({
    type: z.literal('safety'),
    gates: z.array(SafetyGateSchema),
  }),
  z.object({
    type: z.literal('holding'),
    amount: z.string(),
    symbol: z.string(),
    usd: z.string(),
    pnlUsd: z.string(),
    pnlPct: z.string(),
  }),
  z.object({
    type: z.literal('spinner'),
    label: z.string(),
  }),
  z.object({
    type: z.literal('divider'),
  }),
]);
export type Block = z.infer<typeof BlockSchema>;

export const ActionButtonSchema = z.object({
  id: z.string(), // short slug — 'b1', 'b2', 's25', 'tab', ...
  label: z.string(),
  hotkey: z.string().optional(),
  intent: IntentSchema,
  tone: z.enum(['primary', 'danger', 'warn', 'muted']).optional(),
});
export type ActionButton = z.infer<typeof ActionButtonSchema>;

export const ScreenHeaderSchema = z.object({
  chain: ChainSchema,
  walletShort: z.string(), // e.g. '0xH3...4a'
  balanceNative: z.string(), // e.g. '1.2345'
  balanceUsd: z.string(), // e.g. '$1,234.56'
  openPositions: z.number().int().nonnegative(),
  gasEstUsd: z.string().optional(),
});
export type ScreenHeader = z.infer<typeof ScreenHeaderSchema>;

export const ScreenSchema = z.object({
  kind: z.enum(['home', 'buy', 'sell', 'info', 'positions', 'feed', 'send', 'help', 'error']),
  title: z.string().optional(),
  header: ScreenHeaderSchema,
  body: z.array(BlockSchema),
  actions: z.array(ActionButtonSchema),
  hints: z.array(z.string()).optional(),
});
export type Screen = z.infer<typeof ScreenSchema>;
