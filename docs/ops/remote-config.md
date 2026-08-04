# Remote config operator runbook

`app_config` (see `supabase/migrations/20260804010000_app_config.sql`) is the
single table backing every remote-config-driven behavior in the app: AI kill
switches and action flags, the first-run locale default, displayed plan
prices, the maintenance banner, the minimum supported version (force-update
gate), and the cloud-sync switch. `get-app-config` (and its legacy alias
`get-ai-config`) serves the resolved values to clients; `ai-proxy` enforces
the AI-related keys server-side from the same rows.

Operator recipes for changing values live in
[`supabase/scripts/set-app-config.sql`](../../supabase/scripts/set-app-config.sql).
This document is the "why" and the "don't do this" that the recipes file
doesn't have room for.

## Visibility model

Every key has two visibility numbers:

- `app_config_keys.max_visibility` — a **ceiling**, set once when the key is
  registered. Never a live value.
- `app_config.visibility` — the value on each row. May be less visible than
  the key's ceiling, never more (`tally_app_config_validate` rejects an
  over-visible write).

Three levels, most to least restrictive: `server` → `client` → `public`.

- **`server`** — never leaves the Edge Function. Rate limits, model names,
  prompt overrides. A client never sees these even if it's authenticated.
- **`client`** — returned only to a signed-in caller (`get-app-config` with a
  JWT; `Cache-Control: private, no-store`). AI flags live here.
- **`public`** — returned to anyone, no JWT required (`Cache-Control: public,
  max-age=300`). Locale defaults, plan prices, the maintenance message, the
  sync switch, the minimum version.

**The invariant:** a key may be `public` only if a hostile client that reads
the value and lies about it costs the business nothing. A client can always
ignore what the server told it and substitute its own value in local memory
— visibility controls what a *well-behaved* client can see, not what a
*malicious* one can pretend. So before raising a key's `max_visibility` to
`public`, ask: if a modified build ignored this value entirely, or reported
having read something else, what breaks? `sync_enabled` is safe — the server
independently enforces sync eligibility server-side regardless of what the
client believes. `ai_rate_limit_per_min` would not be safe at `public` even
though it's just a number — the only thing giving it force is `ai-proxy`
reading it server-side, but shipping it to every anonymous device makes it
trivial to find and reason about your own defenses. Keep anything with
security or business-cost weight at `server` or `client`, and only promote a
key to `public` when a hostile client lying about it is a genuine no-op.

## The `app.config_actor` convention

Every recipe in `set-app-config.sql` opens with:

```sql
set local app.config_actor = '<your name>';
```

All writes to `app_config` happen through the `service_role` key, so
`current_user` / `session_user` is identical for every operator and every
automated process — it records nothing useful about who actually made a
change. `app.config_actor` is a session-scoped Postgres setting that the
`tally_app_config_validate` and `tally_app_config_audit` triggers read and
store as `updated_by` (on `app_config`) and `changed_by` (on
`app_config_audit`).

**Omitting it does not block the write.** Both triggers do
`coalesce(nullif(current_setting('app.config_actor', true), ''), session_user)`
— if the setting was never set, it silently falls back to `session_user`
(the DB role name, e.g. `postgres`). This is deliberate: an incident
response must never be gated on remembering to fill in a name. But it means
an audit trail with a run of `session_user` entries is a sign someone
skipped the `set local` line, not a sign the system is broken — and it's
much less useful for reconstructing "who changed this and why" after the
fact. Set it anyway, every time.

`set local` scopes the setting to the current transaction — running it and
your write in the same `psql -c "..."` invocation (as every recipe does) is
what makes it apply. Running it as a separate `psql` call from the write has
no effect (the setting expires when that transaction ends).

## The cohort-precedence footgun

Resolution for a given key and caller is **first-match-wins** over
precedence order `allowlist → alpha → premium → everyone` (see
`resolveConfig` in `supabase/functions/_shared/appConfigResolve.ts`). A row
at `everyone` is only the *default* — a caller covered by a
higher-precedence row for the **same key** keeps whatever that row says,
full stop. Setting `('ai_enabled', 'everyone', false)` does **not** disable
AI for a premium user if an `('ai_enabled', 'premium', true)` row still
exists; the `everyone` row is invisible to that user, and the change will
look like it worked because nothing in a normal query flags the conflict.

