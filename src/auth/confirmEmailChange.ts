import { Alert, Platform } from "react-native";
import { getLocalUserProfile } from "../data/tallyRepo";
import type { TallyDb } from "../db/tallyDb";

type Translator = (path: string, vars?: Record<string, string>) => string;

/**
 * Before signing a user in with `nextEmail`, compare against the email
 * already cached on this device's local profile. When they differ, prompt
 * the user with a Continue/Cancel alert so they don't accidentally bind
 * the device to the wrong account (e.g. someone else's email autofilled
 * by the keyboard).
 *
 * Resolves to `true` when sign-in should proceed:
 *  - the local profile has no email yet (fresh device / "Use locally"),
 *  - the local email matches `nextEmail` case-insensitively,
 *  - or the user pressed "Continue" on the alert.
 *
 * Resolves to `false` only when the user explicitly cancels.
 *
 * On web (`Alert.alert` is a no-op in react-native-web 0.21) we fall
 * back to `window.confirm`, mirroring the pattern in AccountScreen's
 * auth dance.
 */
export async function confirmEmailChangeIfDifferent(
  db: TallyDb,
  nextEmail: string,
  t: Translator,
): Promise<boolean> {
  const next = nextEmail.trim();
  if (!next) return true;
  let previous = "";
  try {
    const profile = await getLocalUserProfile(db);
    previous = (profile.email ?? "").trim();
  } catch {
    return true;
  }
  if (!previous) return true;
  if (previous.toLowerCase() === next.toLowerCase()) return true;

  const title = t("account.authAccountChangeTitle");
  const body = t("account.authAccountChangeBody", {
    previous,
    next,
  });

  if (Platform.OS === "web" && typeof window !== "undefined") {
    return window.confirm(`${title}\n\n${body}`);
  }

  return new Promise<boolean>((resolve) => {
    Alert.alert(title, body, [
      {
        text: t("account.cancel"),
        style: "cancel",
        onPress: () => resolve(false),
      },
      {
        text: t("account.authAccountChangeContinue"),
        onPress: () => resolve(true),
      },
    ]);
  });
}
