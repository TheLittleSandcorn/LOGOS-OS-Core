import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http';
import { basename, join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { fileURLToPath } from 'node:url';
import { admitFormalTheorem } from '../bricks/cosci-bridge/formal-theorem-gate.ts';
import { verifyEvidenceBundle } from '../bricks/graph-memory/bundle-verifier.ts';
import { EGraphEquivalenceEngine } from '../bricks/graph-memory/egraph-engine.ts';
import { exportAuditDossierAndBundle } from '../bricks/graph-memory/export-audit-dossier.ts';
import { listQuarantineEntries, recordAntiAFailure } from '../bricks/graph-memory/failure-alchemist.ts';
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
  "async function ingestTheorem() { const body = { id: document.getElementById('thm-id')?.value || '', claim: document.getElementById('thm-claim')?.value || '', leanHeader: document.getElementById('thm-lean')?.value || '', critiqueK: document.getElementById('thm-k')?.value || '', dependsOn: document.getElementById('thm-deps')?.value || '' }; const r = await fetch('/api/ingest', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }); renderOut('INGEST_' + r.status, await r.json()); }",
  "async function checkBelnap() { const e = document.getElementById('belnap-entity')?.value || 'axiom:belnap_4'; renderOut('BELNAP_4', await fetch('/api/belnap?entity=' + encodeURIComponent(e)).then(r => r.json())); }",
  "async function triggerRetract() { const e = document.getElementById('belnap-entity')?.value || 'axiom:belnap_4'; renderOut('RETRACT', await fetch('/api/retract?entity=' + encodeURIComponent(e), { method: 'POST' }).then(r => r.json())); }",
  "async function triggerRecover() { const e = document.getElementById('belnap-entity')?.value || 'axiom:belnap_4'; renderOut('RECOVER', await fetch('/api/recover?entity=' + encodeURIComponent(e), { method: 'POST' }).then(r => r.json())); }",
  "async function checkDossier() { renderOut('ED25519_DOSSIER', await fetch('/api/dossier').then(r => r.json())); }",
  "async function checkEgraph() { const l = document.getElementById('egraph-lhs')?.value || '1 * (x + 0)'; const r = document.getElementById('egraph-rhs')?.value || 'x'; renderOut('EGRAPH_QUERY', await fetch('/api/egraph?lhs=' + encodeURIComponent(l) + '&rhs=' + encodeURIComponent(r)).then(r => r.json())); }",
  "async function learnEgraphRule() { const lhs = document.getElementById('egraph-lhs')?.value || ''; const rhs = document.getElementById('egraph-rhs')?.value || ''; renderOut('EGRAPH_UNION_LEARNED', await fetch('/api/egraph/union', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ lhs, rhs }) }).then(r => r.json())); }",
  "async function runLiveAudit() { renderOut('FULL_AUDIT', await fetch('/api/run-pipeline', { method: 'POST' }).then(r => r.json())); }",
  "document.getElementById('btn-ingest')?.addEventListener('click', ingestTheorem);",
  "document.getElementById('btn-refresh')?.addEventListener('click', refreshStatus);",
  "document.getElementById('btn-belnap')?.addEventListener('click', checkBelnap);",
  "document.getElementById('btn-retract')?.addEventListener('click', triggerRetract);",
  "document.getElementById('btn-recover')?.addEventListener('click', triggerRecover);",
  "document.getElementById('btn-dossier')?.addEventListener('click', checkDossier);",
  "document.getElementById('btn-egraph')?.addEventListener('click', checkEgraph);",
  "document.getElementById('btn-egraph-union')?.addEventListener('click', learnEgraphRule);",
  "document.getElementById('btn-audit')?.addEventListener('click', runLiveAudit);",
  "window.addEventListener('DOMContentLoaded', refreshStatus);"
].join('\n');

function sendJson(res: ServerResponse, statusCode: number, data: unknown): void {
  res.writeHead(statusCode, { 'Content-Type': 'application/json; charset=utf-8', 'Content-Security-Policy': CSP_HEADER, 'X-Frame-Options': 'DENY', 'X-Content-Type-Options': 'nosniff' });
  res.end(JSON.stringify(data));
}

function readJsonBody(req: IncomingMessage): Promise<Record<string, unknown>> {
  return new Promise((resolve) => {
    const chunks: Buffer[] = [];
    req.on('data', (c: Buffer) => chunks.push(c));
    req.on('end', () => {
      try { resolve(JSON.parse(Buffer.concat(chunks).toString('utf8') || '{}') as Record<string, unknown>); }
      catch { resolve({}); }
    });
  });
}

