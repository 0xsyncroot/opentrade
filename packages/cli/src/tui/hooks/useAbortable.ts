// AbortController helper + inflightSeq race guard.
//
// Usage:
//   const abortable = useAbortable();
//   const seq = abortable.next();
//   const ctrl = abortable.controller;
//   try {
//     const res = await fetchTokenSnapshot(client, { ..., signal: ctrl.signal });
//     if (abortable.isStale(seq)) return;        // a newer paste landed first
//     commit(res);
//   } catch (e) { if (ctrl.signal.aborted) return; throw e; }

import { useEffect, useRef } from 'react';

export interface Abortable {
  /** Increment seq and return the new ticket. Aborts any prior controller. */
  next: () => number;
  /** Current controller. Stable per `next()` call. */
  controller: AbortController;
  /** True when the ticket is older than the latest issued one. */
  isStale: (ticket: number) => boolean;
  /** Manually abort whatever is in flight. */
  abort: () => void;
}

export function useAbortable(): Abortable {
  const seqRef = useRef(0);
  const ctrlRef = useRef<AbortController>(new AbortController());

  // Cancel inflight work when the component unmounts.
  useEffect(() => {
    return () => {
      ctrlRef.current.abort();
    };
  }, []);

  return {
    next: () => {
      ctrlRef.current.abort();
      ctrlRef.current = new AbortController();
      seqRef.current += 1;
      return seqRef.current;
    },
    get controller() {
      return ctrlRef.current;
    },
    isStale: (ticket: number) => ticket !== seqRef.current,
    abort: () => {
      ctrlRef.current.abort();
    },
  };
}
