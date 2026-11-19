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
  strictlyMonotonicSeqCount: number;
  belnap4Verified: boolean;
  cartridgeSha256Verified: boolean;
} {
  const reg = new ZeroPageKernelRegister();
  reg.assertNotHalted();
  reg.switchMode(MODE_EXPLORE_SANDBOX);
  assert.equal(reg.hasPolicy(POLICY_WRITE_CLASS_A), false);
  reg.switchMode(MODE_STRICT_PROOF);
  assert.equal(reg.hasPolicy(POLICY_WRITE_CLASS_A), true);

  ensureSeededDatabase(dbPath);
  const db = new DatabaseSync(dbPath, { readOnly: true });
  let seqs: number[] = [];
  try {
    const rows = db.prepare('SELECT seq FROM eavt_ledger ORDER BY rowid ASC').all() as Array<{ seq: number }>;
    seqs = rows.map((r) => r.seq);
    for (let i = 1; i < seqs.length; i++) {
      assert.ok(seqs[i]! > seqs[i - 1]!, `NON_MONOTONIC_SEQ_AT_${i}`);
    }
  } finally { db.close(); }

  assert.equal(evaluateEntityBelnapState('axiom:belnap_4', dbPath).state, 'TRUE');

  const cartridgePath = join(outDir, 'eternal-proof-cartridge.html');
  let cartridgeSha256Verified = false;
  if (existsSync(cartridgePath)) {
    const html = readFileSync(cartridgePath, 'utf8');
    const hashMatch = html.match(/id="expected-hash">([a-f0-9]{64})</);
    const payloadMatch = html.match(/id="payload">([\s\S]*?)<\/pre>/);
    assert.ok(hashMatch && payloadMatch, 'CARTRIDGE_TAGS_MISSING');
    assert.equal(createHash('sha256').update(payloadMatch!, 'utf8').digest('hex'), hashMatch, 'CARTRIDGE_SHA256_TAMPERED');
    cartridgeSha256Verified = true;
  }

  return { abiBankIsolationVerified: true, strictlyMonotonicSeqCount: seqs.length, belnap4Verified: true, cartridgeSha256Verified };
}

if (process.argv.at(1) === fileURLToPath(import.meta.url)) {
  console.log(`LOGOS-OS-CORE v${LOGOS_VERSION} MONOTONIC LEDGER INTEGRITY AUDIT PASSED:`, runFullIntegrityAudit());
}
