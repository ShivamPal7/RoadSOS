import type { PlaceResult } from '@/services/placesService';
import { Award, Clock, Database, MapPin, Navigation, Wifi } from 'lucide-react-native';
import React from 'react';
import { Linking, Pressable, StyleSheet, Text, View } from 'react-native';
import { CallButton } from './CallButton';

interface ResultCardProps {
  result: PlaceResult;
  isTop?: boolean;
}

export const ResultCard: React.FC<ResultCardProps> = ({ result, isTop }) => {
  const handleCall = () => {
    if (result.phone) {
      Linking.openURL(`tel:${result.phone}`);
    }
  };

  const handleNavigate = () => {    Linking.openURL(
      `https://www.google.com/maps/dir/?api=1` +
      `&destination=${result.latitude},${result.longitude}` +
      `&travelmode=driving`
    );
  };

  const openStatusColor =
    result.isOpen === true  ? '#2a9d8f' :
    result.isOpen === false ? '#d90429' :
    '#888';

  const openStatusText =
    result.isOpen === true  ? 'Open Now' :
    result.isOpen === false ? 'Closed'   :
    'Hours Unknown';

  return (
    <View style={[styles.card, isTop && styles.cardTop]}>
      {/* Left accent bar */}
      <View style={[styles.accentBar, isTop && styles.accentBarTop]} />

      <View style={styles.body}>
        {/* Name row */}
        <View style={styles.nameRow}>
          <Text style={styles.name} numberOfLines={2}>{result.name}</Text>
          <View style={styles.badges}>
            {result.recommendationTag === 'fastest_nearest' && (
              <View style={[styles.badge, { backgroundColor: '#ffbe0b' }]}>
                <Clock size={8} color="#000" />
                <Text style={[styles.badgeText, { color: '#000' }]}>FASTEST & NEAREST</Text>
              </View>
            )}
            {result.recommendationTag === 'fastest' && (
              <View style={[styles.badge, { backgroundColor: '#2a9d8f' }]}>
                <Clock size={8} color="#fff" />
                <Text style={[styles.badgeText, { color: '#fff' }]}>FASTEST (Traffic-Optimised)</Text>
              </View>
            )}
            {result.recommendationTag === 'nearest' && (
              <View style={[styles.badge, { backgroundColor: '#457b9d' }]}>
                <MapPin size={8} color="#fff" />
                <Text style={[styles.badgeText, { color: '#fff' }]}>NEAREST</Text>
              </View>
            )}
            {result.is_trauma_center && (
              <View style={styles.traumaBadge}>
                <Award size={10} color="#fff" />
                <Text style={styles.traumaText}>TRAUMA</Text>
              </View>
            )}
            {result.source === 'cache' ? (
              <View style={styles.sourceBadge}>
                <Database size={9} color="#f77f00" />
                <Text style={[styles.sourceText, { color: '#f77f00' }]}>CACHED</Text>
              </View>
            ) : (
              <View style={styles.sourceBadge}>
                <Wifi size={9} color="#2a9d8f" />
                <Text style={[styles.sourceText, { color: '#2a9d8f' }]}>LIVE</Text>
              </View>
            )}
          </View>
        </View>

        {/* Address */}
        <View style={styles.addressRow}>
          <MapPin size={12} color="#888" />
          <Text style={styles.address} numberOfLines={1}>{result.vicinity || 'Address unavailable'}</Text>
        </View>

        {/* Distance / ETA / Open status */}
        <View style={styles.metaRow}>
          <View style={styles.metaItem}>
            <MapPin size={13} color="#aaa" />
            <Text style={styles.metaText}>{result.distance.toFixed(1)} km</Text>
          </View>
          <View style={styles.metaDivider} />
          <View style={styles.metaItem}>
            <Clock size={13} color="#aaa" />
            <Text style={styles.metaText}>{result.eta}</Text>
          </View>
          <View style={styles.metaDivider} />
          <Text style={[styles.openStatus, { color: openStatusColor }]}>{openStatusText}</Text>
        </View>

        {/* Action buttons */}
        <View style={styles.actions}>
          <CallButton
            number={result.phone}
            label={result.name}
            category={result.type}
            disabled={!result.phone}
          />
          <Pressable style={styles.navBtn} onPress={handleNavigate}>
            <Navigation size={15} color="#fff" />
            <Text style={styles.btnText}>NAVIGATE</Text>
          </Pressable>
        </View>
      </View>
    </View>
  );
};

