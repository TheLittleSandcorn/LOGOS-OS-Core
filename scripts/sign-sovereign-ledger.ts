import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { exportAuditDossierAndBundle } from '../bricks/graph-memory/export-audit-dossier.ts';
import { signPayloadEd25519, verifyPayloadEd25519 } from '../bricks/graph-memory/trust-anchor.ts';
import { DEFAULT_DB_PATH, DIST_DIR, LOGOS_VERSION } from '../kernel/paths.ts';

export function runEd25519LedgerSignAudit(
  dbPath: string = DEFAULT_DB_PATH,
  outDir: string = DIST_DIR
): { keyId: string; signatureValid: boolean; tamperDetected: boolean } {
  const dossierPath = join(outDir, 'AUDIT-DOSSIER.md');
  if (!existsSync(dossierPath)) {
    exportAuditDossierAndBundle(dbPath, outDir);
  }
  const dossierContent = readFileSync(dossierPath, 'utf8');
  const signed = signPayloadEd25519(dossierContent);

  const signatureValid = verifyPayloadEd25519(dossierContent, signed.signatureBase64);
  assert.equal(signatureValid, true, 'ED25519_SIGNATURE_VERIFICATION_FAILED');

  const tamperedContent = `${dossierContent}\n<!-- TAMPERED_BYTE -->`;
  const tamperDetected = !verifyPayloadEd25519(tamperedContent, signed.signatureBase64);
  assert.equal(tamperDetected, true, 'ED25519_TAMPER_DETECTION_FAILED');

  return {
    keyId: signed.keyId,
    signatureValid,
    tamperDetected
  };
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const report = runEd25519LedgerSignAudit();
  console.log(`LOGOS-OS-CORE v${LOGOS_VERSION} ED25519 LEDGER SIGNER & TAMPER AUDIT PASSED:`, report);
}
