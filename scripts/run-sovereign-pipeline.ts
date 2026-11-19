import { performance } from 'node:perf_hooks';
import { exportAuditDossierAndBundle } from '../bricks/graph-memory/export-audit-dossier.ts';
import { verifyEvidenceBundle } from '../bricks/graph-memory/bundle-verifier.ts';
import { evaluateBelnapFusion, classifyEpistemicAdmission } from '../kernel/belnap-engine.ts';
import { DEFAULT_DB_PATH, DIST_DIR, LOGOS_VERSION } from '../kernel/paths.ts';
import { ensureSeededDatabase } from '../kernel/seed-bootstrap.ts';

const t0 = performance.now();

ensureSeededDatabase(DEFAULT_DB_PATH);

const conflictState = evaluateBelnapFusion(true, true);
const quarantineCheck = classifyEpistemicAdmission(conflictState);
if (conflictState !== 'BOTH' || !quarantineCheck.quarantined) {
  throw new Error('BELNAP4_ANTI_A_INVARIANT_FAILED');
}

const exported = exportAuditDossierAndBundle(DEFAULT_DB_PATH, DIST_DIR);
const verified = verifyEvidenceBundle(exported.bundle);
if (!verified.valid) {
  throw new Error('EVIDENCE_BUNDLE_VERIFICATION_FAILED');
}

const elapsedMs = Math.round(performance.now() - t0);
console.log(`LOGOS-OS-CORE v${LOGOS_VERSION} SOVEREIGN PIPELINE PASSED IN ${elapsedMs}ms:`, {
  merkleRoot: exported.bundle.merkleRoot,
  leafCount: exported.bundle.leafCount,
  keyId: exported.bundle.keyId,
  belnapConflictIsolated: true,
  bundleVerified: verified.valid
});
