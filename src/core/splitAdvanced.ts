import { splitEqualMinor } from "./splitEqual";

/**
 * Equal split among participants, then apply per-person adjustments (minor units).
 * Adjustments must sum to zero so the total still matches `totalMinor`.
 */
export function splitEqualWithAdjustmentsMinor(
  totalMinor: number,
  participantIds: string[],
  adjustments: Map<string, number>,
): Map<string, number> {
  if (!Number.isInteger(totalMinor) || totalMinor <= 0) {
    throw new Error("Amount must be a positive integer of minor units");
  }
  if (participantIds.length === 0) {
    throw new Error("At least one participant is required");
  }
  let adjSum = 0;
  for (const id of participantIds) {
    const a = adjustments.get(id) ?? 0;
    if (!Number.isInteger(a)) {
      throw new Error("Each adjustment must be an integer (minor units)");
    }
    adjSum += a;
  }
  if (adjSum !== 0) {
    throw new Error("Adjustments must sum to zero");
  }
  const base = splitEqualMinor(totalMinor, participantIds);
  const out = new Map<string, number>();
  for (const id of participantIds) {
    out.set(id, (base.get(id) ?? 0) + (adjustments.get(id) ?? 0));
  }
  let s = 0;
  for (const v of out.values()) {
    if (v < 0) throw new Error("Equal + adjustment produced a negative share");
    s += v;
  }
  if (s !== totalMinor) {
    throw new Error("Internal error: adjusted split does not match total");
  }
  return out;
}

/**
 * Exact amounts: each participant's share in minor units (must sum to total).
 */
export function splitExactMinor(
  totalMinor: number,
  parts: { userId: string; minor: number }[],
): Map<string, number> {
  if (!Number.isInteger(totalMinor) || totalMinor <= 0) {
    throw new Error("Amount must be a positive integer of minor units");
  }
  if (parts.length === 0) throw new Error("At least one participant is required");
  let sum = 0;
  const out = new Map<string, number>();
  for (const p of parts) {
    if (!Number.isInteger(p.minor) || p.minor < 0) {
      throw new Error("Each share must be a non-negative integer");
    }
    sum += p.minor;
    out.set(p.userId, p.minor);
  }
  if (sum !== totalMinor) {
    throw new Error("Exact amounts must equal the expense total");
  }
  return out;
}

/**
 * Integer percentages (0–100) that must sum to 100.
 */
export function splitPercentMinor(
  totalMinor: number,
  parts: { userId: string; percent: number }[],
): Map<string, number> {
  if (!Number.isInteger(totalMinor) || totalMinor <= 0) {
    throw new Error("Amount must be a positive integer of minor units");
  }
  if (parts.length === 0) throw new Error("At least one participant is required");
  let pSum = 0;
  for (const p of parts) {
    if (!Number.isInteger(p.percent) || p.percent < 0 || p.percent > 100) {
      throw new Error("Each percent must be an integer from 0 to 100");
    }
    pSum += p.percent;
  }
  if (pSum !== 100) throw new Error("Percentages must sum to 100");

  const floors = parts.map((p) =>
    Math.floor((totalMinor * p.percent) / 100),
  );
  const allocated = floors.reduce((a, b) => a + b, 0);
  let rem = totalMinor - allocated;
  const order = parts
    .map((p, i) => ({
      i,
      frac: (totalMinor * p.percent) / 100 - floors[i]!,
    }))
    .sort((a, b) => b.frac - a.frac);

  const out = new Map<string, number>();
  for (let i = 0; i < parts.length; i++) {
    out.set(parts[i]!.userId, floors[i]!);
  }
  for (let k = 0; k < rem; k++) {
    const idx = order[k]?.i;
    if (idx === undefined) break;
    const uid = parts[idx]!.userId;
    out.set(uid, (out.get(uid) ?? 0) + 1);
  }
  return out;
}

/**
 * Positive integer share counts (e.g. 2:1 split).
 */
export function splitSharesMinor(
  totalMinor: number,
  parts: { userId: string; shares: number }[],
): Map<string, number> {
  if (!Number.isInteger(totalMinor) || totalMinor <= 0) {
    throw new Error("Amount must be a positive integer of minor units");
  }
  if (parts.length === 0) throw new Error("At least one participant is required");
  const totalShares = parts.reduce((s, p) => {
    if (!Number.isInteger(p.shares) || p.shares <= 0) {
      throw new Error("Each share count must be a positive integer");
    }
    return s + p.shares;
  }, 0);

  const floors = parts.map((p) =>
    Math.floor((totalMinor * p.shares) / totalShares),
  );
  const allocated = floors.reduce((a, b) => a + b, 0);
  let rem = totalMinor - allocated;
  const order = parts
    .map((p, i) => ({
      i,
      frac: (totalMinor * p.shares) / totalShares - floors[i]!,
    }))
    .sort((a, b) => b.frac - a.frac);

  const out = new Map<string, number>();
  for (let i = 0; i < parts.length; i++) {
    out.set(parts[i]!.userId, floors[i]!);
  }
  for (let k = 0; k < rem; k++) {
    const idx = order[k]?.i;
    if (idx === undefined) break;
    const uid = parts[idx]!.userId;
    out.set(uid, (out.get(uid) ?? 0) + 1);
  }
  return out;
}
