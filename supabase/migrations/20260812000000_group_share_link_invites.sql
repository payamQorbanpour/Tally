-- Tally — make the group Share link/QR actually able to join someone.
--
-- Background. `20260803000000_harden_group_membership.sql` closed the hole
-- where knowing a group id was enough to join a group, because the group id is
-- exactly what the Share screen puts in the QR. Correct fix, but it left the
-- Share screen shipping a link that no longer joins anybody: the only accept
-- path resolves `group_invites.token`, and the Share screen was still encoding
-- `groups.id`. Scanning your own invite failed with "invite not found".
--
-- Two further things were broken in the same flow:
--
--   • `group_invites_select_member_or_token` is named for a token branch it
--     never actually had (`tally_is_group_member(group_id) or
--     invited_by_user_id = auth.uid()`). An invitee is by definition not yet a
--     member and did not create the invite, so the client's
--     `select … eq('token', …)` returned zero rows and every accept — even a
--     correctly addressed email invite — reported `invite_not_found`. RLS
--     cannot express "the caller knows the token" in a USING clause, because
--     USING is evaluated per row and never sees the query's predicate. So the
--     lookup moves server-side into a SECURITY DEFINER function instead, and
--     the SELECT policy stays shut.
--
--   • Accepting wrote the membership row locally and let the ordinary sync
--     push it. That path runs `pruneRemoteRowsNotInLocalDb` immediately after
--     the push, while the joiner's SQLite still knows nothing about the group
--     they just joined — so the prune would delete the whole group's remote
--     expenses, splits and members. Joining is therefore done here, in one
--     server-side statement, and the client pulls afterwards.
--
-- What this adds:
--
--   1. `group_invites.email` becomes nullable. A NULL email means "share
--      link": the token itself is the secret and anyone holding it may join.
--      A non-NULL email keeps the existing per-person semantics.
--   2. `tally_self_join_role` honours share-link invites, so the joiner's own
--      membership row keeps passing the INSERT policy on every later sync.
--   3. `tally_accept_group_invite(token)` — the one entry point for redeeming
--      either kind of invite.
--
-- Re-running this file is safe — every statement is idempotent.

-- ---------------------------------------------------------------------------
-- 1. Share-link invites carry no email.
-- ---------------------------------------------------------------------------

alter table public.group_invites alter column email drop not null;

-- At most one open share link per group. Personal invites are excluded by the
-- WHERE clause, so a group can still have any number of those.
create unique index if not exists group_invites_one_share_link_per_group
  on public.group_invites (group_id)
  where email is null;

-- ---------------------------------------------------------------------------
-- 2. Self-join rights now include "holds this group's share link".
--
-- Unchanged for personal invites. The share-link branch does not prove the
-- caller holds the token — RLS cannot see that — but it does not need to: the
-- row being written is the caller's own membership, and
-- `tally_accept_group_invite` below is what decides whether it gets created in
-- the first place. This clause exists so that once a member is legitimately
-- joined, the sync layer's routine re-upsert of their own row is not rejected.
-- ---------------------------------------------------------------------------

create or replace function public.tally_self_join_role(p_group_id text)
returns text
language sql
stable
security definer
set search_path = public
as $$
  select case
    -- Bootstrap: creating a group. The creator's own row is the first one in
    -- it, and an attacker joining a memberless group gains nothing.
    when not exists (
      select 1 from public.group_members gm where gm.group_id = p_group_id
    ) then 'collaborator'
    else coalesce(
      -- 1. A personal invite addressed to this caller. Highest precedence, so
      --    the "re-invited as collaborator" upgrade in `groupInviteAccept.ts`
      --    keeps working: it is a deliberate act by a group collaborator.
      (
        select case when gi.role = 'viewer' then 'viewer' else 'collaborator' end
        from public.group_invites gi
        where gi.group_id = p_group_id
          and gi.email is not null
          and btrim(gi.email) <> ''
          and coalesce(btrim(auth.jwt() ->> 'email'), '') <> ''
          and lower(btrim(gi.email)) = lower(btrim(auth.jwt() ->> 'email'))
        order by gi.created_at desc
        limit 1
      ),
      -- 2. Already in the group: the role on file, unchanged. This is what
      --    lets the sync layer re-upsert one's own membership row on every
      --    pass. It must sit ABOVE the share-link branch — otherwise an
      --    existing `viewer` in a group that happens to have an open share
      --    link could PATCH themselves to `collaborator`, which is the exact
      --    self-escalation `20260803000000` was written to close.
      (
        select gm.role
        from public.group_members gm
        where gm.group_id = p_group_id and gm.user_id = auth.uid()::text
        limit 1
      ),
      -- 3. Not a member, but the group has an open share link. Whoever holds
      --    the token joins at the role the link grants.
      (
        select case when gi.role = 'viewer' then 'viewer' else 'collaborator' end
        from public.group_invites gi
        where gi.group_id = p_group_id and gi.email is null
        order by gi.created_at desc
        limit 1
      )
    )
  end;
