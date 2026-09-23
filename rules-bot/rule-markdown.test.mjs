import test from 'node:test';
import assert from 'node:assert/strict';
import {parseRuleEnvelope} from './rule-envelope.mjs';
import {
  appendInlineRuleText,
  renderRuleMarkdown,
  renderProvenanceLines,
  provenanceSummary,
} from './rule-markdown.mjs';

// Minimal DOM stand-in. It only supports the node APIs the renderer uses, so a
// renderer that reached for innerHTML or parsed markup would fail loudly here.
function createDocument() {
  const document = {
    createTextNode(data) {
      return {nodeType: 3, data, ownerDocument: document};
    },
    createElement(tag) {
      const node = {
        nodeType: 1,
        tag,
        attributes: {},
        children: [],
        ownerDocument: document,
        className: '',
        setAttribute(name, value) { node.attributes[name] = String(value); },
        append(...parts) { node.children.push(...parts); },
        set textContent(value) { node.children = [document.createTextNode(String(value))]; },
        get textContent() { return serializeText(node); },
      };
      return node;
    },
  };
  return document;
}

const escapeText = value => value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

function serialize(node) {
  if (node.nodeType === 3) return escapeText(node.data);
  const attributes = Object.entries(node.attributes).map(([name, value]) => ` ${name}="${escapeText(value)}"`).join('');
  const classAttribute = node.className ? ` class="${node.className}"` : '';
  const inner = node.children.map(serialize).join('');
  return `<${node.tag}${classAttribute}${attributes}>${inner}</${node.tag}>`;
}

function serializeText(node) {
  if (node.nodeType === 3) return node.data;
  return node.children.map(serializeText).join('');
}

function render(markdown) {
  const document = createDocument();
  const root = document.createElement('div');
  renderRuleMarkdown(root, markdown, document);
  return serialize(root);
}

function renderInline(text) {
  const document = createDocument();
  const root = document.createElement('span');
  appendInlineRuleText(root, text, document);
  return serialize(root);
}

const FIREBALL = [
  'Fireball',
  '_Level 3 Evocation (Sorcerer, Wizard)_',
  '',
  '- **Casting Time:** Action',
  '- **Range:** 150 feet',
  '- **Components:** V, S, M (a ball of bat guano and sulfur)',
  '- **Duration:** Instantaneous',
  '',
  'A bright streak flashes from you to a point you choose within range and then blossoms with a low roar into a fiery explosion.',
  '',
  "Flammable objects in the area that aren't being worn or carried start burning.",
  '',
  '_**Using a Higher-Level Spell Slot:**_ The damage increases by 1d6 for each spell slot level above 3.',
  'Source: System Reference Document 5.2.1',
  '',
  'Package provenance: System Reference Document 5.2.1; retrieved 2026-09-22; https://www.dndbeyond.com/srd',
  'License: CC-BY-4.0; https://creativecommons.org/licenses/by/4.0/',
  'Attribution: This work includes material from the System Reference Document 5.2.1 by Wizards of the Coast LLC.',
].join('\n');

