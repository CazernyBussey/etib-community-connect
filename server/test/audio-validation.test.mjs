import assert from "node:assert/strict";
import test from "node:test";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { createHash } from "node:crypto";
import { validateAudio, directoryVoice } from "../validate-audio.js";

test("publication rejects missing, stale, mixed-voice and corrupted narration", () => {
  const publicDir = fs.mkdtempSync(path.join(os.tmpdir(), "etib-audio-test-"));
  try {
    fs.mkdirSync(path.join(publicDir, "audio"));
    const bytes = Buffer.alloc(1200, 42);
    const url = "/audio/example-piper-lj-123.mp3";
    fs.writeFileSync(path.join(publicDir, url.slice(1)), bytes);
    const business = { id: "example", status: "active", description: "An organization.", descriptionAudio: { url, text: "An organization." } };
    const catalog = { businesses: [business] };
    const manifest = { voice: directoryVoice, listings: [{id: "example", url, duration: 3, sha256: createHash("sha256").update(bytes).digest("hex")}] };
    assert.equal(validateAudio(catalog, manifest, publicDir), 1);
    const changed = structuredClone(catalog);
    changed.businesses[0].description = "Updated information.";
    assert.throws(() => validateAudio(changed, manifest, publicDir), /stale/);
    changed.businesses.push({id: "new-listing", status: "active", description: "New."});
    changed.businesses.shift();
    assert.throws(() => validateAudio(changed, manifest, publicDir), /new-listing/);
    assert.throws(() => validateAudio(catalog, {...manifest, voice: "another-voice"}, publicDir), /must use/);
    const mixed = structuredClone(catalog);
    mixed.businesses[0].descriptionAudio.url = "/audio/example-elevenlabs.mp3";
    assert.throws(() => validateAudio(mixed, manifest, publicDir), /incorrect voice/);
    fs.writeFileSync(path.join(publicDir, url.slice(1)), Buffer.alloc(1200, 43));
    assert.throws(() => validateAudio(catalog, manifest, publicDir), /incorrect voice/);
    fs.unlinkSync(path.join(publicDir, url.slice(1)));
    assert.throws(() => validateAudio(catalog, manifest, publicDir), /Missing/);
  } finally {
    fs.rmSync(publicDir, { recursive: true, force: true });
  }
});