This is exactly the trap the **KILL EVERYWHERE** recipe at the top of
`set-app-config.sql` exists to prevent — read it (not skim it) before an
incident, not during one. It walks through deleting every higher-precedence
row for a key before forcing `everyone` to the off value, which is the only
way to guarantee the key is actually off for every caller.

## Price-to-SKU table

`plans_price_*` keys (`locale_map`, `max_visibility = 'public'`) control
**display text only** — what `PlansScreen` shows the user before they tap
buy (`src/core/planPrices.ts`). They do not touch what either app store
actually charges. The real, binding price is set in each store's own
product listing, keyed off the product ID below (from
`src/premium/premiumConfig.ts`, `EXPO_PUBLIC_*` build-time env vars):

| `app_config` key       | Pass type  | Env var (store product ID)        |
| ----------------------- | ---------- | ---------------------------------- |
| `plans_price_night`     | Night Out  | `EXPO_PUBLIC_NIGHT_OUT_PASS_ID`    |
| `plans_price_trip`      | Trip       | `EXPO_PUBLIC_TRIP_PASS_ID`         |
| `plans_price_explorer`  | Explorer   | `EXPO_PUBLIC_EXPLORER_PASS_ID`     |
| *(none — see below)*    | Night Out extend | `EXPO_PUBLIC_NIGHT_OUT_EXTEND_ID` |
| *(none — see below)*    | Trip extend      | `EXPO_PUBLIC_TRIP_EXTEND_ID`      |
| *(none — see below)*    | Explorer extend  | `EXPO_PUBLIC_EXPLORER_EXTEND_ID`  |

**The three extend SKUs have no `app_config` key — their displayed prices are
hardcoded translation strings, not remote config.** `PlansScreen` renders them
from the bundled translations, so the procedure in this document does **not**
apply to them: changing an extend SKU's store listing price requires editing
the translation strings and shipping a build. There is no remote lever, and no
row you can add to `app_config` to create one — the keys do not exist.

This is a known, deliberate scope decision from the remote-config plan, not an
oversight and not something to "fix" by adding rows during an incident. It is
listed here only so that an operator changing an extend price does not scan
the table above, find nothing, and conclude there is nothing to keep in sync.
There is — it just lives in a build rather than in this table.

**Changing the `app_config` display price without also changing the store
listing price for the matching product ID means the user sees one number on
the Plans screen and is charged a different one at checkout.** These two
numbers have no automatic link — nothing in this codebase keeps them in
sync. Any price change is two separate manual steps done together: update
the store listing (App Store Connect / Google Play Console / Bazaar), then
update the matching `plans_price_*` row with the recipe in
`set-app-config.sql`. Do the store side first — if you only update
`app_config`, users briefly see a wrong-but-harmless number; if you only
update the store, users briefly see a right-looking number that undercharges
or overcharges relative to what's displayed, which is the worse direction to
be wrong in.

## How long a change takes to reach users

**A config change is not a switch you flip and watch take effect.** Worst case
for an incident switch (`sync_enabled`, `maintenance_message`,
`min_supported_version` — all `public`) reaching a signed-out user is the sum
of three independent delays:

1. **Up to 5 minutes of CDN caching.** The anonymous response is served with
   `Cache-Control: public, max-age=300, s-maxage=300`, so an edge node can
   keep serving the pre-change payload for that long after you write the row.
   (The authenticated response is `private, no-store` and skips this delay
   entirely.)
2. **Up to one client TTL.** The client only refetches on foreground once its
   last successful fetch is older than the server's `ttlSeconds` for that
   caller's audience — currently **5 min for anonymous/`public`, 15 min for
   signed-in/`client`** (`TTL_SECONDS` in
   `supabase/functions/_shared/appConfigResponse.ts`). The client reads that
   value off the response rather than assuming one.
3. **The app has to be foregrounded at all.** The refresh is driven by an
   `AppState` "active" event (plus cold start). **A user whose app is
   backgrounded or closed does not see the change until they next open it** —
   there is no push, no silent wake, no upper bound. Someone who does not
   open the app for a week gets the change in a week.

