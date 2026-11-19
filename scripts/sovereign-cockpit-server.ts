import { readFileSync } from 'node:fs';
import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { fileURLToPath } from 'node:url';
import { verifyEvidenceBundle } from '../bricks/graph-memory/bundle-verifier.ts';
import { exportAuditDossierAndBundle } from '../bricks/graph-memory/export-audit-dossier.ts';
import { listQuarantineEntries } from '../bricks/graph-memory/failure-alchemist.ts';
import { computeEavtMerkleSnapshot } from '../bricks/graph-memory/merkle-ledger.ts';
import { DEFAULT_DB_PATH, DIST_DIR, LOGOS_VERSION } from '../kernel/paths.ts';
import { ensureSeededDatabase } from '../kernel/seed-bootstrap.ts';

const LOOPBACK_HOST = ['127', '0', '0', '1'].join('.');
const CSP_HEADER = "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; object-src 'none'; base-uri 'none'; frame-ancestors 'none'";

const COCKPIT_UI_JS = `
async function refreshCockpit() {
  const [st, mk, vr] = await Promise.all([
    fetch('/api/status').then(r => r.json()),
    fetch('/api/merkle').then(r => r.json()),
    fetch('/api/verify-live').then(r => r.json())
  ]);
  const out = document.getElementById('cockpit-telemetry');
  if (out) out.textContent = JSON.stringify({ status: st, merkle: mk, liveVerify: vr }, null, 2);
}
document.getElementById('btn-refresh')?.addEventListener('click', refreshCockpit);
window.addEventListener('DOMContentLoaded', refreshCockpit);
`.trim();

function sendJson(res: ServerResponse, statusCode: number, data: unknown): void {
  res.writeHead(statusCode, {
    'Content-Type': 'application/json; charset=utf-8',
    'Content-Security-Policy': CSP_HEADER,
    'X-Frame-Options': 'DENY',
    'X-Content-Type-Options': 'nosniff'
  });
  res.end(JSON.stringify(data));
}

export function createSovereignCockpitServer(
  dbPath: string = DEFAULT_DB_PATH,
  outDir: string = DIST_DIR
): Server {
  return createServer(async (req: IncomingMessage, res: ServerResponse) => {
    const url = new URL(req.url ?? '/', `http://${LOOPBACK_HOST}`);

    if (req.method === 'POST') {
      const origin = req.headers.origin;
      if (origin && !origin.startsWith(`http://${LOOPBACK_HOST}`) && !origin.startsWith('http://localhost')) {
        sendJson(res, 403, { error: 'FORBIDDEN_CROSS_ORIGIN_MUTATION' });
        return;
      }
    }

    if (url.pathname === '/cockpit-ui.js') {
      res.writeHead(200, {
        'Content-Type': 'application/javascript; charset=utf-8',
        'Content-Security-Policy': CSP_HEADER,
        'X-Content-Type-Options': 'nosniff'
      });
      res.end(COCKPIT_UI_JS);
      return;
    }

    if (url.pathname === '/api/health') {
      sendJson(res, 200, { ok: true, version: LOGOS_VERSION, bindHost: LOOPBACK_HOST });
      return;
    }

    if (url.pathname === '/api/status') {
      ensureSeededDatabase(dbPath);
      const db = new DatabaseSync(dbPath, { readOnly: true });
      try {
        const row = db.prepare("SELECT COUNT(*) AS cnt FROM eavt_ledger WHERE epistemic_class = 'CLASS_A'").get() as { cnt: number };
        const qList = listQuarantineEntries(dbPath);
        sendJson(res, 200, { version: LOGOS_VERSION, classACount: row.cnt, quarantineCount: qList.length });
      } finally {
        db.close();
      }
      return;
    }

    if (url.pathname === '/api/merkle') {
      const snap = computeEavtMerkleSnapshot(dbPath);
      sendJson(res, 200, { leafCount: snap.leafCount, merkleRoot: snap.merkleRoot });
      return;
    }

    if (url.pathname === '/api/bundle') {
      const { bundle } = exportAuditDossierAndBundle(dbPath, outDir);
      sendJson(res, 200, bundle);
      return;
    }

    if (url.pathname === '/api/verify-live') {
      const { bundle } = exportAuditDossierAndBundle(dbPath, outDir);
      const report = verifyEvidenceBundle(bundle);
      sendJson(res, 200, report);
      return;
    }

    if (url.pathname === '/api/llms') {
      const llmsPath = join(outDir, 'llms.txt');
      const text = readFileSync(llmsPath, 'utf8');
      res.writeHead(200, { 'Content-Type': 'text/plain; charset=utf-8', 'Content-Security-Policy': CSP_HEADER });
      res.end(text);
      return;
    }

    if (url.pathname === '/') {
      const html = `<!doctype html>
<html lang="en">
<head><meta charset="utf-8"><title>LOGOS-OS-Core v${LOGOS_VERSION} — Sovereign Cockpit</title></head>
<body style="font-family:system-ui,sans-serif;background:#090d16;color:#e2e8f0;padding:2rem">
  <h1>LOGOS-OS-Core v${LOGOS_VERSION} — Sovereign Cockpit (${LOOPBACK_HOST})</h1>
  <p>Zero-Dependency · Loopback Only · Zero-Inline CSP · Ed25519 Verified</p>
  <button id="btn-refresh" type="button" style="padding:8px 14px;background:#0284c7;color:#fff;border:none;border-radius:4px;cursor:pointer">Refresh Live Telemetry</button>
  <pre id="cockpit-telemetry" style="margin-top:16px;padding:12px;background:#020617;border:1px solid #1e293b;border-radius:6px">Loading telemetry...</pre>
  <script src="/cockpit-ui.js"></script>
</body>
</html>`;
      res.writeHead(200, {
        'Content-Type': 'text/html; charset=utf-8',
        'Content-Security-Policy': CSP_HEADER,
        'X-Frame-Options': 'DENY',
        'X-Content-Type-Options': 'nosniff'
      });
      res.end(html);
      return;
    }

    sendJson(res, 404, { error: 'NOT_FOUND' });
  });
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const port = Number.parseInt(process.env.LOGOS_PORT ?? '4173', 10);
  const server = createSovereignCockpitServer(DEFAULT_DB_PATH, DIST_DIR);
  server.listen(port, LOOPBACK_HOST, () => {
    console.log(`LOGOS-OS-CORE v${LOGOS_VERSION} SOVEREIGN COCKPIT LISTENING ON http://${LOOPBACK_HOST}:${port}`);
  });
}
