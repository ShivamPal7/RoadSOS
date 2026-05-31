/**
 * contactsService.ts
 * AsyncStorage CRUD for personal emergency contacts.
 * Also handles importing a contact from the device phone book via expo-contacts.
 */

import AsyncStorage from '@react-native-async-storage/async-storage';
import * as ExpoContacts from 'expo-contacts';
import { Alert } from 'react-native';

const CONTACTS_KEY = '@roadsos_emergency_contacts';
const MAX_CONTACTS = 5;

export interface EmergencyContact {
  id: string;
  name: string;
  phone: string;
  relation: 'family' | 'friend' | 'doctor' | 'other';
  avatarColor: string; // deterministic color from name
}

// Deterministic avatar color from name initial
const AVATAR_COLORS = ['#d90429', '#2a9d8f', '#457b9d', '#f77f00', '#6c757d', '#8338ec', '#3a86ff'];
export const avatarColor = (name: string): string =>
  AVATAR_COLORS[(name.charCodeAt(0) || 0) % AVATAR_COLORS.length];

// ── CRUD ──────────────────────────────────────────────────────────────────────

export const getEmergencyContacts = async (): Promise<EmergencyContact[]> => {
  try {
    const data = await AsyncStorage.getItem(CONTACTS_KEY);
    return data ? JSON.parse(data) : [];
  } catch {
    return [];
  }
};

export const saveEmergencyContact = async (
  contact: Omit<EmergencyContact, 'id' | 'avatarColor'>
): Promise<boolean> => {
  try {
    const existing = await getEmergencyContacts();
    if (existing.length >= MAX_CONTACTS) {
      Alert.alert('Limit Reached', `You can save up to ${MAX_CONTACTS} emergency contacts.`);
      return false;
    }
    const newContact: EmergencyContact = {
      ...contact,
      id: Date.now().toString(),
      avatarColor: avatarColor(contact.name),
    };
    const updated = [...existing, newContact];
    await AsyncStorage.setItem(CONTACTS_KEY, JSON.stringify(updated));
    return true;
  } catch {
    return false;
  }
};

export const updateEmergencyContact = async (
  id: string,
  updates: Partial<Omit<EmergencyContact, 'id'>>
): Promise<void> => {
  const existing = await getEmergencyContacts();
  const updated = existing.map(c =>
    c.id === id ? { ...c, ...updates, avatarColor: avatarColor(updates.name ?? c.name) } : c
  );
  await AsyncStorage.setItem(CONTACTS_KEY, JSON.stringify(updated));
};

export const deleteEmergencyContact = async (id: string): Promise<void> => {
  const existing = await getEmergencyContacts();
  const updated = existing.filter(c => c.id !== id);
  await AsyncStorage.setItem(CONTACTS_KEY, JSON.stringify(updated));
};

// ── Import from phone book ────────────────────────────────────────────────────

export interface ImportedContact {
  name: string;
  phone: string;
}

/**
 * Request contacts permission and return the full list for the user to pick from.
 * Returns null if permission denied.
 */
export const fetchDeviceContacts = async (): Promise<ImportedContact[] | null> => {
  try {
    const { status } = await ExpoContacts.requestPermissionsAsync();
    if (status !== 'granted') {
      Alert.alert(
        'Permission Required',
        'Contacts access is needed to import emergency contacts.'
      );
      return null;
    }

    const { data } = await ExpoContacts.getContactsAsync({
      fields: [ExpoContacts.Fields.Name, ExpoContacts.Fields.PhoneNumbers],
      sort: ExpoContacts.SortTypes.FirstName,
    });

    return data
      .filter(c => c.name && c.phoneNumbers?.length)
      .map(c => ({
        name: c.name!,
        phone: c.phoneNumbers![0].number ?? '',
      }))
      .filter(c => c.phone);
  } catch (err) {
    console.error('fetchDeviceContacts error:', err);
    return null;
  }
};
