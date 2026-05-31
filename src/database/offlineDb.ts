import * as SQLite from 'expo-sqlite';
import { Platform } from 'react-native';

export interface EmergencyService {
  id: number;
  name: string;
  type: 'hospital' | 'police' | 'ambulance' | 'towing' | 'puncture';
  latitude: number;
  longitude: number;
  phone: string;
  address: string;
  rating: number;
  is_trauma_center: boolean;
  extra_info: string;
}

let db: SQLite.SQLiteDatabase | null = null;

export const initDb = (): SQLite.SQLiteDatabase => {
  if (Platform.OS === 'web') {
    return {} as any;
  }
  if (db) return db;

  try {
    db = SQLite.openDatabaseSync('roadsos.db');
    
    // Create tables
    db.execSync(`
      CREATE TABLE IF NOT EXISTS emergency_services (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT NOT NULL UNIQUE,
        type TEXT NOT NULL,
        latitude REAL NOT NULL,
        longitude REAL NOT NULL,
        phone TEXT NOT NULL,
        address TEXT NOT NULL,
        rating REAL DEFAULT 4.0,
        is_trauma_center INTEGER DEFAULT 0,
        extra_info TEXT,
        city TEXT DEFAULT 'unknown',
        cached_at INTEGER DEFAULT 0
      );
    `);

    // Check if seeded
    const countResult = db.getFirstSync<{ count: number }>('SELECT COUNT(*) as count FROM emergency_services;');
    if (countResult && countResult.count === 0) {
      seedDatabase(db);
    }

    return db;
  } catch (error) {
    console.error('Failed to initialize database:', error);
    throw error;
  }
};

export const MOCK_SERVICES = [
    // --- Pune Area ---
    {
      name: 'Pune Trauma & General Hospital',
      type: 'hospital',
      latitude: 18.5254,
      longitude: 73.8587,
      phone: '+91 20 2612 0000',
      address: 'Shivajinagar, Pune, Maharashtra 411005',
      rating: 4.8,
      is_trauma_center: 1,
      extra_info: '24/7 ICU & Burn Ward available. 5 Operating Rooms.'
    },
    {
      name: 'Sahyadri Super Speciality Hospital',
      type: 'hospital',
      latitude: 18.5152,
      longitude: 73.8342,
      phone: '+91 20 6721 3000',
      address: 'Deccan Gymkhana, Pune, Maharashtra 411004',
      rating: 4.6,
      is_trauma_center: 1,
      extra_info: 'Cardiac & Neuro Emergencies special care.'
    },
    {
      name: 'Quick Response Ambulance Services',
      type: 'ambulance',
      latitude: 18.5299,
      longitude: 73.8644,
      phone: '108',
      address: 'Camps Area, Pune, Maharashtra',
      rating: 4.5,
      is_trauma_center: 0,
      extra_info: 'Advanced Life Support (ALS) & Ventilator equipped.'
    },
    {
      name: 'Shivajinagar Police Station',
      type: 'police',
      latitude: 18.5312,
      longitude: 73.8441,
      phone: '+91 20 2553 1234',
      address: 'University Road, Shivajinagar, Pune, 411005',
      rating: 4.2,
      is_trauma_center: 0,
      extra_info: 'Highway Patrol dispatch office.'
    },
    {
      name: 'National Highway Roadside Assistance & Towing',
      type: 'towing',
      latitude: 18.5034,
      longitude: 73.8122,
      phone: '+91 98220 12345',
      address: 'Kothrud Highway bypass, Pune',
      rating: 4.7,
      is_trauma_center: 0,
      extra_info: 'Flatbed tow trucks. Available 24/7 on NH-48.'
    },
    {
      name: 'Sai Tyre Care & Puncture Shop',
      type: 'puncture',
      latitude: 18.5188,
      longitude: 73.8415,
      phone: '+91 99220 54321',
      address: 'FC Road, Pune',
      rating: 4.0,
      is_trauma_center: 0,
      extra_info: 'Tubeless tyre repair, nitrogen air service.'
    },

    // --- Mumbai Area ---
    {
      name: 'KEM Hospital & Trauma Centre',
      type: 'hospital',
      latitude: 19.0026,
      longitude: 72.8421,
      phone: '+91 22 2410 7000',
      address: 'Acharya Donde Marg, Parel, Mumbai, Maharashtra 400012',
      rating: 4.7,
      is_trauma_center: 1,
      extra_info: 'Level-1 Public Trauma Center. 24/7 emergency surgeries.'
    },
    {
      name: 'Mumbai Central Police HQ',
      type: 'police',
      latitude: 18.9696,
      longitude: 72.8214,
      phone: '100',
      address: 'Mumbai Central, Mumbai',
      rating: 4.3,
      is_trauma_center: 0,
      extra_info: 'City response emergency dispatcher.'
    },
    {
      name: 'Dharavi Highway Towing Services',
      type: 'towing',
      latitude: 19.0380,
      longitude: 72.8538,
      phone: '+91 91672 34567',
      address: 'Sion Link Road, Dharavi, Mumbai',
      rating: 4.5,
      is_trauma_center: 0,
      extra_info: 'Heavy vehicle towing & recovery specialists.'
    },

    // --- Delhi Area ---
    {
      name: 'AIIMS Apex Trauma Center',
      type: 'hospital',
      latitude: 28.5672,
      longitude: 77.2100,
      phone: '+91 11 2658 8500',
      address: 'Ring Road, Safdarjung Enclave, New Delhi 110029',
      rating: 4.9,
      is_trauma_center: 1,
      extra_info: 'Highest capacity Level-1 Trauma Centre in Northern India.'
    },
    {
      name: 'Delhi Police Control Room',
      type: 'police',
      latitude: 28.6304,
      longitude: 77.2177,
      phone: '112',
      address: 'Connaught Place, New Delhi',
      rating: 4.4,
      is_trauma_center: 0,
      extra_info: 'Central emergency response.'
    },

    // --- Bangalore Area ---
    {
      name: 'NIMHANS Emergency & Trauma Center',
      type: 'hospital',
      latitude: 12.9429,
      longitude: 77.5968,
      phone: '+91 80 2699 5000',
      address: 'Hosur Road, Lakkasandra, Bengaluru, Karnataka 560029',
      rating: 4.8,
      is_trauma_center: 1,
      extra_info: 'Neuro-trauma & psychiatric emergency specialized services.'
    },

    // --- Emulator Default / San Francisco Area (For developer testing fallback) ---
    {
      name: 'Zuckerberg San Francisco General Hospital & Trauma Center',
      type: 'hospital',
      latitude: 37.7554,
      longitude: -122.4051,
      phone: '+1 415 206 8000',
      address: '1001 Potrero Ave, San Francisco, CA 94110',
      rating: 4.7,
      is_trauma_center: 1,
      extra_info: 'Level-1 Trauma Center. 24/7 Emergency Care.'
    },
    {
      name: 'SF Emergency Police Dispatch',
      type: 'police',
      latitude: 37.7749,
      longitude: -122.4194,
      phone: '911',
      address: '850 Bryant St, San Francisco, CA 94103',
      rating: 4.3,
      is_trauma_center: 0,
      extra_info: 'Emergency dispatch services.'
    },
    {
      name: 'Bay Area Ambulance Squad',
      type: 'ambulance',
      latitude: 37.7858,
      longitude: -122.4008,
      phone: '+1 415 555 0199',
      address: 'Downtown, San Francisco, CA',
      rating: 4.6,
      is_trauma_center: 0,
      extra_info: 'Paramedic response units.'
    },
    {
      name: 'Golden Gate Towing & Recovery',
      type: 'towing',
      latitude: 37.7345,
      longitude: -122.4355,
      phone: '+1 415 999 8888',
      address: 'Mission District, San Francisco, CA',
      rating: 4.4,
      is_trauma_center: 0,
      extra_info: 'Flatbed & roadside recovery.'
    },
    {
      name: 'SOMA Puncture & Repair Shop',
      type: 'puncture',
      latitude: 37.7712,
      longitude: -122.4123,
      phone: '+1 415 222 3333',
      address: '6th St, San Francisco, CA',
      rating: 4.1,
      is_trauma_center: 0,
      extra_info: 'Tyre changes & quick roadside repairs.'
    }
  ];

