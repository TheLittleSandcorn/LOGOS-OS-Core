import { existsSync, mkdirSync, readFileSync } from 'node:fs';
import { dirname } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { CANONICAL_SEED_PATH, DEFAULT_DB_PATH } from './paths.ts';

export interface CanonicalSeed {
  schema: string;
  ddl: string[];
  axioms: Array;
}

export function loadCanonicalSeed(): CanonicalSeed {
  return JSON.parse(readFileSync(CANONICAL_SEED_PATH, 'utf8')) as CanonicalSeed;
}

export function bootstrapDatabase(db: DatabaseSync): void {
  const seed = loadCanonicalSeed();
  for (const sql of seed.ddl) {
    db.exec(sql);
  }
  const row = db.prepare('SELECT COUNT(*) AS cnt FROM eavt_ledger').get() as { cnt: number };
  if (row.cnt === 0) {
    const insert = db.prepare(
      'INSERT INTO eavt_ledger (entity, attribute, value, truth_state, confidence, epistemic_class, retracted_by_seq) VALUES (?, ?, ?, ?, ?, ?, NULL)'
    );
    for (const ax of seed.axioms) {
      insert.run(ax.entity, ax.attribute, ax.value, ax.truth_state, ax.confidence, ax.epistemic_class);
    }
  }
}

export function ensureSeededDatabase(dbPath: string = DEFAULT_DB_PATH): string {
  if (dbPath !== ':memory:' && !dbPath.includes('mode=memory')) {
    mkdirSync(dirname(dbPath), { recursive: true });
  }
  const db = new DatabaseSync(dbPath);
  try {
    bootstrapDatabase(db);
  } finally {
    db.close();
  }
  return dbPath;
}

export function createMemorySeededDatabase(): DatabaseSync {
  const db = new DatabaseSync(':memory:');
  bootstrapDatabase(db);
  return db;
}
