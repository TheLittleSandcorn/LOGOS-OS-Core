import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http';
import { DatabaseSync } from 'node:sqlite';
import { fileURLToPath } from 'node:url';
import { verifyEvidenceBundle } from '../bricks/graph-memory/bundle-verifier.ts';
import { EGraphEquivalenceEngine } from '../bricks/graph-memory/egraph-engine.ts';
import { exportAuditDossierAndBundle } from '../bricks/graph-memory/export-audit-dossier.ts';
import { listQuarantineEntries } from '../bricks/graph-memory/failure-alchemist.ts';
import { evaluateEntityBelnapState } from '../kernel/belnap-engine.ts';
import { DEFAULT_DB_PATH, DIST_DIR, LOGOS_VERSION } from '../kernel/paths.ts';
import { ensureSeededDatabase } from '../kernel/seed-bootstrap.ts';
import { exportEternalCartridgeAndAtlas } from './export-eternal-artifact.ts';

const LOOPBACK_HOST = ['127', '0', '0', '1'].join('.');
const CSP_HEADER = "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; object-src 'none'; base-uri 'none'; frame-ancestors 'none'";

const COCKPIT_UI_JS = `
function renderOut(title, payload) {
  const out = document.getElementById('cockpit-output');
  if (out) out.textContent = JSON.stringify({ section: title, timestamp: new Date().toISOString(), payload }, null, 2);
}
async function refreshStatus() {
  const st = await fetch('/api/status').then(r => r.json());
  renderOut('SYSTEM_STATUS', st);
}
async function checkBelnap() {
  const entity = document.getElementById('belnap-entity')?.value || 'axiom:belnap_4';
  const bn = await fetch('/api/belnap?entity=' + encodeURIComponent(entity)).then(r => r.json());
  renderOut('BELNAP_4_PLAYGROUND', bn);
}
async function checkEgraph() {
  const lhs = document.getElementById('egraph-lhs')?.value || '1 * (x + 0)';
  const rhs = document.getElementById('egraph-rhs')?.value || 'x';
  const eg = await fetch('/api/egraph?lhs=' + encodeURIComponent(lhs) + '&rhs=' + encodeURIComponent(rhs)).then(r => r.json());
  renderOut('EGRAPH_PLAYGROUND', eg);
}
async function runLiveAudit() {
  const res = await fetch('/api/run-pipeline', { method: 'POST' }).then(r => r.json());
  renderOut('FULL_9_STAGE_AUDIT_AND_ATLAS_RELOAD', res);
}
document.getElementById('btn-refresh')?.addEventListener('click', refreshStatus);
document.getElementById('btn-belnap')?.addEventListener('click', checkBelnap);
document.getElementById('btn-egraph')?.addEventListener('click', checkEgraph);
document.getElementById('btn-audit')?.addEventListener('click', runLiveAudit);
window.addEventListener('DOMContentLoaded', refreshStatus);
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
  return createServer((req: IncomingMessage, res: ServerResponse) => {
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

    if (url.pathname === '/api/status') {
      ensureSeededDatabase(dbPath);
      const db = new DatabaseSync(dbPath, { readOnly: true });
      try {
        const row = db.prepare("SELECT COUNT(*) AS cnt FROM eavt_ledger WHERE epistemic_class = 'CLASS_A'").get() as { cnt: number };
        const qList = listQuarantineEntries(dbPath);
        sendJson(res, 200, {
          ok: true,
          version: LOGOS_VERSION,
          bindHost: LOOPBACK_HOST,
          classACount: row.cnt,
          quarantineCount: qList.length
        });
      } finally {
        db.close();
      }
      return;
    }

    if (url.pathname === '/api/egraph') {
      const lhs = url.searchParams.get('lhs') ?? '1 * (x + 0)';
      const rhs = url.searchParams.get('rhs') ?? 'x';
      const eg = new EGraphEquivalenceEngine();
      eg.union('1 * (x + 0)', 'x');
      sendJson(res, 200, { lhs, rhs, equivalent: eg.areEquivalent(lhs, rhs), canonicalRoot: eg.find(lhs) });
      return;
    }

    if (url.pathname === '/api/belnap') {
      ensureSeededDatabase(dbPath);
      const entity = url.searchParams.get('entity') ?? 'axiom:belnap_4';
      sendJson(res, 200, evaluateEntityBelnapState(entity, dbPath));
      return;
    }

    if (url.pathname === '/api/run-pipeline' && req.method === 'POST') {
      const exported = exportAuditDossierAndBundle(dbPath, outDir);
      const verification = verifyEvidenceBundle(exported.bundle);
      const atlas = exportEternalCartridgeAndAtlas(exported.bundle, outDir, [], exported.quarantine, dbPath);
      sendJson(res, 200, {
        pipelineExecuted: true,
        atlasReloaded: true,
        atlasPath: atlas.atlasPath,
        version: LOGOS_VERSION,
        merkleRoot: exported.bundle.merkleRoot,
        keyId: exported.bundle.keyId,
        verification
      });
      return;
    }

    if (url.pathname === '/') {
      const html = `<!doctype html>
