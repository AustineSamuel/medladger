# Architecture and development stages

## System

```text
Patient/provider browser
    ├── REST API (JWT access token, rotating refresh token)
    ├── PostgreSQL (accounts, record metadata, grants, audit trail)
    └── Encrypted local document store (AES-256-GCM in development)

Ethereum-compatible chain
    ├── CredentialRegistry (admin-verified institutional credentials)
    ├── MedicalRecordRegistry (pseudonymous reference + content commitment)
    └── ConsentRegistry (patient-controlled on-chain scoped permissions)
```

Documents and personal identifiers remain off-chain. A random 32-byte patient reference is kept in the patient profile, separate from account email. Medical record metadata in PostgreSQL is protected by patient-scoped API authorization; database and storage access still require production hardening. Chain events, timestamps, issuer addresses, and commitments can leak linkability even when the payload is pseudonymous.

The current local prototype deploys and tests the contracts and implements REST/database consent, encrypted file storage, institution onboarding, and a public database-backed hash check. The backend does not currently read from or write to a blockchain; wallet signing, contract transaction submission, and synchronization of on-chain consent are not yet wired. The application must not describe a database-only check as an on-chain verification.

## Entity relationships

- `users` has one optional patient profile or professional profile and can be institution staff.
- `healthcare_institutions` has many staff members and issued records.
- `medical_records` belong to one patient, issuer institution, professional, and category.
- `medical_record_versions` preserves correction/supersession references without overwriting prior record bytes.
- `consent_requests` are provider requests; patient approval creates a scoped `consent_permissions` row.
- Audit, verification, notification, session, and transaction records reference their owning user or record.

UUID database identifiers are never used as patient names or credentials. Public verification deliberately returns no patient fields.

## Contract interfaces

- `CredentialRegistry`: `registerInstitution`, admin-only `setInstitutionVerified`/`setSuspended`, institution-admin `setStaff`/`updateMetadata`, `isAuthorizedIssuer`.
- `MedicalRecordRegistry`: `issueRecord`, `verifyRecord`, `isRecordHash`; an institution must be verified and unsuspended to issue.
- `ConsentRegistry`: `registerPatientController`, `grantAccess`, `revokeAccess`, `hasAccess`; record/category grants expire and are revocable.

Contract consent and API consent are currently separate records. A future release must synchronize them with wallet-signed transactions and confirm chain receipts before presenting chain-backed consent status.

## Development milestones

1. Contract interfaces, access control, and tests.
2. PostgreSQL schema, patient authentication, institution onboarding, encrypted development file storage, and API authorization.
3. Patient UI, record listing/download, consent review, and non-identifying public hash verification.
4. Remaining production work: email verification/recovery, institutional credential review operations, wallet signing and transaction synchronization, durable encrypted object storage/KMS, malware scanning, end-to-end testing, and independent privacy/security/compliance review.
