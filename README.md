# LOGOS-OS-Core (`v4.1.0`)

**Zero-Dependency TypeScript & Node.js Cryptographic Verification Core** (`node >= 22.6.0`, `127.0.0.1` Loopback Only).

## Core Architecture
- **Deterministic SQLite EAVT Ledger (`kernel/seed-bootstrap.ts`):** Bootstraps an append-only ledger from `knowledge/canonical-seed.json`.
- **Belnap-4 Logic & Anti-A Quarantine (`kernel/belnap-engine.ts`):** Evaluates `TRUE | FALSE | BOTH | NEITHER` and isolates contradictory `BOTH` claims into `CLASS_B` quarantine.
- **Binary SHA-256 Merkle Tree (`bricks/graph-memory/merkle-ledger.ts`):** Computes deterministic Merkle roots and logarithmic inclusion proofs.
- **Ed25519 Trust Anchor & Zero-DB Bundle Verifier (`bricks/graph-memory/trust-anchor.ts`, `bundle-verifier.ts`):** Signs `AUDIT-DOSSIER.md` and verifies portable evidence bundles without database access.

## Quickstart
```bash
git clone https://github.com
cd LOGOS-OS-Core
node --run sovereign
node --run verify-bundle
```

## License & Support
Licensed under the **MIT License** — Copyright (c) 2026 Luciano Umut Tunc ([ORCID 0009-0007-2438-1011](https://orcid.org)).
