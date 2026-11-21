-- Run with psql -v ON_ERROR_STOP=1 against a disposable, migrated database.
begin;

create function pg_temp.assert_true(ok boolean, description text)
returns void language plpgsql as $$
begin
  if ok is distinct from true then
    raise exception 'Assertion failed: %', description;
  end if;
end;
$$;

create function pg_temp.expect_error(command text, expected_sqlstate text)
returns void language plpgsql security invoker as $$
begin
  execute command;
  raise exception 'Expected SQLSTATE % for %', expected_sqlstate, command;
exception when others then
  if sqlstate <> expected_sqlstate then
    raise;
  end if;
end;
$$;

select pg_temp.assert_true(
  not (select rolbypassrls or rolsuper from pg_catalog.pg_roles
       where rolname = 'supabase_auth_admin')
  and pg_catalog.has_schema_privilege('supabase_auth_admin', 'public', 'USAGE')
  and not pg_catalog.has_schema_privilege('supabase_auth_admin', 'laundry_private', 'USAGE')
  and not pg_catalog.has_function_privilege('supabase_auth_admin',
    'laundry_private.provision_customer()', 'EXECUTE'),
  'Auth can access public tables but cannot resolve or execute the private function directly'
);

-- Replay the trigger for each signup in this transaction.
create trigger laundry_test_repeat_provision
  after insert on auth.users
  for each row execute function laundry_private.provision_customer();

set local role supabase_auth_admin;
insert into auth.users (id, raw_user_meta_data)
values
  ('10000000-0000-4000-8000-000000000001', '{"role":"admin","display_name":"Injected"}'),
  ('10000000-0000-4000-8000-000000000002', '{"role":"laundry_partner"}');

select pg_temp.expect_error($sql$
  insert into public.user_roles (user_id, role)
  values ('10000000-0000-4000-8000-000000000001', 'admin')
$sql$, '42501');
reset role;
drop trigger laundry_test_repeat_provision on auth.users;

select pg_temp.assert_true(
  (select count(*) = 2 and bool_and(role = 'customer') from public.user_roles
   where user_id in ('10000000-0000-4000-8000-000000000001',
                     '10000000-0000-4000-8000-000000000002')),
  'duplicate provisioning grants only one customer role per user despite hostile metadata'
);
select pg_temp.assert_true(
  (select count(*) = 2 and bool_and(display_name = 'Customer'
     and phone is null and created_at = updated_at) from public.profiles
   where id in ('10000000-0000-4000-8000-000000000001',
                '10000000-0000-4000-8000-000000000002')),
  'duplicate provisioning creates exactly one default profile per user'
);
select pg_temp.assert_true(
  not pg_catalog.has_function_privilege('authenticated',
    'laundry_private.provision_customer()', 'EXECUTE')
  and not pg_catalog.has_function_privilege('anon',
    'laundry_private.provision_customer()', 'EXECUTE'),
  'API roles cannot execute the provisioning function'
);

set local role anon;
select pg_temp.expect_error('select * from public.profiles', '42501');
select pg_temp.expect_error('select * from public.user_roles', '42501');
reset role;

set local role authenticated;
select pg_catalog.set_config('request.jwt.claim.sub', '10000000-0000-4000-8000-000000000001', true);
select pg_catalog.set_config('request.jwt.claims',
  '{"sub":"10000000-0000-4000-8000-000000000001","role":"authenticated","is_anonymous":false}', true);

select pg_temp.assert_true(
  (select count(*) = 1 and bool_and(id = auth.uid()) from public.profiles),
  'only the caller profile is visible'
);
with changed as (
  update public.profiles set display_name = 'Cross-user edit'
  where id = '10000000-0000-4000-8000-000000000002' returning id
)
select pg_temp.assert_true(count(*) = 0, 'cross-user update affects zero rows') from changed;

