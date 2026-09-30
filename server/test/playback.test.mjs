import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";
import test from "node:test";

function playbackHarness() {
  const source = fs.readFileSync(new URL("../../public/script.js", import.meta.url), "utf8");
  const audioInstances = [];
  class Audio {
    constructor(url) { this.url = url; audioInstances.push(this); }
    play() { return Promise.resolve(); }
    pause() { this.paused = true; }
  }
  const context = vm.createContext({Audio, speechSupported: false,
    statusMessage(node, message) { node.textContent = message; }});
  const start = source.indexOf("  let activeAudio = null;");
  const end = source.indexOf("  function quickContactActionLinks", start);
  vm.runInContext(source.slice(start, end), context);
  return {context, audioInstances};
}

test("recorded descriptions play without a browser speech voice and can be stopped", async () => {
  const {context, audioInstances} = playbackHarness();
  const status = {}, stop = {hidden: true};
  context.startSpeech("Full description", "ETIB", status, stop, {audioUrl: "/audio/etib.mp3"});
  await Promise.resolve();
  assert.equal(audioInstances[0].url, "/audio/etib.mp3");
  assert.equal(status.textContent, "Playing description for ETIB.");
  assert.equal(stop.hidden, false);
  context.stopSpeech(status, stop);
  assert.equal(audioInstances[0].paused, true);
  assert.equal(stop.hidden, true);
});

test("switching listings cancels old audio and ignores its delayed start", async () => {
  const {context, audioInstances} = playbackHarness();
  const status = {};
  context.startSpeech("First", "First", status, null, {audioUrl: "/audio/first.mp3"});
  context.startSpeech("Second", "Second", status, null, {audioUrl: "/audio/second.mp3"});
  await Promise.resolve();
  assert.equal(audioInstances[0].paused, true);
  assert.equal(status.textContent, "Playing description for Second.");
  audioInstances[1].onended();
  assert.equal(status.textContent, "");
});
