import { CallButton } from "@/components/CallButton";
import { ResultCardSkeleton } from "@/components/ResultCard";
import { queryOfflineServices } from "@/database/offlineDb";
import { checkNetworkConnectivity, getCurrentLocation, LocationData } from "@/services/location";
import { fetchAllEmergencyServices, PlaceResult } from "@/services/placesService";
import { fetchRoute, getRecommendedHospitals, sortByEta, RouteStep } from "@/services/routingService";
import BottomSheet, { BottomSheetScrollView } from "@gorhom/bottom-sheet";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { useFocusEffect } from "expo-router";
import { Award, Clock, CloudOff, List, Map, MapPin, Navigation, RefreshCw, ShieldAlert, Star, Wifi, X, Play, Square, ArrowUp, ArrowUpLeft, ArrowUpRight } from "lucide-react-native";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { ActivityIndicator, Animated, Linking, Platform, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { SafeAreaView } from "react-native-safe-area-context";

let MapLibreGL: any = null;
if (Platform.OS !== "web") {
  try {
    MapLibreGL = require("@maplibre/maplibre-react-native").default;
  } catch (err) {
    console.warn("MapLibre React Native unavailable:", err);
  }
}

let MapView: any = null;
let Marker: any = null;
let Polyline: any = null;
let UrlTile: any = null;
if (Platform.OS !== "web") {
  try {
    const RNMaps = require("react-native-maps");
    MapView = RNMaps.default || RNMaps;
    Marker = RNMaps.Marker || MapView.Marker;
    Polyline = RNMaps.Polyline || MapView.Polyline;
    UrlTile = RNMaps.UrlTile || MapView.UrlTile;
  } catch (err) {
    console.warn("react-native-maps unavailable:", err);
  }
}

let WebView: any = null;
if (Platform.OS !== "web") {
  try {
    WebView = require("react-native-webview").WebView;
  } catch (err) {
    console.warn("react-native-webview unavailable:", err);
  }
}

const SETTINGS_KEY = "@roadsos_settings_config";
type FilterType = "all" | "hospital" | "ambulance" | "police" | "towing" | "puncture";

const FILTERS: { key: FilterType; label: string; color: string }[] = [
  { key: "all", label: "All", color: "#ff4d4d" },
  { key: "hospital", label: "Hospitals", color: "#d90429" },
  { key: "ambulance", label: "Ambulance", color: "#2a9d8f" },
  { key: "police", label: "Police", color: "#457b9d" },
  { key: "towing", label: "Towing", color: "#f77f00" },
  { key: "puncture", label: "Puncture", color: "#6c757d" },
];

const PIN_COLOR: Record<string, string> = {
  hospital: "red", ambulance: "#f4d03f", police: "#3498db", towing: "orange", puncture: "gray",
};

const TYPE_BADGE_COLOR: Record<string, string> = {
  hospital: "#d90429", ambulance: "#2a9d8f", police: "#457b9d", towing: "#f77f00", puncture: "#6c757d",
};

const TYPE_LABEL: Record<string, string> = {
  hospital: "Hospital", ambulance: "Ambulance", police: "Police", towing: "Towing", puncture: "Puncture",
};

const PROGRESS_LABELS: Record<string, string> = {
  hospital: "Hospitals", police: "Police", ambulance: "Ambulance", towing: "Towing",
};

const toPlaceResult = (r: ReturnType<typeof queryOfflineServices>[number], type: PlaceResult["type"]): PlaceResult => ({
  place_id: `cache_${type}_${r.id}`, name: r.name, vicinity: r.address, distance: r.distance,
  eta: `~${Math.round(r.distance * 2.2 + 2)} min`,
  etaSeconds: Math.round(r.distance * 2.2 * 60 + 120),
  isOpen: null, phone: r.phone, latitude: r.latitude, longitude: r.longitude,
  rating: r.rating, is_trauma_center: Boolean(r.is_trauma_center), type, source: "cache",
});

const getBounds = (coords: { latitude: number; longitude: number }[]) => {
  if (coords.length === 0) return null;
  let minLat = coords[0].latitude;
  let maxLat = coords[0].latitude;
  let minLon = coords[0].longitude;
  let maxLon = coords[0].longitude;
  
  for (const c of coords) {
    if (c.latitude < minLat) minLat = c.latitude;
    if (c.latitude > maxLat) maxLat = c.latitude;
    if (c.longitude < minLon) minLon = c.longitude;
    if (c.longitude > maxLon) maxLon = c.longitude;
  }
  
  return [
    [maxLon, maxLat], // ne
    [minLon, minLat]  // sw
  ];
};

const GOOGLE_MAPS_DARK_STYLE = [
  {
    "elementType": "geometry",
    "stylers": [{ "color": "#121214" }]
  },
  {
    "elementType": "labels.text.fill",
    "stylers": [{ "color": "#8a8a9f" }]
  },
  {
    "elementType": "labels.text.stroke",
    "stylers": [{ "color": "#121214" }]
  },
  {
    "featureType": "administrative",
    "elementType": "geometry",
    "stylers": [{ "visibility": "off" }]
  },
  {
    "featureType": "administrative.country",
    "elementType": "geometry.stroke",
    "stylers": [{ "color": "#44445c" }]
  },
  {
    "featureType": "poi",
    "elementType": "geometry",
    "stylers": [{ "color": "#1e1e24" }]
  },
  {
    "featureType": "poi",
    "elementType": "labels.text.fill",
    "stylers": [{ "color": "#74748c" }]
  },
  {
    "featureType": "poi.park",
    "elementType": "geometry",
    "stylers": [{ "color": "#181822" }]
  },
  {
    "featureType": "road",
    "elementType": "geometry.fill",
    "stylers": [{ "color": "#2d2d38" }]
  },
  {
    "featureType": "road",
    "elementType": "labels.text.fill",
    "stylers": [{ "color": "#8a8a9f" }]
  },
  {
    "featureType": "road.highway",
    "elementType": "geometry",
    "stylers": [{ "color": "#ff4d4d", "lightness": -60 }]
  },
  {
    "featureType": "water",
    "elementType": "geometry",
    "stylers": [{ "color": "#0b0b0f" }]
  }
];

const MAPBOX_TOKEN = process.env.EXPO_PUBLIC_MAPBOX_ACCESS_TOKEN || "";

export default function LocatorScreen() {
  const { t } = useTranslation();
  const [location, setLocation] = useState<LocationData | null>({
    latitude: 18.5204,
    longitude: 73.8567,
    accuracy: null,
    timestamp: Date.now(),
  });
  const [offlineMode, setOfflineMode] = useState(false);
  const [viewMode, setViewMode] = useState<"map" | "list">("map");
  const [filter, setFilter] = useState<FilterType>("all");
  const [loading, setLoading] = useState(false);
  const [results, setResults] = useState<Partial<Record<PlaceResult["type"], PlaceResult[]>>>({});
  const [progress, setProgress] = useState<Record<string, boolean>>({ hospital: false, police: false, ambulance: false, towing: false });
  const [selected, setSelected] = useState<PlaceResult | null>(null);
  const [navigatingTo, setNavigatingTo] = useState<PlaceResult | null>(null);
  const [routeCoords, setRouteCoords] = useState<{ latitude: number; longitude: number }[]>([]);
  const [routeLoading, setRouteLoading] = useState(false);
  const [initialCenter, setInitialCenter] = useState({ latitude: 18.5204, longitude: 73.8567 });
  const [isSimulating, setIsSimulating] = useState(false);
  const [simulatedStepIndex, setSimulatedStepIndex] = useState(0);
  const [simulatedDistance, setSimulatedDistance] = useState("");
  const [simulatedEta, setSimulatedEta] = useState("");
  const [simulatedInstruction, setSimulatedInstruction] = useState("");
  const [routeSteps, setRouteSteps] = useState<RouteStep[]>([]);

  const polylineOpacity = useRef(new Animated.Value(0)).current;
  const mapRef = useRef<any>(null);
  const cameraRef = useRef<any>(null);
  const bottomSheetRef = useRef<BottomSheet>(null);
  const mapRefWeb = useRef<any>(null);
  const markersRefWeb = useRef<any[]>([]);
  const polylineRefWeb = useRef<any>(null);
  const webViewRef = useRef<any>(null);
  const iframeRef = useRef<any>(null);
  const snapPoints = useMemo(() => ["28%", "55%"], []);

  const loadSettings = useCallback(async () => {
    try {
      const s = await AsyncStorage.getItem(SETTINGS_KEY);
      if (s) { const p = JSON.parse(s); if (p.offlineMode !== undefined) setOfflineMode(p.offlineMode); }
    } catch { }
  }, []);

  useEffect(() => { loadSettings().then(refresh); }, []);
  useFocusEffect(useCallback(() => { loadSettings().then(refresh); }, []));

  const downloadOfflineMap = async (lat: number, lon: number) => {
    if (Platform.OS === 'web' || !MapLibreGL) return;
    try {
      const delta = 0.15; // approx 15km
      const west = lon - delta;
      const east = lon + delta;
      const south = lat - delta;
      const north = lat + delta;
      const packName = `roadsos_offline_${lat.toFixed(2)}_${lon.toFixed(2)}`;

      const packs = await MapLibreGL.OfflineManager.getPacks();
      const exists = packs.some((p: any) => p.name === packName);
      if (exists) return;

      await MapLibreGL.OfflineManager.createPack(
        {
          name: packName,
          mapStyle: 'https://tiles.openfreemap.org/styles/dark',
          minZoom: 10,
          maxZoom: 14,
          bounds: [
            [east, north], // NE
            [west, south]  // SW
          ],
          metadata: { date: new Date().toISOString() }
        },
        (region: any, status: any) => {},
        (region: any, err: any) => { console.warn("Offline pack download error:", err); }
      );
    } catch (err) {
      console.warn("Offline pack creation failed:", err);
    }
  };

  const refresh = async () => {
    setLoading(true);
    setSelected(null);
    setNavigatingTo(null);
    setRouteCoords([]);
    setProgress({ hospital: false, police: false, ambulance: false, towing: false });
    const loc = await getCurrentLocation();
    let lat = loc?.latitude ?? 18.5204;
    let lon = loc?.longitude ?? 73.8567;

    const isInsideIndia = lat >= 8.0 && lat <= 38.0 && lon >= 68.0 && lon <= 98.0;
    if (!isInsideIndia) {
      lat = 18.5204;
      lon = 73.8567;
    }

    setLocation({
      latitude: lat,
      longitude: lon,
      accuracy: loc?.accuracy ?? null,
      timestamp: loc?.timestamp ?? Date.now(),
    });
    setInitialCenter({ latitude: lat, longitude: lon });
    const isOnline = await checkNetworkConnectivity();
    const punctureRows = queryOfflineServices(lat, lon, "puncture");
    setResults(prev => ({ ...prev, puncture: punctureRows.map(r => toPlaceResult(r, "puncture")) }));
    if (!isOnline || offlineMode) {
      const types: PlaceResult["type"][] = ["hospital", "ambulance", "police", "towing"];
      for (const type of types) {
        const rows = queryOfflineServices(lat, lon, type);
        setResults(prev => ({ ...prev, [type]: rows.map(r => toPlaceResult(r, type)) }));
        setProgress(prev => ({ ...prev, [type]: true }));
      }
      setLoading(false);
      return;
    }
    try {
      await fetchAllEmergencyServices(lat, lon, true, (type, categoryResults) => {
        setResults(prev => ({ ...prev, [type]: categoryResults }));
        setProgress(prev => ({ ...prev, [type]: true }));
      });
      downloadOfflineMap(lat, lon);
    } catch {
      const types: PlaceResult["type"][] = ["hospital", "ambulance", "police", "towing"];
      for (const type of types) {
        const rows = queryOfflineServices(lat, lon, type);
        setResults(prev => ({ ...prev, [type]: rows.map(r => toPlaceResult(r, type)) }));
        setProgress(prev => ({ ...prev, [type]: true }));
      }
    }
    setLoading(false);
  };

  const handleSelect = async (service: PlaceResult) => {
    setSelected(service);
    setRouteCoords([]);
    bottomSheetRef.current?.snapToIndex(0);
    if (!location) return;
    polylineOpacity.setValue(0);
    setRouteLoading(true);
    const route = await fetchRoute(location.latitude, location.longitude, service.latitude, service.longitude);
    setRouteLoading(false);
    if (route) {
      setRouteCoords(route.coordinates);
      setRouteSteps(route.steps || []);
      Animated.timing(polylineOpacity, { toValue: 1, duration: 600, useNativeDriver: true }).start();
      if (Platform.OS !== "web") {
        if (cameraRef.current) {
          const allCoords = [
            { latitude: location.latitude, longitude: location.longitude },
            ...route.coordinates,
            { latitude: service.latitude, longitude: service.longitude }
          ];
          const boundingBox = getBounds(allCoords);
          if (boundingBox) {
            cameraRef.current.fitBounds(
              boundingBox[0], // ne
              boundingBox[1], // sw
              [80, 40, 320, 40], // padding [top, right, bottom, left]
              600
            );
          }
        } else if (mapRef.current?.fitToCoordinates) {
          mapRef.current.fitToCoordinates(
            [{ latitude: location.latitude, longitude: location.longitude }, ...route.coordinates, { latitude: service.latitude, longitude: service.longitude }],
            { edgePadding: { top: 80, right: 40, bottom: 320, left: 40 }, animated: true }
          );
        }
      }
    } else {
      if (Platform.OS !== "web") {
        if (cameraRef.current) {
          cameraRef.current.setCamera({
            centerCoordinate: [service.longitude, service.latitude],
            zoomLevel: 14,
            animationDuration: 600
          });
        } else if (mapRef.current?.animateToRegion) {
          mapRef.current.animateToRegion({ latitude: service.latitude, longitude: service.longitude, latitudeDelta: 0.03, longitudeDelta: 0.03 }, 600);
        }
      }
    }
  };

  const handleDismiss = () => { setSelected(null); setRouteCoords([]); setRouteSteps([]); setNavigatingTo(null); bottomSheetRef.current?.close(); };

  const handleStartNavigation = async (service: PlaceResult) => {
    setViewMode("map");
    bottomSheetRef.current?.close();
    setNavigatingTo(service);
    setIsSimulating(false);
    setSimulatedStepIndex(0);
    setSimulatedDistance(service.distance.toFixed(1) + " km");
    setSimulatedEta(service.eta);
    setSimulatedInstruction("Proceed along the highlighted emergency route.");
    
    if (selected?.place_id !== service.place_id) {
      await handleSelect(service);
    }
  };

  const handleExitNavigation = () => {
    setIsSimulating(false);
    setNavigatingTo(null);
    setRouteCoords([]);
    setRouteSteps([]);
    setSelected(null);
    setSimulatedStepIndex(0);
    refresh();
  };

  // Post user location updates smoothly to the active map iframe / WebView
  useEffect(() => {
    if (!location) return;
    const msg = JSON.stringify({
      type: "UPDATE_LOCATION",
      latitude: location.latitude,
      longitude: location.longitude,
      panTo: navigatingTo !== null
    });
    
    if (Platform.OS === "web") {
      if (iframeRef.current?.contentWindow) {
        iframeRef.current.contentWindow.postMessage(JSON.parse(msg), "*");
      }
    } else {
      if (webViewRef.current) {
        webViewRef.current.postMessage(msg);
      }
    }
  }, [location?.latitude, location?.longitude, navigatingTo]);

  // Simulation timer loop
  useEffect(() => {
    let timer: any = null;
    if (isSimulating && navigatingTo && routeCoords.length > 0) {
      timer = setInterval(() => {
        setSimulatedStepIndex(prevIndex => {
          const increment = Math.max(1, Math.ceil(routeCoords.length / 15));
          const nextIndex = Math.min(prevIndex + increment, routeCoords.length - 1);
          const currentPoint = routeCoords[nextIndex];
          
          if (currentPoint) {
            setLocation(prev => prev ? {
              ...prev,
              latitude: currentPoint.latitude,
              longitude: currentPoint.longitude,
            } : null);
          }
          
          const fraction = 1 - (nextIndex / (routeCoords.length - 1));
          const remainingDistance = Math.max(0, fraction * navigatingTo.distance);
          setSimulatedDistance(remainingDistance.toFixed(1) + " km");
          
          const etaSecs = navigatingTo.etaSeconds || (navigatingTo.distance * 120);
          const remainingEtaSeconds = Math.max(0, fraction * etaSecs);
          const remainingMins = Math.round(remainingEtaSeconds / 60);
          setSimulatedEta(`~${remainingMins} min`);
          
          if (nextIndex === 0) {
            setSimulatedInstruction("Departing from your location. Head straight.");
          } else if (nextIndex === routeCoords.length - 1) {
            setSimulatedInstruction("Arrived at emergency destination!");
            setIsSimulating(false);
            clearInterval(timer);
          } else if (routeSteps && routeSteps.length > 0) {
            const currentStep = routeSteps.find(s => nextIndex >= s.wayPoints[0] && nextIndex <= s.wayPoints[1]);
            if (currentStep) {
              setSimulatedInstruction(currentStep.instruction);
            } else {
              const nextStep = routeSteps.find(s => s.wayPoints[0] > nextIndex);
              if (nextStep) {
                setSimulatedInstruction(nextStep.instruction);
              } else {
                setSimulatedInstruction("Proceed along the highlighted emergency route.");
              }
            }
          } else {
            const stepPercent = (nextIndex / routeCoords.length) * 100;
            if (stepPercent < 25) {
              setSimulatedInstruction("In 200m, turn slightly right toward the arterial road.");
            } else if (stepPercent < 50) {
              setSimulatedInstruction("Continue straight for 400 meters on the main road.");
            } else if (stepPercent < 75) {
              setSimulatedInstruction("In 150m, prepare to make a left turn at the intersection.");
            } else {
              setSimulatedInstruction("Arriving at the emergency facility in 100 meters on your right.");
            }
          }
          
          return nextIndex;
        });
      }, 1500);
    }
    
    return () => {
      if (timer) clearInterval(timer);
    };
  }, [isSimulating, navigatingTo, routeCoords, routeSteps]);

  const allFiltered: PlaceResult[] = useMemo(() => {
    const processedHospitals = results.hospital ? getRecommendedHospitals(results.hospital) : [];

    if (filter === "hospital") {
      return processedHospitals;
    }

    if (filter === "all") {
      const otherTypes: PlaceResult["type"][] = ["ambulance", "police", "towing", "puncture"];
      const others = otherTypes.flatMap(type => results[type] ?? []);
      const merged = [...processedHospitals, ...others];
      const seen = new Set();
      const unique = merged.filter(item => {
        if (seen.has(item.place_id)) return false;
        seen.add(item.place_id);
        return true;
      });
      return sortByEta(unique);
    }

    return sortByEta(results[filter as PlaceResult["type"]] ?? []);
  }, [results, filter]);

  // Leaflet or Google Map source for web fallback
  const webMapHtml = useMemo(() => {
    const userLat = initialCenter.latitude;
    const userLon = initialCenter.longitude;
    const mapboxToken = MAPBOX_TOKEN;

    const colors = {
      hospital: '#d90429',
      ambulance: '#2a9d8f',
      police: '#457b9d',
      towing: '#f77f00',
      puncture: '#6c757d'
    };
    return `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="utf-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1.0" />
        <link rel="stylesheet" href="https://unpkg.com/leaflet@1.9.4/dist/leaflet.css"/>
        <script src="https://unpkg.com/leaflet@1.9.4/dist/leaflet.js"></script>
        <style>
          html, body {
            width: 100%;
            height: 100%;
            margin: 0;
            padding: 0;
            background-color: #0b0b0d;
            overflow: hidden;
          }
          #map {
            position: absolute;
            top: 0;
            bottom: 0;
            left: 0;
            right: 0;
            width: 100%;
            height: 100%;
            background-color: #0b0b0d;
          }
          /* Custom popup dark styling */
          .leaflet-popup-content-wrapper {
            background: #18181f !important;
            color: #fff !important;
            border: 1px solid #ff4d4d33 !important;
            border-radius: 12px !important;
            box-shadow: 0 10px 25px rgba(0,0,0,0.6) !important;
            padding: 4px !important;
            backdrop-filter: blur(8px);
          }
          .leaflet-popup-tip {
            background: #18181f !important;
            border: 1px solid #ff4d4d33 !important;
          }
          .leaflet-popup-close-button {
            color: #888 !important;
            font-size: 16px !important;
            padding: 4px 8px !important;
          }
          .leaflet-popup-close-button:hover {
            color: #fff !important;
          }
          /* Custom pulsing user marker */
          .user-marker {
            width: 12px;
            height: 12px;
            background-color: #3b82f6;
            border: 3px solid #ffffff;
            border-radius: 50%;
            box-shadow: 0 0 12px #3b82f6;
            position: relative;
          }
          .user-marker::after {
            content: '';
            position: absolute;
            width: 28px;
            height: 28px;
            border: 2px solid #3b82f6;
            border-radius: 50%;
            top: -11px;
            left: -11px;
            animation: pulse 1.8s infinite ease-out;
            opacity: 0;
          }
          @keyframes pulse {
            0% { transform: scale(0.5); opacity: 1; }
            100% { transform: scale(1.6); opacity: 0; }
          }
          /* Custom emergency marker */
          .service-marker {
            width: 14px;
            height: 14px;
            border-radius: 50%;
            border: 2.5px solid #ffffff;
            box-shadow: 0 0 10px rgba(0,0,0,0.5);
            cursor: pointer;
            transition: all 0.25s cubic-bezier(0.175, 0.885, 0.32, 1.275);
          }
          .service-marker:hover {
            transform: scale(1.35) translateY(-2px);
            border-color: #ffffff;
            box-shadow: 0 5px 15px rgba(0,0,0,0.4);
          }
        </style>
      </head>
      <body>
        <div id="map"></div>
        <script>
          window.onerror = function(message, source, lineno, colno, error) {
            console.error("Iframe Leaflet Map Error: " + message + " at " + source + ":" + lineno + ":" + colno);
            return false;
          };

          function postMessageToParent(data) {
            if (window.ReactNativeWebView && window.ReactNativeWebView.postMessage) {
              window.ReactNativeWebView.postMessage(JSON.stringify(data));
            } else if (window.parent && window.parent.postMessage) {
              window.parent.postMessage(data, '*');
            }
          }

          const map = L.map('map', {
            zoomControl: false,
            attributionControl: false
          }).setView([${userLat}, ${userLon}], 14);

          L.control.zoom({ position: 'bottomright' }).addTo(map);

          const mapboxToken = "${mapboxToken}";
          if (mapboxToken) {
            // Using Mapbox dark style for beautiful premium dark look
            L.tileLayer('https://api.mapbox.com/styles/v1/mapbox/dark-v11/tiles/{z}/{x}/{y}?access_token=' + mapboxToken, {
              maxZoom: 19,
              tileSize: 512,
              zoomOffset: -1,
              attribution: '© Mapbox © OpenStreetMap'
            }).addTo(map);
          } else {
            // Free OpenStreetMap fallback
            L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
              maxZoom: 19,
              attribution: '© OpenStreetMap'
            }).addTo(map);
          }

          // User Marker Icon
          const userIcon = L.divIcon({
            className: 'user-marker-container',
            html: '<div class="user-marker"></div>',
            iconSize: [16, 16],
            iconAnchor: [8, 8]
          });
          const userMarker = L.marker([${userLat}, ${userLon}], { icon: userIcon }).addTo(map);

          // Handle real-time position updates without full reloading
          function handlePositionUpdate(data) {
            if (data && data.type === 'UPDATE_LOCATION') {
              if (userMarker) {
                userMarker.setLatLng([data.latitude, data.longitude]);
              }
              if (data.panTo) {
                map.panTo([data.latitude, data.longitude]);
              }
            }
          }

          window.addEventListener('message', function(event) {
            try {
              const data = typeof event.data === 'string' ? JSON.parse(event.data) : event.data;
              handlePositionUpdate(data);
            } catch (e) {}
          });

          document.addEventListener('message', function(event) {
            try {
              const data = typeof event.data === 'string' ? JSON.parse(event.data) : event.data;
              handlePositionUpdate(data);
            } catch (e) {}
          });

          const colors = ${JSON.stringify(colors)};
          const services = ${JSON.stringify(allFiltered)};
          const markers = [];

          services.forEach(s => {
            const color = colors[s.type] || '#ff4d4d';
            const serviceIcon = L.divIcon({
              className: 'service-marker-container',
              html: '<div class="service-marker" style="background-color: ' + color + '; box-shadow: 0 0 12px ' + color + ';"></div>',
              iconSize: [16, 16],
              iconAnchor: [8, 8]
            });

            const popupContent = 
              '<div style="font-family: sans-serif; font-size: 13px; line-height: 1.5; color: #fff; min-width: 140px;">' +
                '<b style="color: #fff; font-size: 14px; display: block; margin-bottom: 4px;">' + s.name + '</b>' +
                '<span style="color: #aaa; font-weight: 500;">' + s.distance.toFixed(1) + ' km · ' + s.eta + '</span><br/>' +
                '<button onclick="postMessageToParent({ type: \\'SELECT_SERVICE\\', id: \\'' + s.place_id + '\\' })" style="margin-top: 10px; background-image: linear-gradient(135deg, #ff4d4d, #d90429); border: none; color: #fff; padding: 7px 10px; border-radius: 6px; font-weight: bold; cursor: pointer; font-size: 11px; width: 100%; box-shadow: 0 4px 10px rgba(217,4,41,0.3); transition: all 0.2s;">Select & View Route</button>' +
              '</div>';

            const m = L.marker([s.latitude, s.longitude], { icon: serviceIcon })
              .bindPopup(popupContent, { offset: L.point(0, -5) })
              .addTo(map);
            markers.push(m);
          });

          const routeCoords = ${JSON.stringify(routeCoords)};
          if (routeCoords && routeCoords.length > 0) {
            const latlngs = routeCoords.map(c => [c.latitude, c.longitude]);
            
            // Glow layer underneath
            L.polyline(latlngs, {
              color: '#ff4d4d',
              weight: 10,
              opacity: 0.35,
              lineJoin: 'round',
              lineCap: 'round'
            }).addTo(map);

            // Core sharp line
            const routeLine = L.polyline(latlngs, {
              color: '#d90429',
              weight: 4.5,
              opacity: 0.95,
              lineJoin: 'round',
              lineCap: 'round'
            }).addTo(map);

            map.fitBounds(routeLine.getBounds(), { padding: [40, 40] });
          } else if (services.length > 0) {
            // Only include user location in bounds if they are close (< 150 km) to prevent zooming out to a world map view
            const userLatLng = L.latLng(${userLat}, ${userLon});
            const points = [];
            
            services.forEach(s => {
              const serviceLatLng = L.latLng(s.latitude, s.longitude);
              points.push([s.latitude, s.longitude]);
              
              if (userLatLng.distanceTo(serviceLatLng) < 150000) {
                if (!points.some(p => p[0] === ${userLat} && p[1] === ${userLon})) {
                  points.push([${userLat}, ${userLon}]);
                }
              }
            });

            if (points.length > 0) {
              map.fitBounds(points, { padding: [40, 40] });
            } else {
              map.setView([${userLat}, ${userLon}], 14);
            }
          }
        </script>
      </body>
      </html>
    `;
  }, [initialCenter, allFiltered, routeCoords]);

  useEffect(() => {
    if (Platform.OS !== "web") return;
    const handleMapMessage = (event: MessageEvent) => {
      if (event.data) {
        if (event.data.type === "SELECT_SERVICE") {
          const found = allFiltered.find(s => s.place_id === event.data.id);
          if (found) handleSelect(found);
        }
      }
    };
    window.addEventListener("message", handleMapMessage);
    return () => window.removeEventListener("message", handleMapMessage);
  }, [allFiltered]);

  useEffect(() => {
    if (!location || allFiltered.length === 0) return;
    if (Platform.OS !== "web") {
      if (cameraRef.current) {
        const coords = [{ latitude: location.latitude, longitude: location.longitude }, ...allFiltered.map(p => ({ latitude: p.latitude, longitude: p.longitude }))];
        const boundingBox = getBounds(coords);
        if (boundingBox) {
          cameraRef.current.fitBounds(
            boundingBox[0], // ne
            boundingBox[1], // sw
            [80, 40, 200, 40], // padding [top, right, bottom, left]
            800
          );
        }
      } else if (mapRef.current?.fitToCoordinates) {
        const coords = [{ latitude: location.latitude, longitude: location.longitude }, ...allFiltered.map(p => ({ latitude: p.latitude, longitude: p.longitude }))];
        mapRef.current.fitToCoordinates(coords, { edgePadding: { top: 80, right: 40, bottom: 200, left: 40 }, animated: true });
      }
    }
  }, [results]);

  useEffect(() => {
    if (Platform.OS !== "web" || !location || viewMode !== "map") return;

    // Force false to always load beautiful MapLibre map on web
    const hasGoogleKey = false;

    if (!hasGoogleKey) return;

    const addGoogleMapsStyles = () => {
      const styleId = "google-maps-dark-styles";
      if (document.getElementById(styleId)) return;
      const style = document.createElement("style");
      style.id = styleId;
      style.textContent = `
        #web-map {
          filter: invert(90%) hue-rotate(180deg) brightness(95%) contrast(90%);
          background-color: #0b0b0d !important;
        }
        /* Re-invert custom HTML markers, popup text, and controls so they don't look inverted! */
        .user-marker, .service-marker, .gm-style-iw-c, .gm-style-iw-d, .gm-style-iw-t::after, .gm-ui-hover-effect {
          filter: invert(100%) hue-rotate(180deg) !important;
        }
        /* Custom pulsing user marker styling */
        .user-marker {
          width: 16px;
          height: 16px;
          background-color: #3b82f6;
          border: 3px solid #ffffff;
          border-radius: 50%;
          box-shadow: 0 0 12px #3b82f6;
          position: relative;
        }
        .user-marker::after {
          content: '';
          position: absolute;
          width: 32px;
          height: 32px;
          border: 2px solid #3b82f6;
          border-radius: 50%;
          top: -11px;
          left: -11px;
          animation: pulse 1.8s infinite ease-out;
          opacity: 0;
        }
        @keyframes pulse {
          0% { transform: scale(0.5); opacity: 1; }
          100% { transform: scale(1.6); opacity: 0; }
        }
        /* Custom emergency marker styling */
        .service-marker {
          width: 16px;
          height: 16px;
          border-radius: 50%;
          border: 2px solid #ffffff;
          box-shadow: 0 0 10px rgba(0,0,0,0.5);
          cursor: pointer;
          transition: all 0.25s cubic-bezier(0.175, 0.885, 0.32, 1.275);
        }
        .service-marker:hover {
          transform: scale(1.35) translateY(-2px);
          border-color: #ffffff;
          box-shadow: 0 5px 15px rgba(0,0,0,0.4);
        }
        /* Sleek Google Maps InfoWindow styling overrides */
        .gm-style .gm-style-iw-c {
          background-color: #18181f !important;
          color: #fff !important;
          border: 1px solid #ff4d4d33 !important;
          border-radius: 12px !important;
          box-shadow: 0 10px 25px rgba(0,0,0,0.6) !important;
        }
        .gm-style .gm-style-iw-t::after {
          background: #18181f !important;
          box-shadow: -2px 2px 2px 0 rgba(0,0,0,0.3) !important;
        }
        .gm-style .gm-style-iw-d {
          overflow: auto !important;
        }
        .gm-ui-hover-effect {
          color: #888 !important;
        }
        .gm-ui-hover-effect:hover {
          color: #fff !important;
        }
      `;
      document.head.appendChild(style);
    };

    const loadScript = () => {
      addGoogleMapsStyles();
      if ((window as any).google && (window as any).google.maps && (window as any).google.maps.marker) {
        initGoogleMap();
        return;
      }
      const existing = document.getElementById("google-maps-web-script");
      if (existing) {
        existing.addEventListener("load", initGoogleMap);
        return;
      }
      const script = document.createElement("script");
      script.id = "google-maps-web-script";
      script.src = `https://maps.googleapis.com/maps/api/js?key=${mapsKey}&libraries=places,marker`;
      script.async = true;
      script.defer = true;
      script.onload = initGoogleMap;
      document.head.appendChild(script);
    };

    const initGoogleMap = () => {
      const el = document.getElementById("web-map");
      if (!el || !(window as any).google || !(window as any).google.maps.marker) return;

      const userLoc = { lat: location.latitude, lng: location.longitude };

      // Create map instance if it doesn't exist
      if (!mapRefWeb.current || !document.getElementById("web-map")?.hasChildNodes()) {
        mapRefWeb.current = new (window as any).google.maps.Map(el, {
          center: userLoc,
          zoom: 18,
          tilt: 65,
          heading: -20,
          mapId: "DEMO_MAP_ID", // Enables WebGL Vector features, including 3D buildings
          disableDefaultUI: true,
          zoomControl: true,
          zoomControlOptions: {
            position: (window as any).google.maps.ControlPosition.RIGHT_BOTTOM
          }
        });
      }

      const map = mapRefWeb.current;

      // Clear existing markers
      markersRefWeb.current.forEach(m => m.setMap(null));
      markersRefWeb.current = [];

      // User Location Marker (WebGL Advanced Marker)
      const userEl = document.createElement("div");
      userEl.className = "user-marker";

      const userMarker = new (window as any).google.maps.marker.AdvancedMarkerElement({
        position: userLoc,
        map: map,
        content: userEl,
        title: "Your Location"
      });
      markersRefWeb.current.push(userMarker);

      // Service Markers
      const bounds = new (window as any).google.maps.LatLngBounds();
      bounds.extend(userLoc);

      const colors = {
        hospital: "#d90429",
        ambulance: "#2a9d8f",
        police: "#457b9d",
        towing: "#f77f00",
        puncture: "#6c757d"
      };

      allFiltered.forEach(s => {
        const color = (colors as any)[s.type] || "#ff4d4d";
        const markerPos = { lat: s.latitude, lng: s.longitude };
        bounds.extend(markerPos);

        const markerEl = document.createElement("div");
        markerEl.className = "service-marker";
        markerEl.style.backgroundColor = color;
        markerEl.style.boxShadow = '0 0 12px ' + color;

        const marker = new (window as any).google.maps.marker.AdvancedMarkerElement({
          position: markerPos,
          map: map,
          content: markerEl,
          title: s.name
        });

        const infoWindow = new (window as any).google.maps.InfoWindow({
          content: `
            <div style="font-family: sans-serif; font-size: 13px; line-height: 1.5; color: #fff; background-color: #18181f; padding: 4px; border-radius: 4px; min-width: 140px;">
              <b style="color: #fff; font-size: 14px; display: block; margin-bottom: 4px;">${s.name}</b>
              <span style="color: #aaa; display: block; margin-bottom: 8px;">${s.distance.toFixed(1)} km · ${s.eta}</span>
              <button id="btn-select-${s.place_id}" style="background-image: linear-gradient(135deg, #ff4d4d, #d90429); border: none; color: #fff; padding: 6px 10px; border-radius: 6px; font-weight: bold; cursor: pointer; font-size: 11px; width: 100%; box-shadow: 0 4px 10px rgba(217,4,41,0.3);">Select & View Route</button>
            </div>
          `
        });

        marker.addListener("click", () => {
          infoWindow.open(map, marker);
          setTimeout(() => {
            const btn = document.getElementById(`btn-select-${s.place_id}`);
            if (btn) {
              btn.onclick = () => {
                handleSelect(s);
                infoWindow.close();
              };
            }
          }, 100);
        });

        markersRefWeb.current.push(marker);
      });

      // Adjust map bounds
      if (allFiltered.length > 0) {
        map.fitBounds(bounds);
      }

      // Draw routing polyline
      if (polylineRefWeb.current) {
        polylineRefWeb.current.setMap(null);
        polylineRefWeb.current = null;
      }

      if (routeCoords && routeCoords.length > 0) {
        const path = routeCoords.map(c => ({ lat: c.latitude, lng: c.longitude }));
        polylineRefWeb.current = new (window as any).google.maps.Polyline({
          path: path,
          geodesic: true,
          strokeColor: "#d90429",
          strokeOpacity: 0.85,
          strokeWeight: 5,
          map: map
        });

        const routeBounds = new (window as any).google.maps.LatLngBounds();
        path.forEach(p => routeBounds.extend(p));
        map.fitBounds(routeBounds);
      }
    };

    loadScript();
  }, [location, allFiltered, routeCoords, viewMode]);

  return (
    <GestureHandlerRootView style={S.root}>
      <SafeAreaView style={S.container} edges={["top", "left", "right"]}>
        {navigatingTo === null && (
          <View style={S.header}>
            <View style={S.viewToggle}>
              <Pressable style={[S.toggleBtn, viewMode === "map" && S.toggleBtnActive]} onPress={() => setViewMode("map")}>
                <Map size={15} color={viewMode === "map" ? "#fff" : "#aaa"} />
                <Text style={[S.toggleText, viewMode === "map" && S.toggleTextActive]}>Map</Text>
              </Pressable>
              <Pressable style={[S.toggleBtn, viewMode === "list" && S.toggleBtnActive]} onPress={() => setViewMode("list")}>
                <List size={15} color={viewMode === "list" ? "#fff" : "#aaa"} />
                <Text style={[S.toggleText, viewMode === "list" && S.toggleTextActive]}>List</Text>
              </Pressable>
            </View>
            <View style={S.headerRight}>
              <View style={[S.statusBadge, offlineMode ? S.badgeOffline : S.badgeOnline]}>
                {offlineMode ? <CloudOff size={11} color="#fff" /> : <Wifi size={11} color="#fff" />}
                <Text style={S.statusText}>{offlineMode ? "OFFLINE" : "LIVE"}</Text>
              </View>
              <Pressable style={S.refreshBtn} onPress={refresh} disabled={loading}>
                {loading ? <ActivityIndicator size="small" color="#fff" /> : <RefreshCw size={14} color="#fff" />}
              </Pressable>
            </View>
          </View>
        )}

        {navigatingTo === null && (
          <View style={S.filterBar}>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={S.filterScroll}>
              {FILTERS.map(f => (
                <Pressable key={f.key} style={[S.chip, filter === f.key && { backgroundColor: f.color, borderColor: f.color }]} onPress={() => setFilter(f.key)}>
                  <Text style={[S.chipText, filter === f.key && S.chipTextActive]}>
                    {f.label}{f.key === "all" ? ` (${allFiltered.length})` : results[f.key as PlaceResult["type"]] ? ` (${results[f.key as PlaceResult["type"]]!.length})` : ""}
                  </Text>
                </Pressable>
              ))}
            </ScrollView>
          </View>
        )}

        {loading && (
          <View style={S.progressBar}>
            {Object.entries(PROGRESS_LABELS).map(([key, label]) => (
              <View key={key} style={S.progressItem}>
                {progress[key]
                  ? <Text style={S.progressDone}>{"✓ " + label}</Text>
                  : <View style={S.progressPending}><ActivityIndicator size="small" color="#ff4d4d" /><Text style={S.progressPendingText}>{label + "..."}</Text></View>}
              </View>
            ))}
          </View>
        )}

        {viewMode === "map" && (
          <View style={S.mapWrapper}>
            {Platform.OS !== "web" && WebView && location ? (
              <WebView
                ref={webViewRef}
                originWhitelist={["*"]}
                source={{ html: webMapHtml }}
                style={S.map}
                onMessage={(event: any) => {
                  try {
                    const data = JSON.parse(event.nativeEvent.data);
                    if (data && data.type === "SELECT_SERVICE") {
                      const found = allFiltered.find(s => s.place_id === data.id);
                      if (found) handleSelect(found);
                    }
                  } catch (e) {
                    console.warn("Error parsing WebView message:", e);
                  }
                }}
              />
            ) : Platform.OS !== "web" && MapLibreGL && location ? (
              <MapLibreGL.MapView
                style={S.map}
                mapStyle="https://tiles.openfreemap.org/styles/dark"
                logoEnabled={false}
                attributionEnabled={true}
              >
                <MapLibreGL.Camera
                  ref={cameraRef}
                  zoomLevel={13}
                  centerCoordinate={[location.longitude, location.latitude]}
                  pitch={50}
                  heading={-15}
                />

                {/* 3D Buildings on Native */}
                <MapLibreGL.FillExtrusionLayer
                  id="3d-buildings-native"
                  sourceLayerID="building"
                  minZoomLevel={13.5}
                  style={{
                    fillExtrusionColor: "#303042",
                    fillExtrusionHeight: ["get", "render_height"],
                    fillExtrusionBase: ["get", "render_min_height"],
                    fillExtrusionOpacity: 0.75,
                  }}
                />

                {/* User Marker */}
                <MapLibreGL.PointAnnotation
                  id="userLocation"
                  coordinate={[location.longitude, location.latitude]}
                  title="Your Location"
                >
                  <View style={{
                    width: 16,
                    height: 16,
                    backgroundColor: '#3b82f6',
                    borderRadius: 8,
                    borderWidth: 3,
                    borderColor: '#fff',
                    shadowColor: '#3b82f6',
                    shadowOffset: { width: 0, height: 0 },
                    shadowOpacity: 0.8,
                    shadowRadius: 4,
                    elevation: 5
                  }} />
                </MapLibreGL.PointAnnotation>

                {/* Emergency Services Pins */}
                {allFiltered.map(s => (
                  <MapLibreGL.PointAnnotation
                    key={s.place_id}
                    id={s.place_id}
                    coordinate={[s.longitude, s.latitude]}
                    title={s.name}
                    onSelected={() => handleSelect(s)}
                  >
                    <View style={{
                      width: 12,
                      height: 12,
                      backgroundColor: PIN_COLOR[s.type] ?? '#ff4d4d',
                      borderRadius: 6,
                      borderWidth: 2,
                      borderColor: '#fff'
                    }} />
                  </MapLibreGL.PointAnnotation>
                ))}

                {/* Route Polyline */}
                {routeCoords.length > 0 && (
                  <MapLibreGL.ShapeSource
                    id="routeSource"
                    shape={{
                      type: "Feature",
                      geometry: {
                        type: "LineString",
                        coordinates: routeCoords.map(c => [c.longitude, c.latitude])
                      },
                      properties: {}
                    }}
                  >
                    <MapLibreGL.LineLayer
                      id="routeLine"
                      style={{
                        lineColor: "#d90429",
                        lineWidth: 4,
                        lineOpacity: 0.8,
                        lineJoin: "round",
                        lineCap: "round"
                      }}
                    />
                  </MapLibreGL.ShapeSource>
                )}
              </MapLibreGL.MapView>
            ) : Platform.OS !== "web" && MapView && location ? (
              <MapView
                ref={mapRef}
                style={S.map}
                initialRegion={{
                  latitude: location.latitude,
                  longitude: location.longitude,
                  latitudeDelta: 0.05,
                  longitudeDelta: 0.05,
                }}
                showsUserLocation
                showsMyLocationButton
              >
                {UrlTile && MAPBOX_TOKEN ? (
                  <UrlTile
                    urlTemplate={`https://api.mapbox.com/styles/v1/mapbox/dark-v11/tiles/256/{z}/{x}/{y}@2x?access_token=${MAPBOX_TOKEN}`}
                    maximumZ={19}
                    tileSize={256}
                    shouldReplaceMapContent={true}
                  />
                ) : UrlTile ? (
                  <UrlTile
                    urlTemplate="https://basemaps.cartocdn.com/dark_all/{z}/{x}/{y}.png"
                    maximumZ={19}
                    tileSize={256}
                    shouldReplaceMapContent={true}
                  />
                ) : null}
                {allFiltered.map(s => (
                  <Marker
                    key={s.place_id}
                    coordinate={{ latitude: s.latitude, longitude: s.longitude }}
                    title={s.name}
                    description={`${s.distance.toFixed(1)} km · ${s.eta}`}
                    pinColor={PIN_COLOR[s.type] ?? "red"}
                    onPress={() => handleSelect(s)}
                  />
                ))}
                {routeCoords.length > 0 && Polyline && (
                  <Polyline
                    coordinates={routeCoords}
                    strokeColor="#d90429"
                    strokeWidth={4}
                  />
                )}
              </MapView>
            ) : Platform.OS === "web" && location ? (
              <iframe
                ref={iframeRef}
                srcDoc={webMapHtml}
                style={{
                  position: "absolute",
                  top: 0,
                  bottom: 0,
                  left: 0,
                  right: 0,
                  width: "100%",
                  height: "100%",
                  border: "none"
                }}
                title="RoadSOS Live Web Map"
              />
            ) : (
              <View style={S.mapFallback}>
                <MapPin size={48} color="#ff4d4d" />
                <Text style={S.mapFallbackTitle}>Map View</Text>
                <Text style={S.mapFallbackSub}>{location ? `${location.latitude.toFixed(4)}, ${location.longitude.toFixed(4)}` : "Locating..."}</Text>
                <Text style={S.mapFallbackHint}>Switch to List view to browse services</Text>
              </View>
            )}
            {routeLoading && (
              <View style={S.routeLoadingOverlay}>
                <ActivityIndicator size="small" color="#fff" />
                <Text style={S.routeLoadingText}>Drawing route...</Text>
              </View>
            )}

            {/* IN-APP NAVIGATION HUD OVERLAYS */}
            {navigatingTo && (
              <>
                {/* Floating Top Guidance Banner */}
                <View style={HUD.topBanner}>
                  <View style={HUD.topIconWrapper}>
                    {simulatedInstruction.includes("left") ? (
                      <ArrowUpLeft size={22} color="#ff4d4d" />
                    ) : simulatedInstruction.includes("right") ? (
                      <ArrowUpRight size={22} color="#ff4d4d" />
                    ) : (
                      <ArrowUp size={22} color="#ff4d4d" />
                    )}
                  </View>
                  <View style={HUD.topTextContent}>
                    <Text style={HUD.topTitle}>Active Navigation Guidance</Text>
                    <Text style={HUD.topSubtitle}>{simulatedInstruction || "Proceed along the highlighted emergency route."}</Text>
                  </View>
                </View>

                {/* Floating Bottom Navigation Dashboard HUD */}
                <View style={HUD.bottomHud}>
                  <View style={HUD.hudHeader}>
                    <View style={HUD.hudTitleRow}>
                      <Text style={HUD.hudTitle} numberOfLines={1}>{navigatingTo.name}</Text>
                      <View style={[HUD.hudBadge, { backgroundColor: TYPE_BADGE_COLOR[navigatingTo.type] ?? "#444" }]}>
                        <Text style={HUD.hudBadgeText}>{TYPE_LABEL[navigatingTo.type] ?? navigatingTo.type}</Text>
                      </View>
                    </View>
                  </View>

                  <View style={HUD.hudStatsRow}>
                    <View style={HUD.hudStatItem}>
                      <Text style={HUD.hudStatLabel}>Remaining ETA</Text>
                      <Text style={[HUD.hudStatValue, HUD.hudStatValueHighlight]}>
                        {isSimulating ? simulatedEta : navigatingTo.eta}
                      </Text>
                    </View>
                    <View style={HUD.hudStatDivider} />
                    <View style={HUD.hudStatItem}>
                      <Text style={HUD.hudStatLabel}>Distance Left</Text>
                      <Text style={HUD.hudStatValue}>
                        {isSimulating ? simulatedDistance : navigatingTo.distance.toFixed(1) + " km"}
                      </Text>
                    </View>
                    <View style={HUD.hudStatDivider} />
                    <View style={HUD.hudStatItem}>
                      <Text style={HUD.hudStatLabel}>Status</Text>
                      <Text style={HUD.hudStatValue}>{isSimulating ? "45 km/h" : "Paused"}</Text>
                    </View>
                  </View>

                  {/* Simulated Route Progress Bar */}
                  {routeCoords.length > 0 && (
                    <View style={HUD.progressBarContainer}>
                      <View 
                        style={[
                          HUD.progressBar, 
                          { 
                            width: `${Math.min(100, (simulatedStepIndex / (routeCoords.length - 1)) * 100)}%` 
                          }
                        ]} 
                      />
                    </View>
                  )}

                  <View style={HUD.hudActions}>
                    <Pressable style={HUD.hudExitBtn} onPress={handleExitNavigation}>
                      <Square size={14} color="#ff4d4d" />
                      <Text style={HUD.hudExitText}>EXIT NAV</Text>
                    </Pressable>
                    <Pressable 
                      style={[HUD.hudSimBtn, isSimulating && HUD.hudSimBtnActive]} 
                      onPress={() => {
                        if (isSimulating) {
                          setIsSimulating(false);
                        } else {
                          if (simulatedStepIndex >= routeCoords.length - 1) {
                            setSimulatedStepIndex(0);
                            setSimulatedDistance(navigatingTo.distance.toFixed(1) + " km");
                            setSimulatedEta(navigatingTo.eta);
                            setSimulatedInstruction("Proceed along the highlighted emergency route.");
                            setLocation(prev => prev ? {
                              ...prev,
                              latitude: routeCoords[0].latitude,
                              longitude: routeCoords[0].longitude,
                            } : null);
                          }
                          setIsSimulating(true);
                        }
                      }}
                    >
                      {isSimulating ? (
                        <>
                          <Square size={14} color="#fff" />
                          <Text style={HUD.hudSimText}>PAUSE SIM</Text>
                        </>
                      ) : (
                        <>
                          <Play size={14} color="#fff" fill="#fff" />
                          <Text style={HUD.hudSimText}>SIMULATE</Text>
                        </>
                      )}
                    </Pressable>
                  </View>
                </View>
              </>
            )}
          </View>
        )}

        {viewMode === "list" && (
          <View style={S.listWrapper}>
            <View style={S.listHeader}>
              <Text style={S.listTitle}>{t("nearby_services")} — sorted by ETA</Text>
              {loading && <ActivityIndicator size="small" color="#ff4d4d" />}
            </View>
            <ScrollView contentContainerStyle={S.listContent}>
              {loading && allFiltered.length === 0
                ? [0, 1, 2, 3].map(i => <ResultCardSkeleton key={i} />)
                : allFiltered.length > 0
                  ? allFiltered.map((item, idx) => (
                      <ServiceListCard
                        key={item.place_id}
                        result={item}
                        rank={idx + 1}
                        onPress={(res) => { setViewMode("map"); handleSelect(res); }}
                        onNavigate={handleStartNavigation}
                      />
                    ))
                  : !loading && (
                      <View style={S.emptyView}>
                        <ShieldAlert size={40} color="#444" />
                        <Text style={S.emptyText}>No services found nearby.</Text>
                        <Pressable style={S.retryBtn} onPress={refresh}><Text style={S.retryText}>Retry</Text></Pressable>
                      </View>
                    )}
            </ScrollView>
          </View>
        )}

        {viewMode === "map" && navigatingTo === null && (
          <BottomSheet ref={bottomSheetRef} index={-1} snapPoints={snapPoints} enablePanDownToClose onClose={handleDismiss} backgroundStyle={S.sheetBg} handleIndicatorStyle={S.sheetHandle}>
            <BottomSheetScrollView contentContainerStyle={S.sheetContent}>
              {selected
                ? <ServiceDetailCard result={selected} onClose={handleDismiss} routeLoading={routeLoading} onNavigate={handleStartNavigation} />
                : <View style={S.sheetEmpty}><MapPin size={28} color="#444" /><Text style={S.sheetEmptyText}>Tap a pin to see details</Text></View>}
            </BottomSheetScrollView>
          </BottomSheet>
        )}
      </SafeAreaView>
    </GestureHandlerRootView>
  );
}

interface DetailCardProps { result: PlaceResult; onClose: () => void; routeLoading: boolean; onNavigate: (result: PlaceResult) => void; }

function ServiceDetailCard({ result, onClose, routeLoading, onNavigate }: DetailCardProps) {
  const openColor = result.isOpen === true ? "#2a9d8f" : result.isOpen === false ? "#d90429" : "#888";
  const openText = result.isOpen === true ? "Open Now" : result.isOpen === false ? "Closed" : "Hours Unknown";
  return (
    <View style={DS.card}>
      <Pressable style={DS.closeBtn} onPress={onClose}><X size={18} color="#aaa" /></Pressable>
      <View style={DS.nameRow}>
        <Text style={DS.name} numberOfLines={2}>{result.name}</Text>
        <View style={[DS.typeBadge, { backgroundColor: TYPE_BADGE_COLOR[result.type] ?? "#444" }]}>
          <Text style={DS.typeText}>{TYPE_LABEL[result.type] ?? result.type}</Text>
        </View>
      </View>
      {result.is_trauma_center && (
        <View style={DS.traumaRow}><Award size={13} color="#d90429" /><Text style={DS.traumaText}>Level-1 Trauma Centre</Text></View>
      )}
      <View style={DS.addressRow}><MapPin size={13} color="#888" /><Text style={DS.address}>{result.vicinity || "Address unavailable"}</Text></View>
      <View style={DS.metaRow}>
        <View style={DS.metaItem}><MapPin size={14} color="#aaa" /><Text style={DS.metaText}>{result.distance.toFixed(1)} km</Text></View>
        <View style={DS.metaDivider} />
        <View style={DS.metaItem}><Clock size={14} color="#aaa" /><Text style={DS.metaText}>{routeLoading ? "Calculating..." : result.eta}</Text></View>
        <View style={DS.metaDivider} />
        <Text style={[DS.openStatus, { color: openColor }]}>{openText}</Text>
      </View>
      {result.rating > 0 && (
        <View style={DS.ratingRow}>
          {[1,2,3,4,5].map(i => <Star key={i} size={16} color="#ffbe0b" fill={i <= Math.round(result.rating) ? "#ffbe0b" : "transparent"} />)}
          <Text style={DS.ratingText}>{result.rating.toFixed(1)}</Text>
        </View>
      )}
      <View style={DS.routingBadge}>
        <Text style={DS.routingBadgeText}>{result.source === "live" ? "Traffic-optimised route" : "Cached data — distance estimate"}</Text>
      </View>
      <View style={DS.actions}>
        <CallButton
          number={result.phone}
          label={result.name}
          category={result.type}
          size="large"
          disabled={!result.phone}
        />
        <Pressable style={DS.navBtn} onPress={() => onNavigate(result)}>
          <Navigation size={17} color="#fff" /><Text style={DS.btnText}>NAVIGATE</Text>
        </Pressable>
      </View>
    </View>
  );
}

interface ListCardProps { result: PlaceResult; rank: number; onPress: (result: PlaceResult) => void; onNavigate: (result: PlaceResult) => void; }

function ServiceListCard({ result, rank, onPress, onNavigate }: ListCardProps) {
  const openColor = result.isOpen === true ? "#2a9d8f" : result.isOpen === false ? "#d90429" : "#888";
  const openText = result.isOpen === true ? "Open" : result.isOpen === false ? "Closed" : "?";
  const accentColor = TYPE_BADGE_COLOR[result.type] ?? "#444";
  return (
    <View style={[LS.card, { borderLeftColor: accentColor, flexDirection: "column" }]}>
      <Pressable style={{ flexDirection: "row", alignItems: "flex-start", width: "100%" }} onPress={() => onPress(result)}>
        <View style={[LS.rank, { backgroundColor: accentColor }]}><Text style={LS.rankText}>{rank}</Text></View>
        <View style={{ flex: 1, paddingVertical: 12, paddingRight: 12 }}>
          <View style={LS.nameRow}>
            <Text style={LS.name} numberOfLines={1}>{result.name}</Text>
            <View style={[LS.typeBadge, { backgroundColor: accentColor }]}><Text style={LS.typeText}>{TYPE_LABEL[result.type] ?? result.type}</Text></View>
          </View>
          {result.recommendationTag && (
            <View style={{ flexDirection: "row", gap: 4, marginTop: 2, marginBottom: 4 }}>
              {result.recommendationTag === 'fastest_nearest' && (
                <View style={{ backgroundColor: '#ffbe0b', borderRadius: 4, paddingHorizontal: 6, paddingVertical: 2, flexDirection: "row", alignItems: "center", gap: 2 }}>
                  <Clock size={8} color="#000" />
                  <Text style={{ color: '#000', fontSize: 8, fontWeight: '800' }}>FASTEST & NEAREST</Text>
                </View>
              )}
              {result.recommendationTag === 'fastest' && (
                <View style={{ backgroundColor: '#2a9d8f', borderRadius: 4, paddingHorizontal: 6, paddingVertical: 2, flexDirection: "row", alignItems: "center", gap: 2 }}>
                  <Clock size={8} color="#fff" />
                  <Text style={{ color: '#fff', fontSize: 8, fontWeight: '800' }}>FASTEST (Traffic-Optimised)</Text>
                </View>
              )}
              {result.recommendationTag === 'nearest' && (
                <View style={{ backgroundColor: '#457b9d', borderRadius: 4, paddingHorizontal: 6, paddingVertical: 2, flexDirection: "row", alignItems: "center", gap: 2 }}>
                  <MapPin size={8} color="#fff" />
                  <Text style={{ color: '#fff', fontSize: 8, fontWeight: '800' }}>NEAREST</Text>
                </View>
              )}
            </View>
          )}
          <Text style={LS.address} numberOfLines={1}>{result.vicinity}</Text>
          <View style={LS.metaRow}>
            <View style={LS.metaItem}><MapPin size={12} color="#aaa" /><Text style={LS.metaText}>{result.distance.toFixed(1)} km</Text></View>
            <View style={LS.metaDivider} />
            <View style={LS.metaItem}><Clock size={12} color="#aaa" /><Text style={LS.metaText}>{result.eta}</Text></View>
            <View style={LS.metaDivider} />
            <Text style={[LS.openBadge, { color: openColor }]}>{openText}</Text>
          </View>
        </View>
      </Pressable>
      <View style={{ width: "100%", paddingHorizontal: 12, paddingBottom: 12, flexDirection: "row", gap: 6, boxSizing: "border-box" }}>
        <CallButton
          number={result.phone}
          label={result.name}
          category={result.type}
          size="small"
          disabled={!result.phone}
        />
        <Pressable style={LS.navBtn} onPress={() => onNavigate(result)}>
          <Navigation size={13} color="#fff" /><Text style={LS.btnText}>NAVIGATE</Text>
        </Pressable>
      </View>
    </View>
  );
}

const S = StyleSheet.create({
  root: { flex: 1 },
  container: { flex: 1, backgroundColor: "#121214" },
  header: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", paddingHorizontal: 12, paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: "#212225" },
  viewToggle: { flexDirection: "row", backgroundColor: "#1e1e24", borderRadius: 8, padding: 3, gap: 2 },
  toggleBtn: { flexDirection: "row", alignItems: "center", gap: 5, paddingHorizontal: 12, paddingVertical: 6, borderRadius: 6 },
  toggleBtnActive: { backgroundColor: "#ff4d4d" },
  toggleText: { color: "#aaa", fontSize: 13, fontWeight: "600" },
  toggleTextActive: { color: "#fff" },
  headerRight: { flexDirection: "row", alignItems: "center", gap: 8 },
  statusBadge: { flexDirection: "row", alignItems: "center", gap: 4, paddingHorizontal: 8, paddingVertical: 4, borderRadius: 6 },
  badgeOnline: { backgroundColor: "#2a9d8f" },
  badgeOffline: { backgroundColor: "#f77f00" },
  statusText: { color: "#fff", fontSize: 10, fontWeight: "700" },
  refreshBtn: { width: 32, height: 32, borderRadius: 16, backgroundColor: "#1e1e24", justifyContent: "center", alignItems: "center", borderWidth: 1, borderColor: "#2e2e38" },
  filterBar: { paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: "#212225" },
  filterScroll: { paddingHorizontal: 12, gap: 8 },
  chip: { paddingHorizontal: 14, paddingVertical: 7, borderRadius: 20, backgroundColor: "#1e1e24", borderWidth: 1, borderColor: "#2e2e38" },
  chipText: { color: "#aaa", fontSize: 12, fontWeight: "600" },
  chipTextActive: { color: "#fff" },
  progressBar: { flexDirection: "row", flexWrap: "wrap", gap: 8, paddingHorizontal: 12, paddingVertical: 6, backgroundColor: "#1a1a20", borderBottomWidth: 1, borderBottomColor: "#212225" },
  progressItem: { flexDirection: "row", alignItems: "center" },
  progressDone: { color: "#2a9d8f", fontSize: 11, fontWeight: "700" },
  progressPending: { flexDirection: "row", alignItems: "center", gap: 4 },
  progressPendingText: { color: "#888", fontSize: 11 },
  mapWrapper: { flex: 1 },
  map: { ...StyleSheet.absoluteFill },
  mapFallback: { flex: 1, justifyContent: "center", alignItems: "center", gap: 8, backgroundColor: "#1a1a20" },
  mapFallbackTitle: { color: "#fff", fontSize: 18, fontWeight: "bold" },
  mapFallbackSub: { color: "#888", fontSize: 13 },
  mapFallbackHint: { color: "#555", fontSize: 12, marginTop: 4 },
  routeLoadingOverlay: { position: "absolute", bottom: 16, alignSelf: "center", flexDirection: "row", alignItems: "center", gap: 8, backgroundColor: "rgba(0,0,0,0.7)", paddingHorizontal: 14, paddingVertical: 8, borderRadius: 20 },
  routeLoadingText: { color: "#fff", fontSize: 12 },
  listWrapper: { flex: 1 },
  listHeader: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", paddingHorizontal: 12, paddingVertical: 10 },
  listTitle: { color: "#aaa", fontSize: 11, fontWeight: "bold", textTransform: "uppercase", letterSpacing: 1 },
  listContent: { paddingHorizontal: 12, paddingBottom: 24 },
  emptyView: { alignItems: "center", paddingVertical: 48, gap: 12 },
  emptyText: { color: "#666", fontSize: 14 },
  retryBtn: { paddingHorizontal: 24, paddingVertical: 10, backgroundColor: "#1e1e24", borderRadius: 8, borderWidth: 1, borderColor: "#2e2e38" },
  retryText: { color: "#ff4d4d", fontSize: 13, fontWeight: "600" },
  sheetBg: { backgroundColor: "#1a1a20" },
  sheetHandle: { backgroundColor: "#444" },
  sheetContent: { paddingBottom: 32 },
  sheetEmpty: { alignItems: "center", paddingVertical: 32, gap: 10 },
  sheetEmptyText: { color: "#666", fontSize: 13 },
});

const DS = StyleSheet.create({
  card: { padding: 16 },
  closeBtn: { position: "absolute", top: 12, right: 12, padding: 6, zIndex: 10 },
  nameRow: { flexDirection: "row", alignItems: "flex-start", gap: 8, marginBottom: 6, paddingRight: 32 },
  name: { flex: 1, color: "#fff", fontSize: 18, fontWeight: "800", lineHeight: 24 },
  typeBadge: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 6, flexShrink: 0, marginTop: 2 },
  typeText: { color: "#fff", fontSize: 11, fontWeight: "700" },
  traumaRow: { flexDirection: "row", alignItems: "center", gap: 5, marginBottom: 8 },
  traumaText: { color: "#d90429", fontSize: 12, fontWeight: "700" },
  addressRow: { flexDirection: "row", alignItems: "center", gap: 5, marginBottom: 12 },
  address: { flex: 1, color: "#888", fontSize: 13 },
  metaRow: { flexDirection: "row", alignItems: "center", backgroundColor: "#121216", borderRadius: 10, paddingHorizontal: 12, paddingVertical: 10, marginBottom: 12, gap: 8 },
  metaItem: { flexDirection: "row", alignItems: "center", gap: 5 },
  metaText: { color: "#ccc", fontSize: 13, fontWeight: "600" },
  metaDivider: { width: 1, height: 14, backgroundColor: "#2e2e38", marginHorizontal: 2 },
  openStatus: { fontSize: 12, fontWeight: "700", marginLeft: "auto" },
  ratingRow: { flexDirection: "row", alignItems: "center", gap: 3, marginBottom: 12 },
  ratingText: { color: "#ffbe0b", fontSize: 13, fontWeight: "600", marginLeft: 4 },
  routingBadge: { backgroundColor: "rgba(42,157,143,0.12)", borderRadius: 8, padding: 8, marginBottom: 16, borderWidth: 1, borderColor: "rgba(42,157,143,0.25)" },
  routingBadgeText: { color: "#2a9d8f", fontSize: 11, fontWeight: "700" },
  actions: { flexDirection: "row", gap: 10 },
  navBtn: { flex: 1, flexDirection: "row", justifyContent: "center", alignItems: "center", gap: 8, backgroundColor: "#457b9d", paddingVertical: 13, borderRadius: 10 },
  btnText: { color: "#fff", fontSize: 14, fontWeight: "800" },
});

