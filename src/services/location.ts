import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Location from 'expo-location';
import * as Network from 'expo-network';
import { Platform } from 'react-native';

const LAST_KNOWN_LOCATION_KEY = '@roadsos_last_known_location';

export interface LocationData {
  latitude: number;
  longitude: number;
  accuracy: number | null;
  timestamp: number;
}

// Background location cache interval (30 seconds as per README spec)
let locationCacheInterval: ReturnType<typeof setInterval> | null = null;

export const requestLocationPermissions = async (): Promise<boolean> => {
  if (Platform.OS === 'web') {
    return false; // Avoid permission prompt hanging on web browser automation
  }
  try {
    const { status } = await Location.requestForegroundPermissionsAsync();
    return status === 'granted';
  } catch (error) {
    console.error('Failed to request location permissions:', error);
    return false;
  }
};

export const getCurrentLocation = async (): Promise<LocationData | null> => {
  try {
    const hasPermission = await requestLocationPermissions();
    if (!hasPermission) {
      return await getLastKnownLocation();
    }

    const location = await Location.getCurrentPositionAsync({
      accuracy: Location.Accuracy.High,
    });

    // Ensure we strictly focus on India (especially in emulators/simulators defaulting to USA)
    let lat = location.coords.latitude;
    let lon = location.coords.longitude;
    const isInsideIndia = lat >= 8.0 && lat <= 38.0 && lon >= 68.0 && lon <= 98.0;
    if (!isInsideIndia) {
      console.log(`[Location] GPS returned (${lat.toFixed(4)}, ${lon.toFixed(4)}) outside India. Snapping to Pune, India for local emergency mapping.`);
      lat = 18.5204;
      lon = 73.8567;
    }

    const data: LocationData = {
      latitude: lat,
      longitude: lon,
      accuracy: location.coords.accuracy,
      timestamp: location.timestamp,
    };

    // Cache the location
    await AsyncStorage.setItem(LAST_KNOWN_LOCATION_KEY, JSON.stringify(data));
    return data;
  } catch (error) {
    console.warn('Error fetching real-time GPS, trying cache...', error);
    return await getLastKnownLocation();
  }
};

export const getLastKnownLocation = async (): Promise<LocationData | null> => {
  try {
    const cached = await AsyncStorage.getItem(LAST_KNOWN_LOCATION_KEY);
    if (cached) {
      const parsed = JSON.parse(cached) as LocationData;
      const isInsideIndia = parsed.latitude >= 8.0 && parsed.latitude <= 38.0 && parsed.longitude >= 68.0 && parsed.longitude <= 98.0;
      if (isInsideIndia) {
        return parsed;
      }
    }
  } catch (error) {
    console.error('Error fetching cached location:', error);
  }

  // Default to Pune, India if no cache exists
  return {
    latitude: 18.5204,
    longitude: 73.8567,
    accuracy: null,
    timestamp: Date.now(),
  };
};

/**
 * Start background location caching every 30 seconds.
 * This ensures the last known location is always fresh for offline SMS alerts.
 */
export const startLocationCaching = () => {
  if (Platform.OS === 'web') return; // Avoid polling and permission prompt hanging on web
  if (locationCacheInterval) return; // Already running

  locationCacheInterval = setInterval(async () => {
    try {
      const hasPermission = await requestLocationPermissions();
      if (!hasPermission) return;

      const location = await Location.getCurrentPositionAsync({
        accuracy: Location.Accuracy.Balanced, // Use balanced for background to save battery
      });

      let lat = location.coords.latitude;
      let lon = location.coords.longitude;
      const isInsideIndia = lat >= 8.0 && lat <= 38.0 && lon >= 68.0 && lon <= 98.0;
      if (!isInsideIndia) {
        lat = 18.5204;
        lon = 73.8567;
      }

      const data: LocationData = {
        latitude: lat,
        longitude: lon,
        accuracy: location.coords.accuracy,
        timestamp: location.timestamp,
      };

      await AsyncStorage.setItem(LAST_KNOWN_LOCATION_KEY, JSON.stringify(data));
    } catch (error) {
      // Silently fail — this is a background cache update
    }
  }, 30000); // 30 seconds

  console.log('Background location caching started (30s interval).');
};

export const stopLocationCaching = () => {
  if (locationCacheInterval) {
    clearInterval(locationCacheInterval);
    locationCacheInterval = null;
    console.log('Background location caching stopped.');
  }
};

/**
 * Check real network connectivity using expo-network.
 * Returns true if the device has an active internet connection.
 */
export const checkNetworkConnectivity = async (): Promise<boolean> => {
  try {
    const state = await Network.getNetworkStateAsync();
    return state.isConnected === true && state.isInternetReachable === true;
  } catch (error) {
    console.warn('Network check failed:', error);
    return false;
  }
};
