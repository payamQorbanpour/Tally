import { useContext } from "react";
import { LocaleContext } from "./LocaleContext";
import type { AppLocale } from "./translations";

/** For shared UI (e.g. `AppText`) that may render outside `LocaleProvider` (DB splash/errors). */
export function useOptionalLocale(): AppLocale | null {
  return useContext(LocaleContext)?.locale ?? null;
}
