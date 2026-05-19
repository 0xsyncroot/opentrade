// Webhook server scaffolding. Polling is the default v1 surface and uses
// grammY's built-in long-poll; this file exists so we can flip to webhook
// without restructuring (plan §"Polling vs webhook").
//
// Wire-up for webhook lives here; `startBot()` simply imports `startWebhook`
// when `mode === 'webhook'`. For v1 we keep it as a placeholder so the bot
// stays minimal but the surface is reserved.

import http from 'node:http';
import type { Bot } from 'grammy';

export interface WebhookServerOptions {
  port: number;
  path?: string; // e.g. '/tg/<secret>'
}

export interface WebhookServerHandle {
  close(): Promise<void>;
}

/**
 * Spin up a tiny `node:http` server and forward incoming POSTs to
 * `bot.handleUpdate`. Sufficient for behind a Cloudflare Tunnel / Caddy.
 */
export function startWebhook(bot: Bot, opts: WebhookServerOptions): WebhookServerHandle {
  const path = opts.path ?? '/';
  const server = http.createServer(async (req, res) => {
    if (req.method !== 'POST' || req.url !== path) {
      res.statusCode = 404;
      res.end();
      return;
    }
    let raw = '';
    req.setEncoding('utf8');
    req.on('data', (chunk) => {
      raw += chunk;
    });
    req.on('end', async () => {
      try {
        const update = JSON.parse(raw);
        await bot.handleUpdate(update);
        res.statusCode = 200;
        res.end();
      } catch (err) {
        res.statusCode = 500;
        res.end((err as Error).message);
      }
    });
  });
  server.listen(opts.port);
  return {
    close: () =>
      new Promise<void>((resolve, reject) => {
        server.close((err) => (err ? reject(err) : resolve()));
      }),
  };
}
