/**
 * Task 1 acceptance tests: admin loading, route races, retry isolation and contract safety.
 * Run: node tests/test-task1-admin-loading.js
 */
'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');

const app = fs.readFileSync(path.join(__dirname, '../js/admin/app.js'), 'utf8');
const ui = fs.readFileSync(path.join(__dirname, '../js/admin/ui.js'), 'utf8');
const contract = fs.readFileSync(path.join(__dirname, '../js/admin/contract.js'), 'utf8');

new Function(app);
new Function(ui);

function extract(source, startMarker, endMarker) {
  const start = source.indexOf(startMarker);
  const end = source.indexOf(endMarker, start);
  assert(start >= 0 && end > start, 'Could not extract helper: ' + startMarker);
  return source.slice(start, end);
}

const helperSource = [
  'var routeVersion = 0;',
  'var ADMIN_LOADING_TIMEOUT_MS = 15000;',
  'var root = { console: { error: function(){}, warn: function(){} } };',
  'var U = { errorState: function(err) { return "ERR:" + err.code; } };',
  extract(app, '  function guard(', '  function withTimeout('),
  extract(app, '  function withTimeout(', '  function handleRetryClick('),
  extract(app, '  function handleRetryClick(', '  function timeline('),
  'return { guard: guard, withTimeout: withTimeout, handleRetryClick: handleRetryClick, bumpRoute: function(){ routeVersion++; } };'
].join('\n');

const api = new Function(helperSource)();

async function run(name, test) {
  try {
    await test();
    console.log('  ✅ PASS — ' + name);
    return true;
  } catch (error) {
    console.error('  ❌ FAIL — ' + name + ':', error);
    return false;
  }
}

(async function main() {
  const results = [];

  results.push(await run('JavaScript syntax: app.js and ui.js', async function () {
    new Function(app);
    new Function(ui);
  }));

  results.push(await run('routeVersion increments on route changes', async function () {
    assert(/function route\(\)\s*\{\s*routeVersion\+\+;/.test(app));
  }));

  results.push(await run('stale route success is ignored', async function () {
    const element = { isConnected: true, innerHTML: 'skeleton' };
    let resolve;
    const promise = new Promise(function (r) { resolve = r; });
    let rendered = false;
    const pending = api.guard(element, promise, function () { rendered = true; });
    api.bumpRoute();
    resolve('stale');
    await pending;
    assert.strictEqual(rendered, false);
  }));

  results.push(await run('stale route failure does not render an error', async function () {
    const element = { isConnected: true, innerHTML: 'current-page' };
    let reject;
    const promise = new Promise(function (_, r) { reject = r; });
    const pending = api.guard(element, promise, function () { throw new Error('must not render'); });
    api.bumpRoute();
    reject(new Error('old route failure'));
    await pending;
    assert.strictEqual(element.innerHTML, 'current-page');
  }));

  results.push(await run('newer request supersedes older request on same panel', async function () {
    const element = { isConnected: true, innerHTML: 'skeleton' };
    let resolveOld, resolveNew;
    const oldPromise = new Promise(function (r) { resolveOld = r; });
    const newPromise = new Promise(function (r) { resolveNew = r; });
    const oldPending = api.guard(element, oldPromise, function () { element.innerHTML = 'old'; });
    const newPending = api.guard(element, newPromise, function () { element.innerHTML = 'new'; });
    resolveNew();
    await newPending;
    resolveOld();
    await oldPending;
    assert.strictEqual(element.innerHTML, 'new');
  }));

  results.push(await run('custom request-generation predicate is respected', async function () {
    const element = { isConnected: true, innerHTML: 'current' };
    let resolve;
    const promise = new Promise(function (r) { resolve = r; });
    const pending = api.guard(element, promise, function () { element.innerHTML = 'stale'; }, null, function () { return false; });
    resolve();
    await pending;
    assert.strictEqual(element.innerHTML, 'current');
  }));

  results.push(await run('timeout displays error and retains panel retry', async function () {
    const element = { isConnected: true, innerHTML: 'skeleton' };
    const retry = function () {};
    await api.guard(element, new Promise(function () {}), function () {}, retry, null, 10);
    assert.strictEqual(element.innerHTML, 'ERR:TIMEOUT');
    assert.strictEqual(element._retry, retry);
  }));

  results.push(await run('late response after timeout is ignored', async function () {
    const element = { isConnected: true, innerHTML: 'skeleton' };
    let resolve;
    const slow = new Promise(function (r) { resolve = r; });
    await api.guard(element, slow, function (value) { element.innerHTML = value; }, null, null, 10);
    const timeoutState = element.innerHTML;
    resolve('late-data');
    await Promise.resolve();
    assert.strictEqual(element.innerHTML, timeoutState);
  }));

  results.push(await run('detached panel cannot be updated', async function () {
    const element = { isConnected: true, innerHTML: 'skeleton' };
    let resolve;
    const slow = new Promise(function (r) { resolve = r; });
    const pending = api.guard(element, slow, function () { element.innerHTML = 'updated'; });
    element.isConnected = false;
    resolve();
    await pending;
    assert.strictEqual(element.innerHTML, 'skeleton');
  }));

  results.push(await run('retry dispatches to its owning panel', async function () {
    let calls = 0, prevented = false;
    const panel = { _retry: function () { calls++; } };
    const errorState = { parentElement: panel };
    const button = { closest: function (selector) { return selector === '.state-err' ? errorState : null; } };
    const target = { closest: function (selector) { return selector === '[data-retry]' ? button : null; } };
    const handled = api.handleRetryClick({ target: target, preventDefault: function () { prevented = true; } });
    assert.strictEqual(handled, true);
    assert.strictEqual(calls, 1);
    assert.strictEqual(prevented, true);
  }));

  results.push(await run('AdminData calls match the registered contract', async function () {
    const allowed = new Set();
    const required = contract.match(/var REQUIRED = \[([\s\S]*?)\];/);
    const optional = contract.match(/var OPTIONAL = \[([\s\S]*?)\];/);
    assert(required, 'Required method list not found');
    for (const match of required[1].matchAll(/'([^']+)'/g)) allowed.add(match[1]);
    if (optional) for (const match of optional[1].matchAll(/'([^']+)'/g)) allowed.add(match[1]);
    const calls = Array.from(app.matchAll(/D\.call\(\s*'([^']+)'/g)).map(function (match) { return match[1]; });
    assert.deepStrictEqual(calls.filter(function (method) { return !allowed.has(method); }), []);
    assert(!/D\.call\('(getUserActivity|getSessionEvents|getResourceBreakdown)'/.test(app));
  }));

  results.push(await run('getUserSessions receives filters before pagination', async function () {
    assert(/D\.call\('getUserSessions',\s*id,\s*\{\},\s*\{/.test(app));
  }));

  results.push(await run('filter options refresh does not reroute the current page', async function () {
    assert(app.includes('refreshFilterSelectOptions();'));
    assert(!/then\(function \(options\) \{[\s\S]*?route\(\);/.test(app));
  }));

  results.push(await run('report export uses bounded timeout and ignores stale routes', async function () {
    assert(app.includes('withTimeout('));
    assert(app.includes('ADMIN_REPORT_TIMEOUT_MS'));
    assert(app.includes('startedOnRoute !== routeVersion'));
  }));

  const passed = results.filter(Boolean).length;
  console.log('============================================================');
  console.log('TASK 1 ACCEPTANCE: ' + passed + '/' + results.length + ' passed');
  console.log('============================================================');
  if (passed !== results.length) process.exit(1);
})();
