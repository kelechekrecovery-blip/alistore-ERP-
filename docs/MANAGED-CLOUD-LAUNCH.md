# AliStore managed-cloud launch

This runbook deploys the public Web MVP as an explicitly labelled demo. It does
not certify real payments, SMS, fiscal receipts, POS hardware or native stores.

## 1. Owner accounts

Create two owner/admin identities and enable 2FA plus recovery codes for:

- domain registrar for `ali.kg`;
- Cloudflare and Cloudflare Zero Trust;
- GitHub organization;
- Render Pro workspace;
- Sentry organization.

Never send recovery codes or production secrets through Git, issues or chat.

## 2. Cloudflare R2 EU

Create `alistore-media-prod` and `alistore-backups-prod` with EU jurisdiction.
Keep both private. Attach `media.ali.kg` only to the approved public product
asset path; Evidence Vault and backups must never have anonymous access. Create an
S3 token scoped only to those buckets and enter its endpoint/access key/secret in
the Render environment group.

Evidence uploads return a five-minute signed GET URL; the durable ledger reference
is the object key, not a public URL. Product assets use the public media base.

Create equivalent `*-staging` buckets with separate credentials. Configure
lifecycle cleanup for temporary uploads and the agreed backup retention period.

## 3. Render

1. Connect the GitHub organization to Render Pro.
2. Import `infra/render.staging.yaml` first and place it in a protected staging environment.
3. Fill every `sync: false` value; attach staging hostnames and run migrations/smoke.
   Enable Internal Authentication on each Render Key Value instance, then resync
   the Blueprint so `REDIS_URL` contains credentials required by production preflight.
4. Import `render.yaml` into a separate protected production environment.
5. Attach `ali.kg`, `www.ali.kg`, `admin.ali.kg` and `api.ali.kg`.
6. Confirm the API/web Render subdomains are disabled and cannot serve application content.
7. Send a controlled Sentry error and verify environment/release tagging plus PII scrubbing.

Deploys run Prisma migrations before API replacement. Production deploy approval
is manual even after CI passes. Never reverse a data-bearing migration during an
image rollback; use a forward migration.

## 4. Cloudflare edge

- Set Full Strict TLS. Enable HSTS only after staging and production custom domains pass.
- Proxy all public DNS records; do not publish Render origin hostnames.
- Cache only Next static assets and public catalog media. Bypass account, ERP and API mutations.
- Apply managed WAF rules and bot protection.
- Rate-limit OTP, checkout, payment intent/webhook and upload paths.
- Create a self-hosted Access application for `admin.ali.kg/*` and protected
  internal paths on the apex domain. Allow named employee emails only; never use
  `Everyone` or `All valid emails`. Require MFA and short sessions.
- Retain application staff JWT, RBAC and 2FA behind Access.

## 5. Verification and rollback

```bash
WEB_BASE_URL=https://ali.kg \
API_BASE_URL=https://api.ali.kg \
node scripts/deployment-smoke.mjs

npm run launch:preflight:strict
npm run launch:readiness:strict
```

Verify sandbox checkout remains labelled demo, a webhook cannot create a Payment,
stock/IMEI remain unchanged, internal paths require Access and application RBAC,
and Evidence URLs expire. Download the newest R2 database dump, restore it into a
fresh non-production database with `pg_restore`, and spot-check Order/AuditEvent.

Rollback by selecting the previous Render deploy for web/API/worker. Disable new
checkout during rollback, keep order status read-only, and do not roll back the DB
without an explicit compatible reverse migration.
