/**
 * alertService.ts
 * Core SOS alert orchestration.
 *
 * Online path:
 *   1. Publish live location to Firebase Realtime DB
 *   2. POST to backend → server sends FCM push + Twilio SMS to all contacts
 *   3. Start 30-second live location update loop
 *
 * Offline path:
 *   1. expo-sms with GPS coords + Google Maps link
 *
 * Cancel path:
 *   1. Stop location loop
 *   2. Remove from Firebase
 *   3. POST /api/emergency/sos/cancel → server sends "All Clear" FCM
 */

import * as SMS from "expo-sms";
import * as Location from "expo-location";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { Alert } from "react-native";
import { publishLiveLocation, removeLiveLocation } from "@/services/firebaseService";
import { getUserId } from "@/services/notificationService";
import { isOnline } from "@/services/networkService";
import { getLastKnownLocation } from "@/services/location";

const SERVER_URL = process.env.EXPO_PUBLIC_SERVER_URL || "http://10.0.2.2:5000";

export interface AlertContact {
  name: string;
  phone: string;
}

export interface AlertPayload {
  userName: string;
  latitude: number;
  longitude: number;
  contacts: AlertContact[];
  isAutoCrash: boolean;
}

// ── Live location update loop ─────────────────────────────────────────────────
let locationInterval: ReturnType<typeof setInterval> | null = null;

const startLiveLocationUpdates = async (userId: string, userName: string) => {
  if (locationInterval) return;

  locationInterval = setInterval(async () => {
    try {
      const loc = await Location.getCurrentPositionAsync({
        accuracy: Location.Accuracy.High,
      });
      const lat = loc.coords.latitude;
      const lon = loc.coords.longitude;
      await publishLiveLocation(userId, {
        latitude:  lat,
        longitude: lon,
        accuracy:  loc.coords.accuracy,
        timestamp: Date.now(),
        active:    true,
        userName,
        mapsLink:  `https://maps.google.com/?q=${lat},${lon}`,
      });
    } catch {
      // Silently fail — use last known location
    }
  }, 30000); // every 30 seconds
};

export const stopLiveLocationUpdates = async (): Promise<void> => {
  if (locationInterval) {
    clearInterval(locationInterval);
    locationInterval = null;
  }
  try {
    const userId = await getUserId();
    await removeLiveLocation(userId);
  } catch { /* ignore */ }
};

// ── SMS message builder ───────────────────────────────────────────────────────
const buildSmsMessage = (
  userName: string,
  lat: number,
  lon: number,
  isAutoCrash: boolean
): string => {
  const time = new Date().toLocaleTimeString("en-IN", {
    hour: "2-digit", minute: "2-digit",
  });
  const trigger = isAutoCrash ? "AUTO-CRASH DETECTED" : "EMERGENCY ALERT";
  return (
    `🚨 ROADSOS ${trigger}\n` +
    `${userName} needs immediate help!\n\n` +
    `📍 Location:\n` +
    `Lat: ${lat.toFixed(6)}, Long: ${lon.toFixed(6)}\n\n` +
    `Maps: https://maps.google.com/?q=${lat.toFixed(6)},${lon.toFixed(6)}\n\n` +
    `Time: ${time} IST\n` +
    `Sent via RoadSOS Emergency App`
  );
};

// ── Main trigger ──────────────────────────────────────────────────────────────

/**
 * Trigger the full emergency alert flow.
 * Returns a status string for the UI.
 */
export const triggerEmergencyAlert = async (
  payload: AlertPayload
): Promise<string> => {
  const { userName, latitude, longitude, contacts, isAutoCrash } = payload;
  const mapsLink = `https://maps.google.com/?q=${latitude},${longitude}`;
  const online = await isOnline();

  if (online) {
    return triggerOnlineAlert(payload, mapsLink);
  } else {
    return triggerOfflineAlert(payload);
  }
};

const triggerOnlineAlert = async (
  payload: AlertPayload,
  mapsLink: string
): Promise<string> => {
  const { userName, latitude, longitude, contacts, isAutoCrash } = payload;
  const userId = await getUserId();

  // 1. Publish initial live location to Firebase
  try {
    await publishLiveLocation(userId, {
      latitude,
      longitude,
      accuracy: null,
      timestamp: Date.now(),
      active: true,
      userName,
      mapsLink,
    });
    // Start 30-second update loop
    await startLiveLocationUpdates(userId, userName);
  } catch (err) {
    console.warn("[Alert] Firebase publish failed:", err);
  }

  // 2. POST to backend — server handles FCM push + Twilio SMS
  try {
    const res = await fetch(`${SERVER_URL}/api/emergency/sos`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        userId,
        name: userName,
        latitude,
        longitude,
        contacts,
        isAutoCrash,
        mapsLink,
        liveLocationUrl: `${SERVER_URL}/live/${userId}`,
      }),
    });
    const data = await res.json();
    return data.message || `${contacts.length} contact(s) alerted!`;
  } catch (err) {
    console.warn("[Alert] Server unreachable, falling back to SMS:", err);
    // Network fail — fall back to SMS
    return triggerOfflineAlert(payload);
  }
};

const triggerOfflineAlert = async (payload: AlertPayload): Promise<string> => {
  const { userName, latitude, longitude, contacts, isAutoCrash } = payload;

  const available = await SMS.isAvailableAsync();
  if (!available) return "SMS not available on this device.";

  const phoneNumbers = contacts.map(c => c.phone).filter(Boolean);
  if (phoneNumbers.length === 0) return "No contacts to alert.";

  const message = buildSmsMessage(userName, latitude, longitude, isAutoCrash);
  await SMS.sendSMSAsync(phoneNumbers, message);
  return `SMS sent to ${phoneNumbers.length} contact(s).`;
};

// ── Cancel SOS ────────────────────────────────────────────────────────────────

export const cancelEmergencyAlert = async (
  userName: string
): Promise<void> => {
  await stopLiveLocationUpdates();

  // Notify server to send "All Clear" FCM + SMS
  try {
    const userId = await getUserId();
    await fetch(`${SERVER_URL}/api/emergency/sos/cancel`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ userId, userName }),
    });
  } catch { /* ignore — server may be unreachable */ }
};
