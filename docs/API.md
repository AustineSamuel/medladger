# REST API

Base URL: `http://localhost:4000`. JSON routes return `{ "error": "..." }` on expected failures. Protected routes use `Authorization: Bearer <access-token>`. Access tokens last 15 minutes; refresh tokens rotate on refresh and are stored hashed in PostgreSQL.

| Method | Path | Access | Purpose |
|---|---|---|---|
| POST | `/api/auth/register` | Public | Create patient account |
| POST | `/api/auth/login` | Public | Authenticate |
| POST | `/api/auth/refresh` | Public | Rotate refresh token |
| POST | `/api/auth/logout` | Public | Revoke refresh token |
| POST | `/api/institutions/onboard` | Public | Submit provider/institution for review (pending, not trusted) |
| GET | `/api/institutions/me` | Provider | View current institution memberships |
| GET | `/api/institutions/pending` | Admin | List pending institutions |
| POST | `/api/institutions/:id/verify` | Admin | Verify or reject a pending institution |
| POST | `/api/institutions/:id/status` | Admin | Set institution status to verified, suspended, or revoked |
| GET | `/api/records` | Patient | List only the signed-in patient's records |
| GET | `/api/records/activity` | Patient | View the patient's recent record-access audit events |
| POST | `/api/records` | Verified institution staff | Issue a record with encrypted file upload |
| GET | `/api/records/:recordId/document` | Patient or currently authorized provider | Download a document after server-side consent checks |
| POST | `/api/consent/requests` | Provider | Request scoped, time-limited access |
| GET | `/api/consent/requests` | Patient | List requests addressed to the patient |
| POST | `/api/consent/requests/:requestId/respond` | Patient | Approve or reject a request |
| GET | `/api/consent/permissions` | Patient | Review consent decisions |
| POST | `/api/consent/permissions/:permissionId/revoke` | Patient | Revoke an active grant |
| POST | `/api/verify` | Public | Upload bytes and compare with a record reference, without returning patient fields |

Institution verification requires an administrator account provisioned through a trusted out-of-band process; public institution onboarding never grants verified status. The API does not currently implement email verification, password recovery, provider staff invitations, or transaction-submission endpoints.
