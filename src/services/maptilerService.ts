/**
 * maptilerService.ts
 * Offline tile download and management using Maptiler + expo-file-system.
 * Downloads tiles for zoom levels 10-16 around the user location.
 */

import * as FileSystem from "expo-file-system";

const MAPTILER_KEY = process.env.EXPO_PUBLIC_MAPTILER_KEY || "";
const TILE_DIR = (FileSystem as any).documentDirectory + "maptiles/";
const ZOOM_LEVELS = [10, 11, 12, 13, 14, 15, 16];
const REGION_DELTA = 0.2; // ~22km radius

export interface TileProgress {
  downloaded: number;
  total: number;
  percent: number;
}

/** Convert lat/lng to tile x/y at a given zoom level */
const latLngToTile = (lat: number, lng: number, zoom: number): { x: number; y: number } => {
  const x = Math.floor(((lng + 180) / 360) * Math.pow(2, zoom));
  const y = Math.floor(
    ((1 - Math.log(Math.tan((lat * Math.PI) / 180) + 1 / Math.cos((lat * Math.PI) / 180)) / Math.PI) / 2) *
      Math.pow(2, zoom)
  );
  return { x, y };
};

/** Get all tile coords for a region at a zoom level */
const getTilesForRegion = (
  lat: number,
  lng: number,
  zoom: number,
  delta: number
): { x: number; y: number; z: number }[] => {
  const min = latLngToTile(lat - delta, lng - delta, zoom);
  const max = latLngToTile(lat + delta, lng + delta, zoom);
  const tiles: { x: number; y: number; z: number }[] = [];
  for (let x = min.x; x <= max.x; x++) {
    for (let y = max.y; y <= min.y; y++) {
      tiles.push({ x, y, z: zoom });
    }
  }
  return tiles;
};

/** Get the local file path for a tile */
const tilePath = (z: number, x: number, y: number): string =>
  `${TILE_DIR}${z}_${x}_${y}.png`;

/** Get the Maptiler URL for a tile */
const tileUrl = (z: number, x: number, y: number): string =>
  `https://api.maptiler.com/maps/streets-v2/${z}/${x}/${y}.png?key=${MAPTILER_KEY}`;

/**
 * Download offline tiles for the user region.
 * Skips already-downloaded tiles.
 * Calls onProgress with { downloaded, total, percent }.
 */
export const downloadTilesForRegion = async (
  lat: number,
  lng: number,
  onProgress?: (p: TileProgress) => void
): Promise<void> => {
  if (!MAPTILER_KEY) {
    console.warn("Maptiler key not set — skipping tile download");
    return;
  }

  await FileSystem.makeDirectoryAsync(TILE_DIR, { intermediates: true });

  // Collect all tiles across all zoom levels
  const allTiles = ZOOM_LEVELS.flatMap(z => getTilesForRegion(lat, lng, z, REGION_DELTA));
  const total = allTiles.length;
  let downloaded = 0;

  for (const { x, y, z } of allTiles) {
    const path = tilePath(z, x, y);
    const info = await FileSystem.getInfoAsync(path);

    if (!info.exists) {
      try {
        await FileSystem.downloadAsync(tileUrl(z, x, y), path);
      } catch {
        // Skip failed tiles silently — partial coverage is fine
      }
    }

    downloaded++;
    onProgress?.({
      downloaded,
      total,
      percent: Math.round((downloaded / total) * 100),
    });
  }
};

/** Check how many tiles are already cached */
export const getCachedTileCount = async (): Promise<number> => {
  try {
    const info = await FileSystem.getInfoAsync(TILE_DIR);
    if (!info.exists) return 0;
    const files = await FileSystem.readDirectoryAsync(TILE_DIR);
    return files.length;
  } catch {
    return 0;
  }
};

/** Get local tile URI for offline map rendering (returns null if not cached) */
export const getLocalTileUri = async (
  z: number,
  x: number,
  y: number
): Promise<string | null> => {
  const path = tilePath(z, x, y);
  const info = await FileSystem.getInfoAsync(path);
  return info.exists ? path : null;
};

/** Delete all cached tiles (for storage management) */
export const clearTileCache = async (): Promise<void> => {
  try {
    await FileSystem.deleteAsync(TILE_DIR, { idempotent: true });
  } catch { /* ignore */ }
};
