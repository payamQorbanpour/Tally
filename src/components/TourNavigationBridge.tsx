import { useEffect, useRef } from "react";
import { useTallyData } from "../db/DatabaseContext";
import { navigationRef } from "../navigation/navigationRef";
import { useTour } from "../providers/TourContext";

/**
 * Side-effect bridge that watches the current tour step and navigates the
 * app to the right screen so the spotlit anchor is actually on screen.
 * Lives next to `<AppTour />` inside the navigation tree so `navigationRef`
 * is ready by the time it fires.
 *
 * When the tour ends (step transitions back to `null`) the user is sent
 * to Add Expense — the first-run home — so they finish where the tour
 * promised to leave them.
 */
export function TourNavigationBridge() {
  const { step } = useTour();
  const { db } = useTallyData();
  const wasActiveRef = useRef(false);

  useEffect(() => {
    if (!navigationRef.isReady()) return;

    if (step === null) {
      // Tour just ended (skip / done past last step). Drop the user back on
      // Add Expense so they can record their first split.
      if (!wasActiveRef.current) return;
      wasActiveRef.current = false;
      void (async () => {
        try {
          const grp = await db.getFirstAsync<{ id: string }>(
            `SELECT id FROM groups ORDER BY created_at DESC LIMIT 1`,
          );
          if (!grp) return;
          navigationRef.navigate("Main", {
            screen: "Groups",
            params: { screen: "AddExpense", params: { groupId: grp.id } },
          });
        } catch {
          // Best-effort; if navigation/DB hiccups the user just stays put.
        }
      })();
      return;
    }

    wasActiveRef.current = true;

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

    if (step === "fab") {
      // FAB lives on the tab bar; snap to Groups list so the anchor is on
      // screen.
      navigationRef.navigate("Main", {
        screen: "Groups",
        params: { screen: "GroupsList" },
      });
    }
  }, [step, db]);

  return null;
}
