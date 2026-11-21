# Customer profile and role migration

[Migration](../supabase/migrations/20261121130833_customer_profiles_and_roles.sql) · [SQL access tests](../supabase/tests/customer_profiles_and_roles.sql) · [Auth and Data API smoke test](../supabase/tests/customer_profiles_api.mjs)

## Data and access

- Supabase Auth owns account identity. Each `public.profiles.id` is an Auth user UUID and each `public.user_roles.user_id` references an Auth user. Deleting an Auth account cascades to both tables. The profile primary key and the role table’s composite primary key cover both foreign-key lookups and enforce uniqueness.
- Profiles start with a display name of `Customer` and a null phone. Display names must have 1–100 characters, contain non-whitespace, exclude control characters, and have no leading or trailing spaces. Phone is optional and accepts an E.164-shaped value such as `+919876543210`. It is an unverified contact field and is separate from the Auth phone number. The database sets both timestamptz fields on creation and refreshes `updated_at` on updates.
- RLS and explicit grants apply independently. Authenticated users can read their own profile and update only `display_name` and `phone`. Cross-user reads and updates return zero rows. The unauthenticated API role has no profile access. Supabase anonymous sign-ins use the authenticated database role, so the profile policies also check the signed `is_anonymous` claim.
- The `user_roles` primary key allows one row per user and role. Valid roles are `customer`, `laundry_partner`, `delivery_partner`, and `admin`. The `anon` and `authenticated` roles have no role-table privileges. The trusted `service_role` can read profiles and update only `display_name` and `phone`. It can read, grant, and revoke role pairs using SELECT, INSERT, and DELETE. Profile creation stays with Auth and deletion cascades from hard deletion of the Auth account. Role changes use grant and revoke operations.
- Supabase's `service_role` bypasses RLS, so these operations can affect any account. Keep the service credential on the server in a separate client without user sessions. A backend exposing these operations must authenticate and authorize the actor, validate the target and requested role, and audit privileged changes. In particular, the secret can grant `admin` or revoke `customer`. [Supabase API keys](https://supabase.com/docs/guides/getting-started/api-keys)
- The `AFTER INSERT` trigger provisions the profile and only the `customer` role in the Auth insert transaction. The function references the two tables explicitly and uses `SECURITY INVOKER` with an empty search path. The migration grants `supabase_auth_admin` explicit `USAGE` on `public` and column-scoped INSERT on both tables. Its profile policy permits insertion with database defaults and its role policy permits only `customer`. Replayed provisioning skips primary-key conflicts, preserving existing values and requiring no SELECT grant. Provisioning and backfill use fixed values independent of account metadata.
- The migration role needs `TRIGGER` on `auth.users`, EXECUTE on its function at trigger creation, and SELECT on `auth.users` for the backfill. PostgreSQL binds the function when the trigger is created. When firing it, the invoker needs rights for the SQL inside the function. Both trigger functions deny direct EXECUTE to the API and Auth roles, and `laundry_private` must remain outside Data API exposure. [PostgreSQL 17 trigger privileges](https://www.postgresql.org/docs/17/sql-createtrigger.html)

## Review and test

Use a fresh, disposable local Supabase stack with Docker and the Supabase CLI. The repository has no local Supabase config yet. After `supabase init`, set `[db].major_version` to 17 and `[auth.email].enable_confirmations` to false for the disposable signup test. Confirm `public` is exposed and `laundry_private` is absent from the exposed schema list. Use the local database URL from `supabase status` for the SQL tests.

```powershell
git status --short
git diff --check
Get-Content supabase/migrations/20261121130833_customer_profiles_and_roles.sql

supabase init
supabase start
supabase status
supabase migration list --local
supabase db lint --local
supabase db advisors --local --type security
psql -X -v ON_ERROR_STOP=1 -d $LaundryLocalDatabaseUrl -f supabase/tests/customer_profiles_and_roles.sql
node supabase/tests/customer_profiles_api.mjs
```

Before the Node command, ensure the existing mobile dependencies are installed. Set `LAUNDRY_TEST_PUBLISHABLE_KEY` and `LAUNDRY_TEST_SERVICE_KEY` from the disposable stack's status in the current shell. The script accepts local publishable/secret keys or local legacy anon/service keys. The default API URL is `http://127.0.0.1:54321`. Set `LAUNDRY_TEST_SUPABASE_URL` for another loopback port. Keep credentials out of logs and Expo environment variables.

The SQL suite rolls back its fixtures. It checks Auth-role privileges and replayed provisioning, hostile metadata, role escalation, anonymous denial, cross-user isolation, profile validation, service-role operations and denials, role uniqueness, and cascading deletion. The API smoke test uses the mobile app's installed Supabase SDK to sign up and sign in with two email/password accounts, restore and refresh a session, sign out, exercise profile and role permissions via PostgREST, and hard-delete the disposable Auth accounts.

### Singapore test project

Singapore project `tstpdetsvslhwmohzxji` recorded `20261121130833_customer_profiles_and_roles`. The local filename matches that version. The reconciliation changed only the filename, so it requires no migration replay or history repair.

The reported Singapore integration run passed real Supabase Auth registration and administrative confirmation, password login, session restore, signed JWT validation and refresh, customer profile reads and updates, RLS restrictions and cross-user isolation, role escalation checks, logout, and disposable-account cleanup. Real email delivery and verification links have not been tested.

Set `LAUNDRY_TEST_PUBLISHABLE_KEY` and `LAUNDRY_TEST_SERVICE_KEY` for the Singapore test project in the process environment using your local secret manager or a secure prompt. Set `LAUNDRY_TEST_EMAIL_A` and `LAUNDRY_TEST_EMAIL_B` to two distinct addresses you control that have never been registered in this project. If the existing SMTP configuration restricts recipients, use addresses it already permits. Public signup can send email to these addresses. The script confirms the newly created accounts through the Auth admin API, so email delivery and confirmation link verification are outside the test.

```powershell
$env:LAUNDRY_TEST_SUPABASE_URL = 'https://tstpdetsvslhwmohzxji.supabase.co'
node supabase/tests/customer_profiles_api.mjs --allow-singapore-test
```

Use process-scoped credentials and close the test shell afterward. The hosted opt-in only permits the Singapore test origin. Access-denied checks require PostgreSQL code `42501`. A missing-table or schema-cache error such as `PGRST205` fails the test.

The SQL suite also passed locally on PostgreSQL 18 with a minimal Auth schema and simulated request claims. The hosted API run covers the SDK and Data API. Expo session persistence on device and profile UI wiring are separate work. The current Expo client still has placeholder database types and requires an HTTPS URL.

### Outstanding Singapore security advice

- Advisor 0028 reports that `anon` can execute the `SECURITY DEFINER` function `public.rls_auto_enable()` via `/rest/v1/rpc/rls_auto_enable`. [Advisor 0028](https://supabase.com/docs/guides/database/database-linter?lint=0028_anon_security_definer_function_executable)
- Advisor 0029 reports that `authenticated` can execute the same function. [Advisor 0029](https://supabase.com/docs/guides/database/database-linter?lint=0029_authenticated_security_definer_function_executable)

These findings remain open. Review the function's purpose, dependencies, and grants before approving remediation separately.

## Before Mumbai deployment

- Confirm the intended project is Mumbai `olryqllnyheqamkpcfzl` and check its migration history, migration-role privileges, and current security advisors during the separately approved deployment review. Resolve or explicitly disposition the Singapore findings and verify whether the same grants exist in Mumbai.
- Verify real email delivery and confirmation links in an isolated environment with the intended mail configuration before releasing customer signup.
- Review the existing Auth user count, the signup lock during backfill, and the backup and reversal plan. Obtain deployment approval for Mumbai.

## Operational considerations and reversal

- Provisioning failures roll back the Auth insert and can block signup. Verify that the hosted migration role can create the trigger and read Auth user IDs, and that actual signup works, in an authorized isolated Supabase environment before any Mumbai deployment.
- The migration installs the trigger before backfilling existing accounts. It holds a lock that can block Auth writes until the transaction commits. Review the existing account count and deploy during a suitable window. Profile timestamps for backfilled users record profile creation during migration.
- Contact data has privacy and retention implications. Keep profile payloads out of logs and verify the customer-data deletion and retention policy before launch.
- For a reviewed reversal, back up both tables and use a new migration with the statements below. This removes all profile and role data and stops provisioning. Later dependent objects will make the reversal fail until explicitly handled.
- The reversal leaves `public` schema USAGE for `supabase_auth_admin` because other Auth integrations may depend on it. Revoke that grant separately only if its pre-migration absence and current usage have been confirmed.

```sql
begin;
drop trigger laundry_provision_customer on auth.users;
drop trigger laundry_set_profile_updated_at on public.profiles;
drop table public.user_roles;
drop table public.profiles;
drop function laundry_private.provision_customer();
drop function laundry_private.set_profile_updated_at();
drop schema laundry_private;
commit;
```
