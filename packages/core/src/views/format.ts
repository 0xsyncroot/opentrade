// Tiny formatting helpers reused by all Screen builders so number rendering is
// consistent across CLI subcommands, TUI, and Telegram bot.

const USD = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' });

export function shortAddr(addr: string, head = 4, tail = 4): string {
  if (!addr) return '';
  if (addr.length <= head + tail + 2) return addr;
  return `${addr.slice(0, 2 + head)}…${addr.slice(-tail)}`;
}

export function fmtUsd(v: number | string | undefined): string {
  if (v === undefined || v === null) return '—';
  const n = typeof v === 'string' ? Number(v) : v;
  if (!Number.isFinite(n)) return '—';
  if (Math.abs(n) >= 1000) return USD.format(Math.round(n));
  if (Math.abs(n) >= 1) return USD.format(Number(n.toFixed(2)));
  if (Math.abs(n) >= 0.01) return USD.format(Number(n.toFixed(4)));
  // Sub-cent price common for memecoins — compact scientific
  return `$${n.toExponential(2)}`;
}

export function fmtPct(v: number | undefined, fractionDigits = 2): string {
  if (v === undefined || v === null || !Number.isFinite(v)) return '—';
  const sign = v > 0 ? '+' : '';
  return `${sign}${(v * 100).toFixed(fractionDigits)}%`;
}

export function fmtPctDelta(v: number | undefined, fractionDigits = 2): string {
  // GMGN sometimes returns percentages as already-x100 numbers. Defensive scale.
  if (v === undefined || v === null || !Number.isFinite(v)) return '—';
  if (Math.abs(v) > 1.5) {
    // Already a percentage number (e.g. 12.4)
    const sign = v > 0 ? '+' : '';
    return `${sign}${v.toFixed(fractionDigits)}%`;
  }
  return fmtPct(v, fractionDigits);
}

export function fmtCompact(v: number | string | undefined): string {
  if (v === undefined || v === null) return '—';
  const n = typeof v === 'string' ? Number(v) : v;
  if (!Number.isFinite(n)) return '—';
  const abs = Math.abs(n);
  if (abs >= 1_000_000_000) return `${(n / 1_000_000_000).toFixed(2)}B`;
  if (abs >= 1_000_000) return `${(n / 1_000_000).toFixed(2)}M`;
  if (abs >= 1_000) return `${(n / 1_000).toFixed(2)}k`;
  if (abs >= 1) return n.toFixed(2);
  return n.toFixed(4);
}

export function fmtTokenAmount(amount: number | string, decimals = 0): string {
  const n = typeof amount === 'string' ? Number(amount) : amount;
  if (!Number.isFinite(n)) return '—';
  return n.toLocaleString('en-US', {
    maximumFractionDigits: decimals,
  });
}
