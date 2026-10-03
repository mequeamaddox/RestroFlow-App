import React, { useState } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  RefreshControl,
  ScrollView,
  Dimensions,
} from 'react-native';
import { useQuery } from '@tanstack/react-query';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { apiFetch } from '../lib/api';
import { useSelectedLocation } from '../contexts/LocationContext';
import { StatTile } from '../components/StatTile';
import { colors } from '../lib/colors';

interface KPIs {
  grossMargin: number;
  foodCostPercentage: number;
  avgOrderValue: number;
  customerCount: number;
}

interface DailyPnL {
  date: string;
  revenue: number;
  cogs: number;
  grossProfit: number;
}

type Range = '7d' | '30d' | '90d';

const RANGES: { label: string; value: Range }[] = [
  { label: '7 Days', value: '7d' },
  { label: '30 Days', value: '30d' },
  { label: '90 Days', value: '90d' },
];

const { width: SCREEN_W } = Dimensions.get('window');
const BAR_AREA_W = SCREEN_W - 32;

function fmt(n: number | undefined, currency = false) {
  if (n === undefined || n === null) return '—';
  if (currency) {
    return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(n);
  }
  return n.toFixed(1) + '%';
}

function MiniBar({ value, max, color }: { value: number; max: number; color: string }) {
  const pct = max > 0 ? Math.max(0, Math.min(1, value / max)) : 0;
  return (
    <View style={{ height: 6, backgroundColor: colors.border, borderRadius: 3, overflow: 'hidden' }}>
      <View style={{ height: '100%', width: `${pct * 100}%`, backgroundColor: color, borderRadius: 3 }} />
    </View>
  );
}

