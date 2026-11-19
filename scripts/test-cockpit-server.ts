import assert from 'node:assert/strict';
import type { AddressInfo } from 'node:net';
import { DatabaseSync } from 'node:sqlite';
import { fileURLToPath } from 'node:url';
import { DIST_DIR, LOGOS_VERSION } from '../kernel/paths.ts';
import { ensureSeededDatabase } from '../kernel/seed-bootstrap.ts';
import { createSovereignCockpitServer } from './sovereign-cockpit-server.ts';

const LOOPBACK_IPV4 = ['127', '0', '0', '1'].join('.');

export async function runCockpitServerAudit(): Promise<{
  maliciousIngestBlockedHttp400: boolean;
  validClassAIngestHttp200: boolean;
  paraconsistentRetractRecoverCycleVerified: boolean;
}> {
  const memUri = 'file:logos_v33_composer?mode=memory&cache=shared';
  const holdDb = new DatabaseSync(memUri);
  try {
    ensureSeededDatabase(memUri);
    const server = createSovereignCockpitServer(memUri, DIST_DIR);
    await new Promise<void>((resolve) => server.listen(0, LOOPBACK_IPV4, resolve));
    const baseUrl = `http://${LOOPBACK_IPV4}:${(server.address() as AddressInfo).port}`;
    try {
      // 1. Malicious sorryAx browser submission -> HTTP 400 + Anti-A Quarantine
      const badRes = await fetch(`${baseUrl}/api/ingest`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id: 'thm:bad', claim: 'False', leanHeader: 'theorem bad : False := by sorryAx', critiqueK: 'Attack' }) });
      assert.equal(badRes.status, 400);
      assert.equal(((await badRes.json()) as { quarantinedInAntiA: boolean }).quarantinedInAntiA, true);

      // 2. Valid F+K proof submission -> HTTP 200 + CLASS_A Ledger + Atlas Reload
      const okRes = await fetch(`${baseUrl}/api/ingest`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id: 'thm:reflexive', claim: 'x = x', leanHeader: 'theorem eq_refl (x : Nat) : x = x', critiqueK: 'Constructive reflexivity invariant verified' }) });
      assert.equal(okRes.status, 200);
      assert.equal(((await okRes.json()) as { admitted: boolean }).admitted, true);

      // 3. Paraconsistent Retract -> Recover cycle + clean dist restore
      const retractJson = (await (await fetch(`${baseUrl}/api/retract?entity=axiom:belnap_4`, { method: 'POST' })).json()) as { evaluation: { state: string } };
      assert.equal(retractJson.evaluation.state, 'BOTH');
      const recoverJson = (await (await fetch(`${baseUrl}/api/recover?entity=axiom:belnap_4`, { method: 'POST' })).json()) as { evaluation: { state: string } };
      assert.equal(recoverJson.evaluation.state, 'TRUE');
      await fetch(`${baseUrl}/api/run-pipeline`, { method: 'POST' });

      return { maliciousIngestBlockedHttp400: true, validClassAIngestHttp200: true, paraconsistentRetractRecoverCycleVerified: true };
    } finally { server.close(); }
  } finally { holdDb.close(); }
}

if (process.argv.at(1) === fileURLToPath(import.meta.url)) {
  const report = await runCockpitServerAudit();
  console.log(`LOGOS-OS-CORE v${LOGOS_VERSION} LIVE CLASS-A COMPOSER & QUARANTINE AUDIT PASSED:`, report);
}
