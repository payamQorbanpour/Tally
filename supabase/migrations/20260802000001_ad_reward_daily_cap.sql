-- Daily-capped ad credit grant.
--
-- Providers without server-side reward verification (Tapsell, and any future
-- network in the same position) can only be claimed by the client saying so.
-- The cap bounds what that claim is worth: an attacker who forges claims all
-- day earns exactly what an honest viewer earns, so forging buys time rather
-- than credits. AdMob keeps using `ai_credit_grant` — its SSV signature is
-- real proof and needs no ceiling.
--
-- The cap counts credits granted with reason 'ad_reward' since UTC midnight.
-- Idempotent replays (same provider + external_id) do not consume cap, because
-- the insert is skipped before the count matters.

create or replace function public.ai_credit_grant_capped(
  p_user_id     uuid,
  p_delta       integer,
  p_provider    text,
  p_external_id text,
  p_daily_cap   integer
) returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_today   integer;
  v_balance integer;
begin
  if p_delta <= 0 then
    raise exception 'ai_credit_grant_capped requires a positive delta';
  end if;

  -- Serialize concurrent calls for the same user so the cap check below
  -- (read the day's sum, decide, then grant) is atomic across callers. Held
  -- for the duration of this transaction; released automatically on commit
  -- or rollback. Without this, two concurrent calls can both read the same
  -- stale sum, both conclude they're under cap, and both grant -- bypassing
  -- the cap entirely.
  perform pg_advisory_xact_lock(hashtext(p_user_id::text));

  -- Idempotent replay: if this exact reward was already recorded, return the
  -- current balance without touching the cap.
  if exists (
    select 1 from public.ai_credit_events
    where coalesce(provider, '') = coalesce(p_provider, '')
      and external_id = p_external_id
  ) then
    select balance into v_balance from public.ai_credit_balances where user_id = p_user_id;
    return coalesce(v_balance, 0);
  end if;

  select coalesce(sum(delta), 0) into v_today
  from public.ai_credit_events
  where user_id = p_user_id
    and reason = 'ad_reward'
    and delta > 0
    and created_at >= (date_trunc('day', now() at time zone 'utc') at time zone 'utc');

  if v_today + p_delta > p_daily_cap then
    return -1;
  end if;

  return public.ai_credit_grant(p_user_id, p_delta, 'ad_reward', p_provider, p_external_id);
end;
$$;

revoke all on function public.ai_credit_grant_capped(uuid, integer, text, text, integer)
  from public, anon, authenticated;
grant execute on function public.ai_credit_grant_capped(uuid, integer, text, text, integer)
  to service_role;
