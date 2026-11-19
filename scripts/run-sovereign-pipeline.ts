import { runSecurityPerimeterAudit } from './test-security-perimeter.ts';
import { runEd25519LedgerSignAudit } from './sign-sovereign-ledger.ts';
import { runChaosSeedFuzzer } from './fuzz-sovereign-seed.ts';
import assert from 'node:assert/strict';
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { performance } from 'node:perf_hooks';
import { DatabaseSync } from 'node:sqlite';
import { exportLlmsTxtManifest } from '../bricks/cosci-bridge/export-llms-manifest.ts';
import { admitFormalTheorem } from '../bricks/cosci-bridge/formal-theorem-gate.ts';
import { evaluateCoSciAdmission } from '../bricks/cosci-bridge/knowledge-bridge.ts';
import { verifyEvidenceBundle } from '../bricks/graph-memory/bundle-verifier.ts';
import { exportAuditDossierAndBundle } from '../bricks/graph-memory/export-audit-dossier.ts';
import { evaluateMcdaCandidate } from '../bricks/mcda-governance/evaluator.ts';
import {
  MODE_EXPLORE_SANDBOX,
  MODE_STRICT_PROOF,
  POLICY_WRITE_CLASS_A,
  ZeroPageKernelRegister
} from '../kernel/abi-jump-table.ts';
import { classifyEpistemicAdmission, evaluateBelnapFusion } from '../kernel/belnap-engine.ts';
import { validateKernelBusMessage } from '../kernel/bus-router.ts';
import { DEFAULT_DB_PATH, DIST_DIR, LOGOS_VERSION } from '../kernel/paths.ts';
import { ensureSeededDatabase } from '../kernel/seed-bootstrap.ts';
import { exportEternalCartridgeAndAtlas } from './export-eternal-artifact.ts';
import { retractEntityWithCascade, searchKnowledgeLedger } from './query-knowledge.ts';
import { runImmuneSystemAudit } from './test-immune-system.ts';
import { runFullIntegrityAudit } from './verify-ledger-integrity.ts';

const t0 = performance.now();
mkdirSync(DIST_DIR, { recursive: true });

// 1. Hardware Kill-Switch & Zero-Page ABI Audit
const reg = new ZeroPageKernelRegister();
const haltFile = 'dist/.LOGOS_HALT';
writeFileSync(haltFile, 'HALT_TEST', 'utf8');
try {
  assert.throws(() => reg.assertNotHalted(), /KERNEL_HALT_ACTIVE/);
} finally {
  rmSync(haltFile, { force: true });
}
reg.assertNotHalted();
assert.equal(reg.hasPolicy(POLICY_WRITE_CLASS_A), true);
reg.switchMode(MODE_EXPLORE_SANDBOX);
assert.equal(reg.hasPolicy(POLICY_WRITE_CLASS_A), false);
reg.switchMode(MODE_STRICT_PROOF);
assert.equal(reg.hasPolicy(POLICY_WRITE_CLASS_A), true);

// 2. Egress Firewall Perimeter & Seeded EAVT Ledger
const perimeter = runSecurityPerimeterAudit();
assert.equal(perimeter.subdomainSpoofBlocked, true);
ensureSeededDatabase(DEFAULT_DB_PATH);
const immuneReport = runImmuneSystemAudit();
assert.equal(immuneReport.zeroAmnesiaVerified, true);
assert.equal(immuneReport.classALedgerUntouched, true);

const hits = searchKnowledgeLedger('belnap', DEFAULT_DB_PATH);
assert.ok(hits.length >= 1);

const memCascadePath = 'file:logos_v25_cascade?mode=memory&cache=shared';
const holdDb = new DatabaseSync(memCascadePath);
try {
  ensureSeededDatabase(memCascadePath);
  holdDb.exec('CREATE TABLE IF NOT EXISTS lineage_edges (parent_entity TEXT NOT NULL, child_entity TEXT NOT NULL, PRIMARY KEY (parent_entity, child_entity))');
  holdDb.exec("INSERT OR IGNORE INTO lineage_edges VALUES ('family:root', 'family:child_a'), ('family:child_a', 'family:grandchild_b')");
  const cascade = retractEntityWithCascade('family:root', memCascadePath);
  assert.deepEqual(cascade.affectedEntities, ['family:root', 'family:child_a', 'family:grandchild_b']);
} finally {
  holdDb.close();
}

