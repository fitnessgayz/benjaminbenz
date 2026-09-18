const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');
const source = fs.readFileSync(path.join(__dirname, '../js/coach-admin.js'), 'utf8');
function fn(name) {
  const start = source.indexOf(`function ${name}(`);
  assert.ok(start >= 0, name);
  const rest = source.slice(start);
  const end = rest.slice(1).search(/\n(?:async )?function /);
  return end < 0 ? rest : rest.slice(0, end + 1);
}
class Element {
  constructor() { this.value = ''; this.children = []; this.attributes = {}; this.listeners = {}; this.dataset = {}; }
  addEventListener(type, fn) { this.listeners[type] = fn; }
  fire(type, event = {}) { this.listeners[type]?.({preventDefault() {}, ...event}); }
  setAttribute(name, value) { this.attributes[name] = value; }
  removeAttribute(name) { delete this.attributes[name]; }
  replaceChildren(...children) { this.children = children; }
  append(...children) { this.children.push(...children); }
  scrollIntoView() {}
  contains(target) { return target === this; }
  closest() { return this; }
}
function fixture() {
  const nodes = Object.fromEntries(['client-search-input', 'client-suggestions', 'client-selector-status', 'client-autocomplete', 'archived-clients-button'].map(id => [id, new Element()]));
  const document = new Element();
  document.getElementById = id => nodes[id];
  document.createElement = () => new Element();
  const selected = [];
  const context = vm.createContext({document, programs: [
    {id:'old', client_name:'Sam Green', client_email:'sam1@example.com', active:false},
    {id:'one', client_name:'Sam Green', client_email:'sam1@example.com', active:true},
    {id:'two', client_name:'Sam Green', client_email:'sam2@example.com', active:true},
    {id:'inactive', client_name:'Sam Inactive', client_email:'inactive@example.com', active:false},
    {id:'archived', client_name:'Sam Archived', client_email:'archived@example.com', client_archived:true},
    {id:'safe', client_name:'<img src=x>', client_email:'safe@example.com', active:true}
  ], clientSearchTerm:'', clientSuggestionsOpen:false, activeClientSuggestion:-1, showingArchivedClients:false,
  selectedProgramId:'', fillForm: p => selected.push(p?.id), renderClientList() {}, setAdminTab: tab => { context.tab = tab; }, adminStatus() {}});
  vm.runInContext(['normalizeEmail','programsForCurrentClientView','matchingClientSuggestions','activeClientPrograms','archivedClientPrograms','renderClientSuggestions','closeClientSuggestions','selectClientSuggestion','handleClientSearch','handleArchivedClientsToggle'].map(fn).join('\n'), context);
  context.handleClientSearch();
  const input = nodes['client-search-input'];
  return {context, nodes, input, list:nodes['client-suggestions'], selected, document, search(value) { input.value = value; input.fire('input'); }};
}
test('starts empty; only matching active clients appear once per email', () => {
  const f = fixture();
  f.input.fire('focus');
  assert.equal(f.input.value, '');
  assert.equal(f.list.hidden, true);
  f.search('  sAM  ');
  assert.deepEqual(f.list.children.map(node => node.dataset.programId), ['one', 'two']);
  assert.equal(f.input.attributes['aria-expanded'], 'true');
  assert.equal(f.list.children[1].children[1].textContent, 'sam2@example.com');
  f.search('sam2@');
  assert.equal(f.list.children.length, 1);
  f.search('');
  assert.equal(f.list.hidden, true);
  assert.equal(f.nodes['client-selector-status'].textContent, '');
});
test('keyboard requires an explicit option and chooses the correct duplicate name', () => {
  const f = fixture();
  f.search('Sam');
  f.input.fire('keydown', {key:'Enter'});
  assert.equal(f.selected.length, 0);
  f.input.fire('keydown', {key:'ArrowDown'});
  f.input.fire('keydown', {key:'ArrowDown'});
  assert.equal(f.input.attributes['aria-activedescendant'], 'client-suggestion-1');
  f.input.fire('keydown', {key:'Enter'});
  assert.deepEqual(f.selected, ['two']);
  assert.equal(f.context.tab, 'profile');
  assert.equal(f.list.hidden, true);
  assert.equal(f.input.attributes['aria-activedescendant'], undefined);
});
test('pointer selection, Escape, blur, and outside dismissal work', () => {
  const f = fixture();
  f.search('Sam');
  let prevented = false;
  f.list.fire('pointerdown', {preventDefault() { prevented = true; }});
  assert.equal(prevented, true);
  f.list.fire('click', {target: f.list.children[0]});
  assert.deepEqual(f.selected, ['one']);
  for (const dismiss of [() => f.input.fire('keydown', {key:'Escape'}), () => f.input.fire('blur'), () => f.document.fire('pointerdown', {target:{}})]) {
    f.search('Sam');
    dismiss();
    assert.equal(f.list.hidden, true);
    assert.equal(f.input.attributes['aria-expanded'], 'false');
  }
});
test('unmatched names never select or create a client, and labels are plain text', () => {
  const f = fixture();
  f.search('Unknown');
  f.input.fire('keydown', {key:'ArrowDown'});
  f.input.fire('keydown', {key:'Enter'});
  assert.deepEqual(f.selected, []);
  assert.match(f.nodes['client-selector-status'].textContent, /No active clients/);
  f.search('<img');
  assert.equal(f.list.children[0].children[0].textContent, '<img src=x>');
});
test('archived mode clears the field and only suggests archived clients', () => {
  const f = fixture();
  f.context.handleArchivedClientsToggle();
  f.search('Sam');
  f.nodes['archived-clients-button'].fire('click');
  assert.equal(f.input.value, '');
  assert.equal(f.list.hidden, true);
  f.search('Sam');
  assert.deepEqual(f.list.children.map(node => node.dataset.programId), ['archived']);
  f.nodes['archived-clients-button'].fire('click');
  f.search('Sam');
  assert.deepEqual(f.list.children.map(node => node.dataset.programId), ['one', 'two']);
});
