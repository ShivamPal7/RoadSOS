/**
 * callService.ts
 * Central call + call-history service used by every screen.
 * makeCall  — sanitises number, opens tel: deeplink, logs the call.
 * logCall   — persists to AsyncStorage (last 10 entries).
 * getCallHistory — reads persisted history.
 */

import { DIRECT_DIAL_NUMBERS } from '@/constants/emergencyNumbers';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Alert, Linking } from 'react-native';

const CALL_HISTORY_KEY = '@roadsos_call_history';
const MAX_HISTORY      = 10;

export interface CallHistoryEntry {
  id: string;
  number: string;
  label: string;
  category: string;   // 'emergency' | 'personal' | 'hospital' | 'police' | etc.
  timestamp: string;  // ISO string
}

// ── Core call function ────────────────────────────────────────────────────────

/**
 * Sanitise, open tel: deeplink, and log the call.
 * For national emergency numbers (112, 108, 100, 1073) — direct dial, no confirm.
 * For all other numbers — optional confirmation dialog.
 */
export const makeCall = async (
  number: string,
  label: string = '',
  category: string = 'service',
  skipConfirm: boolean = false
): Promise<void> => {
  const cleaned = number.replace(/[\s\-().+]/g, '').replace(/^0+/, '');
  const url = `tel:${cleaned}`;

  const isEmergency = DIRECT_DIAL_NUMBERS.has(number.trim());

  const dial = async () => {
    try {
      const supported = await Linking.canOpenURL(url);
      if (supported) {
        await Linking.openURL(url);
        await logCall(number, label, category);
      } else {
        Alert.alert(
          'Calling Not Supported',
          `Please dial manually: ${number}`,
          [{ text: 'OK' }]
        );
      }
    } catch (err) {
      console.error('makeCall error:', err);
      Alert.alert('Error', `Could not initiate call to ${number}`);
    }
  };

  if (isEmergency || skipConfirm) {
    await dial();
  } else {
    Alert.alert(
      `Call ${label || number}?`,
      number,
      [
        { text: 'Cancel', style: 'cancel' },
        { text: '📞 Call Now', onPress: dial, style: 'destructive' },
      ]
    );
  }
};

// ── Call history ──────────────────────────────────────────────────────────────

export const logCall = async (
  number: string,
  label: string = '',
  category: string = 'service'
): Promise<void> => {
  try {
    const history = await getCallHistory();
    const entry: CallHistoryEntry = {
      id: Date.now().toString(),
      number,
      label,
      category,
      timestamp: new Date().toISOString(),
    };
    const updated = [entry, ...history].slice(0, MAX_HISTORY);
    await AsyncStorage.setItem(CALL_HISTORY_KEY, JSON.stringify(updated));
  } catch (err) {
    console.warn('logCall failed:', err);
  }
};

export const getCallHistory = async (): Promise<CallHistoryEntry[]> => {
  try {
    const data = await AsyncStorage.getItem(CALL_HISTORY_KEY);
    return data ? JSON.parse(data) : [];
  } catch {
    return [];
  }
};

export const clearCallHistory = async (): Promise<void> => {
  await AsyncStorage.removeItem(CALL_HISTORY_KEY);
};
