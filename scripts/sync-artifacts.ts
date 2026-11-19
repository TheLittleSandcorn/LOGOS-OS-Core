import fs from 'node:fs';

export function syncAllSovereignArtifacts(snap: { merkleRoot: string; leafCount: number }) {
  fs.mkdirSync('dist', { recursive: true });
  const content = [
    '# LOGOS-OS-Core v4.8.2 Sovereign Manifest',
    `merkleRoot: ${snap.merkleRoot}`,
    `leafCount: ${snap.leafCount}`,
    `syncedAt: ${new Date().toISOString()}`,
    ''
  ].join('\n');
  fs.writeFileSync('dist/llms.txt', content, 'utf8');
  return { synced: true, merkleRoot: snap.merkleRoot, leafCount: snap.leafCount };
}
