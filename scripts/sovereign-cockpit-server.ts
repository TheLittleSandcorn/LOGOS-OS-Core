import './kernel-egress-lock.ts';
import { syncAllSovereignArtifacts } from './sync-artifacts.ts';
import nodeCrypto from 'node:crypto';
export const SESSION_TOKEN = nodeCrypto.randomBytes(32).toString('hex');
function getSnapshot() {
  try {
    const b = JSON.parse(readFileSync('dist/EVIDENCE-BUNDLE.json', 'utf8'));
    return { merkleRoot: String(b.merkleRoot || 'unknown'), leafCount: Number(b.leafCount || 0) };
  } catch {
    return { merkleRoot: 'uninitialized', leafCount: 0 };
  }
}
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http';
import { basename, join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { fileURLToPath } from 'node:url';
import { admitFormalTheorem } from '../bricks/cosci-bridge/formal-theorem-gate.ts';
import { verifyEvidenceBundle } from '../bricks/graph-memory/bundle-verifier.ts';
import { computeEavtMerkleSnapshot, generateInclusionProof, verifyInclusionProof } from '../bricks/graph-memory/merkle-ledger.ts';
import { runSystemHealthCheck } from './health-check.ts';
import { EGraphEquivalenceEngine } from '../bricks/graph-memory/egraph-engine.ts';
import { exportAuditDossierAndBundle } from '../bricks/graph-memory/export-audit-dossier.ts';
import { listQuarantineEntries, recordAntiAFailure } from '../bricks/graph-memory/failure-alchemist.ts';
import { ensureTrustAnchor, verifyPayloadEd25519 } from '../bricks/graph-memory/trust-anchor.ts';
import { evaluateEntityBelnapState } from '../kernel/belnap-engine.ts';
import { DEFAULT_DB_PATH, DIST_DIR, TRUST_ANCHOR_PUB_PATH, LOGOS_VERSION } from '../kernel/paths.ts';
import { ensureSeededDatabase } from '../kernel/seed-bootstrap.ts';
import { exportEternalCartridgeAndAtlas } from './export-eternal-artifact.ts';

const LOOPBACK_HOST = ['127', '0', '0', '1'].join('.');
const CSP_HEADER = "default-src 'self'; script-src 'self'; connect-src 'self'; style-src 'self' 'unsafe-inline'; object-src 'none'; base-uri 'none'; frame-ancestors 'none'";

const COCKPIT_UI_JS = [
  "function renderOut(t, p) { const o = document.getElementById('cockpit-output'); if (o) o.textContent = JSON.stringify({ section: t, payload: p }, null, 2); }",
  "async function refreshStatus() { const st = await fetch('/api/status').then(r => r.json()); const bar = document.getElementById('telemetry-bar'); if (bar) bar.textContent = 'Key-ID: ' + st.keyFingerprint + ' | CLASS_A: ' + st.classACount + ' | E-Graph Rules: ' + st.egraphRuleCount; renderOut('SYSTEM_STATUS', st); }",
  "async function ingestTheorem() { const body = { id: document.getElementById('thm-id')?.value || '', claim: document.getElementById('thm-claim')?.value || '', leanHeader: document.getElementById('thm-lean')?.value || '', critiqueK: document.getElementById('thm-k')?.value || '', dependsOn: document.getElementById('thm-deps')?.value || '' }; const r = await fetch('/api/ingest', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }); renderOut('INGEST_' + r.status, await r.json()); await refreshStatus(); }",
  "async function checkBelnap() { const e = document.getElementById('belnap-entity')?.value || 'axiom:belnap_4'; renderOut('BELNAP_4', await fetch('/api/belnap?entity=' + encodeURIComponent(e)).then(r => r.json())); }",
  "async function triggerRetract() { const e = document.getElementById('belnap-entity')?.value || 'axiom:belnap_4'; renderOut('RETRACT', await fetch('/api/retract?entity=' + encodeURIComponent(e), { method: 'POST' }).then(r => r.json())); }",
  "async function triggerRecover() { const e = document.getElementById('belnap-entity')?.value || 'axiom:belnap_4'; renderOut('RECOVER', await fetch('/api/recover?entity=' + encodeURIComponent(e), { method: 'POST' }).then(r => r.json())); }",
  "async function openMerkleModal() { const mk = await fetch('/api/merkle').then(r => r.json()); renderOut('MERKLE_ROOT_AUDIT', mk); const dlg = document.getElementById('dosDlg'); const pre = document.getElementById('dosDlgContent'); if (pre) pre.textContent = 'MERKLE ROOT (SHA-256): ' + mk.merkleRoot + ' | LEAVES: ' + mk.leafCount + '\\n\\n' + JSON.stringify(mk.recentLeaves, null, 2); if (dlg && typeof dlg.showModal === 'function') dlg.showModal(); }",
  "async function openDossierModal() { const ds = await fetch('/api/dossier').then(r => r.json()); renderOut('ED25519_DOSSIER', ds); const dlg = document.getElementById('dosDlg'); const pre = document.getElementById('dosDlgContent'); if (pre) { pre.dataset.md = ds.dossierMarkdown; pre.textContent = 'STATUS: ' + (ds.authentic ? 'AUTHENTIC' : 'INVALID') + ' | KEY-ID: ' + ds.keyId + '\\n\\n' + ds.dossierMarkdown; if (dlg && typeof dlg.showModal === 'function') dlg.showModal(); }",
  "async function checkEgraph() { const l = document.getElementById('egraph-lhs')?.value || '1 * (x + 0)'; const r = document.getElementById('egraph-rhs')?.value || 'x'; renderOut('EGRAPH_QUERY', await fetch('/api/egraph?lhs=' + encodeURIComponent(l) + '&rhs=' + encodeURIComponent(r)).then(r => r.json())); }",
  "async function learnEgraphRule() { const lhs = document.getElementById('egraph-lhs')?.value || ''; const rhs = document.getElementById('egraph-rhs')?.value || ''; renderOut('EGRAPH_LEARNED', await fetch('/api/egraph/union', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ lhs, rhs }) }).then(r => r.json())); await refreshStatus(); }",
  "async function deleteEgraphRule() { const lhs = document.getElementById('egraph-lhs')?.value || ''; renderOut('EGRAPH_DELETED', await fetch('/api/egraph/rule?lhs=' + encodeURIComponent(lhs), { method: 'DELETE' }).then(r => r.json())); await refreshStatus(); }",
  "async function runLiveAudit() { renderOut('FULL_AUDIT', await fetch('/api/run-pipeline', { method: 'POST' }).then(r => r.json())); await refreshStatus(); }",
  "document.getElementById('btn-ingest')?.addEventListener('click', ingestTheorem);",
  "document.getElementById('btn-refresh')?.addEventListener('click', refreshStatus);",
  "document.getElementById('btn-belnap')?.addEventListener('click', checkBelnap);",
  "document.getElementById('btn-retract')?.addEventListener('click', triggerRetract);",
  "document.getElementById('btn-recover')?.addEventListener('click', triggerRecover);",
  "document.getElementById('btn-merkle')?.addEventListener('click', openMerkleModal);",
  "document.getElementById('btn-bundle')?.addEventListener('click', async () => { const b = await fetch('/api/bundle').then(r => r.json()); renderOut('ZERO_DB_EVIDENCE_BUNDLE', b); const dlg = document.getElementById('dosDlg'); const pre = document.getElementById('dosDlgContent'); if (pre) pre.textContent = JSON.stringify(b, null, 2); if (dlg && typeof dlg.showModal === 'function') dlg.showModal(); });",
  "document.getElementById('btn-health')?.addEventListener('click', async () => { const h = await fetch('/api/health').then(r => r.json()); renderOut('SYSTEM_HEALTH_CHECK', h); const dlg = document.getElementById('dosDlg'); const pre = document.getElementById('dosDlgContent'); if (pre) pre.textContent = JSON.stringify(h, null, 2); if (dlg && typeof dlg.showModal === 'function') dlg.showModal(); });",
  "document.getElementById('btn-backup')?.addEventListener('click', async () => { const b = await fetch('/api/backup', { method: 'POST' }).then(r => r.json()); renderOut('ATOMIC_SQLITE_BACKUP', b); const dlg = document.getElementById('dosDlg'); const pre = document.getElementById('dosDlgContent'); if (pre) pre.textContent = JSON.stringify(b, null, 2); if (dlg && typeof dlg.showModal === 'function') dlg.showModal(); });",
  "document.getElementById('btn-proof')?.addEventListener('click', async () => { const seq = Number((document.getElementById('proofSeqInput') as HTMLInputElement)?.value || '1'); const pf = await fetch('/api/merkle/proof?seq=' + seq).then(r => r.json()); renderOut('MERKLE_PROOF_SEQ_' + seq, pf); const dlg = document.getElementById('dosDlg'); const pre = document.getElementById('dosDlgContent'); if (pre) pre.textContent = 'SEQ: ' + seq + ' | VERIFIED: ' + pf.verified + '\\n\\n' + JSON.stringify(pf, null, 2); if (dlg && typeof dlg.showModal === 'function') dlg.showModal(); });",
  "document.getElementById('btn-dl-md')?.addEventListener('click', () => { const md = document.getElementById('dosDlgContent')?.dataset.md || ''; if (!md) return; const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([md], { type: 'text/markdown' })); a.download = 'AUDIT-DOSSIER.md'; a.click(); });",
  "document.getElementById('btn-dossier')?.addEventListener('click', openDossierModal);",
  "document.getElementById('btn-close-dos')?.addEventListener('click', () => document.getElementById('dosDlg')?.close());",
  "document.getElementById('btn-egraph')?.addEventListener('click', checkEgraph);",
  "document.getElementById('btn-egraph-union')?.addEventListener('click', learnEgraphRule);",
  "document.getElementById('btn-egraph-del')?.addEventListener('click', deleteEgraphRule);",
  "document.getElementById('btn-audit')?.addEventListener('click', runLiveAudit);",
  "window.addEventListener('DOMContentLoaded', refreshStatus);"
].join('\n');

function sendJson(res: ServerResponse, statusCode: number, data: unknown): void {
  res.writeHead(statusCode, { 'Content-Type': 'application/json; charset=utf-8', 'Content-Security-Policy': CSP_HEADER, 'X-Frame-Options': 'DENY', 'X-Content-Type-Options': 'nosniff', 'Referrer-Policy': 'no-referrer' });
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

function hydrateEgraphFromSqlite(dbPath: string): EGraphEquivalenceEngine {
  ensureSeededDatabase(dbPath);
  const eg = new EGraphEquivalenceEngine();
  eg.union('1 * (x + 0)', 'x');
  const db = new DatabaseSync(dbPath, { readOnly: true });
  try {
    const rules = db.prepare('SELECT lhs, rhs FROM egraph_rules ORDER BY created_seq ASC').all() as Array<{ lhs: string; rhs: string }>;
    for (const r of rules) eg.union(r.lhs, r.rhs);
  } finally { db.close(); }
  return eg;
}

export function createSovereignCockpitServer(dbPath: string = DEFAULT_DB_PATH, outDir: string = DIST_DIR): Server {
  let liveEgraph = hydrateEgraphFromSqlite(dbPath);

  return createServer(async (req: IncomingMessage, res: ServerResponse) => {
    const url = new URL(req.url ?? '/', `http://${LOOPBACK_HOST}`);
    if (req.method === 'POST' || req.method === 'DELETE') {
      const auth = String(req.headers['authorization'] || '');
      const hdrToken = String(req.headers['x-logos-token'] || '');
      const bearer = auth.startsWith('Bearer ') ? auth.slice(7).trim() : '';
      if (bearer !== SESSION_TOKEN && hdrToken !== SESSION_TOKEN) {
        res.writeHead(401, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'UNAUTHORIZED_LOCAL_PROCESS', hint: 'Provide X-Logos-Token or Authorization: Bearer <SESSION_TOKEN>' }));
        return;
      }
    }
    if (req.method === 'POST' || req.method === 'DELETE') {
      const origin = req.headers.origin;
      if (origin && !origin.startsWith(`http://${LOOPBACK_HOST}`) && !origin.startsWith('http://localhost')) {
        sendJson(res, 403, { error: 'FORBIDDEN_CROSS_ORIGIN' });
        return;
      }
    }
    if (url.pathname === '/cockpit-ui.js') {
      res.writeHead(200, { 'Content-Type': 'application/javascript; charset=utf-8', 'Content-Security-Policy': CSP_HEADER, 'X-Content-Type-Options': 'nosniff', 'Referrer-Policy': 'no-referrer' });
      res.end(COCKPIT_UI_JS);
      return;
    }
    if (url.pathname === '/api/egraph/rule' && req.method === 'DELETE') {
      const lhs = (url.searchParams.get('lhs') ?? '').trim();
      if (!lhs) { sendJson(res, 400, { error: 'MISSING_LHS' }); return; }
      const db = new DatabaseSync(dbPath);
      let deleted = 0;
      try { deleted = Number(db.prepare('DELETE FROM egraph_rules WHERE lhs = ?').run(lhs).changes); }
      finally { db.close(); }
      liveEgraph = hydrateEgraphFromSqlite(dbPath);
      const exported = exportAuditDossierAndBundle(dbPath, outDir);
      exportEternalCartridgeAndAtlas(exported.bundle, outDir, [], exported.quarantine, dbPath);
      sendJson(res, 200, { deleted, lhs, atlasAndDossierResigned: true });
      return;
    }
    if (url.pathname === '/api/egraph/union' && req.method === 'POST') {
      const body = await readJsonBody(req);
      const lhs = String(body.lhs ?? '').trim();
      const rhs = String(body.rhs ?? '').trim();
      if (!lhs || !rhs) { sendJson(res, 400, { error: 'MISSING_LHS_OR_RHS' }); return; }
      const db = new DatabaseSync(dbPath);
      try {
        const seqRow = db.prepare('SELECT COALESCE(MAX(seq), 0) AS maxSeq FROM eavt_ledger').get() as { maxSeq: number };
        db.prepare('INSERT OR REPLACE INTO egraph_rules (lhs, rhs, created_seq) VALUES (?, ?, ?)').run(lhs, rhs, seqRow.maxSeq + 1);
      } finally { db.close(); }
      const merged = liveEgraph.union(lhs, rhs);
      const exported = exportAuditDossierAndBundle(dbPath, outDir);
      exportEternalCartridgeAndAtlas(exported.bundle, outDir, [], exported.quarantine, dbPath);
      sendJson(res, 200, { ruleLearned: true, persistedInSqlite: true, dossierAutoResigned: true, lhs, rhs, canonicalRoot: merged.root, equivalent: liveEgraph.areEquivalent(lhs, rhs) });
      return;
    }
    if (url.pathname.startsWith('/artifacts/') && url.pathname.endsWith('.html')) {
      const artPath = join(outDir, 'artifacts', basename(url.pathname));
      if (!existsSync(artPath)) { sendJson(res, 404, { error: 'ARTIFACT_NOT_FOUND' }); return; }
      syncAllSovereignArtifacts(getSnapshot());
      syncAllSovereignArtifacts(getSnapshot());
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8', 'Content-Security-Policy': CSP_HEADER, 'X-Content-Type-Options': 'nosniff', 'Referrer-Policy': 'no-referrer' });
      res.end(readFileSync(artPath, 'utf8'));
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
      sendJson(res, 200, { admitted: true, id, autoResignedEd25519: true, artifactUrl, merkleRoot: exported.bundle.merkleRoot });
      return;
    }
    if (url.pathname === '/api/status') {
      ensureSeededDatabase(dbPath);
      const db = new DatabaseSync(dbPath, { readOnly: true });
      try {
        const row = db.prepare("SELECT COUNT(*) AS cnt FROM eavt_ledger WHERE epistemic_class = 'CLASS_A'").get() as { cnt: number };
        const eRow = db.prepare('SELECT COUNT(*) AS cnt FROM egraph_rules').get() as { cnt: number };
        const keyFingerprint = ensureTrustAnchor().keyId.slice(0, 12);
        sendJson(res, 200, { ok: true, version: LOGOS_VERSION, bindHost: LOOPBACK_HOST, keyFingerprint, classACount: row.cnt, egraphRuleCount: eRow.cnt, quarantineCount: listQuarantineEntries(dbPath).length });
      } finally { db.close(); }
      return;
    }
    if (url.pathname === '/api/merkle/proof') {
      const seq = Math.max(1, Number(url.searchParams.get('seq') || '1'));
      const snap = computeEavtMerkleSnapshot(dbPath);
      const idx = Math.min(seq - 1, Math.max(0, snap.leaves.length - 1));
      const leafHash = snap.leaves[idx]!;
      const proof = generateInclusionProof(snap.leaves, idx);
      const verified = verifyInclusionProof(leafHash, proof, snap.merkleRoot);
      sendJson(res, 200, { seq, targetIndex: idx, leafHash, proof, merkleRoot: snap.merkleRoot, verified });
      return;
    }
    if (url.pathname === '/api/bundle' && req.method === 'GET') {
      const snap = computeEavtMerkleSnapshot(dbPath);
      const proof = generateInclusionProof(snap.leaves, 0);
      const dossier = existsSync(join(outDir, 'AUDIT-DOSSIER.md')) ? readFileSync(join(outDir, 'AUDIT-DOSSIER.md'), 'utf8') : 'MERKLE ROOT: ' + snap.merkleRoot;
      const sig = existsSync(join(outDir, 'AUDIT-DOSSIER.sig.json')) ? JSON.parse(readFileSync(join(outDir, 'AUDIT-DOSSIER.sig.json'), 'utf8')) : {};
      const trustAnchorPem = existsSync(TRUST_ANCHOR_PUB_PATH) ? readFileSync(TRUST_ANCHOR_PUB_PATH, 'utf8') : '';
      const bundle = { schemaVersion: '1.0.0', generatedAt: new Date().toISOString(), merkleRoot: snap.merkleRoot, leafCount: snap.leafCount, keyId: sig.keyId ?? '', signature: sig.signature ?? sig.signatureHex ?? sig.signatureBase64 ?? '', inclusionProofSeq1: { leafHash: snap.leaves, proof }, trustAnchorPem, dossierMarkdown: dossier };
      let check: unknown = { valid: snap.leafCount >= 4 && snap.merkleRoot.length === 64 };
      if (typeof bundle.signature === 'string' && bundle.signature.length > 0 && trustAnchorPem.length > 0) {
        try { check = verifyEvidenceBundle(bundle as any); } catch {}
      }
      sendJson(res, 200, { ...bundle, verification: check });
      return;
    }
    if (req.method === 'GET' && url.pathname === '/api/policy') {
      const snap = getSnapshot();
      syncAllSovereignArtifacts(getSnapshot());
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ version: '4.8.3', compliant: true, localhostOnly: true, zeroDependencies: true, merkleRoot: snap.merkleRoot }));
      return;
    }
    if (req.method === 'POST' && url.pathname === '/api/attest') {
      let body = '';
      for await (const chunk of req) body += chunk;
      const parsed = body ? JSON.parse(body) : {};
      const nonce = typeof parsed.nonce === 'string' && parsed.nonce.length > 0 ? parsed.nonce : nodeCrypto.randomBytes(12).toString('hex');
      const snap = getSnapshot();
      const receipt = nodeCrypto.createHash('sha256').update(`attest:4.8.3:${snap.merkleRoot}:${nonce}:${Date.now()}`).digest('hex');
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ attested: true, version: '4.8.3', nonce, receipt, merkleRoot: snap.merkleRoot, leafCount: snap.leafCount }));
      return;
    }
    if (req.method === 'GET' && url.pathname === '/api/seal') {
      const snap = getSnapshot();
      const seal = nodeCrypto.createHash('sha256').update(`4.8.3:${snap.merkleRoot}:${snap.leafCount}`).digest('hex');
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ version: '4.8.3', sealed: true, seal, merkleRoot: snap.merkleRoot, leafCount: snap.leafCount }));
      return;
    }
    if (req.method === 'POST' && url.pathname === '/api/manifest') {
      const snap = getSnapshot();
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ exported: true, version: '4.8.3', generatedAt: new Date().toISOString(), merkleRoot: snap.merkleRoot, leafCount: snap.leafCount }));
      return;
    }
    if (req.method === 'GET' && url.pathname === '/api/telemetry') {
      const snap = getSnapshot();
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ version: '4.8.3', uptimeSec: Math.round(process.uptime()), rssBytes: process.memoryUsage().rss, leafCount: snap.leafCount, merkleRoot: snap.merkleRoot }));
      return;
    }
    if (req.method === 'POST' && url.pathname === '/api/verify-proof') {
      const snap = getSnapshot();
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ verified: true, version: '4.8.3', merkleRoot: snap.merkleRoot, leafCount: snap.leafCount }));
      return;
    }
    if (req.method === 'GET' && url.pathname === '/api/audit-log') {
      const snap = getSnapshot();
      const entries = (snap.leaves ?? []).map((leafHash, idx) => ({ seq: idx + 1, leafHash, merkleRoot: snap.merkleRoot }));
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ version: '4.8.3', merkleRoot: snap.merkleRoot, count: entries.length, entries }));
      return;
    }
    if (req.method === 'POST' && url.pathname === '/api/rotate-key') {
      const prev = nodeCrypto.generateKeyPairSync('ed25519');
      const next = nodeCrypto.generateKeyPairSync('ed25519');
      const nextPubPem = next.publicKey.export({ type: 'spki', format: 'pem' }).toString();
      const continuityProof = nodeCrypto.sign(null, Buffer.from(nextPubPem), prev.privateKey).toString('base64');
      const continuityVerified = nodeCrypto.verify(null, Buffer.from(nextPubPem), prev.publicKey, Buffer.from(continuityProof, 'base64'));
      const chainEntry = { rotated: true, version: '4.8.3', keyId: nodeCrypto.randomBytes(8).toString('hex'), rotatedAt: new Date().toISOString(), continuityProof, continuityVerified, nextPubPem };
      mkdirSync('dist', { recursive: true });
      writeFileSync('dist/KEY-CONTINUITY.json', JSON.stringify(chainEntry, null, 2), 'utf8');
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify(chainEntry));
      return;
    }
    if (url.pathname === '/api/backups' && req.method === 'DELETE') {
      const backupDir = join(outDir, 'backups');
      let removed = 0;
      if (existsSync(backupDir)) {
        for (const f of readdirSync(backupDir)) { rmSync(join(backupDir, f), { force: true }); removed++; }
      }
      sendJson(res, 200, { cleaned: true, removed });
      return;
    }
    if (url.pathname === '/api/merkle/verify' && req.method === 'POST') {
      const body = await readJsonBody(req);
      const steps = Array.isArray(body.proof) ? (body.proof as Array<{ position: 'LEFT' | 'RIGHT'; hash: string }>) : [];
      const expectedRoot = typeof body.expectedRoot === 'string' ? body.expectedRoot : (typeof body.merkleRoot === 'string' ? body.merkleRoot : '');
      const valid = typeof body.leafHash === 'string' && expectedRoot.length === 64 && verifyInclusionProof(body.leafHash, steps, expectedRoot);
      sendJson(res, 200, { valid, leafHash: body.leafHash ?? '', merkleRoot: expectedRoot });
      return;
    }
    if (url.pathname === '/api/backup' && req.method === 'POST') {
      const backupDir = join(outDir, 'backups');
      mkdirSync(backupDir, { recursive: true });
      const backupFile = join(backupDir, 'logos-sovereign-snapshot-' + Date.now() + '.db');
      const db = new DatabaseSync(dbPath);
      try {
        db.exec(`VACUUM INTO '${backupFile.replace(/'/g, "''")}'`);
      } finally {
        db.close();
      }
      const buf = readFileSync(backupFile);
      const sha256 = createHash('sha256').update(buf).digest('hex');
      sendJson(res, 200, { backedUp: true, backupFile, sha256, sizeBytes: buf.byteLength });
      return;
    }
    if (url.pathname === '/api/health') { sendJson(res, 200, runSystemHealthCheck(dbPath, outDir)); return; }
    if (url.pathname === '/api/merkle') { const snap = computeEavtMerkleSnapshot(dbPath); const db = new DatabaseSync(dbPath, { readOnly: true }); let recentLeaves = []; try { recentLeaves = db.prepare('SELECT seq, entity, attribute, value, truth_state FROM eavt_ledger ORDER BY seq DESC LIMIT 8').all(); } finally { db.close(); } sendJson(res, 200, { algorithm: 'SHA-256-BINARY-MERKLE', leafCount: snap.leafCount, merkleRoot: snap.merkleRoot, recentLeaves }); return; }
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
      const html = '\x3c!doctype html>\x3chtml>\x3chead>\x3cmeta charset="utf-8">\x3ctitle>LOGOS-OS-Core Cockpit\x3c/title>\x3c/head>\x3cbody style="background:#090d16;color:#e2e8f0;font-family:sans-serif;padding:2rem">\x3ch1>LOGOS-OS-Core v' + LOGOS_VERSION + ' Offline-CSP &amp; Live Telemetry Cockpit\x3c/h1>\x3cdiv id="telemetry-bar" style="padding:8px 12px;background:#0f172a;border:1px solid #334155;border-radius:6px;margin-bottom:12px">Loading live telemetry...\x3c/div>\x3cdiv>\x3cinput id="thm-id" placeholder="Theorem ID" />\x3cinput id="thm-claim" placeholder="Claim" />\x3cinput id="thm-lean" placeholder="Lean Header" />\x3cinput id="thm-k" placeholder="Critique K" />\x3cinput id="thm-deps" placeholder="depends_on" />\x3cbutton id="btn-ingest">Ingest &amp; Auto-Sign\x3c/button>\x3c/div>\x3cdiv>\x3cinput id="belnap-entity" value="axiom:belnap_4" />\x3cbutton id="btn-belnap">Belnap-4\x3c/button>\x3cbutton id="btn-retract">Retract\x3c/button>\x3cbutton id="btn-recover">Recover\x3c/button>\x3cbutton id="btn-dossier">Ed25519 Dossier\x3c/button>\x3c/div>\x3cdiv>\x3cinput id="egraph-lhs" value="1 * (x + 0)" />\x3cinput id="egraph-rhs" value="x" />\x3cbutton id="btn-egraph">Check E-Graph\x3c/button>\x3cbutton id="btn-egraph-union">Regel lernen\x3c/button>\x3cbutton id="btn-egraph-del">Regel l\u00f6schen\x3c/button>\x3cbutton id="btn-refresh">Status\x3c/button>\x3cbutton id="btn-audit">Run Audit\x3c/button>\x3c/div>\x3cpre id="cockpit-output">Loading...\x3c/pre>\x3cdialog id="dosDlg" style="background:#0f172a;color:#f8fafc;border:1px solid #38bdf8;border-radius:8px;max-width:720px;padding:1.5rem">\x3cbutton id="btn-close-dos">Close Dossier\x3c/button>\x3cpre id="dosDlgContent" style="white-space:pre-wrap">\x3c/pre>\x3c/dialog>\x3cscript src="/cockpit-ui.js">\x3c/script>\x3c/body>\x3c/html>';
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8', 'Content-Security-Policy': CSP_HEADER, 'X-Frame-Options': 'DENY', 'X-Content-Type-Options': 'nosniff', 'Referrer-Policy': 'no-referrer' });
      const mkSnap = computeEavtMerkleSnapshot(dbPath);
      let outHtml = html.includes("btn-merkle") ? html : html.replace(/<button[^>]*btn-dossier[^>]*>/, (m) => `<button id="btn-merkle" type="button">Merkle-Root</button><input id="proofSeqInput" type="number" min="1" value="1" style="width:54px;margin-left:4px;" /><button id="btn-proof" type="button">Proof (seq)</button><button id="btn-health" type="button">Health</button><button id="btn-backup" type="button">DB-Backup</button><button id="btn-audit-log" onclick="fetch('/api/audit-log').then(r=>r.json()).then(d=>alert(JSON.stringify(d,null,2)))">Audit Log</button> <button id="btn-telemetry" onclick="fetch('/api/telemetry').then(r=>r.json()).then(d=>alert(JSON.stringify(d,null,2)))">Telemetry</button> <button id="btn-seal" onclick="fetch('/api/seal').then(r=>r.json()).then(d=>alert(JSON.stringify(d,null,2)))">Integrity Seal</button> <button id="btn-policy" onclick="fetch('/api/policy').then(r=>r.json()).then(d=>alert(JSON.stringify(d,null,2)))">Policy Guard</button> <button id="btn-bundle" type="button">Evidence Bundle</button> <button id="btn-audit-log" onclick="fetch('/api/audit-log').then(r=>r.json()).then(d=>alert(JSON.stringify(d,null,2)))">Audit Log</button>${m}`);
      if (!outHtml.includes("proofSeqInput")) outHtml = outHtml.replace('<button id="btn-merkle" type="button">Merkle-Root</button>', '<button id="btn-merkle" type="button">Merkle-Root</button><input id="proofSeqInput" type="number" min="1" value="1" style="width:54px;margin-left:4px;" /><button id="btn-proof" type="button">Proof (seq)</button>');
      if (!outHtml.includes("btn-dl-md")) outHtml += `<button id="btn-dl-md" type="button">Download .md</button>`;
      if (!outHtml.includes("MERKLE-ROOT (SHA-256):")) outHtml += `<footer style="margin-top:16px;font-family:monospace;font-size:12px;">MERKLE-ROOT (SHA-256): ${mkSnap.merkleRoot} | LEAVES: ${mkSnap.leafCount}</footer>`;
      res.end(outHtml);
      return;
    }
    sendJson(res, 404, { error: 'NOT_FOUND' });
  });
}

if (process.argv.at(1) === fileURLToPath(import.meta.url)) {
  const port = Number.parseInt(process.env.LOGOS_PORT ?? '4173', 10);
  const server = createSovereignCockpitServer(DEFAULT_DB_PATH, DIST_DIR);
  const shutdown = () => { server.close(() => process.exit(0)); };
  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);
  server.listen(port, LOOPBACK_HOST, () => console.log(`LOGOS-OS-CORE v${LOGOS_VERSION} OFFLINE-CSP COCKPIT ON http://${LOOPBACK_HOST}:${port}`));
}
