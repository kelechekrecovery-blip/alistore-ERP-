# AliStore Sign in with Apple — production activation

This runbook is specific to AliStore. Do not reuse the Savio key or identifiers.

## Apple Developer configuration (owner action)

1. Enable **Sign in with Apple** for App ID `kg.alistore.client`.
2. Create/configure Services ID `kg.alistore.web`, group it with the primary App
   ID `kg.alistore.client`, add domain `ali.kg`, and add return URL
   `https://ali.kg/login`.
3. Create a Sign in with Apple key scoped to that primary App ID. Download its
   `.p8` once and place it directly in Render; never paste it into chat, source
   control, logs, or App Store review notes.

The App Store Connect API key used to upload builds is a different credential
and cannot replace the Sign in with Apple key.

## Render secret group

Set these values in the shared `alistore-prod-common` environment group so both
`alistore-api-prod` and `alistore-worker-prod` receive the same credentials:

```text
APPLE_CLIENT_ID=kg.alistore.web,kg.alistore.client
APPLE_WEB_CLIENT_ID=kg.alistore.web
APPLE_REDIRECT_URI=https://ali.kg/login
APPLE_TEAM_ID=<10-character team id>
APPLE_KEY_ID=<Sign in with Apple key id>
APPLE_PRIVATE_KEY=<entire .p8 PEM value>
APPLE_TOKEN_ENCRYPTION_KEYS_JSON={"primary":"<base64 32-byte random key>"}
APPLE_TOKEN_ENCRYPTION_ACTIVE_KEY_ID=primary
```

Generate the independent encryption key on the owner's machine with
`openssl rand -base64 32`. It encrypts Apple refresh tokens at rest; it is not
an Apple credential. Preserve old keys in the JSON map during rotation until
all existing envelopes have been re-encrypted or revoked.

The Blueprint sets `APPLE_REVOCATION_RELAY_ENABLED=false` on the HTTP API and
`true` on the worker. Do not enable the relay before the migration has deployed.

## Required release order

1. Deploy the additive database migration.
2. Add/verify the Render secrets above without exposing their values.
3. Deploy API and worker from the same commit.
4. Confirm the worker is healthy and has no
   `Apple revocation configuration is invalid` log event.
5. Confirm `GET https://api.ali.kg/api/auth/methods` advertises both native Apple
   and the web client ID.
6. Test a fresh account on a physical iPad/iPhone: sign in, finish phone
   enrollment, sign out/in, then delete the account. Confirm the local deletion
   succeeds and the corresponding `AppleOAuthGrant` is removed by the worker.
7. Test web Apple sign-in from `https://ali.kg/login` with popup blocking both
   enabled and disabled.
8. Only after recorded PASS, upload the new Client build and answer the existing
   App Review rejection. Do not claim device verification before it happened.

## Failure semantics

- The API derives the OAuth client ID from the verified Apple `id_token`
  audience; clients cannot choose it.
- The authorization-code response `id_token` must match the original Apple
  subject before a refresh token is retained.
- Authorization and refresh tokens are never stored in plaintext.
- Account deletion unlinks customer PII immediately. Revocation retries are
  durable and do not block local deletion when Apple is unavailable.
- `invalid_grant` is terminal cleanup; network/5xx/429 failures retry with
  exponential backoff; `invalid_client` parks the grant for operator repair.
