// useAbortable — verify the race-safety ticket pattern.
// We can't directly call hooks outside React, but the logic is self-contained
// enough that we can model it inline (and the hook itself is a thin wrapper
// over the same logic) — the cheaper test is to exercise the contract via a
// minimal renderer.

import { render } from 'ink-testing-library';
import { Text } from 'ink';
import React, { useEffect, useRef, useState } from 'react';
import { describe, expect, it } from 'vitest';
import { useAbortable } from './useAbortable.js';

const Harness: React.FC<{
  onTicket: (n: number) => void;
  onStale: (s: boolean) => void;
  initiateCount: number;
}> = ({ onTicket, onStale, initiateCount }) => {
  const ab = useAbortable();
  const [done, setDone] = useState(false);
  const onceRef = useRef(false);

  useEffect(() => {
    if (onceRef.current) return;
    onceRef.current = true;
    let first = 0;
    for (let i = 0; i < initiateCount; i++) {
      const t = ab.next();
      onTicket(t);
      if (i === 0) first = t;
    }
    onStale(ab.isStale(first));
    setDone(true);
  }, [ab, initiateCount, onStale, onTicket]);

  return React.createElement(Text, null, done ? 'done' : 'pending');
};

describe('useAbortable', () => {
  it('next() returns strictly increasing tickets and isStale flags older ones', async () => {
    const tickets: number[] = [];
    let stale = false;
    render(
      <Harness initiateCount={3} onTicket={(t) => tickets.push(t)} onStale={(s) => (stale = s)} />,
    );
    // useEffect runs after the first paint — wait one tick.
    await new Promise((r) => setTimeout(r, 30));
    expect(tickets).toEqual([1, 2, 3]);
    expect(stale).toBe(true);
  });

  it('single next() ticket is NOT stale', async () => {
    let stale = false;
    render(
      <Harness initiateCount={1} onTicket={() => undefined} onStale={(s) => (stale = s)} />,
    );
    await new Promise((r) => setTimeout(r, 30));
    expect(stale).toBe(false);
  });
});
