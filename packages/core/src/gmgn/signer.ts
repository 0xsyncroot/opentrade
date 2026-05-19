// Ed25519 signing for GMGN critical-tier endpoints (swap/sell/quote/order/strategy).
// Matches the official scheme used by gmgn-cli + bin/gmgn_api.py:
//
//   sorted_qs := keys(query) sorted ASC, joined as "k=v" with "&"
//   message   := `${sub_path}:${sorted_qs}:${body}:${ts}`
//   X-Signature := base64(Ed25519.sign(message_bytes))
//
// Source of truth: github.com/GMGNAI/gmgn-skills, src/client/{signer,OpenApiClient}.ts.

import crypto from 'node:crypto';

export interface SignedRequest {
  timestamp: number;
  clientId: string;
  signatureB64: string;
  bodyStr: string;
  url: string;
}

/**
 * Build the canonical message string. Query keys are sorted alphabetically.
 * Array values are sorted and emitted as repeated `k=v` pairs.
 */
export function buildMessage(
  subPath: string,
  query: Record<string, string | number | string[]>,
  bodyStr: string,
  ts: number,
): string {
  const parts: string[] = [];
  const keys = Object.keys(query).sort();
  for (const k of keys) {
    const v = query[k];
    if (Array.isArray(v)) {
      const sorted = [...v].sort();
      for (const item of sorted) parts.push(`${k}=${item}`);
    } else if (v !== undefined && v !== null) {
      parts.push(`${k}=${v}`);
    }
  }
  return `${subPath}:${parts.join('&')}:${bodyStr}:${ts}`;
}

/**
 * Sign `message` with an Ed25519 private key loaded from a PKCS8 PEM string.
 * The PEM may optionally be encrypted with a passphrase.
 */
export function signEd25519(message: string, pemString: string, passphrase?: string): string {
  const key = crypto.createPrivateKey({
    key: pemString,
    format: 'pem',
    passphrase,
  });
  if (key.asymmetricKeyType !== 'ed25519') {
    throw new Error(`expected Ed25519 key, got ${String(key.asymmetricKeyType)}`);
  }
  const sig = crypto.sign(null, Buffer.from(message, 'utf8'), key);
  return sig.toString('base64');
}

export function generateEd25519Keypair(passphrase?: string): { privatePem: string; publicPem: string } {
  const { publicKey, privateKey } = crypto.generateKeyPairSync('ed25519');
  const publicPem = publicKey.export({ type: 'spki', format: 'pem' }) as string;
  const privatePem = privateKey.export(
    passphrase
      ? { type: 'pkcs8', format: 'pem', cipher: 'aes-256-cbc', passphrase }
      : { type: 'pkcs8', format: 'pem' },
  ) as string;
  return { privatePem, publicPem };
}

export function extractPublicFromPrivate(pemString: string, passphrase?: string): string {
  const key = crypto.createPrivateKey({ key: pemString, format: 'pem', passphrase });
  const pub = crypto.createPublicKey(key);
  return pub.export({ type: 'spki', format: 'pem' }) as string;
}
