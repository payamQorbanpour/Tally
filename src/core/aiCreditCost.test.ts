import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { AD_REWARD_CREDITS, aiCreditCost, FREE_AI_ACTIONS } from "./aiCreditCost";

describe("aiCreditCost", () => {
  it("charges one credit for the three user-initiated actions", () => {
    expect(aiCreditCost("parse-receipt")).toBe(1);
    expect(aiCreditCost("parse-description")).toBe(1);
    expect(aiCreditCost("transcribe")).toBe(1);
  });

  it("does not charge for classify-category", () => {
    // The app issues this on its own when the group-type picker is off
    // (isGroupTypePickerEnabled), so charging would drain credits the user
    // never chose to spend.
    expect(aiCreditCost("classify-category")).toBe(0);
  });

  it("lists exactly the free actions", () => {
    expect([...FREE_AI_ACTIONS]).toEqual(["classify-category"]);
  });
});

describe("ai-proxy billing rule", () => {
  it("matches the free-action list compiled into the Edge Function", () => {
    // The Edge Function runs on Deno and cannot import from src/, so it keeps
    // its own copy of the rule. This guard fails if the two drift apart.
    const source = readFileSync("supabase/functions/ai-proxy/index.ts", "utf8");
    const match = source.match(/const FREE_ACTIONS = new Set<string>\(\[([^\]]*)\]\)/);
    expect(match, "FREE_ACTIONS not found in ai-proxy/index.ts").toBeTruthy();

    const edgeActions = [...match![1].matchAll(/"([^"]+)"/g)].map((m) => m[1]);
    expect(edgeActions.sort()).toEqual([...FREE_AI_ACTIONS].sort());
  });
});

describe("ad reward amount", () => {
  it("matches the default compiled into the ad-reward Edge Function", () => {
    // The panel tells the user how many credits an ad is worth BEFORE they
    // watch one, so the number has to live client-side. `ad-reward` runs on
    // Deno and cannot import from src/, so this guard fails if the two drift
    // — which is exactly how the panel came to promise 3 while the server
    // granted 1.
    const source = readFileSync("supabase/functions/ad-reward/index.ts", "utf8");
    const matches = [...source.matchAll(/envInt\("AD_REWARD_CREDITS",\s*(\d+)\)/g)];
    expect(matches.length, "AD_REWARD_CREDITS default not found in ad-reward/index.ts").toBeGreaterThan(0);

    for (const m of matches) {
      expect(Number(m[1])).toBe(AD_REWARD_CREDITS);
    }
  });

  it("is one, which the panel copy is written for", () => {
    // `aiCredits.body` is phrased in the singular in every locale. Raising
    // this constant means rewriting that string in en/fa/es too, so pin the
    // value rather than let a silent change produce "get 3 more AI request".
    expect(AD_REWARD_CREDITS).toBe(1);
  });
});
