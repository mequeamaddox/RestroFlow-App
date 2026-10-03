import React from 'react';
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

// Clerk token cache using SecureStore (required by @clerk/clerk-expo)
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

export default function App() {
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
