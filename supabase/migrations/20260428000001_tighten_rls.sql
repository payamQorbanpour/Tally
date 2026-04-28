-- Tighten RLS on the sync tables. The dev-friendly `using(true)` policies from
-- `20260424000000_initial_schema.sql` would expose every signed-up user's
-- groups, expenses, and emails to anyone with the anon key — fine for local
-- testing, blocking for publish.
--
-- Mental model that makes this work: when a user signs in, the app remaps
-- their local `users.id` to `auth.uid()::text` (see `AuthSQLiteBinding.tsx`).
-- So the signed-in user's row in `public.users` always has `id = auth.uid()::text`,
-- and `public.group_members.user_id = auth.uid()::text` whenever they are a
-- member. Every policy below leans on that invariant.
--
-- ⚠️  Apply on staging first. One pre-existing behavior to know about:
--
--   Group invite acceptance previously could insert a `group_members` row
--   for an invited user. The new policy requires the inviter to already be
--   a member of the group, OR to be the new member adding themselves on
--   first join — both are supported, but flows that bypass that path will
--   need to go through an Edge Function with the service-role key.
--
-- Locally-created participants (people you add to a group who never signed
-- up themselves) keep working: a group collaborator may insert / update a
-- `public.users` row whose id appears in their group's `group_members`.
-- That's a tiny, accepted concession — a co-member could in theory rename
-- another participant's row — but it preserves the existing UX for shared
-- groups while still preventing strangers from reading your data.
--
-- Re-running this file is safe — every drop+create is idempotent.

-- ---------------------------------------------------------------------------
-- Helper: a SECURITY DEFINER function so policies can ask "is the caller a
-- member of group X" without recursing through the same RLS that's gating
-- the surrounding query. Returns false for unauthenticated callers.
-- ---------------------------------------------------------------------------

create or replace function public.tally_is_group_member(p_group_id text)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.group_members gm
    where gm.group_id = p_group_id
      and gm.user_id  = auth.uid()::text
  );
$$;

revoke all on function public.tally_is_group_member(text) from public;
grant execute on function public.tally_is_group_member(text) to authenticated;

create or replace function public.tally_is_group_collaborator(p_group_id text)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.group_members gm
    where gm.group_id = p_group_id
      and gm.user_id  = auth.uid()::text
      and gm.role = 'collaborator'
  );
$$;

revoke all on function public.tally_is_group_collaborator(text) from public;
grant execute on function public.tally_is_group_collaborator(text) to authenticated;

-- Drop the dev-friendly `tally_sync_all` everywhere. We replace below.
drop policy if exists "tally_sync_all" on public.feedback_reports;
drop policy if exists "tally_sync_all" on public.users;
drop policy if exists "tally_sync_all" on public.groups;
drop policy if exists "tally_sync_all" on public.group_members;
drop policy if exists "tally_sync_all" on public.group_invites;
drop policy if exists "tally_sync_all" on public.expenses;
drop policy if exists "tally_sync_all" on public.splits;
drop policy if exists "tally_sync_all" on public.settlements;

-- ---------------------------------------------------------------------------
-- public.users — your own row + co-members of any group you share.
-- Self-write only; no one can rewrite anyone else's profile.
-- ---------------------------------------------------------------------------

drop policy if exists "users_select_self_and_comembers" on public.users;
create policy "users_select_self_and_comembers" on public.users
  for select to authenticated
  using (
    id = auth.uid()::text
    or exists (
      select 1
      from public.group_members me
      join public.group_members them on them.group_id = me.group_id
      where me.user_id = auth.uid()::text
        and them.user_id = users.id
    )
  );

-- Helper: is this users.id referenced by some group_members row in a group
-- the caller is also a member of? Used so collaborators can write rows for
-- locally-created (non-auth) participants without breaking shared groups.
create or replace function public.tally_user_in_my_group(p_user_id text)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.group_members them
    join public.group_members me on me.group_id = them.group_id
    where them.user_id = p_user_id
      and me.user_id   = auth.uid()::text
  );
$$;

