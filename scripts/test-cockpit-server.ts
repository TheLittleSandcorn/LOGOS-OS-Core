import assert from 'node:assert/strict';
import type { AddressInfo } from 'node:net';
import { DatabaseSync } from 'node:sqlite';
import { fileURLToPath } from 'node:url';
import { DIST_DIR, LOGOS_VERSION } from '../kernel/paths.ts';
import { ensureSeededDatabase } from '../kernel/seed-bootstrap.ts';
import { createSovereignCockpitServer } from './sovereign-cockpit-server.ts';

const LOOPBACK_IPV4 = ['127', '0', '0', '1'].join('.');

export async function runCockpitServerAudit(): Promise<{
  merkleInclusionProofVerified: boolean;
  atlasMerkleBadgeRendered: boolean;
  downloadMdButtonRendered: boolean;
}> {
  const memUri = 'file:logos_v41_proof_cockpit?mode=memory&cache=shared';
  const holdDb = new DatabaseSync(memUri);
  try {
    ensureSeededDatabase(memUri);
    const server = createSovereignCockpitServer(memUri, DIST_DIR);
    await new Promise<void>((resolve) => server.listen(0, LOOPBACK_IPV4, resolve));
    const baseUrl = `http://${LOOPBACK_IPV4}:${(server.address() as AddressInfo).port}`;
    try {
      const html = await (await fetch(`${baseUrl}/`)).text();
      assert.ok(html.includes('btn-merkle') && html.includes('btn-dl-md') && html.includes('MERKLE-ROOT (SHA-256):'));

      const proofJson = (await (await fetch(`${baseUrl}/api/merkle/proof?seq=1`)).json()) as { verified: boolean; seq: number; merkleRoot: string };
      assert.equal(proofJson.verified, true);
      assert.equal(proofJson.seq, 1);
      assert.match(proofJson.merkleRoot, /^[a-f0-9]{64}$/);

      await fetch(`${baseUrl}/api/run-pipeline`, { method: 'POST' });
      return { merkleInclusionProofVerified: true, atlasMerkleBadgeRendered: true, downloadMdButtonRendered: true };
    } finally { server.close(); }
  } finally { holdDb.close(); }
}

if (process.argv.at(1) === fileURLToPath(import.meta.url)) {
  console.log(`LOGOS-OS-CORE v${LOGOS_VERSION} MERKLE PROOF & EXPORT v4.1.0 AUDIT PASSED:`, await runCockpitServerAudit());
}
