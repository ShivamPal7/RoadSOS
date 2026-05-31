/**
 * networkService.ts
 * Real-time network detection using expo-network.
 * Provides both one-shot check and live subscription.
 */

import * as Network from "expo-network";

export type NetworkCallback = (isOnline: boolean) => void;

let subscriptionInterval: ReturnType<typeof setInterval> | null = null;

/** One-shot check — true if connected AND internet reachable */
export const isOnline = async (): Promise<boolean> => {
  try {
    const state = await Network.getNetworkStateAsync();
    return state.isConnected === true && state.isInternetReachable === true;
  } catch {
    return false;
  }
};

/**
 * Subscribe to network changes by polling every 3 seconds.
 * Returns an unsubscribe function.
 */
export const subscribeToNetwork = (callback: NetworkCallback): (() => void) => {
  let lastState: boolean | null = null;

  const check = async () => {
    const online = await isOnline();
    if (online !== lastState) {
      lastState = online;
      callback(online);
    }
  };

  // Fire immediately
  check();

  subscriptionInterval = setInterval(check, 3000);

  return () => {
    if (subscriptionInterval) {
      clearInterval(subscriptionInterval);
      subscriptionInterval = null;
    }
  };
};
