# PII Retention

Two independent stores hold personal data on a clock: the Evidence Vault (uploaded
documents) and `OtpChallenge` (phone numbers). They are unrelated in code and were
implemented at different times — the second one is easy to forget, which is exactly
what happened.

## Evidence Vault scope

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

## OTP challenges (`OtpChallenge`)

Separate from the Evidence Vault and easy to miss: `OtpChallenge.phone` stores the
phone number in plain text, and one row is written on every login attempt — including
attempts that never become an account (mistyped digit, abandoned code screen, someone
probing another person's number).

- Account deletion erases the challenges of that phone inside the same transaction,
  **before** the customer phone is renamed to `deleted:<id>` — after the rename the
  rows can no longer be matched.
- `OtpRetentionService` sweeps hourly and deletes challenges more than 24 hours past
  `expiresAt`. Deleting is safe: nothing reads a challenge after expiry — `verifyOtp`
  rejects on the deadline, not on row presence. The 24-hour window exists so that
  number-probing abuse, which is only visible in the trail of attempts, can still be
  investigated.

## Release requirements

This is a local software implementation, not legal or production certification.
Before launch, the owner and Kyrgyz legal/accounting advisors must approve the
retention period, deletion exceptions, subject-access workflow, backup
retention and evidence-hold procedure. Staging must also prove R2/MinIO object
deletion, database restore behavior and audit-log access without restoring the
purged object as readable evidence.
