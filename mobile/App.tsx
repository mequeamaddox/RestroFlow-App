import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { NavigationContainer } from '@react-navigation/native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { QueryClientProvider } from '@tanstack/react-query';
import { ClerkProvider } from '@clerk/clerk-expo';
import * as SecureStore from 'expo-secure-store';

import { queryClient } from './src/lib/queryClient';
import { TokenBridge } from './src/components/TokenBridge';
import { LocationProvider } from './src/contexts/LocationContext';
import { RootNavigator } from './src/navigation/RootNavigator';

const tokenCache = {
  async getToken(key: string) {
    try {
      return await SecureStore.getItemAsync(key);
    } catch {
      return null;
    }
  },
  async saveToken(key: string, value: string) {
    try {
      await SecureStore.setItemAsync(key, value);
    } catch {
      // ignore
    }
  },
};

const CLERK_PUBLISHABLE_KEY = process.env.EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY ?? '';

if (!CLERK_PUBLISHABLE_KEY) {
  console.error(
    'Missing EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY. ' +
    'Add it to EAS secrets or eas.json env section and rebuild.'
  );
}

function MissingKeyScreen() {
  return (
    <View style={styles.error}>
      <Text style={styles.errorTitle}>Configuration Error</Text>
      <Text style={styles.errorBody}>
        EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY is not set.{'\n\n'}
        Add it to your EAS project secrets at expo.dev, then rebuild.
      </Text>
    </View>
  );
}

export default function App() {
  if (!CLERK_PUBLISHABLE_KEY) {
    return <MissingKeyScreen />;
  }

  return (
    <ClerkProvider publishableKey={CLERK_PUBLISHABLE_KEY} tokenCache={tokenCache}>
      <QueryClientProvider client={queryClient}>
        <SafeAreaProvider>
          <LocationProvider>
            <TokenBridge />
            <NavigationContainer>
              <StatusBar style="light" />
              <RootNavigator />
            </NavigationContainer>
          </LocationProvider>
        </SafeAreaProvider>
      </QueryClientProvider>
    </ClerkProvider>
  );
}

const styles = StyleSheet.create({
  error: {
    flex: 1,
    backgroundColor: '#0f172a',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 32,
  },
  errorTitle: {
    color: '#ef4444',
    fontSize: 20,
    fontWeight: '700',
    marginBottom: 16,
  },
  errorBody: {
    color: '#94a3b8',
    fontSize: 14,
    textAlign: 'center',
    lineHeight: 22,
  },
});
