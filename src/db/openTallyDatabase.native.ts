import type { AbstractPowerSyncDatabase } from "@powersync/common";
import { PowerSyncDatabase } from "@powersync/react-native";
import { OPSqliteOpenFactory } from "@powersync/op-sqlite";
import { tallyPowerSyncSchema } from "../sync/schema";
import { createTallyShim } from "./powersyncTallyShim";
import type { TallyDb } from "./tallyDb";
import { ensureLocalUserSeed } from "./openTallyDatabaseShared";

const DB_NAME = "tally.db";

export type OpenTallyResult = { powerSync: AbstractPowerSyncDatabase; tally: TallyDb };

/**
 * iOS / Android: OP-SQLite. Kept in a .native file so the web bundler never resolves `op-sqlite`.
 */
export async function openTallyPowerSync(): Promise<OpenTallyResult> {
  const powerSync = new PowerSyncDatabase({
    schema: tallyPowerSyncSchema,
    database: new OPSqliteOpenFactory({ dbFilename: DB_NAME }),
  });
  await powerSync.init();
  const tally = createTallyShim(powerSync);
  await ensureLocalUserSeed(powerSync, tally);
  return { powerSync, tally };
}
