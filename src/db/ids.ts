import { randomUUID } from "expo-crypto";

/** Seeded “you” row before Supabase auth links the profile to `auth.users.id`. */
export const DEFAULT_LOCAL_USER_ID = "00000000-0000-4000-8000-000000000001";

let resolvedLocalUserId: string = DEFAULT_LOCAL_USER_ID;

export function getLocalUserId(): string {
  return resolvedLocalUserId;
}

export function setResolvedLocalUserId(id: string): void {
  resolvedLocalUserId = id;
}

export function newId(): string {
  return randomUUID();
}
