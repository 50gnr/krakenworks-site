// Rendering for the small Markdown subset the rules service emits.
// Every node is built with createElement/createTextNode; nothing here ever
// assigns markup, so returned rule text can never become live HTML.

const INLINE_RULES = [
  {pattern: /`([^`]+)`/, tag: "code", literal: true},
  {pattern: /\*\*\*([^\n]+?)\*\*\*/, tag: "strong", inner: "em"},
  {pattern: /\*\*([^\n]+?)\*\*/, tag: "strong"},
  {pattern: /__([^\n]+?)__/, tag: "strong"},
  {pattern: /(?<![\w*])\*([^*\n]+?)\*(?![\w*])/, tag: "em"},
  {pattern: /(?<![\w_])_([^_\n]+?)_(?![\w_])/, tag: "em"},
];

const BARE_URL = /https?:\/\/[^\s<>()[\]]+[^\s<>()[\].,;:!?]/g;
const LIST_ITEM = /^(\s*)(?:([-*+])|(\d+)[.)])\s+(.*)$/;
const HEADING = /^(#{1,6})\s+(.+?)\s*#*$/;
const THEMATIC_BREAK = /^(?:-{3,}|\*{3,}|_{3,})$/;
const TABLE_ROW = /^\|.*\|$/;
const TABLE_DIVIDER = /^\|(?:\s*:?-{2,}:?\s*\|)+$/;

function ownerDocument(target, doc) {
  return doc || target.ownerDocument || globalThis.document;
}

function isSafeUrl(value) {
  const scheme = value.slice(0, value.indexOf(":") + 1).toLowerCase();
  return scheme === "http:" || scheme === "https:";
}

// Turns bare http(s) URLs into anchors. Any other scheme stays plain text.
export function appendLinkedText(target, text, doc) {
  const document = ownerDocument(target, doc);
  let cursor = 0;
  for (const match of text.matchAll(BARE_URL)) {
    if (!isSafeUrl(match[0])) continue;
    target.append(document.createTextNode(text.slice(cursor, match.index)));
    const link = document.createElement("a");
    link.setAttribute("href", match[0]);
    link.setAttribute("rel", "noopener noreferrer");
    link.textContent = match[0];
    target.append(link);
    cursor = match.index + match[0].length;
  }
  target.append(document.createTextNode(text.slice(cursor)));
}

export function appendInlineRuleText(target, text, doc) {
  const document = ownerDocument(target, doc);
  let remaining = text;
  while (remaining) {
    let best = null;
    for (const rule of INLINE_RULES) {
      const match = remaining.match(rule.pattern);
      if (match && (!best || match.index < best.match.index)) best = {rule, match};
    }
    if (!best) break;
    const {rule, match} = best;
    target.append(document.createTextNode(remaining.slice(0, match.index)));
    const element = document.createElement(rule.tag);
    if (rule.literal) element.textContent = match[1];
    else if (rule.inner) {
      const nested = document.createElement(rule.inner);
      appendInlineRuleText(nested, match[1], document);
      element.append(nested);
    } else appendInlineRuleText(element, match[1], document);
    target.append(element);
    remaining = remaining.slice(match.index + match[0].length);
  }
  if (remaining) target.append(document.createTextNode(remaining));
}

function appendTable(target, rows, document) {
  const table = document.createElement("table");
  table.className = "rule-table";
  const cells = row => row.slice(1, -1).split("|").map(cell => cell.trim());
  let body = table;
  let start = 0;
  if (rows.length > 1 && TABLE_DIVIDER.test(rows[1])) {
    const head = document.createElement("thead");
    const headRow = document.createElement("tr");
    for (const cell of cells(rows[0])) {
      const th = document.createElement("th");
      appendInlineRuleText(th, cell, document);
      headRow.append(th);
    }
    head.append(headRow);
    table.append(head);
    start = 2;
  }
  body = document.createElement("tbody");
  for (const row of rows.slice(start)) {
    const tr = document.createElement("tr");
    for (const cell of cells(row)) {
      const td = document.createElement("td");
      appendInlineRuleText(td, cell, document);
      tr.append(td);
    }
    body.append(tr);
  }
  table.append(body);
  target.append(table);
}

export function renderRuleMarkdown(target, markdown, doc) {
  const document = ownerDocument(target, doc);
  const lines = String(markdown ?? "").split("\n");
  let paragraph = [];
  let table = [];
  // Open lists keyed by indent depth so nested bullets stay nested.
  let stack = [];

  const flushParagraph = () => {
    if (!paragraph.length) return;
    const element = document.createElement("p");
    appendInlineRuleText(element, paragraph.join(" "), document);
    target.append(element);
    paragraph = [];
  };
  const flushTable = () => {
    if (!table.length) return;
    appendTable(target, table, document);
    table = [];
  };
  const closeLists = () => { stack = []; };
  const flushAll = () => { flushParagraph(); flushTable(); closeLists(); };

  for (const rawLine of lines) {
    const line = rawLine.replace(/\s+$/, "");
    const trimmed = line.trim();

    if (!trimmed) {
      flushAll();
      continue;
    }
    if (TABLE_ROW.test(trimmed)) {
      flushParagraph();
      closeLists();
      table.push(trimmed);
      continue;
    }
    flushTable();

    if (THEMATIC_BREAK.test(trimmed)) {
      flushParagraph();
      closeLists();
      target.append(document.createElement("hr"));
      continue;
    }

    const heading = trimmed.match(HEADING);
    if (heading) {
      flushParagraph();
      closeLists();
      const element = document.createElement(heading[1].length <= 2 ? "h3" : "h4");
      appendInlineRuleText(element, heading[2], document);
      target.append(element);
      continue;
    }

    const item = trimmed.startsWith(">") ? null : line.match(LIST_ITEM);
    if (item) {
      flushParagraph();
      const depth = Math.floor(item[1].replace(/\t/g, "  ").length / 2);
      const tag = item[2] ? "ul" : "ol";
      while (stack.length && (stack.at(-1).depth > depth || (stack.at(-1).depth === depth && stack.at(-1).tag !== tag))) stack.pop();
      if (!stack.length || stack.at(-1).depth < depth) {
        const list = document.createElement(tag);
        const parent = stack.length ? stack.at(-1).lastItem || stack.at(-1).list : target;
        parent.append(list);
        stack.push({depth, tag, list, lastItem: null});
      }
      const level = stack.at(-1);
      const li = document.createElement("li");
      appendInlineRuleText(li, item[4], document);
      level.list.append(li);
      level.lastItem = li;
      continue;
    }

    if (trimmed.startsWith(">")) {
      flushParagraph();
      closeLists();
      const quote = document.createElement("blockquote");
      appendInlineRuleText(quote, trimmed.replace(/^>\s?/, ""), document);
      target.append(quote);
      continue;
    }

    // A wrapped continuation line belongs to the list item above it.
    if (stack.length && rawLine.startsWith(" ")) {
      const level = stack.at(-1);
      if (level.lastItem) {
        level.lastItem.append(document.createTextNode(" "));
        appendInlineRuleText(level.lastItem, trimmed, document);
        continue;
      }
    }

    closeLists();
    paragraph.push(trimmed);
  }
  flushParagraph();
  flushTable();
}

// Provenance arrives as "Label: value" lines. Render them as compact rows
// rather than folding them into one run-on paragraph.
export function renderProvenanceLines(target, provenance, doc) {
  const document = ownerDocument(target, doc);
  const list = document.createElement("dl");
  list.className = "provenance-list";
  for (const line of String(provenance ?? "").split("\n").map(value => value.trim()).filter(Boolean)) {
    const split = line.indexOf(":");
    const term = document.createElement("dt");
    const description = document.createElement("dd");
    if (split > 0 && split < 40) {
      term.textContent = line.slice(0, split);
      appendLinkedText(description, line.slice(split + 1).trim(), document);
    } else {
      term.textContent = "Note";
      appendLinkedText(description, line, document);
    }
    list.append(term, description);
  }
  target.append(list);
}

// Short one-line gist for the collapsed provenance summary.
export function provenanceSummary(provenance) {
  const lines = String(provenance ?? "").split("\n").map(value => value.trim()).filter(Boolean);
  const pack = lines.find(line => /^Package provenance:/i.test(line))?.replace(/^Package provenance:\s*/i, "").split(";")[0].trim();
  const license = lines.find(line => /^License:/i.test(line))?.replace(/^License:\s*/i, "").split(";")[0].trim();
  return [pack, license].filter(Boolean).join(" · ") || "Source, license, and attribution";
}