test('headings become elements instead of literal hash marks', () => {
  const html = render('# Grappling\n\nYou grab a creature.\n\n### Escaping\n\nUse an action.');
  assert.equal(html, '<div><h3>Grappling</h3><p>You grab a creature.</p><h4>Escaping</h4><p>Use an action.</p></div>');
  assert.doesNotMatch(html, /#/);
});

test('bullet and numbered lists become real list markup', () => {
  assert.equal(
    render('- Casting Time: Action\n- Range: 150 feet'),
    '<div><ul><li>Casting Time: Action</li><li>Range: 150 feet</li></ul></div>',
  );
  assert.equal(
    render('1. Roll the die\n2. Add the modifier'),
    '<div><ol><li>Roll the die</li><li>Add the modifier</li></ol></div>',
  );
});

test('indented bullets nest inside the item above them', () => {
  assert.equal(
    render('- Cover\n  - Half cover\n  - Three-quarters cover\n- Concealment'),
    '<div><ul><li>Cover<ul><li>Half cover</li><li>Three-quarters cover</li></ul></li><li>Concealment</li></ul></div>',
  );
});

test('emphasis markers render as elements and never survive as text', () => {
  assert.equal(renderInline('**Casting Time:** Action'), '<span><strong>Casting Time:</strong> Action</span>');
  assert.equal(renderInline('_Level 3 Evocation_'), '<span><em>Level 3 Evocation</em></span>');
  assert.equal(renderInline('_**Using a Higher-Level Spell Slot:**_ more'), '<span><em><strong>Using a Higher-Level Spell Slot:</strong></em> more</span>');
  assert.equal(renderInline('roll `1d20` now'), '<span>roll <code>1d20</code> now</span>');
  assert.equal(renderInline('***both***'), '<span><strong><em>both</em></strong></span>');
});

test('underscores inside words are left alone', () => {
  assert.equal(renderInline('use snake_case_names here'), '<span>use snake_case_names here</span>');
});

test('wrapped paragraph lines join into one paragraph', () => {
  assert.equal(
    render('A bright streak flashes\nfrom you to a point.\n\nSecond paragraph.'),
    '<div><p>A bright streak flashes from you to a point.</p><p>Second paragraph.</p></div>',
  );
});

test('pipe tables render as table markup', () => {
  assert.equal(
    render('| Level | Damage |\n| --- | --- |\n| 3 | 8d6 |\n| 4 | 9d6 |'),
    '<div><table class="rule-table"><thead><tr><th>Level</th><th>Damage</th></tr></thead>'
      + '<tbody><tr><td>3</td><td>8d6</td></tr><tr><td>4</td><td>9d6</td></tr></tbody></table></div>',
  );
});

test('rule text is escaped, never treated as markup', () => {
  const html = render('Damage is <b>8d6</b> & rising.');
  assert.equal(html, '<div><p>Damage is &lt;b&gt;8d6&lt;/b&gt; &amp; rising.</p></div>');
});

test('the real Fireball envelope renders with no leftover Markdown syntax', () => {
  const envelope = parseRuleEnvelope(FIREBALL);
  assert.ok(envelope, 'the live response shape must parse');
  assert.equal(envelope.entries.length, 1);
  assert.equal(envelope.entries[0].title, 'Fireball');

  const html = render(envelope.entries[0].body);
  assert.match(html, /<em>Level 3 Evocation \(Sorcerer, Wizard\)<\/em>/);
  assert.match(html, /<ul><li><strong>Casting Time:<\/strong> Action<\/li>/);
  assert.match(html, /<em><strong>Using a Higher-Level Spell Slot:<\/strong><\/em>/);
  assert.match(html, /<p>Flammable objects/);
  assert.doesNotMatch(html, /\*\*/);
  assert.doesNotMatch(html, /(^|[^\w])_[^_]/);

  // Nothing from the rule body may be dropped on the way to the DOM.
  for (const phrase of ['a ball of bat guano and sulfur', 'fiery explosion', 'spell slot level above 3']) {
    assert.ok(html.includes(phrase), `missing verbatim phrase: ${phrase}`);
  }
});

test('provenance renders as labelled rows with linked URLs', () => {
  const envelope = parseRuleEnvelope(FIREBALL);
  const document = createDocument();
  const root = document.createElement('div');
  renderProvenanceLines(root, envelope.provenance, document);
  const html = serialize(root);
  assert.match(html, /<dl class="provenance-list">/);
  assert.match(html, /<dt>Package provenance<\/dt>/);
  assert.match(html, /<dt>License<\/dt>/);
  assert.match(html, /<dt>Attribution<\/dt>/);
  assert.match(html, /<a href="https:\/\/www\.dndbeyond\.com\/srd" rel="noopener noreferrer">/);
  assert.equal((html.match(/<dt>/g) || []).length, 3);
});

test('collapsed provenance summary is compact', () => {
  const envelope = parseRuleEnvelope(FIREBALL);
  const summary = provenanceSummary(envelope.provenance);
  assert.equal(summary, 'System Reference Document 5.2.1 · CC-BY-4.0');
  assert.ok(summary.length < 60);
});

test('provenance falls back to a label when a line has no field name', () => {
  const document = createDocument();
  const root = document.createElement('div');
  renderProvenanceLines(root, 'Some unlabelled provenance note', document);
  assert.match(serialize(root), /<dt>Note<\/dt><dd>Some unlabelled provenance note<\/dd>/);
  assert.equal(provenanceSummary(''), 'Source, license, and attribution');
});
