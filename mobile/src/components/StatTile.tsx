import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { colors } from '../lib/colors';

interface StatTileProps {
  label: string;
  value: string;
  subValue?: string;
  color?: string;
}

export function StatTile({ label, value, subValue, color }: StatTileProps) {
  return (
    <View style={styles.tile}>
      <Text style={styles.label}>{label}</Text>
      <Text style={[styles.value, color ? { color } : null]}>{value}</Text>
      {subValue ? <Text style={styles.subValue}>{subValue}</Text> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  tile: {
    backgroundColor: colors.surface,
    borderRadius: 12,
    padding: 16,
    flex: 1,
    minWidth: 140,
    borderWidth: 1,
    borderColor: colors.border,
  },
  label: {
    fontSize: 12,
    color: colors.muted,
    marginBottom: 6,
    fontWeight: '500',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  value: {
    fontSize: 22,
    fontWeight: '700',
    color: colors.text,
  },
  subValue: {
    fontSize: 12,
    color: colors.muted,
    marginTop: 4,
  },
});
