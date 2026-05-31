/**
 * animated-icon.tsx
 * RoadSOS animated splash overlay.
 * Uses react-native-reanimated for smooth entrance animation.
 * No external image assets — avoids Metro asset resolution issues.
 */

import { useEffect } from "react";
import { useState } from "react";
import { StyleSheet, Text, View } from "react-native";
import Animated, {
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withSequence,
  withTiming,
  runOnJS,
} from "react-native-reanimated";

const DURATION = 600;

export function AnimatedSplashOverlay() {
  const [visible, setVisible] = useState(true);

  // Shared values for animation
  const scale   = useSharedValue(0.6);
  const opacity = useSharedValue(0);
  const overlayOpacity = useSharedValue(1);

  const dismiss = () => setVisible(false);

  useEffect(() => {
    // Entrance: scale up + fade in
    scale.value   = withTiming(1,   { duration: DURATION, easing: Easing.out(Easing.back(1.5)) });
    opacity.value = withTiming(1,   { duration: DURATION });

    // Exit: fade out overlay after 1.8s
    overlayOpacity.value = withDelay(
      1800,
      withTiming(0, { duration: 400 }, (finished) => {
        if (finished) runOnJS(dismiss)();
      })
    );
  }, []);

  const logoStyle = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }],
    opacity: opacity.value,
  }));

  const overlayStyle = useAnimatedStyle(() => ({
    opacity: overlayOpacity.value,
  }));

  if (!visible) return null;

  return (
    <Animated.View style={[styles.overlay, overlayStyle]}>
      <Animated.View style={[styles.logoContainer, logoStyle]}>
        {/* Pulsing red circle */}
        <View style={styles.circle}>
          <Text style={styles.emoji}>🚨</Text>
        </View>
        <Text style={styles.title}>RoadSOS</Text>
        <Text style={styles.tagline}>Help in Seconds</Text>
      </Animated.View>
    </Animated.View>
  );
}

export function AnimatedIcon() {
  return (
    <View style={styles.logoContainer}>
      <View style={styles.circle}>
        <Text style={styles.emoji}>🚨</Text>
      </View>
      <Text style={styles.title}>RoadSOS</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  overlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "#121214",
    justifyContent: "center",
    alignItems: "center",
    zIndex: 999,
  },
  logoContainer: {
    alignItems: "center",
    gap: 12,
  },
  circle: {
    width: 100,
    height: 100,
    borderRadius: 50,
    backgroundColor: "#1e1e24",
    borderWidth: 2,
    borderColor: "#ff4d4d",
    justifyContent: "center",
    alignItems: "center",
    shadowColor: "#ff4d4d",
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.6,
    shadowRadius: 20,
    elevation: 12,
  },
  emoji: {
    fontSize: 44,
  },
  title: {
    color: "#ff4d4d",
    fontSize: 34,
    fontWeight: "900",
    letterSpacing: 2,
  },
  tagline: {
    color: "#888",
    fontSize: 14,
    letterSpacing: 1,
  },
});
