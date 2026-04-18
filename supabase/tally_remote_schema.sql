-- Tally — run once in the Supabase Dashboard → SQL → New query → Run.
-- Mirrors the local SQLite model in `src/db/tallySchema.ts` (except `app_settings`, device-only).
-- With no tables / RLS blocking access, the app will error on sync and you may see 0 API requests in metrics.
-- Security: this uses permissive policies for the anon (publishable) key. Lock down (e.g. auth.uid()) before public release.

-- Tables (ids are UUID text from the app, timestamps stored as ISO text like SQLite)
create table if not exists public.users (
  id text not null primary key,
  name text not null,
  email text,
  last_modified text not null
);

create table if not exists public.groups (
  id text not null primary key,
  name text not null,
  currency text not null,
  icon text,
  group_type text,
  simplify_debts integer not null default 1,
  created_at text not null,
  last_modified text not null
);

create table if not exists public.group_members (
  id text not null primary key,
  group_id text not null,
  user_id text not null,
  joined_at text not null,
  last_modified text not null
);
create index if not exists group_members_by_group on public.group_members (group_id);
create index if not exists group_members_by_user on public.group_members (user_id);
create index if not exists group_members_pair on public.group_members (group_id, user_id);

create table if not exists public.expenses (
  id text not null primary key,
  group_id text not null,
  payer_id text not null,
  amount_minor integer not null,
  description text not null,
  expense_date text not null,
  created_at text not null,
  category text,
  notes text,
  last_modified text not null
);
create index if not exists expenses_by_group on public.expenses (group_id, created_at);

create table if not exists public.splits (
  id text not null primary key,
  expense_id text not null,
  user_id text not null,
  owed_minor integer not null,
  last_modified text not null
);
create index if not exists splits_by_expense on public.splits (expense_id);

create table if not exists public.settlements (
  id text not null primary key,
  group_id text not null,
  from_user_id text not null,
  to_user_id text not null,
  amount_minor integer not null,
  settled_at text not null,
  last_modified text not null
);
create index if not exists settlements_by_group on public.settlements (group_id);

-- Access for PostgREST (anon key) — dev-friendly; replace for production
alter table public.users enable row level security;
alter table public.groups enable row level security;
alter table public.group_members enable row level security;
alter table public.expenses enable row level security;
alter table public.splits enable row level security;
alter table public.settlements enable row level security;

-- Drop and recreate if you re-run the script
drop policy if exists "tally_sync_all" on public.users;
drop policy if exists "tally_sync_all" on public.groups;
drop policy if exists "tally_sync_all" on public.group_members;
drop policy if exists "tally_sync_all" on public.expenses;
drop policy if exists "tally_sync_all" on public.splits;
drop policy if exists "tally_sync_all" on public.settlements;

create policy "tally_sync_all" on public.users for all using (true) with check (true);
create policy "tally_sync_all" on public.groups for all using (true) with check (true);
create policy "tally_sync_all" on public.group_members for all using (true) with check (true);
create policy "tally_sync_all" on public.expenses for all using (true) with check (true);
create policy "tally_sync_all" on public.splits for all using (true) with check (true);
create policy "tally_sync_all" on public.settlements for all using (true) with check (true);

-- Realtime (Database → Publications → `supabase_realtime`): add the six `public` tables
-- if you use in-app “live” updates. Re-run of `add table` may error with “already member”.
