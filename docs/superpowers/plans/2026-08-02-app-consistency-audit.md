# App Consistency Audit (Phase 1) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Produce a reviewed-and-committed audit document cataloguing every design inconsistency and code-visible bug across all Tally screens, organized both by pattern class and by screen.

**Architecture:** 14 read-only audit subagents run in parallel (8 solo agents for large screens, 5 grouped agents for small screens, 1 cross-cutting agent for shared UI/navigation). Each returns a structured "pattern profile + findings" report. The main session consolidates the 14 reports into one findings doc — cross-screen inconsistencies are detected at consolidation time by comparing pattern profiles, since agents cannot see each other's screens.

**Tech Stack:** Expo / React Native (TypeScript), agents via the Agent tool (`Explore` type, read-only), findings doc in Markdown.

**Spec:** `docs/superpowers/specs/2026-08-02-app-consistency-unification-design.md`

## Global Constraints

- **No code changes in Phase 1.** Audit agents are read-only; the only file created is the findings doc.
- Platforms: iOS and Android are equal targets; web out of scope.
- Audit depth: full pass — actions/exits, buttons, headers, visual tokens, states, i18n/RTL, code-visible bugs.
- Every finding must carry a `file:line` reference. Unverifiable suspicions go in "Open questions", never stated as fact.
- Findings doc path (exact): `docs/superpowers/specs/2026-08-02-app-consistency-audit.md`.
- Commits go on the current branch (`design/ads-for-ai-credits`), docs only. The fix branch off `main` is created in Phase 2, not now.

---

### Task 1: Dispatch the 14 parallel audit agents

**Files:**
- Read (by agents): everything under `src/screens/`, `src/ui/`, `src/components/`, `src/navigation/`, `src/theme/`
- Create: one report file per agent in the session scratchpad directory, `audit-<slug>.md`

**Interfaces:**
- Produces: 14 scratchpad report files, each following the AUDIT REPORT FORMAT below. Task 2 consumes these files verbatim.

**Agent assignments** (slug → files to audit):

| Slug | Files |
|---|---|
| `add-expense` | `src/screens/AddExpenseScreen.tsx` |
| `ai-receipt` | `src/screens/AiReceiptScreen.tsx` |
| `group-detail` | `src/screens/GroupDetailScreen.tsx` |
| `account` | `src/screens/AccountScreen.tsx` |
| `create-group` | `src/screens/CreateGroupScreen.tsx` |
| `auth` | `src/screens/AuthScreen.tsx` |
| `friends` | `src/screens/FriendsScreen.tsx` |
| `groups` | `src/screens/GroupsScreen.tsx` |
| `settings-notifications` | `src/screens/SettingsScreen.tsx`, `src/screens/NotificationsScreen.tsx` |
| `activity-plans` | `src/screens/ActivityScreen.tsx`, `src/screens/PlansScreen.tsx` |
| `share-invite` | `src/screens/QrScanScreen.tsx`, `src/screens/GroupShareScreen.tsx`, `src/screens/InviteAcceptedScreen.tsx` |
| `modals` | `src/screens/ReceiptAssignDnDModal.tsx`, `src/screens/ConfirmEmailOverlay.tsx` |
| `onboarding-privacy` | `src/screens/OnboardingScreen.tsx`, `src/screens/PrivacyPolicyScreen.tsx` |
| `cross-cutting` | all of `src/ui/`, `src/components/`, `src/navigation/`, `src/theme/` |

- [ ] **Step 1: Dispatch all 14 agents in one message** (Agent tool, `subagent_type: "Explore"`, all in a single block so they run concurrently). For each screen agent, use this prompt template with `<FILES>`, `<SLUG>`, and `<SCRATCHPAD>` substituted:

```
Audit the following Tally (Expo/React Native) screen file(s) for design
consistency and bugs: <FILES>

You may also read src/ui/, src/theme/, src/navigation/types.ts for context
on shared components (AppButton, ScreenHeader, EmptyState, theme tokens),
but your findings must be about the assigned screen file(s) only.
This is a READ-ONLY audit except for one file: write your full report to
<SCRATCHPAD>/audit-<SLUG>.md and also return it as your final message.

For EACH assigned screen, produce a report in EXACTLY this format:

## Screen: <ScreenName>

### Pattern profile
- **Presentation:** how the screen is entered/presented (stack push, modal,
  overlay) and how it is exited (back chevron, swipe, close button, auto).
- **Confirm action:** for any save/submit/done flow: exact button label,
  location (header-right / bottom of scroll / floating / inline), component
  used (AppButton + variant/size, ad-hoc Pressable, text link), disabled
  logic, and what happens on unsaved-changes + back.  Write "none" if the
  screen has no confirm action.
- **Header:** ScreenHeader / custom implementation / native-stack header /
  none. Note title style and right-slot contents.
- **Buttons inventory:** every tappable action: label, component used,
  variant, where it sits.
- **States:** how loading, empty, and error states are rendered
  (EmptyState component, ad-hoc view, missing entirely).
- **Token usage:** raw hex colors, hardcoded font sizes/weights, or magic
  spacing values used instead of theme colors/tokens/typography — give
  counts and representative file:line examples.
- **i18n/RTL:** hardcoded user-facing strings (count + examples with
  file:line); layout that breaks under RTL (row direction, chevrons,
  text alignment).

### Findings
A numbered list. Each finding:
- **[bug|inconsistency|polish]** one-sentence description — `file:line` —
  1-3 lines of evidence (quote the code).
For bugs specifically look for: handlers that can't fire or are missing,
race conditions, stale closures/state, unhandled promise rejections,
missing await, list keys, memory leaks (missing cleanup in useEffect),
dead code paths, and off-by-one/edge cases in split/settlement math.

### Open questions
Anything you suspect but cannot verify from code alone (needs running the
app). Phrase as a question.

Do not propose fixes. Do not editorialize about code style. Severity
definitions: bug = broken behavior a user can hit; inconsistency = works
but diverges from patterns elsewhere in the app; polish = cosmetic.
```

