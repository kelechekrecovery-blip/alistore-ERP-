# Refresh Rotation Grace Rollout

The browser refresh cookie remains HttpOnly. The API stores only SHA-256 hashes
of refresh tokens; it never stores the plaintext parent or replacement.

## Mixed-version deployment

1. Deploy the `RefreshToken.rotatedAt` migration.
2. Deploy the new API code to every production and staging instance with
   `AUTH_REFRESH_ROTATION_GRACE_ENABLED=false`. Build and deploy the web image
   with `NEXT_PUBLIC_AUTH_REFRESH_ROTATION_GRACE_ENABLED=false`.
3. Drain or terminate every legacy API instance. While the gate is false,
   replay remains strict and browsers without Web Locks fail closed instead of
   sending an unsafe refresh; those users may need to sign in again.
4. Set a dedicated random secret of at least 32 characters in
   `AUTH_REFRESH_DERIVATION_SECRET`. Do not reuse or expose it to the browser.
5. Set `AUTH_REFRESH_ROTATION_GRACE_ENABLED=true` and roll all API instances.
6. After every API instance reports healthy with grace enabled, rebuild and
   deploy the web image with the Docker build argument
   `NEXT_PUBLIC_AUTH_REFRESH_ROTATION_GRACE_ENABLED=true`, and set the matching
   Render web runtime variable to `true`. A runtime-only change is insufficient
   because Next.js inlines `NEXT_PUBLIC_*` values during the image build.
7. Verify concurrent refresh metrics and `refresh_reused` rates before
   completing the rollout.

Never enable the gate while legacy instances remain. A legacy instance cannot
return the deterministic replacement and would reintroduce mixed rotation
semantics. Rotating `AUTH_REFRESH_DERIVATION_SECRET` invalidates deterministic
grace retries for parents rotated under the old secret; perform such rotation
only with the gate disabled and all API instances drained.
