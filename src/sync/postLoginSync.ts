/**
 * Pure decision logic for "should we sync right after login, and is anything
 * on this device at risk if we do?".
 *
 * Deliberately free of imports so it runs under vitest's `node` environment
 * and can be reasoned about without a database, a network, or React. All the
 * I/O lives in `DatabaseContext`, which calls these functions in order:
 *
 *   authLinkReady → fetchAccountCloudSyncPref → resolveSyncPref
 *     → persist the pref locally when it was inherited
 *     → if on and eligible: collectLocalOnlyRowIds → prompt if anything is at risk
 */

/** Rows that exist on this device but not in the signed-in account. */
export type LocalOnlyCounts = {
  groupCount: number;
  expenseCount: number;
};

/** What the user picked in the pre-sync merge prompt. */
export type MergeChoice = "merge" | "cloud-only" | "dismiss";

/**
 * Outcome of `setCloudSyncUserEnabled`. `"dismissed"` means the user backed
 * out of the merge prompt — the caller must leave the toggle visually off and
 * the stored preference untouched.
 */
export type EnableSyncResult = "applied" | "ineligible" | "dismissed";

export type ResolvedSyncPref =
  | { kind: "off" }
  /** `inherited` is true when the value came from the account, not this device. */
  | { kind: "on"; inherited: boolean };

/**
 * Read the tri-state device preference out of its stored string form.
 * `null` means the key is absent — this device has never chosen, so it should
 * inherit the account default. That is distinct from an explicit `"0"`.
 */
export function parseLocalSyncPref(
  raw: string | null | undefined,
): boolean | null {
  if (raw === null || raw === undefined || raw === "") return null;
  return raw === "1" || raw === "true";
}

/**
 * Device choice beats account default, always. This is what keeps sync off on
 * a shared laptop the user deliberately turned it off on.
 */
export function resolveSyncPref(input: {
  accountPref: boolean | null;
  localPref: boolean | null;
}): ResolvedSyncPref {
  const { accountPref, localPref } = input;
  if (localPref !== null) {
    return localPref ? { kind: "on", inherited: false } : { kind: "off" };
  }
  return accountPref === true
    ? { kind: "on", inherited: true }
    : { kind: "off" };
}
