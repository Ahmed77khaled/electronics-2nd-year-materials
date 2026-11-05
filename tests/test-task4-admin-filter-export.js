/**
 * Task 4 acceptance tests: dashboard filters and CSV exports must share the same scope.
 * Also exercises the production CSV escaping helpers without requiring Supabase credentials.
 */
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const assert = require('assert');

const root = path.join(__dirname, '..');
const adapter = fs.readFileSync(path.join(root, 'js', 'admin', 'supabase-adapter.js'), 'utf8');
const workflow = fs.readFileSync(path.join(root, '.github', 'workflows', 'portal-tests.yml'), 'utf8');

const tests = [];
function testCase(name, fn) {
  tests.push({ name, fn });
}

function extractFunction(name, signature) {
  const escaped = signature || name;
  const match = adapter.match(new RegExp('function ' + escaped + '\\([^)]*\\) \\{[\\s\\S]*?\\n  \\}'));
  assert(match, 'Could not find production helper ' + name);
  return match[0];
}

testCase('Date filters apply both inclusive lower and upper bounds', function () {
  const block = extractFunction('addDateRange');
  assert(block.includes("query.gte(column, f.from)"));
  assert(block.includes("query.lte(column, f.to)"));
});

testCase('Large queries are paged and database errors are not silently converted to empty arrays', function () {
  const block = extractFunction('fetchAllRows');
  assert(block.includes('.range(offset, offset + size - 1)'));
  assert(block.includes('if (result.error) throw result.error'));
  assert(block.includes('offset += size'));
});

testCase('Activity filtering resolves student searches and resource-type IDs', function () {
  const block = extractFunction('resolveEventFilters');
  assert(block.includes("from('admin_student_summary')"));
  assert(block.includes('full_name'));
  assert(block.includes('email'));
  assert(block.includes("from('resources')"));
  assert(block.includes(".eq('resource_type', f.resourceType)"));
  assert(block.includes('impossible:'));
});

testCase('The shared event query applies date, user, session, course, event and resolved ID filters', function () {
  const block = extractFunction('buildEventQuery');
  ['occurred_at', 'f.userId', 'f.sessionId', 'f.courseId', 'f.eventName', "query.in('user_id'", "query.in('resource_id'"].forEach(function (part) {
    assert(block.includes(part), 'Missing event filter: ' + part);
  });
});

testCase('Overview metrics and chart series are computed from selected-period events and sessions', function () {
  const start = adapter.indexOf('async function getOverview(');
  const end = adapter.indexOf('// 3. getUsers', start);
  const block = adapter.slice(start, end);
  assert(block.includes('fetchFilteredEvents(client, f)'));
  assert(block.includes("admin_session_analytics"));
  assert(block.includes("f, 'started_at'"));
  assert(block.includes('activeUsers: activeUsersCount'));
  assert(block.includes('resourceClicks: totalResourceClicks'));
  assert(block.includes('dailyActive:'));
});

testCase('Sessions honor period, user search, course, status and duration before pagination', function () {
  const start = adapter.indexOf('async function getSessions(');
  const end = adapter.indexOf('// 7. getSessionDetails', start);
  const block = adapter.slice(start, end);
  ['f, \'started_at\'', 'f.search', 'f.sessionStatus', 'f.minSeconds', 'f.maxSeconds', 'f.courseId', 'fetchFilteredEvents', 'sortAndPage'].forEach(function (part) {
    assert(block.includes(part), 'Missing session filter: ' + part);
  });
});

testCase('Activity log applies date, text, course, event and resource-type filters with exact counts', function () {
  const start = adapter.indexOf('async function getActivityEvents(');
  const end = adapter.indexOf('// 9. getCourseAnalytics', start);
  const block = adapter.slice(start, end);
  assert(block.includes('resolveEventFilters(client, f)'));
  assert(block.includes('buildEventQuery(client, f, constraints, true)'));
  assert(block.includes("order('occurred_at'"));
  assert(block.includes('result.count == null ? events.length : result.count'));
  assert(block.includes('related.forEach(function (response) { if (response.error) throw response.error; })'));
});

