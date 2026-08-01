-- AI credit ledger — the currency that rewarded ads buy.
--
-- Two tables and two functions:
--   * ai_credit_balances  current balance per user (the hot read)
--   * ai_credit_events    append-only audit log (the source of truth)
--   * ai_credit_grant()   idempotent credit, keyed on (provider, external_id)
--   * ai_credit_spend()   conditional debit that cannot oversell
--
-- Every write happens through the two `security definer` functions, called
-- from Edge Functions with the service-role key. Clients get SELECT on their
-- own rows and nothing else — same posture as `profiles.is_premium` after
-- 20260502000000_lock_profiles_entitlements.sql. A client that could write
-- here could mint free AI requests, which is the entire threat model.

create table if not exists public.ai_credit_balances (
  user_id          uuid    not null primary key references auth.users (id) on delete cascade,
  balance          integer not null default 0 check (balance >= 0),
  lifetime_granted integer not null default 0,
  lifetime_spent   integer not null default 0,
  updated_at       timestamptz not null default now()
);

create table if not exists public.ai_credit_events (
  id          bigint generated always as identity primary key,
  user_id     uuid    not null references auth.users (id) on delete cascade,
  delta       integer not null,
  reason      text    not null check (reason in ('signup_grant', 'ad_reward', 'spend', 'refund', 'admin')),
  provider    text,
  external_id text,
  action      text,
  created_at  timestamptz not null default now()
);

-- The idempotency key. `coalesce(provider, '')` rather than a bare column
-- because NULLs compare as distinct in a unique index, which would let a
-- provider-less replay slip through.
create unique index if not exists ai_credit_events_provider_external
  on public.ai_credit_events (coalesce(provider, ''), external_id)
  where external_id is not null;

create index if not exists ai_credit_events_by_user
  on public.ai_credit_events (user_id, created_at desc);

-- Single-use challenge for ad networks with no server-to-server callback.
-- Unused by the AdMob path (which is verified by signature); this is the
-- seam phase 2 fills for Tapsell/Adivery.
create table if not exists public.ad_reward_nonces (
  nonce       text primary key,
  user_id     uuid not null references auth.users (id) on delete cascade,
  provider    text not null,
  issued_at   timestamptz not null default now(),
  expires_at  timestamptz not null,
  consumed_at timestamptz
);

create index if not exists ad_reward_nonces_by_expiry
  on public.ad_reward_nonces (expires_at);

-- ── RLS: read-your-own, write-never ──────────────────────────────────────

alter table public.ai_credit_balances enable row level security;
alter table public.ai_credit_events   enable row level security;
alter table public.ad_reward_nonces   enable row level security;

drop policy if exists "ai_credit_balances_select_own" on public.ai_credit_balances;
create policy "ai_credit_balances_select_own" on public.ai_credit_balances
  for select to authenticated
  using (auth.uid() = user_id);

drop policy if exists "ai_credit_events_select_own" on public.ai_credit_events;
create policy "ai_credit_events_select_own" on public.ai_credit_events
  for select to authenticated
  using (auth.uid() = user_id);

-- ad_reward_nonces gets no policy at all: clients never read or write it.

-- Column privileges as a second wall, independent of RLS. `revoke all`
-- rather than a narrower `insert, update, delete` because Supabase's
-- default grants also include TRUNCATE (and REFERENCES/TRIGGER) — and RLS
-- does not apply to TRUNCATE, so a narrower revoke would leave clients able
-- to `truncate` these tables outright. Re-grant only `select`.
revoke all on public.ai_credit_balances from anon, authenticated;
grant  select on public.ai_credit_balances to anon, authenticated;

revoke all on public.ai_credit_events from anon, authenticated;
grant  select on public.ai_credit_events to anon, authenticated;

revoke all on public.ad_reward_nonces from anon, authenticated;

-- ── ai_credit_grant ──────────────────────────────────────────────────────

