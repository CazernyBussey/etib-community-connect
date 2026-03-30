# ETIB Community Connect Production Hardening

This document defines the production hardening pass for ETIB Community Connect without disrupting the current Render deployment.

## Current strengths
- Accessibility-first directory structure
- Authentication with JWT and bcrypt
- Listing moderation and featured listings
- Review moderation and admin audit logs
- Render deployment configuration already present

## Priority 1: Safe production controls

### 1. Require a real JWT secret in production
Current risk:
- The server falls back to a placeholder secret if `JWT_SECRET` is missing.

Required change:
- Fail startup when `NODE_ENV=production` and `JWT_SECRET` is missing or set to a placeholder value.

Recommended implementation:
```js
const isProduction = process.env.NODE_ENV === 'production';
if (isProduction && (!process.env.JWT_SECRET || process.env.JWT_SECRET === 'replace-me')) {
  throw new Error('JWT_SECRET must be set in production');
}
```

### 2. Restrict CORS to approved origins
Current risk:
- `cors()` is open to all origins.

Required change:
- Add `ALLOWED_ORIGINS` as a comma-separated environment variable.
- Permit only approved web origins in production.

Recommended implementation:
```js
const allowedOrigins = String(process.env.ALLOWED_ORIGINS || '')
  .split(',')
  .map(v => v.trim())
  .filter(Boolean);

app.use(cors({
  origin(origin, callback) {
    if (!origin) return callback(null, true);
    if (!allowedOrigins.length || allowedOrigins.includes(origin)) return callback(null, true);
    return callback(new Error('Origin not allowed by CORS'));
  }
}));
```

### 3. Keep SQLite only if persistent disk is attached
Because Render persistent disk is now available on the paid plan, SQLite can remain temporarily if:
- the disk is mounted correctly
- the database file lives on the mounted disk path
- backups are taken regularly

Recommended next improvement:
- move to managed Postgres when ready for multi-instance scale and easier backup workflows

## Priority 2: Business-owner workflow upgrades

### 4. Add owner edit and resubmit endpoints
Current gap:
- owners can list their submissions but cannot directly update and resubmit them through the API

Required endpoints:
- `GET /api/owner/listings/:id`
- `PATCH /api/owner/listings/:id`

Behavior:
- only the owner can edit their own listing
- approved listings edited by owners should move back to `pending` or `needs_review`
- edits should update `last_updated`
- admin moderation should remain required before publishing changed content

### 5. Add password reset flow
Required pieces:
- password reset request endpoint
- reset token table with expiry
- email delivery for reset link or one-time code
- reset confirmation endpoint

Minimum secure standard:
- hashed reset token stored in database
- token expiry under 1 hour
- one-time use only
- generic success response to prevent account enumeration

## Priority 3: Abuse protection

### 6. Add rate limits to listing creation and review submission
Recommended env vars:
- `LISTING_RATE_WINDOW_MS`
- `LISTING_RATE_MAX`
- `REVIEW_RATE_WINDOW_MS`
- `REVIEW_RATE_MAX`

Apply to:
- `POST /api/listings`
- `POST /api/listings/:id/reviews`

### 7. Add request logging and structured error logging
Recommended goals:
- request method, path, response code, duration
- application errors written in a consistent structured format
- avoid logging raw passwords or full secrets

## Priority 4: Operations and QA

### 8. Add automated tests
Suggested baseline tests:
- health check returns 200
- signup success and duplicate email rejection
- login success and bad password rejection
- listing submission validation
- admin approval flow
- review submission validation

Suggested tooling:
- Node test runner, Jest, or Vitest
- Supertest for API integration tests
- separate test database file

### 9. Refresh deployment docs
The codebase now includes features not fully reflected in the deployment guide. Update docs so operators know the current state:
- admin listing moderation
- review moderation
- featured listings
- owner dashboard listings
- audit logs

## Recommended environment variables
```env
NODE_ENV=production
JWT_SECRET=use-a-long-random-secret
ADMIN_EMAIL=etib@eventhoughimblind.com
ALLOWED_ORIGINS=https://yourdomain.com,https://www.yourdomain.com
AUTH_RATE_WINDOW_MS=900000
AUTH_RATE_MAX=10
LISTING_RATE_WINDOW_MS=900000
LISTING_RATE_MAX=10
REVIEW_RATE_WINDOW_MS=900000
REVIEW_RATE_MAX=10
SMTP_HOST=
SMTP_PORT=587
SMTP_SECURE=false
SMTP_USER=
SMTP_PASS=
SMTP_FROM="ETIB Community Connect <no-reply@eventhoughimblind.com>"
```

## Safe rollout order
1. Confirm Render persistent disk mount path and database file path.
2. Add required production environment variables.
3. Add code changes for JWT and CORS.
4. Add rate limits for listing and review submissions.
5. Add owner edit and resubmit flow.
6. Add password reset flow.
7. Run tests.
8. Deploy to Render and verify health check.
9. Test signup, login, listing submit, moderation, owner dashboard, and review flow.

## Render verification after deploy
- `/api/health` returns `{ ok: true }`
- existing records remain present after restart
- new listings persist after redeploy
- admin email notifications still send if SMTP is configured
- CORS works only from approved web origins

## Professional recommendation
The current app is beyond a starter. It should now be treated as an early production service and hardened accordingly. The safest immediate code changes are:
- require a real JWT secret in production
- restrict CORS to approved origins
- add rate limiting to listing and review submissions
- add owner edit and resubmit flow
- refresh docs and ops checklists
