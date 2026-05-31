/**
 * firebaseService.ts
 * Firebase Realtime Database helpers.
 * Uses lazy initialization to avoid Metro bundler issues with firebase/app.
 */

import AsyncStorage from "@react-native-async-storage/async-storage";

const FIREBASE_CONFIG = {
  apiKey:            process.env.EXPO_PUBLIC_FIREBASE_API_KEY            || "",
  authDomain:        process.env.EXPO_PUBLIC_FIREBASE_AUTH_DOMAIN        || "",
  databaseURL:       process.env.EXPO_PUBLIC_FIREBASE_DATABASE_URL       || "",
  projectId:         process.env.EXPO_PUBLIC_FIREBASE_PROJECT_ID         || "",
  storageBucket:     process.env.EXPO_PUBLIC_FIREBASE_STORAGE_BUCKET     || "",
  messagingSenderId: process.env.EXPO_PUBLIC_FIREBASE_MESSAGING_SENDER_ID || "",
  appId:             process.env.EXPO_PUBLIC_FIREBASE_APP_ID             || "",
};

const isConfigured = (): boolean =>
  !!FIREBASE_CONFIG.apiKey &&
  FIREBASE_CONFIG.apiKey !== "YOUR_FIREBASE_API_KEY" &&
  !!FIREBASE_CONFIG.databaseURL;

// Lazy-loaded Firebase instances
let _app: any    = null;
let _db: any     = null;

const getDb = async (): Promise<any | null> => {
  if (!isConfigured()) return null;
  if (_db) return _db;
  try {
    const { initializeApp, getApps } = await import("firebase/app");
    const { getDatabase }            = await import("firebase/database");
    _app = getApps().length ? getApps()[0] : initializeApp(FIREBASE_CONFIG);
    _db  = getDatabase(_app);
    return _db;
  } catch (err) {
    console.warn("[Firebase] Init failed:", err);
    return null;
  }
};

// ── Types ─────────────────────────────────────────────────────────────────────

export interface LiveLocationData {
  latitude:  number;
  longitude: number;
  accuracy:  number | null;
  timestamp: number;
  active:    boolean;
  userName:  string;
  mapsLink:  string;
}

// ── SOS live location ─────────────────────────────────────────────────────────

export const publishLiveLocation = async (
  userId: string,
  data: LiveLocationData
): Promise<void> => {
  const db = await getDb();
  if (!db) return;
  try {
    const { ref, set } = await import("firebase/database");
    await set(ref(db, `sos/${userId}`), data);
  } catch (err) {
    console.warn("[Firebase] publishLiveLocation failed:", err);
  }
};

export const removeLiveLocation = async (userId: string): Promise<void> => {
  const db = await getDb();
  if (!db) return;
  try {
    const { ref, remove } = await import("firebase/database");
    await remove(ref(db, `sos/${userId}`));
  } catch (err) {
    console.warn("[Firebase] removeLiveLocation failed:", err);
  }
};

export const subscribeLiveLocation = (
  userId: string,
  callback: (data: LiveLocationData | null) => void
): (() => void) => {
  let unsubFn: (() => void) | null = null;

  getDb().then(async db => {
    if (!db) return;
    try {
      const { ref, onValue } = await import("firebase/database");
      unsubFn = onValue(ref(db, `sos/${userId}`), snapshot => {
        callback(snapshot.val() as LiveLocationData | null);
      });
    } catch (err) {
      console.warn("[Firebase] subscribeLiveLocation failed:", err);
    }
  });

  return () => { if (unsubFn) unsubFn(); };
};

// ── FCM token ─────────────────────────────────────────────────────────────────

export const saveFCMToken = async (
  userId: string,
  token: string
): Promise<void> => {
  const db = await getDb();
  if (!db) return;
  try {
    const { ref, set } = await import("firebase/database");
    await set(ref(db, `users/${userId}/fcmToken`), token);
  } catch (err) {
    console.warn("[Firebase] saveFCMToken failed:", err);
  }
};
