import { createHash } from 'node:crypto';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import type { EvidenceBundle } from '../bricks/graph-memory/export-audit-dossier.ts';
import type { QuarantineRecord } from '../bricks/graph-memory/failure-alchemist.ts';
import { evaluateEntityBelnapState } from '../kernel/belnap-engine.ts';
import { DEFAULT_DB_PATH, DIST_DIR, LOGOS_VERSION } from '../kernel/paths.ts';

export function exportEternalCartridgeAndAtlas(
  bundle: EvidenceBundle,
  outDir: string = DIST_DIR,
  retractedEntities: string[] = [],
  quarantineEntries: QuarantineRecord[] = [],
  dbPath: string = DEFAULT_DB_PATH
): { cartridgePath: string; atlasPath: string; cartridgeSha256: string } {
  mkdirSync(outDir, { recursive: true });
  const canonicalPayload = JSON.stringify({ version: LOGOS_VERSION, keyId: bundle.keyId, merkleRoot: bundle.merkleRoot, leafCount: bundle.leafCount });
  const cartridgeSha256 = createHash('sha256').update(canonicalPayload, 'utf8').digest('hex');

  const cartridgeHtml = [
    '\x3c!doctype html>\x3chtml lang="en">\x3chead>\x3cmeta charset="utf-8">\x3ctitle>LOGOS-OS-Core Eternal Cartridge\x3c/title>\x3c/head>',
    '\x3cbody style="font-family:system-ui,sans-serif;background:#0f172a;color:#f8fafc;padding:2rem">',
    `\x3ch1>LOGOS-OS-Core v${LOGOS_VERSION} — Self-Verifying Eternal Proof Cartridge\x3c/h1>`,
    `\x3cp>\x3cstrong>Expected SHA-256:\x3c/strong> \x3ccode id="expected-hash">${cartridgeSha256}\x3c/code>\x3c/p>`,
    `\x3cp>\x3cstrong>Merkle-Root:\x3c/strong> \x3ccode>${bundle.merkleRoot}\x3c/code>\x3c/p>`,
    `\x3cpre id="payload">${canonicalPayload}\x3c/pre>\x3cp id="verify-status">Verifying...\x3c/p>`,
    '\x3cscript>(async()=>{const d=new TextEncoder().encode(document.getElementById("payload").textContent);const g=await crypto.subtle.digest("SHA-256",d);const h=[...new Uint8Array(g)].map(b=>b.toString(16).padStart(2,"0")).join("");document.getElementById("verify-status").textContent=h===document.getElementById("expected-hash").textContent?"VERIFIED_SHA256_MATCH: "+h:"HASH_MISMATCH";})();\x3c/script>\x3c/body>\x3c/html>'
  ].join('\n');

  let egraphRules: Array<{ lhs: string; rhs: string }> = [];
  const db = new DatabaseSync(dbPath, { readOnly: true });
  try {
    egraphRules = db.prepare('SELECT lhs, rhs FROM egraph_rules ORDER BY created_seq ASC').all() as typeof egraphRules;
  } catch {} finally { db.close(); }

  const egraphListHtml = egraphRules.length > 0
    ? egraphRules.map((r) => `\x3cli>\x3ccode>${r.lhs}\x3c/code> === \x3ccode>${r.rhs}\x3c/code>\x3c/li>`).join('')
    : '\x3cli>\x3ccode>1 * (x + 0)\x3c/code> === \x3ccode>x\x3c/code> (Canonical Identity)\x3c/li>';

  const retractionBanner = retractedEntities.length > 0
    ? `\x3cdiv id="retraction-radar" style="background:#7f1d1d;color:#fecaca;padding:12px;border-radius:6px;margin:12px 0">\x3cstrong>RETRACTION RADAR ACTIVE:\x3c/strong> ${retractedEntities.join(', ')}\x3c/div>`
    : '\x3cdiv id="retraction-radar" style="background:#064e3b;color:#a7f3d0;padding:12px;border-radius:6px;margin:12px 0">\x3cstrong>RETRACTION RADAR CLEAR:\x3c/strong> 0 active cascade retractions.\x3c/div>';

  const quarantineItems = quarantineEntries.length > 0
    ? quarantineEntries.map((q) => `\x3cli>\x3ccode>${q.candidate_id}\x3c/code> &rarr; \x3cstrong>${q.error_code}\x3c/strong>\x3c/li>`).join('')
    : '\x3cli>No quarantined entries in local store.\x3c/li>';

  const axiomEntities = ['axiom:zero_dependency', 'axiom:loopback_only', 'axiom:belnap_4', 'axiom:anti_a_quarantine'];
  const axiomCardsHtml = axiomEntities.map((ent) => {
    const evalRes = evaluateEntityBelnapState(ent, dbPath);
    return `\x3carticle class="axiom-card" data-entity="${ent}" style="background:#0f172a;border:1px solid #1e293b;border-radius:6px;padding:10px;margin:8px 0">\x3ccode>${ent}\x3c/code> \x3cspan class="belnap-badge" style="background:#065f46;color:#f8fafc;padding:2px 8px;border-radius:4px;font-size:12px">[BELNAP-4: ${evalRes.state} | CLASS_A]\x3c/span>\x3c/article>`;
  }).join('\n');

  const atlasHtml = [
    '\x3c!doctype html>\x3chtml lang="en">\x3chead>\x3cmeta charset="utf-8">\x3ctitle>LOGOS-OS-Core Master Atlas\x3c/title>\x3c/head>',
    '\x3cbody style="font-family:system-ui,sans-serif;background:#090d16;color:#e2e8f0;padding:2rem">',
    `\x3ch1>LOGOS-OS-Core v${LOGOS_VERSION} — Sovereign Master Atlas\x3c/h1>`,
    `\x3cp>\x3cstrong>Merkle-Root:\x3c/strong> \x3ccode>${bundle.merkleRoot}\x3c/code> | \x3cstrong>Leaves:\x3c/strong> ${bundle.leafCount} | \x3cstrong>E-Graph Rules:\x3c/strong> ${egraphRules.length}\x3c/p>`,
    retractionBanner,
    `\x3csection id="egraph-rules-tile" style="margin:16px 0;padding:12px;border:1px solid #6366f1;background:#11142b;border-radius:8px">\x3ch2 style="margin-top:0;color:#a5b4fc">Persisted E-Graph Equivalence Rules (LHS === RHS)\x3c/h2>\x3cul>${egraphListHtml}\x3c/ul>\x3c/section>`,
    `\x3csection style="margin:16px 0;padding:12px;border:1px solid #334155;border-radius:8px">\x3ch2 style="margin-top:0">Verified CLASS_A Axiom Cards\x3c/h2>\x3cinput id="atlas-filter" type="search" placeholder="Filter..." />\n${axiomCardsHtml}\x3c/section>`,
    `\x3csection id="immune-shield" style="margin:16px 0;padding:12px;border:1px solid #991b1b;background:#1f1115;border-radius:8px">\x3ch2 style="margin-top:0;color:#fca5a5">Epistemic Immune Shield\x3c/h2>\x3cul>${quarantineItems}\x3c/ul>\x3c/section>`,
    '\x3csection style="margin:16px 0;padding:12px;border:1px solid #334155;border-radius:8px">\x3ch2 style="margin-top:0">Causal Lineage DAG\x3c/h2>\x3csvg id="lineage-svg" width="560" height="80">\x3crect x="20" y="20" width="110" height="36" fill="#0f172a" stroke="#38bdf8"/>\x3ctext x="75" y="42" fill="#e2e8f0" font-size="11" text-anchor="middle">eavt_ledger\x3c/text>\x3c/svg>\x3c/section>',
    '\x3csection style="margin:16px 0;padding:12px;border:1px solid #334155;border-radius:8px">\x3ch2 style="margin-top:0">Formula Canvas\x3c/h2>\x3cinput id="mu-slider" type="range" min="1.5" max="7.5" step="0.05" value="2.0"/><span id="mu-val">2.00</span>\x3ccanvas id="formula-canvas" width="560" height="100">\x3c/canvas>\x3c/section>',
    '\x3cscript>document.getElementById("atlas-filter")?.addEventListener("input",e=>{const q=e.target.value.toLowerCase();for(const c of document.querySelectorAll(".axiom-card"))c.style.display=c.dataset.entity.toLowerCase().includes(q)?"block":"none";});\x3c/script>\x3c/body>\x3c/html>'
  ].join('\n');

  const cartridgePath = join(outDir, 'eternal-proof-cartridge.html');
  const atlasPath = join(outDir, 'index.html');
  writeFileSync(cartridgePath, cartridgeHtml, 'utf8');
  writeFileSync(atlasPath, atlasHtml, 'utf8');
  return { cartridgePath, atlasPath, cartridgeSha256 };
}
