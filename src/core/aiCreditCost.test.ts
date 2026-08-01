import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { aiCreditCost, FREE_AI_ACTIONS, type AiProxyAction } from "./aiCreditCost";

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
