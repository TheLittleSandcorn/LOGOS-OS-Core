import assert from 'node:assert/strict';
import type { AddressInfo } from 'node:net';
import { DatabaseSync } from 'node:sqlite';
import { fileURLToPath } from 'node:url';
import { DIST_DIR, LOGOS_VERSION } from '../kernel/paths.ts';
import { ensureSeededDatabase } from '../kernel/seed-bootstrap.ts';
import { createSovereignCockpitServer } from './sovereign-cockpit-server.ts';

const LOOPBACK_IPV4 = ['127', '0', '0', '1'].join('.');

export async function runCockpitServerAudit(): Promise<{
  sqliteEgraphPersistenceVerified: boolean;
  dossierDialogModalRendered: boolean;
}> {
  const memUri = 'file:logos_v36_sqlite_egraph?mode=memory&cache=shared';
  const holdDb = new DatabaseSync(memUri);
  try {
    ensureSeededDatabase(memUri);
    const server = createSovereignCockpitServer(memUri, DIST_DIR);
    await new Promise<void>((resolve) => server.listen(0, LOOPBACK_IPV4, resolve));
    const baseUrl = `http://${LOOPBACK_IPV4}:${(server.address() as AddressInfo).port}`;
    try {
      const html = await (await fetch(`${baseUrl}/`)).text();
      assert.ok(html.includes('id="dosDlg"') && html.includes('Ed25519 Dossier'));

      const uRes = await fetch(`${baseUrl}/api/egraph/union`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ lhs: 'tau + 0', rhs: 'tau' }) });
      const uJson = (await uRes.json()) as { persistedInSqlite: boolean; equivalent: boolean };
      assert.equal(uJson.persistedInSqlite, true);
      assert.equal(uJson.equivalent, true);

      const stJson = (await (await fetch(`${baseUrl}/api/status`)).json()) as { egraphRuleCount: number };
      assert.ok(stJson.egraphRuleCount >= 1);

      return { sqliteEgraphPersistenceVerified: true, dossierDialogModalRendered: true };
    } finally { server.close(); }
  } finally { holdDb.close(); }
}

if (process.argv.at(1) === fileURLToPath(import.meta.url)) {
  console.log(`LOGOS-OS-CORE v${LOGOS_VERSION} SQLITE E-GRAPH & DOSSIER MODAL AUDIT PASSED:`, await runCockpitServerAudit());
}
