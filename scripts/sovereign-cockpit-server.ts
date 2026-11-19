import { existsSync, readFileSync } from 'node:fs';
import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { fileURLToPath } from 'node:url';
import { verifyEvidenceBundle } from '../bricks/graph-memory/bundle-verifier.ts';
import { EGraphEquivalenceEngine } from '../bricks/graph-memory/egraph-engine.ts';
import { exportAuditDossierAndBundle } from '../bricks/graph-memory/export-audit-dossier.ts';
import { listQuarantineEntries } from '../bricks/graph-memory/failure-alchemist.ts';
import { verifyPayloadEd25519 } from '../bricks/graph-memory/trust-anchor.ts';
import { evaluateEntityBelnapState } from '../kernel/belnap-engine.ts';
import { DEFAULT_DB_PATH, DIST_DIR, LOGOS_VERSION } from '../kernel/paths.ts';
import { ensureSeededDatabase } from '../kernel/seed-bootstrap.ts';
import { exportEternalCartridgeAndAtlas } from './export-eternal-artifact.ts';

const LOOPBACK_HOST = ['127', '0', '0', '1'].join('.');
const CSP_HEADER = "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; object-src 'none'; base-uri 'none'; frame-ancestors 'none'";

const COCKPIT_UI_JS = [
  "function renderOut(t, p) { const o = document.getElementById('cockpit-output'); if (o) o.textContent = JSON.stringify({ section: t, payload: p }, null, 2); }",
  "async function refreshStatus() { renderOut('SYSTEM_STATUS', await fetch('/api/status').then(r => r.json())); }",
  "async function checkBelnap() { const e = document.getElementById('belnap-entity')?.value || 'axiom:belnap_4'; renderOut('BELNAP_4', await fetch('/api/belnap?entity=' + encodeURIComponent(e)).then(r => r.json())); }",
  "async function triggerRetract() { const e = document.getElementById('belnap-entity')?.value || 'axiom:belnap_4'; renderOut('RETRACT', await fetch('/api/retract?entity=' + encodeURIComponent(e), { method: 'POST' }).then(r => r.json())); }",
  "async function triggerRecover() { const e = document.getElementById('belnap-entity')?.value || 'axiom:belnap_4'; renderOut('RECOVER', await fetch('/api/recover?entity=' + encodeURIComponent(e), { method: 'POST' }).then(r => r.json())); }",
  "async function checkDossier() { renderOut('ED25519_DOSSIER', await fetch('/api/dossier').then(r => r.json())); }",
  "async function checkEgraph() { const l = document.getElementById('egraph-lhs')?.value || '1 * (x + 0)'; const r = document.getElementById('egraph-rhs')?.value || 'x'; renderOut('EGRAPH', await fetch('/api/egraph?lhs=' + encodeURIComponent(l) + '&rhs=' + encodeURIComponent(r)).then(r => r.json())); }",
  "async function runLiveAudit() { renderOut('FULL_AUDIT', await fetch('/api/run-pipeline', { method: 'POST' }).then(r => r.json())); }",
  "document.getElementById('btn-refresh')?.addEventListener('click', refreshStatus);",
  "document.getElementById('btn-belnap')?.addEventListener('click', checkBelnap);",
  "document.getElementById('btn-retract')?.addEventListener('click', triggerRetract);",
  "document.getElementById('btn-recover')?.addEventListener('click', triggerRecover);",
  "document.getElementById('btn-dossier')?.addEventListener('click', checkDossier);",
  "document.getElementById('btn-egraph')?.addEventListener('click', checkEgraph);",
  "document.getElementById('btn-audit')?.addEventListener('click', runLiveAudit);",
  "window.addEventListener('DOMContentLoaded', refreshStatus);"
].join('\n');

function sendJson(res: ServerResponse, statusCode: number, data: unknown): void {
  res.writeHead(statusCode, {
    'Content-Type': 'application/json; charset=utf-8',
    'Content-Security-Policy': CSP_HEADER,
    'X-Frame-Options': 'DENY',
    'X-Content-Type-Options': 'nosniff'
  });
  res.end(JSON.stringify(data));
}

