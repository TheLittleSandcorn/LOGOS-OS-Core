import assert from 'node:assert/strict';
import type { AddressInfo } from 'node:net';
import { DatabaseSync } from 'node:sqlite';
import { fileURLToPath } from 'node:url';
import { DIST_DIR, LOGOS_VERSION } from '../kernel/paths.ts';
import { ensureSeededDatabase } from '../kernel/seed-bootstrap.ts';
import { createSovereignCockpitServer , SESSION_TOKEN } from './sovereign-cockpit-server.ts';

const LOOPBACK_IPV4 = ['127', '0', '0', '1'].join('.');

export async function runCockpitServerAudit(): Promise<{
  portableBundleEndpointVerified: boolean;
  backupCleanupEndpointVerified: boolean;
  evidenceBundleButtonRendered: boolean;
}> {
  const memUri = 'file:logos_v44_bundle_cockpit?mode=memory&cache=shared';
  const holdDb = new DatabaseSync(memUri);
  try {
    ensureSeededDatabase(memUri);
    const server = createSovereignCockpitServer(memUri, DIST_DIR);
    await new Promise<void>((resolve) => server.listen(0, LOOPBACK_IPV4, resolve));
    const baseUrl = `http://${LOOPBACK_IPV4}:${(server.address() as AddressInfo).port}`;
    try {
      const html = await (await fetch(`${baseUrl}/`)).text();
      assert.ok(html.includes('id="btn-bundle"') && html.includes('Evidence Bundle'));

      const bdl = (await (await fetch(`${baseUrl}/api/bundle`)).json()) as { merkleRoot: string; leafCount: number };
      assert.match(bdl.merkleRoot, /^[a-f0-9]{64}$/);
      assert.ok(bdl.leafCount >= 4);

      const unauthAttest = await fetch(`${baseUrl}/api/attest`, { method: 'POST' });
      assert.equal(unauthAttest.status, 401);
      const cln = (await (await fetch(`${baseUrl}/api/backups`, { method: 'DELETE', headers: { 'X-Logos-Token': SESSION_TOKEN } })).json()) as { cleaned: boolean };
      assert.equal(cln.cleaned, true);

      await fetch(`${baseUrl}/api/run-pipeline`, { method: 'POST', headers: { 'X-Logos-Token': SESSION_TOKEN } });
      return { portableBundleEndpointVerified: true, backupCleanupEndpointVerified: true, evidenceBundleButtonRendered: true };
    } finally { server.close(); }
  } finally { holdDb.close(); }
}

if (process.argv.at(1) === fileURLToPath(import.meta.url)) {
  console.log(`LOGOS-OS-CORE v${LOGOS_VERSION} PORTABLE BUNDLE & CLEANUP v4.4.0 AUDIT PASSED:`, await runCockpitServerAudit());
}
