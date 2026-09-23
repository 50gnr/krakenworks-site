import assert from "node:assert/strict";
import { stat, readFile } from "node:fs/promises";
import test from "node:test";

const playRoot = new URL("./play/", import.meta.url);
const playHtml = await readFile(new URL("index.html", playRoot), "utf8");
const landingHtml = await readFile(new URL("./index.html", import.meta.url), "utf8");
const homeHtml = await readFile(new URL("../index.html", import.meta.url), "utf8");

const requiredAssets = [
  "Build/WebGL.data",
  "Build/WebGL.framework.js",
  "Build/WebGL.loader.js",
  "Build/WebGL.wasm"
];

test("browser player ships every referenced Unity asset", async () => {
  let total = 0;
  for (const relativePath of requiredAssets) {
    const info = await stat(new URL(relativePath, playRoot));
    assert.equal(info.isFile(), true, relativePath);
    assert.ok(info.size > 0, `${relativePath} must not be empty`);
    assert.ok(info.size < 100 * 1024 * 1024, `${relativePath} exceeds GitHub's 100 MB file limit`);
    assert.match(playHtml, new RegExp(relativePath.split("/").at(-1).replace(".", "\\.")));
    total += info.size;
  }
  assert.ok(total < 50 * 1024 * 1024, "browser payload unexpectedly exceeds 50 MB");
});

test("player is portrait-first and persists saves locally", () => {
  assert.match(playHtml, /width="480" height="960"/);
  assert.match(playHtml, /aspect-ratio:\s*1\s*\/\s*2/);
  assert.match(playHtml, /autoSyncPersistentDataPath:\s*true/);
  assert.match(playHtml, /No account or analytics/);
});

test("runtime messages use text nodes rather than HTML injection", () => {
  assert.doesNotMatch(playHtml, /\.innerHTML\s*=/);
  assert.match(playHtml, /notice\.textContent\s*=/);
});

test("Dungeon Inc landing page links to browser play", () => {
  assert.match(landingHtml, /href="play\/"[^>]*>Play in your browser</);
  assert.match(landingHtml, /Browser trial v0\.2\.20/);
  assert.match(landingHtml, /Clearing site data removes that browser save/);
});

test("Krakenworks routes stay connected across the game surfaces", () => {
  assert.match(homeHtml, /href="downloads\/DungeonInc-Defence-0\.2\.19\.apk"[^>]*download[^>]*>Download the APK/);
  assert.match(homeHtml, /href="dungeons-inc\/play\/"[^>]*>Play live in your browser/);
  assert.match(landingHtml, /href="\.\.\/rules-bot\/"[^>]*>Rules Bot/);
  assert.match(playHtml, /class="site-header play-site-header"/);
  assert.match(playHtml, /href="\.\.\/\.\.\/rules-bot\/"[^>]*>Rules Bot/);
  assert.match(playHtml, /href="\.\.\/\.\.\/privacy\/"[^>]*>Privacy/);
});

test("playtest walkthrough and privacy-minimal report queue stay visible", () => {
  assert.match(playHtml, /Your first shift/);
  assert.match(playHtml, /Found a crack—or a cool idea/);
  assert.match(playHtml, /<textarea[^>]+maxlength="1200"[^>]+required/);
  assert.match(playHtml, /id="feedback-category"[^>]+required/);
  assert.match(playHtml, /id="feedback-severity"[^>]+required/);
  assert.match(playHtml, /id="feedback-consent"[^>]+required/);
  assert.match(playHtml, /name="playtest-feedback-api" content="https:\/\/dungeon\.tail804ca5\.ts\.net\/v1\/playtest-feedback"/);
  assert.match(playHtml, /turnstileToken: feedbackTurnstileToken/);
  assert.match(playHtml, /telemetryConsent: true/);
  assert.match(playHtml, /await fetch\(feedbackApi/);
  assert.doesNotMatch(playHtml, /type="email"/);
  assert.doesNotMatch(playHtml, /type="text"[^>]+name="(?:name|email)"/);
  assert.doesNotMatch(playHtml, /mailto:admin@krakenworks\.app/);
});
