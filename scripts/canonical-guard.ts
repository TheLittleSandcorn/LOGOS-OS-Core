import crypto from 'node:crypto';

export const KERNEL_LIMITS = Object.freeze({
  maxBodyBytes: 262144,
  maxRecursionDepth: 64,
  maxEGraphNodes: 10000
});

export function canonicalizeValue(val: unknown, depth = 0): unknown {
  if (depth > KERNEL_LIMITS.maxRecursionDepth) {
    throw Object.assign(new Error('CANONICAL_MAX_DEPTH_EXCEEDED'), { code: 'KERNEL_DOS_LIMIT' });
  }
  if (typeof val === 'string') return val.normalize('NFC');
  if (Array.isArray(val)) return val.map((item) => canonicalizeValue(item, depth + 1));
  if (val !== null && typeof val === 'object') {
    const out: Record<string, unknown> = {};
    for (const k of Object.keys(val as Record<string, unknown>).sort()) {
      out[k.normalize('NFC')] = canonicalizeValue((val as Record<string, unknown>)[k], depth + 1);
    }
    return out;
  }
  return val;
}

export function canonicalJson(val: unknown): string {
  return JSON.stringify(canonicalizeValue(val));
}

export function canonicalSha256(val: unknown): string {
  return crypto.createHash('sha256').update(canonicalJson(val), 'utf8').digest('hex');
}
