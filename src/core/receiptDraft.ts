/**
 * Local persistence for an in-progress "Add with AI" receipt: the parsed
 * lines plus the user's assignment progress (split mode, payer, who's
 * included), so an app kill mid-edit doesn't force a re-scan from scratch.
 *
 * Deliberately does NOT persist the receipt photo — base64 images are
 * multi-megabyte and AsyncStorage is the wrong place for them; the parsed
 * result is what has value. One draft per group: a fresh scan for the same
 * group simply overwrites the previous draft, which matches the screen's
 * workflow (only one receipt in flight per group at a time).
 *
 * Pure and framework-free — no React, no screen imports — so it stays unit
 * testable and reusable if a second screen ever wants the same drafts.
 * *When* to save (debounced, on every edit) is deliberately the caller's
 * job, not this module's: see `saveReceiptDraft`'s doc comment for why.
 */
import AsyncStorage from "@react-native-async-storage/async-storage";

/** Matches `EditableLine["kind"]` (`AiReceiptScreen.tsx`) and
 *  `SplitLine["kind"]` (`receiptSplit.ts`). Kept as a local literal union
 *  instead of importing either — this module must stay independent of the
 *  screen, and independent of `receiptSplit.ts`'s own concerns. */
export type ReceiptDraftLineKind = "item" | "spread";

/**
 * One parsed/edited receipt line, as the screen holds it minus the photo.
 *
 * `amountMinor` is integer minor units (cents, rial subunits, ...) — NOT
 * the screen's `EditableLine.amountMajor` (a float major-unit amount). The
 * screen already converts via `majorFloatToMinor` (`src/data/currencies.ts`)
 * before it needs minor units elsewhere (see `saveReceiptExpense`); the
 * wiring code should do that same conversion at the boundary into and out
 * of this module, so a draft never carries a float through a JSON
 * round-trip.
 */
export type ReceiptDraftLine = {
  id: string;
  label: string;
  amountMinor: number;
  /** Members sharing this line. Empty = unassigned. */
  sharerIds: string[];
  kind: ReceiptDraftLineKind;
  /** Mirrors `EditableLine.disabled`, but always present (not optional)
   *  once persisted — see `isDraftLine` below. */
  disabled: boolean;
};

/** Matches `ScanSplitMode` in `AiReceiptScreen.tsx`. */
export type ReceiptDraftSplitMode = "equal" | "exact" | "percent" | "shares" | "adj";

/** Everything a caller supplies for a save. `savedAt` is deliberately NOT
 *  part of this — `saveReceiptDraft` stamps it itself so callers never pass
 *  a clock reading (and can't accidentally reuse a stale one across
 *  debounced saves). */
export type ReceiptDraftInput = {
  groupId: string;
  lines: ReceiptDraftLine[];
  splitMode: ReceiptDraftSplitMode;
  payerId: string;
  includedMemberIds: string[];
  /**
   * ISO 4217 code the group was using when `lines[].amountMinor` was
   * computed (`majorFloatToMinor` at the screen's save boundary). Minor-unit
   * exponents differ by currency (0 / 2 / 3 — `src/data/currencies.ts`), so
   * an integer `amountMinor` is only meaningful together with the currency
   * it was divided by. `loadReceiptDraft` rejects a draft whose stored
   * currency doesn't match the caller's current one rather than silently
   * reinterpreting the same integer under a different exponent.
   */
  currency: string;
};

/** What a caller gets back from a successful load. */
export type ReceiptDraft = ReceiptDraftInput & {
  /** epoch ms, stamped by `saveReceiptDraft` at write time. */
  savedAt: number;
};

