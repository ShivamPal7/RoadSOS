import AsyncStorage from '@react-native-async-storage/async-storage';
import * as ImagePicker from 'expo-image-picker';
import * as Speech from 'expo-speech';
import {
  AlertTriangle,
  Camera,
  CloudOff,
  Flame,
  Heart,
  ImagePlus,
  Play,
  Send,
  Square,
  Volume2,
  VolumeX,
  Wifi
} from 'lucide-react-native';
import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  ActivityIndicator,
  Alert,
  Image,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View
} from 'react-native';
import Animated, {
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withTiming
} from 'react-native-reanimated';
import { SafeAreaView } from 'react-native-safe-area-context';

import { analyzeAccidentPhoto, ChatMessage, getFirstAidGuidance, SeverityAnalysis } from '@/services/gemini';

// Mock base64 image strings for Vision Demo (Simulator-friendly testing)
const MOCK_CRASH_PHOTOS = [
  {
    name: 'Critical Rollover (Fire Risk)',
    description: 'An overturned car with smoke coming from the engine bay.',
    base64: 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=' // Minimal placeholder
  },
  {
    name: 'Moderate Head-On Collision',
    description: 'Front bumper crushed against a lamppost. Airbags deployed.',
    base64: 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII='
  },
  {
    name: 'Minor Fender Bender',
    description: 'Rear-end bumper scratch with no structural cabin damage.',
    base64: 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII='
  }
];

const SETTINGS_KEY = '@roadsos_settings_config';

