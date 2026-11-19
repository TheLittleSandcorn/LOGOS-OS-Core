import assert from 'node:assert/strict';
import type { AddressInfo } from 'node:net';
import { DatabaseSync } from 'node:sqlite';
import { fileURLToPath } from 'node:url';
import { DIST_DIR, LOGOS_VERSION } from '../kernel/paths.ts';
import { ensureSeededDatabase } from '../kernel/seed-bootstrap.ts';
import { createSovereignCockpitServer } from './sovereign-cockpit-server.ts';

const LOOPBACK_IPV4 = ['127', '0', '0', '1'].join('.');

export async function runCockpitServerAudit(): Promise<{
  dossierEd25519LiveAuthentic: boolean;
  paraconsistentRetractRecoverCycleVerified: boolean;
  oneClickAtlasReloadVerified: boolean;
}> {
  const memUri = 'file:logos_v32_retract_cycle?mode=memory&cache=shared';
  const holdDb = new DatabaseSync(memUri);
  try {
    ensureSeededDatabase(memUri);
    const server = createSovereignCockpitServer(memUri, DIST_DIR);
    await new Promise<void>((resolve) => server.listen(0, LOOPBACK_IPV4, resolve));
    const addr = server.address() as AddressInfo;
    const baseUrl = `http://${LOOPBACK_IPV4}:${addr.port}`;
    try {
      const dossierJson = (await (await fetch(`${baseUrl}/api/dossier`)).json()) as { authentic: boolean };
      assert.equal(dossierJson.authentic, true);

      const initialBelnap = (await (await fetch(`${baseUrl}/api/belnap?entity=axiom:belnap_4`)).json()) as { state: string };
      assert.equal(initialBelnap.state, 'TRUE');

      const retractJson = (await (await fetch(`${baseUrl}/api/retract?entity=axiom:belnap_4`, { method: 'POST' })).json()) as { atlasReloaded: boolean; evaluation: { state: string } };
      assert.equal(retractJson.atlasReloaded, true);
      assert.equal(retractJson.evaluation.state, 'BOTH');

      const recoverJson = (await (await fetch(`${baseUrl}/api/recover?entity=axiom:belnap_4`, { method: 'POST' })).json()) as { atlasReloaded: boolean; evaluation: { state: string } };
      assert.equal(recoverJson.atlasReloaded, true);
      assert.equal(recoverJson.evaluation.state, 'TRUE');

      const restoreRes = await fetch(`${baseUrl}/api/run-pipeline`, { method: 'POST' });
      assert.equal(restoreRes.status, 200);

      return { dossierEd25519LiveAuthentic: true, paraconsistentRetractRecoverCycleVerified: true, oneClickAtlasReloadVerified: true };
    } finally { server.close(); }
  } finally { holdDb.close(); }
}

if (process.argv.at(1) === fileURLToPath(import.meta.url)) {
  const report = await runCockpitServerAudit();
  console.log(`LOGOS-OS-CORE v${LOGOS_VERSION} RETRACTION & ED25519 DOSSIER COCKPIT AUDIT PASSED:`, report);
}
