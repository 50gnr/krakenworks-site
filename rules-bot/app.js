import {parseRuleEnvelope} from "./rule-envelope.mjs";

const form = document.querySelector("#rules-form");
const question = document.querySelector("#question");
const count = document.querySelector("#character-count");
const button = document.querySelector("#ask-button");
const panel = document.querySelector("#answer-panel");
const answerKind = document.querySelector("#answer-kind");
const answerText = document.querySelector("#answer-text");
const citationsWrap = document.querySelector("#citations-wrap");
const citationList = document.querySelector("#citation-list");
const serviceStatus = document.querySelector("#service-status");
const telemetryConsent = document.querySelector("#telemetry-consent");
const feedbackWrap = document.querySelector("#feedback-wrap");
const feedbackButton = document.querySelector("#report-answer");
const feedbackStatus = document.querySelector("#feedback-status");
const apiEndpoint = document.querySelector('meta[name="rules-bot-api"]')?.content.trim();
const turnstileSiteKey = document.querySelector('meta[name="rules-bot-turnstile-site-key"]')?.content.trim();
const turnstileWrap = document.querySelector("#turnstile-wrap");

let activeResponse = null;
let turnstileToken = "";
let turnstileWidgetId = null;

function setStatus(message, online = false) {
  serviceStatus.replaceChildren();
  const dot = document.createElement("span");
  dot.className = `status-dot${online ? "" : " offline"}`;
  serviceStatus.append(dot, document.createTextNode(message));
}

