import { useEffect, useMemo } from "react";
import {
  getCurrentPassRow,
  recordPassExtension,
  recordPassPurchase,
  markPassEnded as repoMarkPassEnded,
} from "../data/tallyRepo";
import { useTallyData } from "../db/DatabaseContext";
import {
  type PassPersistenceAdapter,
  usePremium,
} from "./PremiumContext";

/**
 * Wires `PremiumContext` to the local SQLite `pass_entitlements` table.
 *
 * Rendered inside `DatabaseProvider` (which already depends on
 * `usePremium()`); `PremiumProvider` itself sits above DatabaseProvider
 * in the tree, so it can't read the DB handle directly without
 * inverting the provider order. This component bridges the two: it
 * builds a `PassPersistenceAdapter` from the local DB and registers it
 * with `PremiumContext` so the provider's mutators (requestPass /
 * requestExtension / endActivePass) and on-mount hydration can persist
 * pass events without knowing about SQLite.
 */
export function PremiumPassBinding() {
  const { db } = useTallyData();
  const { _registerPassPersister } = usePremium();

  const adapter = useMemo<PassPersistenceAdapter>(
    () => ({
      loadCurrent: () => getCurrentPassRow(db),
      recordPurchase: async (pass, productId, storeTransactionId) => {
        await recordPassPurchase(db, {
          passType: pass.type,
          productId,
          storeTransactionId: storeTransactionId ?? null,
          activatedAt: pass.activatedAt,
          expiresAt: pass.expiresAt,
          boundGroupId: pass.boundGroupId,
        });
      },
      recordExtension: async (pass, productId, storeTransactionId) => {
        if (!pass.expiresAt) return;
        await recordPassExtension(db, {
          passType: pass.type,
          productId,
          storeTransactionId: storeTransactionId ?? null,
          newExpiresAt: pass.expiresAt,
        });
      },
      markEnded: async () => {
        await repoMarkPassEnded(db);
      },
    }),
    [db],
  );

  useEffect(() => {
    _registerPassPersister(adapter);
    return () => _registerPassPersister(null);
  }, [adapter, _registerPassPersister]);

  return null;
}
