import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  clearReceiptDraft,
  loadReceiptDraft,
  saveReceiptDraft,
  type ReceiptDraftInput,
} from "./receiptDraft";

// `receiptDraft.ts` imports `@react-native-async-storage/async-storage`,
// which pulls in native modules Vitest can't parse. Stub it with a real
// in-memory Map so the save/load/clear round-trip is actually exercised —
// same pattern as `src/core/remoteConfigClient.test.ts` and
// `src/core/parseReceiptJson.test.ts`. `vi.mock` is hoisted above the
// imports by vitest's compiler, so writing it after the imports (required
// so `import/first` doesn't trip) still takes effect in time.
// `vi.hoisted` (rather than a plain top-level const) because `vi.mock`'s
// factory itself gets hoisted above every other top-level statement — a
// factory that closed over an ordinary `const store = new Map()` declared
// below it would run before that assignment existed.
const { store, asyncStorageMock } = vi.hoisted(() => {
  const store = new Map<string, string>();
  return {
    store,
    asyncStorageMock: {
      getItem: vi.fn(async (k: string) => store.get(k) ?? null),
      setItem: vi.fn(async (k: string, v: string) => {
        store.set(k, v);
      }),
      removeItem: vi.fn(async (k: string) => {
        store.delete(k);
      }),
    },
  };
});
vi.mock("@react-native-async-storage/async-storage", () => ({
  default: asyncStorageMock,
}));

function makeDraft(overrides: Partial<ReceiptDraftInput> = {}): ReceiptDraftInput {
  return {
    groupId: "group-1",
    lines: [
      {
        id: "line-1",
        label: "Latte",
        amountMinor: 450,
        sharerIds: ["me"],
        kind: "item",
        disabled: false,
      },
      {
        id: "line-2",
        label: "Service charge",
        amountMinor: -36,
        sharerIds: [],
        kind: "spread",
        disabled: false,
      },
    ],
    splitMode: "exact",
    payerId: "me",
    includedMemberIds: ["me", "friend-1"],
    ...overrides,
  };
}

describe("receiptDraft save/load/clear round trip", () => {
  beforeEach(() => {
    store.clear();
    asyncStorageMock.getItem.mockClear();
    asyncStorageMock.setItem.mockClear();
    asyncStorageMock.removeItem.mockClear();
  });

  it("returns null when nothing was ever saved for the group", async () => {
    expect(await loadReceiptDraft("group-1")).toBeNull();
  });

  it("round-trips a saved draft, including a negative (discount) line", async () => {
    const draft = makeDraft();
    await saveReceiptDraft(draft);

    const loaded = await loadReceiptDraft("group-1");
    expect(loaded).not.toBeNull();
    expect(loaded?.groupId).toBe("group-1");
    expect(loaded?.lines).toEqual(draft.lines);
    expect(loaded?.splitMode).toBe("exact");
    expect(loaded?.payerId).toBe("me");
    expect(loaded?.includedMemberIds).toEqual(["me", "friend-1"]);
    expect(typeof loaded?.savedAt).toBe("number");
  });

  it("stamps savedAt itself — callers do not supply it", async () => {
    const before = Date.now();
    await saveReceiptDraft(makeDraft());
    const after = Date.now();

    const loaded = await loadReceiptDraft("group-1");
    expect(loaded?.savedAt).toBeGreaterThanOrEqual(before);
    expect(loaded?.savedAt).toBeLessThanOrEqual(after);
  });

  it("scopes drafts per group — saving group A does not leak into group B", async () => {
    await saveReceiptDraft(makeDraft({ groupId: "group-A" }));
    expect(await loadReceiptDraft("group-B")).toBeNull();
    expect((await loadReceiptDraft("group-A"))?.groupId).toBe("group-A");
  });

  it("a later save for the same group replaces the earlier one", async () => {
    await saveReceiptDraft(makeDraft({ payerId: "me" }));
    await saveReceiptDraft(makeDraft({ payerId: "friend-1" }));

    const loaded = await loadReceiptDraft("group-1");
    expect(loaded?.payerId).toBe("friend-1");
  });

  it("clearReceiptDraft removes the draft so a subsequent load returns null", async () => {
    await saveReceiptDraft(makeDraft());
    await clearReceiptDraft("group-1");
    expect(await loadReceiptDraft("group-1")).toBeNull();
  });

  it("clearReceiptDraft on a group with no draft does not throw", async () => {
    await expect(clearReceiptDraft("no-such-group")).resolves.toBeUndefined();
  });
});

