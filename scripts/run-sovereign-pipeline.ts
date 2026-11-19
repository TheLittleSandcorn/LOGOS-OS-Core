import { existsSync } from 'node:fs';
import { performance } from 'node:perf_hooks';
import { exportLlmsTxtManifest } from '../bricks/cosci-bridge/export-llms-manifest.ts';
import { evaluateCoSciAdmission } from '../bricks/cosci-bridge/knowledge-bridge.ts';
import { verifyEvidenceBundle } from '../bricks/graph-memory/bundle-verifier.ts';
import { exportAuditDossierAndBundle } from '../bricks/graph-memory/export-audit-dossier.ts';
import { classifyEpistemicAdmission, evaluateBelnapFusion } from '../kernel/belnap-engine.ts';
import { DEFAULT_DB_PATH, DIST_DIR, LOGOS_VERSION } from '../kernel/paths.ts';
import { ensureSeededDatabase } from '../kernel/seed-bootstrap.ts';

const t0 = performance.now();

ensureSeededDatabase(DEFAULT_DB_PATH);

const conflictState = evaluateBelnapFusion(true, true);
const quarantineCheck = classifyEpistemicAdmission(conflictState);
if (conflictState !== 'BOTH' || !quarantineCheck.quarantined) {
  throw new Error('BELNAP4_ANTI_A_INVARIANT_FAILED');
}

const classACheck = evaluateCoSciAdmission({
  id: 'cosci:axiom:1',
  sourceRepo: 'TheLittleSandcorn/cosci-research-framework',
  epistemicClass: 'CLASS_A',
  confidence: 0.99,
  statement: 'Reproducible deterministic verification'
});
const classCCheck = evaluateCoSciAdmission({
  id: 'cosci:hypothesis:2',
  sourceRepo: 'TheLittleSandcorn/cosci-research-framework',
  epistemicClass: 'CLASS_C',
  confidence: 0.65,
  statement: 'Unverified hypothesis'
});
if (!classACheck.acceptedIntoLedger || classCCheck.acceptedIntoLedger) {
  throw new Error('COSCI_BRIDGE_GATING_FAILED');
}

const exported = exportAuditDossierAndBundle(DEFAULT_DB_PATH, DIST_DIR);
const verified = verifyEvidenceBundle(exported.bundle);
const llmsPath = exportLlmsTxtManifest(exported.bundle, DIST_DIR);
if (!verified.valid || !existsSync(llmsPath)) {
  throw new Error('EVIDENCE_OR_LLMS_VERIFICATION_FAILED');
}

const elapsedMs = Math.round(performance.now() - t0);
console.log(`LOGOS-OS-CORE v${LOGOS_VERSION} SOVEREIGN PIPELINE PASSED IN ${elapsedMs}ms:`, {
  merkleRoot: exported.bundle.merkleRoot,
  leafCount: exported.bundle.leafCount,
  keyId: exported.bundle.keyId,
  cosciBridgeGated: true,
  llmsTxtGenerated: true,
  bundleVerified: verified.valid
});
