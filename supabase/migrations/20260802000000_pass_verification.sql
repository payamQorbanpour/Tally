-- Server-verified pass entitlements.
--
-- `pass_entitlements` has open INSERT RLS so the client can record its own
-- audit trail. That makes every column on it attacker-controlled, so the row
-- alone can never be an entitlement. `verified_at` is writable only by the
-- service role (column privileges, independent of RLS) and is set exclusively
-- by the `verify-bazaar-purchase` Edge Function after Cafe Bazaar's Developer
-- API confirms the purchase token.
--
-- Entitlement = `profiles.is_premium` (staff/alpha/Apple) OR an active
-- verified pass. `is_premium` deliberately stays a boolean with no expiry:
-- pass expiry is carried by `expires_at` on the row, not by flipping a flag
-- on a schedule.

alter table public.pass_entitlements
  add column if not exists verified_at timestamptz;

comment on column public.pass_entitlements.verified_at is
  'Set only by verify-bazaar-purchase after Developer API v2 confirms the token. Null = client-written, untrusted.';

-- Re-grant the client only the columns it legitimately writes. `revoke all`
-- first, because Supabase''s defaults include TRUNCATE and RLS does not cover
-- TRUNCATE.
revoke all on public.pass_entitlements from anon, authenticated;

grant select on public.pass_entitlements to authenticated;

grant insert (id, user_id, pass_type, kind, product_id, store_transaction_id,
              activated_at, expires_at, ended_at, bound_group_id,
              price_amount, price_currency, created_at, last_modified)
  on public.pass_entitlements to authenticated;

grant update (ended_at, last_modified)
  on public.pass_entitlements to authenticated;

grant delete on public.pass_entitlements to authenticated;

create index if not exists pass_entitlements_verified_active_idx
  on public.pass_entitlements (user_id, expires_at desc)
  where verified_at is not null and ended_at is null;

-- Single source of truth for "may this user use paid features".
create or replace function public.tally_has_active_entitlement(p_user_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select
    coalesce((select p.is_premium from public.profiles p where p.id = p_user_id), false)
    or exists (
      select 1
      from public.pass_entitlements e
      where e.user_id = p_user_id
        and e.verified_at is not null
        and e.ended_at is null
        and (e.expires_at is null or e.expires_at > now())
    );
$$;

revoke all on function public.tally_has_active_entitlement(uuid) from public, anon;
grant execute on function public.tally_has_active_entitlement(uuid) to authenticated, service_role;

-- Makes re-posting the same Bazaar purchase token idempotent (the
-- verify-bazaar-purchase upsert targets this constraint). Partial, because
-- client-written audit rows legitimately carry a null transaction id.
create unique index if not exists pass_entitlements_store_txn_key
  on public.pass_entitlements (store_transaction_id)
  where store_transaction_id is not null;
