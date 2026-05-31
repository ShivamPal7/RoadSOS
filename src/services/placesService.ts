/**
 * placesService.ts
 * Google Places Nearby Search + Directions API integration.
 * Falls back to SQLite cache on network failure.
 */

import { EmergencyService, getDistance, initDb, queryOfflineServices } from '@/database/offlineDb';
import { Platform } from 'react-native';

const MAPS_KEY = process.env.EXPO_PUBLIC_GOOGLE_MAPS_API_KEY || '';
const GEOAPIFY_KEY = process.env.EXPO_PUBLIC_GEOAPIFY_API_KEY || '64f5846047394012b895ee47e316826f';

export interface PlaceResult {
  place_id: string;
  name: string;
  vicinity: string;           // address
  distance: number;           // km, computed via Haversine
  eta: string;                // e.g. "~6 mins" — from Directions API or estimate
  etaSeconds: number;         // raw seconds for sorting
  isOpen: boolean | null;     // null = unknown
  phone: string;              // from SQLite fallback or empty
  latitude: number;
  longitude: number;
  rating: number;
  is_trauma_center: boolean;
  type: 'hospital' | 'police' | 'ambulance' | 'towing' | 'puncture';
  source: 'live' | 'cache';
  recommendationTag?: 'fastest' | 'nearest' | 'fastest_nearest';
}

// ─── Geoapify Category config ──────────────────────────────────────────────────
interface CategoryConfig {
  type: PlaceResult['type'];
  geoapifyCategory: string;
}

const CATEGORIES: CategoryConfig[] = [
  { type: 'hospital',  geoapifyCategory: 'healthcare.hospital' },
  { type: 'police',    geoapifyCategory: 'service.police' },
  { type: 'ambulance', geoapifyCategory: 'healthcare.hospital,healthcare.clinic_or_praxis,emergency.ambulance_station' },
  { type: 'towing',    geoapifyCategory: 'service.vehicle.repair' },
];

// ─── Helpers ──────────────────────────────────────────────────────────────────

/** Estimate ETA from distance when Directions API is unavailable */
const estimateEta = (distanceKm: number): string => {
  const mins = Math.round(distanceKm * 2.2 + 2);
  return `~${mins} min`;
};

/** Fetch ETA for top N results via Directions API (parallel) */
const fetchEtas = async (
  userLat: number,
  userLon: number,
  places: Array<{ latitude: number; longitude: number; distance: number }>
): Promise<Array<{ text: string; seconds: number }>> => {
  if (!MAPS_KEY) return places.map(p => ({
    text: estimateEta(p.distance),
    seconds: Math.round(p.distance * 2.2 * 60 + 120),
  }));

  const requests = places.map(p =>
    fetch(
      `https://maps.googleapis.com/maps/api/directions/json` +
      `?origin=${userLat},${userLon}` +
      `&destination=${p.latitude},${p.longitude}` +
      `&mode=driving&departure_time=now&key=${MAPS_KEY}`
    )
      .then(r => r.json())
      .then(data => {
        const leg = data?.routes?.[0]?.legs?.[0];
        const text = leg?.duration_in_traffic?.text || leg?.duration?.text || null;
        const secs = leg?.duration_in_traffic?.value || leg?.duration?.value || 0;
        return {
          text: text ? `~${text}` : estimateEta(p.distance),
          seconds: secs || Math.round(p.distance * 2.2 * 60 + 120),
        };
      })
      .catch(() => ({
        text: estimateEta(p.distance),
        seconds: Math.round(p.distance * 2.2 * 60 + 120),
      }))
  );

  return Promise.all(requests);
};

/** Fetch one category from Geoapify Places API */
const fetchCategory = async (
  userLat: number,
  userLon: number,
  config: CategoryConfig
): Promise<PlaceResult[]> => {
  const radiusMeters = 50000; // 50km search radius
  const url =
    `https://api.geoapify.com/v2/places` +
    `?categories=${config.geoapifyCategory}` +
    `&filter=circle:${userLon},${userLat},${radiusMeters}` +
    `&bias=proximity:${userLon},${userLat}` +
    `&limit=10` +
    `&apiKey=${GEOAPIFY_KEY}`;

  const response = await fetch(url);
  const data = await response.json();

  if (response.status !== 200) {
    throw new Error(`Geoapify error: ${data.message || response.statusText}`);
  }

  const rawFeatures: any[] = data.features || [];

  // Map GeoJSON format to our standard PlaceResult
  const withDistance = rawFeatures.map(f => {
    const p = f.properties;
    const lat = p.lat;
    const lon = p.lon;
    return {
      place_id: p.place_id,
      name: p.name || p.formatted.split(',')[0] || (config.type.charAt(0).toUpperCase() + config.type.slice(1)),
      vicinity: p.formatted || '',
      latitude: lat,
      longitude: lon,
      distance: getDistance(userLat, userLon, lat, lon),
      isOpen: null,
      phone: p.contact?.phone || p.phone || '',
      rating: p.rating ?? 0,
      is_trauma_center: (p.name || '').toLowerCase().includes('trauma'),
      type: config.type,
      source: 'live' as const,
    };
  });

  // Sort by distance (bias helps rank it, but this guarantees strict sorted order)
  const sorted = withDistance.sort((a, b) => a.distance - b.distance).slice(0, 8);

  // Fetch ETAs for top 5 if hospital (to determine traffic-aware recommendation), else top 3
  const countToFetch = config.type === 'hospital' ? 5 : 3;
  const topN = sorted.slice(0, countToFetch);
  const etas = await fetchEtas(userLat, userLon, topN);

  return sorted.map((p, idx) => ({
    ...p,
    eta: idx < countToFetch ? etas[idx].text : estimateEta(p.distance),
    etaSeconds: idx < countToFetch ? etas[idx].seconds : Math.round(p.distance * 2.2 * 60 + 120),
  }));
};

