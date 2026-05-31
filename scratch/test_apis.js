const fs = require('fs');
const path = require('path');

// Custom Env Parser to avoid external dependency issues
function parseEnvFile(filePath) {
  if (!fs.existsSync(filePath)) return {};
  const content = fs.readFileSync(filePath, 'utf8');
  const env = {};
  content.split('\n').forEach(line => {
    // Trim line
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) return;
    
    const parts = trimmed.split('=');
    if (parts.length >= 2) {
      const key = parts[0].trim();
      let value = parts.slice(1).join('=').trim();
      
      // Remove surrounding quotes if any
      if (value.startsWith("'") && value.endsWith("'")) {
        value = value.slice(1, -1);
      } else if (value.startsWith('"') && value.endsWith('"')) {
        value = value.slice(1, -1);
      }
      env[key] = value;
    }
  });
  return env;
}

// Load environment variables
const rootEnvPath = path.join(__dirname, '..', '.env');
const serverEnvPath = path.join(__dirname, '..', 'server', '.env');

console.log('--- Loading Environment Variables ---');
let clientEnv = {};
let serverEnv = {};

if (fs.existsSync(rootEnvPath)) {
  clientEnv = parseEnvFile(rootEnvPath);
  console.log('✅ Client .env found and parsed');
} else {
  console.log('❌ Client .env NOT found');
}

if (fs.existsSync(serverEnvPath)) {
  serverEnv = parseEnvFile(serverEnvPath);
  console.log('✅ Server .env found and parsed');
} else {
  console.log('❌ Server .env NOT found');
}

const geminiKey = clientEnv.EXPO_PUBLIC_GEMINI_API_KEY || '';
const mapsKey = clientEnv.EXPO_PUBLIC_GOOGLE_MAPS_API_KEY || '';
const dbUrl = clientEnv.EXPO_PUBLIC_FIREBASE_DATABASE_URL || '';

async function testGeminiAPI() {
  console.log('\n--- Testing Gemini API ---');
  if (!geminiKey) {
    console.log('⚠️  Skipping Gemini API test (API Key missing in .env)');
    return { success: false, reason: 'Key missing' };
  }
  
  const endpoints = [
    `https://generativelanguage.googleapis.com/v1/models/gemini-1.5-flash:generateContent?key=${geminiKey}`,
    `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash-latest:generateContent?key=${geminiKey}`,
    `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${geminiKey}`
  ];

  for (const url of endpoints) {
    try {
      console.log(`Trying endpoint: ${url.split('?')[0]}...`);
      const response = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{ parts: [{ text: 'Give one word test reply: Success.' }] }]
        })
      });
      
      const data = await response.json();
      if (response.ok) {
        const text = data.candidates?.[0]?.content?.parts?.[0]?.text?.trim();
        console.log(`✅ Gemini API works on this endpoint! Response: "${text}"`);
        return { success: true, text };
      } else {
        console.log(`❌ Failed: Status ${response.status} - ${data.error?.message}`);
      }
    } catch (err) {
      console.log(`❌ Fetch crashed on this endpoint: ${err.message}`);
    }
  }
  return { success: false, reason: 'All endpoints failed' };
}

async function testGooglePlacesAPI() {
  console.log('\n--- Testing Google Places API ---');
  if (!mapsKey) {
    console.log('⚠️  Skipping Google Places API test (API Key missing in .env)');
    return { success: false, reason: 'Key missing' };
  }
  
  try {
    // Testing near central Pune, India (similar to default coordinate fallback in app)
    const url = `https://maps.googleapis.com/maps/api/place/nearbysearch/json?location=18.5204,73.8567&radius=1000&type=hospital&key=${mapsKey}`;
    const response = await fetch(url);
    const data = await response.json();
    
    if (data.status === 'OK') {
      console.log(`✅ Google Places API works. Found ${data.results.length} hospitals nearby.`);
      return { success: true, count: data.results.length };
    } else {
      console.log(`❌ Google Places API returned error status: ${data.status}`, data.error_message || '');
      return { success: false, status: data.status, msg: data.error_message };
    }
  } catch (err) {
    console.log('❌ Google Places API fetch crashed:', err.message);
    return { success: false, error: err.message };
  }
}

