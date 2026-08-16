import type { NavigationProp } from "@react-navigation/native";
import {
  createGroup,
  getSetting,
  listGroups,
  SETTINGS_KEYS,
} from "../data/tallyRepo";
import { isValidCurrencyCode } from "../data/currencies";
import type { TallyDb } from "../db/tallyDb";
import type { RootStackParamList } from "./types";

/**
 * Lands the user on Add Expense as the home of the app.
 *
 * - If at least one group already exists, picks the most recent one (the
 *   first row from `listGroups`, which sorts by `last_modified DESC`).
 * - If none exist, silently creates a default "My group" so the form has a
 *   valid `groupId`. The user can rename it later from group settings.
 *
 * Resets the navigation stack so back from Add Expense returns to the
 * Groups list rather than the welcome / auth pages we just left.
 *
 * `fallbackCurrency` is what the auto-created group is denominated in when
 * `defaultCurrency` is somehow unset — pass the app language's currency
 * (`defaultCurrencyForAppLocale`), never a bare "USD". `LocaleProvider` seeds
 * that setting before any screen mounts, so this is belt-and-braces; it
 * matters because this is the one path that writes a currency into PERSISTED
 * data, where a wrong guess outlives the session that made it.
 */
export async function landOnFirstScreen(
  db: TallyDb,
  navigation: NavigationProp<RootStackParamList>,
  defaultGroupName: string,
  fallbackCurrency: string,
): Promise<void> {
  const groups = await listGroups(db);
  let groupId: string;
  if (groups.length > 0) {
    groupId = groups[0].id;
  } else {
    const ccyRaw = await getSetting(db, SETTINGS_KEYS.defaultCurrency);
    const currency =
      ccyRaw && isValidCurrencyCode(ccyRaw) ? ccyRaw : fallbackCurrency;
    groupId = await createGroup(db, {
      name: defaultGroupName,
      currency,
      icon: null,
      groupType: "other",
      simplifyDebts: true,
      queueForTypeLabeling: true,
      members: [],
    });
  }

  navigation.reset({
    index: 0,
    routes: [
      {
        name: "Main",
        state: {
          routes: [
            {
              name: "Groups",
              state: {
                index: 1,
                routes: [
                  { name: "GroupsList" },
                  { name: "AddExpense", params: { groupId } },
                ],
              },
            },
          ],
        },
      },
    ],
  });
}