testCase('Course analytics aggregates visits and engagement from filtered recorded events', function () {
  const start = adapter.indexOf('async function getCourseAnalytics(');
  const end = adapter.indexOf('// 10. getResourceAnalytics', start);
  const block = adapter.slice(start, end);
  assert(block.includes('fetchFilteredEvents(client, f)'));
  assert(block.includes("event.event_name === 'course_click'"));
  assert(block.includes('aggregate.resourceClicks++'));
  assert(block.includes('trend: trend'));
  assert(block.includes('topResources: topResources'));
});

testCase('Resource analytics honors selected course/type and builds a date series', function () {
  const start = adapter.indexOf('async function getResourceAnalytics(');
  const end = adapter.indexOf('// 11. exportReport', start);
  const block = adapter.slice(start, end);
  assert(block.includes('fetchFilteredEvents(client, f)'));
  assert(block.includes('resource.course_id !== f.courseId'));
  assert(block.includes('resource.resource_type !== f.resourceType'));
  assert(block.includes('var series = Object.keys(byDay)'));
});

testCase('Each CSV report uses the active filters and the correct scoped data source', function () {
  const start = adapter.indexOf('async function exportReport(');
  const end = adapter.indexOf('// 12. getFilterOptions', start);
  const block = adapter.slice(start, end);
  ['getSessions(f,', 'getCourseAnalytics(f)', 'getResourceAnalytics(f)', 'fetchFilteredEvents(client, f)',
    "type === 'users'", "type === 'daily'", 'Sessions in Period', 'Course Visits in Period'].forEach(function (part) {
    assert(block.includes(part), 'Missing export behavior: ' + part);
  });
  assert(block.includes('UNSUPPORTED_REPORT'));
  assert(block.includes('toCsv(headers, rows)'));
});

testCase('CSV escaping quotes commas and double quotes and neutralizes formula-leading text', function () {
  const csvCellSource = extractFunction('csvCell', 'csvCell');
  const sandbox = {};
  vm.runInNewContext(csvCellSource + '; this.csvCell = csvCell;', sandbox);
  assert.strictEqual(sandbox.csvCell('Smith, "Ahmed"'), '"Smith, ""Ahmed"""');
  assert.strictEqual(sandbox.csvCell('=HYPERLINK("x")'), '"\'=HYPERLINK(""x"")"');
  assert.strictEqual(sandbox.csvCell(42), '"42"');
});

testCase('CSV generation uses CRLF rows and every cell passes through the escaping helper', function () {
  const toCsvSource = extractFunction('toCsv', 'toCsv');
  const csvCellSource = extractFunction('csvCell', 'csvCell');
  const sandbox = {};
  vm.runInNewContext(csvCellSource + ';' + toCsvSource + '; this.toCsv = toCsv;', sandbox);
  assert.strictEqual(
    sandbox.toCsv(['Name', 'Value'], [['A, B', '1'], ['Line 2', 'x"y']]),
    '"Name","Value"\r\n"A, B","1"\r\n"Line 2","x""y"'
  );
});

testCase('Filter option lookup surfaces database errors and CI runs Task 4 acceptance tests', function () {
  const start = adapter.indexOf('async function getFilterOptions(');
  const end = adapter.indexOf('// 13. signOut', start);
  const block = adapter.slice(start, end);
  assert(block.includes('if (res.error) throw res.error'));
  assert(workflow.includes('node --check tests/test-task4-admin-filter-export.js'));
  assert(workflow.includes('node tests/test-task4-admin-filter-export.js'));
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
console.log('TASK 4 ACCEPTANCE: ' + (tests.length - failures) + '/' + tests.length + ' passed');
console.log('============================================================');
if (failures) process.exit(1);
