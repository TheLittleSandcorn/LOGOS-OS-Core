import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { DIST_DIR, LOGOS_VERSION } from '../../kernel/paths.ts';
import type { EvidenceBundle } from '../graph-memory/export-audit-dossier.ts';

export function exportLlmsTxtManifest(bundle: EvidenceBundle, outDir: string = DIST_DIR): string {
  mkdirSync(outDir, { recursive: true });
  const llmsPath = join(outDir, 'llms.txt');
  const content = [
    `# LOGOS-OS-Core v${LOGOS_VERSION} — Sovereign AI-Web Topology & Verification Manifest`,
    '',
    '> Zero-Dependency TypeScript & Node.js Cryptographic Verification Core (127.0.0.1 Loopback Only)',
    '',
    '## Cryptographic Identity',
    `- Version: v${LOGOS_VERSION}`,
    `- Trust-Anchor Key-ID (Ed25519): ${bundle.keyId}`,
    `- Merkle-Root (SHA-256): ${bundle.merkleRoot}`,
    `- EAVT Ledger Leaves: ${bundle.leafCount}`,
    '',
    '## Architecture Bricks',
    '- kernel/seed-bootstrap.ts: Deterministic SQLite EAVT ledger bootstrap',
    '- kernel/belnap-engine.ts: 4-valued Belnap logic (TRUE | FALSE | BOTH | NEITHER)',
    '- bricks/graph-memory/: Binary SHA-256 Merkle tree, Ed25519 trust anchor, Zero-DB bundle verifier',
    '- bricks/cosci-bridge/: Epistemic Class A-D gating & bridge to https://github.com',
    ''
  ].join('\n');
  writeFileSync(llmsPath, content, 'utf8');
  return llmsPath;
}