revoke all on function public.tally_user_in_my_group(text) from public;
grant execute on function public.tally_user_in_my_group(text) to authenticated;

drop policy if exists "users_insert_self_or_comember" on public.users;
create policy "users_insert_self_or_comember" on public.users
  for insert to authenticated
  with check (
    id = auth.uid()::text
    or public.tally_user_in_my_group(id)
  );

drop policy if exists "users_update_self_or_comember" on public.users;
create policy "users_update_self_or_comember" on public.users
  for update to authenticated
  using (
    id = auth.uid()::text
    or public.tally_user_in_my_group(id)
  )
  with check (
    id = auth.uid()::text
    or public.tally_user_in_my_group(id)
  );

drop policy if exists "users_delete_self" on public.users;
create policy "users_delete_self" on public.users
  for delete to authenticated
  using (id = auth.uid()::text);

-- ---------------------------------------------------------------------------
-- public.groups — visible to members; created by anyone (then they must
-- immediately add a group_members row for themselves); collaborators can
-- update / delete.
-- ---------------------------------------------------------------------------

drop policy if exists "groups_select_member" on public.groups;
create policy "groups_select_member" on public.groups
  for select to authenticated
  using (public.tally_is_group_member(id));

drop policy if exists "groups_insert_authed" on public.groups;
create policy "groups_insert_authed" on public.groups
  for insert to authenticated
  with check (true);

drop policy if exists "groups_update_collaborator" on public.groups;
create policy "groups_update_collaborator" on public.groups
  for update to authenticated
  using (public.tally_is_group_collaborator(id))
  with check (public.tally_is_group_collaborator(id));

drop policy if exists "groups_delete_collaborator" on public.groups;
create policy "groups_delete_collaborator" on public.groups
  for delete to authenticated
  using (public.tally_is_group_collaborator(id));

-- ---------------------------------------------------------------------------
-- public.group_members — visible to members; you can add yourself (e.g.
-- accepting an invite) or, if you are already a collaborator member, add
-- another row to your group. You can always delete your own membership.
-- ---------------------------------------------------------------------------

drop policy if exists "group_members_select_in_group" on public.group_members;
create policy "group_members_select_in_group" on public.group_members
  for select to authenticated
  using (public.tally_is_group_member(group_id));

drop policy if exists "group_members_insert_self_or_admin" on public.group_members;
create policy "group_members_insert_self_or_admin" on public.group_members
  for insert to authenticated
  with check (
    user_id = auth.uid()::text
    or public.tally_is_group_collaborator(group_id)
  );

drop policy if exists "group_members_update_self_or_admin" on public.group_members;
create policy "group_members_update_self_or_admin" on public.group_members
  for update to authenticated
  using (
    user_id = auth.uid()::text
    or public.tally_is_group_collaborator(group_id)
  )
  with check (
    user_id = auth.uid()::text
    or public.tally_is_group_collaborator(group_id)
  );

drop policy if exists "group_members_delete_self_or_admin" on public.group_members;
create policy "group_members_delete_self_or_admin" on public.group_members
  for delete to authenticated
  using (
    user_id = auth.uid()::text
    or public.tally_is_group_collaborator(group_id)
  );

-- ---------------------------------------------------------------------------
-- public.group_invites — collaborator members of the target group can manage.
-- Accepting an invite reads the row by token, so we also let an authed user
-- select an invite when they know the token (the QR code / link payload).
-- ---------------------------------------------------------------------------

drop policy if exists "group_invites_select_member_or_token" on public.group_invites;
create policy "group_invites_select_member_or_token" on public.group_invites
  for select to authenticated
  using (
    public.tally_is_group_member(group_id)
    or invited_by_user_id = auth.uid()::text
  );

drop policy if exists "group_invites_insert_collaborator" on public.group_invites;
create policy "group_invites_insert_collaborator" on public.group_invites
  for insert to authenticated
  with check (
    public.tally_is_group_collaborator(group_id)
    and invited_by_user_id = auth.uid()::text
  );

drop policy if exists "group_invites_update_collaborator" on public.group_invites;
create policy "group_invites_update_collaborator" on public.group_invites
  for update to authenticated
  using (public.tally_is_group_collaborator(group_id))
  with check (public.tally_is_group_collaborator(group_id));

