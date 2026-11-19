import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { DEFAULT_DB_PATH, DIST_DIR, LOGOS_VERSION } from '../../kernel/paths.ts';
import { listQuarantineEntries, type QuarantineRecord } from './failure-alchemist.ts';
import { computeEavtMerkleSnapshot, generateInclusionProof } from './merkle-ledger.ts';
import { ensureTrustAnchor, signPayloadEd25519 } from './trust-anchor.ts';

export interface EvidenceBundle {
  schema: 'LOGOS-OS-CORE.EVIDENCE_BUNDLE.v1';
  version: string;
  keyId: string;
  merkleRoot: string;
  leafCount: number;
  quarantineCount: number;
  egraphRuleCount: number;
  sampleLeafIndex: number;
  sampleLeafHash: string;
  inclusionProof: Array<{ position: 'LEFT' | 'RIGHT'; hash: string }>;
  dossierMarkdown: string;
  signatureBase64: string;
}

export function exportAuditDossierAndBundle(
  dbPath: string = DEFAULT_DB_PATH,
  outDir: string = DIST_DIR
): { dossierPath: string; sigPath: string; bundlePath: string; bundle: EvidenceBundle; quarantine: QuarantineRecord[] } {
  mkdirSync(outDir, { recursive: true });
  const anchor = ensureTrustAnchor();
  const snap = computeEavtMerkleSnapshot(dbPath);
  const quarantine = listQuarantineEntries(dbPath);

  const db = new DatabaseSync(dbPath, { readOnly: true });
  let classARows: Array = [];
  let egraphRules: Array<{ lhs: string; rhs: string; created_seq: number }> = [];
  try {
    classARows = db.prepare("SELECT seq, entity, attribute, value, truth_state FROM eavt_ledger WHERE epistemic_class = 'CLASS_A' ORDER BY seq ASC").all() as typeof classARows;
    egraphRules = db.prepare('SELECT lhs, rhs, created_seq FROM egraph_rules ORDER BY created_seq ASC').all() as typeof egraphRules;
  } finally { db.close(); }

  const sampleLeafIndex = 0;
  const sampleLeafHash = snap.leaves.at(sampleLeafIndex) ?? '';
  const inclusionProof = snap.leaves.length > 0 ? generateInclusionProof(snap.leaves, sampleLeafIndex) : [];

  const classASection = classARows.map((r) => `- [seq=${r.seq}] \`${r.entity}\` · \`${r.attribute}\` = \`${r.value}\` (**${r.truth_state}**)`).join('\n');
  const antiASection = quarantine.length > 0
    ? quarantine.map((q) => `- [quarantine=${q.recorded_seq}] \`${q.candidate_id}\` · \`${q.error_code}\` (\`sha256:${q.fingerprint.slice(0, 12)}...\`)`).join('\n')
    : '- No quarantined fallacies recorded.';
  const egraphSection = egraphRules.length > 0
    ? egraphRules.map((e) => `- [seq=${e.created_seq}] \`${e.lhs}\` === \`${e.rhs}\``).join('\n')
    : '- No custom E-Graph rules persisted.';

  const dossierMarkdown = [
    `# LOGOS-OS-Core v${LOGOS_VERSION} — Sovereign Cryptographic Audit Dossier`,
    '',
    `- **Trust-Anchor Key-ID:** \`${anchor.keyId}\``,
    `- **EAVT Ledger Leaves:** \`${snap.leafCount}\``,
    `- **Quarantined Anti-A Entries:** \`${quarantine.length}\``,
    `- **Persisted E-Graph Rules:** \`${egraphRules.length}\``,
    `- **Merkle-Root (SHA-256):** \`${snap.merkleRoot}\``,
    '',
    '## Verified CLASS_A Ledger Facts', classASection, '',
    '## Anti-A Quarantine Telemetry', antiASection, '',
    '## Persisted E-Graph Equivalence Rules', egraphSection, ''
  ].join('\n');

  const sig = signPayloadEd25519(dossierMarkdown);
  const bundle: EvidenceBundle = {
    schema: 'LOGOS-OS-CORE.EVIDENCE_BUNDLE.v1', version: LOGOS_VERSION, keyId: sig.keyId,
    merkleRoot: snap.merkleRoot, leafCount: snap.leafCount, quarantineCount: quarantine.length, egraphRuleCount: egraphRules.length,
    sampleLeafIndex, sampleLeafHash, inclusionProof, dossierMarkdown, signatureBase64: sig.signatureBase64
  };

  const dossierPath = join(outDir, 'AUDIT-DOSSIER.md');
  const sigPath = join(outDir, 'AUDIT-DOSSIER.sig.json');
  const bundlePath = join(outDir, 'EVIDENCE-BUNDLE.json');
  writeFileSync(dossierPath, dossierMarkdown, 'utf8');
  writeFileSync(sigPath, JSON.stringify({ keyId: sig.keyId, merkleRoot: snap.merkleRoot, signatureBase64: sig.signatureBase64 }, null, 2) + '\n', 'utf8');
  writeFileSync(bundlePath, JSON.stringify(bundle, null, 2) + '\n', 'utf8');
  return { dossierPath, sigPath, bundlePath, bundle, quarantine };
}
