-- ai_proxy_usage — per-user, per-minute counter for the `ai-proxy` Edge Function.
-- Rows are written from inside the function via the service-role key, so RLS
-- can be a deny-all wall — no client should ever read or write here directly.

create table if not exists public.ai_proxy_usage (
  user_id       uuid    not null references auth.users (id) on delete cascade,
  minute_bucket bigint  not null,
  action        text    not null,
  count         integer not null default 0,
  primary key (user_id, minute_bucket, action)
);

-- Cheap GC: an index on the bucket so the periodic prune scan stays fast.
create index if not exists ai_proxy_usage_by_bucket
  on public.ai_proxy_usage (minute_bucket);

-- Lock everyone out — only the service-role client (Edge Function) can touch it.
alter table public.ai_proxy_usage enable row level security;
drop policy if exists "ai_proxy_usage_no_client" on public.ai_proxy_usage;
-- Intentional: no rows are ever returned, no rows can be inserted, by anon/authed.
-- The service role bypasses RLS so the function still works.

-- Atomic upsert + return the new count. Used by the Edge Function's
-- `enforceRateLimit`. Single round-trip, so contention can't race past the
-- limit in the way a separate read+write would.
create or replace function public.ai_proxy_bump_usage(
  p_user_id uuid,
  p_minute_bucket bigint,
  p_action text
) returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  new_count integer;
begin
  insert into public.ai_proxy_usage (user_id, minute_bucket, action, count)
    values (p_user_id, p_minute_bucket, p_action, 1)
  on conflict (user_id, minute_bucket, action)
    do update set count = public.ai_proxy_usage.count + 1
  returning count into new_count;
  return new_count;
end;
$$;

-- Lock down the function: only the service role (Edge Function) calls it.
revoke all on function public.ai_proxy_bump_usage(uuid, bigint, text) from public;
revoke all on function public.ai_proxy_bump_usage(uuid, bigint, text) from anon, authenticated;
grant execute on function public.ai_proxy_bump_usage(uuid, bigint, text) to service_role;

-- Optional housekeeping: rows older than ~24h are useless. Set up a `pg_cron`
-- job in the dashboard if you want auto-prune, or just `delete from ... where
-- minute_bucket < (extract(epoch from now())::bigint / 60) - 1440;` periodically.
