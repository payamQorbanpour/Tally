# App-Wide Design Consistency & Bug-Fix Pass — Design

**Date:** 2026-08-02
**Status:** Approved (pending user review of this document)

## Goal

Make Tally feel like one integrated, deliberately designed app. Today, equivalent
actions look different on different screens (e.g., a "Done" button top-right on one
edit page, a differently styled "Save" or "Save Group" button — sometimes at the
bottom of the page — on others). Alongside the design pass, find and fix functional
bugs screen by screen.

## Decisions made during brainstorming

- **Process:** Audit first, then fix. No code changes before the audit is reviewed.
- **Conventions:** Claude proposes one winning convention per inconsistency class
  (based on the dominant existing pattern + platform norms); the user approves or
  overrides each one before it is applied.
- **Known bugs:** The user annotates the audit findings doc with bugs they have
  seen; the audit doc is organized per-screen to jog memory.
- **Platforms:** iOS and Android are equal targets. Conventions must feel right on
  both. Web is out of scope unless a fix is free.
- **Depth:** Full consistency pass — action patterns, button styles, headers,
  spacing/typography/color-token usage, empty/loading/error states, i18n/RTL.
- **Execution:** Parallel per-screen audit; fixes land as one batch per pattern
  class, then a per-screen bug-fix pass.

## Context

The app already has a UI kit; the inconsistency is in usage, not absence of tools:

- `src/ui/AppButton.tsx` — variants `primary | secondary | outline | ghost | destructive`, sizes `sm | md`
- `src/ui/ScreenHeader.tsx` — custom header with centered title, back chevron, and a `right` action slot
- `src/theme/` — `ThemeContext`, `tokens.ts`, `typography.ts`
- `src/ui/` — `EmptyState`, `Field`, `AppTextInput`, `SettingsGroup`, etc.
- i18n with RTL support (Vazirmatn font, `AutoDirectionText`)

~19 screens in `src/screens/`; several are very large (AddExpenseScreen ~126 KB,
AiReceiptScreen ~110 KB, GroupDetailScreen ~108 KB).

## 1. Audit process

One subagent per screen in `src/screens/`, run in parallel, plus one cross-cutting
agent covering `src/components/`, `src/ui/`, and `src/navigation/`. All agents work
from the same checklist:

1. **Actions & exits** — where confirm actions live (header-right vs bottom
   button), their labels (Done vs Save vs Save X), which button style/variant,
   back-button behavior, unsaved-changes handling.
2. **Buttons** — `AppButton` usage vs ad-hoc `Pressable`s; variant and size
   correctness for the action's role.
3. **Headers** — `ScreenHeader` vs custom implementations vs native-stack header.
4. **Visual tokens** — raw hex colors / magic spacing numbers vs theme
   colors/tokens/typography.
5. **States** — presence and consistency of loading, error, and empty states
   (`EmptyState` vs ad-hoc).
6. **i18n / RTL** — hardcoded user-facing strings, direction-sensitive layout
   mistakes.
7. **Bugs visible in code** — broken or missing handlers, race conditions, stale
   state, unhandled promise rejections, dead code paths.

Each finding is structured: screen, category, description, `file:line`, severity
(bug / inconsistency / polish).

## 2. Findings doc — user review gate

Output: `docs/superpowers/specs/2026-08-02-app-consistency-audit.md`, organized
**both ways**:

- **By pattern class:** e.g., "Save actions — 3 distinct styles found", listing
  every screen instance of each style.
- **By screen:** everything found on that screen, so the user can walk the app
  screen by screen and annotate with bugs they have observed.

Findings that cannot be verified from code are marked as open questions, never
guessed. No code changes happen until the user has reviewed this doc and added
their known bugs.

## 3. Conventions — decision list

For each inconsistency class, Claude proposes exactly one winning convention with
rationale (dominant existing pattern + what feels native on both iOS and Android),
presented as multiple-choice decisions the user approves or overrides one at a
time. Approved conventions are appended to the audit/spec doc as Tally's design
rules, so future features follow them.

## 4. Fix execution

- **Branch:** new branch off `main`. The current `design/ads-for-ai-credits`
  branch and its uncommitted work are left untouched.
- **Design fixes:** one commit per pattern class (e.g., "unify save actions across
  edit screens"). Pattern-level batches — not screen-level — are what guarantee
  app-wide consistency. Where a pattern needs shared support, extend the shared
  component (`ScreenHeader`, `AppButton`, etc.) instead of per-screen one-offs.
- **Bug fixes:** after design batches, a per-screen bug-fix pass covering audit
  findings plus user-reported bugs, one commit per screen (or per bug when large).
- **Verification:** after every batch, `npm run lint` and `npm test` must pass;
  each batch ends with a short list of what to manually verify in the app on iOS
  and Android.

## Error handling

- Ambiguous audit findings become questions in the findings doc, not assumptions.
- If a pattern-class fix turns out to require risky refactoring inside one of the
  very large screens, that screen's migration is split into its own commit and
  flagged rather than bundled silently.

## Out of scope

- Web-specific behavior (hover states, `src/web/`) unless a fix applies for free.
- Feature work, including the in-flight rewarded-ads AI credits work.
- Wholesale refactoring/splitting of the large screen files beyond what a fix
  requires (flagged as follow-up if warranted).

## Next step

After user approval of this document: invoke the `superpowers:writing-plans` skill
to produce the implementation plan for Phase 1 (the audit).
