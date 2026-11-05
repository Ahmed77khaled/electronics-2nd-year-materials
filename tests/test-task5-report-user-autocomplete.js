/**
 * Task 5 acceptance tests: report user search must suggest matching account names,
 * and selecting one must scope every exported report to that exact user.
 */
const fs = require('fs');
const path = require('path');
const assert = require('assert');

const root = path.join(__dirname, '..');
const app = fs.readFileSync(path.join(root, 'js', 'admin', 'app.js'), 'utf8');
const adapter = fs.readFileSync(path.join(root, 'js', 'admin', 'supabase-adapter.js'), 'utf8');
const css = fs.readFileSync(path.join(root, 'css', 'admin.css'), 'utf8');
const workflow = fs.readFileSync(path.join(root, '.github', 'workflows', 'portal-tests.yml'), 'utf8');

const tests = [];
function testCase(name, fn) { tests.push({ name, fn }); }

function section(source, startMarker, endMarker) {
  const start = source.indexOf(startMarker);
  assert(start >= 0, 'Missing section start: ' + startMarker);
  const end = source.indexOf(endMarker, start);
  assert(end > start, 'Missing section end: ' + endMarker);
  return source.slice(start, end);
}

testCase('Reports search field is configured for student-name autocomplete', function () {
  const reportSection = section(app, 'function reports()', 'var NAV =');
  assert(reportSection.includes("ph: 'ابحث عن اسم المستخدم…', autocomplete: true"));
  assert(app.includes('data-autocomplete-list='));
  assert(app.includes('function bindReportUserAutocomplete(s)'));
});

testCase('Typing searches the user directory and renders selectable name/email suggestions', function () {
  const helper = section(app, 'function bindReportUserAutocomplete(s)', '// ---------------- Reports ----------------');
  [
    "D.call('getUsers'",
    'pageSize: 8',
    'query.length < 2',
    'data-user-suggestion',
    'user.email',
    "list.addEventListener('click'",
    's.f.userId = userId'
  ].forEach(function (part) { assert(helper.includes(part), 'Missing autocomplete behavior: ' + part); });
});

testCase('Autocomplete dropdown has overlay styling and usable selectable rows', function () {
  [
    '.autocomplete-wrap',
    '.autocomplete-list',
    '.autocomplete-option:hover',
    '.autocomplete-empty'
  ].forEach(function (selector) { assert(css.includes(selector), 'Missing autocomplete CSS: ' + selector); });
});

testCase('Selecting a user filters event queries by exact user ID instead of ambiguous text', function () {
  const resolve = section(adapter, 'function resolveEventFilters(', 'function buildEventQuery(');
  const query = section(adapter, 'function buildEventQuery(', 'async function fetchFilteredEvents(');
  assert(resolve.includes('f.search && !f.userId'));
  assert(query.includes("query.eq('user_id', f.userId)"));
});

testCase('Selected user identity scopes session and user CSV reports exactly', function () {
  const sessions = section(adapter, 'async function getSessions(', '// 7. getSessionDetails');
  const exports = section(adapter, 'async function exportReport(', '// 12. getFilterOptions');
  assert(sessions.includes("items.filter(function (item) { return item.userId === f.userId; })"));
  assert(exports.includes('if (f.userId && student.user_id !== f.userId) return false;'));
  assert(exports.includes('if (f.search && !f.userId)'));
});

testCase('CI syntax-checks and runs Task 5 autocomplete acceptance tests', function () {
  assert(workflow.includes('node --check tests/test-task5-report-user-autocomplete.js'));
  assert(workflow.includes('node tests/test-task5-report-user-autocomplete.js'));
});

let failures = 0;
for (const item of tests) {
  try {
    item.fn();
    console.log('  ✅ PASS — ' + item.name);
  } catch (error) {
    failures++;
    console.error('  ❌ FAIL — ' + item.name);
    console.error(error && error.stack ? error.stack : error);
  }
}
console.log('============================================================');
console.log('TASK 5 ACCEPTANCE: ' + (tests.length - failures) + '/' + tests.length + ' passed');
console.log('============================================================');
if (failures) process.exit(1);
