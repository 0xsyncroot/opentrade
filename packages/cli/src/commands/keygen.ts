// `opentrade keygen [--out PATH] [--passphrase] [--print-only]`
//
// Standalone Ed25519 keypair generator. Writes ed25519.pem (mode 600) +
// ed25519.pub (mode 644). Prints full public PEM, copies to clipboard, and
// shows numbered GMGN dashboard instructions.

import fs from 'node:fs';
import path from 'node:path';
import { defineCommand } from 'citty';
import {
  generateEd25519Keypair,
  extractPublicFromPrivate,
} from '@0xsyncroot/opentrade-core/gmgn';
import { resolvePaths } from '../config/paths.js';
import { copyToClipboard } from '../clipboard.js';
import { log, color } from '../render/cli-renderer.js';

export const keygenCmd = defineCommand({
  meta: { name: 'keygen', description: 'generate (or extract) an Ed25519 keypair for GMGN' },
  args: {
    out: { type: 'string', description: 'output directory (default ~/.config/opentrade/secrets/)' },
    passphrase: { type: 'string', description: 'encrypt private key with passphrase (aes-256-cbc)' },
    'print-only': {
      type: 'boolean',
      description: 'do not write — extract pubkey from an existing private key',
    },
    'in': { type: 'string', description: 'existing private key PEM path (for --print-only)' },
  },
  async run({ args }) {
    const paths = resolvePaths();

    if (args['print-only']) {
      const src = args.in ?? paths.edPrivPem;
      if (!fs.existsSync(src)) {
        log.error(`no private key at ${src}. Pass --in <path> or run \`opentrade init\`.`);
        process.exit(2);
      }
      const pem = fs.readFileSync(src, 'utf8');
      const pubPem = extractPublicFromPrivate(pem, args.passphrase);
      process.stdout.write(`${pubPem}\n`);
      const copied = await copyToClipboard(pubPem);
      if (copied) log.info(color.dim('(copied to clipboard)'));
      printDashboardSteps();
      return;
    }

    const outDir = args.out
      ? args.out.endsWith('.pem')
        ? path.dirname(args.out)
        : args.out
      : paths.secretsDir;
    fs.mkdirSync(outDir, { recursive: true, mode: 0o700 });

    const { privatePem, publicPem } = generateEd25519Keypair(args.passphrase);
    const privPath = args.out && args.out.endsWith('.pem')
      ? args.out
      : path.join(outDir, 'ed25519.pem');
    const pubPath = privPath.replace(/\.pem$/, '.pub');

    fs.writeFileSync(privPath, privatePem, { mode: 0o600 });
    fs.chmodSync(privPath, 0o600);
    fs.writeFileSync(pubPath, publicPem, { mode: 0o644 });
    fs.chmodSync(pubPath, 0o644);

    log.success(`wrote ${color.bold(privPath)} (600) and ${color.bold(pubPath)} (644)`);
    log.info('');
    log.info(color.bold('Your Ed25519 PUBLIC key (paste this into GMGN dashboard):'));
    process.stdout.write('\n');
    process.stdout.write(publicPem);
    process.stdout.write('\n');

    const copied = await copyToClipboard(publicPem);
    if (copied) log.info(color.dim('(copied to clipboard)'));

    printDashboardSteps();
  },
});

export function printDashboardSteps(): void {
  process.stdout.write(`
${color.bold('Add this key to GMGN to get an API key:')}

  1. Open https://gmgn.ai → sign in → Settings → API
  2. Paste the public key (already on your clipboard) into "Ed25519 Public Key"
  3. Enable "Trading API" and turn on 2FA
  4. Copy the API key GMGN gives you
  5. Run: opentrade config set gmgn.apiKey <YOUR_API_KEY>

${color.dim('Rotation: to rotate, revoke the old API key on the dashboard, upload a new public key, and update gmgn.apiKey.')}
`);
}
