import { Accelerometer, Gyroscope } from 'expo-sensors';
import { Platform } from 'react-native';

export interface CrashResult {
  crash: boolean;
  gForce: number;
  severity: "MEDIUM" | "HIGH" | "CRITICAL";
  confidence: number;
}

export type CrashCallback = (result: CrashResult) => void;

let accelSubscription: { remove: () => void } | null = null;
let gyroSubscription: { remove: () => void } | null = null;
let isDetecting = false;

// Cooldown: prevent duplicate triggers within this window (ms)
const COOLDOWN_MS = 5000;
let lastTriggerTime = 0;

// Gyroscope magnitude threshold indicating abnormal motion (rad/s)
const GYRO_ROTATION_THRESHOLD = 2.5;

// Target G-Force thresholds based on real-world vehicular crash data
const THRESHOLDS = {
  high_sensitivity: 5.0,   // "High (5G)" - triggers on minor fender-benders
  medium_sensitivity: 8.0, // "Medium (8G)" - standard severe vehicular impact (airbag levels)
  low_sensitivity: 12.0,   // "Low (12G)" - severe major collisions
  critical: 12.0           // Critical life-threatening threshold (12G+)
};

// Map sensitivity settings to G-Force thresholds
export const sensitivityToThreshold = (sensitivity: string): number => {
  switch (sensitivity) {
    case 'high':   return THRESHOLDS.high_sensitivity;   // 5.0G
    case 'low':    return THRESHOLDS.low_sensitivity;    // 12.0G
    case 'medium':
    default:       return THRESHOLDS.medium_sensitivity; // 8.0G
  }
};

// State variables for tracking impacts
let consecutiveCount = 0;
let impactStartTime = 0;
let latestGyroMagnitude = 0;

export const startCrashDetection = (
  callback: CrashCallback,
  threshold: number = THRESHOLDS.medium_sensitivity,
  updateIntervalMs: number = 50 // 50ms interval to capture high-res impact frames
) => {
  if (isDetecting) return;

  if (Platform.OS === 'web') {
    isDetecting = true;
    console.log('Crash detection sensor started (mock/web).');
    return;
  }

  // Set sensor update intervals (50ms captures high-res motion)
  Accelerometer.setUpdateInterval(updateIntervalMs);
  Gyroscope.setUpdateInterval(updateIntervalMs);

  isDetecting = true;
  consecutiveCount = 0;
  impactStartTime = 0;
  latestGyroMagnitude = 0;
  lastTriggerTime = 0;

  // 1. Subscribe to Gyroscope to monitor abnormal rotation
  gyroSubscription = Gyroscope.addListener((data) => {
    const { x, y, z } = data;
    latestGyroMagnitude = Math.sqrt(x * x + y * y + z * z);
  });

  // 2. Subscribe to Accelerometer to calculate G-Forces
  accelSubscription = Accelerometer.addListener((data) => {
    const { x, y, z } = data;

    // Calculate total G-force magnitude (including gravity)
    const currentGForce = Math.sqrt(x * x + y * y + z * z);

    const now = Date.now();

    // Enforce 5-second cooldown
    if (now - lastTriggerTime < COOLDOWN_MS) {
      consecutiveCount = 0;
      impactStartTime = 0;
      return;
    }

    if (currentGForce >= threshold) {
      consecutiveCount++;
      if (consecutiveCount === 1) {
        impactStartTime = now;
      }

      const impactDuration = now - impactStartTime;

      // ── CONSECUTIVE + DURATION + GYROSCOPE VALIDATION ──
      // Trigger only if:
      // - G-force >= threshold
      // - Exceeded for at least 3 consecutive readings (approx 150ms at 50ms interval)
      // - Impact duration >= 200ms (verifies sustained force, filtering out potholes/vibrations)
      // - Gyroscope indicates abnormal angular rotation (rad/s >= GYRO_ROTATION_THRESHOLD)
      if (
        consecutiveCount >= 3 &&
        impactDuration >= 200 &&
        latestGyroMagnitude >= GYRO_ROTATION_THRESHOLD
      ) {
        // Enforce immediate cooldown
        lastTriggerTime = now;

        // Determine severity
        let severity: CrashResult['severity'] = "MEDIUM";
        if (currentGForce >= THRESHOLDS.critical) {
          severity = "CRITICAL";
        } else if (currentGForce >= THRESHOLDS.medium_sensitivity) {
          severity = "HIGH";
        }

        // ── PRODUCTION-READY CRASH SCORING SYSTEM ──
        // 1. G-Force intensity score (max 40 points)
        const gForceScore = Math.min(40, ((currentGForce - threshold) / (15.0 - threshold)) * 30 + 10);
        // 2. Duration sustainability score (max 30 points)
        const durationScore = Math.min(30, (impactDuration / 400) * 30);
        // 3. Gyroscope abnormal rotation score (max 30 points)
        const rotationScore = Math.min(30, (latestGyroMagnitude / 8.0) * 30);

        // Combined Confidence Score (minimum 55% for any verified impact)
        const confidence = Math.round(Math.min(100, Math.max(55, gForceScore + durationScore + rotationScore)));

        console.warn(`[CrashDetector] CRASH DETECTED! G-Force: ${currentGForce.toFixed(2)}G, Severity: ${severity}, Confidence: ${confidence}%, Rotation: ${latestGyroMagnitude.toFixed(2)} rad/s, Duration: ${impactDuration}ms`);

        callback({
          crash: true,
          gForce: parseFloat(currentGForce.toFixed(1)),
          severity,
          confidence
        });

        // Reset tracking states
        consecutiveCount = 0;
        impactStartTime = 0;
      }
    } else {
      // Reset count and timer if force drops below threshold
      consecutiveCount = 0;
      impactStartTime = 0;
    }
  });

  console.log('Crash detection sensor started.');
};

export const stopCrashDetection = () => {
  if (Platform.OS === 'web') {
    isDetecting = false;
    console.log('Crash detection sensor stopped (mock/web).');
    return;
  }
  if (accelSubscription) {
    accelSubscription.remove();
    accelSubscription = null;
  }
  if (gyroSubscription) {
    gyroSubscription.remove();
    gyroSubscription = null;
  }
  isDetecting = false;
  console.log('Crash detection sensor stopped.');
};

export const isCrashDetectionActive = (): boolean => {
  return isDetecting;
};

type SimulateCallback = () => void;
let simulateCallback: SimulateCallback | null = null;

export const registerSimulateCallback = (cb: SimulateCallback) => {
  simulateCallback = cb;
};

export const triggerSimulatedCrash = () => {
  if (simulateCallback) {
    simulateCallback();
  }
};
