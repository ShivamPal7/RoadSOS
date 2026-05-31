/**
 * routingService.ts
 * Google Directions API — fetches a driving route and decodes the polyline.
 * Returns coordinates for drawing on the map + traffic-aware ETA.
 */

import polyline from '@mapbox/polyline';

const MAPS_KEY = process.env.EXPO_PUBLIC_GOOGLE_MAPS_API_KEY || '';
const ORS_KEY = process.env.EXPO_PUBLIC_OPENROUTESERVICE_API_KEY || 'eyJvcmciOiI1YjNjZTM1OTc4NTExMTAwMDFjZjYyNDgiLCJpZCI6ImE5M2MzMmEyOTJlYzRjYzI5OGU1MjM2MjA2NjJlOWYwIiwiaCI6Im11cm11cjY0In0=';

export interface RouteStep {
  distance: number;
  duration: number;
  instruction: string;
  wayPoints: number[];
}

export interface RouteResult {
  coordinates: { latitude: number; longitude: number }[];
  etaText: string;       // e.g. "~8 mins"
  etaSeconds: number;    // raw seconds for sorting
  distanceText: string;  // e.g. "3.2 km"
  steps?: RouteStep[];
}

/**
 * Fetch a driving route between two points.
 * Uses departure_time=now for traffic-aware duration.
 * Returns decoded polyline coordinates + ETA.
 */
export const fetchRoute = async (
  originLat: number,
  originLon: number,
  destLat: number,
  destLon: number
): Promise<RouteResult | null> => {
  // 1. Try OpenRouteService API first if a key is available (gives turn-by-turn steps!)
  if (ORS_KEY && ORS_KEY !== 'YOUR_ORS_KEY_HERE') {
    try {
      const url = `https://api.openrouteservice.org/v2/directions/driving-car?api_key=${ORS_KEY}&start=${originLon},${originLat}&end=${destLon},${destLat}`;
      const response = await fetch(url);
      const data = await response.json();

      if (response.status === 200 && (data.routes?.length || data.features?.length)) {
        if (data.features?.length) {
          const feature = data.features[0];
          const coordinates = feature.geometry.coordinates.map(([lon, lat]: [number, number]) => ({
            latitude: lat,
            longitude: lon,
          }));

          const properties = feature.properties;
          const summary = properties.summary || { distance: 0, duration: 0 };
          const distanceKm = summary.distance / 1000;
          const durationSec = Math.round(summary.duration);

          const steps = properties.segments?.[0]?.steps?.map((s: any) => ({
            distance: s.distance,
            duration: s.duration,
            instruction: s.instruction,
            wayPoints: s.way_points,
          })) || [];

          return {
            coordinates,
            etaText: `~${Math.round(durationSec / 60)} min`,
            etaSeconds: durationSec,
            distanceText: `${distanceKm.toFixed(1)} km`,
            steps,
          };
        } else {
          const route = data.routes[0];
          
          // Decode geometry (encoded polyline)
          const decoded = polyline.decode(route.geometry);
          const coordinates = decoded.map(([lat, lng]: [number, number]) => ({
            latitude: lat,
            longitude: lng,
          }));

          const summary = route.summary;
          const distanceKm = summary.distance / 1000;
          const durationSec = Math.round(summary.duration);

          // Parse turn-by-turn steps
          const steps = route.segments?.[0]?.steps?.map((s: any) => ({
            distance: s.distance,
            duration: s.duration,
            instruction: s.instruction,
            wayPoints: s.way_points,
          })) || [];

          return {
            coordinates,
            etaText: `~${Math.round(durationSec / 60)} min`,
            etaSeconds: durationSec,
            distanceText: `${distanceKm.toFixed(1)} km`,
            steps,
          };
        }
      } else {
        console.warn('OpenRouteService API returned error:', data.error || data);
      }
    } catch (err) {
      console.warn('OpenRouteService API failed, trying Google fallback:', err);
    }
  }

  // 2. Fallback to Google Directions API if available
  if (MAPS_KEY && MAPS_KEY !== 'YOUR_GOOGLE_MAPS_API_KEY_HERE') {
    try {
      const url =
        `https://maps.googleapis.com/maps/api/directions/json` +
        `?origin=${originLat},${originLon}` +
        `&destination=${destLat},${destLon}` +
        `&mode=driving` +
        `&departure_time=now` +
        `&key=${MAPS_KEY}`;

      const response = await fetch(url);
      const data = await response.json();

      if (data.status === 'OK' && data.routes?.length) {
        const route = data.routes[0];
        const leg   = route.legs[0];

        // Decode the overview polyline into lat/lng pairs
        const decoded = polyline.decode(route.overview_polyline.points);
        const coordinates = decoded.map(([lat, lng]: [number, number]) => ({
          latitude: lat,
          longitude: lng,
        }));

        // Prefer traffic-aware duration
        const durationSec =
          leg.duration_in_traffic?.value ??
          leg.duration?.value ??
          0;

        const durationText =
          leg.duration_in_traffic?.text ??
          leg.duration?.text ??
          '';

        return {
          coordinates,
          etaText: durationText ? `~${durationText}` : `~${Math.round(durationSec / 60)} min`,
          etaSeconds: durationSec,
          distanceText: leg.distance?.text ?? '',
        };
      } else {
        console.warn('Google Directions API returned status:', data.status);
      }
    } catch (err) {
      console.warn('Google Directions API failed, trying OSRM fallback:', err);
    }
  }

  // 3. Fallback to OSRM (100% Free, No API Key, reliable routing)
  try {
    const url = `https://router.project-osrm.org/route/v1/driving/${originLon},${originLat};${destLon},${destLat}?overview=full&geometries=polyline`;
    const response = await fetch(url);
    const data = await response.json();

    if (data.code === 'Ok' && data.routes?.length) {
      const route = data.routes[0];
      const decoded = polyline.decode(route.geometry);
      const coordinates = decoded.map(([lat, lng]: [number, number]) => ({
        latitude: lat,
        longitude: lng,
      }));

      const durationSec = Math.round(route.duration);
      const distanceMeters = route.distance;
      const distanceKm = distanceMeters / 1000;

      return {
        coordinates,
        etaText: `~${Math.round(durationSec / 60)} min`,
        etaSeconds: durationSec,
        distanceText: `${distanceKm.toFixed(1)} km`,
      };
    }
  } catch (err) {
    console.warn('OSRM routing fallback failed:', err);
  }

  return null;
};