const LS = StyleSheet.create({
  card: { flexDirection: "row", alignItems: "flex-start", backgroundColor: "#1e1e24", borderRadius: 14, marginBottom: 10, overflow: "hidden", borderWidth: 1, borderColor: "#2e2e38", borderLeftWidth: 4, shadowColor: "#000", shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.15, shadowRadius: 4, elevation: 3 },
  rank: { width: 32, height: 32, borderRadius: 16, justifyContent: "center", alignItems: "center", margin: 12, flexShrink: 0 },
  rankText: { color: "#fff", fontSize: 13, fontWeight: "800" },
  body: { flex: 1, paddingVertical: 12, paddingRight: 12 },
  nameRow: { flexDirection: "row", alignItems: "center", gap: 6, marginBottom: 3 },
  name: { flex: 1, color: "#fff", fontSize: 14, fontWeight: "700" },
  typeBadge: { paddingHorizontal: 6, paddingVertical: 2, borderRadius: 4, flexShrink: 0 },
  typeText: { color: "#fff", fontSize: 9, fontWeight: "800" },
  address: { color: "#888", fontSize: 11, marginBottom: 8 },
  metaRow: { flexDirection: "row", alignItems: "center", backgroundColor: "#121216", borderRadius: 6, paddingHorizontal: 8, paddingVertical: 5, marginBottom: 8, gap: 5 },
  metaItem: { flexDirection: "row", alignItems: "center", gap: 3 },
  metaText: { color: "#ccc", fontSize: 11, fontWeight: "600" },
  metaDivider: { width: 1, height: 10, backgroundColor: "#2e2e38", marginHorizontal: 2 },
  openBadge: { fontSize: 10, fontWeight: "700", marginLeft: "auto" },
  actions: { flexDirection: "row", gap: 6 },
  navBtn: { flex: 1, flexDirection: "row", justifyContent: "center", alignItems: "center", gap: 4, backgroundColor: "#457b9d", paddingVertical: 7, borderRadius: 7 },
  btnText: { color: "#fff", fontSize: 11, fontWeight: "800" },
});

