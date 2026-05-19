// Given a token address (or a URL), guess which chain it belongs to.
// Thin wrapper over core/classifier for the CLI subcommand entry points.

import type { Chain } from '@hiepht/opentrade-core/chains';
import { classifyInput } from '@hiepht/opentrade-core/classifier';

export interface DetectedChain {
  chain: Chain;
  address: string;
  source: 'explicit' | 'classifier' | 'default';
}

export function detectChain(
  input: string,
  opts: { explicit?: Chain; defaultChain: Chain },
): DetectedChain {
  if (opts.explicit) {
    return { chain: opts.explicit, address: input, source: 'explicit' };
  }
  const cls = classifyInput(input, { defaultChain: opts.defaultChain });
  switch (cls.kind) {
    case 'sol_ca':
      return { chain: 'sol', address: cls.address, source: 'classifier' };
    case 'evm_ca': {
      const chain = (cls.chainHint ?? (opts.defaultChain === 'sol' ? 'base' : opts.defaultChain)) as Chain;
      return { chain, address: cls.address, source: 'classifier' };
    }
    case 'url': {
      const addr = cls.extractedAddress ?? input;
      const chain = (cls.chainHint ?? opts.defaultChain) as Chain;
      return { chain, address: addr, source: 'classifier' };
    }
    default:
      return { chain: opts.defaultChain, address: input, source: 'default' };
  }
}
