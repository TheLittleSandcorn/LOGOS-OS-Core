import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { performance } from 'node:perf_hooks';
import { exportLlmsTxtManifest } from '../bricks/cosci-bridge/export-llms-manifest.ts';
import { evaluateCoSciAdmission } from '../bricks/cosci-bridge/knowledge-bridge.ts';
import { verifyEvidenceBundle } from '../bricks/graph-memory/bundle-verifier.ts';
import { exportAuditDossierAndBundle } from '../bricks/graph-memory/export-audit-dossier.ts';
import { evaluateMcdaCandidate } from '../bricks/mcda-governance/evaluator.ts';
import { classifyEpistemicAdmission, evaluateBelnapFusion } from '../kernel/belnap-engine.ts';
import { validateKernelBusMessage } from '../kernel/bus-router.ts';
import { DEFAULT_DB_PATH, DIST_DIR, LOGOS_VERSION } from '../kernel/paths.ts';
import { ensureSeededDatabase } from '../kernel/seed-bootstrap.ts';

const t0 = performance.now();

ensureSeededDatabase(DEFAULT_DB_PATH);

assert.equal(evaluateBelnapFusion(true, true), 'BOTH');
assert.equal(classifyEpistemicAdmission('BOTH').quarantined, true);

assert.throws(() => validateKernelBusMessage({ origin: 'evil.example', targetBrick: 'graph-memory', callChain: [] }), /UNTRUSTED_BUS_ORIGIN/);
assert.throws(() => validateKernelBusMessage({ origin: '127.0.0.1', targetBrick: 'graph-memory', callChain: ['graph-memory'] }), /CIRCULAR_ROUTE_BLOCKED/);
assert.throws(() => validateKernelBusMessage({ origin: '127.0.0.1', targetBrick: 'graph-memory', relativePath: '../secret.key', callChain: [] }), /PATH_TRAVERSAL_BLOCKED/);
assert.equal(validateKernelBusMessage({ origin: '127.0.0.1', targetBrick: 'graph-memory', relativePath: 'knowledge/canonical-seed.json', callChain: [] }).allowed, true);

assert.equal(evaluateMcdaCandidate({ id: 'weak', security: 5.5, determinism: 9, simplicity: 9 }).approved, false);
assert.equal(evaluateMcdaCandidate({ id: 'sovereign', security: 9.8, determinism: 9.6, simplicity: 9.5 }).approved, true);

assert.equal(evaluateCoSciAdmission({ id: 'cosci:1', sourceRepo: 'TheLittleSandcorn/cosci-research-framework', epistemicClass: 'CLASS_A', confidence: 0.99, statement: 'Verified' }).acceptedIntoLedger, true);
assert.equal(evaluateCoSciAdmission({ id: 'cosci:2', sourceRepo: 'TheLittleSandcorn/cosci-research-framework', epistemicClass: 'CLASS_C', confidence: 0.65, statement: 'Draft' }).acceptedIntoLedger, false);

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
  hardenedBusVerified: true,
  mcdaSecurityFloorVerified: true,
  bundleVerified: verified.valid
});
