/**
 * Distribute totalMinor across userIds with integer fairness (remainder to earliest ids).
 */
export function splitEqualMinor(
  totalMinor: number,
  userIds: readonly string[],
): Map<string, number> {
  const n = userIds.length;
  if (n === 0) throw new Error("At least one participant is required");
  if (!Number.isInteger(totalMinor) || totalMinor <= 0) {
    throw new Error("Amount must be a positive integer of minor units");
  }
  const base = Math.floor(totalMinor / n);
  const rem = totalMinor - base * n;
  const out = new Map<string, number>();
  userIds.forEach((id, i) => {
    out.set(id, base + (i < rem ? 1 : 0));
  });
  return out;
}
