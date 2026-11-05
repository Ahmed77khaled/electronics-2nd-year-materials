/**
 * Task 8 acceptance tests: protected admin-only user deletion.
 */
'use strict';

const fs = require('fs');
const path = require('path');
const assert = require('assert');
const root = path.join(__dirname, '..');
const read = (p) => fs.readFileSync(path.join(root, p), 'utf8');

const app = read('js/admin/app.js');
const adapter = read('js/admin/supabase-adapter.js');
const contract = read('js/admin/contract.js');
const edge = read('supabase/functions/admin-delete-user/index.ts');
const config = read('supabase/config.toml');
const tests = [];

function testCase(name, fn) { tests.push({ name, fn }); }

testCase('Admin user profile shows a delete button only for real non-self accounts', function () {
  assert(app.includes("D.has('deleteUser') && !D.isMock()"));
  assert(app.includes('state.access.admin.id === u.id'));
  assert(app.includes('id="delete-user"'));
  assert(app.includes("deleteButton.addEventListener('click'"));
});

testCase('Deletion requires an explicit confirmation and reports success or failure', function () {
  assert(app.includes('root.confirm('));
  assert(app.includes('لا يمكن التراجع عن هذه الخطوة'));
  assert(app.includes("D.call('deleteUser', id)"));
  assert(app.includes("U.toast('تم حذف حساب المستخدم بنجاح', 'ok')"));
  assert(app.includes("'تعذّر حذف المستخدم'"));
});

testCase('Live adapter invokes the server-side Edge Function and the contract exposes it as optional', function () {
  assert(adapter.includes("client.functions.invoke('admin-delete-user'"));
  assert(adapter.includes('body: { userId: userId }'));
  assert(contract.includes("'deleteUser'"));
  assert(!adapter.includes('SUPABASE_SERVICE_ROLE_KEY'));
  assert(!adapter.includes('SUPABASE_SECRET_KEYS'));
});

testCase('Edge Function validates the JWT and verifies the caller admin role from the database', function () {
  assert(edge.includes('Authorization'));
  assert(edge.includes('adminClient.auth.getUser(tokenMatch[1])'));
  assert(edge.includes('.from("admin_users")'));
  assert(edge.includes('.eq("user_id", caller.id)'));
  assert(edge.includes('if (!callerAdmin)'));
});

testCase('Edge Function blocks self-deletion and protects all administrator accounts', function () {
  assert(edge.includes('targetUserId === caller.id'));
  assert(edge.includes('.eq("user_id", targetUserId)'));
  assert(edge.includes('if (targetAdmin)'));
});

testCase('Actual Auth deletion occurs only on the server with hard-delete semantics', function () {
  assert(edge.includes('adminClient.auth.admin.deleteUser(targetUserId, false)'));
  assert(edge.includes('getServerSecret()'));
  assert(edge.includes('SUPABASE_SERVICE_ROLE_KEY'));
  assert(edge.includes('SUPABASE_SECRET_KEYS'));
  assert(!/service_role|sb_secret_[A-Za-z0-9]+/.test(adapter));
  assert(config.includes('[functions.admin-delete-user]'));
  assert(config.includes('verify_jwt = true'));
});

testCase('Storage ownership errors are handled without deleting project resources', function () {
  assert(edge.includes('لا يمكن حذف الحساب لأنه يمتلك ملفات في Supabase Storage'));
  assert(!/delete\s+from\s+public\.(courses|resources)/i.test(edge));
});

(async function run() {
  let failures = 0;
  for (const item of tests) {
    try {
      await item.fn();
      console.log('  ✅ PASS — ' + item.name);
    } catch (error) {
      failures++;
      console.error('  ❌ FAIL — ' + item.name);
      console.error(error && error.stack ? error.stack : error);
    }
  }
  console.log('============================================================');
  console.log('TASK 8 ACCEPTANCE: ' + (tests.length - failures) + '/' + tests.length + ' passed');
  console.log('============================================================');
  if (failures) process.exit(1);
})();