/**
 * On-disk envelope version. Bump this whenever `ReceiptDraft`'s persisted
 * shape changes in a way old data can't satisfy, and add a migration branch
 * in `parseStoredDraft` for the previous version rather than just rejecting
 * it outright — a version bump should upgrade old drafts where reasonably
 * possible, not just discard them.
 *
 * v1 → v2: added `currency`. A v1 envelope was written before that field
 * existed, so there is no recorded value to migrate — the true currency a
 * v1 draft's `amountMinor`s were computed against is simply not recoverable
 * from the bytes on disk. `parseStoredDraft` below treats a v1 envelope as
 * implicitly matching whatever currency the caller asks for (the same
 * assumption every build made before this fix), rather than discarding it
 * outright: that keeps a draft written in the last release still usable
 * for the common case (currency unchanged), while every save from this
 * build onward writes v2 and gets currency-mismatch protection for real.
 * Worst case for an in-flight v1 draft is unchanged from pre-fix behavior,
 * and it ages out within {@link MAX_DRAFT_AGE_MS} regardless.
 */
const CURRENT_VERSION = 2;

/**
 * A draft older than this is treated as gone on load, and proactively
 * swept. Receipt splitting is a same-session-ish task — scan, assign,
 * save — so a draft that survived a full week was almost certainly
 * abandoned (re-scanned some other way, or the user gave up); silently
 * resurrecting week-old line assignments onto whatever the group's
 * membership looks like *now* is more likely to confuse than help.
 */
const MAX_DRAFT_AGE_MS = 7 * 24 * 60 * 60 * 1000;

function draftKey(groupId: string): string {
  return `@tally:receipt_draft:${groupId}`;
}

function isReceiptDraftLineKind(v: unknown): v is ReceiptDraftLineKind {
  return v === "item" || v === "spread";
}

function isReceiptDraftSplitMode(v: unknown): v is ReceiptDraftSplitMode {
  return v === "equal" || v === "exact" || v === "percent" || v === "shares" || v === "adj";
}

function isStringArray(v: unknown): v is string[] {
  return Array.isArray(v) && v.every((x) => typeof x === "string");
}

/** Strict structural check for one persisted line. `amountMinor` must be a
 *  finite integer — a float here would mean a value round-tripped through
 *  JSON in major units (or hand-edited storage), which this module must
 *  never trust. */
function isDraftLine(v: unknown): v is ReceiptDraftLine {
  if (!v || typeof v !== "object") return false;
  const l = v as Record<string, unknown>;
  return (
    typeof l.id === "string" &&
    typeof l.label === "string" &&
    typeof l.amountMinor === "number" &&
    Number.isInteger(l.amountMinor) &&
    isStringArray(l.sharerIds) &&
    isReceiptDraftLineKind(l.kind) &&
    typeof l.disabled === "boolean"
  );
}

/**
 * Parse and fully validate whatever was under the key for `groupId`. Never
 * trusts the bytes: a truncated write, a hand-edited value, or a shape from
 * an old build all fall through to `null` rather than handing back a
 * partially-valid object. This is the only path storage data takes on its
 * way back to a caller.
 *
 * `currency` is the caller's *current* group currency — required so a v2
 * envelope's stored currency can be checked against it (reject on
 * mismatch; see `ReceiptDraftInput.currency`'s doc comment) and so a
 * legacy v1 envelope (no stored currency at all) has something to inherit
 * — see {@link CURRENT_VERSION}'s v1→v2 note.
 */
function parseStoredDraft(
  raw: string,
  groupId: string,
  currency: string,
): ReceiptDraft | null {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return null;
  }
  if (!parsed || typeof parsed !== "object") return null;
  const d = parsed as Record<string, unknown>;

  // Only a real v1 or the current version can possibly be valid — a future
  // build's shape (never restore forward) or garbage both fall to `null`.
  const isLegacyV1 = d.version === 1;
  if (!isLegacyV1 && d.version !== CURRENT_VERSION) return null;

  if (
    typeof d.groupId !== "string" ||
    d.groupId !== groupId ||
    typeof d.savedAt !== "number" ||
    !Number.isFinite(d.savedAt) ||
    !Array.isArray(d.lines) ||
    !d.lines.every(isDraftLine) ||
    !isReceiptDraftSplitMode(d.splitMode) ||
    typeof d.payerId !== "string" ||
    !isStringArray(d.includedMemberIds)
  ) {
    return null;
  }

  // v2+: the stored currency must be present and match exactly — see the
  // module version-history note for why a mismatch is a hard reject rather
  // than a conversion. v1: no stored value exists to check; inherit the
  // caller's currency (documented, bounded-risk migration — same note).
  let resolvedCurrency: string;
  if (isLegacyV1) {
    resolvedCurrency = currency;
  } else {
    if (typeof d.currency !== "string" || d.currency !== currency) return null;
    resolvedCurrency = d.currency;
  }

  return {
    groupId: d.groupId,
    lines: d.lines as ReceiptDraftLine[],
    splitMode: d.splitMode,
    payerId: d.payerId,
    includedMemberIds: d.includedMemberIds,
    currency: resolvedCurrency,
    savedAt: d.savedAt,
  };
}

