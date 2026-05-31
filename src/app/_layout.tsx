import { AnimatedSplashOverlay } from "@/components/animated-icon";
import { OfflineBanner } from "@/components/OfflineBanner";
import { OfflineSetupScreen, hasCompletedSetup } from "@/components/OfflineSetupScreen";
import { Colors } from "@/constants/theme";
import { getCacheAge } from "@/database/offlineDb";
import { registerBackgroundSync } from "@/services/backgroundSyncService";
import { subscribeToNetwork } from "@/services/networkService";
import { DarkTheme, DefaultTheme, Tabs, ThemeProvider } from "expo-router";
import { FileWarning, MapPin, MessageSquare, PhoneCall, Settings, ShieldAlert } from "lucide-react-native";
import { useEffect, useState } from "react";
import { useColorScheme } from "react-native";

export default function TabLayout() {
  const colorScheme = useColorScheme();
  const theme = colorScheme === "dark" ? DarkTheme : DefaultTheme;
  const colors = Colors[colorScheme === "unspecified" || !colorScheme ? "light" : colorScheme];

  const [isConnected, setIsConnected] = useState(true);
  const [cacheAge, setCacheAge] = useState<number | null>(null);
  const [setupDone, setSetupDone] = useState<boolean | null>(null);

  useEffect(() => {
    hasCompletedSetup().then(done => setSetupDone(done));

    const unsubscribe = subscribeToNetwork(online => {
      setIsConnected(online);
      if (!online) setCacheAge(getCacheAge());
    });

    // Register 24-hour background sync (requires dev build — skip in Expo Go)
    try { registerBackgroundSync(); } catch { /* Expo Go doesn't support background fetch */ }
    return () => unsubscribe();
  }, []);

  if (setupDone === false) {
    return <OfflineSetupScreen onComplete={() => setSetupDone(true)} />;
  }

  if (setupDone === null) return null;

  return (
    <ThemeProvider value={theme}>
      <AnimatedSplashOverlay />
      <OfflineBanner visible={!isConnected} cacheAgeMinutes={cacheAge} />
      <Tabs
        screenOptions={{
          tabBarActiveTintColor: "#ff4d4d",
          tabBarInactiveTintColor: "#888",
          tabBarStyle: {
            backgroundColor: colors.background,
            borderTopColor: colors.backgroundElement,
            height: 65,
            paddingBottom: 10,
            paddingTop: 10,
          },
          tabBarLabelStyle: { fontSize: 11, fontWeight: "600" },
          headerShown: false,
        }}
      >
        <Tabs.Screen name="index" options={{ title: "SOS", tabBarIcon: ({ color, size }) => <ShieldAlert color={color} size={size} /> }} />
        <Tabs.Screen name="locator" options={{ title: "Locator", tabBarIcon: ({ color, size }) => <MapPin color={color} size={size} /> }} />
        <Tabs.Screen name="contacts" options={{ title: "Contacts", tabBarIcon: ({ color, size }) => <PhoneCall color={color} size={size} /> }} />
        <Tabs.Screen name="assistant" options={{ title: "AI Aid", tabBarIcon: ({ color, size }) => <MessageSquare color={color} size={size} /> }} />
        <Tabs.Screen name="report" options={{ title: "Report", tabBarIcon: ({ color, size }) => <FileWarning color={color} size={size} /> }} />
        <Tabs.Screen name="settings" options={{ title: "Settings", tabBarIcon: ({ color, size }) => <Settings color={color} size={size} /> }} />
        <Tabs.Screen name="explore" options={{ href: null }} />
        <Tabs.Screen name="live-location" options={{ href: null }} />
      </Tabs>
    </ThemeProvider>
  );
}