with changed as (
  update public.profiles set display_name = 'Test Customer', phone = '+919876543210'
  where id = auth.uid() returning *
)
select pg_temp.assert_true(
  count(*) = 1 and bool_and(display_name = 'Test Customer'
    and phone = '+919876543210' and updated_at > created_at),
  'own fields update and the database advances updated_at'
) from changed;

with changed as (
  update public.profiles set phone = null where id = auth.uid() returning phone
)
select pg_temp.assert_true(count(*) = 1 and count(phone) = 0, 'phone can be cleared') from changed;

select pg_temp.expect_error('update public.profiles set display_name = ''   ''', '23514');
select pg_temp.expect_error('update public.profiles set phone = ''invalid''', '23514');
select pg_temp.expect_error('update public.profiles set id = auth.uid()', '42501');
select pg_temp.expect_error('update public.profiles set created_at = now()', '42501');
select pg_temp.expect_error('update public.profiles set updated_at = now()', '42501');
select pg_temp.expect_error('insert into public.profiles (id) values (auth.uid())', '42501');
select pg_temp.expect_error('delete from public.profiles where id = auth.uid()', '42501');

select pg_temp.expect_error('select * from public.user_roles', '42501');
select pg_temp.expect_error($sql$
  insert into public.user_roles (user_id, role) values (auth.uid(), 'admin')
$sql$, '42501');
select pg_temp.expect_error($sql$
  insert into public.user_roles (user_id, role)
  values ('10000000-0000-4000-8000-000000000002', 'admin')
$sql$, '42501');
select pg_temp.expect_error('update public.user_roles set role = ''laundry_partner''', '42501');
select pg_temp.expect_error('delete from public.user_roles', '42501');

select pg_catalog.set_config('request.jwt.claims',
  '{"sub":"10000000-0000-4000-8000-000000000001","role":"authenticated","is_anonymous":true}', true);
select pg_temp.assert_true(
  (select count(*) = 0 from public.profiles),
  'Supabase anonymous sign-in cannot read a profile'
);
with changed as (update public.profiles set phone = null returning id)
select pg_temp.assert_true(count(*) = 0, 'anonymous sign-in cannot update a profile') from changed;
reset role;

set local role service_role;
with changed as (
  update public.profiles set display_name = 'Support edit'
  where id = '10000000-0000-4000-8000-000000000002' returning display_name
)
select pg_temp.assert_true(
  count(*) = 1 and bool_and(display_name = 'Support edit'),
  'service role can read and maintain profile contact fields'
) from changed;
select pg_temp.expect_error('update public.profiles set id = id', '42501');
select pg_temp.expect_error('update public.profiles set updated_at = now()', '42501');
select pg_temp.expect_error($$insert into public.profiles (id)
  values ('10000000-0000-4000-8000-000000000001')$$, '42501');
select pg_temp.expect_error('delete from public.profiles', '42501');
select pg_temp.expect_error('update public.user_roles set role = ''admin''', '42501');

insert into public.user_roles (user_id, role)
values ('10000000-0000-4000-8000-000000000001', 'delivery_partner'),
       ('10000000-0000-4000-8000-000000000001', 'laundry_partner');
with revoked as (
  delete from public.user_roles
  where user_id = '10000000-0000-4000-8000-000000000001'
    and role = 'laundry_partner'
  returning role
)
select pg_temp.assert_true(count(*) = 1, 'service role can revoke a role') from revoked;
select pg_temp.expect_error($sql$
  insert into public.user_roles (user_id, role)
  values ('10000000-0000-4000-8000-000000000001', 'customer')
$sql$, '23505');
select pg_temp.expect_error($sql$
  insert into public.user_roles (user_id, role)
  values ('10000000-0000-4000-8000-000000000001', 'other')
$sql$, '23514');
reset role;

delete from auth.users where id = '10000000-0000-4000-8000-000000000001';
select pg_temp.assert_true(
  not exists (select from public.profiles where id = '10000000-0000-4000-8000-000000000001')
  and not exists (select from public.user_roles where user_id = '10000000-0000-4000-8000-000000000001'),
  'deleting an Auth user removes the profile and every role'
);

rollback;
