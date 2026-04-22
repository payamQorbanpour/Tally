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

Copy [`.env.example`](./.env.example) to **`.env`** in the project root, then set Expo public env vars (do **not** commit the filled `.env`):

- `EXPO_PUBLIC_SYNC_URL` — sync backend URL (Supabase project URL today)
- `EXPO_PUBLIC_SYNC_ANON_KEY` — sync backend anon key (Supabase anon key; used with your RLS policies, sign-in is optional in this app build)
- `EXPO_PUBLIC_SYNC_ENABLED=0` — force the app to treat cloud as unavailable (no full-table pull/push and no Realtime)

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

## Android release (APK / AAB)

This app is an **Expo** project with a checked-in `android/` tree and **EAS** configured (`eas.json`). To produce installable or store-ready Android artifacts:

**EAS Build (recommended)** — no local Android SDK required for the build itself; signing can use [EAS credentials](https://docs.expo.dev/app-signing/app-credentials/).

```bash
npx eas-cli build --platform android
```

Use `--profile production`, `preview`, or `development` to match the profiles in `eas.json`.

**APK vs AAB (EAS):** By default, EAS tends toward **AAB** for store-style builds. To download an **APK** (sideloading, internal testing, or stores that want APK), set `android.buildType` to `"apk"` on the profile you use in `eas.json`:

```json
"preview": {
  "distribution": "internal",
  "android": {
    "buildType": "apk"
  }
}
```

Then run `npx eas-cli build --platform android --profile preview` (or whichever profile you configured). Google Play production uploads normally use an **AAB**; keep `buildType` unset or use `app-bundle` for that path.

**Local Gradle** — from the repo root, after a normal `npm install`:

```bash
cd android
./gradlew assembleRelease    # APK under android/app/build/outputs/apk/release/
./gradlew bundleRelease      # AAB under android/app/build/outputs/bundle/release/
```

You must have the Android toolchain and a **release keystore** configured in `android/app/build.gradle` (or use debug builds only for local testing).

### EAS Build + `expo-updates`

During an Android EAS build, `expo-updates` runs `configuration:syncnative` with the working directory sometimes set to `android/`. The stock CLI then looks for `android/package.json` and fails with a `ConfigError`. This repo includes **`patches/expo-updates+29.0.16.patch`**, which makes the CLI walk up to the real app root (where `package.json` lives).

`npm install` runs **`patch-package`**, which reapplies that patch (and any others under `patches/`) on every install, including CI and EAS builders—do not delete the patch file if you rely on cloud Android builds.

## Tech stack

- **Expo** ~54, **React** 19, **React Native** 0.81, **TypeScript**
- **React Navigation** (stack + bottom tabs; responsive web sidebar)
- **expo-sqlite** (local) + **@supabase/supabase-js** (optional full-table push/pull and Realtime)
- **Vitest** for tests

## License

This project is **private** (`"private": true` in `package.json`). Add a `LICENSE` file if you want to share it under explicit terms.
