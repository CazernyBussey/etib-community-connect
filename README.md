# ETIB Community Connect Directory

An accessibility-first business directory from Even Though I'm Blind, Inc. It connects blind and visually impaired community members with blind-owned, visually impaired-owned, and accessibility-focused businesses.

## What works

- Searchable, filterable, paginated public directory and featured placements
- Detailed business profiles with direct contact options and optional spoken summaries
- Account signup, sign-in, sign-out, and one-time password reset links
- Authenticated business submission and owner editing
- Owner dashboard with account status, listing status, and moderation notes
- Admin dashboards for user, listing, review, and featured-placement moderation
- Review submission and approval workflow
- Email notifications when SMTP is configured
- Persistent SQLite storage on the attached Render disk

## Accessibility

The interface is designed toward WCAG 2.2 AA and includes:

- Semantic landmarks, one clear page heading, skip links, and logical heading order
- Explicit form labels, native constraints, accessible error/status announcements, and password visibility controls
- Strong keyboard focus, 44-pixel controls, high-contrast colors, forced-colors support, and reduced-motion support
- Named actions in repeated tables and cards, keyboard-accessible data tables, and an accessible admin confirmation dialog
- Screen-reader-friendly filtering, pagination, loading states, and account/moderation status
- Optional browser speech playback that supplements rather than replaces readable text

Automated accessibility guardrails run with the test suite. Manual testing with current screen readers and real users should remain part of every release.

## Technology

- Front end: semantic HTML, CSS, and vanilla JavaScript in `public/`
- Server: Node.js 24 and Express 5 in `server/`
- Database: Node's built-in SQLite support
- Security: Helmet headers, same-origin APIs, rate limits, bcrypt password hashes, expiring JWTs, and single-use hashed reset tokens

## Local development

```bash
cd server
cp .env.example .env
# Replace JWT_SECRET with a long random value.
npm ci
npm start
```

Open `http://localhost:8080`.

For working email notifications and password reset delivery, configure the SMTP variables documented in `.env.example`.

Create or rotate the administrator account only from a trusted server shell:

```bash
cd server
npm run create-admin
```

The command uses `ADMIN_EMAIL`, `ADMIN_NAME`, and `ADMIN_PHONE`, then prints a generated temporary password once. Sign in immediately and replace it. Registering the configured email through the public form never grants administrator access.

## Verification

```bash
cd server
npm test
npm audit --omit=dev
```

The end-to-end suite starts an isolated server and verifies signup, authentication, listing submission and approval, featured placement, reviews, owner editing, password reset, account moderation, security headers, and not-found behavior.

## Deployment

Render configuration is in `render.yaml`; detailed release and environment instructions are in [DEPLOYMENT.md](DEPLOYMENT.md).
