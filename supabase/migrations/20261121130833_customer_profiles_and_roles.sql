begin;

create schema laundry_private;
revoke all on schema laundry_private
  from public, anon, authenticated, service_role, supabase_auth_admin;

create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  display_name text not null default 'Customer',
  phone text,
  created_at timestamptz not null default pg_catalog.statement_timestamp(),
  updated_at timestamptz not null default pg_catalog.statement_timestamp(),
  constraint profiles_display_name_check check (
    pg_catalog.char_length(display_name) between 1 and 100
    and display_name = pg_catalog.btrim(display_name)
    and display_name ~ '[^[:space:]]'
    and display_name !~ '[[:cntrl:]]'
  ),
  constraint profiles_phone_check check (phone ~ '^[+][1-9][0-9]{1,14}$')
);

create table public.user_roles (
  user_id uuid not null references auth.users (id) on delete cascade,
  role text not null,
  primary key (user_id, role),
  constraint user_roles_role_check check (
    role in ('customer', 'laundry_partner', 'delivery_partner', 'admin')
  )
);

alter table public.profiles enable row level security;
alter table public.user_roles enable row level security;

-- Clear creation-time grants before opening the supported operations.
revoke all on table public.profiles, public.user_roles
  from public, anon, authenticated, service_role, supabase_auth_admin;
grant select, update (display_name, phone) on public.profiles to authenticated;
grant select, update (display_name, phone) on public.profiles to service_role;
grant select, insert (user_id, role), delete on public.user_roles to service_role;

-- The invoker needs schema USAGE even for schema-qualified statements.
grant usage on schema public to supabase_auth_admin;
grant insert (id) on public.profiles to supabase_auth_admin;
grant insert (user_id, role) on public.user_roles to supabase_auth_admin;

create policy profiles_select_own on public.profiles
  for select to authenticated
  using (
    id = (select auth.uid())
    and ((select auth.jwt()) ->> 'is_anonymous') is distinct from 'true'
  );

create policy profiles_update_own on public.profiles
  for update to authenticated
  using (
    id = (select auth.uid())
    and ((select auth.jwt()) ->> 'is_anonymous') is distinct from 'true'
  )
  with check (
    id = (select auth.uid())
    and ((select auth.jwt()) ->> 'is_anonymous') is distinct from 'true'
  );

create policy profiles_provision on public.profiles
  for insert to supabase_auth_admin
  with check (true); -- The grant permits only id; the other fields take their defaults.

create policy user_roles_provision_customer on public.user_roles
  for insert to supabase_auth_admin
  with check (role = 'customer');

create function laundry_private.provision_customer()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  -- Untargeted DO NOTHING handles primary-key conflicts without granting SELECT.
  insert into public.profiles (id) values (new.id) on conflict do nothing;
  insert into public.user_roles (user_id, role)
  values (new.id, 'customer') on conflict do nothing;
  return new;
end;
$$;

create function laundry_private.set_profile_updated_at()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  new.updated_at := pg_catalog.statement_timestamp();
  return new;
end;
$$;

revoke all on function laundry_private.provision_customer(),
  laundry_private.set_profile_updated_at()
  from public, anon, authenticated, service_role, supabase_auth_admin;

-- The creator needs EXECUTE to bind each trigger. Firing uses the stored
-- function reference and still checks the invoker's permissions on its SQL.
create trigger laundry_provision_customer
  after insert on auth.users
  for each row execute function laundry_private.provision_customer();

create trigger laundry_set_profile_updated_at
  before update on public.profiles
  for each row execute function laundry_private.set_profile_updated_at();

-- Installing the auth trigger first serializes the backfill with concurrent signups.
insert into public.profiles (id)
select id from auth.users;

insert into public.user_roles (user_id, role)
select id, 'customer' from auth.users;

commit;