$$;

revoke all on function public.tally_self_join_role(text) from public;
grant execute on function public.tally_self_join_role(text) to authenticated;

-- ---------------------------------------------------------------------------
-- 3. Redeem an invite token.
--
-- SECURITY DEFINER so it can read `group_invites` by token without the SELECT
-- policy (which deliberately hides invites from non-members) getting in the
-- way, and so the membership insert lands in one statement rather than as a
-- client upsert the client cannot safely follow with a prune.
--
-- Returns a jsonb result rather than raising, so the client can map a refusal
-- onto a specific message instead of parsing a Postgres error string. The
-- distinction between `invite_not_found` and `email_mismatch` is deliberate
-- and safe: reaching either already required holding a valid token.
-- ---------------------------------------------------------------------------

create or replace function public.tally_accept_group_invite(p_token text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_invite  public.group_invites%rowtype;
  v_uid     text;
  v_email   text;
  v_role    text;
  v_now     text;
  v_member  text;
begin
  v_uid := auth.uid()::text;
  if v_uid is null or btrim(v_uid) = '' then
    return jsonb_build_object('ok', false, 'error', 'not_signed_in');
  end if;

  if p_token is null or btrim(p_token) = '' then
    return jsonb_build_object('ok', false, 'error', 'missing_token');
  end if;

  select * into v_invite
    from public.group_invites
   where token = btrim(p_token)
   limit 1;

  if not found then
    return jsonb_build_object('ok', false, 'error', 'invite_not_found');
  end if;

  -- An invite addressed to a person is only that person's to accept. A share
  -- link (email is null) is open to whoever holds the token.
  if v_invite.email is not null and btrim(v_invite.email) <> '' then
    v_email := lower(btrim(coalesce(auth.jwt() ->> 'email', '')));
    if v_email = '' or lower(btrim(v_invite.email)) <> v_email then
      return jsonb_build_object('ok', false, 'error', 'email_mismatch');
    end if;
  end if;

  -- The group must still exist. A token outliving its group would otherwise
  -- create a membership row pointing at nothing.
  if not exists (select 1 from public.groups g where g.id = v_invite.group_id) then
    return jsonb_build_object('ok', false, 'error', 'invite_not_found');
  end if;

  v_role := case when v_invite.role = 'viewer' then 'viewer' else 'collaborator' end;
  v_now  := to_char(now() at time zone 'utc', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"');

  select gm.id into v_member
    from public.group_members gm
   where gm.group_id = v_invite.group_id
     and gm.user_id = v_uid
   limit 1;

  if v_member is null then
    v_member := gen_random_uuid()::text;
    insert into public.group_members
      (id, group_id, user_id, joined_at, last_modified, role)
    values
      (v_member, v_invite.group_id, v_uid, v_now, v_now, v_role);
  elsif v_invite.email is not null and btrim(v_invite.email) <> '' then
    -- Re-invited by name, so the invite's role is a deliberate decision by a
    -- collaborator and may raise this member's role. Never lower it: replaying
    -- an old viewer invite must not demote a working collaborator.
    update public.group_members
       set role = case when role = 'collaborator' then 'collaborator' else v_role end,
           last_modified = v_now
     where id = v_member
    returning role into v_role;
  else
    -- Redeeming a share link when already in the group is a no-op. Applying
    -- the link's role here would let an existing `viewer` promote themselves
    -- simply by opening the group's own share link.
    v_role := (select gm.role from public.group_members gm where gm.id = v_member);
  end if;

  -- Personal invites are single-use bookkeeping; a share link stays open, so
  -- stamping `accepted_at` on it would be wrong.
  if v_invite.email is not null and btrim(v_invite.email) <> '' then
    update public.group_invites
       set accepted_at = v_now, last_modified = v_now
     where id = v_invite.id;
  end if;

  return jsonb_build_object(
    'ok', true,
    'group_id', v_invite.group_id,
    'role', v_role,
    'member_id', v_member
  );
end;
$$;

revoke all on function public.tally_accept_group_invite(text) from public;
grant execute on function public.tally_accept_group_invite(text) to authenticated;
