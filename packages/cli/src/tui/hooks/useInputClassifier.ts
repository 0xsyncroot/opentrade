// Thin wrapper around core/classifier.classifyInput with a 50ms debounce so we
// don't re-classify on every keystroke while the user is mid-paste.

import { classifier } from '@0xsyncroot/opentrade-core';
import type { Chain } from '@0xsyncroot/opentrade-core/chains';
import { useEffect, useState } from 'react';

const { classifyInput } = classifier;
type InputClass = ReturnType<typeof classifyInput>;

export function useInputClassifier(text: string, ctx: { defaultChain: Chain }): InputClass {
  const [result, setResult] = useState<InputClass>(() =>
    classifyInput(text, { defaultChain: ctx.defaultChain }),
  );

  useEffect(() => {
    const t = setTimeout(() => {
      setResult(classifyInput(text, { defaultChain: ctx.defaultChain }));
    }, 50);
    return () => clearTimeout(t);
  }, [text, ctx.defaultChain]);

  return result;
}
