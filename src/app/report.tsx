import AsyncStorage from '@react-native-async-storage/async-storage';
import * as ImagePicker from 'expo-image-picker';
import { Camera, CheckCircle2, CloudOff, FileText, Share2, Wifi, X } from 'lucide-react-native';
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
    ActivityIndicator,
    Alert,
    Image,
    Pressable,
    ScrollView,
    Share,
    StyleSheet,
    Text,
    TextInput,
    View
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { checkNetworkConnectivity, getCurrentLocation } from '@/services/location';

const SETTINGS_KEY = '@roadsos_settings_config';

export default function ReportScreen() {
  const { t } = useTranslation();
  const [offlineMode, setOfflineMode] = useState(false);
  const [loading, setLoading] = useState(false);

  // Form Fields
  const [accidentType, setAccidentType] = useState('collision');
  const [injuredCount, setInjuredCount] = useState('1');
  const [vehicleType, setVehicleType] = useState('car');
  const [description, setDescription] = useState('');
  const [photoAttached, setPhotoAttached] = useState(false);
  const [photoUri, setPhotoUri] = useState<string | null>(null);
  const [reportSubmitted, setReportSubmitted] = useState(false);

  useEffect(() => {
    loadSettings();
  }, []);

  const loadSettings = async () => {
    try {
      const storedSettings = await AsyncStorage.getItem(SETTINGS_KEY);
      if (storedSettings) {
        const settingsObj = JSON.parse(storedSettings);
        if (settingsObj.offlineMode !== undefined) {
          setOfflineMode(settingsObj.offlineMode);
        }
      }
    } catch (e) {
      console.error(e);
    }
  };

  const handleTogglePhoto = async () => {
    if (photoAttached) {
      // Remove attached photo
      setPhotoAttached(false);
      setPhotoUri(null);
      return;
    }

    // Show action sheet: camera or gallery
    Alert.alert(
      'Attach Photo',
      'Choose a source for the accident photo',
      [
        {
          text: 'Take Photo',
          onPress: async () => {
            const { status } = await ImagePicker.requestCameraPermissionsAsync();
            if (status !== 'granted') {
              Alert.alert('Permission Required', 'Camera access is needed to take a photo.');
              return;
            }
            const result = await ImagePicker.launchCameraAsync({
              mediaTypes: ['images'],
              quality: 0.7,
              base64: false,
            });
            if (!result.canceled && result.assets[0]) {
              setPhotoUri(result.assets[0].uri);
              setPhotoAttached(true);
            }
          }
        },
        {
          text: 'Choose from Gallery',
          onPress: async () => {
            const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
            if (status !== 'granted') {
              Alert.alert('Permission Required', 'Gallery access is needed to select a photo.');
              return;
            }
            const result = await ImagePicker.launchImageLibraryAsync({
              mediaTypes: ['images'],
              quality: 0.7,
              base64: false,
            });
            if (!result.canceled && result.assets[0]) {
              setPhotoUri(result.assets[0].uri);
              setPhotoAttached(true);
            }
          }
        },
        { text: 'Cancel', style: 'cancel' }
      ]
    );
  };

  const generateReportText = async (): Promise<string> => {
    const loc = await getCurrentLocation();
    const lat = loc?.latitude ?? 18.5204;
    const lon = loc?.longitude ?? 73.8567;
    const time = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

    return `⚠️ ROADSOS INCIDENT REPORT ⚠️
- Time: ${time}
- Location: https://www.google.com/maps/search/?api=1&query=${lat},${lon}
- Type: ${accidentType.toUpperCase()}
- Injured Count: ${injuredCount}
- Vehicles Involved: ${vehicleType.toUpperCase()}
- Details: ${description || 'No additional details provided.'}
- Status: Responders requested.`;
  };

  const handleSubmit = async () => {
    setLoading(true);
    const reportText = await generateReportText();

    // Check real network connectivity
    const isOnline = await checkNetworkConnectivity();

    if (!isOnline || offlineMode) {
      // Offline mode saving
      try {
        const reportsStr = await AsyncStorage.getItem('@roadsos_offline_reports');
        const reportsList = reportsStr ? JSON.parse(reportsStr) : [];
        reportsList.push({
          id: Date.now(),
          text: reportText,
          timestamp: Date.now(),
          synced: false
        });
        await AsyncStorage.setItem('@roadsos_offline_reports', JSON.stringify(reportsList));
        setReportSubmitted(true);
        Alert.alert('Offline Mode', 'Report saved locally. It will auto-sync when you connect to a network.');
      } catch (e) {
        Alert.alert('Error', 'Failed to save report locally.');
      }
    } else {
      // Online mode: Send to backend
      const serverUrl = process.env.EXPO_PUBLIC_SERVER_URL || 'http://10.0.2.2:5000';
      try {
        const loc = await getCurrentLocation();
        const response = await fetch(`${serverUrl}/api/reports/submit`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            accidentType,
            injuredCount,
            vehicleType,
            description,
            latitude: loc?.latitude ?? 18.5204,
            longitude: loc?.longitude ?? 73.8567,
            photoAttached
          })
        });

        if (response.ok) {
          setReportSubmitted(true);
          Alert.alert('Success', 'Report successfully filed with local emergency services!');
        } else {
          throw new Error('Server returned an error');
        }
      } catch (e) {
        console.warn('Backend server not reachable, saving offline', e);
        // Fallback to local offline storage
        const reportsStr = await AsyncStorage.getItem('@roadsos_offline_reports');
        const reportsList = reportsStr ? JSON.parse(reportsStr) : [];
        reportsList.push({
          id: Date.now(),
          text: reportText,
          timestamp: Date.now(),
          synced: false
        });
        await AsyncStorage.setItem('@roadsos_offline_reports', JSON.stringify(reportsList));
        setReportSubmitted(true);
        Alert.alert('Server Offline', 'Server not reachable. Saved report locally as fallback.');
      }
    }
    setLoading(false);
  };

  const handleShare = async () => {
    const reportText = await generateReportText();
    try {
      await Share.share({
        message: reportText,
        title: 'RoadSOS Incident Report'
      });
    } catch (error) {
      console.error('Sharing failed', error);
    }
  };

  const resetForm = () => {
    setAccidentType('collision');
    setInjuredCount('1');
    setVehicleType('car');
    setDescription('');
    setPhotoAttached(false);
    setPhotoUri(null);
    setReportSubmitted(false);
  };

  return (
    <SafeAreaView style={styles.container} edges={['top', 'left', 'right']}>
      {/* Header */}
      <View style={styles.header}>
        <View style={styles.headerLeft}>
          <FileText color="#ff4d4d" size={24} />
          <Text style={styles.headerTitle}>{t('quick_report')}</Text>
        </View>
        <View style={[styles.statusBadge, offlineMode ? styles.badgeOffline : styles.badgeOnline]}>
          {offlineMode ? <CloudOff size={12} color="#fff" /> : <Wifi size={12} color="#fff" />}
          <Text style={styles.statusBadgeText}>
            {offlineMode ? t('offline') : t('online')}
          </Text>
        </View>
      </View>

      {reportSubmitted ? (
        <View style={styles.successContainer}>
          <CheckCircle2 color="#2a9d8f" size={72} style={styles.successIcon} />
          <Text style={styles.successTitle}>Report Submitted!</Text>
          <Text style={styles.successSubtitle}>
            Your incident report has been registered. You can share this report template via WhatsApp 
            or SMS to inform others.
          </Text>

          <View style={styles.successButtons}>
            <Pressable style={styles.shareBtn} onPress={handleShare}>
              <Share2 size={18} color="#fff" />
              <Text style={styles.btnText}>SHARE REPORT</Text>
            </Pressable>
            
            <Pressable style={styles.resetBtn} onPress={resetForm}>
              <Text style={styles.resetBtnText}>FILE NEW REPORT</Text>
            </Pressable>
          </View>
        </View>
      ) : (
        <ScrollView contentContainerStyle={styles.scrollContent}>
          {/* Form Description */}
          <Text style={styles.formInstructions}>
            Provide details of the accident. This information helps hospitals and emergency responders 
            prepare response equipment before arriving at the scene.
          </Text>

          {/* Accident Type Selector */}
          <Text style={styles.label}>{t('accident_type')}</Text>
          <View style={styles.selectorGroup}>
            {['collision', 'rollover', 'fire', 'other'].map((type) => (
              <Pressable
                key={type}
                style={[
                  styles.selectorItem,
                  accidentType === type ? styles.selectorItemActive : styles.selectorItemInactive
                ]}
                onPress={() => setAccidentType(type)}
              >
                <Text
                  style={[
                    styles.selectorText,
                    accidentType === type ? styles.selectorTextActive : styles.selectorTextInactive
                  ]}
                >
                  {t(type)}
                </Text>
              </Pressable>
            ))}
          </View>

          {/* Injured Count Selector */}
          <Text style={styles.label}>{t('injured_count')}</Text>
          <View style={styles.selectorGroup}>
            {['0', '1', '2', '3', '4+'].map((count) => (
              <Pressable
                key={count}
                style={[
                  styles.selectorItem,
                  injuredCount === count ? styles.selectorItemActive : styles.selectorItemInactive
                ]}
                onPress={() => setInjuredCount(count)}
              >
                <Text
                  style={[
                    styles.selectorText,
                    injuredCount === count ? styles.selectorTextActive : styles.selectorTextInactive
                  ]}
                >
                  {count}
                </Text>
              </Pressable>
            ))}
          </View>

          {/* Vehicle Type Selector */}
          <Text style={styles.label}>{t('vehicle_type')}</Text>
          <View style={styles.selectorGroup}>
            {['car', 'bike', 'truck', 'pedestrian'].map((veh) => (
              <Pressable
                key={veh}
                style={[
                  styles.selectorItem,
                  vehicleType === veh ? styles.selectorItemActive : styles.selectorItemInactive
                ]}
                onPress={() => setVehicleType(veh)}
              >
                <Text
                  style={[
                    styles.selectorText,
                    vehicleType === veh ? styles.selectorTextActive : styles.selectorTextInactive
                  ]}
                >
                  {veh.toUpperCase()}
                </Text>
              </Pressable>
            ))}
          </View>

          {/* Description details input */}
          <Text style={styles.label}>{t('description')}</Text>
          <TextInput
            style={styles.textArea}
            multiline
            numberOfLines={4}
            placeholder="Add details e.g., vehicle plate numbers, highway milestone, lane blocked..."
            placeholderTextColor="#666"
            value={description}
            onChangeText={setDescription}
          />

          {/* Attachment slot */}
          <Pressable 
            style={[styles.attachmentSlot, photoAttached && styles.attachmentSlotAttached]}
            onPress={handleTogglePhoto}
          >
            {photoAttached && photoUri ? (
              <View style={styles.photoPreviewContainer}>
                <Image source={{ uri: photoUri }} style={styles.photoPreview} resizeMode="cover" />
                <Pressable style={styles.removePhotoBtn} onPress={handleTogglePhoto}>
                  <X size={16} color="#fff" />
                </Pressable>
                <Text style={styles.attachmentTextAttached}>Crash Photo Attached ✓</Text>
              </View>
            ) : (
              <>
                <Camera size={24} color="#888" />
                <Text style={styles.attachmentText}>Attach Photo of Incident</Text>
              </>
            )}
          </Pressable>

          {/* Submit Action */}
          <View style={styles.formActions}>
            <Pressable style={styles.submitBtn} onPress={handleSubmit} disabled={loading}>
              {loading ? (
                <ActivityIndicator size="small" color="#fff" />
              ) : (
                <Text style={styles.btnText}>{t('submit').toUpperCase()}</Text>
              )}
            </Pressable>

            <Pressable style={styles.shareFormBtn} onPress={handleShare}>
              <Share2 size={16} color="#aaa" />
              <Text style={styles.shareFormBtnText}>SHARE QUICK TEXT</Text>
            </Pressable>
          </View>
        </ScrollView>
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#121214',
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#212225',
  },
  headerLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  headerTitle: {
    color: '#fff',
    fontSize: 20,
    fontWeight: 'bold',
  },
  statusBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 12,
    gap: 4,
  },
  badgeOnline: {
    backgroundColor: '#2a9d8f',
  },
  badgeOffline: {
    backgroundColor: '#f77f00',
  },
  statusBadgeText: {
    color: '#fff',
    fontSize: 10,
    fontWeight: 'bold',
  },
  scrollContent: {
    padding: 16,
  },
  formInstructions: {
    color: '#aaa',
    fontSize: 13,
    lineHeight: 18,
    marginBottom: 20,
  },
  label: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '600',
    marginBottom: 8,
    textTransform: 'uppercase',
  },
  selectorGroup: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
    marginBottom: 20,
  },
  selectorItem: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 8,
    borderWidth: 1,
  },
  selectorItemActive: {
    backgroundColor: '#ff4d4d',
    borderColor: '#ff4d4d',
  },
  selectorItemInactive: {
    backgroundColor: '#1e1e24',
    borderColor: '#2e2e38',
  },
  selectorText: {
    fontSize: 12,
    fontWeight: '700',
  },
  selectorTextActive: {
    color: '#fff',
  },
  selectorTextInactive: {
    color: '#aaa',
  },
  textArea: {
    backgroundColor: '#1e1e24',
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#2e2e38',
    padding: 12,
    color: '#fff',
    fontSize: 14,
    height: 100,
    textAlignVertical: 'top',
    marginBottom: 20,
  },
  attachmentSlot: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
    backgroundColor: '#1e1e24',
    borderWidth: 1.5,
    borderColor: '#2e2e38',
    borderStyle: 'dashed',
    borderRadius: 10,
    paddingVertical: 16,
    marginBottom: 30,
  },
  attachmentSlotAttached: {
    backgroundColor: 'rgba(42, 157, 143, 0.05)',
    borderColor: '#2a9d8f',
    borderStyle: 'solid',
  },
  attachmentText: {
    color: '#aaa',
    fontSize: 14,
    fontWeight: '600',
  },
  attachmentTextAttached: {
    color: '#2a9d8f',
    fontSize: 13,
    fontWeight: '600',
    marginTop: 6,
  },
  photoPreviewContainer: {
    width: '100%',
    alignItems: 'center',
  },
  photoPreview: {
    width: '100%',
    height: 160,
    borderRadius: 8,
    marginBottom: 4,
  },
  removePhotoBtn: {
    position: 'absolute',
    top: 8,
    right: 8,
    backgroundColor: 'rgba(0,0,0,0.6)',
    borderRadius: 12,
    padding: 4,
  },
  formActions: {
    gap: 12,
    paddingBottom: 20,
  },
  submitBtn: {
    backgroundColor: '#ff4d4d',
    paddingVertical: 14,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  shareFormBtn: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    gap: 8,
    backgroundColor: '#1e1e24',
    borderWidth: 1,
    borderColor: '#2e2e38',
    paddingVertical: 12,
    borderRadius: 10,
  },
  shareFormBtnText: {
    color: '#aaa',
    fontSize: 14,
    fontWeight: 'bold',
  },
  btnText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: 'bold',
  },
  successContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
  },
  successIcon: {
    marginBottom: 20,
  },
  successTitle: {
    color: '#fff',
    fontSize: 24,
    fontWeight: 'bold',
    marginBottom: 10,
  },
  successSubtitle: {
    color: '#aaa',
    fontSize: 14,
    textAlign: 'center',
    lineHeight: 20,
    marginBottom: 40,
  },
  successButtons: {
    width: '100%',
    maxWidth: 280,
    gap: 12,
  },
  shareBtn: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    gap: 8,
    backgroundColor: '#2a9d8f',
    paddingVertical: 14,
    borderRadius: 10,
  },
  resetBtn: {
    justifyContent: 'center',
    alignItems: 'center',
    paddingVertical: 12,
  },
  resetBtnText: {
    color: '#ff4d4d',
    fontSize: 14,
    fontWeight: 'bold',
  },
});
