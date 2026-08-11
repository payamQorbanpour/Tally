# AI screen follow-ups — handoff

**Date:** 2026-08-11
**Status:** investigated, not implemented

Four items raised after the `parse-description` outage fix merged to `main`
(`107dce2`). Each was investigated; none is implemented. Findings below so
the next session does not pay to re-derive them.

## 0. Still unverified: the outage fix itself

`ai-proxy` was deployed and the migrations applied, but **no one has yet run a
real `parse-description` and confirmed it works.** Do this first — everything
below is cosmetic by comparison.

Test on `mahvashparivash.cafe@gmail.com` (premium → unlimited, so the credits
path cannot confound the result). Type a short expense, tap Analyze, then check
Supabase → Edge Functions → `ai-proxy` → Logs for that minute. Both
`chat_provider_failed` and `ai_config_read_failed` should be absent.

## 1. Voice transcription truncates

**Symptom:** spoke a full sentence, input box received only "I spend".

Ruled out by tracing the whole path — every hop handles the payload whole:
- `transcribeAudio.ts:4-19` reads the entire file; `:36` only `.trim()`s the result
- `ai-proxy/index.ts:886` `atob` + `Uint8Array.from` decodes the full string; no
  output-length param is sent to ElevenLabs or Whisper
- the `describeText` `TextInput` (`AiReceiptScreen.tsx:3913-3927`) has no `maxLength`
- the 120s `ai_max_audio_seconds` cap cannot fire on a spoken sentence

**Leading candidate:** a native encoder flush race in `expo-audio`.
`stopVoiceRecord` (`AiReceiptScreen.tsx:2217-2250`) awaits `recorder.stop()` at
:2222 and reads `recorder.uri` at :2224 with no settle guard. `expo-audio`'s own
web shim waits for a final `dataavailable` before resolving `stop()`
(`AudioModule.web.ts:436`), implying the contract is "flush before resolve" — if
the native module resolves early, the `.m4a` is read partially written, truncated
at the END. That matches the symptom exactly.

Not provable from source. Next step is instrumentation, not a fix: log the file
size and `durationMillis` at :2224, speak a known-length sentence, and see
whether the file is short before it is ever uploaded. A settle delay would be a
workaround; confirm the cause first.

Also note: the mic is tap-to-toggle, not press-and-hold (`MainTabs.tsx:691`,
`FabPill.tsx:89-109`) — so "released the button early" is not a possible cause.

## 2. Credits chip — NOT a regression

**It was never removed.** `git log -S"creditsChip"` shows one commit ever
touching it (`2467657`, plus a digit-localization tweak in `a3613bf`). The JSX is
live on `main` at `AiReceiptScreen.tsx:3109-3116`, the i18n key `aiCredits.chip`
exists in all three locales (`translations.ts:2268, 3342, 4420`), the style has
nothing hiding it, and the balance still flows through `AiCreditsContext` →
`setAiCreditsListener` (`aiProxy.ts:68-70`).

The chip renders only when `!credits.isUnlimited`. **Premium and pass holders
are meant not to see it** — they have no balance to show. The account that
reported it missing is premium, which fully explains the observation.

If the desired behaviour is different — e.g. premium should see "Unlimited"
rather than nothing — that is a new feature, not a fix.

## 3. Pre-flight credit check

Three of four entry points already gate on `ensureAiAccess`
(`AiReceiptScreen.tsx:1591-1603`, wrapping `resolveAiAccess` in
`src/core/aiAccess.ts:37-45`):
- `runParse` :1917, `runDescribe` :2333, `startVoiceRecord` :2163

**The gap is `stopVoiceRecord` (`:2217-2250`)** — the function that actually
fires the billed `transcribeAudioFile` call at :2226. It checks only
`voicePhase !== "recording"` at :2218. Between the gate at record-start and the
send at record-stop the balance can reach zero (spent on another device), and
today only the server's 402 catches it (`:2234-2238`).

That is the hook point. Note the client balance is cached, not guaranteed fresh
— a pre-flight check reduces wasted round-trips but cannot replace the server
check, which must stay authoritative.

## 4. Ad reward says 3, server grants 1

The server is already correct: `AD_REWARD_CREDITS=1` deployed,
`envInt("AD_REWARD_CREDITS", 1)` at `ad-reward/index.ts:248,322`, matching
`.env:156`.

**The stale "3" is client display copy:** `src/components/AiCreditsPanel.tsx:62`
hardcodes `t("aiCredits.body").replace("{{count}}", "3")`. The i18n string is
correctly parameterised; the literal `"3"` is the bug. Users are promised 3
credits and given 1.

Fix `:62`, and prefer sourcing the number rather than hardcoding `"1"` — the
value already travels as a server secret, so a shared constant or a config key
would stop the two drifting apart again.

Also stale, same number: `.env.example:140` says "default 3".

**Merge hazard:** the worktree `.worktrees/ads-for-ai-credits` (branch
`implement/ads-for-ai-credits`) still carries the OLD defaults
`envInt("AD_REWARD_CREDITS", 3)` / `envInt("AD_REWARD_DAILY_CAP", 30)`. Merging
that branch would silently revert the corrected server defaults.

## Repo state at handoff

- `main` is at `107dce2`, **6 commits unpushed** to `origin/main`.
- Uncommitted and unrelated, deliberately left alone: `Makefile`,
  `supabase/functions/verify-bazaar-purchase/index.ts`.
- `npm test`: 414 pass. One test FILE fails to load,
  `src/core/downscaleReceiptImage.test.ts` — a pre-existing react-native
  Flow-syntax parse error under Vitest, unrelated to any of this. Worth fixing
  on its own; it currently hides any regression in that module.
- Production: 15 migrations applied (ledger repaired from 4), four
  `ai_provider_*` config keys registered with no seeded values, all 3 users have
  profiles.
