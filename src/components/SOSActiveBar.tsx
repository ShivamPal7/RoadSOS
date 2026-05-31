/**
 * SOSActiveBar.tsx
 * Persistent banner shown during active SOS.
 * Shows live location update countdown + cancel button.
 */

import React, { useEffect, useRef, useState } from "react";
import { Animated, Pressable, StyleSheet, Text, View } from "react-native";
import { AlertTriangle, X } from "lucide-react-native";

interface SOSActiveBarProps {
  visible: boolean;
  userName: string;
  onCancel: () => void;
}

export const SOSActiveBar: React.FC<SOSActiveBarProps> = ({
  visible,
  userName,
  onCancel,
}) => {
  const [nextUpdate, setNextUpdate] = useState(30);
  const pulse = useRef(new Animated.Value(1)).current;

  // Pulse animation
  useEffect(() => {
    if (!visible) return;
    const anim = Animated.loop(
      Animated.sequence([
        Animated.timing(pulse, { toValue: 1.04, duration: 500, useNativeDriver: true }),
        Animated.timing(pulse, { toValue: 1,    duration: 500, useNativeDriver: true }),
      ])
    );
    anim.start();
    return () => anim.stop();
  }, [visible]);

  // Countdown to next location update
  useEffect(() => {
    if (!visible) return;
    setNextUpdate(30);
    const interval = setInterval(() => {
      setNextUpdate(prev => {
        if (prev <= 1) return 30;
        return prev - 1;
      });
    }, 1000);
    return () => clearInterval(interval);
  }, [visible]);

  if (!visible) return null;

  return (
    <Animated.View style={[styles.bar, { transform: [{ scale: pulse }] }]}>
      <AlertTriangle size={16} color="#fff" />
      <View style={styles.textBlock}>
        <Text style={styles.title}>🚨 SOS ACTIVE — Alerting contacts</Text>
        <Text style={styles.sub}>
          Live location updates in {nextUpdate}s · {userName || "User"}
        </Text>
      </View>
      <Pressable style={styles.cancelBtn} onPress={onCancel}>
        <X size={16} color="#fff" />
        <Text style={styles.cancelText}>SAFE</Text>
      </Pressable>
    </Animated.View>
  );
};

const styles = StyleSheet.create({
  bar: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#d90429",
    paddingHorizontal: 12,
    paddingVertical: 10,
    gap: 8,
  },
  textBlock: { flex: 1 },
  title: { color: "#fff", fontSize: 12, fontWeight: "800" },
  sub:   { color: "rgba(255,255,255,0.8)", fontSize: 10, marginTop: 1 },
  cancelBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    backgroundColor: "rgba(0,0,0,0.3)",
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 8,
  },
  cancelText: { color: "#fff", fontSize: 11, fontWeight: "800" },
});
