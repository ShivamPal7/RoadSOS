import React from 'react';
import { View, Text, StyleSheet, Pressable, Linking } from 'react-native';
import { Shield, Phone, Activity, Heart, AlertOctagon } from 'lucide-react-native';

export interface MedicalProfile {
  name: string;
  bloodGroup: string;
  allergies: string;
  conditions: string;
  contacts: { name: string; phone: string }[];
}

interface MedicalCardProps {
  profile: MedicalProfile;
  onEditPress?: () => void;
  t: (key: string) => string;
}

export const MedicalCard: React.FC<MedicalCardProps> = ({ profile, onEditPress, t }) => {
  const handleCall = (phone: string) => {
    Linking.openURL(`tel:${phone}`);
  };

  return (
    <View style={styles.card}>
      {/* Header */}
      <View style={styles.header}>
        <View style={styles.headerLeft}>
          <Shield color="#ff4d4d" size={24} />
          <Text style={styles.title}>{t('medical_card')}</Text>
        </View>
        {onEditPress && (
          <Pressable style={styles.editButton} onPress={onEditPress}>
            <Text style={styles.editButtonText}>{t('settings')}</Text>
          </Pressable>
        )}
      </View>

      {/* Patient Name */}
      <Text style={styles.patientName}>{profile.name || 'Set your name in settings'}</Text>

      {/* Grid Details */}
      <View style={styles.grid}>
        <View style={styles.gridItem}>
          <View style={styles.labelContainer}>
            <Heart color="#e63946" size={16} />
            <Text style={styles.label}>{t('blood_group')}</Text>
          </View>
          <Text style={styles.value}>{profile.bloodGroup || 'Not Specified'}</Text>
        </View>

        <View style={styles.gridItem}>
          <View style={styles.labelContainer}>
            <AlertOctagon color="#f77f00" size={16} />
            <Text style={styles.label}>{t('allergies')}</Text>
          </View>
          <Text style={styles.value} numberOfLines={2}>
            {profile.allergies || 'None'}
          </Text>
        </View>
      </View>

      <View style={styles.fullRow}>
        <View style={styles.labelContainer}>
          <Activity color="#457b9d" size={16} />
          <Text style={styles.label}>{t('conditions')}</Text>
        </View>
        <Text style={styles.value}>{profile.conditions || 'None'}</Text>
      </View>

      {/* Contacts List */}
      <View style={styles.contactsContainer}>
        <Text style={styles.contactsTitle}>{t('contacts')}</Text>
        {profile.contacts && profile.contacts.filter(c => c.name && c.phone).length > 0 ? (
          profile.contacts
            .filter(c => c.name && c.phone)
            .map((contact, idx) => (
              <View key={idx} style={styles.contactRow}>
                <View>
                  <Text style={styles.contactName}>{contact.name}</Text>
                  <Text style={styles.contactPhone}>{contact.phone}</Text>
                </View>
                <Pressable
                  style={styles.callCircle}
                  onPress={() => handleCall(contact.phone)}
                >
                  <Phone color="#fff" size={14} />
                </Pressable>
              </View>
            ))
        ) : (
          <Text style={styles.noContactsText}>No emergency contacts added yet.</Text>
        )}
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  card: {
    backgroundColor: '#1e1e24',
    borderRadius: 16,
    padding: 16,
    width: '100%',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.2,
    shadowRadius: 10,
    elevation: 8,
    borderWidth: 1,
    borderColor: '#2e2e38',
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  headerLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  title: {
    color: '#fff',
    fontWeight: 'bold',
    fontSize: 16,
  },
  editButton: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 6,
    backgroundColor: '#2e2e38',
  },
  editButtonText: {
    color: '#aaa',
    fontSize: 12,
  },
  patientName: {
    color: '#fff',
    fontSize: 20,
    fontWeight: 'bold',
    marginBottom: 16,
  },
  grid: {
    flexDirection: 'row',
    gap: 12,
    marginBottom: 12,
  },
  gridItem: {
    flex: 1,
    backgroundColor: '#121216',
    borderRadius: 10,
    padding: 10,
  },
  fullRow: {
    backgroundColor: '#121216',
    borderRadius: 10,
    padding: 10,
    marginBottom: 16,
  },
  labelContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginBottom: 4,
  },
  label: {
    color: '#888',
    fontSize: 11,
    fontWeight: '600',
    textTransform: 'uppercase',
  },
  value: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '500',
  },
  contactsContainer: {
    borderTopWidth: 1,
    borderTopColor: '#2e2e38',
    paddingTop: 12,
  },
  contactsTitle: {
    color: '#ff4d4d',
    fontSize: 13,
    fontWeight: '700',
    textTransform: 'uppercase',
    marginBottom: 8,
  },
  contactRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 6,
    borderBottomWidth: 0.5,
    borderBottomColor: '#2e2e38',
  },
  contactName: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '600',
  },
  contactPhone: {
    color: '#aaa',
    fontSize: 12,
    marginTop: 2,
  },
  callCircle: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: '#2a9d8f',
    justifyContent: 'center',
    alignItems: 'center',
  },
  noContactsText: {
    color: '#666',
    fontSize: 12,
    fontStyle: 'italic',
  },
});
