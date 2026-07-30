# Render production checklist

## Repository and service

- Render is connected to `CazernyBussey/etib-community-connect`
- Root directory is `server`
- Build command is `npm ci --omit=dev`
- Start command is `npm start`
- Health check is `/api/health`
- Automatic deployment behavior matches the protected production branch

## Catalog

- `server/data/businesses.json` passes `npm run validate:data`
- Stable IDs are unique
- Featured ranks are unique
- Every active business has verified contact information
- `catalogUpdated` and changed `lastVerified` dates are current
- Inactive records do not appear in public results

## Pre-deployment checks

- `npm test` passes
- `npm audit --omit=dev` reports no known vulnerabilities
- No account, upload, review, owner, or admin links are present
- No secrets or private business information are committed
- Changed contact links have been manually checked

## Post-deployment smoke test

1. Open `/api/health`.
2. Confirm read-only mode and the expected business count.
3. Search with no filters.
4. Search by a known service and location.
5. Open a business profile by stable ID.
6. Open the same existing record with its legacy numeric ID.
7. Confirm former public-write pages return 404.
8. Confirm API write attempts return 405.
9. Test keyboard navigation, browser zoom, and a current screen reader.

## Legacy disk

The old SQLite database is retained on the attached `/var/data` disk for rollback only. The current application must not read from or write to it. Remove the disk only after ETIB intentionally retires that rollback path.