const seedDatabase = (database: SQLite.SQLiteDatabase) => {
  console.log('Seeding mock emergency services...');
  database.withTransactionSync(() => {
    const statement = database.prepareSync(`
      INSERT INTO emergency_services (name, type, latitude, longitude, phone, address, rating, is_trauma_center, extra_info)
      VALUES ($name, $type, $latitude, $longitude, $phone, $address, $rating, $is_trauma_center, $extra_info);
    `);
    
    try {
      for (const service of MOCK_SERVICES) {
        statement.executeSync({
          $name: service.name,
          $type: service.type,
          $latitude: service.latitude,
          $longitude: service.longitude,
          $phone: service.phone,
          $address: service.address,
          $rating: service.rating,
          $is_trauma_center: service.is_trauma_center,
          $extra_info: service.extra_info
        });
      }
      console.log('Successfully seeded database.');
    } finally {
      statement.finalizeSync();
    }
  });
};

// Calculate Haversine distance in KM
export const getDistance = (lat1: number, lon1: number, lat2: number, lon2: number): number => {
  const R = 6371; // Earth's radius in km
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLon / 2) *
      Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
};

/**
 * Get the age of the SQLite cache in minutes.
 * Returns null if no data has been cached yet.
 */
export const getCacheAge = (): number | null => {
  if (Platform.OS === 'web') return null;
  try {
    const database = initDb();
    const result = database.getFirstSync<{ last_cached: number | null }>(
      'SELECT MAX(cached_at) as last_cached FROM emergency_services WHERE cached_at > 0'
    );
    if (!result?.last_cached) return null;
    return Math.round((Date.now() - result.last_cached) / 60000);
  } catch {
    return null;
  }
};

// Query nearby services from local SQLite database
export const queryOfflineServices = (
  userLat: number,
  userLon: number,
  typeFilter?: string,
  maxDistanceKm: number = 100
): (EmergencyService & { distance: number })[] => {
  if (Platform.OS === 'web') {
    let filtered = MOCK_SERVICES;
    if (typeFilter) {
      filtered = MOCK_SERVICES.filter(s => s.type === typeFilter);
    }
    return filtered
      .map((item, index) => ({
        id: index,
        ...item,
        type: item.type as EmergencyService['type'],
        is_trauma_center: Boolean(item.is_trauma_center),
        distance: getDistance(userLat, userLon, item.latitude, item.longitude)
      }))
      .filter((item) => item.distance <= maxDistanceKm)
      .sort((a, b) => a.distance - b.distance);
  }
  const database = initDb();
  let query = 'SELECT * FROM emergency_services';
  const params: any = {};

  if (typeFilter) {
    query += ' WHERE type = $type';
    params['$type'] = typeFilter;
  }

  const results = database.getAllSync<EmergencyService>(query, params);

  // Map results to add distance and sort by closest
  return results
    .map((item) => ({
      ...item,
      is_trauma_center: Boolean(item.is_trauma_center),
      distance: getDistance(userLat, userLon, item.latitude, item.longitude)
    }))
    .filter((item) => item.distance <= maxDistanceKm)
    .sort((a, b) => a.distance - b.distance);
};
