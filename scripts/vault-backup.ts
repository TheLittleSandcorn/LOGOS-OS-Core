import crypto from 'node:crypto';
import fs from 'node:fs';

export function encryptVaultKey(privateKeyPem: string, passphrase: string, outPath = 'dist/TRUST-ANCHOR.vault.json') {
  const salt = crypto.randomBytes(16);
  const iv = crypto.randomBytes(12);
  const key = crypto.scryptSync(passphrase, salt, 32, { N: 16384, r: 8, p: 1 });
  const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
  const ciphertext = Buffer.concat([cipher.update(privateKeyPem, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  const payload = {
    version: '4.8.3',
    kdf: 'scrypt',
    cipher: 'aes-256-gcm',
    salt: salt.toString('hex'),
    iv: iv.toString('hex'),
    tag: tag.toString('hex'),
    ciphertext: ciphertext.toString('base64'),
    createdAt: new Date().toISOString()
  };
  fs.mkdirSync('dist', { recursive: true });
  fs.writeFileSync(outPath, JSON.stringify(payload, null, 2), 'utf8');
  return payload;
}

export function decryptVaultKey(payload: any, passphrase: string): string {
  const key = crypto.scryptSync(passphrase, Buffer.from(payload.salt, 'hex'), 32, { N: 16384, r: 8, p: 1 });
  const decipher = crypto.createDecipheriv('aes-256-gcm', key, Buffer.from(payload.iv, 'hex'));
  decipher.setAuthTag(Buffer.from(payload.tag, 'hex'));
  return Buffer.concat([decipher.update(Buffer.from(payload.ciphertext, 'base64')), decipher.final()]).toString('utf8');
}
