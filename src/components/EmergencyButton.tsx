import React, { useEffect } from 'react';
import { View, Text, Pressable, StyleSheet } from 'react-native';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withRepeat,
  withTiming,
  withSequence,
  Easing,
} from 'react-native-reanimated';

interface EmergencyButtonProps {
  onPress: () => void;
  title: string;
  subtitle: string;
  active: boolean;
}

export const EmergencyButton: React.FC<EmergencyButtonProps> = ({
  onPress,
  title,
  subtitle,
  active,
}) => {
  const pulse1 = useSharedValue(1);
  const pulse2 = useSharedValue(1);

  useEffect(() => {
    // Continuous pulse animations
    pulse1.value = withRepeat(
      withTiming(1.3, {
        duration: 1500,
        easing: Easing.out(Easing.ease),
      }),
      -1,
      false
    );

    pulse2.value = withRepeat(
      withTiming(1.6, {
        duration: 1800,
        easing: Easing.out(Easing.ease),
      }),
      -1,
      false
    );
  }, []);

  const animatedRing1Style = useAnimatedStyle(() => {
    return {
      transform: [{ scale: pulse1.value }],
      opacity: withTiming(active ? 0.8 : 0.4 - (pulse1.value - 1) * 1.33),
    };
  });

  const animatedRing2Style = useAnimatedStyle(() => {
    return {
      transform: [{ scale: pulse2.value }],
      opacity: withTiming(active ? 0.6 : 0.2 - (pulse2.value - 1) * 0.33),
    };
  });

  const animatedButtonStyle = useAnimatedStyle(() => {
    return {
      transform: [
        {
          scale: withSequence(
            withTiming(0.95, { duration: 100 }),
            withTiming(1, { duration: 100 })
          ),
        },
      ],
    };
  });

  return (
    <View style={styles.container}>
      {/* Outer Pulse Ring 2 */}
      <Animated.View
        style={[
          styles.pulseRing,
          styles.pulseRingOuter,
          active && styles.pulseRingActive,
          animatedRing2Style,
        ]}
      />

      {/* Inner Pulse Ring 1 */}
      <Animated.View
        style={[
          styles.pulseRing,
          styles.pulseRingInner,
          active && styles.pulseRingActive,
          animatedRing1Style,
        ]}
      />

      {/* Main SOS Button */}
      <Pressable onPress={onPress}>
        <Animated.View
          style={[
            styles.button,
            active ? styles.buttonActive : styles.buttonNormal,
            animatedButtonStyle,
          ]}
        >
          <Text style={styles.buttonText}>{title}</Text>
          <Text style={styles.buttonSubtext}>{subtitle}</Text>
        </Animated.View>
      </Pressable>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    justifyContent: 'center',
    alignItems: 'center',
    width: 280,
    height: 280,
    marginVertical: 20,
  },
  pulseRing: {
    position: 'absolute',
    borderRadius: 999,
    borderWidth: 1.5,
  },
  pulseRingInner: {
    width: 190,
    height: 190,
    borderColor: '#ff4d4d',
    backgroundColor: 'rgba(255, 77, 77, 0.1)',
  },
  pulseRingOuter: {
    width: 220,
    height: 220,
    borderColor: '#ff3333',
    backgroundColor: 'rgba(255, 51, 51, 0.05)',
  },
  pulseRingActive: {
    borderColor: '#e60000',
    backgroundColor: 'rgba(230, 0, 0, 0.25)',
  },
  button: {
    width: 160,
    height: 160,
    borderRadius: 80,
    justifyContent: 'center',
    alignItems: 'center',
    elevation: 15,
    shadowColor: '#ff0000',
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.5,
    shadowRadius: 15,
  },
  buttonNormal: {
    backgroundColor: '#ff3333',
  },
  buttonActive: {
    backgroundColor: '#990000',
    shadowColor: '#990000',
  },
  buttonText: {
    color: '#ffffff',
    fontSize: 28,
    fontWeight: 'bold',
    letterSpacing: 1.5,
  },
  buttonSubtext: {
    color: 'rgba(255, 255, 255, 0.8)',
    fontSize: 10,
    marginTop: 6,
    textTransform: 'uppercase',
    fontWeight: '600',
    textAlign: 'center',
    paddingHorizontal: 10,
  },
});
