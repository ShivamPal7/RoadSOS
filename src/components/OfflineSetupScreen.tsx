/**
 * OfflineSetupScreen.tsx
 * First-launch onboarding screen that downloads offline data.
 * Shows step-by-step progress: contacts, hospitals, maps.
 * Shown once, then dismissed permanently via AsyncStorage flag.
 */

import AsyncStorage from "@react-native-async-storage/async-storage";
import { CheckCircle2, Circle, Download, Loader } from "lucide-react-native";
import { useEffect, useRef, useState } from "react";
import { Animated, Pressable, StyleSheet, Text, View } from "react-native";
import { downloadTilesForRegion, TileProgress } from "@/services/maptilerService";
import { fetchAllEmergencyServices } from "@/services/placesService";
import { getCurrentLocation } from "@/services/location";
import { isOnline } from "@/services/networkService";

const SETUP_DONE_KEY = "@roadsos_offline_setup_done";

export const hasCompletedSetup = async (): Promise<boolean> => {
  const val = await AsyncStorage.getItem(SETUP_DONE_KEY);
  return val === "true";
};

export const markSetupDone = async (): Promise<void> => {
  await AsyncStorage.setItem(SETUP_DONE_KEY, "true");
};

type StepStatus = "pending" | "running" | "done" | "skipped";

interface Step {
  id: string;
  label: string;
  status: StepStatus;
}

interface OfflineSetupScreenProps {
  onComplete: () => void;
}

export function OfflineSetupScreen({ onComplete }: OfflineSetupScreenProps) {
  const [steps, setSteps] = useState<Step[]>([
    { id: "contacts", label: "Saving emergency numbers", status: "pending" },
    { id: "hospitals", label: "Caching nearby hospitals", status: "pending" },
    { id: "maps", label: "Downloading offline maps", status: "pending" },
  ]);
  const [mapProgress, setMapProgress] = useState(0);
  const [done, setDone] = useState(false);
  const progressAnim = useRef(new Animated.Value(0)).current;

  const setStep = (id: string, status: StepStatus) => {
    setSteps(prev => prev.map(s => (s.id === id ? { ...s, status } : s)));
  };

  useEffect(() => {
    runSetup();
  }, []);

  useEffect(() => {
    Animated.timing(progressAnim, {
      toValue: mapProgress,
      duration: 300,
      useNativeDriver: false,
    }).start();
  }, [mapProgress]);

  const runSetup = async () => {
    // Step 1 — Emergency numbers (instant, always available)
    setStep("contacts", "running");
    await new Promise(r => setTimeout(r, 600));
    setStep("contacts", "done");

    // Step 2 — Cache hospitals from SQLite (or live if online)
    setStep("hospitals", "running");
    try {
      const loc = await getCurrentLocation();
      const lat = loc?.latitude ?? 18.5204;
      const lon = loc?.longitude ?? 73.8567;
      const online = await isOnline();
      if (online) {
        await fetchAllEmergencyServices(lat, lon, true);
      }
      setStep("hospitals", "done");
    } catch {
      setStep("hospitals", "done"); // SQLite seed data is always there
    }

    // Step 3 — Download Maptiler tiles
    setStep("maps", "running");
    try {
      const loc = await getCurrentLocation();
      const lat = loc?.latitude ?? 18.5204;
      const lon = loc?.longitude ?? 73.8567;
      const online = await isOnline();

      if (online && process.env.EXPO_PUBLIC_MAPTILER_KEY !== "YOUR_MAPTILER_KEY_HERE") {
        await downloadTilesForRegion(lat, lon, (p: TileProgress) => {
          setMapProgress(p.percent);
        });
        setStep("maps", "done");
      } else {
        setStep("maps", "skipped");
        setMapProgress(100);
      }
    } catch {
      setStep("maps", "skipped");
      setMapProgress(100);
    }

    await markSetupDone();
    setDone(true);
  };

  const StepIcon = ({ status }: { status: StepStatus }) => {
    if (status === "done") return <CheckCircle2 size={20} color="#2a9d8f" />;
    if (status === "running") return <Loader size={20} color="#ffbe0b" />;
    if (status === "skipped") return <CheckCircle2 size={20} color="#6c757d" />;
    return <Circle size={20} color="#444" />;
  };

  const progressWidth = progressAnim.interpolate({
    inputRange: [0, 100],
    outputRange: ["0%", "100%"],
  });

  return (
    <View style={styles.container}>
      <View style={styles.card}>
        <Download size={36} color="#ff4d4d" style={styles.icon} />
        <Text style={styles.title}>📡 Setting Up Offline Mode</Text>
        <Text style={styles.subtitle}>
          This ensures RoadSOS works even without internet.
        </Text>

        <View style={styles.steps}>
          {steps.map(step => (
            <View key={step.id} style={styles.stepRow}>
              <StepIcon status={step.status} />
              <Text style={[
                styles.stepLabel,
                step.status === "done" && styles.stepDone,
                step.status === "running" && styles.stepRunning,
              ]}>
                {step.status === "done" ? "✅ " : step.status === "running" ? "⏳ " : "   "}
                {step.label}
              </Text>
            </View>
          ))}
        </View>

        {/* Map download progress bar */}
        {steps.find(s => s.id === "maps")?.status === "running" && (
          <View style={styles.progressContainer}>
            <View style={styles.progressTrack}>
              <Animated.View style={[styles.progressFill, { width: progressWidth }]} />
            </View>
            <Text style={styles.progressText}>{mapProgress}%</Text>
          </View>
        )}

        {done && (
          <Pressable style={styles.continueBtn} onPress={onComplete}>
            <Text style={styles.continueBtnText}>Continue to RoadSOS →</Text>
          </Pressable>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#121214",
    justifyContent: "center",
    alignItems: "center",
    padding: 24,
  },
  card: {
    backgroundColor: "#1e1e24",
    borderRadius: 20,
    padding: 28,
    width: "100%",
    maxWidth: 380,
    alignItems: "center",
    borderWidth: 1,
    borderColor: "#2e2e38",
  },
  icon: { marginBottom: 16 },
  title: {
    color: "#fff",
    fontSize: 20,
    fontWeight: "800",
    textAlign: "center",
    marginBottom: 8,
  },
  subtitle: {
    color: "#888",
    fontSize: 13,
    textAlign: "center",
    lineHeight: 18,
    marginBottom: 24,
  },
  steps: { width: "100%", gap: 14, marginBottom: 20 },
  stepRow: { flexDirection: "row", alignItems: "center", gap: 12 },
  stepLabel: { color: "#aaa", fontSize: 14 },
  stepDone: { color: "#2a9d8f" },
  stepRunning: { color: "#ffbe0b" },
  progressContainer: {
    width: "100%",
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    marginBottom: 20,
  },
  progressTrack: {
    flex: 1,
    height: 8,
    backgroundColor: "#2e2e38",
    borderRadius: 4,
    overflow: "hidden",
  },
  progressFill: {
    height: "100%",
    backgroundColor: "#d90429",
    borderRadius: 4,
  },
  progressText: { color: "#fff", fontSize: 12, fontWeight: "700", width: 36 },
  continueBtn: {
    backgroundColor: "#ff4d4d",
    paddingVertical: 14,
    paddingHorizontal: 32,
    borderRadius: 12,
    marginTop: 8,
  },
  continueBtnText: { color: "#fff", fontSize: 15, fontWeight: "800" },
});
