# ETIB Community Connect deployment guide

## Production model

Render serves the public site and read-only API from this repository. Business records are packaged with each deployment from `server/data/businesses.json`.

The service does not use public accounts, database writes, JWT secrets, administrator credentials, password recovery, or email-delivery settings.

## Render configuration

The included `render.yaml`:

- uses Node.js 24
- installs exact production dependencies
- starts the Express service from `server/`
- checks `/api/health`
- deploys automatically from the connected branch

The existing `/var/data` disk remains attached temporarily so the former SQLite database is preserved for rollback. The current application does not read from or write to that disk. Do not remove the disk until ETIB confirms the old database backup is no longer needed.

## Release checks

Run before publishing:

```bash
cd server
npm ci
npm test
npm audit --omit=dev
```

The tests validate:

- the complete business catalog
- search, filters, pagination, detail lookup, and legacy ID lookup
- read-only API enforcement
- removal of public account and submission pages
- security headers, health behavior, and true 404 responses
- HTML structure and accessibility guardrails

## Post-deployment verification

1. Confirm `/api/health` reports `ok: true` and `mode: read-only`.
2. Confirm the public business count matches `businesses.json`.
3. Search by business name, service, category, and location.
4. Open each changed business profile and test its contact links.
5. Confirm former pages such as `/add-business.html`, `/signup.html`, and `/admin-dashboard.html` return 404.
6. Confirm a `POST` to `/api/listings` returns 405.
7. Test keyboard navigation, 200% zoom, forced-colors mode, and a current screen reader.

## Rollback

Redeploy the last known good commit. The former SQLite file remains on the attached disk during the transition, which preserves the option to restore the previous architecture if a critical issue is discovered.
