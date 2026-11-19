import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { DEFAULT_DB_PATH, DIST_DIR, LOGOS_VERSION } from '../../kernel/paths.ts';
import { computeEavtMerkleSnapshot, generateInclusionProof } from './merkle-ledger.ts';
import { ensureTrustAnchor, signPayloadEd25519 } from './trust-anchor.ts';

export interface EvidenceBundle {
  schema: 'LOGOS-OS-CORE.EVIDENCE_BUNDLE.v1';
  version: string;
  keyId: string;
  merkleRoot: string;
  leafCount: number;
  sampleLeafIndex: number;
  sampleLeafHash: string;
  inclusionProof: Array<{ position: 'LEFT' | 'RIGHT'; hash: string }>;
  dossierMarkdown: string;
  signatureBase64: string;
}

export function exportAuditDossierAndBundle(
  dbPath: string = DEFAULT_DB_PATH,
  outDir: string = DIST_DIR
): { dossierPath: string; sigPath: string; bundlePath: string; bundle: EvidenceBundle } {
  mkdirSync(outDir, { recursive: true });
  const anchor = ensureTrustAnchor();
  const snap = computeEavtMerkleSnapshot(dbPath);
  const sampleLeafIndex = 0;
  const sampleLeafHash = snap.leaves.at(sampleLeafIndex) ?? '';
  const inclusionProof = snap.leaves.length > 0 ? generateInclusionProof(snap.leaves, sampleLeafIndex) : [];

  const dossierMarkdown = [
    `# LOGOS-OS-Core v${LOGOS_VERSION} — Sovereign Cryptographic Audit Dossier`,
    '',
    `- **Trust-Anchor Key-ID:** \`${anchor.keyId}\``,
    `- **EAVT Ledger Leaves:** \`${snap.leafCount}\``,
    `- **Merkle-Root (SHA-256):** \`${snap.merkleRoot}\``,
    `- **Runtime Policy:** Zero-Dependency Node.js \`>= 22.6.0\` (\`127.0.0.1\` Loopback Only)`,
    `- **Logic Engine:** Belnap-4 (\`TRUE | FALSE | BOTH | NEITHER\`) + Anti-A Quarantine`,
    ''
  ].join('\n');

  const sig = signPayloadEd25519(dossierMarkdown);
  const bundle: EvidenceBundle = {
    schema: 'LOGOS-OS-CORE.EVIDENCE_BUNDLE.v1',
    version: LOGOS_VERSION,
    keyId: sig.keyId,
    merkleRoot: snap.merkleRoot,
    leafCount: snap.leafCount,
    sampleLeafIndex,
    sampleLeafHash,
    inclusionProof,
    dossierMarkdown,
    signatureBase64: sig.signatureBase64
  };

  const dossierPath = join(outDir, 'AUDIT-DOSSIER.md');
  const sigPath = join(outDir, 'AUDIT-DOSSIER.sig.json');
  const bundlePath = join(outDir, 'EVIDENCE-BUNDLE.json');

  writeFileSync(dossierPath, dossierMarkdown, 'utf8');
  writeFileSync(sigPath, JSON.stringify({ keyId: sig.keyId, merkleRoot: snap.merkleRoot, signatureBase64: sig.signatureBase64 }, null, 2) + '\n', 'utf8');
  writeFileSync(bundlePath, JSON.stringify(bundle, null, 2) + '\n', 'utf8');

  return { dossierPath, sigPath, bundlePath, bundle };
}
