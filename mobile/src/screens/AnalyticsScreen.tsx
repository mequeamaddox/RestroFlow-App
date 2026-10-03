import React, { useState } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  ScrollView,
  ActivityIndicator,
  RefreshControl,
  Dimensions,
} from 'react-native';
import { useQuery } from '@tanstack/react-query';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { apiFetch } from '../lib/api';
import { useSelectedLocation } from '../contexts/LocationContext';
import { StatTile } from '../components/StatTile';
import { colors } from '../lib/colors';

// ─── Types ───────────────────────────────────────────────────────────────────

interface KPIs {
  totalRevenue: number;
  totalCost: number;
  grossProfit: number;
  foodCostPct: number;
  laborCostPct: number;
}

interface DailyPnL {
  date: string;
  revenue: number;
  cost: number;
  profit: number;
}

type Range = '7d' | '30d' | '90d';

const RANGES: { label: string; value: Range }[] = [
  { label: '7 Days', value: '7d' },
  { label: '30 Days', value: '30d' },
  { label: '90 Days', value: '90d' },
];

const SCREEN_WIDTH = Dimensions.get('window').width;
const CHART_PADDING = 32;
const CHART_WIDTH = SCREEN_WIDTH - CHART_PADDING * 2;

function fmt(n: number | undefined, currency = false): string {
  if (n === undefined || n === null) return '—';
  if (currency) {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
      maximumFractionDigits: 0,
    }).format(n);
  }
  return n.toFixed(1) + '%';
}

function formatDateShort(iso: string): string {
  try {
    return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  } catch { return iso; }
}

// ─── Bar Chart ────────────────────────────────────────────────────────────────

function BarChart({ data }: { data: DailyPnL[] }) {
  if (!data || data.length === 0) {
    return <Text style={{ color: colors.muted, textAlign: 'center', marginTop: 16 }}>No data available</Text>;
  }

  // Show at most 14 bars for readability
  const slice = data.length > 14 ? data.slice(-14) : data;
  const maxVal = Math.max(...slice.map((d) => Math.max(d.revenue, d.cost)), 1);
  const BAR_HEIGHT = 140;
  const barWidth = Math.floor((CHART_WIDTH - slice.length * 2) / (slice.length * 2));

  return (
    <View style={chartStyles.container}>
      <View style={chartStyles.chart}>
        {slice.map((day, idx) => {
          const revH = Math.max(4, (day.revenue / maxVal) * BAR_HEIGHT);
          const costH = Math.max(4, (day.cost / maxVal) * BAR_HEIGHT);
          const profitPositive = day.profit >= 0;
          return (
            <View key={idx} style={chartStyles.barGroup}>
              <View style={chartStyles.bars}>
                <View style={[chartStyles.bar, { height: revH, backgroundColor: colors.success }]} />
                <View style={[chartStyles.bar, { height: costH, backgroundColor: colors.danger }]} />
              </View>
              {idx % Math.ceil(slice.length / 4) === 0 && (
                <Text style={chartStyles.dateLabel}>{formatDateShort(day.date)}</Text>
              )}
            </View>
          );
        })}
      </View>
      {/* Legend */}
      <View style={chartStyles.legend}>
        <View style={chartStyles.legendItem}>
          <View style={[chartStyles.legendDot, { backgroundColor: colors.success }]} />
          <Text style={chartStyles.legendLabel}>Revenue</Text>
        </View>
        <View style={chartStyles.legendItem}>
          <View style={[chartStyles.legendDot, { backgroundColor: colors.danger }]} />
          <Text style={chartStyles.legendLabel}>Cost</Text>
        </View>
      </View>
    </View>
  );
}

// ─── Gauge ────────────────────────────────────────────────────────────────────

