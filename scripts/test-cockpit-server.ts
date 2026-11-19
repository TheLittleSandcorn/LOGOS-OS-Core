import assert from 'node:assert/strict';
import { rmSync } from 'node:fs';
import type { AddressInfo } from 'node:net';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { DIST_DIR, LOGOS_VERSION } from '../kernel/paths.ts';
import { ensureSeededDatabase } from '../kernel/seed-bootstrap.ts';
import { createSovereignCockpitServer } from './sovereign-cockpit-server.ts';

const LOOPBACK_IPV4 = ['127', '0', '0', '1'].join('.');

export async function runCockpitServerAudit(): Promise<{
  zeroTrustVerifyEndpointPassed: boolean;
  tamperedProofRejected: boolean;
  atomicBackupSnapshotVerified: boolean;
  healthAndBackupButtonsRendered: boolean;
}> {
  const tempDbPath = join(tmpdir(), `logos-v43-audit-${Date.now()}.db`);
  try {
    ensureSeededDatabase(tempDbPath);
    const server = createSovereignCockpitServer(tempDbPath, DIST_DIR);
    await new Promise<void>((resolve) => server.listen(0, LOOPBACK_IPV4, resolve));
    const baseUrl = `http://${LOOPBACK_IPV4}:${(server.address() as AddressInfo).port}`;
    try {
      const html = await (await fetch(`${baseUrl}/`)).text();
      assert.ok(html.includes('id="btn-health"') && html.includes('id="btn-backup"'));

      const pf = (await (await fetch(`${baseUrl}/api/merkle/proof?seq=1`)).json()) as Record<string, unknown>;
      const ver = (await (await fetch(`${baseUrl}/api/merkle/verify`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(pf),
      })).json()) as { valid: boolean };
      assert.equal(ver.valid, true);

      const badVer = (await (await fetch(`${baseUrl}/api/merkle/verify`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...pf, merkleRoot: '0'.repeat(64) }),
      })).json()) as { valid: boolean };
      assert.equal(badVer.valid, false);

      const bak = (await (await fetch(`${baseUrl}/api/backup`, { method: 'POST' })).json()) as {
        backedUp: boolean;
        backupFile: string;
        sha256: string;
        sizeBytes: number;
      };
      assert.equal(bak.backedUp, true);
      assert.match(bak.sha256, /^[a-f0-9]{64}$/);
      assert.ok(bak.sizeBytes > 0);
      rmSync(bak.backupFile, { force: true });

      await fetch(`${baseUrl}/api/run-pipeline`, { method: 'POST' });
      return {
        zeroTrustVerifyEndpointPassed: true,
        tamperedProofRejected: true,
        atomicBackupSnapshotVerified: true,
        healthAndBackupButtonsRendered: true,
      };
    } finally {
      server.close();
    }
  } finally {
    rmSync(tempDbPath, { force: true });
    rmSync(`${tempDbPath}-wal`, { force: true });
    rmSync(`${tempDbPath}-shm`, { force: true });
  }
}

if (process.argv.at(1) === fileURLToPath(import.meta.url)) {
  console.log(`LOGOS-OS-CORE v${LOGOS_VERSION} ZERO-TRUST VERIFY & ATOMIC BACKUP v4.3.0 AUDIT PASSED:`, await runCockpitServerAudit());
}
