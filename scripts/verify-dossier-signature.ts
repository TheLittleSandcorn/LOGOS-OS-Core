import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { exportAuditDossierAndBundle } from '../bricks/graph-memory/export-audit-dossier.ts';
import { verifyPayloadEd25519 } from '../bricks/graph-memory/trust-anchor.ts';
import { DEFAULT_DB_PATH, DIST_DIR, LOGOS_VERSION } from '../kernel/paths.ts';

export function verifyDetachedDossierSignature(
  dbPath: string = DEFAULT_DB_PATH,
  outDir: string = DIST_DIR
): { status: 'AUTHENTIC'; keyId: string; merkleRoot: string } {
  const dossierPath = join(outDir, 'AUDIT-DOSSIER.md');
  const sigPath = join(outDir, 'AUDIT-DOSSIER.sig.json');
  if (!existsSync(dossierPath) || !existsSync(sigPath)) {
    exportAuditDossierAndBundle(dbPath, outDir);
  }
  const dossierContent = readFileSync(dossierPath, 'utf8');
  const sigJson = JSON.parse(readFileSync(sigPath, 'utf8')) as {
    keyId: string;
    merkleRoot: string;
    signatureBase64: string;
  };
  const valid = verifyPayloadEd25519(dossierContent, sigJson.signatureBase64);
  assert.equal(valid, true, 'DETACHED_ED25519_SIGNATURE_INVALID');
  return {
    status: 'AUTHENTIC',
    keyId: sigJson.keyId,
    merkleRoot: sigJson.merkleRoot
  };
}

if (process.argv === fileURLToPath(import.meta.url)) {
  const report = verifyDetachedDossierSignature();
  console.log(`LOGOS-OS-CORE v${LOGOS_VERSION} DETACHED ED25519 SIGNATURE VERIFICATION:`, report);
}
