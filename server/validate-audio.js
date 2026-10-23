import fs from "node:fs";
import path from "node:path";
import { createHash } from "node:crypto";
import { fileURLToPath } from "node:url";
import { activeBusinesses, loadCatalog } from "./directory-data.js";

export const directoryVoice = "en_US-ljspeech-high";
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

export function validateAudio(catalog, manifest, publicDir) {
  if (manifest.voice !== directoryVoice) throw new Error(`Directory narration must use ${directoryVoice}.`);
  const entries = new Map(manifest.listings.map(entry => [entry.id, entry]));
  for (const business of activeBusinesses(catalog)) {
    const audio = business.descriptionAudio;
    const entry = entries.get(business.id);
    const fail = () => { throw new Error(`Missing, stale, or incorrect voice audio for ${business.id}. Run scripts/generate-directory-audio.py.`); };
    if (!audio || audio.text !== business.description || !entry) fail();
    if (!new RegExp(`^/audio/${business.id}-piper-lj-[a-z0-9]+\\.mp3$`).test(audio.url) || entry.url !== audio.url) fail();
    const file = path.join(publicDir, audio.url.slice(1));
    if (!fs.existsSync(file) || fs.statSync(file).size < 1000 || !(entry.duration > 0)) fail();
    const hash = createHash("sha256").update(fs.readFileSync(file)).digest("hex");
    if (hash !== entry.sha256) fail();
  }
  return activeBusinesses(catalog).length;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const manifest = JSON.parse(fs.readFileSync(path.join(root, "server/data/narration-manifest.json"), "utf8"));
  const count = validateAudio(loadCatalog(), manifest, path.join(root, "public"));
  console.log(`Same-voice audio verified for ${count} active listings.`);
}
