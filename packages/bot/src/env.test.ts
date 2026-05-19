// P0-4 — bot env loader must read the CANONICAL camelCase nested config shape
// produced by the CLI (`telegram.botToken`, `gmgn.apiKey`, `wallets.base`).
// The previous loader expected legacy snake_case top-level keys
// (`telegram_bot_token`, `gmgn_api_key`, `wallet_base`) so the bot
// effectively saw no config and refused to start when `init` had written
// the canonical shape.

import { describe, expect, it } from 'vitest';
import { loadBotEnv } from './env.js';

describe('loadBotEnv (P0-4 — canonical config shape)', () => {
  it('reads telegram.botToken + telegram.ownerChatId from nested camelCase', () => {
    const env = loadBotEnv({
      env: {},
      configOverride: {
        telegram: {
          botToken: '123456789:abcDEFghiJKLmnoPQRstuVWXyz',
          ownerChatId: '12345',
        },
        gmgn: { apiKey: 'gmgn_api_key_long_enough' },
        wallets: { base: '0x1111111111111111111111111111111111111111' },
        defaultChain: 'base',
      },
    });
    expect(env.telegramBotToken).toBe('123456789:abcDEFghiJKLmnoPQRstuVWXyz');
    expect(env.telegramOwnerChatId).toBe('12345');
    expect(env.gmgnApiKey).toBe('gmgn_api_key_long_enough');
    expect(env.walletBase).toBe('0x1111111111111111111111111111111111111111');
    expect(env.defaultChain).toBe('base');
  });

  it('numeric ownerChatId from config is coerced to string', () => {
    const env = loadBotEnv({
      env: {},
      configOverride: {
        telegram: {
          botToken: '123456789:abcDEFghiJKLmnoPQRstuVWXyz',
          ownerChatId: 98765,
        },
        gmgn: { apiKey: 'gmgn_api_key_long_enough' },
      },
    });
    expect(env.telegramOwnerChatId).toBe('98765');
  });

  it('process.env overrides config (env wins)', () => {
    const env = loadBotEnv({
      env: {
        TELEGRAM_BOT_TOKEN: 'override_token_long_enough',
        TELEGRAM_OWNER_CHAT_ID: '99999',
        GMGN_API_KEY: 'env_api_key_long',
      },
      configOverride: {
        telegram: {
          botToken: 'config_token_long_enough',
          ownerChatId: '11111',
        },
        gmgn: { apiKey: 'config_api_key_long' },
      },
    });
    expect(env.telegramBotToken).toBe('override_token_long_enough');
    expect(env.telegramOwnerChatId).toBe('99999');
    expect(env.gmgnApiKey).toBe('env_api_key_long');
  });

  it('throws clearly when telegramBotToken missing', () => {
    expect(() =>
      loadBotEnv({
        env: {},
        configOverride: {
          telegram: { ownerChatId: '12345' },
          gmgn: { apiKey: 'long_enough_api_key' },
        },
      }),
    ).toThrow(/telegramBotToken/);
  });

  it('throws when telegramOwnerChatId is non-numeric', () => {
    expect(() =>
      loadBotEnv({
        env: {},
        configOverride: {
          telegram: { botToken: 'longenough_bottoken_xx', ownerChatId: 'not-a-number' },
          gmgn: { apiKey: 'long_enough_api_key' },
        },
      }),
    ).toThrow();
  });
});