/** Write live results back to SQLite for offline use */
const cacheResults = (results: PlaceResult[]) => {
  if (Platform.OS === 'web') return;
  try {
    const db = initDb();
    db.withTransactionSync(() => {
      const stmt = db.prepareSync(`
        INSERT OR REPLACE INTO emergency_services
          (name, type, latitude, longitude, phone, address, rating, is_trauma_center, extra_info, cached_at)
        VALUES ($name, $type, $lat, $lon, $phone, $addr, $rating, $trauma, $extra, $cached_at)
      `);
      try {
        for (const r of results) {
          stmt.executeSync({
            $name: r.name,
            $type: r.type,
            $lat: r.latitude,
            $lon: r.longitude,
            $phone: r.phone || '',
            $addr: r.vicinity,
            $rating: r.rating,
            $trauma: r.is_trauma_center ? 1 : 0,
            $extra: `ETA: ${r.eta}`,
            $cached_at: Date.now(),
          });
        }
      } finally {
        stmt.finalizeSync();
      }
    });
  } catch (e) {
    console.warn('Cache write failed:', e);
  }
};

/** Read from SQLite for a given type */
const readCached = (
  userLat: number,
  userLon: number,
  type: PlaceResult['type']
): PlaceResult[] => {
  if (Platform.OS === 'web') {
    const rows = queryOfflineServices(userLat, userLon, type);
    return rows.map(r => ({
      place_id: `cache_${type}_${r.id}`,
      name: r.name,
      vicinity: r.address,
      distance: r.distance,
      eta: estimateEta(r.distance),
      etaSeconds: Math.round(r.distance * 2.2 * 60 + 120),
      isOpen: null,
      phone: r.phone,
      latitude: r.latitude,
      longitude: r.longitude,
      rating: r.rating,
      is_trauma_center: r.is_trauma_center,
      type,
      source: 'cache' as const,
    }));
  }
  try {
    const db = initDb();
    const rows = db.getAllSync<EmergencyService>(
      'SELECT * FROM emergency_services WHERE type = $type',
      { $type: type }
    );
    return rows
      .map(r => ({
        place_id: `cache_${r.id}`,
        name: r.name,
        vicinity: r.address,
        distance: getDistance(userLat, userLon, r.latitude, r.longitude),
        eta: estimateEta(getDistance(userLat, userLon, r.latitude, r.longitude)),
        etaSeconds: Math.round(getDistance(userLat, userLon, r.latitude, r.longitude) * 2.2 * 60 + 120),
        isOpen: null,
        phone: r.phone,
        latitude: r.latitude,
        longitude: r.longitude,
        rating: r.rating,
        is_trauma_center: Boolean(r.is_trauma_center),
        type,
        source: 'cache' as const,
      }))
      .sort((a, b) => a.distance - b.distance)
      .slice(0, 8);
  } catch {
    return [];
  }
};

// ─── Public API ───────────────────────────────────────────────────────────────

export interface EmergencyResults {
  hospital: PlaceResult[];
  police: PlaceResult[];
  ambulance: PlaceResult[];
  towing: PlaceResult[];
  puncture?: PlaceResult[];
}

/**
 * Fetch all 4 categories in parallel.
 * Each category resolves independently — partial results are returned as they arrive.
 * Falls back to SQLite cache if the API key is missing or a call fails.
 */
export const fetchAllEmergencyServices = async (
  userLat: number,
  userLon: number,
  isOnline: boolean,
  onCategoryLoaded?: (type: PlaceResult['type'], results: PlaceResult[]) => void
): Promise<EmergencyResults> => {
  const results: EmergencyResults = {
    hospital: [],
    police: [],
    ambulance: [],
    towing: [],
  };

  if (!isOnline || !GEOAPIFY_KEY || Platform.OS === 'web') {
    // Full offline — read all from SQLite
    for (const cat of CATEGORIES) {
      const cached = readCached(userLat, userLon, cat.type);
      results[cat.type] = cached;
      onCategoryLoaded?.(cat.type, cached);
    }
    return results;
  }

  // Online — fire all 4 in parallel, resolve each independently
  const promises = CATEGORIES.map(async cat => {
    try {
      const live = await fetchCategory(userLat, userLon, cat);
      results[cat.type] = live;
      onCategoryLoaded?.(cat.type, live);
      // Write back to SQLite for offline use
      cacheResults(live);
    } catch (err) {
      console.warn(`Places API failed for ${cat.type}, using cache:`, err);
      const cached = readCached(userLat, userLon, cat.type);
      results[cat.type] = cached;
      onCategoryLoaded?.(cat.type, cached);
    }
  });

  await Promise.all(promises);
  return results;
};
