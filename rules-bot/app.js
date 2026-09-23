import {parseRuleEnvelope} from "./rule-envelope.mjs";
import {renderRuleMarkdown, renderProvenanceLines, provenanceSummary} from "./rule-markdown.mjs";

const form = document.querySelector("#rules-form");
const question = document.querySelector("#question");
const count = document.querySelector("#character-count");
const button = document.querySelector("#ask-button");
const panel = document.querySelector("#answer-panel");
const answerKind = document.querySelector("#answer-kind");
const answerText = document.querySelector("#answer-text");
const answerChoices = document.querySelector("#answer-choices");
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

function updateChoiceButtons() {
  const waiting = Boolean(turnstileSiteKey && !turnstileToken);
  for (const choice of answerChoices.querySelectorAll("button")) {
    choice.disabled = waiting;
    choice.title = waiting ? "Complete the bot check to use this choice." : "";
  }
}

function setStatus(message, online = false) {
  serviceStatus.replaceChildren();
  const dot = document.createElement("span");
  dot.className = `status-dot${online ? "" : " offline"}`;
  serviceStatus.append(dot, document.createTextNode(message));
}

function buildDetails(className, summaryText, build) {
  const details = document.createElement("details");
  details.className = className;
  const summary = document.createElement("summary");
  summary.textContent = summaryText;
  const content = document.createElement("div");
  build(content);
  details.append(summary, content);
  return details;
}

function renderRuleEnvelope(envelope, rawText) {
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

  const footer = document.createElement("div");
  footer.className = "rule-footer";
  footer.append(buildDetails("rule-provenance", provenanceSummary(envelope.provenance), content => {
    renderProvenanceLines(content, envelope.provenance);
  }));
  // The formatted cards are a reading aid; the exact returned text stays
  // available, complete and unmodified, for citation and verification.
  footer.append(buildDetails("rule-raw", "Exact text as returned", content => {
    const pre = document.createElement("pre");
    pre.textContent = rawText;
    content.append(pre);
  }));
  answerText.append(footer);
}

function renderChoices(choices = []) {
  const validChoices = choices.filter(choice => choice && typeof choice.label === "string" && typeof choice.question === "string");
  answerChoices.replaceChildren();
  answerChoices.hidden = validChoices.length === 0;
  if (!validChoices.length) return;
  const prompt = document.createElement("p");
  prompt.textContent = "Choose the rule you meant:";
  answerChoices.append(prompt);
  const buttons = document.createElement("div");
  buttons.className = "answer-choice-list";
  for (const choice of validChoices) {
    const option = document.createElement("button");
    option.className = "example-button";
    option.type = "button";
    option.textContent = choice.label;
    option.addEventListener("click", () => {
      question.value = choice.question;
      count.textContent = String(question.value.length);
      form.requestSubmit();
    });
    buttons.append(option);
  }
  answerChoices.append(buttons);
  updateChoiceButtons();
}

function showAnswer(kind, text, citations = [], isError = false, choices = []) {
  answerKind.textContent = kind;
  answerKind.classList.toggle("notice-error", isError);
  answerText.classList.remove("rule-results");
  const envelope = !isError ? parseRuleEnvelope(text) : null;
  if (envelope) renderRuleEnvelope(envelope, text);
  else {
    answerText.replaceChildren();
    answerText.textContent = text;
  }
  renderChoices(isError ? [] : choices);
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
      callback: token => { turnstileToken = token; updateChoiceButtons(); },
      "expired-callback": () => { turnstileToken = ""; updateChoiceButtons(); },
      "error-callback": () => { turnstileToken = ""; updateChoiceButtons(); },
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
    showAnswer(labels[result.kind] || "Rules response", result.text || "The service returned no answer.", Array.isArray(result.citations) ? result.citations : [], false, Array.isArray(result.choices) ? result.choices : []);
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
    updateChoiceButtons();
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
