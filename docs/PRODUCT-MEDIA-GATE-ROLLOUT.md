# Product media gate rollout

## Compatibility sequence

1. **Release A (`3565b5a9`)** adds `Product.published` with `DEFAULT true` and
   makes catalog/storefront projections filter on it.
2. **Compatibility floor (`6a2fc137`)** extends the same filter to checkout,
   B2B, promotions and product reviews. Its writers intentionally omit
   `published`: they follow `DEFAULT true` before Release B and fail closed on
   `DEFAULT false` after its migration. This is the oldest safe rollback target.
3. Deploy `6a2fc137`, verify API/web health, and drain every older API process.
4. **Release B** changes the database default to `false`, makes create/import
   explicit drafts, and enables the verified-media publish action in ERP.
5. Verify that existing catalog totals are unchanged, a draft is absent from
   catalog/checkout/B2B/reviews, and a server-uploaded WebP can be published.

Both DDL migrations set a five-second `lock_timeout`; a busy `Product` table
fails the deployment for a safe retry instead of queueing traffic indefinitely.

## Rollback

Never roll back behind compatibility floor `6a2fc137` after Release B has
created drafts. It understands `published=false` and blocks drafts across every
customer-facing SKU/ID lookup. Do not reverse either database migration; ship a
forward fix.

Before rollback, record the number of drafts:

```sql
SELECT count(*) FROM "Product" WHERE "published" = false;
```

After rollback, verify `/api/catalog/products`, `/api/catalog/categories`,
checkout and `/api/health/ready`. Drafts may remain editable in the database but
must not appear in any customer-facing response.

## Legacy media queue

Existing rows are deliberately grandfathered as published so rollout does not
empty the live storefront. They remain visible with truthful branded fallbacks.
Operations must upload real images through ERP; every new SKU is fail-closed as
a draft and requires a server-issued `media/<uuid>.webp` object before publish.
