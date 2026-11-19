import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
import { admitFormalTheorem } from '../bricks/cosci-bridge/formal-theorem-gate.ts';
import { LOGOS_VERSION } from '../kernel/paths.ts';

function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function runChaosSeedFuzzer(seed = 0x5eed2026, iterations = 50): {
  seedHex: string;
  totalMutations: number;
  blockedAttacks: number;
  admittedValid: number;
} {
  const rng = mulberry32(seed);
  let blockedAttacks = 0;
  let admittedValid = 0;

  for (let i = 0; i < iterations; i++) {
    const roll = rng();
    const containsSorryAx = roll < 0.35;
    const hasMethodologicalContext = roll >= 0.35 && roll < 0.7;
    const isValid = !containsSorryAx && hasMethodologicalContext;

    const res = admitFormalTheorem({
      id: `fuzz:mutant:${i}`,
      statement: `theorem mutant_${i} : Prop`,
      containsSorryAx,
      hasFormalProof: true,
      hasMethodologicalContext
    });

    assert.equal(res.admitted, isValid, `FUZZ_INVARIANT_BROKEN_AT_${i}`);
    if (res.admitted) admittedValid++;
    else blockedAttacks++;
  }

  return {
    seedHex: `0x${seed.toString(16).toUpperCase()}`,
    totalMutations: iterations,
    blockedAttacks,
    admittedValid
  };
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const report = runChaosSeedFuzzer();
  console.log(`LOGOS-OS-CORE v${LOGOS_VERSION} MULBERRY32 CHAOS-SEED FUZZER PASSED:`, report);
}
