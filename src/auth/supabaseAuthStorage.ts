import AsyncStorage from "@react-native-async-storage/async-storage";
import { Platform } from "react-native";

type AsyncStore = {
  getItem: (key: string) => Promise<string | null>;
  setItem: (key: string, value: string) => Promise<void>;
  removeItem: (key: string) => Promise<void>;
};

/**
 * Supabase `auth.storage` must not use the AsyncStorage native module on web (it can throw
 * `Native module is null, cannot access legacy storage`). Use `localStorage` in the browser.
 */
function webLocalStorageAdapter(): AsyncStore {
  return {
    getItem: (key) =>
      Promise.resolve(
        typeof globalThis !== "undefined" && "localStorage" in globalThis
          ? globalThis.localStorage.getItem(key)
          : null,
      ),
    setItem: (key, value) => {
      if (typeof globalThis !== "undefined" && "localStorage" in globalThis) {
        globalThis.localStorage.setItem(key, value);
      }
      return Promise.resolve();
    },
    removeItem: (key) => {
      if (typeof globalThis !== "undefined" && "localStorage" in globalThis) {
        globalThis.localStorage.removeItem(key);
      }
      return Promise.resolve();
    },
  };
}

export function getSupabaseAuthStorage(): AsyncStore {
  if (Platform.OS === "web") return webLocalStorageAdapter();
  return AsyncStorage;
}
