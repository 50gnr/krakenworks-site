import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {parseRuleEnvelope} from './rule-envelope.mjs';

const html = fs.readFileSync(new URL('./index.html', import.meta.url), 'utf8');
const script = fs.readFileSync(new URL('./app.js', import.meta.url), 'utf8');
const markdown = fs.readFileSync(new URL('./rule-markdown.mjs', import.meta.url), 'utf8');

test('production uses the reviewed HTTPS API and Turnstile widget', () => {
  assert.match(html, /<meta name="rules-bot-api" content="https:\/\/dungeon\.tail804ca5\.ts\.net\/v1\/ask">/);
  assert.match(html, /<meta name="rules-bot-turnstile-site-key" content="0x4AAAAAAFAJtiya_cczPYNt">/);
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
test('complete rule envelopes render as safe cards without duplicate citation excerpts', () => {
  assert.match(script, /import \{parseRuleEnvelope\} from "\.\/rule-envelope\.mjs"/);
  assert.match(script, /import \{renderRuleMarkdown, renderProvenanceLines, provenanceSummary\} from "\.\/rule-markdown\.mjs"/);
  assert.match(script, /document\.createElement\("article"\)/);
  assert.match(script, /buildDetails\("rule-provenance", provenanceSummary\(envelope\.provenance\)/);
  // Sources only disappear once the complete envelope parsed; otherwise they
  // stay visible as the only evidence the reader has.
  assert.match(script, /citationsWrap\.hidden = citations\.length === 0 \|\| Boolean\(envelope\)/);
  assert.match(html, /<div class="answer-text" id="answer-text"><\/div>/);
});
test('rendering never routes rule text through HTML parsing', () => {
  for (const source of [script, markdown]) {
    assert.doesNotMatch(source, /innerHTML|outerHTML|insertAdjacentHTML|DOMParser|document\.write/);
  }
  assert.match(markdown, /createTextNode/);
});
test('the formatted cards keep the complete verbatim response available', () => {
  assert.match(script, /renderRuleEnvelope\(envelope, text\)/);
  assert.match(script, /buildDetails\("rule-raw", "Exact text as returned"/);
  assert.match(script, /pre\.textContent = rawText/);
  // The raw block must show the response as received, never a re-serialised copy.
  assert.doesNotMatch(script, /rawText\.(?:slice|substring|replace|trim)/);
});
test('clarification and error text still renders when no envelope is present', () => {
  assert.match(script, /answerText\.textContent = text/);
  assert.match(script, /answerKind\.classList\.toggle\("notice-error", isError\)/);
  assert.match(script, /showAnswer\("Service unavailable"/);
  assert.match(script, /showAnswer\("Bot check required"/);
});
test('anchors built from rule text are restricted to http and https', () => {
  assert.match(markdown, /scheme === "http:" \|\| scheme === "https:"/);
  assert.match(markdown, /link\.setAttribute\("rel", "noopener noreferrer"\)/);
  assert.doesNotMatch(markdown, /javascript:/i);
});
test('structured clarification choices render as Turnstile-aware submit buttons', () => {
  assert.match(html, /id="answer-choices"/);
  assert.match(script, /typeof choice\.label === "string"/);
  assert.match(script, /typeof choice\.question === "string"/);
  assert.match(script, /question\.value = choice\.question/);
  assert.match(script, /form\.requestSubmit\(\)/);
  assert.match(script, /updateChoiceButtons\(\)/);
  assert.doesNotMatch(script, /choice\.innerHTML/);
});
test('rule envelope parser accepts complete RAW and rejects malformed envelopes', () => {
  const complete = [
    'Fireball',
    '# Fireball\n\nA complete rule body.',
    'Source: System Reference Document 5.2.1',
    '',
    'Package provenance: System Reference Document 5.2.1; retrieved 2026-09-22; https://www.dndbeyond.com/srd',
    'License: CC-BY-4.0; https://creativecommons.org/licenses/by/4.0/',
    'Attribution: Licensed SRD material.',
  ].join('\n');
  const parsed = parseRuleEnvelope(complete);
  assert.equal(parsed?.entries.length, 1);
  assert.equal(parsed?.entries[0].body, 'A complete rule body.');

  for (const malformed of [
    'Rule\n\nSource: SRD\n\nPackage provenance:',
    'Rule\nBody\nSource: SRD\n\nPackage provenance: SRD',
    'Rule\nBody\nSource: SRD\n\nPackage provenance: SRD\nLicense: CC-BY-4.0',
    'Rule\nBody\nSource: SRD\n\nPackage provenance: SRD\nLicense: CC-BY-4.0\nAttribution:',
  ]) assert.equal(parseRuleEnvelope(malformed), null);
});
test('public copy promises complete RAW retrieval without AI adjudication', () => {
  assert.match(html, /Complete SRD rules, without truncation/);
  assert.match(html, /No AI opinion or invented adjudication/);
  assert.match(script, /evidence: "Rules as written"/);
});
