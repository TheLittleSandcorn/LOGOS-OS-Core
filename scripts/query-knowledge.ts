import { DatabaseSync } from 'node:sqlite';
import { fileURLToPath } from 'node:url';
import { DEFAULT_DB_PATH } from '../kernel/paths.ts';
import { ensureSeededDatabase } from '../kernel/seed-bootstrap.ts';

export interface KnowledgeSearchRow {
  seq: number;
  entity: string;
  attribute: string;
  value: string;
  truth_state: string;
  epistemic_class: string;
  retracted_by_seq: number | null;
}

export function searchKnowledgeLedger(term: string, dbPath: string = DEFAULT_DB_PATH): KnowledgeSearchRow[] {
  ensureSeededDatabase(dbPath);
  const db = new DatabaseSync(dbPath, { readOnly: true });
  try {
    const pattern = `%${term}%`;
    return db
      .prepare(
        'SELECT seq, entity, attribute, value, truth_state, epistemic_class, retracted_by_seq FROM eavt_ledger WHERE entity LIKE ? OR attribute LIKE ? OR value LIKE ? ORDER BY seq ASC'
      )
      .all(pattern, pattern, pattern) as unknown as KnowledgeSearchRow[];
  } finally {
    db.close();
  }
}

export function retractEntityWithCascade(
  targetEntity: string,
  dbPath: string = DEFAULT_DB_PATH
): { retractionSeq: number; affectedEntities: string[] } {
  ensureSeededDatabase(dbPath);
  const db = new DatabaseSync(dbPath);
  try {
    db.exec('CREATE TABLE IF NOT EXISTS lineage_edges (parent_entity TEXT NOT NULL, child_entity TEXT NOT NULL, PRIMARY KEY (parent_entity, child_entity))');
    const ins = db.prepare(
      'INSERT INTO eavt_ledger (entity, attribute, value, truth_state, confidence, epistemic_class, retracted_by_seq) VALUES (?, ?, ?, ?, ?, ?, NULL)'
    );
    const info = ins.run(targetEntity, 'retraction_event', 'CONFLICT_RETRACTED', 'FALSE', 1.0, 'CLASS_A');
    const retractionSeq = Number(info.lastInsertRowid);

    const descendants = db
      .prepare(
        `WITH RECURSIVE cascade(ent) AS (
          SELECT ?
          UNION
          SELECT le.child_entity FROM lineage_edges le JOIN cascade c ON le.parent_entity = c.ent
        )
        SELECT ent FROM cascade`
      )
      .all(targetEntity) as Array<{ ent: string }>;

    const affectedEntities = descendants.map((d) => d.ent);
    const upd = db.prepare('UPDATE eavt_ledger SET retracted_by_seq = ? WHERE entity = ? AND retracted_by_seq IS NULL AND seq < ?');
    for (const ent of affectedEntities) {
      upd.run(retractionSeq, ent, retractionSeq);
    }
    return { retractionSeq, affectedEntities };
  } finally {
    db.close();
  }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const cmd = process.argv[2] ?? 'search';
  const arg = process.argv[3] ?? '';
  if (cmd === 'search') {
    const hits = searchKnowledgeLedger(arg);
    console.log(`LOGOS-OS-CORE CLI INSPECTOR (${hits.length} hits for "${arg}"):`, hits);
  } else if (cmd === 'retract' && arg) {
    console.log('LOGOS-OS-CORE RETRACTION CASCADE:', retractEntityWithCascade(arg));
  }
}
