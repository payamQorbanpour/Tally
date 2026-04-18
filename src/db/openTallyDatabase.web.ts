import type { AbstractPowerSyncDatabase } from "@powersync/common";
/** UMD build only — the default ESM `lib` entry contains `import.meta` and breaks Metro’s web script bundle. */
import { PowerSyncDatabase } from "@powersync/web/umd";
import { SQLJSOpenFactory } from "@powersync/adapter-sql-js";
import { tallyPowerSyncSchema } from "../sync/schema";
import { createTallyShim } from "./powersyncTallyShim";
import type { TallyDb } from "./tallyDb";
import { ensureLocalUserSeed } from "./openTallyDatabaseShared";
import { createSqlJsIndexedDbPersister } from "../web/createSqlJsIndexedDbPersister";

const DB_NAME = "tally.db";

export type OpenTallyResult = { powerSync: AbstractPowerSyncDatabase; tally: TallyDb };

/**
 * Web: `@powersync/web` + SQL.js. (`@powersync/react-native` is not for browsers; using it
 * on web is a common cause of a blank / white page.)
 *
 * The schema is `as any` to satisfy TS: the web SDK can bundle a nested copy of
 * `common` so the `Table` / `Schema` class types are not the same file identity.
 */
export async function openTallyPowerSync(): Promise<OpenTallyResult> {
  const powerSync = new PowerSyncDatabase({
    schema: tallyPowerSyncSchema,
    database: new SQLJSOpenFactory({
      dbFilename: DB_NAME,
      persister: createSqlJsIndexedDbPersister(),
    }),
  } as any);
  const ps = powerSync as unknown as AbstractPowerSyncDatabase;
  await ps.init();
  const tally = createTallyShim(ps);
  await ensureLocalUserSeed(ps, tally);
  return { powerSync: ps, tally };
}