drop policy if exists "group_invites_delete_collaborator" on public.group_invites;
create policy "group_invites_delete_collaborator" on public.group_invites
  for delete to authenticated
  using (public.tally_is_group_collaborator(group_id));

-- ---------------------------------------------------------------------------
-- public.expenses + splits + settlements — group-membership scoped.
-- ---------------------------------------------------------------------------

drop policy if exists "expenses_select_member" on public.expenses;
create policy "expenses_select_member" on public.expenses
  for select to authenticated
  using (public.tally_is_group_member(group_id));

drop policy if exists "expenses_write_collaborator" on public.expenses;
create policy "expenses_write_collaborator" on public.expenses
  for insert to authenticated
  with check (public.tally_is_group_collaborator(group_id));

drop policy if exists "expenses_update_collaborator" on public.expenses;
create policy "expenses_update_collaborator" on public.expenses
  for update to authenticated
  using (public.tally_is_group_collaborator(group_id))
  with check (public.tally_is_group_collaborator(group_id));

drop policy if exists "expenses_delete_collaborator" on public.expenses;
create policy "expenses_delete_collaborator" on public.expenses
  for delete to authenticated
  using (public.tally_is_group_collaborator(group_id));

-- splits join through their parent expense's group.
drop policy if exists "splits_select_member" on public.splits;
create policy "splits_select_member" on public.splits
  for select to authenticated
  using (
    exists (
      select 1 from public.expenses e
      where e.id = splits.expense_id
        and public.tally_is_group_member(e.group_id)
    )
  );

drop policy if exists "splits_write_collaborator" on public.splits;
create policy "splits_write_collaborator" on public.splits
  for insert to authenticated
  with check (
    exists (
      select 1 from public.expenses e
      where e.id = splits.expense_id
        and public.tally_is_group_collaborator(e.group_id)
    )
  );

drop policy if exists "splits_update_collaborator" on public.splits;
create policy "splits_update_collaborator" on public.splits
  for update to authenticated
  using (
    exists (
      select 1 from public.expenses e
      where e.id = splits.expense_id
        and public.tally_is_group_collaborator(e.group_id)
    )
  )
  with check (
    exists (
      select 1 from public.expenses e
      where e.id = splits.expense_id
        and public.tally_is_group_collaborator(e.group_id)
    )
  );

drop policy if exists "splits_delete_collaborator" on public.splits;
create policy "splits_delete_collaborator" on public.splits
  for delete to authenticated
  using (
    exists (
      select 1 from public.expenses e
      where e.id = splits.expense_id
        and public.tally_is_group_collaborator(e.group_id)
    )
  );

drop policy if exists "settlements_select_member" on public.settlements;
create policy "settlements_select_member" on public.settlements
  for select to authenticated
  using (public.tally_is_group_member(group_id));

drop policy if exists "settlements_write_collaborator" on public.settlements;
create policy "settlements_write_collaborator" on public.settlements
  for insert to authenticated
  with check (public.tally_is_group_collaborator(group_id));

drop policy if exists "settlements_update_collaborator" on public.settlements;
create policy "settlements_update_collaborator" on public.settlements
  for update to authenticated
  using (public.tally_is_group_collaborator(group_id))
  with check (public.tally_is_group_collaborator(group_id));

drop policy if exists "settlements_delete_collaborator" on public.settlements;
create policy "settlements_delete_collaborator" on public.settlements
  for delete to authenticated
  using (public.tally_is_group_collaborator(group_id));

-- ---------------------------------------------------------------------------
-- public.feedback_reports — write-only inbox; no one can read except via
-- the service role. Keeps free-form bug reports private to the operator.
-- ---------------------------------------------------------------------------

drop policy if exists "feedback_insert_authed" on public.feedback_reports;
create policy "feedback_insert_authed" on public.feedback_reports
  for insert to authenticated
  with check (true);

-- (No select / update / delete policies — service role bypasses RLS, every
-- other role gets nothing. That's intentional.)
