-- Tally — initial schema migration.
-- Mirrors the local SQLite model in `src/db/tallySchema.ts` (except `app_settings`,
-- which is device-local). Mirrors `supabase/tally_remote_schema.sql`; keep the
-- two in sync when adding columns / tables.
--
-- All statements are idempotent (`if not exists` / `drop if exists` + recreate),
-- so this file is safe to re-apply to a partially-populated database.

-- ---------------------------------------------------------------------------
-- Sync tables (ids are UUID text from the app, timestamps stored as ISO text).
-- ---------------------------------------------------------------------------

create table if not exists public.feedback_reports (
  id            text not null primary key,
  kind          text not null,
  title         text,
  message       text,
  details_json  text,
  created_at    text not null,
  last_modified text not null
);
create index if not exists feedback_reports_by_kind
  on public.feedback_reports (kind, created_at);

create table if not exists public.users (
  id            text not null primary key,
  name          text not null,
  email         text,
  avatar_uri    text,
  last_modified text not null
);
-- Column added after initial deploys; keep the `alter` for existing databases.
alter table public.users add column if not exists avatar_uri text;

create table if not exists public.groups (
  id             text    not null primary key,
  name           text    not null,
  currency       text    not null,
  icon           text,
  group_type     text,
  simplify_debts integer not null default 1,
  created_at     text    not null,
  last_modified  text    not null
);

create table if not exists public.group_members (
  id            text not null primary key,
  group_id      text not null,
  user_id       text not null,
  joined_at     text not null,
  last_modified text not null,
  role          text not null default 'collaborator'
);
create index if not exists group_members_by_group on public.group_members (group_id);
create index if not exists group_members_by_user  on public.group_members (user_id);
create index if not exists group_members_pair     on public.group_members (group_id, user_id);
-- Existing deployments: ensure the role column is present (collaborator = full access, viewer = read-only).
alter table public.group_members
  add column if not exists role text not null default 'collaborator';

create table if not exists public.group_invites (
  id                 text not null primary key,
  group_id           text not null,
  email              text not null,
  role               text not null,
  token              text not null unique,
  invited_by_user_id text not null,
  created_at         text not null,
  last_modified      text not null,
  accepted_at        text
);
create index if not exists group_invites_by_group on public.group_invites (group_id);
create index if not exists group_invites_by_token on public.group_invites (token);

create table if not exists public.expenses (
  id            text    not null primary key,
  group_id      text    not null,
  payer_id      text    not null,
  amount_minor  integer not null,
  description   text    not null,
  expense_date  text    not null,
  created_at    text    not null,
  category      text,
  notes         text,
  last_modified text    not null
);
create index if not exists expenses_by_group on public.expenses (group_id, created_at);

create table if not exists public.splits (
  id            text    not null primary key,
  expense_id    text    not null,
  user_id       text    not null,
  owed_minor    integer not null,
  last_modified text    not null
);
create index if not exists splits_by_expense on public.splits (expense_id);

create table if not exists public.settlements (
  id            text    not null primary key,
  group_id      text    not null,
  from_user_id  text    not null,
  to_user_id    text    not null,
  amount_minor  integer not null,
  settled_at    text    not null,
  last_modified text    not null
);
create index if not exists settlements_by_group on public.settlements (group_id);

-- ---------------------------------------------------------------------------
-- RLS for the sync tables. Dev-friendly `all-true` policies; replace with
-- `auth.uid()::text`-based rules before a public release (see the note in
-- `tally_remote_schema.sql`).
-- ---------------------------------------------------------------------------

alter table public.feedback_reports enable row level security;
alter table public.users            enable row level security;
alter table public.groups           enable row level security;
alter table public.group_members    enable row level security;
alter table public.group_invites    enable row level security;
alter table public.expenses         enable row level security;
alter table public.splits           enable row level security;
alter table public.settlements      enable row level security;

drop policy if exists "tally_sync_all" on public.feedback_reports;
drop policy if exists "tally_sync_all" on public.users;
drop policy if exists "tally_sync_all" on public.groups;
drop policy if exists "tally_sync_all" on public.group_members;
drop policy if exists "tally_sync_all" on public.group_invites;
drop policy if exists "tally_sync_all" on public.expenses;
drop policy if exists "tally_sync_all" on public.splits;
drop policy if exists "tally_sync_all" on public.settlements;

create policy "tally_sync_all" on public.feedback_reports for all using (true) with check (true);
create policy "tally_sync_all" on public.users            for all using (true) with check (true);
create policy "tally_sync_all" on public.groups           for all using (true) with check (true);
create policy "tally_sync_all" on public.group_members    for all using (true) with check (true);
create policy "tally_sync_all" on public.group_invites    for all using (true) with check (true);
create policy "tally_sync_all" on public.expenses         for all using (true) with check (true);
create policy "tally_sync_all" on public.splits           for all using (true) with check (true);
create policy "tally_sync_all" on public.settlements      for all using (true) with check (true);

-- Realtime: publications are managed in the Dashboard (Database → Publications →
-- `supabase_realtime`). Add the eight `public` tables above if you use live
-- updates. Not scripted here because re-running `alter publication ... add`
-- errors with "already member" when the table is already published.

-- ---------------------------------------------------------------------------
-- Auth profiles (Premium / cross-device preferences). Bound to `auth.users`.
-- ---------------------------------------------------------------------------

create table if not exists public.profiles (
  id                uuid        not null primary key references auth.users (id) on delete cascade,
  is_premium        boolean     not null default false,
  is_alpha          boolean     not null default false,
  preferred_locale  text,
  default_currency  text,
  appearance        text        check (appearance is null or appearance in ('light', 'dark', 'system')),
  updated_at        timestamptz not null default now()
);

-- Existing deployments: ensure columns added after the initial roll-out exist.
alter table public.profiles add column if not exists is_alpha boolean not null default false;
alter table public.profiles add column if not exists preferred_locale text;
alter table public.profiles add column if not exists default_currency text;
alter table public.profiles add column if not exists appearance       text;

alter table public.profiles enable row level security;

drop policy if exists "profiles_select_own" on public.profiles;
create policy "profiles_select_own" on public.profiles
  for select to authenticated
  using (auth.uid() = id);

drop policy if exists "profiles_update_own" on public.profiles;
create policy "profiles_update_own" on public.profiles
  for update to authenticated
  using (auth.uid() = id)
  with check (auth.uid() = id);

drop policy if exists "profiles_insert_own" on public.profiles;
create policy "profiles_insert_own" on public.profiles
  for insert to authenticated
  with check (auth.uid() = id);

-- Account-delete flow needs to remove the profile row from the client.
-- Without this policy PostgREST silently returns "0 rows affected" on the
-- DELETE and the row stays forever.
drop policy if exists "profiles_delete_own" on public.profiles;
create policy "profiles_delete_own" on public.profiles
  for delete to authenticated
  using (auth.uid() = id);

-- Auto-seed a profile row for every new Supabase auth user so the app can
-- `update` immediately after sign-up without a prior `insert`.
create or replace function public.tally_handle_new_user_profile()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id) values (new.id)
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created_profiles on auth.users;
create trigger on_auth_user_created_profiles
  after insert on auth.users
  for each row execute procedure public.tally_handle_new_user_profile();

-- Backfill for existing users created before this migration. Safe no-op
-- if the profile row already exists.
insert into public.profiles (id)
  select id from auth.users
  on conflict (id) do nothing;
