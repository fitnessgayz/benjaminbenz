const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const { render } = require(path.join(root, 'js/client-personal-bests-list.js'));

function fixture() {
  const images = [{ loading: '', decoding: '' }];
  const document = { createElement() { return { className: '', textContent: '' }; } };
  const container = {
    ownerDocument: document, innerHTML: '', children: [],
    classList: { values: new Set(), add(value) { this.values.add(value); } },
    querySelectorAll() { return images; },
    replaceChildren(...children) { this.children = children; this.innerHTML = ''; }
  };
  const count = { textContent: '' };
  return { container, count, images };
}

test('renders all matching personal bests in one vertical list, without paging', () => {
  const { container, count, images } = fixture();
  const records = Array.from({ length: 107 }, (_, index) => ({ name: `Exercise ${index + 1}` }));
  render({ container, count, records, cardMarkup: (record) => `<article class="progress-exercise-card">${record.name}</article>` });
  assert.equal((container.innerHTML.match(/<article/g) || []).length, 107);
  assert.match(container.innerHTML, /Exercise 107/);
  assert.equal(count.textContent, '107 exercises');
  assert.equal(container.classList.values.has('client-personal-bests-list'), true);
  assert.equal(images[0].loading, 'lazy');
  assert.equal(images[0].decoding, 'async');
});

test('empty search has a safe readable message and keeps the list ready', () => {
  const { container, count } = fixture();
  render({ container, count, records: [], cardMarkup: () => '', emptyMessage: 'No exercises match “<curl>”.', emptyCount: 'No matches' });
  assert.equal(container.children[0].textContent, 'No exercises match “<curl>”.');
  assert.equal(count.textContent, 'No matches');
});

test('responsive list styling has no carousel transforms or page buttons', () => {
  const css = fs.readFileSync(path.join(root, 'css/client-personal-bests-list.css'), 'utf8');
  assert.match(css, /grid-template-columns: repeat\(2, minmax\(0, 1fr\)\)/);
  assert.match(css, /@media \(max-width: 780px\)/);
  assert.match(css, /content-visibility: auto/);
  assert.doesNotMatch(css, /carousel|animation|rotate|translate/);
});
