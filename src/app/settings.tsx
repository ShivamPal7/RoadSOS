import AsyncStorage from '@react-native-async-storage/async-storage';
import { Globe, Info, Save, Settings as SettingsIcon, User, Users, AlertTriangle } from 'lucide-react-native';
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { router } from 'expo-router';
import { triggerSimulatedCrash } from '@/services/crashDetector';
import {
    Alert,
    Pressable,
    ScrollView,
    StyleSheet,
    Switch,
    Text,
    TextInput,
    View
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import '@/services/i18n';

const PROFILE_KEY = '@roadsos_medical_profile';
const SETTINGS_KEY = '@roadsos_settings_config';

export default function SettingsScreen() {
  const { t, i18n } = useTranslation();

  // Profile States
  const [name, setName] = useState('');
  const [bloodGroup, setBloodGroup] = useState('');
  const [allergies, setAllergies] = useState('');
  const [conditions, setConditions] = useState('');

  // Emergency Contacts States
  const [contact1Name, setContact1Name] = useState('');
  const [contact1Phone, setContact1Phone] = useState('');
  const [contact2Name, setContact2Name] = useState('');
  const [contact2Phone, setContact2Phone] = useState('');

  // Preferences States
  const [lang, setLang] = useState('en');
  const [offlineMode, setOfflineMode] = useState(false);
  const [crashDetection, setCrashDetection] = useState(true);
  const [sensitivity, setSensitivity] = useState('medium');

  useEffect(() => {
    loadSettingsData();
  }, []);

  const loadSettingsData = async () => {
    try {
      const storedProfile = await AsyncStorage.getItem(PROFILE_KEY);
      if (storedProfile) {
        const p = JSON.parse(storedProfile);
        setName(p.name || '');
        setBloodGroup(p.bloodGroup || '');
        setAllergies(p.allergies || '');
        setConditions(p.conditions || '');

        if (p.contacts && p.contacts.length > 0) {
          setContact1Name(p.contacts[0]?.name || '');
          setContact1Phone(p.contacts[0]?.phone || '');
          setContact2Name(p.contacts[1]?.name || '');
          setContact2Phone(p.contacts[1]?.phone || '');
        }
      }

      const storedSettings = await AsyncStorage.getItem(SETTINGS_KEY);
      if (storedSettings) {
        const s = JSON.parse(storedSettings);
        if (s.language) {
          setLang(s.language);
          i18n.changeLanguage(s.language);
        }
        if (s.offlineMode !== undefined) setOfflineMode(s.offlineMode);
        if (s.crashDetection !== undefined) setCrashDetection(s.crashDetection);
        if (s.sensitivity) setSensitivity(s.sensitivity);
      }
    } catch (e) {
      console.error('Failed to load settings data', e);
    }
  };

  const handleLanguageChange = async (selectedLang: string) => {
    setLang(selectedLang);
    i18n.changeLanguage(selectedLang);
    await savePreferences(selectedLang, offlineMode, crashDetection, sensitivity);
  };

  const handleOfflineToggle = async (value: boolean) => {
    setOfflineMode(value);
    await savePreferences(lang, value, crashDetection, sensitivity);
  };

  const handleCrashToggle = async (value: boolean) => {
    setCrashDetection(value);
    await savePreferences(lang, offlineMode, value, sensitivity);
  };

  const handleSensitivityChange = async (value: string) => {
    setSensitivity(value);
    await savePreferences(lang, offlineMode, crashDetection, value);
  };

  const savePreferences = async (
    l: string,
    off: boolean,
    crash: boolean,
    sens: string
  ) => {
    try {
      const config = {
        language: l,
        offlineMode: off,
        crashDetection: crash,
        sensitivity: sens
      };
      await AsyncStorage.setItem(SETTINGS_KEY, JSON.stringify(config));
    } catch (e) {
      console.error(e);
    }
  };

  const handleSaveProfile = async () => {
    try {
      const profileData = {
        name,
        bloodGroup,
        allergies,
        conditions,
        contacts: [
          { name: contact1Name, phone: contact1Phone },
          { name: contact2Name, phone: contact2Phone }
        ].filter(c => c.name || c.phone)
      };

      await AsyncStorage.setItem(PROFILE_KEY, JSON.stringify(profileData));
      Alert.alert('Saved', 'Medical Profile and Emergency Contacts updated.');
    } catch (e) {
      Alert.alert('Error', 'Failed to save profile information.');
    }
  };

  const handleSimulateCrash = () => {
    router.replace('/');
    setTimeout(() => {
      triggerSimulatedCrash();
    }, 500);
  };

  return (
    <SafeAreaView style={styles.container} edges={['top', 'left', 'right']}>
      <ScrollView contentContainerStyle={styles.scrollContent}>
        <View style={styles.header}>
          <SettingsIcon color="#ff4d4d" size={24} />
          <Text style={styles.headerTitle}>{t('settings')}</Text>
        </View>

        {/* Section 1: Medical Profile */}
        <View style={styles.sectionCard}>
          <View style={styles.sectionHeader}>
            <User color="#ff4d4d" size={18} />
            <Text style={styles.sectionTitle}>{t('medical_card')}</Text>
          </View>

          <Text style={styles.fieldLabel}>Full Name</Text>
          <TextInput
            style={styles.textInput}
            placeholder="John Doe"
            placeholderTextColor="#666"
            value={name}
            onChangeText={setName}
          />

          <Text style={styles.fieldLabel}>{t('blood_group')}</Text>
          <TextInput
            style={styles.textInput}
            placeholder="e.g. O+, A-, B+"
            placeholderTextColor="#666"
            value={bloodGroup}
            onChangeText={setBloodGroup}
          />

          <Text style={styles.fieldLabel}>{t('allergies')}</Text>
          <TextInput
            style={styles.textInput}
            placeholder="e.g. Penicillin, Pollen, None"
            placeholderTextColor="#666"
            value={allergies}
            onChangeText={setAllergies}
          />

          <Text style={styles.fieldLabel}>{t('conditions')}</Text>
          <TextInput
            style={styles.textInput}
            placeholder="e.g. Asthma, Hypertension, None"
            placeholderTextColor="#666"
            value={conditions}
            onChangeText={setConditions}
          />
        </View>

        {/* Section 2: Emergency Contacts */}
        <View style={styles.sectionCard}>
          <View style={styles.sectionHeader}>
            <Users color="#457b9d" size={18} />
            <Text style={styles.sectionTitle}>{t('contacts')}</Text>
          </View>

          <Text style={styles.contactLabel}>Primary Contact (Contact 1)</Text>
          <View style={styles.contactRow}>
            <TextInput
              style={[styles.textInput, styles.halfInput]}
              placeholder="Name"
              placeholderTextColor="#666"
              value={contact1Name}
              onChangeText={setContact1Name}
            />
            <TextInput
              style={[styles.textInput, styles.halfInput]}
              placeholder="Phone"
              placeholderTextColor="#666"
              keyboardType="phone-pad"
              value={contact1Phone}
              onChangeText={setContact1Phone}
            />
          </View>

          <Text style={styles.contactLabel}>Secondary Contact (Contact 2)</Text>
          <View style={styles.contactRow}>
            <TextInput
              style={[styles.textInput, styles.halfInput]}
              placeholder="Name"
              placeholderTextColor="#666"
              value={contact2Name}
              onChangeText={setContact2Name}
            />
            <TextInput
              style={[styles.textInput, styles.halfInput]}
              placeholder="Phone"
              placeholderTextColor="#666"
              keyboardType="phone-pad"
              value={contact2Phone}
              onChangeText={setContact2Phone}
            />
          </View>

          {/* Save Button */}
          <Pressable style={styles.saveBtn} onPress={handleSaveProfile}>
            <Save size={18} color="#fff" />
            <Text style={styles.saveBtnText}>{t('save')}</Text>
          </Pressable>
        </View>

        {/* Section 3: App Configuration & Sensitivity */}
        <View style={styles.sectionCard}>
          <View style={styles.sectionHeader}>
            <Globe color="#2a9d8f" size={18} />
            <Text style={styles.sectionTitle}>App Configurations</Text>
          </View>

          {/* Language selection */}
          <Text style={styles.fieldLabel}>{t('language')}</Text>
          <View style={styles.langSelectorRow}>
            {[
              { code: 'en', label: 'EN' },
              { code: 'hi', label: 'हिन्दी' },
              { code: 'mr', label: 'मराठी' },
              { code: 'ta', label: 'தமிழ்' },
              { code: 'bn', label: 'বাংলা' }
            ].map((item) => (
              <Pressable
                key={item.code}
                style={[
                  styles.langChip,
                  lang === item.code ? styles.langChipActive : styles.langChipInactive
                ]}
                onPress={() => handleLanguageChange(item.code)}
              >
                <Text
                  style={[
                    styles.langText,
                    lang === item.code ? styles.langTextActive : styles.langTextInactive
                  ]}
                >
                  {item.label}
                </Text>
              </Pressable>
            ))}
          </View>

          {/* Offline mode toggle */}
          <View style={styles.toggleRow}>
            <View style={styles.toggleTextContainer}>
              <Text style={styles.toggleLabel}>Force Offline Mode</Text>
              <Text style={styles.toggleDesc}>Pulls all services from local cached SQLite DB</Text>
            </View>
            <Switch
              value={offlineMode}
              onValueChange={handleOfflineToggle}
              trackColor={{ false: '#767577', true: '#ff4d4d' }}
              thumbColor={offlineMode ? '#fff' : '#f4f3f4'}
            />
          </View>

          {/* Crash detection sensor toggle */}
          <View style={styles.toggleRow}>
            <View style={styles.toggleTextContainer}>
              <Text style={styles.toggleLabel}>Crash Detection Sensor</Text>
              <Text style={styles.toggleDesc}>Uses accelerometer to auto-detect collisions</Text>
            </View>
            <Switch
              value={crashDetection}
              onValueChange={handleCrashToggle}
              trackColor={{ false: '#767577', true: '#ff4d4d' }}
              thumbColor={crashDetection ? '#fff' : '#f4f3f4'}
            />
          </View>

          {/* Crash Sensitivity selector */}
          <Text style={styles.fieldLabel}>{t('sensitivity')}</Text>
          <View style={styles.sensitivityRow}>
            {[
              { code: 'low', label: 'Low (12G)' },
              { code: 'medium', label: 'Medium (8G)' },
              { code: 'high', label: 'High (5G)' }
            ].map((item) => (
              <Pressable
                key={item.code}
                style={[
                  styles.sensChip,
                  sensitivity === item.code ? styles.sensChipActive : styles.sensChipInactive
                ]}
                onPress={() => handleSensitivityChange(item.code)}
              >
                <Text
                  style={[
                    styles.sensText,
                    sensitivity === item.code ? styles.sensTextActive : styles.sensTextInactive
                  ]}
                >
                  {item.label}
                </Text>
              </Pressable>
            ))}
          </View>

          {/* Simulate Crash Button */}
          <Text style={styles.fieldLabel}>Safe Crash Testing</Text>
          <Pressable style={styles.simulateBtn} onPress={handleSimulateCrash}>
            <AlertTriangle size={16} color="#121214" />
            <Text style={styles.simulateBtnText}>SIMULATE CRASH ALERT</Text>
          </Pressable>
        </View>

        {/* Footer info */}
        <View style={styles.footerRow}>
          <Info size={14} color="#666" />
          <Text style={styles.footerText}>RoadSOS v1.0.0 — Offline Emergency Engine Active</Text>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#121214',
  },
  scrollContent: {
    padding: 16,
    gap: 16,
    paddingBottom: 40,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#212225',
  },
  headerTitle: {
    color: '#fff',
    fontSize: 20,
    fontWeight: 'bold',
  },
  sectionCard: {
    backgroundColor: '#1e1e24',
    borderRadius: 16,
    padding: 16,
    borderWidth: 1,
    borderColor: '#2e2e38',
  },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 16,
  },
  sectionTitle: {
    color: '#fff',
    fontSize: 16,
    fontWeight: 'bold',
  },
  fieldLabel: {
    color: '#aaa',
    fontSize: 11,
    fontWeight: 'bold',
    textTransform: 'uppercase',
    marginBottom: 6,
    marginTop: 10,
  },
  textInput: {
    backgroundColor: '#121214',
    borderWidth: 1,
    borderColor: '#2e2e38',
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    color: '#fff',
    fontSize: 14,
    marginBottom: 10,
  },
  contactLabel: {
    color: '#aaa',
    fontSize: 12,
    fontWeight: '600',
    marginBottom: 6,
    marginTop: 8,
  },
  contactRow: {
    flexDirection: 'row',
    gap: 10,
  },
  halfInput: {
    flex: 1,
  },
  saveBtn: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    gap: 8,
    backgroundColor: '#ff4d4d',
    paddingVertical: 12,
    borderRadius: 8,
    marginTop: 16,
  },
  saveBtnText: {
    color: '#fff',
    fontSize: 15,
    fontWeight: 'bold',
  },
  langSelectorRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginBottom: 16,
  },
  langChip: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 8,
    borderWidth: 1,
  },
  langChipActive: {
    backgroundColor: '#2a9d8f',
    borderColor: '#2a9d8f',
  },
  langChipInactive: {
    backgroundColor: '#121214',
    borderColor: '#2e2e38',
  },
  langText: {
    fontSize: 12,
    fontWeight: 'bold',
  },
  langTextActive: {
    color: '#fff',
  },
  langTextInactive: {
    color: '#aaa',
  },
  toggleRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 12,
    borderBottomWidth: 0.5,
    borderBottomColor: '#2e2e38',
  },
  toggleTextContainer: {
    flex: 1,
    paddingRight: 10,
  },
  toggleLabel: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '600',
  },
  toggleDesc: {
    color: '#888',
    fontSize: 11,
    marginTop: 2,
  },
  sensitivityRow: {
    flexDirection: 'row',
    gap: 8,
    marginTop: 8,
  },
  sensChip: {
    flex: 1,
    paddingVertical: 10,
    alignItems: 'center',
    borderRadius: 8,
    borderWidth: 1,
  },
  sensChipActive: {
    backgroundColor: '#ff4d4d',
    borderColor: '#ff4d4d',
  },
  sensChipInactive: {
    backgroundColor: '#121214',
    borderColor: '#2e2e38',
  },
  sensText: {
    fontSize: 12,
    fontWeight: 'bold',
  },
  sensTextActive: {
    color: '#fff',
  },
  sensTextInactive: {
    color: '#aaa',
  },
  footerRow: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    gap: 6,
    paddingVertical: 10,
  },
  footerText: {
    color: '#666',
    fontSize: 11,
  },
  simulateBtn: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    gap: 8,
    backgroundColor: '#ffbe0b',
    paddingVertical: 12,
    borderRadius: 8,
    marginTop: 16,
  },
  simulateBtnText: {
    color: '#121214',
    fontSize: 14,
    fontWeight: '800',
    letterSpacing: 0.5,
  },
});