/**
 * Sort an array of items by their etaSeconds (ascending).
 * Items without etaSeconds fall to the end.
 */
export const sortByEta = <T extends { etaSeconds?: number; distance: number }>(
  items: T[]
): T[] =>
  [...items].sort((a, b) => {
    const aVal = a.etaSeconds ?? a.distance * 120; // fallback: 2 min/km estimate
    const bVal = b.etaSeconds ?? b.distance * 120;
    return aVal - bVal;
  });

export interface HospitalRecommendation {
  place_id: string;
  distance: number;
  etaSeconds?: number;
  recommendationTag?: 'fastest' | 'nearest' | 'fastest_nearest';
}

/**
 * Processes a list of hospitals, tags the fastest and nearest, and re-orders them:
 * 1. Fastest (traffic-optimized) comes first.
 * 2. Nearest (geographically closest) comes second (if it's not also the fastest).
 * 3. Then the rest of the hospitals.
 */
export const getRecommendedHospitals = <T extends HospitalRecommendation>(
  hospitals: T[]
): T[] => {
  if (hospitals.length === 0) return [];

  // Find nearest (since list is pre-sorted by distance, first item is closest)
  const nearest = hospitals[0];

  // Find fastest (minimum etaSeconds)
  let fastest = hospitals[0];
  for (const h of hospitals) {
    const hSec = h.etaSeconds ?? h.distance * 120; // fallback: 2 min/km
    const fSec = fastest.etaSeconds ?? fastest.distance * 120;
    if (hSec < fSec) {
      fastest = h;
    }
  }

  // Add tags
  const mapped = hospitals.map(h => {
    const isNearest = h.place_id === nearest.place_id;
    const isFastest = h.place_id === fastest.place_id;

    let tag: 'fastest' | 'nearest' | 'fastest_nearest' | undefined = undefined;
    if (isNearest && isFastest) {
      tag = 'fastest_nearest';
    } else if (isFastest) {
      tag = 'fastest';
    } else if (isNearest) {
      tag = 'nearest';
    }

    return {
      ...h,
      recommendationTag: tag,
    };
  });

  // Re-order: Fastest first, Nearest second, rest follow
  const sorted: T[] = [];
  if (fastest.place_id === nearest.place_id) {
    const combined = mapped.find(h => h.place_id === fastest.place_id)!;
    sorted.push(combined);
    sorted.push(...mapped.filter(h => h.place_id !== fastest.place_id));
  } else {
    const fastestItem = mapped.find(h => h.place_id === fastest.place_id)!;
    const nearestItem = mapped.find(h => h.place_id === nearest.place_id)!;
    sorted.push(fastestItem);
    sorted.push(nearestItem);
    sorted.push(...mapped.filter(h => h.place_id !== fastest.place_id && h.place_id !== nearest.place_id));
  }

  return sorted;
};
