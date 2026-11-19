import assert from 'node:assert/strict';
import type { AddressInfo } from 'node:net';
import { DatabaseSync } from 'node:sqlite';
import { fileURLToPath } from 'node:url';
import { DIST_DIR, LOGOS_VERSION } from '../kernel/paths.ts';
import { ensureSeededDatabase } from '../kernel/seed-bootstrap.ts';
import { createSovereignCockpitServer } from './sovereign-cockpit-server.ts';

const LOOPBACK_IPV4 = ['127', '0', '0', '1'].join('.');

export async function runCockpitServerAudit(): Promise<{
  offlineConnectSrcCspVerified: boolean;
  ruleCleanup: number;
  egraphRuleCount: number;
}> {
  const memUri = 'file:logos_v39_rule_lifecycle?mode=memory&cache=shared';
  const holdDb = new DatabaseSync(memUri);
  try {
    ensureSeededDatabase(memUri);
    const server = createSovereignCockpitServer(memUri, DIST_DIR);
    await new Promise<void>((resolve) => server.listen(0, LOOPBACK_IPV4, resolve));
    const baseUrl = `http://${LOOPBACK_IPV4}:${(server.address() as AddressInfo).port}`;
    try {
      const htmlRes = await fetch(`${baseUrl}/`);
      const csp = htmlRes.headers.get('content-security-policy') ?? '';
      assert.ok(csp.includes("connect-src 'self'"));
      const html = await htmlRes.text();
      assert.ok(html.includes('id="telemetry-bar"') && html.includes('id="btn-egraph-del"'));

      await fetch(`${baseUrl}/api/egraph/union`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ lhs: 'omega + 0', rhs: 'omega' }) });
      const delRes = await fetch(`${baseUrl}/api/egraph/rule?lhs=${encodeURIComponent('omega + 0')}`, { method: 'DELETE' });
      assert.equal(delRes.status, 200);

      const stJson = (await (await fetch(`${baseUrl}/api/status`)).json()) as { egraphRuleCount: number };
      assert.equal(stJson.egraphRuleCount, 0);

      await fetch(`${baseUrl}/api/run-pipeline`, { method: 'POST' });
      return { offlineConnectSrcCspVerified: true, ruleCleanup: delRes.status, egraphRuleCount: stJson.egraphRuleCount };
    } finally { server.close(); }
  } finally { holdDb.close(); }
}

if (process.argv.at(1) === fileURLToPath(import.meta.url)) {
  console.log(`LOGOS-OS-CORE v${LOGOS_VERSION} OFFLINE-CSP & E-GRAPH LIFECYCLE AUDIT PASSED:`, await runCockpitServerAudit());
}
