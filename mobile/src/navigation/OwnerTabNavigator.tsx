import React from 'react';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { Text } from 'react-native';
import { DashboardScreen } from '../screens/DashboardScreen';
import { InventoryNavigator } from '../screens/InventoryScreen';
import { PurchaseOrdersNavigator } from '../screens/PurchaseOrdersScreen';
import { WasteLogScreen } from '../screens/WasteLogScreen';
import { AnalyticsScreen } from '../screens/AnalyticsScreen';
import { colors } from '../lib/colors';

export type OwnerTabParamList = {
  Dashboard: undefined;
  Inventory: undefined;
  Orders: undefined;
  Waste: undefined;
  Analytics: undefined;
};

const Tab = createBottomTabNavigator<OwnerTabParamList>();

function TabIcon({ icon, focused }: { icon: string; focused: boolean }) {
  return (
    <Text style={{ fontSize: 22, opacity: focused ? 1 : 0.5 }}>{icon}</Text>
  );
}

export function OwnerTabNavigator() {
  return (
    <Tab.Navigator
      screenOptions={{
        headerShown: false,
        tabBarStyle: {
          backgroundColor: colors.surface,
          borderTopColor: colors.border,
          borderTopWidth: 1,
          height: 60,
          paddingBottom: 6,
        },
        tabBarActiveTintColor: colors.accent,
        tabBarInactiveTintColor: colors.muted,
        tabBarLabelStyle: {
          fontSize: 11,
          fontWeight: '500',
        },
      }}
    >
      <Tab.Screen
        name="Dashboard"
        component={DashboardScreen}
        options={{
          tabBarIcon: ({ focused }) => <TabIcon icon="🏠" focused={focused} />,
          tabBarLabel: 'Dashboard',
        }}
      />
      <Tab.Screen
        name="Inventory"
        component={InventoryNavigator}
        options={{
          tabBarIcon: ({ focused }) => <TabIcon icon="📦" focused={focused} />,
          tabBarLabel: 'Inventory',
        }}
      />
      <Tab.Screen
        name="Orders"
        component={PurchaseOrdersNavigator}
        options={{
          tabBarIcon: ({ focused }) => <TabIcon icon="📋" focused={focused} />,
          tabBarLabel: 'Orders',
        }}
      />
      <Tab.Screen
        name="Waste"
        component={WasteLogScreen}
        options={{
          tabBarIcon: ({ focused }) => <TabIcon icon="🗑️" focused={focused} />,
          tabBarLabel: 'Waste',
        }}
      />
      <Tab.Screen
        name="Analytics"
        component={AnalyticsScreen}
        options={{
          tabBarIcon: ({ focused }) => <TabIcon icon="📊" focused={focused} />,
          tabBarLabel: 'Analytics',
        }}
      />
    </Tab.Navigator>
  );
}
