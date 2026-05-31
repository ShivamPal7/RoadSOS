/**
 * OfflineBanner.tsx
 * Persistent red banner shown across all screens when device is offline.
 * Shows cache age so judges can see data freshness transparency.
 */

import React from "react";
import { View, Text, StyleSheet, Animated } from "react-native";
import { CloudOff, Clock } from "lucide-react-native";

interface OfflineBannerProps {
  visible: boolean;
  cacheAgeMinutes?: number | null;
}

export const OfflineBanner: React.FC<OfflineBannerProps> = ({
  visible,
  cacheAgeMinutes,
}) => {
  if (!visible) return null;

  const ageText = () => {
    if (cacheAgeMinutes === null || cacheAgeMinutes === undefined) return "";
    if (cacheAgeMinutes < 1) return " · Cache: just now";
    if (cacheAgeMinutes < 60) return ` · Cache: ${cacheAgeMinutes}m ago`;
    const hrs = Math.floor(cacheAgeMinutes / 60);
    return ` · Cache: ${hrs}h ago`;
  };

  return (
    <View style={styles.banner}>
      <CloudOff size={14} color="#fff" />
      <Text style={styles.text}>
        📡 Offline Mode — Using cached data{ageText()}
      </Text>
    </View>
  );
};

const styles = StyleSheet.create({
  banner: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    backgroundColor: "#d90429",
    paddingVertical: 7,
    paddingHorizontal: 12,
  },
  text: {
    color: "#fff",
    fontSize: 12,
    fontWeight: "700",
  },
});
