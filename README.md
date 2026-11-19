# LOGOS-OS-Core (v4.8.2)

**Zero-Dependency TypeScript & Node.js Cryptographic Verification Core** (`node >= 22.6.0`, `127.0.0.1` Loopback Only).

## Auf einen Blick (Klartext für Gutachter & Entscheider)

1. **Was es tut:** Prüft KI-Aussagen, Verträge und System-Logs auf Widersprüche und Datenlecks — komplett offline auf dem eigenen Rechner.
2. **Warum es sicher ist:** Null externe Abhängigkeiten, blockiert jeden heimlichen Internet-Abfluss direkt im Runtime-Kernel und benötigt keine geheimen Hersteller-Chips (kein TPM).
3. **Was man bekommt:** Einen fälschungssicheren, kryptografisch signierten Prüfbericht, den jeder Empfänger im Browser ohne Spezialsoftware überprüfen kann.

## Portable Offline-Beweiskapsel (Für Kunden & Förder-Audits)

`LOGOS-OS-Core` rechnet strikt lokal auf `127.0.0.1` und erzeugt versiegelte Offline-Artefakte zur sicheren Weitergabe an Dritte:

- **`dist/eternal-proof-cartridge.html`**: Eigenständiger HTML-Prüfbericht für den Browser (Zero-Server-Verification).
- **`dist/EVIDENCE-BUNDLE.json` & `dist/AUDIT-DOSSIER.md`**: Vollständiges Beweis-Paket inklusive `SHA-256` Merkle-Inklusionsbeweisen und `Ed25519`-Signatur.
- **`dist/KEY-CONTINUITY.json` & `scripts/vault-backup.ts`**: Lückenlose kryptografische Schlüssel-Übergangskette sowie `scrypt` + `AES-256-GCM` Offline-Tresor-Backup für den privaten `TRUST-ANCHOR`-Schlüssel.

## Core Architecture

- **Low-Level Kernel Egress Lock (`scripts/kernel-egress-lock.ts`):** Sperrt `globalThis.fetch`, `node:dns` (`dns.lookup`) und `node:net` (`net.Socket.prototype.connect`) hart für alle nicht-lokalen Ziele (`EGRESS_FIREWALL_BLOCKED`).
- **Deterministic SQLite EAVT Ledger (`kernel/seed-bootstrap.ts`):** Append-only Fakten-Ledger auf Basis von `knowledge/canonical-seed.json`.
- **Belnap-4 Logic & Anti-A Quarantine (`kernel/belnap-engine.ts`):** Bewertet `TRUE | FALSE | BOTH | NEITHER` und isoliert widersprüchliche `BOTH`-Behauptungen in `CLASS_B`-Quarantäne.
- **Binary SHA-256 Merkle Tree & Ed25519 Trust Anchor (`bricks/graph-memory/`):** Deterministische Merkle-Roots, `Ed25519`-Signaturen und Nonce-gebundene Attestierung (`POST /api/attest`).

## ⚡ Quickstart (100 % Clean-Clone Verified, Native `node --run`)

```bash
git clone https://github.com/TheLittleSandcorn/LOGOS-OS-Core.git
cd LOGOS-OS-Core
node --run sovereign
node --run health
node --run cockpit
```

Öffne **`http://127.0.0.1:4173`** im Browser für das interaktive Sovereign Cockpit.

## License & Support

Licensed under the **MIT License** — Copyright (c) 2026 Luciano Umut Tunc (ORCID `0009-0007-2438-1011`).
