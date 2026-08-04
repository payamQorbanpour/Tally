-- Verification for 20260804000000_ai_config.sql. Run in the SQL editor.
-- Mirrors the shape of test_ai_credits.sql: assertions that raise on failure.
--
-- This verifies the MIGRATION'S INITIAL SEED specifically — the hardcoded
-- `n <> 9` check below counts exactly the rows that migration inserts. Run
-- this once, right after applying the migration and before any operator
-- edits flags with set-ai-flag.sql; adding or removing an `everyone` row
-- afterwards (a legitimate, expected operation) will make this script raise
-- even though nothing is actually wrong.

do $$
declare
  n integer;
begin
  -- 1. Seed landed, and the client/server split is what we intended.
  select count(*) into n from public.ai_config where cohort = 'everyone';
  if n <> 9 then
    raise exception 'expected 9 seeded everyone rows, found %', n;
  end if;

  select count(*) into n
    from public.ai_config
   where client_visible and key like 'ai_rate_limit%';
  if n <> 0 then
    raise exception 'rate limits must never be client_visible (found %)', n;
  end if;

  -- 2. RLS is on with zero policies, i.e. deny-all for anon/authenticated.
  select count(*) into n
    from pg_policies
   where schemaname = 'public' and tablename in ('ai_config', 'ai_config_allowlist');
  if n <> 0 then
    raise exception 'expected no RLS policies (deny-all), found %', n;
  end if;

  select count(*) into n
    from pg_class
   where relname in ('ai_config', 'ai_config_allowlist') and relrowsecurity;
  if n <> 2 then
    raise exception 'expected RLS enabled on both tables, found %', n;
  end if;

  raise notice 'ai_config verification passed';
end $$;

-- 3. Manual check — as an authenticated (non-service-role) client this must
--    return zero rows, not an error:
--      set local role authenticated;
--      select count(*) from public.ai_config;  -- expect 0
