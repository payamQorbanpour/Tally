# Tally

A cross-platform **Expo (React Native)** app for **group spending and activity** (tabs: Groups, Friends, Activity, Account). It uses **local SQLite** via `expo-sqlite` and optional **Supabase** (PostgREST + Realtime) for multi-device sync, with theming, localization, and RTL support.

## Requirements

- [Node.js](https://nodejs.org/) (LTS recommended)
- npm (ships with Node)

For physical devices, use the [Expo Go](https://expo.dev/go) app, or a **development build** if you use native modules that require it (`expo-dev-client` is in the project).

## Setup

```bash
git clone https://github.com/payamQorbanpour/Tally.git
cd Tally
npm install
```

## Run

```bash
npm start
```

Then press `i` (iOS simulator), `a` (Android emulator), or `w` (web), or scan the QR code in Expo Go.

- **iOS / Android (native simulators):** have Xcode or Android Studio configured as usual.
- **Web:** `npm run web`

## Environment (optional sync)

The app can run **offline** without sync. For **Supabase**, you must create the remote tables and RLS once, or API calls will fail and the dashboard can show **no** database traffic: open the **SQL** editor in your Supabase project, run the file **`supabase/tally_remote_schema.sql`**, then (optionally) add the same tables to the **Realtime** publication under **Database → Publications** so in-app live updates work.

Set Expo public env vars (e.g. in a `.env` in the project root; do **not** commit secrets):

- `EXPO_PUBLIC_SUPABASE_URL` — project URL
- `EXPO_PUBLIC_SUPABASE_ANON_KEY` — anon key (used with your RLS policies; sign-in is optional in this app build)
- `EXPO_PUBLIC_POWERSYNC_ENABLE_SYNC=0` or `EXPO_PUBLIC_SUPABASE_ENABLE_SYNC=0` — force the app to treat cloud as unavailable (no full-table pull/push and no Realtime)

Details are in `src/sync/config.ts` and `src/sync/supabaseSync.ts`.

## Scripts

| Command        | Description              |
| -------------- | ------------------------ |
| `npm start`    | Start Expo dev server     |
| `npm run web`  | Start with web            |
| `npm run ios`  | Open iOS simulator        |
| `npm run android` | Open Android emulator  |
| `npm test`     | Run unit tests (Vitest)  |
| `npm run test:watch` | Vitest in watch mode |

## Tech stack

- **Expo** ~54, **React** 19, **React Native** 0.81, **TypeScript**
- **React Navigation** (stack + bottom tabs; responsive web sidebar)
- **expo-sqlite** (local) + **@supabase/supabase-js** (optional full-table push/pull and Realtime)
- **Vitest** for tests

## License

This project is **private** (`"private": true` in `package.json`). Add a `LICENSE` file if you want to share it under explicit terms.
