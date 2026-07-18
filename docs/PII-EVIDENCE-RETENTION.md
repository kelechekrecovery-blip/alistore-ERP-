# Evidence Vault PII Retention

## Scope

The automatic retention policy currently covers only explicitly classified
trade-in identity documents: `passport`, `passport_front`, `passport_back`,
`identity_document` and `tradein_kyc`. General warranty, service, order and
inventory evidence is retained until a separate business and legal policy is
approved.

## Policy

- `EVIDENCE_PII_RETENTION_DAYS` defaults to 365 days and is bounded to 30-3650.
- `EVIDENCE_RETENTION_POLICY_VERSION` defaults to `kg-privacy-v1`.
- The policy is assigned by the API when the upload is created; the client
  cannot mark an upload as PII or extend its retention deadline.
- The hourly retention worker claims expired rows, deletes the private object,
  replaces the stored asset with non-sensitive metadata, and appends an
  `evidence.purged` Event Ledger entry containing only a SHA-256 object-key
  reference.
- Storage failures remain visible and retry with bounded exponential backoff.
- Reads of purged uploads fail with `evidence_purged`.

## Release requirements

This is a local software implementation, not legal or production certification.
Before launch, the owner and Kyrgyz legal/accounting advisors must approve the
retention period, deletion exceptions, subject-access workflow, backup
retention and evidence-hold procedure. Staging must also prove R2/MinIO object
deletion, database restore behavior and audit-log access without restoring the
purged object as readable evidence.
