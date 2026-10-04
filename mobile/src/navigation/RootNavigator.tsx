import React, { useEffect, useState } from 'react';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { useUser } from '@clerk/clerk-expo';
import { ActivityIndicator, Text, View } from 'react-native';
import { LoginScreen } from '../screens/LoginScreen';
import { LocationPickerScreen } from '../screens/LocationPickerScreen';
import { OwnerTabNavigator } from './OwnerTabNavigator';
import { useSelectedLocation } from '../contexts/LocationContext';
import { colors } from '../lib/colors';

export type RootStackParamList = {
  Login: undefined;
  LocationPicker: undefined;
  Main: undefined;
};

const Stack = createNativeStackNavigator<RootStackParamList>();

const LOAD_TIMEOUT_MS = 15000;

export function RootNavigator() {
  const { isSignedIn, isLoaded } = useUser();
  const { locationId } = useSelectedLocation();
  const [timedOut, setTimedOut] = useState(false);

  useEffect(() => {
    if (isLoaded) return;
    const t = setTimeout(() => setTimedOut(true), LOAD_TIMEOUT_MS);
    return () => clearTimeout(t);
  }, [isLoaded]);

  if (!isLoaded) {
    return (
      <View style={{ flex: 1, backgroundColor: colors.bg, justifyContent: 'center', alignItems: 'center', padding: 32 }}>
        <ActivityIndicator color={colors.accent} size="large" />
        {timedOut && (
          <>
            <Text style={{ color: colors.text, fontSize: 17, fontWeight: '700', marginTop: 24, textAlign: 'center' }}>
              Can't reach sign-in
            </Text>
            <Text style={{ color: colors.muted, fontSize: 14, marginTop: 8, textAlign: 'center', lineHeight: 20 }}>
              Check your internet connection. If this keeps happening, mobile sign-in may be turned off in Clerk (Configure → Native applications).
            </Text>
          </>
        )}
      </View>
    );
  }

  return (
    <Stack.Navigator screenOptions={{ headerShown: false }}>
      {!isSignedIn ? (
        <Stack.Screen name="Login" component={LoginScreen} />
      ) : locationId === null ? (
        <Stack.Screen name="LocationPicker" component={LocationPickerScreen} />
      ) : (
        <Stack.Screen name="Main" component={OwnerTabNavigator} />
      )}
    </Stack.Navigator>
  );
}
