import { DatabaseSync } from 'node:sqlite';
import { DEFAULT_DB_PATH } from './paths.ts';

export type BelnapState = 'TRUE' | 'FALSE' | 'BOTH' | 'NEITHER';

export function evaluateBelnapFusion(hasPositive: boolean, hasNegative: boolean): BelnapState {
  if (hasPositive && hasNegative) return 'BOTH';
  if (hasPositive) return 'TRUE';
  if (hasNegative) return 'FALSE';
  return 'NEITHER';
}

export function classifyEpistemicAdmission(state: BelnapState): {
  epistemicClass: 'CLASS_A' | 'CLASS_B';
  quarantined: boolean;
} {
  if (state === 'TRUE' || state === 'FALSE') {
    return { epistemicClass: 'CLASS_A', quarantined: false };
  }
  return { epistemicClass: 'CLASS_B', quarantined: true };
}

export function evaluateEntityBelnapState(
  entity: string,
  dbPath: string = DEFAULT_DB_PATH
): { entity: string; state: BelnapState; activeClaims: number; quarantinedHits: number } {
  const db = new DatabaseSync(dbPath, { readOnly: true });
  try {
    const rows = db
      .prepare('SELECT truth_state FROM eavt_ledger WHERE entity = ? AND retracted_by_seq IS NULL')
      .all(entity) as Array<{ truth_state: string }>;
    let quarantinedHits = 0;
    try {
      const qRow = db
        .prepare('SELECT COUNT(*) AS cnt FROM anti_a_quarantine WHERE candidate_id = ?')
        .get(entity) as { cnt: number };
      quarantinedHits = qRow.cnt;
    } catch {}
    const hasPositive = rows.some((r) => r.truth_state === 'TRUE');
    const hasNegative = rows.some((r) => r.truth_state === 'FALSE');
    return {
      entity,
      state: evaluateBelnapFusion(hasPositive, hasNegative),
      activeClaims: rows.length,
      quarantinedHits
    };
  } finally {
    db.close();
  }
}
