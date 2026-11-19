import { fileURLToPath } from 'node:url';
import { join } from 'node:path';
import { readFileSync } from 'node:fs';
import { computeEavtMerkleSnapshot, generateInclusionProof, verifyInclusionProof } from '../bricks/graph-memory/merkle-ledger.ts';
import { verifyEvidenceBundle } from '../bricks/graph-memory/bundle-verifier.ts';
import { DEFAULT_DB_PATH, DIST_DIR, LOGOS_VERSION } from '../kernel/paths.ts';

export function runSystemHealthCheck(dbPath = DEFAULT_DB_PATH, distDir = DIST_DIR) {
  const snap = computeEavtMerkleSnapshot(dbPath);
  const proof: any = generateInclusionProof(dbPath, 1);
  const steps = Array.isArray(proof.proof) ? proof.proof : Array.isArray(proof.steps) ? proof.steps : Array.isArray(proof.path) ? proof.path : [];
  const proofVerified = verifyInclusionProof(proof.leafHash, steps, snap.merkleRoot);
  const bundleObj = JSON.parse(readFileSync(join(distDir, 'LOGOS-EVIDENCE-BUNDLE.json'), 'utf8'));
  const bundleCheck = verifyEvidenceBundle(bundleObj);
  const healthy = snap.leafCount >= 4 && proofVerified && bundleCheck.valid;
  return { healthy, version: LOGOS_VERSION, merkleRoot: snap.merkleRoot, leafCount: snap.leafCount, seq1ProofVerified: proofVerified, ed25519Valid: bundleCheck.ed25519Valid };
}

if (process.argv.at(1) === fileURLToPath(import.meta.url)) {
  const res = runSystemHealthCheck();
  console.log(`LOGOS-OS-CORE v${LOGOS_VERSION} SYSTEM HEALTH CHECK:`, res);
  if (!res.healthy) process.exit(1);
}
