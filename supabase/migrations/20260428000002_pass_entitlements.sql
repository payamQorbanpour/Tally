-- Tally Passes — pass entitlements ledger.
--
-- One row per pass event: initial buy, extension, or "marked ended".
-- The user's *current* pass is the most-recent row whose `ended_at` is
-- null AND whose `expires_at` is in the future. The client reads from
-- `profiles.is_premium` for cross-device entitlement; this table holds
-- the audit trail (purchase history, IAP transaction ids, prices).
--
-- v1: rows are written by the client (PremiumContext + PremiumPassBinding).
-- A future task will (a) move pass row writes into a server-side
-- receipt-validation Edge Function, and (b) add a trigger that flips
-- `profiles.is_premium` based on the current pass row so the column
-- can never drift past the actual entitlement window.
-- ---------------------------------------------------------------------------

create table if not exists public.pass_entitlements (
  id                    uuid        not null primary key default gen_random_uuid(),
  user_id               uuid        not null references auth.users (id) on delete cascade,
  pass_type             text        not null check (pass_type in ('night', 'trip', 'explorer')),
  kind                  text        not null check (kind in ('buy', 'extend')),
  product_id            text        not null,
  store_transaction_id  text,
  activated_at          timestamptz not null default now(),
  expires_at            timestamptz,
  ended_at              timestamptz,
  bound_group_id        uuid,
  price_amount          numeric(10, 2),
  price_currency        text,
  created_at            timestamptz not null default now(),
  last_modified         timestamptz not null default now()
);

create index if not exists pass_entitlements_user_active_idx
  on public.pass_entitlements (user_id, expires_at desc);
create index if not exists pass_entitlements_user_created_idx
  on public.pass_entitlements (user_id, created_at desc);

alter table public.pass_entitlements enable row level security;

drop policy if exists "pass_entitlements_select_own" on public.pass_entitlements;
create policy "pass_entitlements_select_own" on public.pass_entitlements
  for select to authenticated
  using (auth.uid() = user_id);

-- Inserts must match the auth user. We deliberately do NOT allow updating
-- arbitrary rows — extensions are recorded as new rows. The one exception
-- is the user marking their own pass ended, which a v1.x follow-up will
-- handle via an RPC; for now `ended_at` is set client-side via UPDATE.
drop policy if exists "pass_entitlements_insert_own" on public.pass_entitlements;
create policy "pass_entitlements_insert_own" on public.pass_entitlements
  for insert to authenticated
  with check (auth.uid() = user_id);

drop policy if exists "pass_entitlements_update_own" on public.pass_entitlements;
create policy "pass_entitlements_update_own" on public.pass_entitlements
  for update to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- Account delete flow removes the user's audit history along with the row.
drop policy if exists "pass_entitlements_delete_own" on public.pass_entitlements;
create policy "pass_entitlements_delete_own" on public.pass_entitlements
  for delete to authenticated
  using (auth.uid() = user_id);