/**
 * Persist a draft for `draft.groupId`, replacing any earlier draft for that
 * group. Best-effort: a full device or any other storage failure is
 * swallowed, not thrown — the draft is a convenience recovery path, not the
 * user's source of truth (that's still the screen's in-memory state), so a
 * failed save must never interrupt an edit in progress or crash the app.
 * Callers that want to know whether persistence is currently working (e.g.
 * to show a subtle "not saved" indicator) aren't supported by this
 * signature on purpose — see the module doc comment.
 *
 * Debouncing is intentionally the CALLER's job, not this function's. This
 * module has no lifecycle of its own (no mount/unmount, no "the user
 * navigated away") to hang a timer on, and the screen already owns exactly
 * that lifecycle plus the `EditableLine[]` → `ReceiptDraftLine[]` /
 * amountMajor → amountMinor conversion at its edit boundary. Putting the
 * debounce here would mean either leaking timer-cancellation concerns into
 * this module's public surface or duplicating them per-caller anyway once a
 * second caller shows up. A plain `save on every call` primitive is easier
 * to unit test and easier for the screen to wrap in whatever debounce
 * utility (or `useEffect` + `setTimeout`) it already uses elsewhere.
 */
export async function saveReceiptDraft(draft: ReceiptDraftInput): Promise<void> {
  const envelope = {
    version: CURRENT_VERSION,
    groupId: draft.groupId,
    savedAt: Date.now(),
    lines: draft.lines,
    splitMode: draft.splitMode,
    payerId: draft.payerId,
    includedMemberIds: draft.includedMemberIds,
    currency: draft.currency,
  };
  try {
    await AsyncStorage.setItem(draftKey(draft.groupId), JSON.stringify(envelope));
  } catch {
    // Best-effort — see doc comment above. Worst case a kill right after
    // this particular edit loses just that edit, same as before this
    // module existed.
  }
}

/**
 * Load the draft for `groupId`, or `null` if there isn't one, it fails
 * structural validation, its currency doesn't match `currency` (the
 * caller's current group currency), storage itself errored, or it's older
 * than {@link MAX_DRAFT_AGE_MS}. Never throws, and never returns a
 * partially-valid object — see {@link parseStoredDraft}.
 */
export async function loadReceiptDraft(
  groupId: string,
  currency: string,
): Promise<ReceiptDraft | null> {
  let raw: string | null;
  try {
    raw = await AsyncStorage.getItem(draftKey(groupId));
  } catch {
    return null;
  }
  if (!raw) return null;

  const draft = parseStoredDraft(raw, groupId, currency);
  if (!draft) return null;

  if (Date.now() - draft.savedAt > MAX_DRAFT_AGE_MS) {
    // Stale — treat as absent, and sweep it so it doesn't sit around being
    // re-parsed (and re-rejected by age) on every future load.
    await clearReceiptDraft(groupId);
    return null;
  }

  return draft;
}

/** Remove the draft for `groupId`, if any. Best-effort, same reasoning as
 *  {@link saveReceiptDraft} — a failed clear just leaves a draft sitting
 *  there to be re-validated (and likely re-used or re-aged-out) next load,
 *  which is harmless. */
export async function clearReceiptDraft(groupId: string): Promise<void> {
  try {
    await AsyncStorage.removeItem(draftKey(groupId));
  } catch {
    // best-effort
  }
}
