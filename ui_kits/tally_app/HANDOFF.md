# Tally — handoff for Claude Code

This is the dev brief for implementing the Tally mobile app exactly as designed
in `ui_kits/tally_app/index.html`. Hand it to Claude Code together with the
listed files. The goal is **pixel parity with the design**, not a vibes-based
reinterpretation.

---

## Prompt to paste into Claude Code

> You are implementing a React Native (Expo) iOS-first app called **Tally**.
> The complete visual specification is in the attached HTML/JSX UI kit. Your
> job is to translate it into production React Native, **matching the kit
> screen-for-screen**.
>
> **Rules**
> 1. The UI kit is the source of truth. If your existing primitives don't match
>    a kit screen, change your primitives — do not redesign the screen.
> 2. Lift tokens verbatim from `tokens.js`. Do not invent new colors, radii,
>    spacing, font sizes, or shadows. If a value isn't in tokens, add it to
>    `src/theme/tokens.ts` and reuse — don't inline.
> 3. Match the **layout order top-to-bottom**, the **anatomy of every row**,
>    and the **copy** in every screen. Where the kit shows a list of N items,
>    show the same N items, in the same order, with the same labels.
> 4. For every screen below, build all variants shown in the kit (default,
>    error, empty, success, dismissed, RTL, monthly/yearly, etc).
> 5. Reuse a single component library across screens. The kit defines:
>    `Button`, `Avatar`, `CategoryTile`, `SegmentedControl`, `FabPill`,
>    `ScreenHeader`, `TabBar`, `Field`, `EmptyState`, `SettingsGroup`,
>    `PlanCard`. Do not introduce parallel chip/radio/picker components.
> 6. Every interactive target ≥ 44pt. Inputs use the `inputSurface` token, not
>    a plain border. Errors use the `owe` token directly under the field.
> 7. RTL: support `dir="rtl"` on Activity and Create Group screens. Mirror
>    chevrons; keep numerals LTR within RTL strings.
>
> **Existing screens already in the kit (do not redesign — just port):**
> Onboarding, Home/Groups, Friends, Group Detail (Expenses/Balances/Totals),
> Add Expense (default + advanced/shares), AI capture, AI assign, Account, QR
> Share modal.
>
> **New screens to build (each described below):**
> Auth, Activity, Create Group, Invite Accepted, Notifications, QR Scan,
> Plans, Confirm Email overlay.
>
> **Per-screen contract for every new screen:**
> Read the corresponding `*.jsx` file. Each component declares its **props**,
> **states/variants**, **anatomy** (in render order), and **tokens used**. Match
> all of it. The mock data in `index.html` is the canonical fixture — use it.
>
> **Acceptance criteria — automated where possible:**
> - Visual diff (screenshot test) of every screen vs. its kit frame at 390×844.
>   Tolerance ≤ 3% per screen.
> - All copy strings literally match the kit.
> - Light and dark themes both pass the diff.
> - No raw hex codes in component files (only `theme.colors.*`).
> - All interactive elements have a testID matching the screen.element pattern.
>
> **Out of scope:** real auth, real camera, real payments. Wire screens to a
> mock data layer that mirrors `index.html`'s constants.
>
> Begin by listing the file tree of the kit and confirming you've read every
> `*.jsx` and `tokens.js`. Do not propose layouts before you have.

---

## Files to attach

Attach the entire `ui_kits/tally_app/` folder. Critical files:

**Source of truth**
- `ui_kits/tally_app/index.html` — wires every screen, contains all mock data
- `ui_kits/tally_app/tokens.js` — color, shadow, font tokens for light + dark
- `colors_and_type.css` — global font + reset

**Primitives (must be reused, don't fork):**
- `ui_kits/tally_app/Primitives.jsx` — Button, Avatar, CategoryTile,
  SegmentedControl, FabPill, ScreenHeader, TabBar
- `ui_kits/tally_app/ios-frame.jsx` — visual reference only; native iOS
  status bar replaces this

**Screens — already designed, just port:**
- `OnboardingScreen.jsx`
- `HomeScreen.jsx`          (Groups list, summary card, FAB, TabBar)
- `FriendsScreen.jsx`       (search, summary chips, filter chips, rows)
- `GroupDetailScreen.jsx`   (Expenses / Balances / Totals tabs in one component)
- `AddExpenseScreen.jsx`    (default flow + advanced shares disclosure)
- `AiScreen.jsx`            (capture + assign-items state)
- `AccountScreen.jsx`       (profile, summary row, settings groups, QrShareModal)

**Screens — new, build to spec:**
- `AuthScreen.jsx`          (sign-in / create-account / error)
- `ActivityScreen.jsx`      (sectioned timeline, filter chips, empty, RTL)
- `CreateGroupScreen.jsx`   (form, members, prefilled / solo / RTL variants)
- `InviteAcceptedScreen.jsx` (celebratory confirmation, group card)
- `NotificationsScreen.jsx` (sectioned feed, invite/payment/settle/expense)
- `QrScanScreen.jsx`        (scanning / success / permission-denied)
- `PlansScreen.jsx`         (Free / Plus / Trip Pass, monthly+yearly toggle)
- `ConfirmEmailOverlay.jsx` (default / sent / dismissed banner)

**Reference renders:**
- `ui_kits/tally_app/index-print.html` — printable A3 sheet of every screen,
  light + dark side by side. Use this as the visual diff target.

---

## Token map (paste into `src/theme/tokens.ts`)

```ts
export const lightTokens = {
  bg: '#FFFFFF',
  surface: '#FFFFFF',
  text: '#061E1E',
  muted: '#94A3B8',
  border: 'rgba(29, 69, 68, 0.25)',
  primary: '#10B981',
  inputSurface: '#DDF3EA',
  owed: '#10B981',
  owe: '#EF4444',
  owedSoft: '#D7F1E6',
  oweSoft: '#FEE2E2',
  cardRim: 'rgba(29, 69, 68, 0.25)',
  shadowCard: '0 4px 10px rgba(6,30,30,0.08)',
  shadowSegment: '0 1px 3px rgba(6,30,30,0.10)',
  shadowFab: '0 2px 4px rgba(6,30,30,0.20)',
};
export const darkTokens = {
  bg: '#1E3F3D',
  surface: '#2A504D',
  text: '#DCE7E4',
  muted: '#94ABAA',
  border: '#3A6663',
  primary: '#5EE6A0',
  inputSurface: '#335E5B',
  owed: '#5EE6A0',
  owe: '#F2A0AC',
  owedSoft: '#2F6A56',
  oweSoft: '#4A2F37',
  cardRim: '#3A6663',
  shadowCard: '0 4px 10px rgba(0,0,0,0.22)',
  shadowSegment: '0 1px 3px rgba(0,0,0,0.28)',
  shadowFab: '0 2px 4px rgba(0,0,0,0.28)',
};
```

Radii: `card 16, listRow 12, fab 28, chip 8`. Type: Inter (Latin), Vazirmatn
(Farsi). Title 28/700, section 18/700, body 15/500, meta 11–12/600 uppercase
letterspaced 0.5.

---

## Why your previous build drifted

The Add-expense screenshot you sent showed the dev keeping their existing
primitives (chip-row category selector, You/Aaron radio buttons, "Who's this
with" member chips) instead of rebuilding to the kit. The pattern to avoid:
treating the design as inspiration when it's a spec. The list of "Existing
screens" above all already exist in the kit — port them faithfully before
touching the new ones.
