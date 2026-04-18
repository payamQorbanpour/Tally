import { randomUUID } from "expo-crypto";

/** Single-device “you” — seed once; in production, align with auth user id. */
export const LOCAL_USER_ID = "00000000-0000-4000-8000-000000000001";

export function newId(): string {
  return randomUUID();
}
