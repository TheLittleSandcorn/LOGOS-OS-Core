import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { fileURLToPath } from 'node:url';
import { MODE_EXPLORE_SANDBOX, MODE_STRICT_PROOF, POLICY_WRITE_CLASS_A, ZeroPageKernelRegister } from '../kernel/abi-jump-table.ts';
import { evaluateEntityBelnapState } from '../kernel/belnap-engine.ts';
import { DEFAULT_DB_PATH, DIST_DIR, LOGOS_VERSION } from '../kernel/paths.ts';
import { ensureSeededDatabase } from '../kernel/seed-bootstrap.ts';

export function runFullIntegrityAudit(dbPath: string = DEFAULT_DB_PATH, outDir: string = DIST_DIR): {
  abiBankIsolationVerified: boolean;
  contiguousSeqCount: number;
  belnap4Verified: boolean;
  cartridgeSha256Verified: boolean;
} {
  // Layer 1: Zero-Page ABI Bank Isolation
  const reg = new ZeroPageKernelRegister();
  reg.assertNotHalted();
  reg.switchMode(MODE_EXPLORE_SANDBOX);
  assert.equal(reg.hasPolicy(POLICY_WRITE_CLASS_A), false);
  reg.switchMode(MODE_STRICT_PROOF);
  assert.equal(reg.hasPolicy(POLICY_WRITE_CLASS_A), true);

  // Layer 2: Contiguous SQLite EAVT seq sequence
  ensureSeededDatabase(dbPath);
  const db = new DatabaseSync(dbPath, { readOnly: true });
  let seqs: number[] = [];
  try {
    const rows = db.prepare('SELECT seq FROM eavt_ledger ORDER BY seq ASC').all() as Array<{ seq: number }>;
    seqs = rows.map((r) => r.seq);
    for (let i = 0; i < seqs.length; i++) {
      assert.equal(seqs[i], i + 1, `NON_CONTIGUOUS_SEQ_AT_${i}`);
    }
  } finally {
    db.close();
  }

  // Layer 3: Belnap-4 Entity State Evaluation
  const belnapRes = evaluateEntityBelnapState('axiom:belnap_4', dbPath);
  assert.equal(belnapRes.state, 'TRUE');

  // Layer 4: Eternal HTML Cartridge embedded SHA-256 Digest Verification
  const cartridgePath = join(outDir, 'eternal-proof-cartridge.html');
  let cartridgeSha256Verified = false;
  if (existsSync(cartridgePath)) {
    const html = readFileSync(cartridgePath, 'utf8');
    const hashMatch = html.match(/id="expected-hash">([a-f0-9]{64})</);
    const payloadMatch = html.match(/id="payload">([\s\S]*?)<\/pre>/);
    assert.ok(hashMatch && payloadMatch, 'CARTRIDGE_TAGS_MISSING');
    const actualSha256 = createHash('sha256').update(payloadMatch[1]!, 'utf8').digest('hex');
    assert.equal(actualSha256, hashMatch[1], 'CARTRIDGE_SHA256_TAMPERED');
    cartridgeSha256Verified = true;
  }

  return {
    abiBankIsolationVerified: true,
    contiguousSeqCount: seqs.length,
    belnap4Verified: true,
    cartridgeSha256Verified
  };
}

if (process.argv === fileURLToPath(import.meta.url)) {
  const report = runFullIntegrityAudit();
  console.log(`LOGOS-OS-CORE v${LOGOS_VERSION} 4-LAYER INTEGRITY AUDIT PASSED:`, report);
}
