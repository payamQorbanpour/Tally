-- Tally — close the two self-service escalation paths on `public.group_members`.
--
-- `20260428000001_tighten_rls.sql` gated membership writes on
-- `user_id = auth.uid()::text or tally_is_group_collaborator(group_id)`. The
-- first disjunct was meant for "I am accepting my invite" and "I just created
-- this group", but RLS sees only the row being written, so it also allowed:
--
--   1. INSERT of a membership row into *any* group id the caller can name,
--      with any role. Group ids are not secret — they are what the Share
--      screen puts in the QR / link — so knowing one was enough to join a
--      stranger's group and read every expense, split, settlement, and
--      co-member email in it.
--
--   2. UPDATE of one's own row to a higher `role`, because a policy cannot
--      compare OLD with NEW. A read-only `viewer` could PATCH itself to
--      `collaborator` and gain write access to the whole group. The same
--      hole let a member re-point `group_id` at someone else's group.
--
-- The fix keeps both legitimate flows working:
--
--   • Group creation — the first membership row in an empty group is allowed
--     (`tally_self_join_role` returns 'collaborator' when the group has no
--     members yet). Nobody else can be looking at a zero-member group.
--
--   • Invite acceptance — a self-insert is allowed only when a `group_invites`
--     row exists for this group whose email matches the caller's JWT email,
--     and the role written must be the role that invite granted.
--
-- Everything else (a collaborator adding a locally-created participant,
-- editing rows in their own group) goes through the collaborator branch and
-- is unchanged.
--
-- Re-running this file is safe — every statement is idempotent.

-- ---------------------------------------------------------------------------
-- Which role, if any, may the caller grant *themselves* in this group?
-- Returns NULL when there is no such right, which makes the `role = …`
-- comparison in the INSERT policy evaluate to NULL and therefore deny.
--
-- SECURITY DEFINER so it can read `group_invites` / `group_members` without
-- recursing into the RLS that is gating the surrounding statement.
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
    -- Otherwise: only with an invite addressed to this caller's email.
    else (
      select case when gi.role = 'viewer' then 'viewer' else 'collaborator' end
      from public.group_invites gi
      where gi.group_id = p_group_id
        and coalesce(btrim(auth.jwt() ->> 'email'), '') <> ''
        and lower(btrim(gi.email)) = lower(btrim(auth.jwt() ->> 'email'))
      order by gi.created_at desc
      limit 1
    )
  end;
$$;

revoke all on function public.tally_self_join_role(text) from public;
grant execute on function public.tally_self_join_role(text) to authenticated;

-- ---------------------------------------------------------------------------
-- INSERT — collaborators may add anyone to their own group; everyone else may
-- only add themselves, and only with the role an invite (or group creation)
-- entitles them to.
-- ---------------------------------------------------------------------------

drop policy if exists "group_members_insert_self_or_admin" on public.group_members;
create policy "group_members_insert_self_or_admin" on public.group_members
  for insert to authenticated
  with check (
    public.tally_is_group_collaborator(group_id)
    or (
      user_id = auth.uid()::text
      and role = public.tally_self_join_role(group_id)
    )
  );

-- ---------------------------------------------------------------------------
-- UPDATE — the row-level predicate is unchanged (you may touch your own row,
-- or any row in a group where you are a collaborator). What a policy cannot
-- express is "…but you may not rewrite these particular columns", because
-- WITH CHECK never sees the old row. A BEFORE UPDATE trigger can, so the
-- column-level rules live there.
--
-- A column GRANT would have been simpler but is not usable here: the sync
-- layer upserts whole rows (`supabaseSync.ts`), so every legitimate write
-- carries `role` in its payload and would be rejected wholesale.
-- ---------------------------------------------------------------------------

create or replace function public.tally_guard_group_member_update()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  -- No end-user in context (service role, or a direct SQL session). Those
  -- bypass RLS anyway; the trigger must not get in their way.
  if auth.uid() is null then
    return new;
  end if;

  -- A membership row belongs to the group it was created in. Moving it would
  -- otherwise be a one-request join of any group whose id the caller knows.
  if new.group_id is distinct from old.group_id then
    raise exception 'tally: a membership row cannot be moved to another group'
      using errcode = '42501';
  end if;

  -- The only user_id rewrite that makes sense is claiming a row for yourself:
  -- on first sign-in the app remaps a locally-created participant id to
  -- `auth.uid()` (see `AuthSQLiteBinding.tsx`) and syncs the result.
  if new.user_id is distinct from old.user_id
     and new.user_id <> auth.uid()::text then
    raise exception 'tally: a membership row cannot be reassigned to another user'
      using errcode = '42501';
  end if;

  -- Role changes: a collaborator may set anyone's role in their group; you may
  -- change your own only to what an invite for your email grants (that is the
  -- "re-invited as collaborator" flow in `groupInviteAccept.ts`).
  if new.role is distinct from old.role
     and not public.tally_is_group_collaborator(old.group_id)
     and not (
       old.user_id = auth.uid()::text
       and new.role = public.tally_self_join_role(old.group_id)
     ) then
    raise exception 'tally: only a group collaborator can change member roles'
      using errcode = '42501';
  end if;

  return new;
end;
$$;

drop trigger if exists tally_group_members_guard_update on public.group_members;
create trigger tally_group_members_guard_update
  before update on public.group_members
  for each row execute procedure public.tally_guard_group_member_update();
