import AsyncStorage from '@react-native-async-storage/async-storage';
import { useFocusEffect } from 'expo-router';
import * as Speech from 'expo-speech';
import {
    AlertTriangle, CloudOff, Compass,
    PhoneCall,
    Shield,
    Wifi,
    X
} from 'lucide-react-native';
import { useCallback, useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
    ActivityIndicator,
    Alert, Animated,
    Modal, Pressable,
    ScrollView, StyleSheet, Switch, Text, View
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { EmergencyButton } from '@/components/EmergencyButton';
import { MedicalCard, MedicalProfile } from '@/components/MedicalCard';
import { ResultCard, ResultCardSkeleton } from '@/components/ResultCard';
import { SOSActiveBar } from '@/components/SOSActiveBar';
import { INDIA_EMERGENCY } from '@/constants/emergencyNumbers';
import { makeCall } from '@/services/callService';
import { getEmergencyContacts } from '@/services/contactsService';
import { triggerEmergencyAlert, cancelEmergencyAlert } from '@/services/alertService';
import { registerForPushNotifications } from '@/services/notificationService';
import { sensitivityToThreshold, startCrashDetection, stopCrashDetection, registerSimulateCallback } from '@/services/crashDetector';
import '@/services/i18n';
import {
    checkNetworkConnectivity, getCurrentLocation,
    LocationData, startLocationCaching, stopLocationCaching
} from '@/services/location';
import {
    fetchAllEmergencyServices, PlaceResult
} from '@/services/placesService';
import { getRecommendedHospitals } from '@/services/routingService';

const PROFILE_KEY = '@roadsos_medical_profile';
const SETTINGS_KEY = '@roadsos_settings_config';

type TabKey = 'hospital' | 'police' | 'ambulance' | 'towing';
const TABS: { key: TabKey; label: string }[] = [
  { key: 'hospital',  label: 'Hospitals' },
  { key: 'police',    label: 'Police' },
  { key: 'ambulance', label: 'Ambulance' },
  { key: 'towing',    label: 'Towing' },
];

export default function HomeScreen() {
  const { t, i18n } = useTranslation();

  // ── Core state ──────────────────────────────────────────────────────────────
  const [sosActive, setSosActive]           = useState(false);
  const [countdown, setCountdown]           = useState(0);
  const [location, setLocation]             = useState<LocationData | null>(null);
  const [loadingLocation, setLoadingLocation] = useState(false);
  const [offlineMode, setOfflineMode]       = useState(false);
  const [crashDetection, setCrashDetection] = useState(true);
  const [sensitivity, setSensitivity]       = useState('medium');

  // ── Emergency results state ─────────────────────────────────────────────────
  const [activeTab, setActiveTab]           = useState<TabKey>('hospital');
  const [results, setResults]               = useState<Record<TabKey, PlaceResult[]>>({
    hospital: [], police: [], ambulance: [], towing: [],
  });
  const [loadingTabs, setLoadingTabs]       = useState<Record<TabKey, boolean>>({
    hospital: false, police: false, ambulance: false, towing: false,
  });
  const [fetchError, setFetchError]         = useState(false);

  // ── Crash detection modal ───────────────────────────────────────────────────
  const [crashModalVisible, setCrashModalVisible] = useState(false);
  const [crashTimer, setCrashTimer]         = useState(10);
  const [detectedGForce, setDetectedGForce] = useState(0);

  // ── Profile ─────────────────────────────────────────────────────────────────
  const [profile, setProfile] = useState<MedicalProfile>({
    name: '', bloodGroup: '', allergies: '', conditions: '', contacts: [],
  });

  // ── Refs ────────────────────────────────────────────────────────────────────
  const countdownRef      = useRef<ReturnType<typeof setInterval> | null>(null);
  const crashTimerRef     = useRef<ReturnType<typeof setInterval> | null>(null);
  const bannerPulse       = useRef(new Animated.Value(1)).current;

  // ── Banner pulse animation ──────────────────────────────────────────────────
  useEffect(() => {
    if (sosActive) {
      Animated.loop(
        Animated.sequence([
          Animated.timing(bannerPulse, { toValue: 1.03, duration: 600, useNativeDriver: true }),
          Animated.timing(bannerPulse, { toValue: 1,    duration: 600, useNativeDriver: true }),
        ])
      ).start();
    } else {
      bannerPulse.setValue(1);
    }
  }, [sosActive]);

  // ── Mount ───────────────────────────────────────────────────────────────────
  useEffect(() => {
    loadProfileAndSettings();
    requestInitialLocation();
    startLocationCaching();
    registerForPushNotifications();
    return () => { stopLocationCaching(); };
  }, []);

  // Reload settings on tab focus (sensitivity changes from Settings screen)
  useFocusEffect(
    useCallback(() => { loadProfileAndSettings(); }, [])
  );

  // ── Crash detection ─────────────────────────────────────────────────────────
  useEffect(() => {
    if (crashDetection) {
      const threshold = sensitivityToThreshold(sensitivity);
      startCrashDetection((result) => {
        setDetectedGForce(result.gForce);
        setCrashTimer(10);
        setCrashModalVisible(true);
        const speechMsg = result.severity === 'CRITICAL'
          ? 'Critical crash detected. Are you safe? Auto S O S in ten seconds.'
          : result.severity === 'HIGH'
            ? 'High impact crash detected. Are you safe? Auto S O S in ten seconds.'
            : 'Crash detected. Are you safe? Auto S O S in ten seconds.';
        Speech.speak(speechMsg, {
          language: i18n.language === 'hi' ? 'hi-IN' : 'en-US',
        });
      }, threshold);
    } else {
      stopCrashDetection();
    }
    return () => { stopCrashDetection(); };
  }, [crashDetection, sensitivity, i18n.language]);

  // ── Crash simulation listener ──────────────────────────────────────────────
  useEffect(() => {
    registerSimulateCallback(() => {
      setDetectedGForce(8.4);
      setCrashTimer(10);
      setCrashModalVisible(true);
      const speechMsg = 'Simulated crash detected. Are you safe? Auto S O S in ten seconds.';
      Speech.speak(speechMsg, {
        language: i18n.language === 'hi' ? 'hi-IN' : 'en-US',
      });
    });
    return () => { registerSimulateCallback(() => {}); };
  }, [i18n.language]);

  // ── Crash countdown ─────────────────────────────────────────────────────────
  useEffect(() => {
    if (crashModalVisible && crashTimer > 0) {
      crashTimerRef.current = setInterval(() => {
        setCrashTimer(prev => {
          if (prev <= 1) {
            clearInterval(crashTimerRef.current!);
            setCrashModalVisible(false);
            triggerSOS(true);
            return 0;
          }
          return prev - 1;
        });
      }, 1000);
    }
    return () => { if (crashTimerRef.current) clearInterval(crashTimerRef.current); };
  }, [crashModalVisible, crashTimer]);

  // ── Helpers ─────────────────────────────────────────────────────────────────
  const loadProfileAndSettings = async () => {
    try {
      const storedProfile = await AsyncStorage.getItem(PROFILE_KEY);
      if (storedProfile) {
        const parsed = JSON.parse(storedProfile);
        // Merge dedicated emergency contacts into profile for MedicalCard display
        const dedicated = await getEmergencyContacts();
        const seen = new Set((parsed.contacts ?? []).map((c: any) => c.phone));
        const merged = [
          ...(parsed.contacts ?? []),
          ...dedicated.filter(c => !seen.has(c.phone)),
        ];
        setProfile({ ...parsed, contacts: merged });
      } else {
        // No medical profile yet — still load dedicated contacts
        const dedicated = await getEmergencyContacts();
        if (dedicated.length > 0) {
          setProfile(prev => ({ ...prev, contacts: dedicated }));
        }
      }

      const storedSettings = await AsyncStorage.getItem(SETTINGS_KEY);
      if (storedSettings) {
        const s = JSON.parse(storedSettings);
        if (s.language)                    i18n.changeLanguage(s.language);
        if (s.offlineMode !== undefined)   setOfflineMode(s.offlineMode);
        if (s.crashDetection !== undefined) setCrashDetection(s.crashDetection);
        if (s.sensitivity)                 setSensitivity(s.sensitivity);
      }
    } catch (e) {
      console.error('Failed to load profile/settings:', e);
    }
  };

  const requestInitialLocation = async () => {
    setLoadingLocation(true);
    const loc = await getCurrentLocation();
    setLocation(loc);
    setLoadingLocation(false);
  };

  // ── SOS press handler ───────────────────────────────────────────────────────
  const handleSosPress = () => {
    if (sosActive) {
      // Cancel — stop live location updates + notify contacts "All Clear"
      setSosActive(false);
      if (countdownRef.current) clearInterval(countdownRef.current);
      setCountdown(0);
      setResults({ hospital: [], police: [], ambulance: [], towing: [] });
      cancelEmergencyAlert(profile.name || 'User');
      Speech.speak('S O S cancelled. Contacts notified you are safe.', { language: 'en-US' });
      return;
    }

    // Start 3-second countdown
    setSosActive(true);
    setCountdown(3);
    Speech.speak('S O S triggered. Alerting contacts in three seconds.', {
      language: i18n.language === 'hi' ? 'hi-IN' : 'en-US',
    });

    countdownRef.current = setInterval(() => {
      setCountdown(prev => {
        if (prev <= 1) {
          clearInterval(countdownRef.current!);
          triggerSOS(false);
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
  };

  // ── Core SOS trigger ────────────────────────────────────────────────────────
  const triggerSOS = async (isAutoCrash: boolean) => {
    setSosActive(true);
    setCountdown(0);
    setFetchError(false);

    // 1. Get GPS
    setLoadingLocation(true);
    const currentLoc = await getCurrentLocation();
    setLocation(currentLoc);
    setLoadingLocation(false);

    const lat = currentLoc?.latitude  ?? 18.5204;
    const lon = currentLoc?.longitude ?? 73.8567;

    // 2. Merge contacts from both sources
    const profileContacts = profile.contacts.filter(c => c.phone);
    const dedicatedContacts = await getEmergencyContacts();
    const seen = new Set(profileContacts.map(c => c.phone));
    const validContacts = [
      ...profileContacts,
      ...dedicatedContacts.filter(c => !seen.has(c.phone)),
    ];

    // 3. Trigger alert via alertService (handles online/offline/Firebase/SMS)
    const statusMsg = await triggerEmergencyAlert({
      userName: profile.name || 'User',
      latitude: lat,
      longitude: lon,
      contacts: validContacts,
      isAutoCrash,
    });

    if (validContacts.length > 0) {
      Alert.alert(isAutoCrash ? 'Auto-SOS Triggered' : 'SOS Sent', statusMsg);
    } else {
      Alert.alert('No Contacts', 'Add emergency contacts in the Contacts tab.');
    }

    // 4. Fetch nearby services
    setLoadingTabs({ hospital: true, police: true, ambulance: true, towing: true });
    const isOnlineNow = await checkNetworkConnectivity();
    try {
      await fetchAllEmergencyServices(lat, lon, isOnlineNow && !offlineMode, (type, categoryResults) => {
        setResults(prev => ({ ...prev, [type]: categoryResults }));
        setLoadingTabs(prev => ({ ...prev, [type]: false }));
      });
    } catch {
      setFetchError(true);
      setLoadingTabs({ hospital: false, police: false, ambulance: false, towing: false });
    }

    Speech.speak(
      isAutoCrash
        ? 'Crash detected. Sending emergency alerts and finding nearest hospitals.'
        : 'Emergency mode active. Alerting contacts.',
      { language: i18n.language === 'hi' ? 'hi-IN' : 'en-US' }
    );
  };

  const handleDialHelp = (number: string, label: string) =>
    makeCall(number, label, 'emergency', true);

  const currentResults = activeTab === 'hospital'
    ? getRecommendedHospitals(results.hospital)
    : results[activeTab];
  const currentLoading = loadingTabs[activeTab];
  const anyLoading     = Object.values(loadingTabs).some(Boolean);

  // ── Render ──────────────────────────────────────────────────────────────────
  return (
    <SafeAreaView style={styles.container}>

      {/* ── SOS ACTIVE BAR — shown during active SOS ── */}
      <SOSActiveBar
        visible={sosActive && countdown === 0}
        userName={profile.name || 'User'}
        onCancel={handleSosPress}
      />

      {/* ── ACTIVE BANNER ── */}
      {sosActive && (
        <Animated.View style={[styles.activeBanner, { transform: [{ scale: bannerPulse }] }]}>
          <AlertTriangle size={18} color="#fff" />
          <Text style={styles.activeBannerText}>🚨 EMERGENCY MODE ACTIVE</Text>
          {anyLoading && <ActivityIndicator size="small" color="#fff" style={{ marginLeft: 8 }} />}
        </Animated.View>
      )}

      <ScrollView
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        {/* ── HEADER ── */}
        <View style={styles.header}>
          <View style={styles.appTitleContainer}>
            <Shield color="#ff4d4d" size={26} />
            <View>
              <Text style={styles.appTitle}>{t('app_name')}</Text>
              {!sosActive && (
                <Text style={styles.appTagline}>Help in Seconds</Text>
              )}
            </View>
          </View>

          <View style={styles.headerRight}>
            <Pressable
              style={[styles.statusBadge, offlineMode ? styles.badgeOffline : styles.badgeOnline]}
              onPress={() => setOfflineMode(!offlineMode)}
            >
              {offlineMode
                ? <CloudOff size={13} color="#fff" />
                : <Wifi size={13} color="#fff" />}
              <Text style={styles.statusBadgeText}>
                {offlineMode ? t('offline') : t('online')}
              </Text>
            </Pressable>
          </View>
        </View>

        {/* ── SOS BUTTON ── */}
        <View style={styles.sosSection}>
          <EmergencyButton
            onPress={handleSosPress}
            title={countdown > 0 ? `${countdown}` : t('sos_button')}
            subtitle={sosActive ? t('cancel_sos') : offlineMode ? 'SOS — SMS MODE' : t('tap_emergency')}
            active={sosActive}
          />
        </View>

        {/* ── GPS ROW ── */}
        <View style={styles.gpsRow}>
          <Compass size={14} color="#aaa" />
          <Text style={styles.gpsText}>
            {loadingLocation
              ? t('gps_searching')
              : location
                ? `${t('gps_active')}: ${location.latitude.toFixed(4)}, ${location.longitude.toFixed(4)}`
                : 'GPS Offline'}
          </Text>
        </View>

        {/* ── ACTIVE STATE: Results ── */}
        {sosActive && (
          <View style={styles.resultsSection}>

            {/* Loading hint */}
            {anyLoading && (
              <View style={styles.locatingRow}>
                <ActivityIndicator size="small" color="#ff4d4d" />
                <Text style={styles.locatingText}>Locating nearest help...</Text>
              </View>
            )}

            {/* Error fallback */}
            {fetchError && !anyLoading && (
              <View style={styles.errorBanner}>
                <AlertTriangle size={16} color="#ffbe0b" />
                <Text style={styles.errorText}>
                  Could not reach live services. Showing cached data.
                </Text>
              </View>
            )}

            {/* Category tabs */}
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={styles.tabsScroll}
            >
              {TABS.map(tab => (
                <Pressable
                  key={tab.key}
                  style={[styles.tab, activeTab === tab.key && styles.tabActive]}
                  onPress={() => setActiveTab(tab.key)}
                >
                  {loadingTabs[tab.key] && (
                    <ActivityIndicator size="small" color="#ff4d4d" style={{ marginRight: 4 }} />
                  )}
                  <Text style={[styles.tabText, activeTab === tab.key && styles.tabTextActive]}>
                    {tab.label}
                    {results[tab.key].length > 0 ? ` (${results[tab.key].length})` : ''}
                  </Text>
                </Pressable>
              ))}
            </ScrollView>

            {/* Results list */}
            <View style={styles.resultsList}>
              {currentLoading
                ? [0, 1, 2].map(i => <ResultCardSkeleton key={i} />)
                : currentResults.length > 0
                  ? currentResults.map((r, idx) => (
                      <ResultCard key={r.place_id} result={r} isTop={idx === 0} />
                    ))
                  : (
                    <View style={styles.emptyState}>
                      <Text style={styles.emptyText}>
                        No {activeTab} services found nearby.{'\n'}
                        Use the national helplines below.
                      </Text>
                    </View>
                  )
              }
            </View>

            {/* Cancel SOS */}
            <Pressable style={styles.cancelSosBtn} onPress={handleSosPress}>
              <X size={18} color="#fff" />
              <Text style={styles.cancelSosBtnText}>CANCEL SOS</Text>
            </Pressable>
          </View>
        )}

        {/* ── IDLE STATE: Crash detection + Medical card ── */}
        {!sosActive && (
          <>
            <View style={styles.detectorRow}>
              <View style={styles.detectorLabelContainer}>
                <AlertTriangle size={17} color="#ffbe0b" />
                <Text style={styles.detectorLabel}>{t('detect_crashes')}</Text>
              </View>
              <Switch
                value={crashDetection}
                onValueChange={setCrashDetection}
                trackColor={{ false: '#767577', true: '#ff4d4d' }}
                thumbColor={crashDetection ? '#fff' : '#f4f3f4'}
              />
            </View>

            <View style={styles.medicalSection}>
              <MedicalCard profile={profile} t={t} />
            </View>
          </>
        )}

        {/* ── INDIA EMERGENCY HELPLINES (always visible) ── */}
        <View style={styles.helplinesContainer}>
          <Text style={styles.sectionTitle}>India National Helplines</Text>
          <View style={styles.helplineGrid}>
            {INDIA_EMERGENCY.map(item => (
              <Pressable
                key={item.number}
                style={styles.helplineCard}
                onPress={() => handleDialHelp(item.number, item.label)}
              >
                <PhoneCall size={14} color={item.color} />
                <Text style={[styles.helplineNumber, { color: item.color }]}>{item.number}</Text>
                <Text style={styles.helplineLabel}>{item.label}</Text>
              </Pressable>
            ))}
          </View>
        </View>

      </ScrollView>

      {/* ── CRASH DETECTION MODAL ── */}
      <Modal visible={crashModalVisible} transparent animationType="fade">
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <AlertTriangle color="#d90429" size={56} />
            <Text style={styles.modalTitle}>{t('are_you_safe')}</Text>
            <Text style={styles.modalGForce}>
              Detected Force: {detectedGForce.toFixed(2)} Gs
            </Text>
            <Text style={styles.modalTimer}>
              {t('auto_sos_in')}{' '}
              <Text style={styles.timerCount}>{crashTimer}</Text>{' '}
              {t('seconds')}
            </Text>
            <View style={styles.modalButtons}>
              <Pressable
                style={styles.safeButton}
                onPress={() => {
                  setCrashModalVisible(false);
                  if (crashTimerRef.current) clearInterval(crashTimerRef.current);
                  Speech.speak('Glad you are safe. S O S cancelled.', { language: 'en-US' });
                }}
              >
                <Text style={styles.safeButtonText}>{t('yes_safe')}</Text>
              </Pressable>
              <Pressable
                style={styles.dangerButton}
                onPress={() => {
                  setCrashModalVisible(false);
                  if (crashTimerRef.current) clearInterval(crashTimerRef.current);
                  triggerSOS(true);
                }}
              >
                <Text style={styles.dangerButtonText}>TRIGGER NOW</Text>
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────
const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#121214',
  },

  // Active banner
  activeBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#d90429',
    paddingVertical: 10,
    paddingHorizontal: 16,
    gap: 8,
  },
  activeBannerText: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '800',
    letterSpacing: 0.5,
  },

  scrollContent: {
    paddingHorizontal: 16,
    paddingBottom: 40,
  },

  // Header
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#212225',
  },
  appTitleContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  appTitle: {
    color: '#fff',
    fontSize: 22,
    fontWeight: 'bold',
    letterSpacing: 0.5,
  },
  appTagline: {
    color: '#888',
    fontSize: 11,
    marginTop: 1,
  },
  headerRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  statusBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 20,
    gap: 5,
  },
  badgeOnline:  { backgroundColor: '#2a9d8f' },
  badgeOffline: { backgroundColor: '#f77f00' },
  statusBadgeText: {
    color: '#fff',
    fontSize: 11,
    fontWeight: 'bold',
  },

  // SOS section
  sosSection: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 12,
  },

  // GPS row
  gpsRow: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    gap: 5,
    marginBottom: 16,
  },
  gpsText: {
    color: '#aaa',
    fontSize: 12,
  },

  // Results section
  resultsSection: {
    marginBottom: 20,
  },
  locatingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 10,
    marginBottom: 8,
  },
  locatingText: {
    color: '#aaa',
    fontSize: 13,
  },
  errorBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: 'rgba(255,190,11,0.1)',
    borderRadius: 8,
    padding: 10,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: 'rgba(255,190,11,0.3)',
  },
  errorText: {
    color: '#ffbe0b',
    fontSize: 12,
    flex: 1,
  },

  // Tabs
  tabsScroll: {
    gap: 8,
    paddingBottom: 12,
  },
  tab: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 20,
    backgroundColor: '#1e1e24',
    borderWidth: 1,
    borderColor: '#2e2e38',
  },
  tabActive: {
    backgroundColor: '#d90429',
    borderColor: '#d90429',
  },
  tabText: {
    color: '#aaa',
    fontSize: 13,
    fontWeight: '600',
  },
  tabTextActive: {
    color: '#fff',
  },

  // Results list
  resultsList: {
    marginTop: 4,
  },
  emptyState: {
    alignItems: 'center',
    paddingVertical: 32,
  },
  emptyText: {
    color: '#666',
    fontSize: 13,
    textAlign: 'center',
    lineHeight: 20,
  },

  // Cancel SOS
  cancelSosBtn: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    gap: 8,
    backgroundColor: '#1e1e24',
    borderWidth: 1.5,
    borderColor: '#d90429',
    paddingVertical: 13,
    borderRadius: 12,
    marginTop: 8,
  },
  cancelSosBtnText: {
    color: '#d90429',
    fontSize: 15,
    fontWeight: '800',
    letterSpacing: 0.5,
  },

  // Idle state
  detectorRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: '#1e1e24',
    padding: 14,
    borderRadius: 12,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: '#2e2e38',
  },
  detectorLabelContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  detectorLabel: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '600',
  },
  medicalSection: {
    marginBottom: 20,
  },

  // Helplines
  helplinesContainer: {
    marginBottom: 24,
  },
  sectionTitle: {
    color: '#aaa',
    fontSize: 11,
    fontWeight: 'bold',
    textTransform: 'uppercase',
    letterSpacing: 1,
    marginBottom: 10,
  },
  helplineGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  helplineCard: {
    flex: 1,
    minWidth: '45%',
    backgroundColor: '#1e1e24',
    padding: 12,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#2e2e38',
    alignItems: 'flex-start',
    gap: 4,
  },
  helplineNumber: {
    fontSize: 20,
    fontWeight: 'bold',
  },
  helplineLabel: {
    color: '#aaa',
    fontSize: 11,
  },

  // Crash modal
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.88)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
  },
  modalContent: {
    backgroundColor: '#1e1e24',
    borderRadius: 20,
    padding: 28,
    width: '100%',
    maxWidth: 400,
    alignItems: 'center',
    gap: 12,
    borderWidth: 1,
    borderColor: '#d90429',
  },
  modalTitle: {
    color: '#fff',
    fontSize: 24,
    fontWeight: 'bold',
  },
  modalGForce: {
    color: '#ffbe0b',
    fontSize: 15,
    fontWeight: 'bold',
  },
  modalTimer: {
    color: '#fff',
    fontSize: 15,
    textAlign: 'center',
  },
  timerCount: {
    color: '#d90429',
    fontSize: 22,
    fontWeight: 'bold',
  },
  modalButtons: {
    flexDirection: 'row',
    gap: 12,
    width: '100%',
    marginTop: 4,
  },
  safeButton: {
    flex: 1,
    backgroundColor: '#2a9d8f',
    paddingVertical: 14,
    borderRadius: 10,
    alignItems: 'center',
  },
  safeButtonText: {
    color: '#fff',
    fontSize: 15,
    fontWeight: 'bold',
  },
  dangerButton: {
    flex: 1,
    backgroundColor: '#d90429',
    paddingVertical: 14,
    borderRadius: 10,
    alignItems: 'center',
  },
  dangerButtonText: {
    color: '#fff',
    fontSize: 15,
    fontWeight: 'bold',
  },
});
