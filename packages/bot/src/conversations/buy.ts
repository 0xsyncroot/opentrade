// Multi-step buy wizard scaffolding — placeholder. The plan reserves this slot
// for a power-user flow:
//   pick chain → CA → preview → slip → MEV → confirm
//
// v1 ships the paste-CA quick path + InlineKeyboard preset row, which covers
// 95% of the journey. We leave a small typed builder here so the wizard can
// snap in without changing the rest of the bot wiring.

import type { schemas } from '@0xsyncroot/opentrade-core';

export interface BuyWizardState {
  chain?: schemas.Chain;
  token?: string;
  amountWei?: string;
  slippageBps?: number;
  antiMev?: 'on' | 'off' | 'auto';
}

export type BuyWizardStep =
  | 'pick_chain'
  | 'paste_ca'
  | 'preview'
  | 'pick_slip'
  | 'pick_mev'
  | 'confirm';

export interface BuyWizardController {
  state: BuyWizardState;
  step: BuyWizardStep;
  setStep(step: BuyWizardStep): void;
  setState(patch: Partial<BuyWizardState>): void;
}

export function makeBuyWizard(): BuyWizardController {
  let step: BuyWizardStep = 'pick_chain';
  const state: BuyWizardState = {};
  return {
    state,
    get step() {
      return step;
    },
    setStep(s) {
      step = s;
    },
    setState(patch) {
      Object.assign(state, patch);
    },
  };
}
