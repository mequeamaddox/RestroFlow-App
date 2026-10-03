import React from 'react';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { useUser } from '@clerk/clerk-expo';
import { ActivityIndicator, View } from 'react-native';
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

export function RootNavigator() {
  const { isSignedIn, isLoaded } = useUser();
  const { locationId } = useSelectedLocation();

  if (!isLoaded) {
    return (
      <View style={{ flex: 1, backgroundColor: colors.bg, justifyContent: 'center', alignItems: 'center' }}>
        <ActivityIndicator color={colors.accent} size="large" />
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
