import { createHash } from 'node:crypto';
import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { DEFAULT_DB_PATH } from '../../kernel/paths.ts';

export interface QuarantineRecord {
  fingerprint: string;
  candidate_id: string;
  error_code: string;
  snippet: string;
  recorded_seq: number;
}

function ensureQuarantineTable(db: DatabaseSync): void {
  db.exec(`CREATE TABLE IF NOT EXISTS anti_a_quarantine (
    recorded_seq INTEGER PRIMARY KEY AUTOINCREMENT,
    fingerprint TEXT UNIQUE NOT NULL,
    candidate_id TEXT NOT NULL,
    error_code TEXT NOT NULL,
    snippet TEXT NOT NULL
  )`);
}

export function computeFailureFingerprint(candidateId: string, errorCode: string, snippet: string): string {
  return createHash('sha256').update(`${candidateId}|${errorCode}|${snippet}`, 'utf8').digest('hex');
}

export function recordAntiAFailure(
  candidateId: string,
  errorCode: string,
  snippet: string,
  dbPath: string = DEFAULT_DB_PATH
): { fingerprint: string; newlyQuarantined: boolean } {
  if (dbPath !== ':memory:' && !dbPath.includes('mode=memory')) {
    mkdirSync(dirname(dbPath), { recursive: true });
  }
  const fingerprint = computeFailureFingerprint(candidateId, errorCode, snippet);
  const db = new DatabaseSync(dbPath);
  try {
    ensureQuarantineTable(db);
    const res = db
      .prepare('INSERT OR IGNORE INTO anti_a_quarantine (fingerprint, candidate_id, error_code, snippet) VALUES (?, ?, ?, ?)')
      .run(fingerprint, candidateId, errorCode, snippet);
    return { fingerprint, newlyQuarantined: Number(res.changes) > 0 };
  } finally {
    db.close();
  }
}

export function isKnownDeadEnd(
  candidateId: string,
  errorCode: string,
  snippet: string,
  dbPath: string = DEFAULT_DB_PATH
): boolean {
  const fingerprint = computeFailureFingerprint(candidateId, errorCode, snippet);
  const db = new DatabaseSync(dbPath);
  try {
    ensureQuarantineTable(db);
    const row = db.prepare('SELECT 1 AS hit FROM anti_a_quarantine WHERE fingerprint = ?').get(fingerprint) as { hit: number } | undefined;
    return Boolean(row?.hit);
  } finally {
    db.close();
  }
}

export function listQuarantineEntries(dbPath: string = DEFAULT_DB_PATH): QuarantineRecord[] {
  const db = new DatabaseSync(dbPath);
  try {
    ensureQuarantineTable(db);
    return db.prepare('SELECT fingerprint, candidate_id, error_code, snippet, recorded_seq FROM anti_a_quarantine ORDER BY recorded_seq ASC').all() as unknown as QuarantineRecord[];
  } finally {
    db.close();
  }
}
