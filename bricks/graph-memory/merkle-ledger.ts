import { createHash } from 'node:crypto';
import { DatabaseSync } from 'node:sqlite';
import { DEFAULT_DB_PATH } from '../../kernel/paths.ts';
import { ensureSeededDatabase } from '../../kernel/seed-bootstrap.ts';

export interface LedgerRow {
  seq: number;
  entity: string;
  attribute: string;
  value: string;
  truth_state: string;
  confidence: number;
  epistemic_class: string;
  retracted_by_seq: number | null;
}

export interface MerkleSnapshot {
  leafCount: number;
  merkleRoot: string;
  leaves: string[];
}

function sha256Hex(data: string): string {
  return createHash('sha256').update(data, 'utf8').digest('hex');
}

export function computeLeafHash(row: LedgerRow): string {
  const canonical = `${row.seq}|${row.entity}|${row.attribute}|${row.value}|${row.truth_state}|${row.confidence}|${row.epistemic_class}|${row.retracted_by_seq ?? 'NULL'}`;
  return sha256Hex(`LEAF:${canonical}`);
}

export function buildMerkleRootFromLeaves(leaves: string[]): string {
  if (leaves.length === 0) return sha256Hex('EMPTY_MERKLE_TREE');
  let level = [...leaves];
  while (level.length > 1) {
    const next: string[] = [];
    for (let i = 0; i < level.length; i += 2) {
      const left = level[i]!;
      const right = level[i + 1] ?? left;
      next.push(sha256Hex(`NODE:${left}:${right}`));
    }
    level = next;
  }
  return level[0]!;
}

export function computeEavtMerkleSnapshot(dbPath: string = DEFAULT_DB_PATH): MerkleSnapshot {
  ensureSeededDatabase(dbPath);
  const db = new DatabaseSync(dbPath, { readOnly: true });
  try {
    const rows = db.prepare('SELECT * FROM eavt_ledger ORDER BY seq ASC').all() as unknown as LedgerRow[];
    const leaves = rows.map(computeLeafHash);
    return {
      leafCount: leaves.length,
      merkleRoot: buildMerkleRootFromLeaves(leaves),
      leaves
    };
  } finally {
    db.close();
  }
}

export function generateInclusionProof(leaves: string[], targetIndex: number): Array<{ position: 'LEFT' | 'RIGHT'; hash: string }> {
  if (targetIndex < 0 || targetIndex >= leaves.length) {
    throw new Error(`INVALID_LEAF_INDEX: ${targetIndex}`);
  }
  const proof: Array<{ position: 'LEFT' | 'RIGHT'; hash: string }> = [];
  let idx = targetIndex;
  let level = [...leaves];
  while (level.length > 1) {
    const isRight = idx % 2 === 1;
    const siblingIdx = isRight ? idx - 1 : idx + 1;
    const siblingHash = level[siblingIdx] ?? level[idx]!;
    proof.push({ position: isRight ? 'LEFT' : 'RIGHT', hash: siblingHash });
    const next: string[] = [];
    for (let i = 0; i < level.length; i += 2) {
      const left = level[i]!;
      const right = level[i + 1] ?? left;
      next.push(sha256Hex(`NODE:${left}:${right}`));
    }
    level = next;
    idx = Math.floor(idx / 2);
  }
  return proof;
}

export function verifyInclusionProof(
  leafHash: string,
  proof: Array<{ position: 'LEFT' | 'RIGHT'; hash: string }>,
  expectedRoot: string
): boolean {
  let curr = leafHash;
  for (const step of proof) {
    curr = step.position === 'LEFT'
      ? sha256Hex(`NODE:${step.hash}:${curr}`)
      : sha256Hex(`NODE:${curr}:${step.hash}`);
  }
  return curr === expectedRoot;
}
