import assert from 'node:assert/strict';
import type { AddressInfo } from 'node:net';
import { DatabaseSync } from 'node:sqlite';
import { fileURLToPath } from 'node:url';
import { DIST_DIR, LOGOS_VERSION } from '../kernel/paths.ts';
import { ensureSeededDatabase } from '../kernel/seed-bootstrap.ts';
import { createSovereignCockpitServer } from './sovereign-cockpit-server.ts';

const LOOPBACK_IPV4 = ['127', '0', '0', '1'].join('.');

export async function runCockpitServerAudit(): Promise<{
  playgroundControlsRendered: boolean;
  belnapAndEgraphLiveVerified: boolean;
  oneClickAtlasReloadVerified: boolean;
}> {
  const memUri = 'file:logos_v31_playground?mode=memory&cache=shared';
  const holdDb = new DatabaseSync(memUri);
  try {
    ensureSeededDatabase(memUri);
    const server = createSovereignCockpitServer(memUri, DIST_DIR);
    await new Promise<void>((resolve) => server.listen(0, LOOPBACK_IPV4, resolve));
    const addr = server.address() as AddressInfo;
    assert.equal(addr.address, LOOPBACK_IPV4);
    const baseUrl = `http://${LOOPBACK_IPV4}:${addr.port}`;

    try {
      const [htmlRes, jsRes, belnapValid, belnapUnknown, egraphRes, runRes, csrfRes] = await Promise.all([
        fetch(`${baseUrl}/`),
        fetch(`${baseUrl}/cockpit-ui.js`),
        fetch(`${baseUrl}/api/belnap?entity=${encodeURIComponent('axiom:belnap_4')}`),
        fetch(`${baseUrl}/api/belnap?entity=${encodeURIComponent('ADVERSARY-SORRY-001')}`),
        fetch(`${baseUrl}/api/egraph?lhs=${encodeURIComponent('1 * (x + 0)')}&rhs=x`),
        fetch(`${baseUrl}/api/run-pipeline`, { method: 'POST' }),
        fetch(`${baseUrl}/api/run-pipeline`, { method: 'POST', headers: { Origin: 'https://evil.example' } })
      ]);

      const html = await htmlRes.text();
      assert.equal(htmlRes.status, 200);
      assert.ok(html.includes('id="belnap-entity"') && html.includes('id="egraph-lhs"') && html.includes('id="btn-audit"'));
      const csp = htmlRes.headers.get('content-security-policy') ?? '';
      assert.ok(csp.includes("script-src 'self'") && !csp.includes("script-src 'unsafe-inline'"));
      assert.equal(jsRes.status, 200);

      assert.equal(((await belnapValid.json()) as { state: string }).state, 'TRUE');
      assert.equal(((await belnapUnknown.json()) as { state: string }).state, 'NEITHER');
      assert.equal(((await egraphRes.json()) as { equivalent: boolean }).equivalent, true);

      const runJson = (await runRes.json()) as { pipelineExecuted: boolean; atlasReloaded: boolean; verification: { valid: boolean } };
      assert.equal(runJson.pipelineExecuted, true);
      assert.equal(runJson.atlasReloaded, true);
      assert.equal(runJson.verification.valid, true);
      assert.equal(csrfRes.status, 403);

      return {
        playgroundControlsRendered: true,
        belnapAndEgraphLiveVerified: true,
        oneClickAtlasReloadVerified: true
      };
    } finally {
      server.close();
    }
  } finally {
    holdDb.close();
  }
}

if (process.argv.at(1) === fileURLToPath(import.meta.url)) {
  const report = await runCockpitServerAudit();
  console.log(`LOGOS-OS-CORE v${LOGOS_VERSION} 9-STAGE PLAYGROUND COCKPIT AUDIT PASSED:`, report);
}