export function createSovereignCockpitServer(dbPath: string = DEFAULT_DB_PATH, outDir: string = DIST_DIR): Server {
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
      res.writeHead(200, { 'Content-Type': 'application/javascript; charset=utf-8', 'Content-Security-Policy': CSP_HEADER, 'X-Content-Type-Options': 'nosniff' });
      res.end(COCKPIT_UI_JS);
      return;
    }
    if (url.pathname === '/api/status') {
      ensureSeededDatabase(dbPath);
      const db = new DatabaseSync(dbPath, { readOnly: true });
      try {
        const row = db.prepare("SELECT COUNT(*) AS cnt FROM eavt_ledger WHERE epistemic_class = 'CLASS_A'").get() as { cnt: number };
        sendJson(res, 200, { ok: true, version: LOGOS_VERSION, bindHost: LOOPBACK_HOST, classACount: row.cnt, quarantineCount: listQuarantineEntries(dbPath).length });
      } finally {
        db.close();
      }
      return;
    }
    if (url.pathname === '/api/dossier') {
      const dossierPath = join(outDir, 'AUDIT-DOSSIER.md');
      const sigPath = join(outDir, 'AUDIT-DOSSIER.sig.json');
      if (!existsSync(dossierPath) || !existsSync(sigPath)) exportAuditDossierAndBundle(dbPath, outDir);
      const dossierMarkdown = readFileSync(dossierPath, 'utf8');
      const sigJson = JSON.parse(readFileSync(sigPath, 'utf8')) as { keyId: string; merkleRoot: string; signatureBase64: string };
      sendJson(res, 200, { authentic: verifyPayloadEd25519(dossierMarkdown, sigJson.signatureBase64), keyId: sigJson.keyId, merkleRoot: sigJson.merkleRoot, dossierMarkdown });
      return;
    }
    if (url.pathname === '/api/retract' && req.method === 'POST') {
      ensureSeededDatabase(dbPath);
      const entity = url.searchParams.get('entity') ?? 'axiom:belnap_4';
      const db = new DatabaseSync(dbPath);
      try {
        db.prepare('INSERT INTO eavt_ledger (entity, attribute, value, truth_state, confidence, epistemic_class, retracted_by_seq) VALUES (?, ?, ?, ?, ?, ?, NULL)').run(entity, 'retraction_event', 'CONFLICT_RETRACTED', 'FALSE', 1.0, 'CLASS_A');
      } finally { db.close(); }
      const exported = exportAuditDossierAndBundle(dbPath, outDir);
      exportEternalCartridgeAndAtlas(exported.bundle, outDir, [entity], exported.quarantine, dbPath);
      sendJson(res, 200, { action: 'RETRACTED', atlasReloaded: true, evaluation: evaluateEntityBelnapState(entity, dbPath) });
      return;
    }
    if (url.pathname === '/api/recover' && req.method === 'POST') {
      ensureSeededDatabase(dbPath);
      const entity = url.searchParams.get('entity') ?? 'axiom:belnap_4';
      const db = new DatabaseSync(dbPath);
      try {
        const recInfo = db.prepare('INSERT INTO eavt_ledger (entity, attribute, value, truth_state, confidence, epistemic_class, retracted_by_seq) VALUES (?, ?, ?, ?, ?, ?, NULL)').run(entity, 'recovery_event', 'RECOVERED_CLASS_A', 'TRUE', 1.0, 'CLASS_A');
        db.prepare("UPDATE eavt_ledger SET retracted_by_seq = ? WHERE entity = ? AND attribute = 'retraction_event' AND retracted_by_seq IS NULL").run(Number(recInfo.lastInsertRowid), entity);
      } finally { db.close(); }
      const exported = exportAuditDossierAndBundle(dbPath, outDir);
      exportEternalCartridgeAndAtlas(exported.bundle, outDir, [], exported.quarantine, dbPath);
      sendJson(res, 200, { action: 'RECOVERED', atlasReloaded: true, evaluation: evaluateEntityBelnapState(entity, dbPath) });
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
      sendJson(res, 200, evaluateEntityBelnapState(url.searchParams.get('entity') ?? 'axiom:belnap_4', dbPath));
      return;
    }
    if (url.pathname === '/api/run-pipeline' && req.method === 'POST') {
      const exported = exportAuditDossierAndBundle(dbPath, outDir);
      const atlas = exportEternalCartridgeAndAtlas(exported.bundle, outDir, [], exported.quarantine, dbPath);
      sendJson(res, 200, { pipelineExecuted: true, atlasReloaded: true, atlasPath: atlas.atlasPath, version: LOGOS_VERSION, verification: verifyEvidenceBundle(exported.bundle) });
      return;
    }
    if (url.pathname === '/') {
      const html = '<!doctype html><html><head><meta charset="utf-8"><title>LOGOS-OS-Core Cockpit</title></head><body style="background:#090d16;color:#e2e8f0;font-family:sans-serif;padding:2rem"><h1>LOGOS-OS-Core v' + LOGOS_VERSION + ' Cockpit</h1><button id="btn-belnap">Belnap-4</button><button id="btn-retract">Retract</button><button id="btn-recover">Recover</button><button id="btn-dossier">Verify Ed25519 Dossier</button><input id="egraph-lhs" value="1 * (x + 0)" /><input id="egraph-rhs" value="x" /><button id="btn-egraph">E-Graph</button><button id="btn-refresh">Status</button><button id="btn-audit">Run Audit</button><pre id="cockpit-output">Loading...</pre><script src="/cockpit-ui.js"></script></body></html>';
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8', 'Content-Security-Policy': CSP_HEADER, 'X-Frame-Options': 'DENY', 'X-Content-Type-Options': 'nosniff' });
      res.end(html);
      return;
    }
    sendJson(res, 404, { error: 'NOT_FOUND' });
  });
}

if (process.argv.at(1) === fileURLToPath(import.meta.url)) {
  const port = Number.parseInt(process.env.LOGOS_PORT ?? '4173', 10);
  const server = createSovereignCockpitServer(DEFAULT_DB_PATH, DIST_DIR);
  server.listen(port, LOOPBACK_HOST, () => console.log(`LOGOS-OS-CORE v${LOGOS_VERSION} COCKPIT ON http://${LOOPBACK_HOST}:${port}`));
}
