/**
 * backgroundSyncService.ts
 * 24-hour background cache refresh.
 * TaskManager.defineTask MUST be called at module top level.
 * This file is imported in _layout.tsx on app start.
 */

import * as BackgroundFetch from "expo-background-fetch";
import * as TaskManager from "expo-task-manager";
import AsyncStorage from "@react-native-async-storage/async-storage";

const SYNC_TASK    = "ROADSOS_CACHE_SYNC";
const LAST_SYNC_KEY = "@roadsos_last_bg_sync";

// ── Task definition — must be at module top level ─────────────────────────────
TaskManager.defineTask(SYNC_TASK, async () => {
  try {
    // Lazy-import to avoid circular deps at bundle time
    const { isOnline }                  = await import("@/services/networkService");
    const { fetchAllEmergencyServices } = await import("@/services/placesService");

    const online = await isOnline();
    if (!online) return BackgroundFetch.BackgroundFetchResult.NoData;

    const cached = await AsyncStorage.getItem("@roadsos_last_known_location");
    if (!cached) return BackgroundFetch.BackgroundFetchResult.NoData;

    const loc = JSON.parse(cached);
    const lat = loc.latitude ?? loc.lat;
    const lon = loc.longitude ?? loc.lng;
    if (!lat || !lon) return BackgroundFetch.BackgroundFetchResult.NoData;

    await fetchAllEmergencyServices(lat, lon, true);
    await AsyncStorage.setItem(LAST_SYNC_KEY, Date.now().toString());
    console.log("[BackgroundSync] Cache refreshed at", new Date().toISOString());

    return BackgroundFetch.BackgroundFetchResult.NewData;
  } catch (err) {
    console.warn("[BackgroundSync] Failed:", err);
    return BackgroundFetch.BackgroundFetchResult.Failed;
  }
});

// ── Public API ────────────────────────────────────────────────────────────────

export const registerBackgroundSync = async (): Promise<void> => {
  try {
    const isRegistered = await TaskManager.isTaskRegisteredAsync(SYNC_TASK);
    if (isRegistered) return;
    await BackgroundFetch.registerTaskAsync(SYNC_TASK, {
      minimumInterval: 60 * 60 * 24, // 24 hours
      stopOnTerminate: false,
      startOnBoot: true,
    });
    console.log("[BackgroundSync] Task registered");
  } catch (err) {
    // Background fetch not supported on all platforms — fail silently
    console.warn("[BackgroundSync] Registration failed (may not be supported):", err);
  }
};

export const getLastSyncTime = async (): Promise<Date | null> => {
  try {
    const ts = await AsyncStorage.getItem(LAST_SYNC_KEY);
    return ts ? new Date(parseInt(ts)) : null;
  } catch {
    return null;
  }
};