function appendInlineRuleText(target, text) {
  const token = /(_\*\*[^*]+\*\*_|\*\*[^*]+\*\*|_[^_]+_|`[^`]+`)/g;
  let cursor = 0;
  for (const match of text.matchAll(token)) {
    target.append(document.createTextNode(text.slice(cursor, match.index)));
    const value = match[0];
    const nestedStrong = value.startsWith("_**");
    const element = document.createElement(value.startsWith("**") ? "strong" : value.startsWith("_") ? "em" : "code");
    if (nestedStrong) {
      const strong = document.createElement("strong");
      strong.textContent = value.slice(3, -3);
      element.append(strong);
    } else element.textContent = value.startsWith("**") ? value.slice(2, -2) : value.slice(1, -1);
    target.append(element);
    cursor = match.index + value.length;
  }
  target.append(document.createTextNode(text.slice(cursor)));
}

function renderRuleMarkdown(target, markdown) {
  let paragraph = [];
  let list = null;
  const flushParagraph = () => {
    if (!paragraph.length) return;
    const element = document.createElement("p");
    appendInlineRuleText(element, paragraph.join(" "));
    target.append(element);
    paragraph = [];
  };
  const closeList = () => { list = null; };

  for (const rawLine of markdown.split("\n")) {
    const line = rawLine.trim();
    if (!line) {
      flushParagraph();
      closeList();
      continue;
    }
    const heading = line.match(/^(#{1,4})\s+(.+)$/);
    if (heading) {
      flushParagraph();
      closeList();
      const element = document.createElement("h3");
      appendInlineRuleText(element, heading[2]);
      target.append(element);
      continue;
    }
    if (line.startsWith("- ")) {
      flushParagraph();
      if (!list) {
        list = document.createElement("ul");
        target.append(list);
      }
      const item = document.createElement("li");
      appendInlineRuleText(item, line.slice(2));
      list.append(item);
      continue;
    }
    closeList();
    paragraph.push(line);
  }
  flushParagraph();
}

function renderRuleEnvelope(envelope) {
  answerText.replaceChildren();
  answerText.classList.add("rule-results");
  for (const entry of envelope.entries) {
    const card = document.createElement("article");
    card.className = "rule-card";
    const title = document.createElement("h2");
    title.textContent = entry.title;
    const body = document.createElement("div");
    body.className = "rule-body";
    renderRuleMarkdown(body, entry.body);
    const source = document.createElement("p");
    source.className = "rule-source";
    source.textContent = entry.source;
    card.append(title, body, source);
    answerText.append(card);
  }
  const details = document.createElement("details");
  details.className = "rule-provenance";
  const summary = document.createElement("summary");
  summary.textContent = "Source, license, and attribution";
  const content = document.createElement("div");
  renderRuleMarkdown(content, envelope.provenance);
  details.append(summary, content);
  answerText.append(details);
}

function showAnswer(kind, text, citations = [], isError = false) {
  answerKind.textContent = kind;
  answerKind.classList.toggle("notice-error", isError);
  answerText.classList.remove("rule-results");
  const envelope = !isError ? parseRuleEnvelope(text) : null;
  if (envelope) renderRuleEnvelope(envelope);
  else {
    answerText.replaceChildren();
    answerText.textContent = text;
  }
  citationList.replaceChildren();
  for (const citation of citations) {
    const item = document.createElement("li");
    const quote = document.createElement("span");
    const source = document.createElement("cite");
    quote.textContent = citation.quote || citation.text || "";
    source.textContent = citation.source || citation.title || "Source";
    item.append(quote, source);
    citationList.append(item);
  }
  citationsWrap.hidden = citations.length === 0 || Boolean(envelope);
  panel.hidden = false;
}

function feedbackEndpoint() {
  if (!apiEndpoint) return "";
  try {
    const url = new URL(apiEndpoint, window.location.href);
    url.pathname = url.pathname.replace(/\/ask\/?$/, "/feedback");
    return url.toString();
  } catch {
    return "";
  }
}

question.addEventListener("input", () => { count.textContent = String(question.value.length); });
for (const example of document.querySelectorAll(".example-list .example-button")) {
  example.addEventListener("click", () => {
    question.value = example.textContent;
    count.textContent = String(question.value.length);
    question.focus();
  });
}
if (apiEndpoint) setStatus("Live beta API connected", true);
if (turnstileSiteKey) {
  turnstileWrap.hidden = false;
  window.rulesBotTurnstileReady = () => {
    turnstileWidgetId = window.turnstile.render("#turnstile-widget", {
      sitekey: turnstileSiteKey,
      callback: token => { turnstileToken = token; },
      "expired-callback": () => { turnstileToken = ""; },
      "error-callback": () => { turnstileToken = ""; },
    });
  };
  const script = document.createElement("script");
  script.src = "https://challenges.cloudflare.com/turnstile/v0/api.js?onload=rulesBotTurnstileReady&render=explicit";
  script.async = true;
  script.defer = true;
  document.head.append(script);
}

form.addEventListener("submit", async event => {
  event.preventDefault();
  const value = question.value.trim();
  if (!value) return;
  activeResponse = null;
  feedbackWrap.hidden = true;
  feedbackStatus.textContent = "";

  if (!apiEndpoint) {
    showAnswer("Beta not connected", "The question interface is ready, but the rules service endpoint is intentionally blank. Connect a reviewed local or HTTPS API before using the live beta.", [], true);
    return;
  }
  if (turnstileSiteKey && !turnstileToken) {
    showAnswer("Bot check required", "Complete the anti-bot check, then ask again.", [], true);
    return;
  }

  button.disabled = true;
  button.textContent = "Checking the rules…";
  panel.hidden = true;
  try {
    const consented = telemetryConsent.checked;
    const response = await fetch(apiEndpoint, {
      method: "POST",
      headers: {"Content-Type": "application/json"},
      body: JSON.stringify({question: value, system: "dnd-2024", telemetryConsent: consented, turnstileToken})
    });
    if (!response.ok) throw new Error("request_failed");
    const result = await response.json();
    const labels = {answer: "Answer", clarification: "Choose a rule", evidence: "Rules as written", unresolved: "No reliable rule found"};
    showAnswer(labels[result.kind] || "Rules response", result.text || "The service returned no answer.", Array.isArray(result.citations) ? result.citations : []);
    if (result.responseId) {
      activeResponse = {id: result.responseId, consented};
      feedbackWrap.hidden = false;
      feedbackButton.disabled = !consented;
      feedbackStatus.textContent = consented ? "" : "Reporting is available only for questions you explicitly shared for QA.";
    }
  } catch {
    showAnswer("Service unavailable", "The Rules Bot could not answer right now. Nothing has been submitted again automatically; please try later.", [], true);
  } finally {
    turnstileToken = "";
    if (turnstileSiteKey && turnstileWidgetId !== null) window.turnstile?.reset(turnstileWidgetId);
    button.disabled = false;
    button.textContent = "Ask the bot";
  }
});

feedbackButton.addEventListener("click", async () => {
  if (!activeResponse?.consented || !feedbackEndpoint()) return;
  feedbackButton.disabled = true;
  feedbackStatus.textContent = "Sending report…";
  try {
    const response = await fetch(feedbackEndpoint(), {
      method: "POST",
      headers: {"Content-Type": "application/json"},
      body: JSON.stringify({responseId: activeResponse.id, feedback: "bad-answer", telemetryConsent: true})
    });
    if (!response.ok) throw new Error("feedback_failed");
    feedbackStatus.textContent = "Report received. Thank you.";
  } catch {
    feedbackButton.disabled = false;
    feedbackStatus.textContent = "The report could not be sent. Please try later.";
  }
});
