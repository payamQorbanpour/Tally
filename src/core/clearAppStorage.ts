import { Platform } from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { deleteAsync } from "expo-file-system";
import { openDatabaseAsync } from "expo-sqlite";
import { TALLY_DB_NAME } from "../db/tallySchema";

/**
 * Clear all app storage (database, AsyncStorage, localStorage).
 * Use this for testing from a fresh state.
 */
export async function clearAllAppStorage() {
  try {
    console.log("Clearing all app storage...");

    // Clear AsyncStorage (auth sessions, cached data, etc.)
    await AsyncStorage.clear();
    console.log("✓ AsyncStorage cleared");

    // Clear SQLite database
    if (Platform.OS !== "web") {
      const db = await openDatabaseAsync(TALLY_DB_NAME);
      const rawPath = db.databasePath;
      await db.closeAsync();
      const uri = rawPath.startsWith("file://") ? rawPath : `file://${rawPath}`;
      await deleteAsync(uri, { idempotent: true });
      console.log("✓ SQLite database cleared");
    } else {
      // Web: clear localStorage
      localStorage.clear();
      console.log("✓ localStorage cleared");
    }

    console.log("✓ All app storage cleared successfully");
  } catch (error) {
    console.error("Error clearing app storage:", error);
    throw error;
  }
}