So: roughly **10 minutes** before an anonymous switch has reached the users
who are actively using the app right now, and **unbounded** for everyone else.
Do not treat an incident switch as immediate, and do not conclude it failed
because nothing changed 60 seconds after you ran the recipe — verify by
curling `get-app-config` directly (which shows the server's truth without
either delay) rather than by watching a device.

Kill switches that must act faster than this cannot rely on `app_config` at
all: `AI_KILL_SWITCH=1` is an Edge Function env var checked before any DB read
in `ai-proxy`, `get-ai-config`, and `get-app-config`, and its response is sent
`no-store` precisely so no CDN can hold it past the incident. That one takes
effect on the next request.

## Locale changes land on the next launch, not immediately

`locale_default` and `locale_region_map` (both `public`, `locale_map` /
`string`) only affect a **first-run device that has no explicit locale
choice yet** (`localeUserChosen` unset — see `src/i18n/LocaleContext.tsx`
and Task 7's `locale_user_chosen` migration). Even for that device, a change
to these keys does not take effect for anyone already running the app, and
not even for a fresh launch that's already past its locale-resolution mount
effect.

**`locale_region_map` merges over the bundled map, it does not replace it.**
The remote value is applied on top of `APP_LOCALE_BY_REGION` in
`src/i18n/localeDefaults.ts` (which ships `IR`/`AF`/`PK` → `fa` and `ES` →
`es`), so a remote map of `{"TR":"fa"}` adds Turkey and leaves every bundled
region working. List only the regions you are adding or changing — an entry
for a region the bundle already knows overrides just that one. (Merge rather
than replace is deliberate: under replace semantics, adding one region would
silently drop `IR` → `fa` and break first-run Farsi for Iran, which is the
exact scenario this in-house system exists to serve.)

Two independent reasons, both load-bearing:

1. **The mount effect reads the locally cached remote config, never a live
   fetch.** Locale resolution runs behind the app's hydration spinner and
   must not block on the network, so it calls `readCachedRemoteConfig()`
   (AsyncStorage read only) rather than `fetchRemoteConfig()`. A config
   change only reaches that cache the next time the client's normal
   background refresh runs — which itself only takes effect the *following*
   app launch, because nothing re-runs the locale-resolution mount effect
   mid-session.
2. **Crossing the Farsi/non-Farsi boundary requires a native reload.**
   `I18nManager.forceRTL()` flips React Native's layout-direction engine,
   but the already-mounted native view hierarchy does not re-layout itself
   in place — the app must restart natively for left/right and RTL string
   layout to actually change (`crossesAppRtlBoundary` /
   `nativeLayoutDirectionMismatch` in `LocaleContext.tsx`; this is a React
   Native / platform constraint, not a choice this codebase made). Silently
   rebooting a user's app mid-session because a background config refresh
   landed is not acceptable, so the code deliberately never does that —
   remote locale changes always wait for the user's own next cold start.

If you need a locale-affecting change to reach users faster than "eventually,
on their next launch," there is no remote-config lever for that — it
requires a client release.

## Known local-dev gotcha: `service_role` has no table grants after `supabase db reset`

On this project's local Supabase Docker instance, `service_role` has **no
`SELECT`/`INSERT`/`UPDATE`/`DELETE` grant on any `public`-schema table** —
not something any migration in this repo causes (it affects tables no
remote-config migration ever touched, e.g. `profiles`), and not present on
Supabase Cloud, which provisions these grants via its own bootstrap,
separate from migrations run here. Every Edge Function that reads
`app_config` (or any other table) through the service-role client fails with
`503` and a server log of `permission denied for table ...` until this is
fixed.

`supabase db reset` wipes any manual grant along with everything else, so
this reappears after every reset. Reapply it once, immediately after any
`supabase db reset`, before running any Edge Function verification against
the local stack:

```sql
grant usage on schema public to service_role;
grant select, insert, update, delete on all tables in schema public to service_role;
alter default privileges in schema public grant select, insert, update, delete on tables to service_role;
```

This is **not** part of any migration and must not be added to one — it's a
local Docker/Postgres provisioning quirk specific to this environment, not
something the schema is missing. If a fresh `supabase db reset` throws a
different error than `permission denied for table ...`, that's a different
problem — don't assume this same fix applies.