// ─── Skeleton loader ──────────────────────────────────────────────────────────
export const ResultCardSkeleton: React.FC = () => (
  <View style={styles.skeleton}>
    <View style={styles.skeletonAccent} />
    <View style={styles.skeletonBody}>
      <View style={[styles.skeletonLine, { width: '70%', height: 16 }]} />
      <View style={[styles.skeletonLine, { width: '50%', height: 11, marginTop: 6 }]} />
      <View style={[styles.skeletonLine, { width: '90%', height: 11, marginTop: 6 }]} />
      <View style={styles.skeletonBtns}>
        <View style={[styles.skeletonBtn]} />
        <View style={[styles.skeletonBtn]} />
      </View>
    </View>
  </View>
);

const styles = StyleSheet.create({
  card: {
    flexDirection: 'row',
    backgroundColor: '#1e1e24',
    borderRadius: 14,
    marginBottom: 10,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: '#2e2e38',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.2,
    shadowRadius: 6,
    elevation: 4,
  },
  cardTop: {
    borderColor: '#ff4d4d',
    backgroundColor: '#1f1a1a',
  },
  accentBar: {
    width: 4,
    backgroundColor: '#2a9d8f',
  },
  accentBarTop: {
    backgroundColor: '#ff4d4d',
  },
  body: {
    flex: 1,
    padding: 12,
  },
  nameRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 4,
    gap: 8,
  },
  name: {
    flex: 1,
    color: '#fff',
    fontSize: 15,
    fontWeight: '700',
    lineHeight: 20,
  },
  badges: {
    flexDirection: 'row',
    gap: 4,
    flexShrink: 0,
    flexWrap: 'wrap',
    justifyContent: 'flex-end',
    maxWidth: '55%',
  },
  badge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 2,
    paddingHorizontal: 5,
    paddingVertical: 2,
    borderRadius: 4,
  },
  badgeText: {
    fontSize: 8,
    fontWeight: '800',
  },
  traumaBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    backgroundColor: '#d90429',
    paddingHorizontal: 5,
    paddingVertical: 2,
    borderRadius: 4,
  },
  traumaText: {
    color: '#fff',
    fontSize: 8,
    fontWeight: '800',
  },
  sourceBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    backgroundColor: 'rgba(255,255,255,0.06)',
    paddingHorizontal: 5,
    paddingVertical: 2,
    borderRadius: 4,
  },
  sourceText: {
    fontSize: 8,
    fontWeight: '700',
  },
  addressRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    marginBottom: 8,
  },
  address: {
    flex: 1,
    color: '#888',
    fontSize: 12,
  },
  metaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#121216',
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 6,
    marginBottom: 10,
    gap: 6,
  },
  metaItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  metaText: {
    color: '#ccc',
    fontSize: 12,
    fontWeight: '600',
  },
  metaDivider: {
    width: 1,
    height: 12,
    backgroundColor: '#2e2e38',
    marginHorizontal: 2,
  },
  openStatus: {
    fontSize: 11,
    fontWeight: '700',
    marginLeft: 'auto',
  },
  actions: {
    flexDirection: 'row',
    gap: 8,
  },
  navBtn: {
    flex: 1,
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    gap: 6,
    backgroundColor: '#457b9d',
    paddingVertical: 9,
    borderRadius: 8,
  },
  btnDisabled: {
    backgroundColor: '#333',
    opacity: 0.5,
  },
  btnText: {
    color: '#fff',
    fontSize: 12,
    fontWeight: '800',
    letterSpacing: 0.5,
  },
  // Skeleton
  skeleton: {
    flexDirection: 'row',
    backgroundColor: '#1e1e24',
    borderRadius: 14,
    marginBottom: 10,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: '#2e2e38',
    height: 130,
  },
  skeletonAccent: {
    width: 4,
    backgroundColor: '#2e2e38',
  },
  skeletonBody: {
    flex: 1,
    padding: 12,
    justifyContent: 'center',
  },
  skeletonLine: {
    backgroundColor: '#2e2e38',
    borderRadius: 4,
  },
  skeletonBtns: {
    flexDirection: 'row',
    gap: 8,
    marginTop: 12,
  },
  skeletonBtn: {
    flex: 1,
    height: 32,
    backgroundColor: '#2e2e38',
    borderRadius: 8,
  },
});
