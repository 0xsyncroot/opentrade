# Multi-stage Dockerfile for headless `opentrade-bot` (VPS deploy).
#
# IMPORTANT (plan §"Bot deploy lộ key"): never bake `~/.config/opentrade/` into
# the image. Mount it read-only at runtime:
#
#   docker run --rm \
#     -v $HOME/.config/opentrade:/root/.config/opentrade:ro \
#     -e TELEGRAM_BOT_TOKEN \
#     -e TELEGRAM_OWNER_CHAT_ID \
#     -e GMGN_API_KEY \
#     hiepht/opentrade-bot:latest

# ---------- deps ----------
FROM node:20-slim AS deps
WORKDIR /app
RUN corepack enable && corepack prepare pnpm@9.12.0 --activate
COPY pnpm-workspace.yaml package.json pnpm-lock.yaml ./
COPY packages/core/package.json packages/core/
COPY packages/bot/package.json packages/bot/
RUN pnpm install --frozen-lockfile --filter @hiepht/opentrade-bot...

# ---------- build ---------
FROM deps AS build
COPY tsconfig.base.json ./
COPY packages/core packages/core
COPY packages/bot packages/bot
RUN pnpm --filter @hiepht/opentrade-core build
RUN pnpm --filter @hiepht/opentrade-bot build

# ---------- runtime -------
FROM node:20-slim AS runtime
WORKDIR /app
ENV NODE_ENV=production
COPY --from=build /app/packages/core/dist /app/packages/core/dist
COPY --from=build /app/packages/core/package.json /app/packages/core/package.json
COPY --from=build /app/packages/bot/dist /app/packages/bot/dist
COPY --from=build /app/packages/bot/package.json /app/packages/bot/package.json
COPY --from=build /app/node_modules /app/node_modules
COPY --from=build /app/packages/bot/node_modules /app/packages/bot/node_modules

# Mount target: ~/.config/opentrade  →  /root/.config/opentrade (read-only).
VOLUME ["/root/.config/opentrade"]

CMD ["node", "packages/bot/dist/main.js"]
