import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { createRequire } from 'node:module';

const singapore = 'https://tstpdetsvslhwmohzxji.supabase.co';
const target = process.env.LAUNDRY_TEST_SUPABASE_URL ?? 'http://127.0.0.1:54321';
const url = URL.parse(target);
const hosted = target === singapore || target === `${singapore}/`;
const loopback = url && ['http:', 'https:'].includes(url.protocol) &&
  ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname) &&
  url.href === `${url.origin}/`;
assert(
  loopback || (hosted && process.argv.includes('--allow-singapore-test')),
  'Use a loopback base URL or the exact Singapore test URL with --allow-singapore-test.'
);

const publishableKey = process.env.LAUNDRY_TEST_PUBLISHABLE_KEY;
const serviceKey = process.env.LAUNDRY_TEST_SERVICE_KEY;
assert(publishableKey && serviceKey && publishableKey !== serviceKey, 'Set both API keys in the process environment.');
assert(!publishableKey.startsWith('sb_secret_'), 'Use a publishable or local anon key for user tests.');
const hostedEmails = [process.env.LAUNDRY_TEST_EMAIL_A, process.env.LAUNDRY_TEST_EMAIL_B]
  .map((email) => email?.trim().toLowerCase());
if (hosted) {
  assert(
    hostedEmails.every((email) => email && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) &&
      hostedEmails[0] !== hostedEmails[1],
    'Set LAUNDRY_TEST_EMAIL_A and LAUNDRY_TEST_EMAIL_B to two distinct, unused addresses you control.'
  );
}

const require = createRequire(new URL('../../apps/mobile/package.json', import.meta.url));
const { createClient } = require('@supabase/supabase-js');
const connect = (key, storage) => createClient(url.origin, key, {
  auth: { autoRefreshToken: false, detectSessionInUrl: false, persistSession: !!storage, storage },
  global: {
    fetch: (input, init) => {
      const requestUrl = new URL(input instanceof Request ? input.url : input);
      assert(requestUrl.origin === url.origin, 'SDK request escaped the test origin.');
      return fetch(input, { ...init, redirect: 'error' });
    },
  },
});
const service = connect(serviceKey);
const anon = connect(publishableKey);
const b = connect(publishableKey);
const values = new Map();
const storage = {
  getItem: (key) => values.get(key) ?? null,
  setItem: (key, value) => values.set(key, value),
  removeItem: (key) => values.delete(key),
};
const signup = connect(publishableKey, storage);
const accounts = [];

function ok(result, label) {
  assert(!result.error, `${label} failed (${result.error?.code ?? result.error?.status})`);
  return result.data;
}

function denied(result, label) {
  assert(
    result.error?.code === '42501',
    `${label} should be denied (${result.error?.code ?? result.status})`
  );
}

async function register(client, role, email = `laundry-${randomUUID()}@example.com`) {
  const password = randomUUID();
  const runId = randomUUID();
  const credentials = { email, password };
  const { user } = ok(await client.auth.signUp({
    ...credentials,
    options: { data: { role, display_name: 'Injected', app_metadata: { role: 'admin' }, laundry_test_run: runId } },
  }), 'signup');
  assert(user?.id, 'signup should return a user ID');
  if (hosted) {
    const { user: stored } = ok(await service.auth.admin.getUserById(user.id), 'verify disposable signup');
    assert(stored?.email?.toLowerCase() === email && stored.user_metadata?.laundry_test_run === runId,
      'Signup did not return a newly created disposable account.');
  }
  accounts.push(user.id);
  console.log('PASS signup');
  if (hosted) {
    ok(await service.auth.admin.updateUserById(user.id, { email_confirm: true }), 'admin confirmation');
    console.log('PASS administrative confirmation (email delivery and verification link are outside this test)');
  }
  const { session } = ok(await client.auth.signInWithPassword(credentials), 'password sign-in');
  assert(session?.access_token && session.user.id === user.id, 'Password sign-in did not create the expected session.');
  console.log('PASS password sign-in');
  return user.id;
}

