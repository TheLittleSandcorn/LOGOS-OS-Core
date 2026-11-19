import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { DIST_DIR, TRUST_ANCHOR_PUB_PATH } from '../../kernel/paths.ts';
import type { EvidenceBundle } from './export-audit-dossier.ts';
import { verifyInclusionProof } from './merkle-ledger.ts';
import { verifyPayloadEd25519 } from './trust-anchor.ts';

export function verifyEvidenceBundle(bundle: EvidenceBundle): {
  valid: boolean;
  schemaValid: boolean;
  trustAnchorPinned: boolean;
  ed25519Valid: boolean;
  merkleProofValid: boolean;
  dossierMentionsRoot: boolean;
} {
  const schemaValid = bundle.schema === 'LOGOS-OS-CORE.EVIDENCE_BUNDLE.v1';
  const trustAnchorPinned = existsSync(TRUST_ANCHOR_PUB_PATH);
  const ed25519Valid = verifyPayloadEd25519(bundle.dossierMarkdown, bundle.signatureBase64);
  const merkleProofValid = verifyInclusionProof(bundle.sampleLeafHash, bundle.inclusionProof, bundle.merkleRoot);
  const dossierMentionsRoot = bundle.dossierMarkdown.includes(bundle.merkleRoot);
  return {
    valid: schemaValid && trustAnchorPinned && ed25519Valid && merkleProofValid && dossierMentionsRoot,
    schemaValid,
    trustAnchorPinned,
    ed25519Valid,
    merkleProofValid,
    dossierMentionsRoot
  };
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const bundlePath = join(DIST_DIR, 'EVIDENCE-BUNDLE.json');
  if (!existsSync(bundlePath)) {
    throw new Error(`BUNDLE_NOT_FOUND: Run 'node --run sovereign' first (${bundlePath}).`);
  }
  const bundle = JSON.parse(readFileSync(bundlePath, 'utf8')) as EvidenceBundle;
  const report = verifyEvidenceBundle(bundle);
  console.log('LOGOS-OS-CORE ZERO-DB EVIDENCE BUNDLE VERIFICATION:', report);
  if (!report.valid) process.exit(1);
}
