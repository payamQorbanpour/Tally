-- supabase/scripts/test_pass_verification.sql
-- Run with: psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f supabase/scripts/test_pass_verification.sql
-- Wrapped in a transaction that always rolls back — safe on a scratch db,
-- NEVER run against production (it inserts into auth.users).
begin;

insert into auth.users (id, instance_id, aud, role, email, encrypted_password,
                        email_confirmed_at, created_at, updated_at)
  values ('00000000-0000-4000-8000-0000000000a1', '00000000-0000-0000-0000-000000000000',
          'authenticated', 'authenticated', 'entitle-a@test.local', '', now(), now(), now());

-- No profile flag, no pass → not entitled.
do $$ begin
  assert public.tally_has_active_entitlement('00000000-0000-4000-8000-0000000000a1') = false,
    'bare user should not be entitled';
end $$;

-- Unverified (client-written) pass → still not entitled.
insert into public.pass_entitlements (user_id, pass_type, kind, product_id, expires_at)
values ('00000000-0000-4000-8000-0000000000a1', 'night', 'buy', 'forged', now() + interval '1 day');
do $$ begin
  assert public.tally_has_active_entitlement('00000000-0000-4000-8000-0000000000a1') = false,
    'client-written pass must not grant entitlement';
end $$;

-- Verified pass → entitled.
update public.pass_entitlements set verified_at = now()
  where user_id = '00000000-0000-4000-8000-0000000000a1';
do $$ begin
  assert public.tally_has_active_entitlement('00000000-0000-4000-8000-0000000000a1') = true,
    'verified pass must grant entitlement';
end $$;

-- Expired verified pass → not entitled.
update public.pass_entitlements set expires_at = now() - interval '1 hour'
  where user_id = '00000000-0000-4000-8000-0000000000a1';
do $$ begin
  assert public.tally_has_active_entitlement('00000000-0000-4000-8000-0000000000a1') = false,
    'expired pass must not grant entitlement';
end $$;

-- is_alpha alone (no is_premium, no verified pass) → entitled. Mirrors the
-- client's own `isPremium = isAlpha || … || hasActivePass` calc — an alpha
-- tester must not see unlimited AI locally while the server bills and
-- eventually 402s them.
update public.profiles set is_alpha = true
  where id = '00000000-0000-4000-8000-0000000000a1';
do $$ begin
  assert public.tally_has_active_entitlement('00000000-0000-4000-8000-0000000000a1') = true,
    'is_alpha alone must grant entitlement';
end $$;
update public.profiles set is_alpha = false
  where id = '00000000-0000-4000-8000-0000000000a1';

-- ── verified_at is unreachable from the client role ────────────────────────
-- Column privileges are enforced independent of RLS policies/JWT claims, so
-- switching role alone is sufficient to exercise the GRANT added by this
-- migration — no matching RLS bypass is required.
set local role authenticated;
set local request.jwt.claims to '{"sub":"00000000-0000-4000-8000-0000000000a1","role":"authenticated"}';

do $$
begin
  begin
    insert into public.pass_entitlements (user_id, pass_type, kind, product_id, verified_at)
    values ('00000000-0000-4000-8000-0000000000a1', 'night', 'buy', 'x', now());
    assert false, 'client must not be able to insert verified_at';
  exception when insufficient_privilege then
    -- expected
  end;
end $$;

do $$
begin
  begin
    update public.pass_entitlements set verified_at = now()
      where user_id = '00000000-0000-4000-8000-0000000000a1';
    assert false, 'client must not be able to update verified_at';
  exception when insufficient_privilege then
    -- expected
  end;
end $$;

reset role;

rollback;