try {
  const first = { id: await register(signup, 'admin', hosted ? hostedEmails[0] : undefined) };
  // Recreate the SDK client with the same storage to exercise session restoration.
  const a = connect(publishableKey, storage);
  assert.equal(ok(await a.auth.getSession(), 'restore session').session?.user.id, first.id);
  assert.equal(ok(await a.auth.getUser(), 'validate restored token with Auth').user?.id, first.id);
  assert.equal(ok(await a.auth.refreshSession(), 'refresh session').session?.user.id, first.id);
  console.log('PASS session restore, token validation, and refresh');
  const second = { id: await register(b, 'laundry_partner', hosted ? hostedEmails[1] : undefined) };

  const provisioned = ok(await service.from('user_roles').select('user_id, role')
    .in('user_id', [first.id, second.id]), 'read provisioned roles');
  assert.equal(provisioned.length, 2);
  for (const id of [first.id, second.id]) {
    assert.deepEqual(provisioned.filter((row) => row.user_id === id), [{ user_id: id, role: 'customer' }]);
  }

  const initial = ok(await a.from('profiles').select().eq('id', first.id).single(), 'read own profile');
  assert.equal(initial.display_name, 'Customer');
  assert.equal(initial.phone, null);
  const updated = ok(await a.from('profiles')
    .update({ display_name: 'Test Customer', phone: '+919876543210' })
    .eq('id', first.id).select().single(), 'update own profile');
  assert.equal(updated.display_name, 'Test Customer');
  assert.equal(updated.phone, '+919876543210');
  assert(Date.parse(updated.updated_at) >= Date.parse(initial.updated_at));
  assert.equal((await a.from('profiles').update({ phone: 'bad' }).eq('id', first.id)).error?.code, '23514');
  denied(await a.from('profiles').update({ updated_at: initial.updated_at }).eq('id', first.id), 'timestamp edit');
  denied(await anon.from('profiles').select(), 'unauthenticated profile read');
  assert.deepEqual(ok(await a.from('profiles').select().eq('id', second.id), 'cross-user read'), []);
  assert.deepEqual(ok(await a.from('profiles').update({ display_name: 'Blocked' })
    .eq('id', second.id).select(), 'cross-user update'), []);
  assert.equal(ok(await b.from('profiles').select('display_name').eq('id', second.id).single(),
    'read second profile').display_name, 'Customer');
  console.log('PASS default roles, profile read/update, validation, anonymous denial, and cross-user isolation');
  denied(await a.from('user_roles').select(), 'customer role read');
  for (const user_id of [first.id, second.id]) {
    denied(await a.from('user_roles').insert({ user_id, role: 'admin' }), 'role escalation');
  }
  denied(await a.from('user_roles').update({ role: 'admin' }).eq('user_id', first.id), 'role update');
  denied(await a.from('user_roles').delete().eq('user_id', first.id), 'role deletion');
  console.log('PASS unauthorized role read, insert, update, and delete denied');

  ok(await a.auth.signOut(), 'sign out');
  assert.equal(ok(await a.auth.getSession(), 'session after sign-out').session, null);
  denied(await a.from('profiles').select(), 'profile read after sign-out');
  console.log('PASS sign-out and post-sign-out profile denial');

  ok(await service.auth.admin.deleteUser(first.id), 'delete Auth account');
  accounts.splice(accounts.indexOf(first.id), 1);
  for (const [table, column] of [['profiles', 'id'], ['user_roles', 'user_id']]) {
    assert.deepEqual(ok(await service.from(table).select().eq(column, first.id), `verify ${table} cascade`), []);
  }
  console.log('PASS account deletion and profile/role cascades');
} catch (error) {
  // SDK responses and generated assertions can contain account or session data.
  console.error(error instanceof assert.AssertionError && !error.generatedMessage
    ? `FAIL ${error.message}` : 'FAIL Unexpected result in the next smoke-test check.');
  process.exitCode = 1;
} finally {
  let cleaned = true;
  for (const result of await Promise.all(accounts.map((id) => service.auth.admin.deleteUser(id)))) {
    if (result.error) {
      cleaned = false;
      console.error('A disposable Auth user could not be cleaned up.');
      process.exitCode = 1;
    }
  }
  if (cleaned && accounts.length) console.log('PASS remaining disposable accounts deleted');
}
