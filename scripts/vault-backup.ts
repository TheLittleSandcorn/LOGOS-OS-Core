import crypto from 'node:crypto';
import fs from 'node:fs';

export function zeroizeBuffer(buf: Buffer) {
  if (Buffer.isBuffer(buf)) buf.fill(0);
}

export function encryptVaultKey(privateKeyPem: string, passphrase: string, outPath = 'dist/TRUST-ANCHOR.vault.json') {
  const salt = crypto.randomBytes(16);
  const iv = crypto.randomBytes(12);
  const key = crypto.scryptSync(passphrase, salt, 32, { N: 16384, r: 8, p: 1 });
  const plainBuf = Buffer.from(privateKeyPem, 'utf8');
  try {
    const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
    const ciphertext = Buffer.concat([cipher.update(plainBuf), cipher.final()]);
    const tag = cipher.getAuthTag();
    const payload = {
      version: '4.8.4',
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
  } finally {
    zeroizeBuffer(key);
    zeroizeBuffer(plainBuf);
  }
}

export function decryptVaultKey(payload: any, passphrase: string): string {
  const key = crypto.scryptSync(passphrase, Buffer.from(payload.salt, 'hex'), 32, { N: 16384, r: 8, p: 1 });
  try {
    const decipher = crypto.createDecipheriv('aes-256-gcm', key, Buffer.from(payload.iv, 'hex'));
    decipher.setAuthTag(Buffer.from(payload.tag, 'hex'));
    const decBuf = Buffer.concat([decipher.update(Buffer.from(payload.ciphertext, 'base64')), decipher.final()]);
    const result = decBuf.toString('utf8');
    zeroizeBuffer(decBuf);
    return result;
  } finally {
    zeroizeBuffer(key);
  }
}