describe("receiptDraft load validation — storage can hold anything", () => {
  beforeEach(() => {
    store.clear();
    asyncStorageMock.getItem.mockClear();
    asyncStorageMock.setItem.mockClear();
    asyncStorageMock.removeItem.mockClear();
  });

  it("returns null on truncated / non-JSON content instead of throwing", async () => {
    store.set("@tally:receipt_draft:group-1", "{not json");
    expect(await loadReceiptDraft("group-1")).toBeNull();
  });

  it("returns null when the version does not match the current build's", async () => {
    store.set(
      "@tally:receipt_draft:group-1",
      JSON.stringify({
        version: 999,
        groupId: "group-1",
        savedAt: Date.now(),
        lines: [],
        splitMode: "exact",
        payerId: "me",
        includedMemberIds: [],
      }),
    );
    expect(await loadReceiptDraft("group-1")).toBeNull();
  });

  it("returns null when a line's amountMinor is a float (no float round-trip)", async () => {
    store.set(
      "@tally:receipt_draft:group-1",
      JSON.stringify({
        version: 1,
        groupId: "group-1",
        savedAt: Date.now(),
        lines: [
          {
            id: "l1",
            label: "X",
            amountMinor: 4.5,
            sharerIds: [],
            kind: "item",
            disabled: false,
          },
        ],
        splitMode: "exact",
        payerId: "me",
        includedMemberIds: [],
      }),
    );
    expect(await loadReceiptDraft("group-1")).toBeNull();
  });

  it("returns null when a line is missing required fields", async () => {
    store.set(
      "@tally:receipt_draft:group-1",
      JSON.stringify({
        version: 1,
        groupId: "group-1",
        savedAt: Date.now(),
        lines: [{ id: "l1", label: "X" }],
        splitMode: "exact",
        payerId: "me",
        includedMemberIds: [],
      }),
    );
    expect(await loadReceiptDraft("group-1")).toBeNull();
  });

  it("returns null when splitMode is not one of the known modes", async () => {
    store.set(
      "@tally:receipt_draft:group-1",
      JSON.stringify({
        version: 1,
        groupId: "group-1",
        savedAt: Date.now(),
        lines: [],
        splitMode: "bogus",
        payerId: "me",
        includedMemberIds: [],
      }),
    );
    expect(await loadReceiptDraft("group-1")).toBeNull();
  });

  it("returns null when the stored groupId does not match the requested one", async () => {
    store.set(
      "@tally:receipt_draft:group-1",
      JSON.stringify({
        version: 1,
        groupId: "some-other-group",
        savedAt: Date.now(),
        lines: [],
        splitMode: "exact",
        payerId: "me",
        includedMemberIds: [],
      }),
    );
    expect(await loadReceiptDraft("group-1")).toBeNull();
  });

  it("returns null and does not throw when the stored value is a JSON primitive", async () => {
    store.set("@tally:receipt_draft:group-1", "42");
    expect(await loadReceiptDraft("group-1")).toBeNull();
  });
});

describe("receiptDraft staleness", () => {
  beforeEach(() => {
    store.clear();
    asyncStorageMock.getItem.mockClear();
    asyncStorageMock.setItem.mockClear();
    asyncStorageMock.removeItem.mockClear();
  });

  it("treats a draft older than the max age as absent, and clears it", async () => {
    const eightDaysMs = 8 * 24 * 60 * 60 * 1000;
    store.set(
      "@tally:receipt_draft:group-1",
      JSON.stringify({
        version: 1,
        groupId: "group-1",
        savedAt: Date.now() - eightDaysMs,
        lines: [],
        splitMode: "exact",
        payerId: "me",
        includedMemberIds: [],
      }),
    );

    expect(await loadReceiptDraft("group-1")).toBeNull();
    // Proactively swept, not just skipped — a stale draft should not sit
    // there forever taking up storage on every subsequent load.
    expect(store.has("@tally:receipt_draft:group-1")).toBe(false);
  });

  it("still returns a draft saved a few hours ago", async () => {
    const fewHoursMs = 3 * 60 * 60 * 1000;
    store.set(
      "@tally:receipt_draft:group-1",
      JSON.stringify({
        version: 1,
        groupId: "group-1",
        savedAt: Date.now() - fewHoursMs,
        lines: [],
        splitMode: "exact",
        payerId: "me",
        includedMemberIds: [],
      }),
    );

    expect(await loadReceiptDraft("group-1")).not.toBeNull();
  });
});

describe("receiptDraft failure handling — storage is a convenience, not the source of truth", () => {
  beforeEach(() => {
    store.clear();
    asyncStorageMock.getItem.mockClear();
    asyncStorageMock.setItem.mockClear();
    asyncStorageMock.removeItem.mockClear();
  });

  it("saveReceiptDraft does not throw when AsyncStorage.setItem rejects", async () => {
    asyncStorageMock.setItem.mockRejectedValueOnce(new Error("disk full"));
    await expect(saveReceiptDraft(makeDraft())).resolves.toBeUndefined();
  });

  it("loadReceiptDraft returns null (not a throw) when AsyncStorage.getItem rejects", async () => {
    asyncStorageMock.getItem.mockRejectedValueOnce(new Error("boom"));
    await expect(loadReceiptDraft("group-1")).resolves.toBeNull();
  });

  it("clearReceiptDraft does not throw when AsyncStorage.removeItem rejects", async () => {
    asyncStorageMock.removeItem.mockRejectedValueOnce(new Error("boom"));
    await expect(clearReceiptDraft("group-1")).resolves.toBeUndefined();
  });
});
