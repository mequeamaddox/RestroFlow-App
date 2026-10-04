import React, { useState } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  ScrollView,
  RefreshControl,
  ActivityIndicator,
  Alert,
} from 'react-native';
import { useQuery } from '@tanstack/react-query';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import type { BottomTabNavigationProp } from '@react-navigation/bottom-tabs';
import { apiFetch } from '../lib/api';
import { useSelectedLocation } from '../contexts/LocationContext';
import { StatTile } from '../components/StatTile';
import { colors } from '../lib/colors';
import type { OwnerTabParamList } from '../navigation/OwnerTabNavigator';

interface KPIs {
  grossMargin: number;
  foodCostPercentage: number;
  avgOrderValue: number;
  customerCount: number;
}

interface DailyPnL {
  revenue: number;
  cogs: number;
  grossProfit: number;
}

function fmt(n: number | undefined, currency = false) {
  if (n === undefined || n === null) return '—';
  if (currency) {
    return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(n);
  }
  return n.toFixed(1) + '%';
}

export function DashboardScreen() {
  const insets = useSafeAreaInsets();
  const { locationId, locationName } = useSelectedLocation();
  const navigation = useNavigation<BottomTabNavigationProp<OwnerTabParamList>>();
  const [refreshing, setRefreshing] = useState(false);

  const kpiQuery = useQuery<KPIs>({
    queryKey: ['kpis', locationId, '30d'],
    queryFn: () => apiFetch<KPIs>(`/api/business-intelligence/kpis?location=${locationId}&range=30d`),
    enabled: !!locationId,
  });
  const pnlQuery = useQuery<DailyPnL[]>({
    queryKey: ['daily-pnl', locationId, '30d'],
    queryFn: () => apiFetch<DailyPnL[]>(`/api/business-intelligence/daily-pnl?location=${locationId}&range=30d`),
    enabled: !!locationId,
  });
  const kpis = kpiQuery.data;
  const isLoading = kpiQuery.isLoading || pnlQuery.isLoading;
  const error = kpiQuery.error ?? pnlQuery.error;
  const refetch = () => Promise.all([kpiQuery.refetch(), pnlQuery.refetch()]);
  const totals = (pnlQuery.data ?? []).reduce(
    (acc, d) => ({ revenue: acc.revenue + d.revenue, cogs: acc.cogs + d.cogs, profit: acc.profit + d.grossProfit }),
    { revenue: 0, cogs: 0, profit: 0 },
  );

  async function handleRefresh() {
    setRefreshing(true);
    try {
      await refetch();
    } finally {
      setRefreshing(false);
    }
  }

  const foodCostColor =
    kpis?.foodCostPercentage !== undefined
      ? kpis.foodCostPercentage > 35
        ? colors.danger
        : kpis.foodCostPercentage > 28
        ? colors.warning
        : colors.success
      : colors.text;

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      {/* Header */}
      <View style={styles.header}>
        <View>
          <Text style={styles.greeting}>RestroFlow</Text>
          <Text style={styles.locationName}>{locationName ?? 'All Locations'}</Text>
        </View>
        <View style={styles.badge}>
          <Text style={styles.badgeText}>Last 30d</Text>
        </View>
      </View>

      <ScrollView
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={handleRefresh} tintColor={colors.accent} />}
        contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + 16 }]}
        showsVerticalScrollIndicator={false}
      >
        {/* KPI Section */}
        <Text style={styles.sectionTitle}>Performance Overview</Text>

        {isLoading ? (
          <View style={styles.loadingBox}>
            <ActivityIndicator color={colors.accent} />
            <Text style={styles.loadingText}>Loading KPIs…</Text>
          </View>
        ) : error ? (
          <View style={styles.errorBox}>
            <Text style={styles.errorText}>Failed to load KPIs{error instanceof Error ? `: ${error.message}` : ''}</Text>
            <TouchableOpacity onPress={() => refetch()} style={styles.retryBtn}>
              <Text style={styles.retryText}>Retry</Text>
            </TouchableOpacity>
          </View>
        ) : (
          <>
            <View style={styles.kpiRow}>
              <StatTile
                label="Revenue"
                value={fmt(pnlQuery.data ? totals.revenue : undefined, true)}
                color={colors.success}
              />
              <View style={{ width: 10 }} />
              <StatTile
                label="Cost of Goods"
                value={fmt(pnlQuery.data ? totals.cogs : undefined, true)}
                color={colors.danger}
              />
            </View>
            <View style={[styles.kpiRow, { marginTop: 10 }]}>
              <StatTile
                label="Gross Profit"
                value={fmt(pnlQuery.data ? totals.profit : undefined, true)}
                color={colors.accent}
              />
              <View style={{ width: 10 }} />
              <StatTile
                label="Food Cost %"
                value={fmt(kpis?.foodCostPercentage)}
                color={foodCostColor}
              />
            </View>
            <View style={[styles.kpiRow, { marginTop: 10 }]}>
              <StatTile
                label="Gross Margin"
                value={fmt(kpis?.grossMargin)}
                color={colors.success}
              />
              <View style={{ width: 10, flex: 1 }} />
            </View>
          </>
        )}

        {/* Quick Actions */}
        <Text style={[styles.sectionTitle, { marginTop: 24 }]}>Quick Actions</Text>
        <View style={styles.actionsGrid}>
          <TouchableOpacity
            style={styles.actionCard}
            onPress={() => navigation.navigate('Inventory')}
            activeOpacity={0.7}
          >
            <Text style={styles.actionIcon}>📦</Text>
            <Text style={styles.actionLabel}>Scan Item</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={styles.actionCard}
            onPress={() => navigation.navigate('Waste')}
            activeOpacity={0.7}
          >
            <Text style={styles.actionIcon}>🗑️</Text>
            <Text style={styles.actionLabel}>Add Waste</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={styles.actionCard}
            onPress={() => navigation.navigate('Orders')}
            activeOpacity={0.7}
          >
            <Text style={styles.actionIcon}>📋</Text>
            <Text style={styles.actionLabel}>Purchase Orders</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={styles.actionCard}
            onPress={() => navigation.navigate('Analytics')}
            activeOpacity={0.7}
          >
            <Text style={styles.actionIcon}>📊</Text>
            <Text style={styles.actionLabel}>Analytics</Text>
          </TouchableOpacity>
        </View>
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
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 16,
    backgroundColor: colors.surface,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  greeting: {
    fontSize: 13,
    color: colors.accent,
    fontWeight: '700',
    letterSpacing: 1,
    textTransform: 'uppercase',
  },
  locationName: {
    fontSize: 20,
    fontWeight: '800',
    color: colors.text,
    marginTop: 2,
  },
  badge: {
    backgroundColor: colors.bg,
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderWidth: 1,
    borderColor: colors.border,
  },
  badgeText: {
    color: colors.muted,
    fontSize: 12,
    fontWeight: '600',
  },
  content: {
    padding: 16,
  },
  sectionTitle: {
    fontSize: 14,
    fontWeight: '700',
    color: colors.muted,
    textTransform: 'uppercase',
    letterSpacing: 0.8,
    marginBottom: 12,
  },
  kpiRow: {
    flexDirection: 'row',
  },
  loadingBox: {
    backgroundColor: colors.surface,
    borderRadius: 12,
    padding: 32,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: colors.border,
  },
  loadingText: {
    color: colors.muted,
    marginTop: 10,
  },
  errorBox: {
    backgroundColor: colors.surface,
    borderRadius: 12,
    padding: 32,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: colors.danger,
  },
  errorText: {
    color: colors.danger,
    fontSize: 15,
  },
  retryBtn: {
    marginTop: 12,
    paddingHorizontal: 20,
    paddingVertical: 8,
    backgroundColor: colors.accent,
    borderRadius: 8,
  },
  retryText: {
    color: '#fff',
    fontWeight: '600',
  },
  actionsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
  },
  actionCard: {
    backgroundColor: colors.surface,
    borderRadius: 14,
    padding: 20,
    alignItems: 'center',
    width: '47%',
    borderWidth: 1,
    borderColor: colors.border,
  },
  actionIcon: {
    fontSize: 32,
    marginBottom: 10,
  },
  actionLabel: {
    fontSize: 13,
    fontWeight: '600',
    color: colors.text,
    textAlign: 'center',
  },
});
