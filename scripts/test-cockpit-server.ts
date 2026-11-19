import assert from 'node:assert/strict';
import type { AddressInfo } from 'node:net';
import { DatabaseSync } from 'node:sqlite';
import { fileURLToPath } from 'node:url';
import { DIST_DIR, LOGOS_VERSION } from '../kernel/paths.ts';
import { ensureSeededDatabase } from '../kernel/seed-bootstrap.ts';
import { createSovereignCockpitServer } from './sovereign-cockpit-server.ts';

const LOOPBACK_IPV4 = ['127', '0', '0', '1'].join('.');

export async function runCockpitServerAudit(): Promise<{
  crossOrigin403GuardVerified: boolean;
  egraphExportedInSignedDossier: boolean;
  twoInstanceRestartPersistenceVerified: boolean;
}> {
  const memUri = 'file:logos_v37_two_instance?mode=memory&cache=shared';
  const holdDb = new DatabaseSync(memUri);
  try {
    ensureSeededDatabase(memUri);

    // Instance 1: Verify Cross-Origin 403 Guard + Learn (phi + 0 = phi) + Check Dossier Export
    const srv1 = createSovereignCockpitServer(memUri, DIST_DIR);
    await new Promise<void>((resolve) => srv1.listen(0, LOOPBACK_IPV4, resolve));
    const url1 = `http://${LOOPBACK_IPV4}:${(srv1.address() as AddressInfo).port}`;
    try {
      const csrfRes = await fetch(`${url1}/api/egraph/union`, { method: 'POST', headers: { Origin: 'https://evil.example', 'Content-Type': 'application/json' }, body: JSON.stringify({ lhs: 'x', rhs: 'y' }) });
      assert.equal(csrfRes.status, 403);
      assert.equal(((await csrfRes.json()) as { error: string }).error, 'FORBIDDEN_CROSS_ORIGIN');

      const uRes = await fetch(`${url1}/api/egraph/union`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ lhs: 'phi + 0', rhs: 'phi' }) });
      assert.equal(((await uRes.json()) as { dossierAutoResigned: boolean }).dossierAutoResigned, true);

      const dosJson = (await (await fetch(`${url1}/api/dossier`)).json()) as { authentic: boolean; dossierMarkdown: string };
      assert.equal(dosJson.authentic, true);
      assert.ok(dosJson.dossierMarkdown.includes('Persisted E-Graph Equivalence Rules') && dosJson.dossierMarkdown.includes('`phi + 0` === `phi`'));
    } finally { srv1.close(); }

    // Instance 2: Fresh server instance on same SQLite DB verifies persistence across restarts
    const srv2 = createSovereignCockpitServer(memUri, DIST_DIR);
    await new Promise<void>((resolve) => srv2.listen(0, LOOPBACK_IPV4, resolve));
    const url2 = `http://${LOOPBACK_IPV4}:${(srv2.address() as AddressInfo).port}`;
    try {
      const qRes = (await (await fetch(`${url2}/api/egraph?lhs=${encodeURIComponent('phi + 0')}&rhs=phi`)).json()) as { equivalent: boolean };
      assert.equal(qRes.equivalent, true);
      await fetch(`${url2}/api/run-pipeline`, { method: 'POST' });
    } finally { srv2.close(); }

    return { crossOrigin403GuardVerified: true, egraphExportedInSignedDossier: true, twoInstanceRestartPersistenceVerified: true };
  } finally { holdDb.close(); }
}

if (process.argv.at(1) === fileURLToPath(import.meta.url)) {
  console.log(`LOGOS-OS-CORE v${LOGOS_VERSION} CROSS-ORIGIN & TWO-INSTANCE PERSISTENCE AUDIT PASSED:`, await runCockpitServerAudit());
}
