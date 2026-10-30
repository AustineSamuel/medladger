# Privacy model

Keep medical documents, names, email addresses, phone numbers, diagnoses, national identifiers, and document URLs off-chain. The application generates a cryptographically random patient reference; it is a pseudonym, not anonymization. Hashes are public commitments, not encryption. A hash can be vulnerable to guessing if it is derived from predictable or low-entropy data.

Public verification reports only whether submitted bytes match a record reference and whether the institution is currently verified. It does not return the patient, record title, or clinical contents. Patient consent is explicit, scoped, expires, and can be revoked for future access. Revocation cannot guarantee deletion of a copy already downloaded or a provider's legal recordkeeping obligations.

Do not upload real records to the development environment. A real deployment requires a documented lawful basis, patient notices, data minimization, retention/deletion controls, breach processes, a data-protection impact assessment, and jurisdiction-specific healthcare compliance review.
