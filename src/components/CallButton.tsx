/**
 * CallButton.tsx
 * Reusable one-tap call button used across all screens.
 * Calls makeCall (which logs the call) — single source of truth.
 */

import { makeCall } from '@/services/callService';
import { Phone } from 'lucide-react-native';
import React from 'react';
import { Pressable, StyleSheet, Text } from 'react-native';

interface CallButtonProps {
  number: string;
  label?: string;
  category?: string;
  size?: 'small' | 'normal' | 'large';
  /** Skip confirmation dialog (e.g. for emergency numbers) */
  skipConfirm?: boolean;
  disabled?: boolean;
}

export const CallButton: React.FC<CallButtonProps> = ({
  number,
  label = '',
  category = 'service',
  size = 'normal',
  skipConfirm = false,
  disabled = false,
}) => {
  const handlePress = () => {
    if (!number) return;
    makeCall(number, label, category, skipConfirm);
  };

  return (
    <Pressable
      style={[
        styles.btn,
        size === 'small' && styles.small,
        size === 'large' && styles.large,
        disabled && styles.disabled,
      ]}
      onPress={handlePress}
      disabled={disabled || !number}
      accessibilityLabel={`Call ${label || number}`}
      accessibilityRole="button"
    >
      <Phone size={size === 'small' ? 13 : size === 'large' ? 19 : 15} color="#fff" />
      <Text style={[styles.text, size === 'large' && styles.textLarge]}>CALL</Text>
    </Pressable>
  );
};

const styles = StyleSheet.create({
  btn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    backgroundColor: '#2a9d8f',
    paddingVertical: 9,
    paddingHorizontal: 16,
    borderRadius: 8,
  },
  small: {
    paddingVertical: 6,
    paddingHorizontal: 10,
    borderRadius: 6,
    gap: 4,
  },
  large: {
    paddingVertical: 14,
    paddingHorizontal: 28,
    borderRadius: 12,
    gap: 8,
  },
  disabled: {
    backgroundColor: '#333',
    opacity: 0.5,
  },
  text: {
    color: '#fff',
    fontWeight: '800',
    fontSize: 12,
    letterSpacing: 0.5,
  },
  textLarge: {
    fontSize: 15,
  },
});
