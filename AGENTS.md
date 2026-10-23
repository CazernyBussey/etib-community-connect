# Directory narration

Every active business and media listing must have its full description narrated
with the fixed free female Piper voice `en_US-ljspeech-high`. Do not replace this
with ElevenLabs, browser speech, or another model unless Cazerny requests it.

After adding a listing or changing a description, run
`python scripts/generate-directory-audio.py` using `piper-tts==1.8.0` and FFmpeg.
Commit the catalog, matching MP3s, and narration manifest together. Alternatively,
the directory narration workflow generates missing or stale recordings after a
catalog update reaches main. Wait for its successful run and deployment before
announcing a new listing as live. Existing recordings are reused when valid.

Run `node server/validate-audio.js` and the relevant tests. Startup rejects audio
that is absent, out of date, corrupted, or inconsistent with the fixed voice.
Preserve all unrelated catalog fields. Never publish temporary test listings.