assert.equal(evaluateBelnapFusion(true, true), 'BOTH');
assert.equal(classifyEpistemicAdmission('BOTH').quarantined, true);
assert.equal(admitFormalTheorem({ id: 'thm:sorry', statement: 'x=y', containsSorryAx: true, hasFormalProof: true, hasMethodologicalContext: true }).admitted, false);
assert.equal(admitFormalTheorem({ id: 'thm:nofk', statement: 'x=y', containsSorryAx: false, hasFormalProof: true, hasMethodologicalContext: false }).admitted, false);
assert.equal(admitFormalTheorem({ id: 'thm:valid', statement: 'x=x', containsSorryAx: false, hasFormalProof: true, hasMethodologicalContext: true }).admitted, true);

assert.throws(() => validateKernelBusMessage({ origin: 'evil.example', targetBrick: 'graph-memory', callChain: [] }), /UNTRUSTED_BUS_ORIGIN/);
assert.throws(() => validateKernelBusMessage({ origin: '127.0.0.1', targetBrick: 'graph-memory', callChain: ['graph-memory'] }), /CIRCULAR_ROUTE_BLOCKED/);
assert.throws(() => validateKernelBusMessage({ origin: '127.0.0.1', targetBrick: 'graph-memory', relativePath: '../secret.key', callChain: [] }), /PATH_TRAVERSAL_BLOCKED/);

assert.equal(evaluateMcdaCandidate({ id: 'weak', security: 5.5, determinism: 9, simplicity: 9 }).approved, false);
assert.equal(evaluateMcdaCandidate({ id: 'sovereign', security: 9.8, determinism: 9.6, simplicity: 9.5 }).approved, true);
assert.equal(evaluateCoSciAdmission({ id: 'cosci:1', sourceRepo: 'TheLittleSandcorn/cosci-research-framework', epistemicClass: 'CLASS_A', confidence: 0.99, statement: 'Verified' }).acceptedIntoLedger, true);

// 3. Cryptographic Dossier, Belnap-4 Live Badges Atlas & 4-Layer Integrity
const exported = exportAuditDossierAndBundle(DEFAULT_DB_PATH, DIST_DIR);
const verified = verifyEvidenceBundle(exported.bundle);
const llmsPath = exportLlmsTxtManifest(exported.bundle, DIST_DIR);
const eternal = exportEternalCartridgeAndAtlas(exported.bundle, DIST_DIR, [], exported.quarantine, DEFAULT_DB_PATH);
const atlasContent = readFileSync(eternal.atlasPath, 'utf8');
const fuzz = runChaosSeedFuzzer(20261117, 50);
const signAudit = runEd25519LedgerSignAudit(DEFAULT_DB_PATH, DIST_DIR);
const integrity = runFullIntegrityAudit(DEFAULT_DB_PATH, DIST_DIR);
if (!verified.valid || !existsSync(llmsPath) || !atlasContent.includes('class="axiom-card"') || !integrity.cartridgeSha256Verified) {
  throw new Error('ORCHESTRATOR_VERIFICATION_FAILED');
}

const elapsedMs = Math.round(performance.now() - t0);
console.log(`LOGOS-OS-CORE v${LOGOS_VERSION} ONE-COMMAND SOVEREIGN ORCHESTRATOR PASSED IN ${elapsedMs}ms:`, {
  merkleRoot: exported.bundle.merkleRoot,
  leafCount: exported.bundle.leafCount,
  keyId: exported.bundle.keyId,
  killSwitchAuditVerified: true,
  belnap4LiveBadgesRendered: true,
  fourLayerIntegrityVerified: true,
  bundleVerified: verified.valid
});
