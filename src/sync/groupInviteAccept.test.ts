import type { SupabaseClient } from "@supabase/supabase-js";
import { describe, expect, it, vi } from "vitest";
import { acceptGroupInvite } from "./groupInviteAccept";

type RpcArgs = { fn: string; params: Record<string, unknown> };

function fakeClient(
  reply: { data?: unknown; error?: { message: string } },
  calls: RpcArgs[] = [],
) {
  return {
    calls,
    rpc: vi.fn(async (fn: string, params: Record<string, unknown>) => {
      calls.push({ fn, params });
      return { data: reply.data ?? null, error: reply.error ?? null };
    }),
  };
}

describe("acceptGroupInvite", () => {
  it("refuses an empty token without hitting the network", async () => {
    const sb = fakeClient({});
    const res = await acceptGroupInvite(sb as unknown as SupabaseClient, "   ");
    expect(res).toEqual({ ok: false, error: "missing_token" });
    expect(sb.rpc).not.toHaveBeenCalled();
  });

  it("redeems the token through the server-side function", async () => {
    const calls: RpcArgs[] = [];
    const sb = fakeClient(
      { data: { ok: true, group_id: "g1", role: "collaborator" } },
      calls,
    );
    const res = await acceptGroupInvite(sb as unknown as SupabaseClient, " tok-1 ");
    expect(res).toEqual({ ok: true, groupId: "g1", role: "collaborator" });
    expect(calls).toEqual([
      { fn: "tally_accept_group_invite", params: { p_token: "tok-1" } },
    ]);
  });

  it("passes a viewer invite's role through", async () => {
    const sb = fakeClient({ data: { ok: true, group_id: "g1", role: "viewer" } });
    const res = await acceptGroupInvite(sb as unknown as SupabaseClient, "tok-1");
    expect(res).toEqual({ ok: true, groupId: "g1", role: "viewer" });
  });

  it("maps a refusal onto its reason", async () => {
    for (const error of [
      "invite_not_found",
      "email_mismatch",
      "not_signed_in",
    ] as const) {
      const sb = fakeClient({ data: { ok: false, error } });
      const res = await acceptGroupInvite(sb as unknown as SupabaseClient, "tok-1");
      expect(res).toEqual({ ok: false, error });
    }
  });

  it("reports an unrecognised refusal rather than claiming success", async () => {
    const sb = fakeClient({ data: { ok: false, error: "something_new" } });
    const res = await acceptGroupInvite(sb as unknown as SupabaseClient, "tok-1");
    expect(res).toEqual({ ok: false, error: "invite_failed" });
  });

  // A transport/permission failure must never look like "no such invite" —
  // that would tell the user to check their link when the link is fine.
  it("distinguishes a failed call from a rejected invite", async () => {
    const sb = fakeClient({ error: { message: "network down" } });
    const res = await acceptGroupInvite(sb as unknown as SupabaseClient, "tok-1");
    expect(res).toEqual({ ok: false, error: "invite_lookup_failed" });
  });

  it("treats a missing group id as a failure even when ok is true", async () => {
    const sb = fakeClient({ data: { ok: true, role: "collaborator" } });
    const res = await acceptGroupInvite(sb as unknown as SupabaseClient, "tok-1");
    expect(res).toEqual({ ok: false, error: "invite_failed" });
  });

  it("accepts a single-row array, which is how PostgREST can wrap a result", async () => {
    const sb = fakeClient({ data: [{ ok: true, group_id: "g1", role: "viewer" }] });
    const res = await acceptGroupInvite(sb as unknown as SupabaseClient, "tok-1");
    expect(res).toEqual({ ok: true, groupId: "g1", role: "viewer" });
  });
});
