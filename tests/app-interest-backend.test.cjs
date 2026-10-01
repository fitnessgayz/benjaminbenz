// From the repository root: node --test tests/app-interest-backend.test.cjs
// Optionally set FWB_CODE_PATH to another Code.gs file.
// These tests simulate Apps Script APIs and never access Google or the network.
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const test = require('node:test');
const assert = require('node:assert/strict');

const sourcePath = process.env.FWB_CODE_PATH || path.join(__dirname, '../integrations/app-interest/Code.gs');
const source = fs.readFileSync(sourcePath, 'utf8');
const HEADERS = ['Signup date', 'Name', 'Email', 'Phone (optional)', 'Primary fitness goal', 'Training experience', 'Device', 'Contact consent', 'Status', 'Invitation date', 'Follow-up date', 'Notes'];
const VALID = { name: 'Test Person', email: 'test@example.com', phone: '4155550100', goal: 'General fitness', experience: 'Beginner', device: 'iPhone', consent: 'Yes' };

function harness(options = {}) {
  const rows = (options.rows ?? [HEADERS]).map(row => [...row]);
  const events = [];
  const sentEmails = [];
  let locked = false;
  const fail = stage => { if (options.failAt === stage) throw new Error(`Simulated ${stage} failure`); };
  const sheet = {
    getLastRow() { events.push('lastRow'); fail('read'); return rows.length; },
    getRange(row, column, count, width) {
      assert.ok((row === 1 && column === 1 && count === 1 && width === 12) || (row === 2 && column === 3 && width === 1), 'Only expected header and email ranges are read');
      return { getDisplayValues() {
        events.push(row === 1 ? 'readHeaders' : 'readEmails');
        fail('read');
        // Approximate Sheets' display of apostrophe-prefixed plain text.
        return Array.from({ length: count }, (_, i) => Array.from({ length: width }, (_, j) => String(rows[row - 1 + i]?.[column - 1 + j] ?? '').replace(/^'/, '')));
      } };
    },
    appendRow(row) { events.push('append'); fail('append'); rows.push(Array.from(row)); },
  };
  const context = vm.createContext({
    HtmlService: { createHtmlOutput(html) { return html; } },
    SpreadsheetApp: {
      openById(id) {
        events.push('open'); fail('open');
        assert.equal(id, '1Qg4_2On4sRkBbj5mapcDgJtRRPN4Nrc4yfk-_QE8aTw');
        return { getSheetByName(name) { events.push('sheet'); assert.equal(name, 'App Interest'); return options.missingSheet ? null : sheet; } };
      },
      flush() { events.push('flush'); fail('flush'); },
    },
    LockService: { getScriptLock() {
      events.push('getLock');
      return {
        waitLock(timeout) { events.push('waitLock'); assert.equal(timeout, 10000); fail('lock'); locked = true; },
        hasLock() { return locked; },
        releaseLock() { events.push('releaseLock'); locked = false; },
      };
    } },
    MailApp: { sendEmail(message) {
      events.push('mail');
      fail('mail');
      sentEmails.push({ ...message });
    } },
    console: { error() { events.push('error'); } },
  });
  vm.runInContext(source, context, { filename: sourcePath });
  return { rows, events, sentEmails, submit: (parameters = VALID) => context.doPost({ parameter: parameters }), raw: event => context.doPost(event), isLocked: () => locked };
}

function success(html) {
  assert.match(html, /You're on the list!/);
  assert.doesNotMatch(html, /could not be saved/);
}
function failure(html) {
  assert.match(html, /Your signup could not be saved\./);
  assert.doesNotMatch(html, /You're on the list!/);
}
function released(h) {
  assert.equal(h.isLocked(), false, 'No held script lock after request');
  assert.equal(h.events.filter(event => event === 'releaseLock').length, 1);
}

test('valid signup persists the twelve fields and returns success after flush', () => {
  const h = harness();
  success(h.submit());
  assert.equal(h.rows.length, 2);
  assert.equal(Object.prototype.toString.call(h.rows[1][0]), '[object Date]');
  assert.equal(Number.isFinite(h.rows[1][0].getTime()), true);
  assert.deepEqual(h.rows[1].slice(1), ['Test Person', 'test@example.com', '4155550100', 'General fitness', 'Beginner', 'iPhone', 'Yes', 'New', '', '', '']);
  assert.deepEqual(h.events, ['getLock', 'waitLock', 'open', 'sheet', 'readHeaders', 'lastRow', 'append', 'flush', 'releaseLock', 'mail']);
  released(h);
});

test('new signup sends one notification with the signup details and response-sheet link', () => {
  const h = harness();
  success(h.submit());
  assert.deepEqual(h.sentEmails, [{
    to: 'benjaminbenz.fit@gmail.com',
    subject: 'New FWB app interest signup',
    body: [
      'A new person joined the FWB app interest list.',
      '',
      'Name: Test Person',
      'Email: test@example.com',
      'Goal: General fitness',
      'Experience: Beginner',
      'Device: iPhone',
      '',
      'Open responses: https://docs.google.com/spreadsheets/d/1Qg4_2On4sRkBbj5mapcDgJtRRPN4Nrc4yfk-_QE8aTw/edit#gid=360317381'
    ].join('\n'),
    name: 'FWB Signup'
  }]);
});

test('optional phone may be omitted', () => {
  const h = harness();
  const { phone, ...parameters } = VALID;
  success(h.submit(parameters));
  assert.equal(h.rows[1][3], '');
});

for (const [label, email] of [['same', 'test@example.com'], ['uppercase', 'TEST@EXAMPLE.COM'], ['surrounding whitespace', '  test@example.com\t']]) {
  test(`duplicate with ${label} email succeeds without adding a row`, () => {
    const h = harness();
    success(h.submit());
    success(h.submit({ ...VALID, email, name: 'Changed Name' }));
    assert.equal(h.rows.length, 2);
    assert.equal(h.rows[1][1], 'Test Person');
    assert.equal(h.events.filter(event => event === 'append').length, 1);
    assert.equal(h.sentEmails.length, 1);
    assert.equal(h.events.filter(event => event === 'releaseLock').length, 2);
  });
}

test('deduplication recognizes an existing mixed-case email', () => {
  const h = harness({ rows: [HEADERS, ['', 'Existing', 'TeSt@Example.COM']] });
  success(h.submit());
  assert.equal(h.rows.length, 2);
  assert.equal(h.events.includes('append'), false);
  assert.equal(h.sentEmails.length, 0);
  released(h);
});

test('notification failure keeps the saved signup successful', () => {
  const h = harness({ failAt: 'mail' });
  success(h.submit());
  assert.equal(h.rows.length, 2);
  assert.equal(h.sentEmails.length, 0);
  assert.deepEqual(h.events, ['getLock', 'waitLock', 'open', 'sheet', 'readHeaders', 'lastRow', 'append', 'flush', 'releaseLock', 'mail', 'error']);
  released(h);
});

for (const field of ['name', 'email', 'goal', 'experience', 'device', 'consent']) {
  test(`missing required ${field} is rejected before spreadsheet access`, () => {
    const h = harness();
    const parameters = { ...VALID };
    delete parameters[field];
    failure(h.submit(parameters));
    assert.equal(h.rows.length, 1);
    assert.deepEqual(h.events, []);
  });
}

const invalidCases = [
  ['blank name', { name: ' \t\n ' }],
  ['blank email', { email: '' }],
  ['email without at sign', { email: 'test.example.com' }],
  ['email containing whitespace', { email: 'test user@example.com' }],
  ['email without domain suffix', { email: 'test@example' }],
  ['unknown goal', { goal: 'unsupported' }],
  ['unknown experience', { experience: 'Expert' }],
  ['unknown device', { device: 'Other' }],
  ['empty consent', { consent: '' }],
  ['unchecked consent', { consent: 'No' }],
  ['differently cased consent', { consent: 'yes' }],
  ['padded consent', { consent: ' Yes ' }],
  ['filled honeypot', { website: 'https://example.test' }],
  ['whitespace honeypot', { website: ' ' }],
];
for (const [label, change] of invalidCases) {
  test(`${label} is rejected without a write`, () => {
    const h = harness();
    failure(h.submit({ ...VALID, ...change }));
    assert.equal(h.rows.length, 1);
    assert.deepEqual(h.events, []);
  });
}

for (const [label, event] of [['missing event', undefined], ['empty event', {}], ['empty parameters', { parameter: {} }]]) {
  test(`${label} yields a controlled failure`, () => {
    const h = harness();
    failure(h.raw(event));
    assert.deepEqual(h.events, []);
  });
}

test('empty honeypot is accepted', () => {
  const h = harness();
  success(h.submit({ ...VALID, website: '' }));
  assert.equal(h.rows.length, 2);
});

test('text and selections are trimmed; email is lowercased', () => {
  const h = harness();
  success(h.submit({ ...VALID, name: '  Test Person \n', email: ' TEST@EXAMPLE.COM\t', phone: ' 4155550100 ', goal: ' General fitness ', experience: '\tBeginner ', device: ' iPhone ' }));
  assert.deepEqual(h.rows[1].slice(1, 7), ['Test Person', 'test@example.com', '4155550100', 'General fitness', 'Beginner', 'iPhone']);
});

test('name and phone lengths are capped at server limits', () => {
  const h = harness();
  success(h.submit({ ...VALID, name: 'N'.repeat(150), phone: '5'.repeat(60) }));
  assert.equal(h.rows[1][1], 'N'.repeat(120));
  assert.equal(h.rows[1][3], '5'.repeat(40));
});

test('email at the 254-character server limit is accepted', () => {
  const h = harness();
  const email = 'a'.repeat(241) + '@example.test';
  assert.equal(email.length, 254);
  success(h.submit({ ...VALID, email }));
  assert.equal(h.rows[1][2], email);
});

test('overlength email whose truncated value is invalid is rejected', () => {
  const h = harness();
  failure(h.submit({ ...VALID, email: 'a'.repeat(260) + '@example.test' }));
  assert.equal(h.rows.length, 1);
});

for (const prefix of ['=', '+', '-', '@']) {
  test(`formula-like name beginning with ${prefix} is escaped before write`, () => {
    const h = harness();
    success(h.submit({ ...VALID, name: prefix + 'TEST' }));
    assert.equal(h.rows[1][1], "'" + prefix + 'TEST');
  });
}

test('formula-like email and international phone are escaped before write', () => {
  const h = harness();
  success(h.submit({ ...VALID, email: '=TEST@example.com', phone: '+14155550100' }));
  assert.equal(h.rows[1][2], "'=test@example.com");
  assert.equal(h.rows[1][3], "'+14155550100");
});

test('whitespace before a formula-like name is removed before escaping', () => {
  const h = harness();
  success(h.submit({ ...VALID, name: '\t\r=TEST' }));
  assert.equal(h.rows[1][1], "'=TEST");
});

test('missing destination tab returns failure and releases its lock', () => {
  const h = harness({ missingSheet: true });
  failure(h.submit());
  assert.equal(h.events.includes('append'), false);
  released(h);
});

for (const stage of ['open', 'read', 'append', 'flush']) {
  test(`${stage} failure returns failure and releases its lock`, () => {
    const h = harness({ failAt: stage });
    failure(h.submit());
    assert.equal(h.events.includes('error'), true);
    released(h);
    if (stage !== 'flush') assert.equal(h.rows.length, 1);
    // A flush error does not promise rollback of an already-appended row.
    else assert.equal(h.rows.length, 2);
  });
}

test('lock timeout returns failure without accessing the sheet or releasing an unheld lock', () => {
  const h = harness({ failAt: 'lock' });
  failure(h.submit());
  assert.deepEqual(h.events, ['getLock', 'waitLock', 'error']);
  assert.equal(h.isLocked(), false);
  assert.equal(h.rows.length, 1);
});

for (const [label, rows] of [
  ['empty sheet', []],
  ['blank header row', [[]]],
  ['first signup in row 1', [['', 'Existing', VALID.email, '', 'General fitness', 'Beginner', 'iPhone', 'Yes', 'New', '', '', '']]],
  ['missing Email header', [HEADERS.map((header, i) => i === 2 ? '' : header)]],
  ['swapped Name and Email columns', [HEADERS.map((header, i) => i === 1 ? 'Email' : i === 2 ? 'Name' : header)]],
  ['missing trailing headers', [HEADERS.slice(0, 9)]],
]) {
  test(`${label} is refused without modifying any sheet content`, () => {
    const h = harness({ rows });
    const before = h.rows.map(row => [...row]);
    failure(h.submit());
    failure(h.submit());
    assert.deepEqual(h.rows, before);
    assert.equal(h.events.includes('append'), false);
    assert.equal(h.events.includes('flush'), false);
    assert.equal(h.events.includes('readEmails'), false);
    assert.equal(h.events.filter(event => event === 'releaseLock').length, 2);
    assert.equal(h.isLocked(), false);
  });
}

for (let column = 0; column < HEADERS.length; column++) {
  test(`unexpected ${HEADERS[column]} header is refused`, () => {
    const h = harness({ rows: [HEADERS.map((header, index) => index === column ? 'Wrong column' : header)] });
    failure(h.submit());
    assert.equal(h.events.includes('append'), false);
    assert.equal(h.rows.length, 1);
    released(h);
  });
}

test('read header validation before querying existing signup emails', () => {
  const h = harness({ rows: [HEADERS, ['', 'Existing', 'another@example.com']] });
  success(h.submit());
  assert.ok(h.events.indexOf('readHeaders') < h.events.indexOf('readEmails'));
  assert.ok(h.events.indexOf('readEmails') < h.events.indexOf('append'));
});

test('manifest uses only the required Sheets and send-mail scopes with public owner execution', () => {
  const manifest = JSON.parse(fs.readFileSync(path.join(__dirname, '../integrations/app-interest/appsscript.json'), 'utf8'));
  assert.deepEqual(manifest.oauthScopes, [
    'https://www.googleapis.com/auth/spreadsheets',
    'https://www.googleapis.com/auth/script.send_mail'
  ]);
  assert.deepEqual(manifest.webapp, { access: 'ANYONE_ANONYMOUS', executeAs: 'USER_DEPLOYING' });
  assert.equal(manifest.runtimeVersion, 'V8');
});