async function testGoogleDirectionsAPI() {
  console.log('\n--- Testing Google Directions API ---');
  if (!mapsKey) {
    console.log('⚠️  Skipping Google Directions API test (API Key missing in .env)');
    return { success: false, reason: 'Key missing' };
  }
  
  try {
    const url = `https://maps.googleapis.com/maps/api/directions/json?origin=18.5204,73.8567&destination=18.525,73.86&mode=driving&key=${mapsKey}`;
    const response = await fetch(url);
    const data = await response.json();
    
    if (data.status === 'OK') {
      const route = data.routes[0];
      const duration = route?.legs[0]?.duration?.text;
      console.log(`✅ Google Directions API works. Found route: ${duration}`);
      return { success: true, duration };
    } else {
      console.log(`❌ Google Directions API returned error status: ${data.status}`, data.error_message || '');
      return { success: false, status: data.status, msg: data.error_message };
    }
  } catch (err) {
    console.log('❌ Google Directions API fetch crashed:', err.message);
    return { success: false, error: err.message };
  }
}

async function testFirebaseDBAPI() {
  console.log('\n--- Testing Firebase Realtime DB Connection ---');
  if (!dbUrl) {
    console.log('⚠️  Skipping Firebase DB test (EXPO_PUBLIC_FIREBASE_DATABASE_URL missing in .env)');
    return { success: false, reason: 'Key missing' };
  }
  
  try {
    // Check db connection using REST endpoint
    const url = `${dbUrl}/.json`;
    const response = await fetch(url);
    const data = await response.json();
    
    if (response.ok) {
      console.log('✅ Firebase Realtime DB REST connection works.');
      return { success: true };
    } else {
      console.log(`❌ Firebase DB returned error status: ${response.status}`);
      return { success: false, status: response.status };
    }
  } catch (err) {
    console.log('❌ Firebase DB connection crashed:', err.message);
    return { success: false, error: err.message };
  }
}

async function testLocalExpressBackend() {
  console.log('\n--- Testing Local Express Backend ---');
  try {
    const url = 'http://localhost:5000/';
    const response = await fetch(url);
    const data = await response.json();
    
    if (response.ok && data.status === 'online') {
      console.log(`✅ Local Express Server is ONLINE. Version: ${data.version}. Active Alerts: ${data.activeAlerts}`);
      return { success: true, version: data.version };
    } else {
      console.log(`❌ Local Express Server returned bad response:`, data);
      return { success: false, status: response.status };
    }
  } catch (err) {
    console.log('❌ Local Express Server is UNREACHABLE (Is the server running? Run npm start in server/ folder):', err.message);
    return { success: false, error: err.message };
  }
}

async function runAllTests() {
  console.log('====================================');
  console.log('🚀 RoadSOS API Integration Test Suite');
  console.log('====================================');
  
  const gemini = await testGeminiAPI();
  const places = await testGooglePlacesAPI();
  const directions = await testGoogleDirectionsAPI();
  const firebase = await testFirebaseDBAPI();
  const localServer = await testLocalExpressBackend();
  
  console.log('\n====================================');
  console.log('📊 Summary Report:');
  console.log('====================================');
  console.log(`1. Gemini API:          ${gemini.success ? '✅ WORKING' : '❌ FAILED'}`);
  console.log(`2. Google Places API:   ${places.success ? '✅ WORKING' : '❌ FAILED'}`);
  console.log(`3. Google Directions:   ${directions.success ? '✅ WORKING' : '❌ FAILED'}`);
  console.log(`4. Firebase DB (REST):  ${firebase.success ? '✅ WORKING' : '❌ FAILED'}`);
  console.log(`5. Local Express:       ${localServer.success ? '✅ WORKING' : '❌ FAILED'}`);
  console.log('====================================');
}

runAllTests();
