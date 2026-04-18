# Tally

A cross-platform **Expo (React Native)** app for **group spending and activity** (tabs: Groups, Friends, Activity, Account). It uses **local SQLite** via `expo-sqlite` and optional **PowerSync** for cloud sync, with theming, localization, and RTL support.

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

The app can run **offline** without sync. For **PowerSync + Supabase**, set Expo public env vars (e.g. in a `.env` file in the project root; do **not** commit secrets—this repo’s `.gitignore` ignores `.env`):

- `EXPO_PUBLIC_POWERSYNC_URL` — PowerSync service URL
- `EXPO_PUBLIC_SUPABASE_URL` / `EXPO_PUBLIC_SUPABASE_ANON_KEY` — for Supabase-backed auth or connector flows as wired in the app
- `EXPO_PUBLIC_POWERSYNC_ENABLE_SYNC=0` — force offline mode (no `connect()`)

Details are in `src/sync/config.ts` and related sync code.

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
- **expo-sqlite** + **PowerSync** adapters (optional sync)
- **Vitest** for tests

## License

This project is **private** (`"private": true` in `package.json`). Add a `LICENSE` file if you want to share it under explicit terms.
