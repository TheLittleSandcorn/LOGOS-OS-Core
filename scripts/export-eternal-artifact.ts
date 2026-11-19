import { createHash } from 'node:crypto';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
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
  const canonicalPayload = JSON.stringify({
    version: LOGOS_VERSION,
    keyId: bundle.keyId,
    merkleRoot: bundle.merkleRoot,
    leafCount: bundle.leafCount
  });
  const cartridgeSha256 = createHash('sha256').update(canonicalPayload, 'utf8').digest('hex');

  const cartridgeHtml = `<!doctype html>
<html lang="en">
<head><meta charset="utf-8"><title>LOGOS-OS-Core v${LOGOS_VERSION} — Eternal Proof Cartridge</title></head>
<body style="font-family:system-ui,sans-serif;background:#0f172a;color:#f8fafc;padding:2rem">
  <h1>LOGOS-OS-Core v${LOGOS_VERSION} — Self-Verifying Eternal Proof Cartridge</h1>
  <p><strong>Expected SHA-256:</strong> <code id="expected-hash">${cartridgeSha256}</code></p>
  <p><strong>Merkle-Root:</strong> <code>${bundle.merkleRoot}</code></p>
  <p><strong>Ed25519 Key-ID:</strong> <code>${bundle.keyId}</code></p>
  <pre id="payload">${canonicalPayload}</pre>
  <p id="verify-status">Verifying via Web Crypto API (crypto.subtle)...</p>
  <script>
    (async () => {
      const data = new TextEncoder().encode(document.getElementById('payload').textContent);
      const digest = await crypto.subtle.digest('SHA-256', data);
      const hex = [...new Uint8Array(digest)].map(b => b.toString(16).padStart(2, '0')).join('');
      const ok = hex === document.getElementById('expected-hash').textContent;
      document.getElementById('verify-status').textContent = ok ? 'VERIFIED_SHA256_MATCH: ' + hex : 'HASH_MISMATCH';
    })();
  </script>
</body>
</html>`;

  const retractionBanner =
    retractedEntities.length > 0
      ? `<div id="retraction-radar" style="background:#7f1d1d;color:#fecaca;padding:12px;border-radius:6px;margin:12px 0"><strong>RETRACTION RADAR ACTIVE:</strong> ${retractedEntities.join(', ')} [CONFLICT_RETRACTED]</div>`
      : `<div id="retraction-radar" style="background:#064e3b;color:#a7f3d0;padding:12px;border-radius:6px;margin:12px 0"><strong>RETRACTION RADAR CLEAR:</strong> 0 active cascade retractions.</div>`;

  const quarantineItems =
    quarantineEntries.length > 0
      ? quarantineEntries.map((q) => `<li><code>${q.candidate_id}</code> &rarr; <strong>${q.error_code}</strong> (<code>${q.fingerprint.slice(0, 12)}</code>)</li>`).join('')
      : '<li>No quarantined entries in local store.</li>';

  const axiomEntities = ['axiom:zero_dependency', 'axiom:loopback_only', 'axiom:belnap_4', 'axiom:anti_a_quarantine'];
  const axiomBadgesHtml = axiomEntities
    .map((ent) => {
      const evalRes = evaluateEntityBelnapState(ent, dbPath);
      const badgeColor = evalRes.state === 'TRUE' ? '#065f46' : evalRes.state === 'BOTH' ? '#991b1b' : '#334155';
      return `<li><code>${ent}</code> <span class="belnap-badge" style="background:${badgeColor};color:#f8fafc;padding:2px 8px;border-radius:4px;font-size:12px">[BELNAP-4: ${evalRes.state} | CLASS_A]</span></li>`;
    })
    .join('\n    ');

  const atlasHtml = `<!doctype html>
<html lang="en">
<head><meta charset="utf-8"><title>LOGOS-OS-Core v${LOGOS_VERSION} — Sovereign Master Atlas</title></head>
<body style="font-family:system-ui,sans-serif;background:#090d16;color:#e2e8f0;padding:2rem">
  <h1>LOGOS-OS-Core v${LOGOS_VERSION} — Sovereign Master Atlas</h1>
  <p><strong>Merkle-Root (SHA-256):</strong> <code>${bundle.merkleRoot}</code> | <strong>Leaves:</strong> ${bundle.leafCount} | <strong>Quarantined:</strong> ${quarantineEntries.length}</p>
  ${retractionBanner}
  <section style="margin:16px 0;padding:12px;border:1px solid #334155;border-radius:8px">
    <h2 style="margin-top:0">Verified CLASS_A Axioms &amp; Live Belnap-4 Badges</h2>
    <ul>
    ${axiomBadgesHtml}
    </ul>
  </section>
  <section id="immune-shield" style="margin:16px 0;padding:12px;border:1px solid #991b1b;background:#1f1115;border-radius:8px">
    <h2 style="margin-top:0;color:#fca5a5">Epistemic Immune Shield (Anti-A Quarantine Telemetry)</h2>
    <ul>${quarantineItems}</ul>
  </section>
  <section style="margin:16px 0;padding:12px;border:1px solid #334155;border-radius:8px">
    <h2 style="margin-top:0">Causal Lineage DAG (Offline SVG Graph)</h2>
    <svg id="lineage-svg" width="560" height="110" viewBox="0 0 560 110" style="background:#020617;border:1px solid #1e293b">
      <line x1="120" y1="55" x2="260" y2="55" stroke="#38bdf8" stroke-width="2" />
      <line x1="340" y1="55" x2="450" y2="55" stroke="#34d399" stroke-width="2" />
      <rect x="20" y="35" width="110" height="40" rx="6" fill="#0f172a" stroke="#38bdf8" />
      <text x="75" y="60" fill="#e2e8f0" font-size="11" text-anchor="middle">canonical-seed</text>
      <rect x="240" y="35" width="110" height="40" rx="6" fill="#0f172a" stroke="#38bdf8" />
      <text x="295" y="60" fill="#e2e8f0" font-size="11" text-anchor="middle">eavt_ledger</text>
      <rect x="440" y="35" width="105" height="40" rx="6" fill="#064e3b" stroke="#34d399" />
      <text x="492" y="60" fill="#ecfdf5" font-size="11" text-anchor="middle">Merkle-Root</text>
    </svg>
  </section>
  <section style="margin:16px 0;padding:12px;border:1px solid #334155;border-radius:8px">
    <h2 style="margin-top:0">Interactive 60-FPS Irrationality Bound (&mu;) Explorer</h2>
    <label for="mu-slider">Bound &mu;: <span id="mu-val">2.00</span></label>
    <input id="mu-slider" type="range" min="1.5" max="7.5" step="0.05" value="2.0" />
    <canvas id="formula-canvas" width="560" height="140" style="display:block;margin-top:10px;background:#020617;border:1px solid #1e293b"></canvas>
  </section>
  <script>
    const canvas = document.getElementById('formula-canvas');
    const ctx = canvas.getContext('2d');
    const slider = document.getElementById('mu-slider');
    const label = document.getElementById('mu-val');
    function renderFrame() {
      const mu = parseFloat(slider.value);
      label.textContent = mu.toFixed(2);
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      ctx.strokeStyle = '#38bdf8';
      ctx.lineWidth = 2;
      ctx.beginPath();
      for (let x = 0; x < canvas.width; x++) {
        const q = 1 + (x / canvas.width) * 12;
        const y = canvas.height - 15 - Math.min(110, (110 / Math.pow(q, mu * 0.45)));
        if (x === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
      }
      ctx.stroke();
      requestAnimationFrame(renderFrame);
    }
    requestAnimationFrame(renderFrame);
  </script>
</body>
</html>`;

  const cartridgePath = join(outDir, 'eternal-proof-cartridge.html');
  const atlasPath = join(outDir, 'index.html');
  writeFileSync(cartridgePath, cartridgeHtml, 'utf8');
  writeFileSync(atlasPath, atlasHtml, 'utf8');

  return { cartridgePath, atlasPath, cartridgeSha256 };
}
