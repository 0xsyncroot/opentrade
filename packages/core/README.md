# @0xsyncroot/opentrade-core

Shared core for [`@0xsyncroot/opentrade`](https://www.npmjs.com/package/@0xsyncroot/opentrade) and [`@0xsyncroot/opentrade-bot`](https://www.npmjs.com/package/@0xsyncroot/opentrade-bot). One bundle of GMGN client, zod schemas, services, safety gates, classifier, view builders, and the Intent dispatcher that powers both surfaces.

Most users don't install this directly — the CLI and bot pull it as a workspace/npm dep.

## Public modules

```ts
import { GmgnClient, signEd25519, generateEd25519Keypair } from '@0xsyncroot/opentrade-core/gmgn';
import {
  ScreenSchema, IntentSchema, type Screen, type Intent
} from '@0xsyncroot/opentrade-core/schemas';
import {
  buildBuyScreen, buildSellScreen, buildInfoScreen, buildPositionsScreen, buildHomeScreen, buildHeader
} from '@0xsyncroot/opentrade-core/views';
import {
  fetchTokenSnapshot, buyToken, sellToken, listHoldings
} from '@0xsyncroot/opentrade-core/services';
import { evaluateSecurity, shouldUseAntiMev } from '@0xsyncroot/opentrade-core/safety';
import { classifyInput, parseSlash, SLASH_COMMANDS_HELP } from '@0xsyncroot/opentrade-core/classifier';
import { dispatch, CallbackCache } from '@0xsyncroot/opentrade-core/actions';
import { DEFAULT_PRESETS, presetForChain } from '@0xsyncroot/opentrade-core/presets';
import {
  NATIVE_INPUT_TOKEN, NATIVE_SYMBOL, EXPLORER_TX, type Chain
} from '@0xsyncroot/opentrade-core/chains';
```

## Architecture

```
            User input (paste / keypress / Telegram tap)
                          │
                          ▼
        classifyInput / parseSlash  (pure)
                          │
                          ▼
                 build Intent (zod-validated)
                          │
                          ▼
   ┌───────────────  dispatch(ctx, intent) ───────────────┐
   │                                                       │
   ▼                                                       ▼
 safety gates       services (buyToken / sellToken / …)
 (honeypot/rug/                                            │
  top10/tax/V4)                                            ▼
                                                  GmgnClient (Ed25519)
                                                           │
                                                           ▼
                                                  openapi.gmgn.ai
```

`Screen` JSON is the rendering contract — the Ink TUI and the Telegram bot both consume `Screen` produced by `buildBuyScreen` / `buildSellScreen` / etc, so they stay in lock-step by construction.

## License

MIT
