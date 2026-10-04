import React, { useEffect, useState } from 'react';
import { AppState, View, Text, StyleSheet } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { NavigationContainer } from '@react-navigation/native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { focusManager, QueryClientProvider } from '@tanstack/react-query';
import { ClerkProvider, useAuth } from '@clerk/clerk-expo';
import * as SecureStore from 'expo-secure-store';

import { createQueryClient } from './src/lib/queryClient';
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

interface ErrorBoundaryState {
  error: Error | null;
}

class ErrorBoundary extends React.Component<
  { children: React.ReactNode },
  ErrorBoundaryState
> {
  state: ErrorBoundaryState = { error: null };

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { error };
  }

  render() {
    if (this.state.error) {
      return (
        <View style={styles.error}>
          <Text style={styles.errorTitle}>Something went wrong</Text>
          <Text style={styles.errorBody}>{this.state.error.message}</Text>
        </View>
      );
    }
    return this.props.children;
  }
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

function SessionContent() {
  const [queryClient] = useState(createQueryClient);

  useEffect(() => {
    focusManager.setFocused(AppState.currentState === 'active');
    const subscription = AppState.addEventListener('change', state => {
      focusManager.setFocused(state === 'active');
    });
    return () => {
      subscription.remove();
      // Clearing cancels pending queries and removes the previous session's data.
      queryClient.clear();
    };
  }, [queryClient]);

  return (
    <QueryClientProvider client={queryClient}>
      <LocationProvider>
        <TokenBridge>
          <NavigationContainer>
            <StatusBar style="light" />
            <RootNavigator />
          </NavigationContainer>
        </TokenBridge>
      </LocationProvider>
    </QueryClientProvider>
  );
}

function SessionBoundary() {
  const { userId, sessionId } = useAuth();
  // Remount the cache, navigation, and location together on every account/session change.
  return <SessionContent key={`${userId ?? 'signed-out'}:${sessionId ?? 'none'}`} />;
}

export default function App() {
  if (!CLERK_PUBLISHABLE_KEY) {
    return <MissingKeyScreen />;
  }

  return (
    <ErrorBoundary>
      <ClerkProvider publishableKey={CLERK_PUBLISHABLE_KEY} tokenCache={tokenCache}>
        <SafeAreaProvider>
          <SessionBoundary />
        </SafeAreaProvider>
      </ClerkProvider>
    </ErrorBoundary>
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
