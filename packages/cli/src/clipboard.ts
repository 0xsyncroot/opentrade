// Cross-platform clipboard copy with silent fallback.
//
// Tries (in order): wl-copy (Wayland), pbcopy (macOS), xclip (X11), termux-clipboard-set,
// powershell Set-Clipboard (Windows/WSL). Returns true on success.

import { spawn } from 'node:child_process';

interface Cmd {
  bin: string;
  args: string[];
}

const CANDIDATES: Cmd[] = [
  { bin: 'wl-copy', args: [] },
  { bin: 'pbcopy', args: [] },
  { bin: 'xclip', args: ['-selection', 'clipboard'] },
  { bin: 'xsel', args: ['--clipboard', '--input'] },
  { bin: 'termux-clipboard-set', args: [] },
  { bin: 'clip.exe', args: [] }, // WSL
];

export async function copyToClipboard(text: string): Promise<boolean> {
  for (const c of CANDIDATES) {
    if (await tryRun(c, text)) return true;
  }
  return false;
}

function tryRun(c: Cmd, text: string): Promise<boolean> {
  return new Promise((resolve) => {
    let settled = false;
    const finish = (ok: boolean) => {
      if (settled) return;
      settled = true;
      resolve(ok);
    };
    try {
      const proc = spawn(c.bin, c.args, { stdio: ['pipe', 'ignore', 'ignore'] });
      proc.on('error', () => finish(false));
      proc.on('close', (code) => finish(code === 0));
      try {
        proc.stdin.end(text, 'utf8');
      } catch {
        finish(false);
      }
    } catch {
      finish(false);
    }
  });
}
