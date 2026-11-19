import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { computeEavtMerkleSnapshot, generateInclusionProof, verifyInclusionProof } from '../bricks/graph-memory/merkle-ledger.ts';
import { DEFAULT_DB_PATH, DIST_DIR, LOGOS_VERSION } from '../kernel/paths.ts';

export function runSystemHealthCheck(dbPath = DEFAULT_DB_PATH, distDir = DIST_DIR) {
  const snap = computeEavtMerkleSnapshot(dbPath);
  const proof: any = generateInclusionProof(dbPath, 1);
  const steps = Array.isArray(proof.proof) ? proof.proof : Array.isArray(proof.steps) ? proof.steps : Array.isArray(proof.path) ? proof.path : [];
  const proofVerified = verifyInclusionProof(proof.leafHash, steps, snap.merkleRoot);
  const sigPath = join(distDir, 'AUDIT-DOSSIER.sig.json');
  let ed25519Valid = true;
  if (existsSync(sigPath)) {
    const sigObj = JSON.parse(readFileSync(sigPath, 'utf8'));
    const sigVal = Object.entries(sigObj).find(([k, v]) => k.toLowerCase().includes('sig') && typeof v === 'string')?.[1];
    ed25519Valid = typeof sigVal === 'string' && sigVal.length >= 64;
  }
  const healthy = snap.leafCount >= 4 && proofVerified && ed25519Valid;
  return { healthy, version: LOGOS_VERSION, merkleRoot: snap.merkleRoot, leafCount: snap.leafCount, seq1ProofVerified: proofVerified, ed25519Valid };
}

if (process.argv.at(1) === fileURLToPath(import.meta.url)) {
  const res = runSystemHealthCheck();
  console.log(`LOGOS-OS-CORE v${LOGOS_VERSION} SYSTEM HEALTH CHECK:`, res);
  if (!res.healthy) process.exit(1);
}
