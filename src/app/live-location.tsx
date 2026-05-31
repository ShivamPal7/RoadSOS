/**
 * live-location.tsx
 * Real-time location viewer for contacts who tap the FCM notification.
 * Subscribes to Firebase sos/{userId} and updates the map every 30 seconds.
 * Route: /live-location?userId=xxx
 */

import { useLocalSearchParams, useRouter } from "expo-router";
import { MapPin, Phone, RefreshCw, ShieldAlert } from "lucide-react-native";
import { useEffect, useRef, useState } from "react";
import { Linking, Platform, Pressable, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { subscribeLiveLocation, LiveLocationData } from "@/services/firebaseService";

let MapLibreGL: any = null;
if (Platform.OS !== "web") {
  try {
    MapLibreGL = require("@maplibre/maplibre-react-native").default;
  } catch (err) {
    console.warn("MapLibre React Native unavailable:", err);
  }
}

export default function LiveLocationScreen() {
  const { userId } = useLocalSearchParams<{ userId: string }>();
  const router = useRouter();

  const [locationData, setLocationData] = useState<LiveLocationData | null>(null);
  const [lastUpdated, setLastUpdated]   = useState<string>("");
  const [isActive, setIsActive]         = useState(true);
  const mapRef = useRef<any>(null);
  const cameraRef = useRef<any>(null);

  useEffect(() => {
    if (!userId) return;

    const unsubscribe = subscribeLiveLocation(userId, data => {
      if (data) {
        setLocationData(data);
        setIsActive(data.active);
        setLastUpdated(new Date(data.timestamp).toLocaleTimeString("en-IN"));

        // Move camera to new location
        if (Platform.OS !== "web" && cameraRef.current) {
          cameraRef.current.setCamera({
            centerCoordinate: [data.longitude, data.latitude],
            zoomLevel: 15,
            animationDuration: 800
          });
        }
      } else {
        setIsActive(false);
      }
    });

    return () => unsubscribe();
  }, [userId]);

  const openInMaps = () => {
    if (!locationData) return;
    Linking.openURL(
      `https://www.google.com/maps/dir/?api=1` +
      `&destination=${locationData.latitude},${locationData.longitude}` +
      `&travelmode=driving`
    );
  };

  return (
    <SafeAreaView style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <ShieldAlert size={22} color="#d90429" />
        <Text style={styles.headerTitle}>
          {locationData?.userName || "User"} — Live Location
        </Text>
      </View>

      {/* Status banner */}
      <View style={[styles.statusBanner, isActive ? styles.bannerActive : styles.bannerSafe]}>
        <Text style={styles.statusText}>
          {isActive ? "🔴 SOS ACTIVE — Location updating every 30s" : "✅ Safe — SOS Cancelled"}
        </Text>
        {lastUpdated ? (
          <Text style={styles.lastUpdated}>Last updated: {lastUpdated}</Text>
        ) : null}
      </View>

      {/* Map */}
      <View style={styles.mapContainer}>
        {Platform.OS !== "web" && MapLibreGL && locationData ? (
          <MapLibreGL.MapView
            style={styles.map}
            mapStyle="https://tiles.openfreemap.org/styles/dark"
            logoEnabled={false}
            attributionEnabled={true}
          >
            <MapLibreGL.Camera
              ref={cameraRef}
              zoomLevel={15}
              centerCoordinate={[locationData.longitude, locationData.latitude]}
            />
            <MapLibreGL.PointAnnotation
              id="victimLocation"
              coordinate={[locationData.longitude, locationData.latitude]}
              title={locationData.userName}
            >
              <View style={{
                width: 16,
                height: 16,
                backgroundColor: '#d90429',
                borderRadius: 8,
                borderWidth: 3,
                borderColor: '#fff',
                shadowColor: '#d90429',
                shadowOffset: { width: 0, height: 0 },
                shadowOpacity: 0.8,
                shadowRadius: 4,
                elevation: 5
              }} />
            </MapLibreGL.PointAnnotation>
          </MapLibreGL.MapView>
        ) : (
          <View style={styles.mapFallback}>
            <MapPin size={48} color="#d90429" />
            {locationData ? (
              <>
                <Text style={styles.coordText}>
                  {locationData.latitude.toFixed(6)}, {locationData.longitude.toFixed(6)}
                </Text>
                <Pressable style={styles.mapsBtn} onPress={openInMaps}>
                  <Text style={styles.mapsBtnText}>Open in Google Maps</Text>
                </Pressable>
              </>
            ) : (
              <Text style={styles.waitingText}>Waiting for location data...</Text>
            )}
          </View>
        )}
      </View>

      {/* Action buttons */}
      {locationData && (
        <View style={styles.actions}>
          <Pressable style={styles.navBtn} onPress={openInMaps}>
            <MapPin size={18} color="#fff" />
            <Text style={styles.btnText}>Navigate There</Text>
          </Pressable>
        </View>
      )}

      {/* No Firebase config fallback */}
      {!userId && (
        <View style={styles.noDataView}>
          <ShieldAlert size={48} color="#444" />
          <Text style={styles.noDataText}>No location data available.</Text>
          <Text style={styles.noDataSub}>
            Firebase is not configured. The victim location cannot be tracked in real time.
          </Text>
        </View>
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#121214" },
  header: {
    flexDirection: "row", alignItems: "center", gap: 10,
    paddingHorizontal: 16, paddingVertical: 12,
    borderBottomWidth: 1, borderBottomColor: "#212225",
  },
  headerTitle: { color: "#fff", fontSize: 18, fontWeight: "700" },
  statusBanner: {
    paddingHorizontal: 16, paddingVertical: 10,
    alignItems: "center",
  },
  bannerActive: { backgroundColor: "#d90429" },
  bannerSafe:   { backgroundColor: "#2a9d8f" },
  statusText:   { color: "#fff", fontSize: 13, fontWeight: "700" },
  lastUpdated:  { color: "rgba(255,255,255,0.8)", fontSize: 11, marginTop: 2 },
  mapContainer: { flex: 1 },
  map: { flex: 1 },
  mapFallback: {
    flex: 1, justifyContent: "center", alignItems: "center",
    gap: 12, backgroundColor: "#1a1a20",
  },
  coordText:    { color: "#fff", fontSize: 14, fontWeight: "600" },
  waitingText:  { color: "#888", fontSize: 13 },
  mapsBtn: {
    backgroundColor: "#457b9d", paddingHorizontal: 20,
    paddingVertical: 10, borderRadius: 10,
  },
  mapsBtnText: { color: "#fff", fontSize: 14, fontWeight: "700" },
  actions: {
    padding: 16, borderTopWidth: 1, borderTopColor: "#212225",
  },
  navBtn: {
    flexDirection: "row", justifyContent: "center",
    alignItems: "center", gap: 8,
    backgroundColor: "#457b9d", paddingVertical: 14, borderRadius: 12,
  },
  btnText: { color: "#fff", fontSize: 15, fontWeight: "800" },
  noDataView: {
    flex: 1, justifyContent: "center", alignItems: "center",
    padding: 32, gap: 12,
  },
  noDataText: { color: "#fff", fontSize: 18, fontWeight: "700" },
  noDataSub:  { color: "#888", fontSize: 13, textAlign: "center", lineHeight: 18 },
});
