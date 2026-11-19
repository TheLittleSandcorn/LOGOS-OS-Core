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
