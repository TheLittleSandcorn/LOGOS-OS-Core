export interface McdaCandidate {
  id: string;
  security: number;
  determinism: number;
  simplicity: number;
}

export function evaluateMcdaCandidate(
  candidate: McdaCandidate,
  weights: { security: number; determinism: number; simplicity: number } = { security: 0.5, determinism: 0.3, simplicity: 0.2 }
): { approved: boolean; weightedScore: number; reason: string } {
  const scores = [candidate.security, candidate.determinism, candidate.simplicity];
  if (scores.some((s) => Number.isNaN(s) || s < 0 || s > 10)) {
    throw new Error('MCDA_SCORE_OUT_OF_BOUNDS: Scores must be within [0, 10].');
  }
  if (candidate.security < 6.0) {
    return { approved: false, weightedScore: 0, reason: `SECURITY_FLOOR_VIOLATION (${candidate.security} < 6.0)` };
  }
  const wSum = weights.security + weights.determinism + weights.simplicity;
  const weightedScore = Number(
    (
      (candidate.security * weights.security +
        candidate.determinism * weights.determinism +
        candidate.simplicity * weights.simplicity) /
      wSum
    ).toFixed(4)
  );
  return { approved: true, weightedScore, reason: 'MCDA_SECURITY_FLOOR_PASSED' };
}
