import { fileURLToPath } from 'node:url';
import { computeEavtMerkleSnapshot, generateInclusionProof, verifyInclusionProof } from '../bricks/graph-memory/merkle-ledger.ts';
import { verifyEvidenceBundle } from '../bricks/graph-memory/bundle-verifier.ts';
import { DB_PATH, DIST_DIR, LOGOS_VERSION } from '../kernel/paths.ts';
import { join } from 'node:path';

export function runSystemHealthCheck(dbPath = DB_PATH, distDir = DIST_DIR) {
  const snap = computeEavtMerkleSnapshot(dbPath);
  const proof = generateInclusionProof(dbPath, 1);
  const steps = Array.isArray((proof as any).proof) ? (proof as any).proof : Array.isArray((proof as any).steps) ? (proof as any).steps : Array.isArray((proof as any).path) ? (proof as any).path : [];
  const proofVerified = verifyInclusionProof(proof.leafHash, steps, snap.merkleRoot);
  const bundleCheck = verifyEvidenceBundle(join(distDir, 'LOGOS-EVIDENCE-BUNDLE.json'));
  const healthy = snap.leafCount >= 4 && proofVerified && bundleCheck.valid;
  return { healthy, version: LOGOS_VERSION, merkleRoot: snap.merkleRoot, leafCount: snap.leafCount, seq1ProofVerified: proofVerified, ed25519Valid: bundleCheck.ed25519Valid };
}

if (process.argv.at(1) === fileURLToPath(import.meta.url)) {
  const res = runSystemHealthCheck();
  console.log(`LOGOS-OS-CORE v${LOGOS_VERSION} SYSTEM HEALTH CHECK:`, res);
  if (!res.healthy) process.exit(1);
}
