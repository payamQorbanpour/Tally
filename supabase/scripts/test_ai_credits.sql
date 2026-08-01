-- Assertions for the AI credit ledger (20260801000000_ai_credits.sql).
--
-- Run against a local stack:
--   supabase start
--   psql "postgresql://postgres:postgres@127.0.0.1:54322/postgres" \
--     -v ON_ERROR_STOP=1 -f supabase/scripts/test_ai_credits.sql
--
-- Everything happens inside a transaction that is rolled back, so the
-- script leaves no rows behind and is safe to re-run.

begin;

do $$
declare
  v_user uuid := '00000000-0000-4000-8000-0000000000a1';
  v_balance integer;
  v_events integer;
begin
  -- Inserting into auth.users fires tally_handle_new_user_profile, which
  -- must seed both the profile row and the one-time signup grant.
  insert into auth.users (id, instance_id, aud, role, email, encrypted_password,
                          email_confirmed_at, created_at, updated_at)
    values (v_user, '00000000-0000-0000-0000-000000000000', 'authenticated',
            'authenticated', 'credits-test@example.com', '', now(), now(), now());

  select balance into v_balance from public.ai_credit_balances where user_id = v_user;
  assert v_balance = 5, format('signup grant should be 5, got %s', v_balance);

  -- ── Idempotency: a replayed ad callback grants exactly once ──────────
  perform public.ai_credit_grant(v_user, 3, 'ad_reward', 'admob', 'tx-123');
  perform public.ai_credit_grant(v_user, 3, 'ad_reward', 'admob', 'tx-123');

  select balance into v_balance from public.ai_credit_balances where user_id = v_user;
  assert v_balance = 8, format('replayed grant should credit once, got %s', v_balance);

  select count(*) into v_events from public.ai_credit_events
    where user_id = v_user and reason = 'ad_reward';
  assert v_events = 1, format('replayed grant should write one event, got %s', v_events);

  -- A different transaction id from the same provider does grant.
  perform public.ai_credit_grant(v_user, 3, 'ad_reward', 'admob', 'tx-124');
  select balance into v_balance from public.ai_credit_balances where user_id = v_user;
  assert v_balance = 11, format('distinct tx should grant, got %s', v_balance);

  -- ── Spending ─────────────────────────────────────────────────────────
  v_balance := public.ai_credit_spend(v_user, 'parse-receipt');
  assert v_balance = 10, format('spend should return 10, got %s', v_balance);

  select lifetime_spent into v_events from public.ai_credit_balances where user_id = v_user;
  assert v_events = 1, format('lifetime_spent should be 1, got %s', v_events);

  -- ── Refund restores the balance ──────────────────────────────────────
  perform public.ai_credit_grant(v_user, 1, 'refund', null, null);
  select balance into v_balance from public.ai_credit_balances where user_id = v_user;
  assert v_balance = 11, format('refund should restore 11, got %s', v_balance);

  -- ── Spending at zero returns -1 and writes no event ──────────────────
  update public.ai_credit_balances set balance = 0 where user_id = v_user;
  select count(*) into v_events from public.ai_credit_events where user_id = v_user;

  v_balance := public.ai_credit_spend(v_user, 'transcribe');
  assert v_balance = -1, format('spend at zero should return -1, got %s', v_balance);

  assert (select count(*) from public.ai_credit_events where user_id = v_user) = v_events,
    'spend at zero must not write an event';

  -- ── The balance can never go negative ────────────────────────────────
  assert (select balance from public.ai_credit_balances where user_id = v_user) = 0,
    'balance must not go negative';

  raise notice 'ai_credits: all assertions passed';
end $$;

-- ── daily cap ───────────────────────────────────────────────────────────────
insert into auth.users (id, email) values
  ('00000000-0000-0000-0000-0000000000c1', 'cap@test.local');

do $$
declare r integer;
begin
  -- Cap of 6 with 3-credit rewards: two succeed, the third is refused.
  r := public.ai_credit_grant_capped('00000000-0000-0000-0000-0000000000c1', 3, 'tapsell', 'n1', 6);
  assert r >= 0, 'first capped grant should succeed';
  r := public.ai_credit_grant_capped('00000000-0000-0000-0000-0000000000c1', 3, 'tapsell', 'n2', 6);
  assert r >= 0, 'second capped grant should succeed';
  r := public.ai_credit_grant_capped('00000000-0000-0000-0000-0000000000c1', 3, 'tapsell', 'n3', 6);
  assert r = -1, 'third grant must be refused by the cap';

  -- Replaying an already-recorded reward must not be refused by the cap.
  r := public.ai_credit_grant_capped('00000000-0000-0000-0000-0000000000c1', 3, 'tapsell', 'n1', 6);
  assert r >= 0, 'idempotent replay must not consume cap';
end $$;

rollback;
