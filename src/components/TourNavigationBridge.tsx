import { useEffect } from "react";
import { useTallyData } from "../db/DatabaseContext";
import { navigationRef } from "../navigation/navigationRef";
import { useTour } from "../providers/TourContext";

/**
 * Side-effect bridge that watches the current tour step and navigates the
 * app to the right screen so the spotlit anchor is actually on screen.
 * Lives next to `<AppTour />` inside the navigation tree so `navigationRef`
 * is ready by the time it fires.
 *
 * Step 4 ("addExpense") needs a real group id and is silently skipped to
 * step 5 if the user is brand new and has no groups yet — better than
 * dropping them on a screen they can't reach.
 */
export function TourNavigationBridge() {
  const { step, next } = useTour();
  const { db } = useTallyData();

  useEffect(() => {
    if (step === null) return;
    if (!navigationRef.isReady()) return;

    if (step === "ai") {
      navigationRef.navigate("Main", { screen: "AiReceipt" });
      return;
    }

    if (step === "qr") {
      navigationRef.navigate("Main", {
        screen: "Groups",
        params: { screen: "GroupsList" },
      });
      return;
    }

    if (step === "addExpense") {
      void (async () => {
        try {
          const grp = await db.getFirstAsync<{ id: string }>(
            `SELECT id FROM groups ORDER BY created_at DESC LIMIT 1`,
          );
          if (!grp) {
            // Brand-new user with no groups yet: hop straight to the QR step
            // so the tour doesn't strand them on AddExpense (which requires
            // a groupId).
            next();
            return;
          }
          navigationRef.navigate("Main", {
            screen: "Groups",
            params: { screen: "AddExpense", params: { groupId: grp.id } },
          });
        } catch {
          // If the lookup fails, fall through to the next step rather than
          // hang the tour.
          next();
        }
      })();
      return;
    }

    // intro / fab live on Home; if the user wandered, snap back so the FAB
    // is on screen for step 2.
    if (step === "intro" || step === "fab") {
      navigationRef.navigate("Main", {
        screen: "Groups",
        params: { screen: "GroupsList" },
      });
    }
  }, [step, db, next]);

  return null;
}
