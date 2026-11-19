export type EpistemicClass = 'CLASS_A' | 'CLASS_B' | 'CLASS_C' | 'CLASS_D';

export interface CoSciArtifactClaim {
  id: string;
  sourceRepo: string;
  epistemicClass: EpistemicClass;
  confidence: number;
  statement: string;
}

export function evaluateCoSciAdmission(claim: CoSciArtifactClaim): {
  acceptedIntoLedger: boolean;
  reason: string;
} {
  if (claim.epistemicClass === 'CLASS_A' && claim.confidence >= 0.95) {
    return { acceptedIntoLedger: true, reason: 'VERIFIED_CLASS_A_EVIDENCE' };
  }
  return { acceptedIntoLedger: false, reason: `QUARANTINED_${claim.epistemicClass}_BELOW_CLASS_A_THRESHOLD` };
}
