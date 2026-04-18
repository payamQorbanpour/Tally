import type { SQLJSPersister } from "@powersync/adapter-sql-js";

const IDB_NAME = "TallyPowerSync";
const IDB_VERSION = 1;
const IDB_STORE = "sqljs";
const BLOB_KEY = "tally.db";

let idb: Promise<IDBDatabase> | null = null;

function getDb(): Promise<IDBDatabase> | null {
  if (typeof indexedDB === "undefined") return null;
  if (idb) return idb;
  idb = new Promise((resolve, reject) => {
    const req = indexedDB.open(IDB_NAME, IDB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(IDB_STORE)) {
        // Out-of-line keys: store.put(data, BLOB_KEY)
        db.createObjectStore(IDB_STORE);
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => {
      idb = null;
      reject(req.error ?? new Error("indexedDB open failed"));
    };
  });
  return idb;
}

function toBuffer(data: ArrayLike<number> | Buffer): ArrayBuffer {
  if (data instanceof ArrayBuffer) return data;
  if (data instanceof Uint8Array) {
    if (data.byteOffset === 0 && data.byteLength === data.buffer.byteLength) {
      return data.buffer as ArrayBuffer;
    }
    return data.slice().buffer as ArrayBuffer;
  }
  if (typeof Buffer !== "undefined" && globalThis.Buffer && Buffer.isBuffer(data)) {
    return new Uint8Array(data).buffer as ArrayBuffer;
  }
  const u8 = Uint8Array.from(data);
  return u8.buffer;
}

/**
 * Backs the SQL.js database file with **IndexedDB** (browser) so `app_settings`,
 * `users`, groups, and other data survive a refresh. Without it, the adapter
 * is in-memory only; see @powersync/adapter-sql-js README.
 */
export function createSqlJsIndexedDbPersister(): SQLJSPersister {
  return {
    readFile: async () => {
      const dbP = getDb();
      if (!dbP) return null;
      try {
        const i = await dbP;
        return await new Promise<Uint8Array | null>((resolve, reject) => {
          const tx = i.transaction(IDB_STORE, "readonly");
          const g = tx.objectStore(IDB_STORE).get(BLOB_KEY);
          g.onsuccess = () => {
            const v = g.result;
            if (v == null) resolve(null);
            else if (v instanceof ArrayBuffer) resolve(new Uint8Array(v));
            else if (v instanceof Uint8Array) resolve(v);
            else resolve(null);
          };
          g.onerror = () => reject(g.error);
        });
      } catch {
        return null;
      }
    },
    writeFile: async (data) => {
      const dbP = getDb();
      if (!dbP) {
        throw new Error("IndexedDB is not available; cannot persist SQLite data.");
      }
      const buf = toBuffer(data);
      const i = await dbP;
      await new Promise<void>((resolve, reject) => {
        const tx = i.transaction(IDB_STORE, "readwrite");
        const p = tx.objectStore(IDB_STORE).put(buf, BLOB_KEY);
        p.onsuccess = () => resolve();
        p.onerror = () => reject(p.error);
      });
    },
  };
}