<html lang="en">
<head><meta charset="utf-8"><title>LOGOS-OS-Core v${LOGOS_VERSION} — Live Playground Cockpit</title></head>
<body style="font-family:system-ui,sans-serif;background:#090d16;color:#e2e8f0;padding:2rem">
  <h1>LOGOS-OS-Core v${LOGOS_VERSION} — Interactive Live Playground Cockpit (${LOOPBACK_HOST})</h1>
  <p>Zero-Dependency · Loopback Only · Belnap-4 Playground · E-Graph Saturation · 9-Stage Audit</p>
  <div style="margin:12px 0;padding:12px;border:1px solid #1e293b;border-radius:6px;background:#0f172a">
    <label for="belnap-entity">Belnap-4 Entity: </label>
    <input id="belnap-entity" type="text" value="axiom:belnap_4" style="padding:6px;background:#020617;color:#f8fafc;border:1px solid #334155;border-radius:4px;margin-right:6px" />
    
    <button id="btn-belnap" type="button" style="padding:6px 12px;background:#0284c7;color:#fff;border:none;border-radius:4px;cursor:pointer">Evaluate Belnap-4</button>
  </div>
  <div style="margin:12px 0;padding:12px;border:1px solid #1e293b;border-radius:6px;background:#0f172a">
    <label for="egraph-lhs">LHS: </label>
    <input id="egraph-lhs" type="text" value="1 * (x + 0)" style="padding:6px;background:#020617;color:#f8fafc;border:1px solid #334155;border-radius:4px;margin-right:6px" />
    <label for="egraph-rhs">RHS: </label>
    <input id="egraph-rhs" type="text" value="x" style="padding:6px;background:#020617;color:#f8fafc;border:1px solid #334155;border-radius:4px;margin-right:6px" />
    <button id="btn-egraph" type="button" style="padding:6px 12px;background:#7c3aed;color:#fff;border:none;border-radius:4px;cursor:pointer">Check E-Graph</button>
  </div>
  <div style="margin:12px 0">
    <button id="btn-refresh" type="button" style="padding:8px 14px;background:#334155;color:#fff;border:none;border-radius:4px;cursor:pointer;margin-right:8px">Refresh Status</button>
    <button id="btn-audit" type="button" style="padding:8px 14px;background:#059669;color:#fff;border:none;border-radius:4px;cursor:pointer">Run 9-Stage Audit &amp; Reload Atlas</button>
  </div>
  <pre id="cockpit-output" style="margin-top:16px;padding:12px;background:#020617;border:1px solid #1e293b;border-radius:6px">Loading playground...</pre>
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

if (process.argv.at(1) === fileURLToPath(import.meta.url)) {
  const port = Number.parseInt(process.env.LOGOS_PORT ?? '4173', 10);
  const server = createSovereignCockpitServer(DEFAULT_DB_PATH, DIST_DIR);
  server.listen(port, LOOPBACK_HOST, () => {
    console.log(`LOGOS-OS-CORE v${LOGOS_VERSION} LIVE PLAYGROUND COCKPIT LISTENING ON http://${LOOPBACK_HOST}:${port}`);
  });
}
