# Render Production Checklist for ETIB Community Connect

Use this checklist before and after deploying production changes.

## 1. Service wiring
- Confirm the Render service is connected to `CazernyBussey/etib-community-connect`
- Confirm auto deploy behavior is expected for pushes to `main`
- Confirm `rootDir` is `server`
- Confirm start command is `npm start`
- Confirm health check path is `/api/health`

## 2. Persistent disk
Because SQLite is file-based, persistent disk is required for durable storage.

Check these items in Render:
- persistent disk is attached to the service
- disk mount path is known and documented
- database file is stored on the mounted disk path, not only in the build container filesystem
- restart the service once and confirm records still exist

Recommended adjustment:
- add a `DB_PATH` environment variable and point it to the mounted disk path, for example `/var/data/etib.db`
- update the server code to use `process.env.DB_PATH || defaultLocalPath`

## 3. Required environment variables
Set or verify:
- `NODE_ENV=production`
- `JWT_SECRET`
- `ADMIN_EMAIL`
- `ALLOWED_ORIGINS`
- `AUTH_RATE_WINDOW_MS`
- `AUTH_RATE_MAX`
- `LISTING_RATE_WINDOW_MS`
- `LISTING_RATE_MAX`
- `REVIEW_RATE_WINDOW_MS`
- `REVIEW_RATE_MAX`
- SMTP variables if email notifications are required

## 4. Pre-deploy validation
Before merge to `main`:
- review any API-breaking changes
- confirm no placeholder secrets remain
- confirm CORS origin list includes the live site domain
- confirm admin email address is correct
- confirm owner and admin flows still match the UI

## 5. Post-deploy smoke test
Run these tests in order:
1. open `/api/health`
2. create a new test account
3. sign in with the new account
4. submit a test listing
5. confirm the listing is pending in the admin view
6. approve the listing in admin
7. confirm the listing appears publicly
8. submit a review
9. confirm review moderation works
10. restart the Render service and confirm data is still present

## 6. Rollback readiness
Before high-impact deployment:
- capture a database backup
- keep a copy of the last known good commit SHA
- know how to redeploy the previous commit in Render
- verify admin access before beginning rollout

## 7. Professional operating standard
Do not rely on SQLite forever for a growing public directory. Persistent disk makes the current setup acceptable in the short term, but long-term production should move to managed Postgres for stronger durability, backup strategy, and scaling.