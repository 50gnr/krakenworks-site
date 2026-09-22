import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const html = fs.readFileSync(new URL('./index.html', import.meta.url), 'utf8');
const script = fs.readFileSync(new URL('./app.js', import.meta.url), 'utf8');

test('production API endpoint remains blank', () => {
  assert.match(html, /<meta name="rules-bot-api" content="">/);
  assert.match(html, /<meta name="rules-bot-turnstile-site-key" content="">/);
});
test('question requests carry the fixed system and explicit telemetry consent', () => {
  assert.match(script, /system: "dnd-2024", telemetryConsent: consented, turnstileToken/);
  assert.match(html, /id="telemetry-consent"/);
});
test('public questions require a fresh Cloudflare Turnstile token', () => {
  assert.match(script, /challenges\.cloudflare\.com\/turnstile\/v0\/api\.js/);
  assert.match(script, /if \(turnstileSiteKey && !turnstileToken\)/);
  assert.match(script, /turnstile\?\.reset\(turnstileWidgetId\)/);
  assert.match(html, /id="turnstile-widget"/);
});
test('bad-answer reporting is tied to response ID without free-text collection', () => {
  assert.match(script, /responseId: activeResponse\.id, feedback: "bad-answer"/);
  assert.match(script, /querySelectorAll\("\.example-list \.example-button"\)/);
  assert.match(html, /id="report-answer"/);
  assert.doesNotMatch(html, /name="(?:name|email|feedback-text)"/);
});
test('fetch flow has no automatic retry', () => {
  assert.equal((script.match(/fetch\(/g) || []).length, 2);
  assert.doesNotMatch(script, /setTimeout|retry/i);
});
