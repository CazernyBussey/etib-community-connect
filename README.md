# ETIB Community Connect Directory

An accessibility-first, read-only business search service from Even Though I'm Blind, Inc.

Public visitors can search verified businesses, review complete profiles, use optional spoken summaries, and contact businesses directly. They cannot create accounts, upload listings, edit records, or submit reviews.

## Source of truth

All public business information lives in:

`server/data/businesses.json`

ETIB gathers and verifies the information, updates that file through GitHub, and publishes the change through the normal review and deployment process. The server validates the complete catalog before it starts.

Use these supporting files:

- `BUSINESS-INTAKE-GUIDE.md`: internal questions and verification workflow
- `server/data/business-template.json`: copyable record structure
- `server/directory-data.js`: validation, filtering, sorting, and lookup rules

## Public features

- A clean, one-business-at-a-time directory view
- Previous, Hear Preview, and Next controls grouped together
- Keyword search across names, services, descriptions, accessibility details, and locations
- Search results that open directly in the same focused business view
- Immediate Call, Email, Text, and More Information actions when available
- Seamless wraparound browsing across all matching businesses without exposing technical result pages
- Detailed profiles with services, blind-community support, accessibility, location, hours, languages, and direct contact options
- Matching audio descriptions in one free Piper female voice for every listing
- Legacy listing ID redirects through the read-only detail API

## Read-only controls

- The server exposes only `GET` and `HEAD` API operations
- All API write methods return `405 Method Not Allowed`
- Signup, sign-in, owner, admin, submission, password-reset, moderation, and review pages and routes have been removed
- No production database, password, JWT, or SMTP configuration is required

## Accessibility

The interface is designed toward WCAG 2.2 AA with semantic landmarks, one clear page heading, explicit form labels, status announcements, strong focus, 44-pixel controls, high contrast, forced-colors support, reduced-motion support, keyboard operation, and screen-reader-friendly results.

Automated guardrails run with the test suite. Manual keyboard, zoom, forced-colors, and current screen-reader testing should remain part of every release.

## Local development

```bash
cd server
npm ci
npm start
```

Open `http://localhost:8080`.

## Add or update a business

1. Follow `BUSINESS-INTAKE-GUIDE.md`.
2. Add or update the record in `server/data/businesses.json`.
3. Update `catalogUpdated` and the business `lastVerified` date.
4. New or changed descriptions are narrated automatically by `.github/workflows/directory-audio.yml` after a catalog update reaches main. The fixed voice is `en_US-ljspeech-high` (Piper, public-domain LJ Speech dataset). The workflow commits generated MP3s, matching text, and checksums together. No ElevenLabs credits or API keys are needed. Deploy startup and data validation reject missing, stale, changed, or different-voice audio. Wait for the narration commit and successful deployment before announcing a listing as live.

   To generate before publishing, install `piper-tts==1.8.0` and FFmpeg, then run `python scripts/generate-directory-audio.py` from the repository root. Existing valid recordings are reused. Model checksums are pinned so a replacement model cannot silently change the voice.

5. Run:

   ```bash
   cd server
   npm test
   npm audit --omit=dev
   ```

6. Publish the reviewed change through GitHub. If another catalog update wins the race while the narration job is running, its push fails safely and the queued run generates against the latest main branch.

## Deployment

Render configuration is in `render.yaml`. See `DEPLOYMENT.md` for release and rollback instructions.
