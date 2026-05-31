import { StyleSheet, Text, View } from "react-native";

export function AnimatedSplashOverlay() {
  return null; // Web splash handled by CSS
}

export function AnimatedIcon() {
  return (
    <View style={styles.container}>
      <Text style={styles.emoji}>🚨</Text>
      <Text style={styles.title}>RoadSOS</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
  },
  emoji: { fontSize: 40 },
  title: {
    color: "#ff4d4d",
    fontSize: 28,
    fontWeight: "900",
  },
});
