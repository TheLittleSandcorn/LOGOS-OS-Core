import assert from 'node:assert/strict';
import type { AddressInfo } from 'node:net';
import { DatabaseSync } from 'node:sqlite';
import { fileURLToPath } from 'node:url';
import { DIST_DIR, LOGOS_VERSION } from '../kernel/paths.ts';
import { ensureSeededDatabase } from '../kernel/seed-bootstrap.ts';
import { createSovereignCockpitServer } from './sovereign-cockpit-server.ts';

const LOOPBACK_IPV4 = ['127', '0', '0', '1'].join('.');

export async function runCockpitServerAudit(): Promise<{
  merkleRootEndpointVerified: boolean;
  merkleModalButtonRendered: boolean;
  ruleDeleteLifecycleVerified: boolean;
}> {
  const memUri = 'file:logos_v40_merkle_cockpit?mode=memory&cache=shared';
  const holdDb = new DatabaseSync(memUri);
  try {
    ensureSeededDatabase(memUri);
    const server = createSovereignCockpitServer(memUri, DIST_DIR);
    await new Promise<void>((resolve) => server.listen(0, LOOPBACK_IPV4, resolve));
    const baseUrl = `http://${LOOPBACK_IPV4}:${(server.address() as AddressInfo).port}`;
    try {
      const html = await (await fetch(`${baseUrl}/`)).text();
      assert.ok(html.includes('id="btn-merkle"') && html.includes('Merkle-Root') && html.includes('id="btn-egraph-del"'));

      const mkJson = (await (await fetch(`${baseUrl}/api/merkle`)).json()) as { merkleRoot: string; leafCount: number; recentLeaves: unknown[] };
      assert.match(mkJson.merkleRoot, /^[a-f0-9]{64}$/);
      assert.ok(mkJson.leafCount >= 4 && mkJson.recentLeaves.length >= 4);

      await fetch(`${baseUrl}/api/egraph/union`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ lhs: 'alpha + 0', rhs: 'alpha' }) });
      const delRes = await fetch(`${baseUrl}/api/egraph/rule?lhs=${encodeURIComponent('alpha + 0')}`, { method: 'DELETE' });
      assert.equal(delRes.status, 200);

      await fetch(`${baseUrl}/api/run-pipeline`, { method: 'POST' });
      return { merkleRootEndpointVerified: true, merkleModalButtonRendered: true, ruleDeleteLifecycleVerified: true };
    } finally { server.close(); }
  } finally { holdDb.close(); }
}

if (process.argv.at(1) === fileURLToPath(import.meta.url)) {
  console.log(`LOGOS-OS-CORE v${LOGOS_VERSION} MERKLE TREE & COCKPIT v4.0.0 AUDIT PASSED:`, await runCockpitServerAudit());
}
