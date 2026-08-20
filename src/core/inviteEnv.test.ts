import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  buildExpenseInviteUrl,
  buildInviteUrl,
  parseInviteTokenFromScannedUrl,
} from "./inviteEnv";

const BASE = "EXPO_PUBLIC_INVITE_BASE_URL";
const TOKEN = "cb2a7d99-eef0-49db-bedf-609890546fae";

let saved: string | undefined;

beforeEach(() => {
  saved = process.env[BASE];
});

afterEach(() => {
  if (saved === undefined) delete process.env[BASE];
  else process.env[BASE] = saved;
});

describe("buildInviteUrl", () => {
  it("appends the token to the configured web base", () => {
    process.env[BASE] = "https://tally-bills-app.vercel.app/join";
    expect(buildInviteUrl(TOKEN)).toBe(
      `https://tally-bills-app.vercel.app/join/${TOKEN}`,
    );
  });

  it("falls back to the deep link when no web base is configured", () => {
    delete process.env[BASE];
    expect(buildInviteUrl(TOKEN)).toBe(`tally://group-invite?token=${TOKEN}`);
  });
});

describe("parseInviteTokenFromScannedUrl — deep links", () => {
  it("reads a group deep link", () => {
    expect(parseInviteTokenFromScannedUrl(`tally://group-invite?token=${TOKEN}`)).toEqual(
      { kind: "group", token: TOKEN },
    );
  });

  it("reads an expense deep link", () => {
    expect(parseInviteTokenFromScannedUrl("tally://expense-invite?id=exp_1")).toEqual(
      { kind: "expense", expenseId: "exp_1" },
    );
  });

  it("rejects a URL that is not ours", () => {
    expect(parseInviteTokenFromScannedUrl("https://example.com/hello")).toBe(null);
    expect(parseInviteTokenFromScannedUrl("")).toBe(null);
    expect(parseInviteTokenFromScannedUrl("not a url")).toBe(null);
  });
});

describe("parseInviteTokenFromScannedUrl — web links", () => {
  it("reads a group link on the configured host", () => {
    process.env[BASE] = "https://tally-bills-app.vercel.app/join";
    expect(
      parseInviteTokenFromScannedUrl(
        `https://tally-bills-app.vercel.app/join/${TOKEN}`,
      ),
    ).toEqual({ kind: "group", token: TOKEN });
  });

  // The regression that shipped: the deployed web build had
  // EXPO_PUBLIC_INVITE_BASE_URL pointing at `tally-bills.vercel.app` while the
  // links people actually shared were on `tally-bills-app.vercel.app`. A host
  // equality check made the app silently ignore its own invite links. Routing
  // is decided by the *path*, so that is what we match on.
  it("reads a group link whose host differs from the configured base", () => {
    process.env[BASE] = "https://tally-bills.vercel.app/join";
    expect(
      parseInviteTokenFromScannedUrl(
        `https://tally-bills-app.vercel.app/join/${TOKEN}`,
      ),
    ).toEqual({ kind: "group", token: TOKEN });
  });

  it("reads a group link with no web base configured at all", () => {
    delete process.env[BASE];
    expect(
      parseInviteTokenFromScannedUrl(
        `https://tally-bills-app.vercel.app/join/${TOKEN}`,
      ),
    ).toEqual({ kind: "group", token: TOKEN });
  });

  it("reads an expense link by path", () => {
    delete process.env[BASE];
    expect(
      parseInviteTokenFromScannedUrl("https://tally-bills-app.vercel.app/expense/exp_1"),
    ).toEqual({ kind: "expense", expenseId: "exp_1" });
  });

  it("ignores the query string and fragment", () => {
    delete process.env[BASE];
    expect(
      parseInviteTokenFromScannedUrl(
        `https://tally-bills-app.vercel.app/join/${TOKEN}?utm=x#frag`,
      ),
    ).toEqual({ kind: "group", token: TOKEN });
  });

  it("percent-decodes the token", () => {
    delete process.env[BASE];
    expect(
      parseInviteTokenFromScannedUrl("https://t.example/join/a%20b"),
    ).toEqual({ kind: "group", token: "a b" });
  });

  it("does not treat other paths on our host as invites", () => {
    process.env[BASE] = "https://tally-bills-app.vercel.app/join";
    expect(
      parseInviteTokenFromScannedUrl("https://tally-bills-app.vercel.app/"),
    ).toBe(null);
    expect(
      parseInviteTokenFromScannedUrl("https://tally-bills-app.vercel.app/settings"),
    ).toBe(null);
    expect(
      parseInviteTokenFromScannedUrl("https://tally-bills-app.vercel.app/join"),
    ).toBe(null);
  });
});

describe("buildExpenseInviteUrl", () => {
  it("drops the /join suffix from the base", () => {
    process.env[BASE] = "https://tally-bills-app.vercel.app/join";
    expect(buildExpenseInviteUrl("exp_1")).toBe(
      "https://tally-bills-app.vercel.app/expense/exp_1",
    );
  });
});

describe("getInviteWebBaseUrl — web origin wins", () => {
  const w = globalThis as { window?: unknown };

  afterEach(() => {
    delete w.window;
  });

  function setOrigin(origin: string) {
    w.window = { location: { origin } };
  }

  // The bug this guards: the deployed build had the env var pointing at a host
  // that was not the one serving the app, so every link it generated was dead.
  it("builds links on the host the app is actually served from", () => {
    process.env[BASE] = "https://tally-bills.vercel.app/join";
    setOrigin("https://tally-bills-app.vercel.app");
    expect(buildInviteUrl(TOKEN)).toBe(
      `https://tally-bills-app.vercel.app/join/${TOKEN}`,
    );
  });

  it("keeps the configured path, not just the host", () => {
    process.env[BASE] = "https://example.com/g/invite";
    setOrigin("https://tally.example");
    expect(buildInviteUrl(TOKEN)).toBe(`https://tally.example/g/invite/${TOKEN}`);
  });

  it("falls back to /join when nothing is configured", () => {
    delete process.env[BASE];
    setOrigin("https://tally.example");
    expect(buildInviteUrl(TOKEN)).toBe(`https://tally.example/join/${TOKEN}`);
  });

  it("ignores an origin a link cannot point at", () => {
    process.env[BASE] = "https://tally-bills-app.vercel.app/join";
    setOrigin("null");
    expect(buildInviteUrl(TOKEN)).toBe(
      `https://tally-bills-app.vercel.app/join/${TOKEN}`,
    );
  });

  it("still deep-links on native, where there is no window", () => {
    delete process.env[BASE];
    expect(buildInviteUrl(TOKEN)).toBe(`tally://group-invite?token=${TOKEN}`);
  });

  it("puts expense links on the live origin too", () => {
    process.env[BASE] = "https://tally-bills.vercel.app/join";
    setOrigin("https://tally-bills-app.vercel.app");
    expect(buildExpenseInviteUrl("exp_1")).toBe(
      "https://tally-bills-app.vercel.app/expense/exp_1",
    );
  });
});
