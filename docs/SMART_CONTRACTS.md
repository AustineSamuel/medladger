# Smart contract notes

The contracts store no diagnosis, document bytes, personal identifiers, private URLs, or account email. They store a random pseudonymous patient reference, issuer/institution references, category/content hashes, scope hashes, timestamps, and access/credential state. Hashing does not encrypt data; low-entropy or guessable values must never be hashed and published.

`CredentialRegistry` permits institution onboarding but only the platform administrator can verify or suspend an institution. A self-registered institution is not an authorized issuer. `MedicalRecordRegistry` accepts issue transactions only from an institution administrator or enabled staff member after verification. Corrections create a new record linked to the prior record; the prior record is not silently rewritten. `ConsentRegistry` gates reads only for applications that actually consult it. A public chain cannot make a provider forget previously downloaded information.

The record hash establishes byte equality to a committed record at a point in time. It does not establish that the issuer entered accurate medical facts, that the patient identity is correct, or that care was appropriate. Public chain interactions can reveal timing, addresses, institution links, and transaction patterns.

## Local test/deploy

```sh
npm run contracts:node
npm run contracts:deploy:local
npm run test --workspace @medledger/contracts
```

Never deploy with a development key to a public chain. Use a reviewed multisig/admin process and a supported key management service for production.