create or replace function public.ai_credit_grant(
  p_user_id uuid,
  p_delta integer,
  p_reason text,
  p_provider text,
  p_external_id text
) returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  new_balance integer;
begin
  if p_delta <= 0 then
    raise exception 'ai_credit_grant requires a positive delta, got %', p_delta;
  end if;

  -- Idempotency. A replayed AdMob callback, or a retried claim, must be a
  -- no-op that still reports the current balance.
  if p_external_id is not null and exists (
    select 1 from public.ai_credit_events
     where coalesce(provider, '') = coalesce(p_provider, '')
       and external_id = p_external_id
  ) then
    select coalesce(balance, 0) into new_balance
      from public.ai_credit_balances where user_id = p_user_id;
    return coalesce(new_balance, 0);
  end if;

  insert into public.ai_credit_events (user_id, delta, reason, provider, external_id)
    values (p_user_id, p_delta, p_reason, p_provider, p_external_id);

  insert into public.ai_credit_balances (user_id, balance, lifetime_granted, updated_at)
    values (p_user_id, p_delta, p_delta, now())
  on conflict (user_id) do update
    set balance          = public.ai_credit_balances.balance + p_delta,
        lifetime_granted = public.ai_credit_balances.lifetime_granted + p_delta,
        updated_at       = now()
  returning balance into new_balance;

  return new_balance;
exception
  when unique_violation then
    -- Two copies of the same callback arrived concurrently and this one lost
    -- the race on ai_credit_events_provider_external. The other transaction
    -- granted; report the balance rather than failing the caller.
    select coalesce(balance, 0) into new_balance
      from public.ai_credit_balances where user_id = p_user_id;
    return coalesce(new_balance, 0);
end;
$$;

-- ── ai_credit_spend ──────────────────────────────────────────────────────

create or replace function public.ai_credit_spend(
  p_user_id uuid,
  p_action text
) returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  new_balance integer;
begin
  -- `and balance > 0` inside the UPDATE is what makes this safe under
  -- concurrency: the row lock is held for the check and the decrement
  -- together, so two simultaneous calls against a balance of 1 cannot both
  -- succeed. A read-then-write would oversell here.
  update public.ai_credit_balances
     set balance        = balance - 1,
         lifetime_spent = lifetime_spent + 1,
         updated_at     = now()
   where user_id = p_user_id
     and balance > 0
  returning balance into new_balance;

  if new_balance is null then
    return -1;
  end if;

  insert into public.ai_credit_events (user_id, delta, reason, action)
    values (p_user_id, -1, 'spend', p_action);

  return new_balance;
end;
$$;

-- Only the service role (Edge Functions) may call these directly.
revoke all on function public.ai_credit_grant(uuid, integer, text, text, text) from public, anon, authenticated;
revoke all on function public.ai_credit_spend(uuid, text)                      from public, anon, authenticated;
grant execute on function public.ai_credit_grant(uuid, integer, text, text, text) to service_role;
grant execute on function public.ai_credit_spend(uuid, text)                      to service_role;

-- ── Signup grant ─────────────────────────────────────────────────────────
--
-- Extends the existing profile-seeding trigger. Firing on `auth.users` insert
-- means this is once per account: reinstalling the app reuses the same
-- account and grants nothing further. The `external_id` makes it idempotent
-- even if the trigger is ever re-run against an existing row.
--
-- The amount lives here rather than in an Edge Function env var because a
-- Postgres trigger cannot read one. Changing it is a migration.

create or replace function public.tally_handle_new_user_profile()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id) values (new.id)
  on conflict (id) do nothing;

  begin
    perform public.ai_credit_grant(new.id, 5, 'signup_grant', null, 'signup:' || new.id::text);
  exception when others then
    -- A ledger problem must never block account creation. Losing the
    -- signup grant is recoverable (support can re-grant); losing signups
    -- is not.
    raise warning 'ai_credit_grant failed for new user %: %', new.id, sqlerrm;
  end;

  return new;
end;
$$;