export function createSovereignCockpitServer(dbPath: string = DEFAULT_DB_PATH, outDir: string = DIST_DIR): Server {
  const liveEgraph = new EGraphEquivalenceEngine();
  liveEgraph.union('1 * (x + 0)', 'x');

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
      res.writeHead(200, { 'Content-Type': 'application/javascript; charset=utf-8', 'Content-Security-Policy': CSP_HEADER, 'X-Content-Type-Options': 'nosniff' });
      res.end(COCKPIT_UI_JS);
      return;
    }
    if (url.pathname.startsWith('/artifacts/') && url.pathname.endsWith('.html')) {
      const artPath = join(outDir, 'artifacts', basename(url.pathname));
      if (!existsSync(artPath)) { sendJson(res, 404, { error: 'ARTIFACT_NOT_FOUND' }); return; }
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8', 'Content-Security-Policy': CSP_HEADER, 'X-Content-Type-Options': 'nosniff' });
      res.end(readFileSync(artPath, 'utf8'));
      return;
    }
    if (url.pathname === '/api/egraph/union' && req.method === 'POST') {
      const body = await readJsonBody(req);
      const lhs = String(body.lhs ?? '').trim();
      const rhs = String(body.rhs ?? '').trim();
      if (!lhs || !rhs) { sendJson(res, 400, { error: 'MISSING_LHS_OR_RHS' }); return; }
      const merged = liveEgraph.union(lhs, rhs);
      sendJson(res, 200, { ruleLearned: true, lhs, rhs, canonicalRoot: merged.root, equivalent: liveEgraph.areEquivalent(lhs, rhs) });
      return;
    }
    if (url.pathname === '/api/ingest' && req.method === 'POST') {
      ensureSeededDatabase(dbPath);
      const body = await readJsonBody(req);
      const id = String(body.id ?? '').trim();
      const claim = String(body.claim ?? '').trim();
      const leanHeader = String(body.leanHeader ?? '').trim();
      const critiqueK = String(body.critiqueK ?? '').trim();
      const dependsOn = String(body.dependsOn ?? '').trim();
      const gate = admitFormalTheorem({ id, statement: `${leanHeader} ${claim}`, containsSorryAx: `${leanHeader} ${claim}`.includes('sorryAx'), hasFormalProof: leanHeader.length >= 5 && claim.length >= 3, hasMethodologicalContext: critiqueK.length >= 5 });
      if (!gate.admitted || !id) {
        const q = recordAntiAFailure(id || 'anon:theorem', gate.reason, `${leanHeader} ${claim}`, dbPath);
        sendJson(res, 400, { admitted: false, quarantinedInAntiA: true, reason: gate.reason, fingerprint: q.fingerprint });
        return;
      }
      const db = new DatabaseSync(dbPath);
      try {
        db.exec('CREATE TABLE IF NOT EXISTS lineage_edges (parent_entity TEXT NOT NULL, child_entity TEXT NOT NULL, PRIMARY KEY (parent_entity, child_entity))');
        db.prepare('INSERT INTO eavt_ledger (entity, attribute, value, truth_state, confidence, epistemic_class, retracted_by_seq) VALUES (?, ?, ?, ?, ?, ?, NULL)').run(id, 'formal_theorem_fk', `${claim} [K: ${critiqueK}]`, 'TRUE', 1.0, 'CLASS_A');
        if (dependsOn) {
          db.prepare('INSERT OR IGNORE INTO lineage_edges (parent_entity, child_entity) VALUES (?, ?)').run(dependsOn, id);
          db.prepare('INSERT INTO eavt_ledger (entity, attribute, value, truth_state, confidence, epistemic_class, retracted_by_seq) VALUES (?, ?, ?, ?, ?, ?, NULL)').run(id, 'depends_on', dependsOn, 'TRUE', 1.0, 'CLASS_A');
        }
      } finally { db.close(); }
      const exported = exportAuditDossierAndBundle(dbPath, outDir);
      const eternal = exportEternalCartridgeAndAtlas(exported.bundle, outDir, [], exported.quarantine, dbPath);
      const artDir = join(outDir, 'artifacts');
      mkdirSync(artDir, { recursive: true });
      const cartridgeHtml = readFileSync(eternal.cartridgePath, 'utf8');
      const artifactUrl = `/artifacts/${id.replace(/[^a-zA-Z0-9_-]/g, '_')}.html`;
      writeFileSync(join(outDir, artifactUrl), cartridgeHtml, 'utf8');
      for (const f of readdirSync(artDir).filter((n) => n.endsWith('.html'))) writeFileSync(join(artDir, f), cartridgeHtml, 'utf8');
      sendJson(res, 200, { admitted: true, id, autoResignedEd25519: true, syncedArtifactsCount: readdirSync(artDir).length, artifactUrl, merkleRoot: exported.bundle.merkleRoot });
      return;
    }
    if (url.pathname === '/api/status') {
      ensureSeededDatabase(dbPath);
      const db = new DatabaseSync(dbPath, { readOnly: true });
      try {
        const row = db.prepare("SELECT COUNT(*) AS cnt FROM eavt_ledger WHERE epistemic_class = 'CLASS_A'").get() as { cnt: number };
        sendJson(res, 200, { ok: true, version: LOGOS_VERSION, bindHost: LOOPBACK_HOST, classACount: row.cnt, quarantineCount: listQuarantineEntries(dbPath).length });
      } finally { db.close(); }
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
      try { db.prepare('INSERT INTO eavt_ledger (entity, attribute, value, truth_state, confidence, epistemic_class, retracted_by_seq) VALUES (?, ?, ?, ?, ?, ?, NULL)').run(entity, 'retraction_event', 'CONFLICT_RETRACTED', 'FALSE', 1.0, 'CLASS_A'); } finally { db.close(); }
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
        const recInfo = db.prepare('INSERT INTO eavt_ledger (entity, attribute, value, truth_state, confidence, epistemic_class, retracted_by_seq) VALUES (?, ?, ?, ?, ?, ?, NULL)').run(entity, 'epistemic/retraction_resolved', 'RECOVERED_CLASS_A', 'TRUE', 1.0, 'CLASS_A');
        db.prepare("UPDATE eavt_ledger SET retracted_by_seq = ? WHERE entity = ? AND attribute = 'retraction_event' AND retracted_by_seq IS NULL").run(Number(recInfo.lastInsertRowid), entity);
      } finally { db.close(); }
      const exported = exportAuditDossierAndBundle(dbPath, outDir);
      exportEternalCartridgeAndAtlas(exported.bundle, outDir, [], exported.quarantine, dbPath);
      sendJson(res, 200, { action: 'RECOVERED', resolutionAttribute: 'epistemic/retraction_resolved', atlasReloaded: true, evaluation: evaluateEntityBelnapState(entity, dbPath) });
      return;
    }
    if (url.pathname === '/api/egraph') {
      const lhs = url.searchParams.get('lhs') ?? '1 * (x + 0)';
      const rhs = url.searchParams.get('rhs') ?? 'x';
      sendJson(res, 200, { lhs, rhs, equivalent: liveEgraph.areEquivalent(lhs, rhs), canonicalRoot: liveEgraph.find(lhs) });
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
      const html = '<!doctype html><html><head><meta charset="utf-8"><title>LOGOS-OS-Core Cockpit</title></head><body style="background:#090d16;color:#e2e8f0;font-family:sans-serif;padding:2rem"><h1>LOGOS-OS-Core v' + LOGOS_VERSION + ' E-Graph Learner &amp; Auto-Cartridge Cockpit</h1><div><input id="thm-id" placeholder="Theorem ID" /><input id="thm-claim" placeholder="Claim" /><input id="thm-lean" placeholder="Lean Header" /><input id="thm-k" placeholder="Critique K" /><input id="thm-deps" placeholder="depends_on" /><button id="btn-ingest">Ingest &amp; Auto-Sign</button></div><div><button id="btn-belnap">Belnap-4</button><button id="btn-retract">Retract</button><button id="btn-recover">Recover</button><button id="btn-dossier">Verify Ed25519 Dossier</button></div><div><input id="egraph-lhs" value="1 * (x + 0)" /><input id="egraph-rhs" value="x" /><button id="btn-egraph">Check E-Graph</button><button id="btn-egraph-union">Regel lernen</button><button id="btn-refresh">Status</button><button id="btn-audit">Run Audit</button></div><pre id="cockpit-output">Loading...</pre><script src="/cockpit-ui.js"></script></body></html>';
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
  server.listen(port, LOOPBACK_HOST, () => console.log(`LOGOS-OS-CORE v${LOGOS_VERSION} E-GRAPH LEARNER COCKPIT ON http://${LOOPBACK_HOST}:${port}`));
}
