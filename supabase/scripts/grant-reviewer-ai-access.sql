-- Grant a store reviewer access to the AI section.
--
-- WHY THIS EXISTS
-- ---------------
-- The AI receipt/voice screen is gated on `email_confirmed_at && isPremium`
-- (see `src/screens/AiReceiptScreen.tsx`). `PremiumContext` treats
-- `profiles.is_alpha` as a tester/staff bypass that satisfies the premium
-- half of that gate without any purchase, so flipping `is_alpha` is all a
-- reviewer needs.
--
-- `profiles.is_premium` / `profiles.is_alpha` are deliberately unreachable
-- from the client (see `20260502000000_lock_profiles_entitlements.sql`), so
-- this has to be run server-side: Supabase Dashboard → SQL Editor, which
-- runs as `postgres` and bypasses those column grants.
--
-- This is an operational one-off, NOT a migration — keep it out of
-- `supabase/migrations/` so it never runs as part of a deploy.
--
-- HOW TO USE
-- ----------
--   1. Edit the two constants in the DO block below (email + password).
--   2. Paste the whole file into the Supabase SQL Editor and run it.
--   3. Check the SELECT at the bottom prints `is_alpha = true`.
--   4. Send the email + password to Cafe Bazaar in the "توضیح" field of the
--      next publish request (or by ticket to developers@cafebazaar.ir).
--
-- The script is idempotent: run it again and it resets the password and
-- re-asserts `is_alpha` rather than erroring.
--
-- REVOKING AFTER REVIEW
-- ---------------------
--   update public.profiles set is_alpha = false
--    where id = (select id from auth.users where email = '<reviewer email>');
-- ...or delete the auth user entirely to remove the account.

do $$
declare
  -- ── EDIT THESE TWO ────────────────────────────────────────────────────
  v_email    constant text := 'mahvashparivash.cafe@gmail.com';
  -- Pick a fresh password. This is what you hand to the reviewer, so treat
  -- it as disposable and revoke the account once review is done.
  v_password constant text := 'CHANGE-ME-BEFORE-RUNNING';
  -- ──────────────────────────────────────────────────────────────────────
  v_user_id  uuid;
begin
  if v_password = 'CHANGE-ME-BEFORE-RUNNING' then
    raise exception 'Set v_password to a real password before running this script.';
  end if;

  select id into v_user_id from auth.users where email = lower(v_email);

  if v_user_id is null then
    -- Reviewer has not registered yet: create a confirmed account for them
    -- so they can sign in directly without waiting on a confirmation email.
    v_user_id := gen_random_uuid();

    insert into auth.users (
      instance_id,
      id,
      aud,
      role,
      email,
      encrypted_password,
      email_confirmed_at,
      raw_app_meta_data,
      raw_user_meta_data,
      created_at,
      updated_at
    ) values (
      '00000000-0000-0000-0000-000000000000',
      v_user_id,
      'authenticated',
      'authenticated',
      lower(v_email),
      extensions.crypt(v_password, extensions.gen_salt('bf')),
      now(),
      jsonb_build_object('provider', 'email', 'providers', array['email']),
      '{}'::jsonb,
      now(),
      now()
    );

    -- GoTrue resolves password logins through `auth.identities`; without a
    -- matching email identity the account exists but cannot sign in.
    insert into auth.identities (
      provider_id,
      user_id,
      identity_data,
      provider,
      last_sign_in_at,
      created_at,
      updated_at
    ) values (
      v_user_id,
      v_user_id,
      jsonb_build_object('sub', v_user_id::text, 'email', lower(v_email), 'email_verified', true),
      'email',
      now(),
      now(),
      now()
    );

    raise notice 'Created reviewer account % (%).', v_email, v_user_id;
  else
    -- Account already exists (reviewer signed up themselves, or this script
    -- was run before): reset the password and make sure the email is
    -- confirmed, since the AI gate also checks `email_confirmed_at`.
    update auth.users
       set encrypted_password = extensions.crypt(v_password, extensions.gen_salt('bf')),
           email_confirmed_at = coalesce(email_confirmed_at, now()),
           updated_at         = now()
     where id = v_user_id;

    raise notice 'Reset password for existing reviewer account % (%).', v_email, v_user_id;
  end if;

  -- The `on_auth_user_created_profiles` trigger seeds the profile row on
  -- insert, but upsert anyway so the script also fixes accounts created
  -- before that trigger existed.
  insert into public.profiles (id, is_alpha, updated_at)
  values (v_user_id, true, now())
  on conflict (id) do update
    set is_alpha   = true,
        updated_at = now();
end;
$$;

-- Verify: expect one row with email_confirmed = true and is_alpha = true.
select u.email,
       (u.email_confirmed_at is not null) as email_confirmed,
       p.is_alpha,
       p.is_premium
  from auth.users u
  join public.profiles p on p.id = u.id
 where u.email = lower('mahvashparivash.cafe@gmail.com');
