import { createHash, generateKeyPairSync, sign, verify } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';
import { PRIVATE_KEY_PATH, TRUST_ANCHOR_PUB_PATH } from '../../kernel/paths.ts';

export interface SovereignKeyMaterial {
  keyId: string;
  publicKeyPem: string;
  privateKeyPem: string;
}

export function ensureTrustAnchor(): SovereignKeyMaterial {
  mkdirSync(dirname(TRUST_ANCHOR_PUB_PATH), { recursive: true });
  if (existsSync(PRIVATE_KEY_PATH) && existsSync(TRUST_ANCHOR_PUB_PATH)) {
    const stored = JSON.parse(readFileSync(PRIVATE_KEY_PATH, 'utf8')) as SovereignKeyMaterial;
    return stored;
  }
  const { publicKey, privateKey } = generateKeyPairSync('ed25519', {
    publicKeyEncoding: { type: 'spki', format: 'pem' },
    privateKeyEncoding: { type: 'pkcs8', format: 'pem' }
  });
  const keyId = createHash('sha256').update(publicKey).digest('hex').slice(0, 16);
  const material: SovereignKeyMaterial = { keyId, publicKeyPem: publicKey, privateKeyPem: privateKey };
  writeFileSync(TRUST_ANCHOR_PUB_PATH, publicKey, 'utf8');
  writeFileSync(PRIVATE_KEY_PATH, JSON.stringify(material, null, 2) + '\n', 'utf8');
  return material;
}

export function signPayloadEd25519(content: Buffer | string): { keyId: string; signatureBase64: string } {
  const mat = ensureTrustAnchor();
  const buf = typeof content === 'string' ? Buffer.from(content, 'utf8') : content;
  const sig = sign(null, buf, mat.privateKeyPem).toString('base64');
  return { keyId: mat.keyId, signatureBase64: sig };
}

export function verifyPayloadEd25519(content: Buffer | string, signatureBase64: string): boolean {
  if (!existsSync(TRUST_ANCHOR_PUB_PATH)) return false;
  const pubPem = readFileSync(TRUST_ANCHOR_PUB_PATH, 'utf8');
  const buf = typeof content === 'string' ? Buffer.from(content, 'utf8') : content;
  return verify(null, buf, pubPem, Buffer.from(signatureBase64, 'base64'));
}