export function AnalyticsScreen() {
  const insets = useSafeAreaInsets();
  const { locationId } = useSelectedLocation();
  const [range, setRange] = useState<Range>('30d');
  const [refreshing, setRefreshing] = useState(false);

  const { data: kpis, isLoading: kpisLoading, refetch: refetchKpis } = useQuery<KPIs>({
    queryKey: ['kpis', locationId, range],
    queryFn: () => apiFetch<KPIs>(`/api/business-intelligence/kpis?location=${locationId}&range=${range}`),
    enabled: !!locationId,
  });

  const { data: pnl = [], isLoading: pnlLoading, refetch: refetchPnl } = useQuery<DailyPnL[]>({
    queryKey: ['daily-pnl', locationId, range],
    queryFn: () => apiFetch<DailyPnL[]>(`/api/business-intelligence/daily-pnl?location=${locationId}&range=${range}`),
    enabled: !!locationId,
  });

  async function handleRefresh() {
    setRefreshing(true);
    try { await Promise.all([refetchKpis(), refetchPnl()]); } finally { setRefreshing(false); }
  }

  const isLoading = kpisLoading || pnlLoading;
  const totals = pnl.reduce(
    (acc, d) => ({ revenue: acc.revenue + d.revenue, cogs: acc.cogs + d.cogs, profit: acc.profit + d.grossProfit }),
    { revenue: 0, cogs: 0, profit: 0 },
  );

  const maxRevenue = Math.max(...pnl.map(d => d.revenue ?? 0), 1);
  const maxCost = Math.max(...pnl.map(d => d.cogs ?? 0), 1);

  const foodCostColor = kpis?.foodCostPercentage !== undefined
    ? kpis.foodCostPercentage > 35 ? colors.danger
    : kpis.foodCostPercentage > 28 ? colors.warning
    : colors.success
    : colors.text;

  // Last 14 days for chart (or all if fewer)
  const chartData = pnl.slice(-14);
  const chartMax = Math.max(...chartData.map(d => Math.max(d.revenue ?? 0, d.cogs ?? 0)), 1);
  const BAR_W = Math.max(8, Math.floor((BAR_AREA_W - chartData.length * 4) / chartData.length));

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      <View style={styles.header}>
        <Text style={styles.headerTitle}>Analytics</Text>
      </View>

      <ScrollView
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={handleRefresh} tintColor={colors.accent} />}
        contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + 20 }]}
        showsVerticalScrollIndicator={false}
      >
        {/* Range selector */}
        <View style={styles.rangeRow}>
          {RANGES.map(r => (
            <TouchableOpacity
              key={r.value}
              style={[styles.rangeBtn, range === r.value && styles.rangeBtnActive]}
              onPress={() => setRange(r.value)}
            >
              <Text style={[styles.rangeBtnText, range === r.value && styles.rangeBtnTextActive]}>
                {r.label}
              </Text>
            </TouchableOpacity>
          ))}
        </View>

        {isLoading ? (
          <View style={styles.loadingBox}>
            <ActivityIndicator color={colors.accent} />
            <Text style={styles.loadingText}>Loading analytics…</Text>
          </View>
        ) : (
          <>
            {/* KPI tiles */}
            <Text style={styles.sectionTitle}>Key Metrics</Text>
            <View style={styles.kpiGrid}>
              <StatTile label="Revenue" value={fmt(totals.revenue, true)} color={colors.success} />
              <StatTile label="Cost of Goods" value={fmt(totals.cogs, true)} color={colors.danger} />
            </View>
            <View style={[styles.kpiGrid, { marginTop: 10 }]}>
              <StatTile label="Gross Profit" value={fmt(totals.profit, true)} color={colors.accent} />
              <StatTile label="Food Cost %" value={fmt(kpis?.foodCostPercentage)} color={foodCostColor} />
            </View>

            {/* Food cost gauge */}
            {kpis?.foodCostPercentage !== undefined && (
              <View style={styles.gaugeCard}>
                <View style={styles.gaugeHeader}>
                  <Text style={styles.gaugeLabel}>Food Cost %</Text>
                  <Text style={[styles.gaugeValue, { color: foodCostColor }]}>
                    {kpis.foodCostPercentage.toFixed(1)}%
                  </Text>
                </View>
                <View style={styles.gaugeTrack}>
                  <View
                    style={[
                      styles.gaugeFill,
                      {
                        width: `${Math.min(100, kpis.foodCostPercentage / 40 * 100)}%`,
                        backgroundColor: foodCostColor,
                      },
                    ]}
                  />
                  {/* Target markers */}
                  <View style={[styles.gaugeMarker, { left: `${28 / 40 * 100}%` }]} />
                  <View style={[styles.gaugeMarker, { left: `${35 / 40 * 100}%` }]} />
                </View>
                <View style={styles.gaugeLabels}>
                  <Text style={styles.gaugeRangeText}>0%</Text>
                  <Text style={[styles.gaugeRangeText, { color: colors.success }]}>Good ≤28%</Text>
                  <Text style={[styles.gaugeRangeText, { color: colors.danger }]}>High ≥35%</Text>
                  <Text style={styles.gaugeRangeText}>40%</Text>
                </View>
              </View>
            )}

            {/* Revenue vs Cost chart */}
            {chartData.length > 0 && (
              <>
                <Text style={[styles.sectionTitle, { marginTop: 24 }]}>
                  Revenue vs Cost (last {chartData.length} days)
                </Text>
                <View style={styles.chartCard}>
                  <View style={styles.chartLegend}>
                    <View style={styles.legendItem}>
                      <View style={[styles.legendDot, { backgroundColor: colors.success }]} />
                      <Text style={styles.legendText}>Revenue</Text>
                    </View>
                    <View style={styles.legendItem}>
                      <View style={[styles.legendDot, { backgroundColor: colors.danger }]} />
                      <Text style={styles.legendText}>Cost</Text>
                    </View>
                  </View>
                  <ScrollView horizontal showsHorizontalScrollIndicator={false}>
                    <View style={styles.chartArea}>
                      {chartData.map((d, i) => {
                        const revH = Math.round(((d.revenue ?? 0) / chartMax) * 80);
                        const costH = Math.round(((d.cogs ?? 0) / chartMax) * 80);
                        const label = new Date(d.date).toLocaleDateString('en-US', { month: 'numeric', day: 'numeric' });
                        return (
                          <View key={i} style={[styles.barGroup, { width: BAR_W * 2 + 6 }]}>
                            <View style={styles.bars}>
                              <View style={[styles.bar, { height: Math.max(2, revH), backgroundColor: colors.success, width: BAR_W }]} />
                              <View style={[styles.bar, { height: Math.max(2, costH), backgroundColor: colors.danger, width: BAR_W }]} />
                            </View>
                            <Text style={styles.barLabel}>{label}</Text>
                          </View>
                        );
                      })}
                    </View>
                  </ScrollView>
                </View>
              </>
            )}

            {/* Summary table */}
            {pnl.length > 0 && (
              <>
                <Text style={[styles.sectionTitle, { marginTop: 24 }]}>Daily Summary</Text>
                <View style={styles.tableCard}>
                  <View style={[styles.tableRow, styles.tableHeader]}>
                    <Text style={[styles.tableCell, styles.tableHeaderText]}>Date</Text>
                    <Text style={[styles.tableCell, styles.tableHeaderText, { textAlign: 'right' }]}>Revenue</Text>
                    <Text style={[styles.tableCell, styles.tableHeaderText, { textAlign: 'right' }]}>Cost</Text>
                    <Text style={[styles.tableCell, styles.tableHeaderText, { textAlign: 'right' }]}>Profit</Text>
                  </View>
                  {pnl.slice(-10).reverse().map((d, i) => (
                    <View key={i} style={[styles.tableRow, i % 2 === 0 && styles.tableRowAlt]}>
                      <Text style={styles.tableCell}>
                        {new Date(d.date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                      </Text>
                      <Text style={[styles.tableCell, { textAlign: 'right', color: colors.success }]}>
                        ${(d.revenue ?? 0).toFixed(0)}
                      </Text>
                      <Text style={[styles.tableCell, { textAlign: 'right', color: colors.danger }]}>
                        ${(d.cogs ?? 0).toFixed(0)}
                      </Text>
                      <Text style={[styles.tableCell, { textAlign: 'right', color: (d.grossProfit ?? 0) >= 0 ? colors.success : colors.danger }]}>
                        ${(d.grossProfit ?? 0).toFixed(0)}
                      </Text>
                    </View>
                  ))}
                </View>
              </>
            )}
          </>
        )}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg },
  header: {
    paddingHorizontal: 16, paddingVertical: 12,
    backgroundColor: colors.surface, borderBottomWidth: 1, borderBottomColor: colors.border,
  },
  headerTitle: { fontSize: 18, fontWeight: '700', color: colors.text, textAlign: 'center' },
  content: { padding: 16 },
  rangeRow: { flexDirection: 'row', gap: 8, marginBottom: 20 },
  rangeBtn: {
    flex: 1, paddingVertical: 9, alignItems: 'center',
    backgroundColor: colors.surface, borderRadius: 8,
    borderWidth: 1, borderColor: colors.border,
  },
  rangeBtnActive: { backgroundColor: colors.accent, borderColor: colors.accent },
  rangeBtnText: { fontSize: 13, fontWeight: '600', color: colors.muted },
  rangeBtnTextActive: { color: '#fff' },
  loadingBox: {
    backgroundColor: colors.surface, borderRadius: 12, padding: 32,
    alignItems: 'center', borderWidth: 1, borderColor: colors.border,
  },
  loadingText: { color: colors.muted, marginTop: 10 },
  sectionTitle: {
    fontSize: 12, fontWeight: '700', color: colors.muted,
    textTransform: 'uppercase', letterSpacing: 0.8, marginBottom: 10,
  },
  kpiGrid: { flexDirection: 'row', gap: 10 },
  gaugeCard: {
    backgroundColor: colors.surface, borderRadius: 12,
    borderWidth: 1, borderColor: colors.border,
    padding: 16, marginTop: 16,
  },
  gaugeHeader: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 12 },
  gaugeLabel: { fontSize: 13, color: colors.muted, fontWeight: '600' },
  gaugeValue: { fontSize: 20, fontWeight: '800' },
  gaugeTrack: {
    height: 10, backgroundColor: colors.border,
    borderRadius: 5, overflow: 'visible', position: 'relative',
  },
  gaugeFill: { height: '100%', borderRadius: 5 },
  gaugeMarker: {
    position: 'absolute', top: -3, width: 2, height: 16,
    backgroundColor: colors.text, opacity: 0.4, borderRadius: 1,
  },
  gaugeLabels: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 6 },
  gaugeRangeText: { fontSize: 10, color: colors.muted },
  chartCard: {
    backgroundColor: colors.surface, borderRadius: 12,
    borderWidth: 1, borderColor: colors.border, padding: 12,
  },
  chartLegend: { flexDirection: 'row', gap: 16, marginBottom: 12 },
  legendItem: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  legendDot: { width: 10, height: 10, borderRadius: 5 },
  legendText: { fontSize: 12, color: colors.muted },
  chartArea: { flexDirection: 'row', alignItems: 'flex-end', height: 100, gap: 4 },
  barGroup: { alignItems: 'center', gap: 4 },
  bars: { flexDirection: 'row', alignItems: 'flex-end', gap: 2 },
  bar: { borderRadius: 3, minHeight: 2 },
  barLabel: { fontSize: 9, color: colors.muted, textAlign: 'center' },
  tableCard: {
    backgroundColor: colors.surface, borderRadius: 12,
    borderWidth: 1, borderColor: colors.border, overflow: 'hidden',
  },
  tableRow: {
    flexDirection: 'row', paddingVertical: 9, paddingHorizontal: 12,
    borderBottomWidth: 1, borderBottomColor: colors.border,
  },
  tableRowAlt: { backgroundColor: colors.bg + '60' },
  tableHeader: { backgroundColor: colors.bg },
  tableCell: { flex: 1, fontSize: 12, color: colors.text },
  tableHeaderText: { fontWeight: '700', color: colors.muted, textTransform: 'uppercase', fontSize: 10, letterSpacing: 0.5 },
});
