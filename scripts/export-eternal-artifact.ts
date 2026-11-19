import { createHash } from 'node:crypto';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import type { EvidenceBundle } from '../bricks/graph-memory/export-audit-dossier.ts';
import { DIST_DIR, LOGOS_VERSION } from '../kernel/paths.ts';

export function exportEternalCartridgeAndAtlas(
  bundle: EvidenceBundle,
  outDir: string = DIST_DIR
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

  const atlasHtml = `<!doctype html>
<html lang="en">
<head><meta charset="utf-8"><title>LOGOS-OS-Core v${LOGOS_VERSION} — Sovereign Master Atlas</title></head>
<body style="font-family:system-ui,sans-serif;background:#090d16;color:#e2e8f0;padding:2rem">
  <h1>LOGOS-OS-Core v${LOGOS_VERSION} — Sovereign Master Atlas</h1>
  <p><strong>Merkle-Root (SHA-256):</strong> <code>${bundle.merkleRoot}</code> | <strong>Leaves:</strong> ${bundle.leafCount} | <strong>Key-ID:</strong> <code>${bundle.keyId}</code></p>
  <ul>
    <li><code>axiom:zero_dependency</code> — runtime = node&gt;=22.6.0 [CLASS_A]</li>
    <li><code>axiom:loopback_only</code> — bind_host = 127.0.0.1 [CLASS_A]</li>
    <li><code>axiom:belnap_4</code> — logic_states = TRUE|FALSE|BOTH|NEITHER [CLASS_A]</li>
    <li><code>axiom:anti_a_quarantine</code> — contradiction_policy = ISOLATE_CLASS_B [CLASS_A]</li>
  </ul>
</body>
</html>`;

  const cartridgePath = join(outDir, 'eternal-proof-cartridge.html');
  const atlasPath = join(outDir, 'index.html');
  writeFileSync(cartridgePath, cartridgeHtml, 'utf8');
  writeFileSync(atlasPath, atlasHtml, 'utf8');

  return { cartridgePath, atlasPath, cartridgeSha256 };
}