function FoodCostGauge({ value }: { value: number | undefined }) {
  if (value === undefined) return null;
  const pct = Math.min(100, Math.max(0, value));
  const gaugeColor =
    pct > 35 ? colors.danger : pct > 28 ? colors.warning : colors.success;
  const fillWidth = (pct / 50) * 100; // 50% is the max typical food cost

  return (
    <View style={gaugeStyles.container}>
      <View style={gaugeStyles.labelRow}>
        <Text style={gaugeStyles.label}>Food Cost %</Text>
        <Text style={[gaugeStyles.value, { color: gaugeColor }]}>{pct.toFixed(1)}%</Text>
      </View>
      <View style={gaugeStyles.track}>
        <View style={[gaugeStyles.fill, { width: `${Math.min(100, fillWidth * 2)}%`, backgroundColor: gaugeColor }]} />
      </View>
      <View style={gaugeStyles.markers}>
        <Text style={gaugeStyles.marker}>0%</Text>
        <Text style={[gaugeStyles.marker, { color: colors.success }]}>25%</Text>
        <Text style={[gaugeStyles.marker, { color: colors.warning }]}>35%</Text>
        <Text style={[gaugeStyles.marker, { color: colors.danger }]}>50%+</Text>
      </View>
    </View>
  );
}

// ─── Main Screen ──────────────────────────────────────────────────────────────

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

  const { data: dailyPnL, isLoading: pnlLoading, refetch: refetchPnL } = useQuery<DailyPnL[]>({
    queryKey: ['daily-pnl', locationId, range],
    queryFn: () => apiFetch<DailyPnL[]>(`/api/business-intelligence/daily-pnl?location=${locationId}&range=${range}`),
    enabled: !!locationId,
  });

  async function handleRefresh() {
    setRefreshing(true);
    try {
      await Promise.all([refetchKpis(), refetchPnL()]);
    } finally {
      setRefreshing(false);
    }
  }

  const isLoading = kpisLoading || pnlLoading;

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      <View style={styles.header}>
        <Text style={styles.headerTitle}>Analytics</Text>
      </View>

      {/* Range Selector */}
      <View style={styles.rangeRow}>
        {RANGES.map((r) => (
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

      <ScrollView
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={handleRefresh} tintColor={colors.accent} />}
        contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + 16 }]}
        showsVerticalScrollIndicator={false}
      >
        {isLoading ? (
          <View style={styles.centered}>
            <ActivityIndicator color={colors.accent} />
            <Text style={styles.mutedText}>Loading analytics…</Text>
          </View>
        ) : (
          <>
            {/* KPI tiles */}
            <Text style={styles.sectionTitle}>Summary</Text>
            <View style={styles.kpiRow}>
              <StatTile label="Revenue" value={fmt(kpis?.totalRevenue, true)} color={colors.success} />
              <View style={{ width: 10 }} />
              <StatTile label="Gross Profit" value={fmt(kpis?.grossProfit, true)} color={colors.accent} />
            </View>
            <View style={[styles.kpiRow, { marginTop: 10 }]}>
              <StatTile label="Total Cost" value={fmt(kpis?.totalCost, true)} color={colors.danger} />
              <View style={{ width: 10 }} />
              <StatTile label="Labor Cost %" value={fmt(kpis?.laborCostPct)} color={colors.warning} />
            </View>

            {/* Food Cost Gauge */}
            <View style={styles.gaugeCard}>
              <FoodCostGauge value={kpis?.foodCostPct} />
            </View>

            {/* Daily P&L Chart */}
            <Text style={[styles.sectionTitle, { marginTop: 24 }]}>Daily Revenue vs Cost</Text>
            <View style={styles.chartCard}>
              {pnlLoading ? (
                <ActivityIndicator color={colors.accent} />
              ) : (
                <BarChart data={dailyPnL ?? []} />
              )}
            </View>

            {/* P&L Table (last 7 days) */}
            {dailyPnL && dailyPnL.length > 0 && (
              <>
                <Text style={[styles.sectionTitle, { marginTop: 24 }]}>Recent Days</Text>
                {[...dailyPnL].reverse().slice(0, 7).map((day) => (
                  <View key={day.date} style={styles.tableRow}>
                    <Text style={styles.tableDate}>{formatDateShort(day.date)}</Text>
                    <Text style={styles.tableRevenue}>{fmt(day.revenue, true)}</Text>
                    <Text style={styles.tableCost}>{fmt(day.cost, true)}</Text>
                    <Text style={[styles.tableProfit, { color: day.profit >= 0 ? colors.success : colors.danger }]}>
                      {day.profit >= 0 ? '+' : ''}{fmt(day.profit, true)}
                    </Text>
                  </View>
                ))}
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
    paddingHorizontal: 16,
    paddingVertical: 12,
    backgroundColor: colors.surface,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  headerTitle: { fontSize: 18, fontWeight: '700', color: colors.text },
  rangeRow: {
    flexDirection: 'row',
    paddingHorizontal: 16,
    paddingVertical: 10,
    gap: 8,
    backgroundColor: colors.surface,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  rangeBtn: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: colors.border,
  },
  rangeBtnActive: { backgroundColor: colors.accent, borderColor: colors.accent },
  rangeBtnText: { fontSize: 13, color: colors.muted, fontWeight: '600' },
  rangeBtnTextActive: { color: '#fff' },
  content: { padding: 16 },
  centered: { justifyContent: 'center', alignItems: 'center', padding: 40 },
  mutedText: { color: colors.muted, marginTop: 10 },
  sectionTitle: {
    fontSize: 12,
    fontWeight: '700',
    color: colors.muted,
    textTransform: 'uppercase',
    letterSpacing: 0.8,
    marginBottom: 12,
  },
  kpiRow: { flexDirection: 'row' },
  gaugeCard: {
    backgroundColor: colors.surface,
    borderRadius: 12,
    padding: 16,
    marginTop: 10,
    borderWidth: 1,
    borderColor: colors.border,
  },
  chartCard: {
    backgroundColor: colors.surface,
    borderRadius: 12,
    padding: 16,
    borderWidth: 1,
    borderColor: colors.border,
  },
  tableRow: {
    flexDirection: 'row',
    backgroundColor: colors.surface,
    borderRadius: 8,
    paddingHorizontal: 14,
    paddingVertical: 10,
    marginBottom: 6,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: 'center',
  },
  tableDate: { flex: 1, color: colors.muted, fontSize: 13 },
  tableRevenue: { color: colors.success, fontSize: 13, fontWeight: '600', marginRight: 12 },
  tableCost: { color: colors.danger, fontSize: 13, fontWeight: '600', marginRight: 12 },
  tableProfit: { fontSize: 13, fontWeight: '700', minWidth: 70, textAlign: 'right' },
});

const chartStyles = StyleSheet.create({
  container: { width: '100%' },
  chart: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    height: 160,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
    paddingBottom: 4,
  },
  barGroup: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'flex-end',
  },
  bars: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: 1,
  },
  bar: {
    width: 6,
    borderRadius: 2,
    minHeight: 4,
  },
  dateLabel: {
    color: colors.muted,
    fontSize: 9,
    marginTop: 4,
  },
  legend: {
    flexDirection: 'row',
    justifyContent: 'center',
    marginTop: 12,
    gap: 24,
  },
  legendItem: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  legendDot: { width: 10, height: 10, borderRadius: 5 },
  legendLabel: { color: colors.muted, fontSize: 12 },
});

const gaugeStyles = StyleSheet.create({
  container: {},
  labelRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 10,
  },
  label: { fontSize: 13, fontWeight: '600', color: colors.muted, textTransform: 'uppercase', letterSpacing: 0.5 },
  value: { fontSize: 22, fontWeight: '800' },
  track: {
    height: 12,
    backgroundColor: colors.bg,
    borderRadius: 6,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: colors.border,
  },
  fill: {
    height: '100%',
    borderRadius: 6,
  },
  markers: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: 6,
  },
  marker: { fontSize: 11, color: colors.muted },
});
