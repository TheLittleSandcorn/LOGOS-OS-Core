import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { fileURLToPath } from 'node:url';
import { admitFormalTheorem } from '../bricks/cosci-bridge/formal-theorem-gate.ts';
import { isKnownDeadEnd, listQuarantineEntries, recordAntiAFailure } from '../bricks/graph-memory/failure-alchemist.ts';
import { LOGOS_VERSION } from '../kernel/paths.ts';
import { ensureSeededDatabase } from '../kernel/seed-bootstrap.ts';

export function runImmuneSystemAudit(): { quarantinedCount: number; zeroAmnesiaVerified: boolean; classALedgerUntouched: boolean } {
  const memUri = 'file:logos_v22_immune?mode=memory&cache=shared';
  const holdDb = new DatabaseSync(memUri);
  try {
    ensureSeededDatabase(memUri);
    const beforeRows = holdDb.prepare('SELECT COUNT(*) AS cnt FROM eavt_ledger').get() as { cnt: number };

    // 1. Angriffssimulation: sorryAx-Theorem
    const attack1 = admitFormalTheorem({
      id: 'adv:sorry_injection',
      statement: 'theorem fake : False := by sorryAx',
      containsSorryAx: true,
      hasFormalProof: true,
      hasMethodologicalContext: true
    });
    assert.equal(attack1.admitted, false);
    const q1 = recordAntiAFailure('adv:sorry_injection', attack1.reason, 'theorem fake : False := by sorryAx', memUri);
    assert.equal(q1.newlyQuarantined, true);

    // 2. Null-Amnesie-Pruefung: Identischer Fehlschluss wird idempotent erkannt
    const q1Repeat = recordAntiAFailure('adv:sorry_injection', attack1.reason, 'theorem fake : False := by sorryAx', memUri);
    assert.equal(q1Repeat.newlyQuarantined, false);
    assert.equal(isKnownDeadEnd('adv:sorry_injection', attack1.reason, 'theorem fake : False := by sorryAx', memUri), true);

    // 3. Angriffssimulation: Semantischer MathVet-Drift (fehlendes F+K-Zwillings-Kontext-Gate)
    const attack2 = admitFormalTheorem({
      id: 'adv:mathvet_drift',
      statement: 'theorem unbounded_drift : True',
      containsSorryAx: false,
      hasFormalProof: true,
      hasMethodologicalContext: false
    });
    assert.equal(attack2.admitted, false);
    recordAntiAFailure('adv:mathvet_drift', attack2.reason, 'theorem unbounded_drift : True', memUri);

    const entries = listQuarantineEntries(memUri);
    assert.equal(entries.length, 2);

    const afterRows = holdDb.prepare('SELECT COUNT(*) AS cnt FROM eavt_ledger').get() as { cnt: number };
    assert.equal(beforeRows.cnt, afterRows.cnt);

    return {
      quarantinedCount: entries.length,
      zeroAmnesiaVerified: true,
      classALedgerUntouched: beforeRows.cnt === afterRows.cnt
    };
  } finally {
    holdDb.close();
  }
}

if (process.argv === fileURLToPath(import.meta.url)) {
  const report = runImmuneSystemAudit();
  console.log(`LOGOS-OS-CORE v${LOGOS_VERSION} EPISTEMIC IMMUNE SYSTEM AUDIT PASSED:`, report);
}
