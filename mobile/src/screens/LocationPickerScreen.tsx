import React from 'react';
import {
  View,
  Text,
  FlatList,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  Alert,
} from 'react-native';
import { useQuery } from '@tanstack/react-query';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useAuth } from '@clerk/clerk-expo';
import { apiFetch } from '../lib/api';
import { useSelectedLocation } from '../contexts/LocationContext';
import { colors } from '../lib/colors';

interface Location {
  id: string;
  name: string;
  address: string;
}

export function LocationPickerScreen() {
  const insets = useSafeAreaInsets();
  const { setLocation } = useSelectedLocation();
  const { signOut } = useAuth();

  const { data: locations, isLoading, error, refetch } = useQuery({
    queryKey: ['locations'],
    queryFn: () => apiFetch<Location[]>('/api/locations'),
  });

  function handleSelect(loc: Location) {
    setLocation(loc.id, loc.name);
  }

  async function handleSignOut() {
    try {
      await signOut();
    } catch {
      Alert.alert('Error', 'Failed to sign out.');
    }
  }

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      <View style={styles.header}>
        <View>
          <Text style={styles.title}>Select Location</Text>
          <Text style={styles.subtitle}>Choose a restaurant to manage</Text>
        </View>
        <TouchableOpacity onPress={handleSignOut} style={styles.signOutBtn}>
          <Text style={styles.signOutText}>Sign Out</Text>
        </TouchableOpacity>
      </View>

      {isLoading ? (
        <View style={styles.centered}>
          <ActivityIndicator size="large" color={colors.accent} />
          <Text style={styles.loadingText}>Loading locations…</Text>
        </View>
      ) : error ? (
        <View style={styles.centered}>
          <Text style={styles.errorText}>Failed to load locations</Text>
          <TouchableOpacity style={styles.retryBtn} onPress={() => refetch()}>
            <Text style={styles.retryText}>Retry</Text>
          </TouchableOpacity>
        </View>
      ) : (
        <FlatList
          data={locations}
          keyExtractor={(item) => item.id}
          contentContainerStyle={styles.list}
          ListEmptyComponent={
            <View style={styles.centered}>
              <Text style={styles.emptyText}>No locations found.</Text>
            </View>
          }
          renderItem={({ item }) => (
            <TouchableOpacity
              style={styles.locationCard}
              onPress={() => handleSelect(item)}
              activeOpacity={0.7}
            >
              <View style={styles.cardIcon}>
                <Text style={{ fontSize: 24 }}>🍴</Text>
              </View>
              <View style={styles.cardContent}>
                <Text style={styles.locationName}>{item.name}</Text>
                <Text style={styles.locationAddress}>{item.address}</Text>
              </View>
              <Text style={styles.chevron}>›</Text>
            </TouchableOpacity>
          )}
        />
      )}
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
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingVertical: 20,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  title: {
    fontSize: 24,
    fontWeight: '800',
    color: colors.text,
  },
  subtitle: {
    fontSize: 14,
    color: colors.muted,
    marginTop: 2,
  },
  signOutBtn: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 8,
  },
  signOutText: {
    color: colors.muted,
    fontSize: 14,
    fontWeight: '500',
  },
  list: {
    padding: 16,
    gap: 12,
  },
  locationCard: {
    backgroundColor: colors.surface,
    borderRadius: 14,
    padding: 16,
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: colors.border,
    marginBottom: 12,
  },
  cardIcon: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: colors.bg,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 14,
  },
  cardContent: {
    flex: 1,
  },
  locationName: {
    fontSize: 16,
    fontWeight: '700',
    color: colors.text,
  },
  locationAddress: {
    fontSize: 13,
    color: colors.muted,
    marginTop: 2,
  },
  chevron: {
    fontSize: 22,
    color: colors.muted,
    marginLeft: 8,
  },
  centered: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 40,
  },
  loadingText: {
    color: colors.muted,
    marginTop: 12,
    fontSize: 14,
  },
  errorText: {
    color: colors.danger,
    fontSize: 16,
    textAlign: 'center',
  },
  retryBtn: {
    marginTop: 16,
    paddingHorizontal: 20,
    paddingVertical: 10,
    backgroundColor: colors.accent,
    borderRadius: 8,
  },
  retryText: {
    color: '#fff',
    fontWeight: '600',
  },
  emptyText: {
    color: colors.muted,
    fontSize: 16,
  },
});