const HUD = StyleSheet.create({
  topBanner: {
    position: "absolute",
    top: 16,
    left: 12,
    right: 12,
    backgroundColor: "rgba(24, 24, 31, 0.93)",
    borderRadius: 14,
    borderWidth: 1,
    borderColor: "rgba(217, 4, 41, 0.25)",
    borderLeftWidth: 5,
    padding: 14,
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.35,
    shadowRadius: 8,
    elevation: 8,
    zIndex: 100,
  },
  topIconWrapper: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: "rgba(217, 4, 41, 0.15)",
    justifyContent: "center",
    alignItems: "center",
  },
  topTextContent: {
    flex: 1,
  },
  topTitle: {
    color: "#fff",
    fontSize: 14,
    fontWeight: "800",
    marginBottom: 2,
  },
  topSubtitle: {
    color: "#aaa",
    fontSize: 12,
    fontWeight: "500",
  },
  bottomHud: {
    position: "absolute",
    bottom: 16,
    left: 12,
    right: 12,
    backgroundColor: "#18181f",
    borderRadius: 16,
    borderWidth: 1,
    borderColor: "#2e2e38",
    padding: 16,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: -4 },
    shadowOpacity: 0.35,
    shadowRadius: 8,
    elevation: 8,
    zIndex: 100,
  },
  hudHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 12,
  },
  hudTitleRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  hudTitle: {
    color: "#fff",
    fontSize: 15,
    fontWeight: "800",
    maxWidth: "75%",
  },
  hudBadge: {
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 6,
  },
  hudBadgeText: {
    color: "#fff",
    fontSize: 10,
    fontWeight: "800",
  },
  hudStatsRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    backgroundColor: "#121216",
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    marginBottom: 12,
  },
  hudStatItem: {
    alignItems: "center",
    flex: 1,
  },
  hudStatLabel: {
    color: "#666",
    fontSize: 10,
    fontWeight: "700",
    textTransform: "uppercase",
    marginBottom: 2,
  },
  hudStatValue: {
    color: "#fff",
    fontSize: 16,
    fontWeight: "800",
  },
  hudStatValueHighlight: {
    color: "#ff4d4d",
  },
  hudStatDivider: {
    width: 1,
    height: 24,
    backgroundColor: "#2e2e38",
  },
  progressBarContainer: {
    height: 4,
    backgroundColor: "#2e2e38",
    borderRadius: 2,
    marginBottom: 16,
    overflow: "hidden",
  },
  progressBar: {
    height: "100%",
    backgroundColor: "#ff4d4d",
  },
  hudActions: {
    flexDirection: "row",
    gap: 8,
  },
  hudExitBtn: {
    flex: 1,
    flexDirection: "row",
    justifyContent: "center",
    alignItems: "center",
    gap: 6,
    backgroundColor: "#212225",
    paddingVertical: 12,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: "#2e2e38",
  },
  hudExitText: {
    color: "#ff4d4d",
    fontSize: 13,
    fontWeight: "700",
  },
  hudSimBtn: {
    flex: 1,
    flexDirection: "row",
    justifyContent: "center",
    alignItems: "center",
    gap: 6,
    backgroundColor: "#ff4d4d",
    paddingVertical: 12,
    borderRadius: 10,
    shadowColor: "#ff4d4d",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 6,
    elevation: 4,
  },
  hudSimBtnActive: {
    backgroundColor: "#2a9d8f",
    shadowColor: "#2a9d8f",
  },
  hudSimText: {
    color: "#fff",
    fontSize: 13,
    fontWeight: "700",
  },
});
