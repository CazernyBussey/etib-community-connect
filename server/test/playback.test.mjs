import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";
import test from "node:test";

function playbackHarness({ supported = true, voices = [] } = {}) {
  const source = fs.readFileSync(new URL("../../public/script.js", import.meta.url), "utf8");
  const utterances = [], timers = new Map();
  let nextTimer = 0, cancellations = 0;
  class SpeechSynthesisUtterance { constructor(text) { this.text = text; } }
  const synth = {
    paused: false,
    getVoices: () => voices,
    speak(utterance) { utterances.push(utterance); },
    cancel() { cancellations++; },
    resume() { this.paused = false; }
  };
  const context = vm.createContext({
    window: { speechSynthesis: synth }, speechSupported: supported, SpeechSynthesisUtterance,
    setTimeout(fn) { timers.set(++nextTimer, fn); return nextTimer; },
    clearTimeout(id) { timers.delete(id); },
    statusMessage(node, message) { node.textContent = message; }
  });
  const start = source.indexOf("  let activeAudio = null;");
  const end = source.indexOf("  function quickContactActionLinks", start);
  vm.runInContext(source.slice(start, end), context);
  return { context, utterances, synth, timers, get cancellations() { return cancellations; } };
}

test("starts device speech immediately even before voices populate", () => {
  const h = playbackHarness(), status = {}, stop = { hidden: true };
  h.context.startSpeech("Full description", "PRRF", status, stop);
  assert.equal(h.utterances[0].text, "Full description");
  assert.equal(h.utterances[0].lang, "en-US");
  assert.equal(stop.hidden, false);
  h.utterances[0].onstart();
  assert.equal(h.timers.size, 0);
  h.context.stopSpeech(status, stop);
  assert.equal(stop.hidden, true);
  assert.equal(status.textContent, "Spoken playback stopped.");
});

test("reads the full long description in short chunks with the local English voice", () => {
  const voice = { lang: "en-US", localService: true, default: true };
  const h = playbackHarness({ voices: [voice] }), status = {};
  const text = Array.from({length: 140}, (_, i) => `word${i}`).join(" ");
  let finishes = 0;
  h.context.startSpeech(text, "Through Our Eyes", status, null, {onFinish() { finishes++; }});
  for (let i = 0; i < h.utterances.length; i++) {
    const u = h.utterances[i];
    assert.ok(u.text.length <= 220);
    assert.equal(u.voice, voice);
    u.onstart(); u.onend();
  }
  assert.equal(h.utterances.map(u => u.text).join(" "), text);
  assert.equal(finishes, 1);
  assert.equal(status.textContent, "");
});

test("stop and switching listings prevent delayed callbacks from restarting speech", () => {
  const h = playbackHarness(), status = {};
  h.context.startSpeech("First ".repeat(100), "First", status);
  const delayedEnd = h.utterances[0].onend;
  h.context.startSpeech("Second", "Second", status);
  delayedEnd();
  assert.equal(h.utterances.length, 2);
  assert.match(status.textContent, /Second/);
  h.context.stopSpeech(status);
  assert.equal(h.utterances[1].onend, null);
  assert.equal(h.timers.size, 0);
});

test("unsupported speech and device startup failures reset playback controls", () => {
  const unsupported = playbackHarness({supported: false}), status = {}, stop = {hidden: true};
  unsupported.context.startSpeech("Description", "PRRF", status, stop);
  assert.match(status.textContent, /not supported/);
  const h = playbackHarness();
  let finishes = 0;
  h.context.startSpeech("Description", "PRRF", status, stop, {onFinish() { finishes++; }});
  [...h.timers.values()][0]();
  assert.match(status.textContent, /did not start/);
  assert.equal(stop.hidden, true);
  assert.equal(finishes, 1);
});

test("hosted audio plays without device speech and Stop cancels playback", async () => {
  const h = playbackHarness({supported: false}), status = {}, stop = {hidden: true};
  let pauses = 0;
  const player = {
    currentTime: 17, play() { this.onplaying(); return Promise.resolve(); },
    pause() { pauses++; }
  };
  h.context.startSpeech("Description", "PRRF", status, stop, {audioElement: player});
  assert.match(status.textContent, /Playing description for PRRF/);
  assert.equal(player.currentTime, 0);
  assert.equal(stop.hidden, false);
  h.context.stopSpeech(status, stop);
  assert.equal(pauses, 1);
  assert.equal(stop.hidden, true);
  assert.equal(h.utterances.length, 0);
});
test("audio rejection gives an actionable alternative and clears controls", async () => {
  const h = playbackHarness({supported: false}), status = {}, stop = {hidden: true};
  let finished = 0;
  const player = {currentTime: 0, play() {return Promise.reject(new Error("blocked"));}, pause() {}};
  h.context.startSpeech("Description", "PRRF", status, stop, {audioElement: player, onFinish() {finished++;}});
  await Promise.resolve();
  assert.match(status.textContent, /Open description audio link/);
  assert.equal(stop.hidden, true);
  assert.equal(finished, 1);
});
test("recordings are only used when they match the current description", () => {
  const {context} = playbackHarness();
  assert.equal(context.descriptionAudioUrl({description:"New",descriptionAudio:{text:"Old",url:"/audio/test.mp3"}}),null);
  assert.equal(context.descriptionAudioUrl({description:"New",descriptionAudio:{text:"New",url:"/audio/test.mp3"}}),"/audio/test.mp3");
  assert.equal(context.descriptionAudioUrl({descriptionAudio:"https://external.example/audio.mp3"}),null);
});
