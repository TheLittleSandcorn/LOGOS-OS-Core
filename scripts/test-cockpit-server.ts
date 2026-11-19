import assert from 'node:assert/strict';
import { request as httpRequest } from 'node:http';
import type { AddressInfo } from 'node:net';
import { DatabaseSync } from 'node:sqlite';
import { fileURLToPath } from 'node:url';
import { DIST_DIR, LOGOS_VERSION } from '../kernel/paths.ts';
import { ensureSeededDatabase } from '../kernel/seed-bootstrap.ts';
import { createSovereignCockpitServer } from './sovereign-cockpit-server.ts';

const LOOPBACK_IPV4 = ['127', '0', '0', '1'].join('.');

function reqLocal(
  port: number,
  path: string,
  opts: { method?: string; headers?: Record<string, string> } = {}
): Promise<{ status: number; headers: Record<string, string | string[] | undefined>; text: string }> {
  return new Promise((resolve, reject) => {
    const req = httpRequest(
      { hostname: LOOPBACK_IPV4, port, path, method: opts.method ?? 'GET', headers: opts.headers },
      (res) => {
        const chunks: Buffer[] = [];
        res.on('data', (c: Buffer) => chunks.push(c));
        res.on('end', () => resolve({ status: res.statusCode ?? 0, headers: res.headers, text: Buffer.concat(chunks).toString('utf8') }));
      }
    );
    req.on('error', reject);
    req.end();
  });
}

export async function runCockpitServerAudit(): Promise<{
  cspZeroInlineVerified: boolean;
  csrfCrossOriginBlocked: boolean;
  liveVerifyEndpointValid: boolean;
}> {
  const memUri = 'file:logos_v30_cockpit?mode=memory&cache=shared';
  const holdDb = new DatabaseSync(memUri);
  try {
    ensureSeededDatabase(memUri);
    const server = createSovereignCockpitServer(memUri, DIST_DIR);
    await new Promise<void>((resolve) => server.listen(0, LOOPBACK_IPV4, resolve));
    const port = (server.address() as AddressInfo).port;
    try {
      const [htmlRes, jsRes, healthRes, statusRes, merkleRes, bundleRes, liveRes, llmsRes, csrfRes] = await Promise.all([
        reqLocal(port, '/'),
        reqLocal(port, '/cockpit-ui.js'),
        reqLocal(port, '/api/health'),
        reqLocal(port, '/api/status'),
        reqLocal(port, '/api/merkle'),
        reqLocal(port, '/api/bundle'),
        reqLocal(port, '/api/verify-live'),
        reqLocal(port, '/api/llms'),
        reqLocal(port, '/api/verify-live', { method: 'POST', headers: { Origin: 'https://evil.example' } })
      ]);

      assert.equal(htmlRes.status, 200);
      assert.ok(htmlRes.text.includes('src="/cockpit-ui.js"'));
      const csp = String(htmlRes.headers['content-security-policy'] ?? '');
      assert.ok(csp.includes("script-src 'self'") && !csp.includes('unsafe-inline'));
      assert.equal(htmlRes.headers['x-frame-options'], 'DENY');

      assert.equal(jsRes.status, 200);
      assert.ok(jsRes.text.includes('refreshCockpit'));
      assert.equal(healthRes.status, 200);
      assert.ok((JSON.parse(statusRes.text) as { classACount: number }).classACount >= 4);
      assert.ok((JSON.parse(merkleRes.text) as { leafCount: number }).leafCount >= 4);
      assert.equal((JSON.parse(bundleRes.text) as { schema: string }).schema, 'LOGOS-OS-CORE.EVIDENCE_BUNDLE.v1');
      assert.equal((JSON.parse(liveRes.text) as { valid: boolean }).valid, true);
      assert.equal(llmsRes.status, 200);
      assert.equal(csrfRes.status, 403);

      return {
        cspZeroInlineVerified: true,
        csrfCrossOriginBlocked: true,
        liveVerifyEndpointValid: true
      };
    } finally {
      server.close();
    }
  } finally {
    holdDb.close();
  }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const report = await runCockpitServerAudit();
  console.log(`LOGOS-OS-CORE v${LOGOS_VERSION} SOVEREIGN COCKPIT & CSP/CSRF AUDIT PASSED:`, report);
}
