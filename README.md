# MedLedger

MedLedger is an open-source, patient-controlled medical record verification platform. It keeps medical documents and identifying information off-chain; the contracts register institution credentials, pseudonymous record commitments, and patient consent references.

> **Important:** This repository is a local-development foundation, not a certified clinical system. Do not upload real patient records or deploy it for clinical use without an independent security/privacy assessment, jurisdiction-specific legal review, production key management, and operational controls.

## Architecture

- `contracts/`: three Solidity contracts, Hardhat scripts, and tests.
- `backend/`: TypeScript REST API, PostgreSQL migrations, role-aware access checks, and encrypted local document storage.
- `frontend/`: React/Vite patient interface and privacy-preserving public verification page.
- `docs/`: architecture, database, API, threat model, and contract notes.

The database stores only pseudonymous patient IDs for records. Uploaded files are encrypted at rest using AES-256-GCM before being written to a local development directory. A production deployment must replace local storage and the single configured encryption key with managed, access-controlled storage and a key-management service with rotation/recovery. The blockchain stores no document, health data, name, email, or public document URL.

## Local development

Requirements: Node.js 22.13+, npm, Docker, and (for contract deployment) an Ethereum JSON-RPC local node.

1. Copy `.env.example` to `.env`. Set two distinct random token secrets and a 32-byte hexadecimal `DOCUMENT_ENCRYPTION_KEY`.
2. Start PostgreSQL: `docker compose up -d postgres`.
3. Install dependencies: `npm install`.
4. Apply migrations: `npm run db:migrate`.
5. Add `ADMIN_EMAIL` and a unique 16+ character `ADMIN_PASSWORD` to your untracked local `.env`, then run `npm run db:create-admin`. Never put production secrets in shell history or source control.
6. Start API and web app: `npm run dev`.
7. Run tests: `npm test`.
8. Start a local chain with `npm run contracts:node`, then in another terminal deploy with `npm run contracts:deploy:local`.

The backend refuses to start without valid database/token/document-encryption configuration. The contracts can be deployed locally, but API-to-chain reads and writes are not yet wired. Institution verification is deliberately an administrator-controlled workflow; user registration does not create verified institutions or professionals.

## Verification limitations

A successful hash comparison shows only that the checked bytes match the commitment registered for a record. It does not prove that the medical content is accurate, that the patient identity is correct, or that care was appropriate. Credential state is checked separately. Public verification returns no patient identifier or record metadata.

See [docs/ARCHITECTURE.md](./docs/ARCHITECTURE.md), [docs/SECURITY.md](./docs/SECURITY.md), and [docs/API.md](./docs/API.md).
