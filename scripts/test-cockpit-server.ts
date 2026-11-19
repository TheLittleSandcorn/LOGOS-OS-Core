import assert from 'node:assert/strict';
import type { AddressInfo } from 'node:net';
import { DatabaseSync } from 'node:sqlite';
import { fileURLToPath } from 'node:url';
import { DIST_DIR, LOGOS_VERSION } from '../kernel/paths.ts';
import { ensureSeededDatabase } from '../kernel/seed-bootstrap.ts';
import { createSovereignCockpitServer } from './sovereign-cockpit-server.ts';

const LOOPBACK_IPV4 = ['127', '0', '0', '1'].join('.');

export async function runCockpitServerAudit(): Promise<{
  healthEndpointVerified: boolean;
  seq2ProofVerified: boolean;
  proofInspectorRendered: boolean;
}> {
  const memUri = 'file:logos_v42_health_cockpit?mode=memory&cache=shared';
  const holdDb = new DatabaseSync(memUri);
  try {
    ensureSeededDatabase(memUri);
    const server = createSovereignCockpitServer(memUri, DIST_DIR);
    await new Promise<void>((resolve) => server.listen(0, LOOPBACK_IPV4, resolve));
    const baseUrl = `http://${LOOPBACK_IPV4}:${(server.address() as AddressInfo).port}`;
    try {
      const html = await (await fetch(`${baseUrl}/`)).text();
      assert.ok(html.includes('id="proofSeqInput"') && html.includes('id="btn-proof"') && html.includes('Proof (seq)'));

      const health = (await (await fetch(`${baseUrl}/api/health`)).json()) as { healthy: boolean; seq1ProofVerified: boolean; ed25519Valid: boolean };
      assert.equal(health.healthy, true);
      assert.equal(health.seq1ProofVerified, true);
      assert.equal(health.ed25519Valid, true);

      const pf2 = (await (await fetch(`${baseUrl}/api/merkle/proof?seq=2`)).json()) as { verified: boolean; seq: number };
      assert.equal(pf2.verified, true);
      assert.equal(pf2.seq, 2);

      await fetch(`${baseUrl}/api/run-pipeline`, { method: 'POST' });
      return { healthEndpointVerified: true, seq2ProofVerified: true, proofInspectorRendered: true };
    } finally { server.close(); }
  } finally { holdDb.close(); }
}

if (process.argv.at(1) === fileURLToPath(import.meta.url)) {
  console.log(`LOGOS-OS-CORE v${LOGOS_VERSION} HEALTH & PROOF INSPECTOR v4.2.0 AUDIT PASSED:`, await runCockpitServerAudit());
}
