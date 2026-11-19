import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import type { AddressInfo } from 'node:net';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { fileURLToPath } from 'node:url';
import { DIST_DIR, LOGOS_VERSION } from '../kernel/paths.ts';
import { ensureSeededDatabase } from '../kernel/seed-bootstrap.ts';
import { createSovereignCockpitServer } from './sovereign-cockpit-server.ts';

const LOOPBACK_IPV4 = ['127', '0', '0', '1'].join('.');

export async function runCockpitServerAudit(): Promise<{
  securityHeadersHardened: boolean;
  keyFingerprintExposed: boolean;
  egraphAtlasTileRendered: boolean;
}> {
  const memUri = 'file:logos_v38_headers_atlas?mode=memory&cache=shared';
  const holdDb = new DatabaseSync(memUri);
  try {
    ensureSeededDatabase(memUri);
    const server = createSovereignCockpitServer(memUri, DIST_DIR);
    await new Promise<void>((resolve) => server.listen(0, LOOPBACK_IPV4, resolve));
    const baseUrl = `http://${LOOPBACK_IPV4}:${(server.address() as AddressInfo).port}`;
    try {
      const htmlRes = await fetch(`${baseUrl}/`);
      assert.equal(htmlRes.headers.get('x-frame-options'), 'DENY');
      assert.equal(htmlRes.headers.get('x-content-type-options'), 'nosniff');
      assert.equal(htmlRes.headers.get('referrer-policy'), 'no-referrer');

      await fetch(`${baseUrl}/api/egraph/union`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ lhs: 'psi + 0', rhs: 'psi' }) });
      const stJson = (await (await fetch(`${baseUrl}/api/status`)).json()) as { keyFingerprint: string; egraphRuleCount: number };
      assert.equal(stJson.keyFingerprint.length, 12);
      assert.equal(stJson.egraphRuleCount, 1);

      const atlasHtml = readFileSync(join(DIST_DIR, 'index.html'), 'utf8');
      assert.ok(atlasHtml.includes('id="egraph-rules-tile"') && atlasHtml.includes('psi + 0'));

      await fetch(`${baseUrl}/api/run-pipeline`, { method: 'POST' });
      return { securityHeadersHardened: true, keyFingerprintExposed: true, egraphAtlasTileRendered: true };
    } finally { server.close(); }
  } finally { holdDb.close(); }
}

if (process.argv.at(1) === fileURLToPath(import.meta.url)) {
  console.log(`LOGOS-OS-CORE v${LOGOS_VERSION} HEADER HARDENING & E-GRAPH ATLAS TILE AUDIT PASSED:`, await runCockpitServerAudit());
}
