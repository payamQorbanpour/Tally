-- Verification for 20260804010000_app_config.sql. Run in the SQL editor.
-- Mirrors test_ai_config.sql: assertions that raise on failure.
--
-- Run this once, right after applying the migration and BEFORE any operator
-- edits values with set-app-config.sql. The seeded counts below are exact, so
-- a legitimate later edit will make this raise even though nothing is wrong.

do $$
declare
  n integer;
  ok boolean;
begin
  -- 1. Registry and value seeds landed.
  select count(*) into n from public.app_config_keys;
  if n <> 21 then
    raise exception 'expected 21 registry keys, found %', n;
  end if;

  select count(*) into n from public.app_config where cohort = 'everyone';
  if n <> 10 then
    raise exception 'expected 10 seeded everyone rows, found %', n;
  end if;

  -- 2. Nothing sensitive is reachable by a client.
  select count(*) into n
    from public.app_config_keys
   where (key like 'ai_rate_limit%' or key like '%_prompt' or key like '%model')
     and max_visibility <> 'server';
  if n <> 0 then
    raise exception 'rate limits, prompts and models must be server-only (found %)', n;
  end if;

  select count(*) into n
    from public.app_config c join public.app_config_keys k using (key)
   where case c.visibility     when 'server' then 0 when 'client' then 1 else 2 end
       > case k.max_visibility when 'server' then 0 when 'client' then 1 else 2 end;
  if n <> 0 then
    raise exception 'row visibility exceeds key ceiling in % rows', n;
  end if;

  -- 3. The validation trigger actually rejects a wrong type. This is the whole
  --    point of the registry, so assert it rather than assume it.
  ok := false;
  begin
    update public.app_config set value = '"false"'::jsonb
     where key = 'ai_enabled' and cohort = 'everyone';
  exception when others then
    ok := true;
  end;
  if not ok then
    raise exception 'validation trigger accepted a JSON string for a boolean key';
  end if;

  -- 4. The audit trigger records changes, attributed to app.config_actor.
  set local app.config_actor = 'test_app_config.sql';
  update public.app_config set value = 'true'::jsonb
   where key = 'ai_enabled' and cohort = 'everyone';
  select count(*) into n
    from public.app_config_audit
   where key = 'ai_enabled' and changed_by = 'test_app_config.sql';
  if n < 1 then
    raise exception 'audit trigger wrote no row';
  end if;

  -- 5. RLS on with zero policies, i.e. deny-all for anon/authenticated.
  select count(*) into n
    from pg_policies
   where schemaname = 'public'
     and tablename in ('app_config','app_config_keys','app_config_allowlist','app_config_audit');
  if n <> 0 then
    raise exception 'expected no RLS policies (deny-all), found %', n;
  end if;

  select count(*) into n
    from pg_class
   where relname in ('app_config','app_config_keys','app_config_allowlist','app_config_audit')
     and relrowsecurity;
  if n <> 4 then
    raise exception 'expected RLS enabled on all four tables, found %', n;
  end if;

  -- 6. The AI-only tables are gone.
  select count(*) into n from pg_class where relname in ('ai_config','ai_config_allowlist');
  if n <> 0 then
    raise exception 'ai_config tables still present (%)', n;
  end if;

  raise notice 'app_config verification passed';
end $$;

-- 7. Manual check — as an authenticated (non-service-role) client, the deny-all
--    posture (revoke all on public.app_config from anon, authenticated) results in
--    a table-level permission error before RLS is consulted. This is correct and
--    intended behavior: the role has no table-level access, so the query raises
--    "permission denied for table app_config" rather than returning zero rows.
--    Do NOT treat this as a failure — it proves the lockdown is working.
--      set local role authenticated;
--      select count(*) from public.app_config;  -- expect: ERROR permission denied for table app_config
