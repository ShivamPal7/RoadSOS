/**
 * notificationService.ts
 * Expo push notification registration + FCM token management.
 * Gracefully handles simulators and missing permissions.
 */

import * as Device from "expo-device";
import Constants from "expo-constants";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { saveFCMToken } from "@/services/firebaseService";

const FCM_TOKEN_KEY = "@roadsos_fcm_token";
const USER_ID_KEY   = "@roadsos_user_id";

// Safely resolve expo-notifications to prevent crashes in Expo Go
let Notifications: any = null;
const isExpoGo = Constants.appOwnership === "expo";

if (!isExpoGo) {
  try {
    Notifications = require("expo-notifications");
    // Configure how notifications appear when app is foregrounded
    Notifications.setNotificationHandler({
      handleNotification: async () => ({
        shouldShowAlert: true,
        shouldPlaySound: true,
        shouldSetBadge:  true,
        shouldShowBanner: true,
        shouldShowList:   true,
      }),
    });
  } catch (err) {
    console.warn("[Notifications] Failed to load expo-notifications:", err);
  }
}

/** Get or create a stable user ID */
export const getUserId = async (): Promise<string> => {
  let id = await AsyncStorage.getItem(USER_ID_KEY);
  if (!id) {
    id = `user_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    await AsyncStorage.setItem(USER_ID_KEY, id);
  }
  return id;
};

/** Register for push notifications and return the Expo push token */
export const registerForPushNotifications = async (): Promise<string | null> => {
  if (!Notifications) {
    console.warn("[Notifications] Push notifications are not available in Expo Go.");
    return null;
  }

  // Simulators cannot receive push notifications
  if (!Device.isDevice) {
    console.log("[Notifications] Not a physical device — skipping push registration");
    return null;
  }

  const { status: existing } = await Notifications.getPermissionsAsync();
  let finalStatus = existing;

  if (existing !== "granted") {
    const { status } = await Notifications.requestPermissionsAsync();
    finalStatus = status;
  }

  if (finalStatus !== "granted") {
    console.warn("[Notifications] Push permission denied");
    return null;
  }

  try {
    const projectId =
      Constants.expoConfig?.extra?.eas?.projectId ??
      Constants.easConfig?.projectId;

    const tokenData = projectId
      ? await Notifications.getExpoPushTokenAsync({ projectId })
      : await Notifications.getExpoPushTokenAsync();

    const token = tokenData.data;
    await AsyncStorage.setItem(FCM_TOKEN_KEY, token);

    // Save to Firebase so server can send FCM to this device
    const userId = await getUserId();
    await saveFCMToken(userId, token);

    console.log("[Notifications] Push token registered:", token);
    return token;
  } catch (err) {
    console.warn("[Notifications] Token registration failed:", err);
    return null;
  }
};

/** Get the stored push token (no network call) */
export const getStoredPushToken = async (): Promise<string | null> => {
  return AsyncStorage.getItem(FCM_TOKEN_KEY);
};

/** Send a local notification (for testing without FCM) */
export const sendLocalNotification = async (
  title: string,
  body: string,
  data?: Record<string, string>
): Promise<void> => {
  if (!Notifications) {
    console.warn("[Notifications] Cannot send local notification: expo-notifications unavailable");
    return;
  }

  await Notifications.scheduleNotificationAsync({
    content: { title, body, data, sound: true },
    trigger: null, // fire immediately
  });
};
