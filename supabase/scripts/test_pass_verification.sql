-- supabase/scripts/test_pass_verification.sql
-- Run with: psql "$DATABASE_URL" -f supabase/scripts/test_pass_verification.sql
-- Wrapped in a transaction that always rolls back — safe on a scratch db,
-- NEVER run against production (it inserts into auth.users).
begin;

insert into auth.users (id, email) values
  ('00000000-0000-0000-0000-0000000000a1', 'entitle-a@test.local');

-- No profile flag, no pass → not entitled.
do $$ begin
  assert public.tally_has_active_entitlement('00000000-0000-0000-0000-0000000000a1') = false,
    'bare user should not be entitled';
end $$;

-- Unverified (client-written) pass → still not entitled.
insert into public.pass_entitlements (user_id, pass_type, kind, product_id, expires_at)
values ('00000000-0000-0000-0000-0000000000a1', 'night', 'buy', 'forged', now() + interval '1 day');
do $$ begin
  assert public.tally_has_active_entitlement('00000000-0000-0000-0000-0000000000a1') = false,
    'client-written pass must not grant entitlement';
end $$;

-- Verified pass → entitled.
update public.pass_entitlements set verified_at = now()
  where user_id = '00000000-0000-0000-0000-0000000000a1';
do $$ begin
  assert public.tally_has_active_entitlement('00000000-0000-0000-0000-0000000000a1') = true,
    'verified pass must grant entitlement';
end $$;

-- Expired verified pass → not entitled.
update public.pass_entitlements set expires_at = now() - interval '1 hour'
  where user_id = '00000000-0000-0000-0000-0000000000a1';
do $$ begin
  assert public.tally_has_active_entitlement('00000000-0000-0000-0000-0000000000a1') = false,
    'expired pass must not grant entitlement';
end $$;

rollback;
