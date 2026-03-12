# ETIB Community Connect Directory (Production-Ready Starter)

Full-stack accessibility-first directory for ETIB.

## Stack
- Front end: HTML/CSS/Vanilla JS (`public/`)
- Back end: Node.js + Express (`server/`)
- Database: SQLite (`server/etib.db`)
- Auth: JWT + bcrypt

## Features wired
- Sign up (`/api/auth/signup`)
- Login (`/api/auth/login`)
- Create listing (authenticated) (`/api/listings`)
- Search/list approved listings (`/api/listings`)
- Get listing by id (`/api/listings/:id`)
- Health check (`/api/health`)

## Local setup
```bash
cd server
cp .env.example .env
# set JWT_SECRET
npm install
npm start
```
Then open `http://localhost:8080`

## Deploy
See `DEPLOYMENT.md` and `render.yaml`.

## Accessibility notes
- Skip links and semantic structure in templates
- Form labels and status messaging present
- Keyboard focus flow preserved

## Known production caveat
SQLite on ephemeral hosting can lose data. For true production, move to managed Postgres.
