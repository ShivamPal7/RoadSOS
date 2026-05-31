/**
 * contacts.tsx — Feature 3: Instant Calling / Contacts Screen
 *
 * Section 1 — National Emergency Numbers (pinned, non-removable 2×2 grid)
 * Section 2 — My Emergency Contacts (up to 5, with add/delete/import)
 * Section 3 — Recent Calls Log (last 10, tap to call again)
 */

import { useFocusEffect } from 'expo-router';
import {
    Phone, PhoneCall, PhoneOff,
    Plus, Trash2, UserPlus, Users, X
} from 'lucide-react-native';
import { useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
    Alert, FlatList, Modal, Pressable, ScrollView,
    StyleSheet, Text, TextInput, View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { CallButton } from '@/components/CallButton';
import { INDIA_EMERGENCY } from '@/constants/emergencyNumbers';
import { CallHistoryEntry, clearCallHistory, getCallHistory, makeCall } from '@/services/callService';
import {
    EmergencyContact, avatarColor,
    deleteEmergencyContact,
    fetchDeviceContacts,
    getEmergencyContacts, saveEmergencyContact,
} from '@/services/contactsService';

const RELATION_OPTIONS = [
  { value: 'family', label: 'Family' },
  { value: 'friend', label: 'Friend' },
  { value: 'doctor', label: 'Doctor' },
  { value: 'other',  label: 'Other'  },
] as const;

type Relation = 'family' | 'friend' | 'doctor' | 'other';

// ── Helpers ───────────────────────────────────────────────────────────────────
const formatTimestamp = (iso: string): string => {
  const d = new Date(iso);
  const now = new Date();
  const diffMs = now.getTime() - d.getTime();
  const diffMins = Math.floor(diffMs / 60000);
  if (diffMins < 1)  return 'Just now';
  if (diffMins < 60) return `${diffMins}m ago`;
  const diffHrs = Math.floor(diffMins / 60);
  if (diffHrs < 24)  return `${diffHrs}h ago`;
  return d.toLocaleDateString();
};

const categoryColor: Record<string, string> = {
  emergency: '#d90429',
  hospital:  '#2a9d8f',
  police:    '#457b9d',
  ambulance: '#2a9d8f',
  towing:    '#f77f00',
  personal:  '#8338ec',
  service:   '#6c757d',
};

// ── Main screen ───────────────────────────────────────────────────────────────
export default function ContactsScreen() {
  const { t } = useTranslation();

  const [contacts, setContacts]         = useState<EmergencyContact[]>([]);
  const [callHistory, setCallHistory]   = useState<CallHistoryEntry[]>([]);
  const [showAddModal, setShowAddModal] = useState(false);
  const [showImportModal, setShowImportModal] = useState(false);
  const [deviceContacts, setDeviceContacts]   = useState<{ name: string; phone: string }[]>([]);
  const [importSearch, setImportSearch] = useState('');

  // Add contact form state
  const [formName, setFormName]       = useState('');
  const [formPhone, setFormPhone]     = useState('');
  const [formRelation, setFormRelation] = useState<Relation>('family');

  const loadData = useCallback(async () => {
    const [c, h] = await Promise.all([getEmergencyContacts(), getCallHistory()]);
    setContacts(c);
    setCallHistory(h);
  }, []);

  useEffect(() => { loadData(); }, []);
  useFocusEffect(useCallback(() => { loadData(); }, []));

  // ── Add contact ─────────────────────────────────────────────────────────────
  const handleSaveContact = async () => {
    if (!formName.trim()) { Alert.alert('Required', 'Please enter a name.'); return; }
    if (!formPhone.trim()) { Alert.alert('Required', 'Please enter a phone number.'); return; }

    const ok = await saveEmergencyContact({
      name: formName.trim(),
      phone: formPhone.trim(),
      relation: formRelation,
    });

    if (ok) {
      setShowAddModal(false);
      setFormName(''); setFormPhone(''); setFormRelation('family');
      loadData();
    }
  };

  // ── Import from phone book ──────────────────────────────────────────────────
  const handleOpenImport = async () => {
    const list = await fetchDeviceContacts();
    if (list) {
      setDeviceContacts(list);
      setImportSearch('');
      setShowImportModal(true);
    }
  };

  const handleImportContact = async (c: { name: string; phone: string }) => {
    const ok = await saveEmergencyContact({ name: c.name, phone: c.phone, relation: 'family' });
    if (ok) { setShowImportModal(false); loadData(); }
  };

  // ── Delete contact ──────────────────────────────────────────────────────────
  const handleDelete = (id: string, name: string) => {
    Alert.alert(
      'Remove Contact',
      `Remove ${name} from emergency contacts?`,
      [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Remove', style: 'destructive', onPress: async () => {
          await deleteEmergencyContact(id);
          loadData();
        }},
      ]
    );
  };

  const filteredDeviceContacts = deviceContacts.filter(c =>
    c.name.toLowerCase().includes(importSearch.toLowerCase()) ||
    c.phone.includes(importSearch)
  );

  // ── Render ──────────────────────────────────────────────────────────────────
  return (
    <SafeAreaView style={styles.container} edges={['top', 'left', 'right']}>
      <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>

        {/* ── HEADER ── */}
        <View style={styles.header}>
          <PhoneCall size={24} color="#ff4d4d" />
          <Text style={styles.headerTitle}>Emergency Contacts</Text>
        </View>

        {/* ══════════════════════════════════════════════════════════════════ */}
        {/* SECTION 1 — National Emergency Numbers                           */}
        {/* ══════════════════════════════════════════════════════════════════ */}
        <View style={styles.sectionHeader}>
          <Text style={styles.sectionLabel}>🇮🇳 National Helplines</Text>
          <Text style={styles.sectionSub}>Always available · No internet needed</Text>
        </View>

        <View style={styles.emergencyGrid}>
          {INDIA_EMERGENCY.map(item => (
            <Pressable
              key={item.id}
              style={[styles.emergencyCard, { backgroundColor: item.color }]}
              onPress={() => makeCall(item.number, item.label, 'emergency', true)}
              accessibilityLabel={`Call ${item.label} ${item.number}`}
            >
              <Text style={styles.emergencyIcon}>{item.icon}</Text>
              <Text style={styles.emergencyNumber}>{item.number}</Text>
              <Text style={styles.emergencyLabel}>{item.label}</Text>
              <Text style={styles.emergencyDesc}>{item.description}</Text>
              <View style={styles.emergencyCallBtn}>
                <Phone size={14} color="#fff" />
                <Text style={styles.emergencyCallText}>CALL</Text>
              </View>
            </Pressable>
          ))}
        </View>

        {/* ══════════════════════════════════════════════════════════════════ */}
        {/* SECTION 2 — My Emergency Contacts                                */}
        {/* ══════════════════════════════════════════════════════════════════ */}
        <View style={styles.sectionHeader}>
          <Text style={styles.sectionLabel}>👤 My Emergency Contacts</Text>
          <Text style={styles.sectionSub}>{contacts.length}/5 saved</Text>
        </View>

        <View style={styles.contactsCard}>
          {contacts.length === 0 ? (
            <View style={styles.emptyContacts}>
              <Users size={36} color="#444" />
              <Text style={styles.emptyText}>No emergency contacts saved yet.</Text>
              <Text style={styles.emptySubText}>Add family or friends who should be alerted in an emergency.</Text>
            </View>
          ) : (
            contacts.map(contact => (
              <View key={contact.id} style={styles.contactRow}>
                {/* Avatar */}
                <View style={[styles.avatar, { backgroundColor: contact.avatarColor }]}>
                  <Text style={styles.avatarText}>
                    {contact.name.charAt(0).toUpperCase()}
                  </Text>
                </View>

                {/* Info */}
                <View style={styles.contactInfo}>
                  <Text style={styles.contactName}>{contact.name}</Text>
                  <View style={styles.contactMeta}>
                    <Text style={styles.contactPhone}>{contact.phone}</Text>
                    <View style={[styles.relationBadge, { backgroundColor: contact.avatarColor + '33' }]}>
                      <Text style={[styles.relationText, { color: contact.avatarColor }]}>
                        {contact.relation}
                      </Text>
                    </View>
                  </View>
                </View>

                {/* Actions */}
                <View style={styles.contactActions}>
                  <CallButton
                    number={contact.phone}
                    label={contact.name}
                    category="personal"
                    size="small"
                    skipConfirm
                  />
                  <Pressable
                    style={styles.deleteBtn}
                    onPress={() => handleDelete(contact.id, contact.name)}
                    accessibilityLabel={`Remove ${contact.name}`}
                  >
                    <Trash2 size={15} color="#d90429" />
                  </Pressable>
                </View>
              </View>
            ))
          )}

          {/* Add / Import buttons */}
          {contacts.length < 5 && (
            <View style={styles.addRow}>
              <Pressable style={styles.addBtn} onPress={() => setShowAddModal(true)}>
                <Plus size={16} color="#fff" />
                <Text style={styles.addBtnText}>Add Contact</Text>
              </Pressable>
              <Pressable style={styles.importBtn} onPress={handleOpenImport}>
                <UserPlus size={16} color="#2a9d8f" />
                <Text style={styles.importBtnText}>Import</Text>
              </Pressable>
            </View>
          )}
        </View>

        {/* ══════════════════════════════════════════════════════════════════ */}
        {/* SECTION 3 — Recent Calls Log                                     */}
        {/* ══════════════════════════════════════════════════════════════════ */}
        <View style={styles.sectionHeader}>
          <Text style={styles.sectionLabel}>📋 Recent Calls</Text>
          {callHistory.length > 0 && (
            <Pressable onPress={async () => { await clearCallHistory(); loadData(); }}>
              <Text style={styles.clearText}>Clear</Text>
            </Pressable>
          )}
        </View>

        <View style={styles.historyCard}>
          {callHistory.length === 0 ? (
            <View style={styles.emptyHistory}>
              <PhoneOff size={28} color="#444" />
              <Text style={styles.emptyText}>No calls made yet.</Text>
            </View>
          ) : (
            callHistory.map(entry => (
              <Pressable
                key={entry.id}
                style={styles.historyRow}
                onPress={() => makeCall(entry.number, entry.label, entry.category, true)}
              >
                <View style={[styles.historyDot, { backgroundColor: categoryColor[entry.category] ?? '#6c757d' }]} />
                <View style={styles.historyInfo}>
                  <Text style={styles.historyLabel} numberOfLines={1}>
                    {entry.label || entry.number}
                  </Text>
                  <View style={styles.historyMeta}>
                    <Text style={styles.historyNumber}>{entry.number}</Text>
                    <Text style={styles.historyTime}>{formatTimestamp(entry.timestamp)}</Text>
                  </View>
                </View>
                <View style={[styles.categoryBadge, { backgroundColor: (categoryColor[entry.category] ?? '#6c757d') + '22' }]}>
                  <Text style={[styles.categoryText, { color: categoryColor[entry.category] ?? '#6c757d' }]}>
                    {entry.category}
                  </Text>
                </View>
                <Pressable
                  style={styles.historyCallBtn}
                  onPress={() => makeCall(entry.number, entry.label, entry.category, true)}
                >
                  <Phone size={14} color="#2a9d8f" />
                </Pressable>
              </Pressable>
            ))
          )}
        </View>

      </ScrollView>

      {/* ══════════════════════════════════════════════════════════════════════ */}
      {/* ADD CONTACT MODAL                                                     */}
      {/* ══════════════════════════════════════════════════════════════════════ */}
      <Modal visible={showAddModal} transparent animationType="slide">
        <View style={styles.modalOverlay}>
          <View style={styles.modalCard}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Add Emergency Contact</Text>
              <Pressable onPress={() => setShowAddModal(false)}>
                <X size={20} color="#aaa" />
              </Pressable>
            </View>

            <Text style={styles.fieldLabel}>Full Name *</Text>
            <TextInput
              style={styles.input}
              placeholder="e.g. Rahul Sharma"
              placeholderTextColor="#555"
              value={formName}
              onChangeText={setFormName}
              autoCapitalize="words"
            />

            <Text style={styles.fieldLabel}>Phone Number *</Text>
            <TextInput
              style={styles.input}
              placeholder="+91 98765 43210"
              placeholderTextColor="#555"
              value={formPhone}
              onChangeText={setFormPhone}
              keyboardType="phone-pad"
              maxLength={15}
            />

            <Text style={styles.fieldLabel}>Relation</Text>
            <View style={styles.relationRow}>
              {RELATION_OPTIONS.map(opt => (
                <Pressable
                  key={opt.value}
                  style={[styles.relationChip, formRelation === opt.value && styles.relationChipActive]}
                  onPress={() => setFormRelation(opt.value)}
                >
                  <Text style={[styles.relationChipText, formRelation === opt.value && styles.relationChipTextActive]}>
                    {opt.label}
                  </Text>
                </Pressable>
              ))}
            </View>

            <View style={styles.modalActions}>
              <Pressable style={styles.importFromPhoneBtn} onPress={async () => {
                setShowAddModal(false);
                await handleOpenImport();
              }}>
                <UserPlus size={16} color="#2a9d8f" />
                <Text style={styles.importFromPhoneText}>Import from Contacts</Text>
              </Pressable>
              <Pressable style={styles.saveBtn} onPress={handleSaveContact}>
                <Text style={styles.saveBtnText}>Save Contact</Text>
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>

      {/* ══════════════════════════════════════════════════════════════════════ */}
      {/* IMPORT FROM PHONE BOOK MODAL                                          */}
      {/* ══════════════════════════════════════════════════════════════════════ */}
      <Modal visible={showImportModal} transparent animationType="slide">
        <View style={styles.modalOverlay}>
          <View style={[styles.modalCard, styles.importModalCard]}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Import Contact</Text>
              <Pressable onPress={() => setShowImportModal(false)}>
                <X size={20} color="#aaa" />
              </Pressable>
            </View>

            <TextInput
              style={[styles.input, { marginBottom: 8 }]}
              placeholder="Search by name or number..."
              placeholderTextColor="#555"
              value={importSearch}
              onChangeText={setImportSearch}
            />

            <FlatList
              data={filteredDeviceContacts}
              keyExtractor={(_, i) => i.toString()}
              style={styles.importList}
              renderItem={({ item }) => (
                <Pressable style={styles.importRow} onPress={() => handleImportContact(item)}>
                  <View style={[styles.avatar, { backgroundColor: avatarColor(item.name) }]}>
                    <Text style={styles.avatarText}>{item.name.charAt(0).toUpperCase()}</Text>
                  </View>
                  <View style={styles.importInfo}>
                    <Text style={styles.importName}>{item.name}</Text>
                    <Text style={styles.importPhone}>{item.phone}</Text>
                  </View>
                  <Plus size={18} color="#2a9d8f" />
                </Pressable>
              )}
              ListEmptyComponent={
                <Text style={styles.emptyText}>No contacts found.</Text>
              }
            />
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

// ── Styles ────────────────────────────────────────────────────────────────────
const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#121214' },
  scroll: { paddingHorizontal: 16, paddingBottom: 40 },

  header: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    paddingVertical: 14, borderBottomWidth: 1, borderBottomColor: '#212225',
    marginBottom: 4,
  },
  headerTitle: { color: '#fff', fontSize: 20, fontWeight: 'bold' },

  sectionHeader: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    marginTop: 20, marginBottom: 10,
  },
  sectionLabel: { color: '#fff', fontSize: 14, fontWeight: '700' },
  sectionSub:   { color: '#666', fontSize: 11 },
  clearText:    { color: '#d90429', fontSize: 12, fontWeight: '600' },

  // Emergency grid
  emergencyGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  emergencyCard: {
    width: '47.5%', borderRadius: 14, padding: 14,
    alignItems: 'flex-start', gap: 3,
    shadowColor: '#000', shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.25, shadowRadius: 6, elevation: 5,
  },
  emergencyIcon:    { fontSize: 24, marginBottom: 2 },
  emergencyNumber:  { color: '#fff', fontSize: 26, fontWeight: '900', letterSpacing: 1 },
  emergencyLabel:   { color: 'rgba(255,255,255,0.9)', fontSize: 13, fontWeight: '700' },
  emergencyDesc:    { color: 'rgba(255,255,255,0.65)', fontSize: 10, marginBottom: 8 },
  emergencyCallBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 5,
    backgroundColor: 'rgba(0,0,0,0.25)', paddingHorizontal: 10,
    paddingVertical: 6, borderRadius: 8, alignSelf: 'stretch', justifyContent: 'center',
  },
  emergencyCallText: { color: '#fff', fontSize: 12, fontWeight: '800' },

  // Personal contacts
  contactsCard: {
    backgroundColor: '#1e1e24', borderRadius: 16,
    borderWidth: 1, borderColor: '#2e2e38', overflow: 'hidden',
  },
  emptyContacts: { alignItems: 'center', padding: 28, gap: 8 },
  emptyText:    { color: '#666', fontSize: 13, textAlign: 'center' },
  emptySubText: { color: '#555', fontSize: 11, textAlign: 'center', lineHeight: 16 },

  contactRow: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    paddingHorizontal: 14, paddingVertical: 12,
    borderBottomWidth: 0.5, borderBottomColor: '#2e2e38',
  },
  avatar: {
    width: 40, height: 40, borderRadius: 20,
    justifyContent: 'center', alignItems: 'center', flexShrink: 0,
  },
  avatarText: { color: '#fff', fontSize: 16, fontWeight: '800' },
  contactInfo: { flex: 1 },
  contactName:  { color: '#fff', fontSize: 14, fontWeight: '700' },
  contactMeta:  { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 2 },
  contactPhone: { color: '#888', fontSize: 12 },
  relationBadge: { paddingHorizontal: 6, paddingVertical: 2, borderRadius: 4 },
  relationText:  { fontSize: 10, fontWeight: '700' },
  contactActions: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  deleteBtn: {
    width: 30, height: 30, borderRadius: 15,
    backgroundColor: 'rgba(217,4,41,0.1)',
    justifyContent: 'center', alignItems: 'center',
  },

  addRow: {
    flexDirection: 'row', gap: 10,
    padding: 14, borderTopWidth: 0.5, borderTopColor: '#2e2e38',
  },
  addBtn: {
    flex: 1, flexDirection: 'row', justifyContent: 'center',
    alignItems: 'center', gap: 6,
    backgroundColor: '#ff4d4d', paddingVertical: 11, borderRadius: 10,
  },
  addBtnText: { color: '#fff', fontSize: 13, fontWeight: '700' },
  importBtn: {
    flexDirection: 'row', justifyContent: 'center',
    alignItems: 'center', gap: 6,
    backgroundColor: 'rgba(42,157,143,0.12)', paddingVertical: 11,
    paddingHorizontal: 16, borderRadius: 10,
    borderWidth: 1, borderColor: 'rgba(42,157,143,0.3)',
  },
  importBtnText: { color: '#2a9d8f', fontSize: 13, fontWeight: '700' },

  // Call history
  historyCard: {
    backgroundColor: '#1e1e24', borderRadius: 16,
    borderWidth: 1, borderColor: '#2e2e38', overflow: 'hidden',
  },
  emptyHistory: { alignItems: 'center', padding: 24, gap: 8 },
  historyRow: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    paddingHorizontal: 14, paddingVertical: 12,
    borderBottomWidth: 0.5, borderBottomColor: '#2e2e38',
  },
  historyDot: { width: 8, height: 8, borderRadius: 4, flexShrink: 0 },
  historyInfo: { flex: 1 },
  historyLabel:  { color: '#fff', fontSize: 13, fontWeight: '600' },
  historyMeta:   { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 2 },
  historyNumber: { color: '#888', fontSize: 11 },
  historyTime:   { color: '#555', fontSize: 11 },
  categoryBadge: { paddingHorizontal: 6, paddingVertical: 2, borderRadius: 4 },
  categoryText:  { fontSize: 9, fontWeight: '700' },
  historyCallBtn: {
    width: 30, height: 30, borderRadius: 15,
    backgroundColor: 'rgba(42,157,143,0.1)',
    justifyContent: 'center', alignItems: 'center',
  },

  // Modal
  modalOverlay: {
    flex: 1, backgroundColor: 'rgba(0,0,0,0.85)',
    justifyContent: 'flex-end',
  },
  modalCard: {
    backgroundColor: '#1e1e24', borderTopLeftRadius: 20, borderTopRightRadius: 20,
    padding: 20, paddingBottom: 36,
    borderTopWidth: 1, borderColor: '#2e2e38',
  },
  importModalCard: { maxHeight: '80%' },
  modalHeader: {
    flexDirection: 'row', justifyContent: 'space-between',
    alignItems: 'center', marginBottom: 16,
  },
  modalTitle: { color: '#fff', fontSize: 18, fontWeight: '800' },
  fieldLabel: {
    color: '#aaa', fontSize: 11, fontWeight: '700',
    textTransform: 'uppercase', marginBottom: 6, marginTop: 12,
  },
  input: {
    backgroundColor: '#121214', borderWidth: 1, borderColor: '#2e2e38',
    borderRadius: 10, paddingHorizontal: 14, paddingVertical: 11,
    color: '#fff', fontSize: 14, marginBottom: 4,
  },
  relationRow: { flexDirection: 'row', gap: 8, marginBottom: 4 },
  relationChip: {
    flex: 1, paddingVertical: 9, alignItems: 'center',
    borderRadius: 8, borderWidth: 1,
    backgroundColor: '#121214', borderColor: '#2e2e38',
  },
  relationChipActive: { backgroundColor: '#2a9d8f', borderColor: '#2a9d8f' },
  relationChipText:       { color: '#aaa', fontSize: 12, fontWeight: '600' },
  relationChipTextActive: { color: '#fff' },
  modalActions: { flexDirection: 'row', gap: 10, marginTop: 20 },
  importFromPhoneBtn: {
    flex: 1, flexDirection: 'row', justifyContent: 'center',
    alignItems: 'center', gap: 6,
    backgroundColor: 'rgba(42,157,143,0.1)', paddingVertical: 12,
    borderRadius: 10, borderWidth: 1, borderColor: 'rgba(42,157,143,0.3)',
  },
  importFromPhoneText: { color: '#2a9d8f', fontSize: 13, fontWeight: '700' },
  saveBtn: {
    flex: 1, backgroundColor: '#ff4d4d',
    paddingVertical: 12, borderRadius: 10, alignItems: 'center',
  },
  saveBtnText: { color: '#fff', fontSize: 14, fontWeight: '800' },

  // Import list
  importList: { maxHeight: 400 },
  importRow: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    paddingVertical: 10, borderBottomWidth: 0.5, borderBottomColor: '#2e2e38',
  },
  importInfo: { flex: 1 },
  importName:  { color: '#fff', fontSize: 14, fontWeight: '600' },
  importPhone: { color: '#888', fontSize: 12, marginTop: 1 },
});