export default function AssistantScreen() {
  const { t } = useTranslation();
  const [activeTab, setActiveTab] = useState<'chat' | 'cpr' | 'vision'>('chat');
  const [offlineMode, setOfflineMode] = useState(false);

  // Chat States
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [inputText, setInputText] = useState('');
  const [loadingChat, setLoadingChat] = useState(false);
  const [speakingMessageId, setSpeakingMessageId] = useState<string | null>(null);

  // CPR States
  const [cprRunning, setCprRunning] = useState(false);
  const [cprCount, setCprCount] = useState(0);
  const cprTimerRef = useRef<any | null>(null);
  const cprPulse = useSharedValue(1);

  // Vision States
  const [selectedMockPhoto, setSelectedMockPhoto] = useState<number | null>(null);
  const [analyzingImage, setAnalyzingImage] = useState(false);
  const [visionResult, setVisionResult] = useState<SeverityAnalysis | null>(null);
  const [capturedPhotoUri, setCapturedPhotoUri] = useState<string | null>(null);

  useEffect(() => {
    loadSettings();
    // Prepopulate chat with greeting
    setMessages([
      {
        id: 'welcome',
        sender: 'assistant',
        text: 'Hello. I am your AI First Aid Assistant. Tell me what has happened, or select a topic. I can guide you step-by-step.',
        timestamp: Date.now()
      }
    ]);

    return () => {
      stopCpr();
      Speech.stop();
    };
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

  // --- CPR Metronome Logic ---
  const startCpr = () => {
    setCprRunning(true);
    setCprCount(0);
    
    // Pulse animation at 100 BPM (600ms interval)
    cprPulse.value = withRepeat(
      withTiming(1.4, { duration: 300, easing: Easing.ease }),
      -1,
      true
    );

    cprTimerRef.current = setInterval(() => {
      setCprCount((c) => {
        const nextCount = c + 1;
        
        // Speak countdown or beep periodically
        if (nextCount % 30 === 0) {
          Speech.speak('Give 2 breaths', { rate: 1.1 });
        } else {
          // Play a audio pacing cue
          Speech.speak(`${(nextCount % 30) || 30}`, {
            rate: 1.5,
            volume: 0.2
          });
        }
        return nextCount;
      });
    }, 600); // 100 compressions per minute = 600ms per compression
  };

  const stopCpr = () => {
    setCprRunning(false);
    if (cprTimerRef.current) {
      clearInterval(cprTimerRef.current);
      cprTimerRef.current = null;
    }
    cprPulse.value = 1;
    Speech.stop();
  };

  const cprAnimatedStyle = useAnimatedStyle(() => {
    return {
      transform: [{ scale: cprPulse.value }],
      opacity: cprRunning ? 0.8 : 0.4
    };
  });

  // --- AI Chat Logic ---
  const handleSendMessage = async () => {
    if (!inputText.trim()) return;

    const userMsg: ChatMessage = {
      id: Date.now().toString(),
      sender: 'user',
      text: inputText,
      timestamp: Date.now()
    };

    setMessages((prev) => [...prev, userMsg]);
    setInputText('');
    setLoadingChat(true);

    // Call Gemini API (handles online/offline wrapper)
    const replyText = await getFirstAidGuidance(userMsg.text, !offlineMode);
    
    const aiMsg: ChatMessage = {
      id: (Date.now() + 1).toString(),
      sender: 'assistant',
      text: replyText,
      timestamp: Date.now()
    };

    setMessages((prev) => [...prev, aiMsg]);
    setLoadingChat(false);

    // Auto-read response aloud for hands-free
    handleSpeak(aiMsg);
  };

  const handleSpeak = (message: ChatMessage) => {
    if (speakingMessageId === message.id) {
      Speech.stop();
      setSpeakingMessageId(null);
    } else {
      Speech.stop();
      setSpeakingMessageId(message.id);
      
      // Clean up markdown tags for cleaner TTS speech
      const cleanText = message.text
        .replace(/[*#_`~]/g, '')
        .replace(/🔴|🫀|🔥|🗣️|🦴|ℹ️/g, '');

      Speech.speak(cleanText, {
        onDone: () => setSpeakingMessageId(null),
        onError: () => setSpeakingMessageId(null)
      });
    }
  };

  // --- Gemini Vision Logic ---
  const handleAnalyzePhoto = async (photoIndex: number) => {
    setSelectedMockPhoto(photoIndex);
    setCapturedPhotoUri(null);
    setAnalyzingImage(true);
    setVisionResult(null);

    const photo = MOCK_CRASH_PHOTOS[photoIndex];

    // Invoke image analyzer
    const analysis = await analyzeAccidentPhoto(photo.base64);
    setVisionResult(analysis);
    setAnalyzingImage(false);
  };

  const handleCaptureRealPhoto = async () => {
    Alert.alert(
      'Analyze Crash Photo',
      'Choose a source',
      [
        {
          text: 'Take Photo',
          onPress: async () => {
            const { status } = await ImagePicker.requestCameraPermissionsAsync();
            if (status !== 'granted') {
              Alert.alert('Permission Required', 'Camera access is needed.');
              return;
            }
            const result = await ImagePicker.launchCameraAsync({
              mediaTypes: ['images'],
              quality: 0.7,
              base64: true,
            });
            if (!result.canceled && result.assets[0]) {
              const asset = result.assets[0];
              setCapturedPhotoUri(asset.uri);
              setSelectedMockPhoto(null);
              setAnalyzingImage(true);
              setVisionResult(null);
              const analysis = await analyzeAccidentPhoto(asset.base64 || '');
              setVisionResult(analysis);
              setAnalyzingImage(false);
            }
          }
        },
        {
          text: 'Choose from Gallery',
          onPress: async () => {
            const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
            if (status !== 'granted') {
              Alert.alert('Permission Required', 'Gallery access is needed.');
              return;
            }
            const result = await ImagePicker.launchImageLibraryAsync({
              mediaTypes: ['images'],
              quality: 0.7,
              base64: true,
            });
            if (!result.canceled && result.assets[0]) {
              const asset = result.assets[0];
              setCapturedPhotoUri(asset.uri);
              setSelectedMockPhoto(null);
              setAnalyzingImage(true);
              setVisionResult(null);
              const analysis = await analyzeAccidentPhoto(asset.base64 || '');
              setVisionResult(analysis);
              setAnalyzingImage(false);
            }
          }
        },
        { text: 'Cancel', style: 'cancel' }
      ]
    );
  };

  return (
    <SafeAreaView style={styles.container} edges={['top', 'left', 'right']}>
      {/* Header Tabs */}
      <View style={styles.header}>
        <Text style={styles.headerTitle}>{t('ai_assistant')}</Text>
        <Pressable 
          style={[styles.statusBadge, offlineMode ? styles.badgeOffline : styles.badgeOnline]}
          onPress={() => setOfflineMode(!offlineMode)}
        >
          {offlineMode ? <CloudOff size={12} color="#fff" /> : <Wifi size={12} color="#fff" />}
          <Text style={styles.statusBadgeText}>
            {offlineMode ? t('offline') : t('online')}
          </Text>
        </Pressable>
      </View>

      {/* Tabs Selector */}
      <View style={styles.tabBar}>
        <Pressable
          style={[styles.tabItem, activeTab === 'chat' && styles.tabItemActive]}
          onPress={() => setActiveTab('chat')}
        >
          <Text style={[styles.tabText, activeTab === 'chat' && styles.tabTextActive]}>AI Help Chat</Text>
        </Pressable>
        <Pressable
          style={[styles.tabItem, activeTab === 'cpr' && styles.tabItemActive]}
          onPress={() => setActiveTab('cpr')}
        >
          <Text style={[styles.tabText, activeTab === 'cpr' && styles.tabTextActive]}>CPR Pace</Text>
        </Pressable>
        <Pressable
          style={[styles.tabItem, activeTab === 'vision' && styles.tabItemActive]}
          onPress={() => setActiveTab('vision')}
        >
          <Text style={[styles.tabText, activeTab === 'vision' && styles.tabTextActive]}>AI Vision</Text>
        </Pressable>
      </View>

      {/* Tab Contents */}
      {activeTab === 'chat' && (
        <View style={styles.chatContainer}>
          <ScrollView 
            style={styles.chatScroll}
            contentContainerStyle={styles.chatScrollContent}
            ref={(ref) => ref?.scrollToEnd({ animated: true })}
          >
            {messages.map((msg) => (
              <View
                key={msg.id}
                style={[
                  styles.msgWrapper,
                  msg.sender === 'user' ? styles.msgUserWrapper : styles.msgAiWrapper
                ]}
              >
                <View
                  style={[
                    styles.msgBubble,
                    msg.sender === 'user' ? styles.msgUserBubble : styles.msgAiBubble
                  ]}
                >
                  <Text style={styles.msgText}>{msg.text}</Text>
                </View>
                
                {msg.sender === 'assistant' && (
                  <Pressable style={styles.speakButton} onPress={() => handleSpeak(msg)}>
                    {speakingMessageId === msg.id ? (
                      <VolumeX size={16} color="#ff4d4d" />
                    ) : (
                      <Volume2 size={16} color="#aaa" />
                    )}
                  </Pressable>
                )}
              </View>
            ))}
            {loadingChat && (
              <View style={styles.loadingBubbleRow}>
                <ActivityIndicator size="small" color="#ff4d4d" />
                <Text style={styles.loadingText}>Gemini is preparing instructions...</Text>
              </View>
            )}
          </ScrollView>

          {/* Quick Guidance Chips */}
          <View style={styles.quickGuidesRow}>
            <Text style={styles.quickGuidesTitle}>Common Guidelines:</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.quickGuidesScroll}>
              <Pressable style={styles.guideChip} onPress={() => { setInputText('How to stop severe bleeding'); }}>
                <Text style={styles.guideChipText}>Bleeding</Text>
              </Pressable>
              <Pressable style={styles.guideChip} onPress={() => { setInputText('Step by step CPR guidelines'); }}>
                <Text style={styles.guideChipText}>CPR</Text>
              </Pressable>
              <Pressable style={styles.guideChip} onPress={() => { setInputText('Treatment for thermal burn'); }}>
                <Text style={styles.guideChipText}>Burns</Text>
              </Pressable>
              <Pressable style={styles.guideChip} onPress={() => { setInputText('Choking victim first aid'); }}>
                <Text style={styles.guideChipText}>Choking</Text>
              </Pressable>
            </ScrollView>
          </View>

          {/* Input Bar */}
          <View style={styles.inputBar}>
            <TextInput
              style={styles.textInput}
              placeholder={t('chat_placeholder')}
              placeholderTextColor="#666"
              value={inputText}
              onChangeText={setInputText}
              onSubmitEditing={handleSendMessage}
            />
            <Pressable style={styles.sendButton} onPress={handleSendMessage}>
              <Send size={18} color="#fff" />
            </Pressable>
          </View>
        </View>
      )}

      {activeTab === 'cpr' && (
        <View style={styles.cprContainer}>
          <Text style={styles.cprTitle}>{t('cpr_timer')}</Text>
          <Text style={styles.cprSubtitle}>
            Chest compressions should be delivered at a rate of 100 to 120 per minute. 
            Use this pulsing metronome to synchronize your compressions.
          </Text>

          {/* Pulsating heart rings */}
          <View style={styles.cprAnimationContainer}>
            <Animated.View style={[styles.cprRing, cprAnimatedStyle]} />
            <Pressable 
              style={[styles.cprMainCircle, cprRunning ? styles.cprCircleRunning : styles.cprCircleStopped]}
              onPress={cprRunning ? stopCpr : startCpr}
            >
              <Heart size={48} color="#fff" fill={cprRunning ? "#fff" : "transparent"} />
              <Text style={styles.cprCountText}>
                {cprRunning ? cprCount : t('start').toUpperCase()}
              </Text>
            </Pressable>
          </View>

          <View style={styles.cprControls}>
            {!cprRunning ? (
              <Pressable style={styles.cprStartBtn} onPress={startCpr}>
                <Play size={18} color="#fff" />
                <Text style={styles.cprBtnText}>START METRONOME</Text>
              </Pressable>
            ) : (
              <Pressable style={styles.cprStopBtn} onPress={stopCpr}>
                <Square size={18} color="#fff" />
                <Text style={styles.cprBtnText}>STOP METRONOME</Text>
              </Pressable>
            )}
          </View>
        </View>
      )}

      {activeTab === 'vision' && (
        <ScrollView style={styles.visionContainer} contentContainerStyle={styles.visionScrollContent}>
          <Text style={styles.visionTitle}>AI Crash Severity Analyzer</Text>
          <Text style={styles.visionSubtitle}>
            Capture or upload a photo of the accident scene. Gemini Vision analyzes structural damage,
            estimates crash severity, identifies safety risks, and recommends dispatch actions.
          </Text>

          {/* Real Camera / Gallery Button */}
          <Pressable style={styles.captureBtn} onPress={handleCaptureRealPhoto}>
            <ImagePlus size={20} color="#fff" />
            <Text style={styles.captureBtnText}>Take / Upload Real Photo</Text>
          </Pressable>

          {/* Show captured photo preview */}
          {capturedPhotoUri && (
            <View style={styles.capturedPhotoContainer}>
              <Image source={{ uri: capturedPhotoUri }} style={styles.capturedPhoto} resizeMode="cover" />
            </View>
          )}

          {/* Demo Gallery Selections */}
          <View style={styles.mockGallery}>
            <Text style={styles.galleryTitle}>Or select a demo scenario:</Text>
            {MOCK_CRASH_PHOTOS.map((photo, idx) => (
              <Pressable
                key={idx}
                style={[
                  styles.mockPhotoCard,
                  selectedMockPhoto === idx && styles.mockPhotoCardSelected
                ]}
                onPress={() => handleAnalyzePhoto(idx)}
              >
                <Camera size={20} color={selectedMockPhoto === idx ? '#ff4d4d' : '#888'} />
                <View style={styles.mockPhotoInfo}>
                  <Text style={styles.mockPhotoName}>{photo.name}</Text>
                  <Text style={styles.mockPhotoDesc}>{photo.description}</Text>
                </View>
              </Pressable>
            ))}
          </View>

          {/* Analysis Result Card */}
          {analyzingImage && (
            <View style={styles.visionLoadingCard}>
              <ActivityIndicator size="large" color="#ff4d4d" />
              <Text style={styles.visionLoadingText}>Gemini is evaluating crash image...</Text>
            </View>
          )}

          {visionResult && !analyzingImage && (
            <View style={styles.resultCard}>
              {/* Severity Badge */}
              <View style={styles.resultHeader}>
                <Text style={styles.resultHeaderLabel}>ESTIMATED SEVERITY:</Text>
                <View
                  style={[
                    styles.severityBadge,
                    visionResult.severity === 'critical' 
                      ? styles.severityCrit 
                      : visionResult.severity === 'moderate' 
                        ? styles.severityMod 
                        : styles.severityMinor
                  ]}
                >
                  <Text style={styles.severityText}>{visionResult.severity.toUpperCase()}</Text>
                </View>
              </View>

              {/* Risks */}
              <View style={styles.resultSection}>
                <View style={styles.sectionHeadingRow}>
                  <Flame size={16} color="#ffbe0b" />
                  <Text style={styles.sectionHeading}>IDENTIFIED RISKS</Text>
                </View>
                {visionResult.risks.map((risk, idx) => (
                  <Text key={idx} style={styles.bulletText}>• {risk}</Text>
                ))}
              </View>

              {/* Actions */}
              <View style={styles.resultSection}>
                <View style={styles.sectionHeadingRow}>
                  <AlertTriangle size={16} color="#ff4d4d" />
                  <Text style={styles.sectionHeading}>RECOMMENDED RESPONSES</Text>
                </View>
                {visionResult.recommendedActions.map((action, idx) => (
                  <Text key={idx} style={styles.bulletText}>• {action}</Text>
                ))}
              </View>
            </View>
          )}
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
  tabBar: {
    flexDirection: 'row',
    backgroundColor: '#1e1e24',
    padding: 4,
    borderRadius: 8,
    margin: 12,
  },
  tabItem: {
    flex: 1,
    paddingVertical: 8,
    alignItems: 'center',
    borderRadius: 6,
  },
  tabItemActive: {
    backgroundColor: '#2e3135',
  },
  tabText: {
    color: '#aaa',
    fontSize: 13,
    fontWeight: '600',
  },
  tabTextActive: {
    color: '#ff4d4d',
  },
  chatContainer: {
    flex: 1,
  },
  chatScroll: {
    flex: 1,
  },
  chatScrollContent: {
    padding: 16,
    gap: 12,
  },
  msgWrapper: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: 8,
    marginVertical: 4,
  },
  msgUserWrapper: {
    justifyContent: 'flex-end',
  },
  msgAiWrapper: {
    justifyContent: 'flex-start',
  },
  msgBubble: {
    maxWidth: '80%',
    padding: 12,
    borderRadius: 16,
  },
  msgUserBubble: {
    backgroundColor: '#ff4d4d',
    borderBottomRightRadius: 2,
  },
  msgAiBubble: {
    backgroundColor: '#1e1e24',
    borderBottomLeftRadius: 2,
    borderWidth: 0.5,
    borderColor: '#2e2e38',
  },
  msgText: {
    color: '#fff',
    fontSize: 14,
    lineHeight: 20,
  },
  speakButton: {
    padding: 8,
  },
  loadingBubbleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 12,
  },
  loadingText: {
    color: '#888',
    fontSize: 12,
  },
  quickGuidesRow: {
    backgroundColor: '#121214',
    paddingVertical: 10,
    borderTopWidth: 1,
    borderTopColor: '#212225',
    paddingHorizontal: 12,
  },
  quickGuidesTitle: {
    color: '#888',
    fontSize: 11,
    fontWeight: 'bold',
    marginBottom: 6,
    textTransform: 'uppercase',
  },
  quickGuidesScroll: {
    gap: 8,
  },
  guideChip: {
    backgroundColor: '#1e1e24',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#2e2e38',
    marginRight: 6,
  },
  guideChipText: {
    color: '#fff',
    fontSize: 12,
    fontWeight: '500',
  },
  inputBar: {
    flexDirection: 'row',
    paddingHorizontal: 12,
    paddingVertical: 10,
    backgroundColor: '#1e1e24',
    alignItems: 'center',
    gap: 8,
  },
  textInput: {
    flex: 1,
    height: 40,
    backgroundColor: '#121214',
    borderRadius: 20,
    paddingHorizontal: 16,
    color: '#fff',
    fontSize: 14,
    borderWidth: 1,
    borderColor: '#2e2e38',
  },
  sendButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: '#ff4d4d',
    justifyContent: 'center',
    alignItems: 'center',
  },
  cprContainer: {
    flex: 1,
    padding: 24,
    alignItems: 'center',
    justifyContent: 'center',
  },
  cprTitle: {
    color: '#fff',
    fontSize: 22,
    fontWeight: 'bold',
    marginBottom: 10,
  },
  cprSubtitle: {
    color: '#aaa',
    fontSize: 13,
    textAlign: 'center',
    lineHeight: 18,
    marginBottom: 30,
  },
  cprAnimationContainer: {
    width: 220,
    height: 220,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 40,
  },
  cprRing: {
    position: 'absolute',
    width: 160,
    height: 160,
    borderRadius: 80,
    backgroundColor: 'rgba(219, 4, 41, 0.15)',
    borderWidth: 1.5,
    borderColor: '#db0429',
  },
  cprMainCircle: {
    width: 140,
    height: 140,
    borderRadius: 70,
    justifyContent: 'center',
    alignItems: 'center',
    elevation: 8,
  },
  cprCircleRunning: {
    backgroundColor: '#db0429',
  },
  cprCircleStopped: {
    backgroundColor: '#2e3135',
  },
  cprCountText: {
    color: '#fff',
    fontSize: 24,
    fontWeight: 'bold',
    marginTop: 8,
  },
  cprControls: {
    width: '100%',
    maxWidth: 280,
  },
  cprStartBtn: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    gap: 8,
    backgroundColor: '#2a9d8f',
    paddingVertical: 14,
    borderRadius: 10,
  },
  cprStopBtn: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    gap: 8,
    backgroundColor: '#d90429',
    paddingVertical: 14,
    borderRadius: 10,
  },
  cprBtnText: {
    color: '#fff',
    fontSize: 15,
    fontWeight: 'bold',
  },
  visionContainer: {
    flex: 1,
  },
  visionScrollContent: {
    padding: 16,
  },
  visionTitle: {
    color: '#fff',
    fontSize: 20,
    fontWeight: 'bold',
    marginBottom: 8,
  },
  visionSubtitle: {
    color: '#aaa',
    fontSize: 13,
    lineHeight: 18,
    marginBottom: 20,
  },
  mockGallery: {
    backgroundColor: '#1e1e24',
    borderRadius: 16,
    padding: 16,
    borderWidth: 1,
    borderColor: '#2e2e38',
    marginBottom: 20,
  },
  galleryTitle: {
    color: '#fff',
    fontSize: 14,
    fontWeight: 'bold',
    marginBottom: 12,
  },
  mockPhotoCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 10,
    borderBottomWidth: 0.5,
    borderBottomColor: '#2e2e38',
  },
  mockPhotoCardSelected: {
    backgroundColor: 'rgba(255, 77, 77, 0.05)',
  },
  mockPhotoInfo: {
    flex: 1,
  },
  mockPhotoName: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '600',
  },
  mockPhotoDesc: {
    color: '#aaa',
    fontSize: 11,
    marginTop: 2,
  },
  visionLoadingCard: {
    backgroundColor: '#1e1e24',
    borderRadius: 16,
    padding: 24,
    alignItems: 'center',
    gap: 12,
    borderWidth: 1,
    borderColor: '#2e2e38',
  },
  visionLoadingText: {
    color: '#fff',
    fontSize: 14,
  },
  resultCard: {
    backgroundColor: '#1e1e24',
    borderRadius: 16,
    padding: 16,
    borderWidth: 1,
    borderColor: '#2e2e38',
  },
  resultHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    borderBottomWidth: 1,
    borderBottomColor: '#2e2e38',
    paddingBottom: 12,
    marginBottom: 12,
  },
  resultHeaderLabel: {
    color: '#888',
    fontSize: 11,
    fontWeight: '700',
  },
  severityBadge: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 6,
  },
  severityCrit: {
    backgroundColor: '#d90429',
  },
  severityMod: {
    backgroundColor: '#f77f00',
  },
  severityMinor: {
    backgroundColor: '#2a9d8f',
  },
  severityText: {
    color: '#fff',
    fontSize: 12,
    fontWeight: '900',
  },
  resultSection: {
    marginBottom: 16,
  },
  sectionHeadingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginBottom: 8,
  },
  sectionHeading: {
    color: '#fff',
    fontSize: 12,
    fontWeight: '800',
  },
  bulletText: {
    color: '#ccc',
    fontSize: 13,
    lineHeight: 18,
    marginLeft: 6,
    marginBottom: 4,
  },
  captureBtn: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    gap: 10,
    backgroundColor: '#ff4d4d',
    paddingVertical: 14,
    borderRadius: 12,
    marginBottom: 16,
  },
  captureBtnText: {
    color: '#fff',
    fontSize: 15,
    fontWeight: 'bold',
  },
  capturedPhotoContainer: {
    borderRadius: 12,
    overflow: 'hidden',
    marginBottom: 16,
    borderWidth: 1,
    borderColor: '#2a9d8f',
  },
  capturedPhoto: {
    width: '100%',
    height: 200,
  },
});