For the `cross-cutting` agent, replace the per-screen format with:

```
Audit Tally's shared layer for consistency risks: src/ui/ (all files),
src/components/ (all files), src/navigation/ (all files), src/theme/
(all files). This is a READ-ONLY audit except for one file: write your
report to <SCRATCHPAD>/audit-cross-cutting.md and also return it.

Report in this format:

## Shared-layer inventory
- For each reusable component: name, purpose, and which props/variants
  exist (e.g. AppButton variants, ScreenHeader slots).

## Findings
Numbered list, same [bug|inconsistency|polish] format with file:line and
evidence. Look especially for: components that duplicate each other's
purpose; theme tokens defined but unused; tokens missing that screens
would need (forcing raw hex); navigation options set inconsistently
across navigators (headerShown, presentation, gestures); MainTabs.tsx
per-tab styling divergence; RTL handling gaps in shared components.

## Open questions
Anything needing a running app to verify.
```

- [ ] **Step 2: Verify all 14 reports exist and are non-empty**

Run: `wc -l <scratchpad>/audit-*.md`
Expected: 14 files, each > 20 lines. If an agent failed or returned an empty/malformed report, re-dispatch that one agent with the same prompt.

- [ ] **Step 3: Spot-check report quality**

Read 2 reports (one large screen, one grouped). Every finding must have a `file:line`. If a report editorializes or lacks line references, re-dispatch that agent with the prompt plus a note about what was missing.

---

### Task 2: Consolidate reports into the findings doc

**Files:**
- Read: all 14 `<scratchpad>/audit-*.md` reports
- Create: `docs/superpowers/specs/2026-08-02-app-consistency-audit.md`

**Interfaces:**
- Consumes: the 14 AUDIT REPORT FORMAT files from Task 1.
- Produces: the findings doc the user annotates; Phase 2 (conventions + fixes) is planned directly from this doc.

- [ ] **Step 1: Build the pattern-class comparison.** Read all 14 reports. From the "Pattern profile" sections, tabulate across screens: confirm-action style, header style, button component usage, state handling, token discipline, i18n status. A pattern class becomes an **Inconsistency class** when ≥2 screens do the same job differently.

- [ ] **Step 2: Write the findings doc** with EXACTLY this structure:

```markdown
# Tally App Consistency Audit — 2026-08-02

**Status:** Awaiting user annotation
**How to annotate:** Under any screen in Part 2, add lines starting with
`> USER:` describing bugs you've seen on that screen in the running app.

## Part 1 — Inconsistency classes (cross-screen)

### C1. <class name, e.g. "Confirm/save actions">
**What varies:** <one sentence>
| Screen | Current behavior | Evidence |
|---|---|---|
| <Screen> | <e.g. "Done", header-right, ghost AppButton> | `file:line` |
<one row per screen that has this pattern>

<repeat C2, C3, ... for each class found>

## Part 2 — Per-screen findings

### <ScreenName> (`src/screens/<file>`)
**Pattern profile:** <3-5 line condensation of the agent's profile>
**Findings:**
1. **[bug]** ... — `file:line`
2. **[inconsistency]** ... — `file:line` — part of class C<n>
<all findings; inconsistencies cross-reference their class>

<one section per screen, in the same order as the agent table in the plan;
then a "Shared layer" section for the cross-cutting report>

## Part 3 — Open questions (need the running app)
<numbered, grouped by screen>

## Part 4 — Proposed conventions
(Filled in after user annotation — Phase 2.)
```

Rules: every screen from the agent table appears in Part 2 even if its findings list is empty (write "No findings."). Every inconsistency finding in Part 2 references a class in Part 1. Keep agents' `file:line` references verbatim. Do not include fix proposals — Part 4 stays empty.

- [ ] **Step 3: Coverage check.** Verify against the plan's agent table: all 19 screen files + shared layer appear in Part 2; every Part 1 class row's screen also has the matching finding in Part 2; no finding lacks a `file:line`. Fix gaps by re-reading the relevant scratchpad report (not by guessing).

---

### Task 3: Commit and hand off to user

**Files:**
- Modify: none. Commit: `docs/superpowers/specs/2026-08-02-app-consistency-audit.md`

- [ ] **Step 1: Commit the findings doc**

```bash
git add docs/superpowers/specs/2026-08-02-app-consistency-audit.md
git commit -m "Add app-wide consistency audit findings (Phase 1)

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

- [ ] **Step 2: Hand off.** Tell the user: the doc path, the count of classes/bugs/inconsistencies found, the 3 most severe bugs, and ask them to annotate Part 2 with `> USER:` lines for bugs they've seen, then return for Phase 2 (conventions decision list + fix plan).
