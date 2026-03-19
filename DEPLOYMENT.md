# ETIB Community Connect – Deployment Guide

## What this includes
- Frontend: static pages in `public/`
- Backend: Node + Express + SQLite in `server/`
- Auth + listing submission + listing search APIs wired

## Local run
```bash
cd server
cp .env.example .env
# set JWT_SECRET to a long random value
npm install
npm start
```
Open: `http://localhost:8080`

## Render deploy (recommended for now)
1. Push this folder to GitHub as its own repo.
2. In Render, create **New Web Service** from that repo.
3. Render will detect `render.yaml`.
4. Set env vars:
   - `JWT_SECRET` (or leave auto-generated from render.yaml)
   - `ADMIN_EMAIL` = `etib@eventhoughimblind.com`
5. Deploy.

## Important notes
- SQLite is file-based. On free/ephemeral hosts, data may reset on redeploy/restart.
- For production durability, migrate to Postgres (next phase).

## Immediate post-deploy checks
- `/api/health` returns `{ ok: true }`
- Sign up new owner account
- Sign in
- Submit listing from Add Business page
- Verify listing appears only after manual status update in DB/admin workflow

## Suggested next production upgrade
- Add admin moderation APIs (approve/reject)
- Add owner dashboard APIs
- Move DB to Postgres
- Add rate limiting + password reset flow
