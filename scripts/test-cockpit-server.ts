import assert from 'node:assert/strict';
import type { AddressInfo } from 'node:net';
import { DatabaseSync } from 'node:sqlite';
import { fileURLToPath } from 'node:url';
import { DIST_DIR, LOGOS_VERSION } from '../kernel/paths.ts';
import { ensureSeededDatabase } from '../kernel/seed-bootstrap.ts';
import { createSovereignCockpitServer } from './sovereign-cockpit-server.ts';

const LOOPBACK_IPV4 = ['127', '0', '0', '1'].join('.');

export async function runCockpitServerAudit(): Promise<{
  egraphRuleLearnerTransitiveVerified: boolean;
  autoCartridgeSyncVerified: boolean;
}> {
  const memUri = 'file:logos_v35_egraph_learner?mode=memory&cache=shared';
  const holdDb = new DatabaseSync(memUri);
  try {
    ensureSeededDatabase(memUri);
    const server = createSovereignCockpitServer(memUri, DIST_DIR);
    await new Promise<void>((resolve) => server.listen(0, LOOPBACK_IPV4, resolve));
    const baseUrl = `http://${LOOPBACK_IPV4}:${(server.address() as AddressInfo).port}`;
    try {
      const html = await (await fetch(`${baseUrl}/`)).text();
      assert.ok(html.includes('id="btn-egraph-union"') && html.includes('Regel lernen'));

      // 1. Learn new algebraic rules transitively: a + b = b + a and b + a = c => a + b = c
      const u1 = await fetch(`${baseUrl}/api/egraph/union`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ lhs: 'a + b', rhs: 'b + a' }) });
      const u2 = await fetch(`${baseUrl}/api/egraph/union`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ lhs: 'b + a', rhs: 'c' }) });
      assert.equal(u1.status, 200);
      assert.equal(u2.status, 200);
      const qTransitive = (await (await fetch(`${baseUrl}/api/egraph?lhs=${encodeURIComponent('a + b')}&rhs=c`)).json()) as { equivalent: boolean };
      assert.equal(qTransitive.equivalent, true);

      // 2. Ingest CLASS_A theorem -> automatic cartridge generation + Ed25519 re-sign
      const okRes = await fetch(`${baseUrl}/api/ingest`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id: 'thm:comm_add', claim: 'a + b = b + a', leanHeader: 'theorem add_comm (a b : Nat) : a + b = b + a', critiqueK: 'Commutativity invariant verified', dependsOn: 'axiom:belnap_4' }) });
      const okJson = (await okRes.json()) as { admitted: boolean; autoResignedEd25519: boolean; artifactUrl: string };
      assert.equal(okJson.admitted, true);
      assert.equal(okJson.autoResignedEd25519, true);
      assert.equal((await fetch(`${baseUrl}${okJson.artifactUrl}`)).status, 200);

      await fetch(`${baseUrl}/api/run-pipeline`, { method: 'POST' });
      return { egraphRuleLearnerTransitiveVerified: true, autoCartridgeSyncVerified: true };
    } finally { server.close(); }
  } finally { holdDb.close(); }
}

if (process.argv.at(1) === fileURLToPath(import.meta.url)) {
  console.log(`LOGOS-OS-CORE v${LOGOS_VERSION} E-GRAPH LEARNER & AUTO-CARTRIDGE AUDIT PASSED:`, await runCockpitServerAudit());
}
