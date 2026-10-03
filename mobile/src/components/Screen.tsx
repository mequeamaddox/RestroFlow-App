import React from 'react';
import {
  View,
  Text,
  ScrollView,
  StyleSheet,
  TouchableOpacity,
  Platform,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { colors } from '../lib/colors';

interface ScreenProps {
  children: React.ReactNode;
  title?: string;
  rightAction?: {
    label: string;
    onPress: () => void;
  };
  scrollable?: boolean;
  padded?: boolean;
}

export function Screen({
  children,
  title,
  rightAction,
  scrollable = true,
  padded = true,
}: ScreenProps) {
  const insets = useSafeAreaInsets();

  const header = title ? (
    <View style={styles.header}>
      <Text style={styles.headerTitle}>{title}</Text>
      {rightAction && (
        <TouchableOpacity onPress={rightAction.onPress} style={styles.headerAction}>
          <Text style={styles.headerActionText}>{rightAction.label}</Text>
        </TouchableOpacity>
      )}
    </View>
  ) : null;

  if (!scrollable) {
    return (
      <View style={[styles.container, { paddingTop: insets.top }]}>
        {header}
        <View style={[styles.content, padded && styles.padded]}>{children}</View>
      </View>
    );
  }

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      {header}
      <ScrollView
        style={styles.scroll}
        contentContainerStyle={[
          styles.scrollContent,
          padded && styles.padded,
          { paddingBottom: insets.bottom + 16 },
        ]}
        showsVerticalScrollIndicator={false}
      >
        {children}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.bg,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
    backgroundColor: colors.surface,
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: colors.text,
  },
  headerAction: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    backgroundColor: colors.accent,
    borderRadius: 8,
  },
  headerActionText: {
    color: '#fff',
    fontWeight: '600',
    fontSize: 14,
  },
  content: {
    flex: 1,
  },
  scroll: {
    flex: 1,
  },
  scrollContent: {
    flexGrow: 1,
  },
  padded: {
    padding: 16,
  },
});
