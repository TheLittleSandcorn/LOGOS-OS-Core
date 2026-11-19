export interface FormalTheoremCandidate {
  id: string;
  statement: string;
  containsSorryAx: boolean;
  hasFormalProof: boolean;
  hasMethodologicalContext: boolean;
}

export function admitFormalTheorem(candidate: FormalTheoremCandidate): { admitted: boolean; reason: string } {
  if (candidate.containsSorryAx || !candidate.hasFormalProof) {
    return { admitted: false, reason: 'ADR_001_REJECTED_INCOMPLETE_OR_SORRY_AX' };
  }
  if (!candidate.hasMethodologicalContext) {
    return { admitted: false, reason: 'FK_TWIN_VIOLATION_MISSING_METHODOLOGICAL_CONTEXT' };
  }
  return { admitted: true, reason: 'CLASS_A_FORMAL_AND_CONTEXT_VERIFIED' };
}
