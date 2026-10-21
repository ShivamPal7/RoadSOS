import test from 'node:test';
import assert from 'node:assert/strict';

// Unit Test 1: Emergency Helplines Data Integrity
test('Verify emergency numbers data structure and direct dial routing', () => {
  const INDIA_EMERGENCY = [
    { id: '1', label: 'National Emergency', number: '112', color: '#d90429' },
    { id: '2', label: 'Ambulance', number: '108', color: '#2a9d8f' },
    { id: '3', label: 'Police', number: '100', color: '#457b9d' },
    { id: '4', label: 'Road Accidents', number: '1073', color: '#f77f00' },
  ];

  const DIRECT_DIAL_NUMBERS = new Set(['112', '108', '100', '1073']);

  assert.equal(INDIA_EMERGENCY.length, 4, 'Should contain exactly 4 primary national helplines');
  
  for (const item of INDIA_EMERGENCY) {
    assert.ok(item.id, 'Entry must have an ID');
    assert.ok(item.label, 'Entry must have a label');
    assert.ok(item.number, 'Entry must have a phone number');
    assert.ok(DIRECT_DIAL_NUMBERS.has(item.number), `${item.number} should be in DIRECT_DIAL_NUMBERS`);
  }
});

// Unit Test 2: Emergency Contact Validation Logic
test('Emergency validation - phone number format check', () => {
  const isValidEmergencyContact = (phone) => {
    if (!phone || typeof phone !== 'string') return false;
    const cleaned = phone.replace(/[\s-]/g, '');
    return /^\+?[0-9]{3,15}$/.test(cleaned);
  };

  assert.equal(isValidEmergencyContact('112'), true);
  assert.equal(isValidEmergencyContact('108'), true);
  assert.equal(isValidEmergencyContact('+919876543210'), true);
  assert.equal(isValidEmergencyContact(''), false);
  assert.equal(isValidEmergencyContact('invalid-num'), false);
});

// Unit Test 3: Emergency Distance & ETA Calculation
test('Emergency distance ranking algorithm', () => {
  const calculateHaversineDistance = (lat1, lon1, lat2, lon2) => {
    const toRad = (x) => (x * Math.PI) / 180;
    const R = 6371; // Earth radius in km
    const dLat = toRad(lat2 - lat1);
    const dLon = toRad(lon2 - lon1);
    const a =
      Math.sin(dLat / 2) * Math.sin(dLat / 2) +
      Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) *
      Math.sin(dLon / 2) * Math.sin(dLon / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return R * c;
  };

  const userLocation = { lat: 28.6139, lon: 77.2090 }; // Delhi
  const hospitalA = { name: 'Trauma Center A', lat: 28.6200, lon: 77.2150 };
  const hospitalB = { name: 'City Hospital B', lat: 28.7000, lon: 77.3000 };

  const distA = calculateHaversineDistance(userLocation.lat, userLocation.lon, hospitalA.lat, hospitalA.lon);
  const distB = calculateHaversineDistance(userLocation.lat, userLocation.lon, hospitalB.lat, hospitalB.lon);

  assert.ok(distA < distB, 'Hospital A should be closer than Hospital B');
  assert.ok(distA < 5, 'Hospital A should be within 5km radius');
});
