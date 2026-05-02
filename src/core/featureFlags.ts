/**
 * Build-time feature flags driven by `EXPO_PUBLIC_*` env vars. Each flag is
 * resolved as a function so the value is read at call time (tests can swap
 * `process.env` between cases).
 */

const trim = (v: string | undefined) => (v ? v.trim().toLowerCase() : "");

/**
 * When enabled, the new-group screen shows the manual "group type" chips and
 * the user picks one. When disabled (the default) the chips are hidden, the
 * group is saved with `group_type = "other"` and queued in
 * `group_type_label_pending` for an AI worker to classify later.
 */
export function isGroupTypePickerEnabled(): boolean {
  const v = trim(process.env.EXPO_PUBLIC_GROUP_TYPE_PICKER);
  return v === "1" || v === "on" || v === "true";
}
