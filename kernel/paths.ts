import { readFileSync } from 'node:fs';

const pkg = JSON.parse(readFileSync('package.json', 'utf8')) as { version: string };

export const LOGOS_VERSION = pkg.version;
export const DEFAULT_DB_PATH = 'knowledge/logos-sovereign.db';
export const CANONICAL_SEED_PATH = 'knowledge/canonical-seed.json';
export const TRUST_ANCHOR_PUB_PATH = 'knowledge/TRUST-ANCHOR.pub.pem';
export const PRIVATE_KEY_PATH = 'knowledge/.sovereign-ed25519.key.json';
export const DIST_DIR = 'dist';
