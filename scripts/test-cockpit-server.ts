import assert from 'node:assert/strict';
import type { AddressInfo } from 'node:net';
import { DatabaseSync } from 'node:sqlite';
import { fileURLToPath } from 'node:url';
import { DIST_DIR, LOGOS_VERSION } from '../kernel/paths.ts';
import { ensureSeededDatabase } from '../kernel/seed-bootstrap.ts';
import { createSovereignCockpitServer } from './sovereign-cockpit-server.ts';
import { runFullIntegrityAudit } from './verify-ledger-integrity.ts';

const LOOPBACK_IPV4 = ['127', '0', '0', '1'].join('.');

export async function runCockpitServerAudit(): Promise<{
  lineageIngestAndAutoResignVerified: boolean;
  artifactRouteServed: boolean;
  monotonicNonDestructiveRecoveryVerified: boolean;
}> {
  const memUri = 'file:logos_v34_lineage?mode=memory&cache=shared';
  const holdDb = new DatabaseSync(memUri);
  try {
    ensureSeededDatabase(memUri);
    const server = createSovereignCockpitServer(memUri, DIST_DIR);
    await new Promise<void>((resolve) => server.listen(0, LOOPBACK_IPV4, resolve));
    const baseUrl = `http://${LOOPBACK_IPV4}:${(server.address() as AddressInfo).port}`;
    try {
      const okRes = await fetch(`${baseUrl}/api/ingest`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id: 'thm:lineage_child', claim: 'x + 0 = x', leanHeader: 'theorem add_zero (x : Nat) : x + 0 = x', critiqueK: 'Inductive base invariant verified', dependsOn: 'axiom:belnap_4' }) });
      assert.equal(okRes.status, 200);
      const okJson = (await okRes.json()) as { admitted: boolean; autoResignedEd25519: boolean; artifactUrl: string };
      assert.equal(okJson.admitted, true);
      assert.equal(okJson.autoResignedEd25519, true);

      const dossierJson = (await (await fetch(`${baseUrl}/api/dossier`)).json()) as { authentic: boolean };
      assert.equal(dossierJson.authentic, true);

      const artRes = await fetch(`${baseUrl}${okJson.artifactUrl}`);
      assert.equal(artRes.status, 200);

      await fetch(`${baseUrl}/api/retract?entity=axiom:belnap_4`, { method: 'POST' });
      const recJson = (await (await fetch(`${baseUrl}/api/recover?entity=axiom:belnap_4`, { method: 'POST' })).json()) as { resolutionAttribute: string; evaluation: { state: string } };
      assert.equal(recJson.resolutionAttribute, 'epistemic/retraction_resolved');
      assert.equal(recJson.evaluation.state, 'TRUE');
      assert.ok(runFullIntegrityAudit(memUri, DIST_DIR).strictlyMonotonicSeqCount >= 7);

      await fetch(`${baseUrl}/api/run-pipeline`, { method: 'POST' });
      return { lineageIngestAndAutoResignVerified: true, artifactRouteServed: true, monotonicNonDestructiveRecoveryVerified: true };
    } finally { server.close(); }
  } finally { holdDb.close(); }
}

if (process.argv.at(1) === fileURLToPath(import.meta.url)) {
  console.log(`LOGOS-OS-CORE v${LOGOS_VERSION} LINEAGE & AUTO-SIGNED COCKPIT AUDIT PASSED:`, await runCockpitServerAudit());
}
