# Threat model and security limitations

## Protected assets

Patient identity and account credentials, document plaintext, record-to-patient mappings, access decisions, provider credentials, encryption keys, refresh sessions, and audit history.

## Threats and controls in this development implementation

- **Unauthorized record lookup / IDOR:** patient record listing is scoped by authenticated user; document downloads check patient ownership or a non-expired, non-revoked provider permission and current institution membership. UUIDs are references, not authorization.
- **Unverified or suspended institution:** providers must belong to verified institution staff for issuing or requesting access. On-chain issuer authorization is independently enforced by `CredentialRegistry`.
- **Token theft:** passwords use bcrypt; access JWTs are short-lived; refresh-token hashes are stored and refresh rotates. The browser currently holds bearer tokens in `sessionStorage`, which remains exposed to successful script injection; production should use a carefully designed same-site HttpOnly cookie/session pattern and stronger browser protections.
- **File disclosure or tampering at rest:** local prototype files are encrypted with AES-256-GCM and plaintext SHA-256 commitments are checked on download. The single environment key is only a development mechanism; production requires KMS/HSM-backed envelope encryption, rotation, backups, access controls, and recovery.
- **Public verification privacy:** response omits patient identifiers, diagnosis, record title, and file URL. The caller must know a record reference and provide a candidate file. Rate limiting applies globally.
- **Database compromise / metadata leakage:** database includes patient-to-record links and must be treated as sensitive health data. Use least privilege, encrypted backups, retention policies, network isolation, auditing, and jurisdiction-appropriate controls.
- **On-chain correlation:** pseudonymous data is still public and transaction patterns may identify patients by inference. Avoid predictable patient refs, publish minimal commitments, and evaluate privacy leakage before deployment.

## Not production-ready

This project is not HIPAA/GDPR certified and has not undergone independent penetration testing, clinical safety review, or legal review. Do not process real patient data. Malware scanning, email verification/recovery, KMS key rotation, field-level database encryption, consent chain synchronization, backend blockchain transaction signing, comprehensive audit retention/alerts, abuse controls, backups, and operational incident response are not complete. Blockchain revocation cannot recall copies already downloaded.
