import React, { useState, useRef } from 'react';
import {
  View,
  Text,
  FlatList,
  TouchableOpacity,
  StyleSheet,
  TextInput,
  ActivityIndicator,
  Alert,
  RefreshControl,
  Modal,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { useNavigation, useRoute } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { CameraView, useCameraPermissions } from 'expo-camera';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { apiFetch } from '../lib/api';
import { useSelectedLocation } from '../contexts/LocationContext';
import { colors } from '../lib/colors';

// ─── Types ────────────────────────────────────────────────────────────────────

interface InventoryItem {
  id: string;
  name: string;
  displayName?: string;
  category?: { id: string; name: string } | null;
  vendor?: { id: string; name: string } | null;
  unit: string;
  quantity: string;
  costPerUnit: string;
  barcode?: string | null;
  reorderLevel?: string;
}

export type InventoryStackParamList = {
  InventoryList: undefined;
  InventoryDetail: { itemId: string };
  BarcodeScanner: undefined;
};

const Stack = createNativeStackNavigator<InventoryStackParamList>();

// ─── Navigator ────────────────────────────────────────────────────────────────

export function InventoryNavigator() {
  return (
    <Stack.Navigator screenOptions={{ headerShown: false }}>
      <Stack.Screen name="InventoryList" component={InventoryListScreen} />
      <Stack.Screen name="InventoryDetail" component={InventoryDetailScreen} />
      <Stack.Screen name="BarcodeScanner" component={BarcodeScannerScreen} />
    </Stack.Navigator>
  );
}

// ─── List Screen ──────────────────────────────────────────────────────────────

function InventoryListScreen() {
  const insets = useSafeAreaInsets();
  const navigation = useNavigation<NativeStackNavigationProp<InventoryStackParamList>>();
  const { locationId } = useSelectedLocation();
  const [search, setSearch] = useState('');
  const [refreshing, setRefreshing] = useState(false);

  const { data: items = [], isLoading, error, refetch } = useQuery<InventoryItem[]>({
    queryKey: ['inventory', locationId],
    queryFn: () => apiFetch<InventoryItem[]>(`/api/inventory?locationId=${locationId}`),
    enabled: !!locationId,
  });

  const filtered = items.filter(i =>
    i.name.toLowerCase().includes(search.toLowerCase()) ||
    (i.displayName ?? '').toLowerCase().includes(search.toLowerCase()) ||
    (i.barcode ?? '').includes(search)
  );

  // Group by category
  const grouped = filtered.reduce<Record<string, InventoryItem[]>>((acc, item) => {
    const cat = item.category?.name ?? 'Uncategorized';
    if (!acc[cat]) acc[cat] = [];
    acc[cat].push(item);
    return acc;
  }, {});
  const sections = Object.entries(grouped).sort(([a], [b]) => a.localeCompare(b));

  async function handleRefresh() {
    setRefreshing(true);
    try { await refetch(); } finally { setRefreshing(false); }
  }

  const flatData: Array<{ type: 'header'; title: string } | { type: 'item'; item: InventoryItem }> = [];
  for (const [cat, catItems] of sections) {
    flatData.push({ type: 'header', title: cat });
    for (const item of catItems) flatData.push({ type: 'item', item });
  }

  function qtyColor(item: InventoryItem) {
    const qty = parseFloat(item.quantity);
    const min = parseFloat(item.reorderLevel ?? '0');
    if (qty <= 0) return colors.danger;
    if (min > 0 && qty <= min) return colors.warning;
    return colors.success;
  }

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      <View style={styles.header}>
        <Text style={styles.headerTitle}>Inventory</Text>
        <TouchableOpacity
          style={styles.scanBtn}
          onPress={() => navigation.navigate('BarcodeScanner')}
          activeOpacity={0.7}
        >
          <Text style={styles.scanBtnText}>📷 Scan</Text>
        </TouchableOpacity>
      </View>

      <View style={styles.searchRow}>
        <TextInput
          style={styles.searchInput}
          placeholder="Search items or barcode…"
          placeholderTextColor={colors.muted}
          value={search}
          onChangeText={setSearch}
          clearButtonMode="while-editing"
        />
      </View>

      {isLoading ? (
        <View style={styles.center}>
          <ActivityIndicator color={colors.accent} size="large" />
          <Text style={styles.loadingText}>Loading inventory…</Text>
        </View>
      ) : error ? (
        <View style={styles.center}>
          <Text style={styles.errorText}>Failed to load inventory</Text>
          <TouchableOpacity onPress={() => refetch()} style={styles.retryBtn}>
            <Text style={styles.retryText}>Retry</Text>
          </TouchableOpacity>
        </View>
      ) : (
        <FlatList
          data={flatData}
          keyExtractor={(d, i) => d.type === 'header' ? `h-${d.title}` : d.item.id}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={handleRefresh} tintColor={colors.accent} />}
          ListEmptyComponent={
            <View style={styles.center}>
              <Text style={styles.emptyText}>
                {search ? 'No items match your search' : 'No inventory items yet'}
              </Text>
            </View>
          }
          renderItem={({ item: d }) => {
            if (d.type === 'header') {
              return <Text style={styles.catHeader}>{d.title}</Text>;
            }
            const { item } = d;
            return (
              <TouchableOpacity
                style={styles.itemRow}
                onPress={() => navigation.navigate('InventoryDetail', { itemId: item.id })}
                activeOpacity={0.7}
              >
                <View style={styles.itemLeft}>
                  <Text style={styles.itemName}>{item.displayName ?? item.name}</Text>
                  {!!item.vendor?.name && <Text style={styles.itemSub}>{item.vendor.name}</Text>}
                </View>
                <View style={styles.itemRight}>
                  <Text style={[styles.itemQty, { color: qtyColor(item) }]}>
                    {parseFloat(item.quantity).toFixed(2)}
                  </Text>
                  <Text style={styles.itemUnit}>{item.unit}</Text>
                </View>
              </TouchableOpacity>
            );
          }}
        />
      )}
    </View>
  );
}

// ─── Detail Screen ────────────────────────────────────────────────────────────

function InventoryDetailScreen() {
  const route = useRoute<any>();
  const insets = useSafeAreaInsets();
  const navigation = useNavigation<NativeStackNavigationProp<InventoryStackParamList>>();
  const { locationId } = useSelectedLocation();
  const qc = useQueryClient();
  const { itemId } = route.params as { itemId: string };

  const { data: items = [] } = useQuery<InventoryItem[]>({
    queryKey: ['inventory', locationId],
    queryFn: () => apiFetch<InventoryItem[]>(`/api/inventory?locationId=${locationId}`),
    enabled: !!locationId,
  });
  const item = items.find(i => i.id === itemId);

  const [editQty, setEditQty] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const mutation = useMutation({
    mutationFn: (qty: string) =>
      apiFetch(`/api/inventory/${itemId}`, {
        method: 'PUT',
        body: JSON.stringify({ quantity: String(parseFloat(qty)) }),
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['inventory', locationId] });
      setEditQty(null);
      Alert.alert('Saved', 'Quantity updated.');
    },
    onError: (err: Error) => Alert.alert('Error', err.message),
  });

  if (!item) {
    return (
      <View style={[styles.container, { paddingTop: insets.top }, styles.center]}>
        <ActivityIndicator color={colors.accent} />
      </View>
    );
  }

  const qty = parseFloat(editQty ?? item.quantity);
  const minQty = parseFloat(item.reorderLevel ?? '0');

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backBtn}>
          <Text style={styles.backBtnText}>← Back</Text>
        </TouchableOpacity>
        <Text style={styles.headerTitle} numberOfLines={1}>{item.displayName ?? item.name}</Text>
        <View style={{ width: 70 }} />
      </View>

      <View style={styles.detailScroll}>
        {/* Quantity control */}
        <View style={styles.qtyCard}>
          <Text style={styles.qtyLabel}>Current Quantity</Text>
          <View style={styles.qtyControls}>
            <TouchableOpacity
              style={styles.qtyBtn}
              onPress={() => setEditQty(String(Math.max(0, qty - 1)))}
            >
              <Text style={styles.qtyBtnText}>−</Text>
            </TouchableOpacity>
            <TextInput
              style={styles.qtyInput}
              value={editQty ?? String(parseFloat(item.quantity).toFixed(2))}
              onChangeText={setEditQty}
              keyboardType="decimal-pad"
              selectTextOnFocus
            />
            <TouchableOpacity
              style={styles.qtyBtn}
              onPress={() => setEditQty(String(qty + 1))}
            >
              <Text style={styles.qtyBtnText}>+</Text>
            </TouchableOpacity>
          </View>
          <Text style={styles.qtyUnit}>{item.unit}</Text>

          {editQty !== null && editQty !== item.quantity && (
            <TouchableOpacity
              style={styles.saveBtn}
              onPress={() => mutation.mutate(editQty)}
              disabled={mutation.isPending}
            >
              {mutation.isPending ? (
                <ActivityIndicator color="#fff" />
              ) : (
                <Text style={styles.saveBtnText}>Save Quantity</Text>
              )}
            </TouchableOpacity>
          )}
        </View>

        {/* Item info */}
        <View style={styles.infoCard}>
          {[
            ['Name', item.name],
            ['Category', item.category?.name ?? '—'],
            ['Unit', item.unit],
            ['Cost / Unit', item.costPerUnit ? `$${parseFloat(item.costPerUnit).toFixed(2)}` : '—'],
            ['Reorder At', minQty > 0 ? `${minQty} ${item.unit}` : '—'],
            ['Vendor', item.vendor?.name ?? '—'],
            ['Barcode', item.barcode ?? 'None'],
          ].map(([label, value]) => (
            <View key={label} style={styles.infoRow}>
              <Text style={styles.infoLabel}>{label}</Text>
              <Text style={styles.infoValue}>{value}</Text>
            </View>
          ))}
        </View>
      </View>
    </View>
  );
}

// ─── Barcode Scanner Screen ───────────────────────────────────────────────────

function BarcodeScannerScreen() {
  const insets = useSafeAreaInsets();
  const navigation = useNavigation<NativeStackNavigationProp<InventoryStackParamList>>();
  const { locationId } = useSelectedLocation();
  const [permission, requestPermission] = useCameraPermissions();
  const [scanned, setScanned] = useState(false);

  const { data: items = [] } = useQuery<InventoryItem[]>({
    queryKey: ['inventory', locationId],
    queryFn: () => apiFetch<InventoryItem[]>(`/api/inventory?locationId=${locationId}`),
    enabled: !!locationId,
  });

  if (!permission) {
    return (
      <View style={[styles.container, { paddingTop: insets.top }, styles.center]}>
        <ActivityIndicator color={colors.accent} />
      </View>
    );
  }

  if (!permission.granted) {
    return (
      <View style={[styles.container, { paddingTop: insets.top }, styles.center]}>
        <Text style={styles.permText}>Camera access is required to scan barcodes</Text>
        <TouchableOpacity style={styles.permBtn} onPress={requestPermission}>
          <Text style={styles.permBtnText}>Grant Permission</Text>
        </TouchableOpacity>
        <TouchableOpacity style={[styles.permBtn, { backgroundColor: colors.surface, marginTop: 8 }]} onPress={() => navigation.goBack()}>
          <Text style={[styles.permBtnText, { color: colors.muted }]}>Go Back</Text>
        </TouchableOpacity>
      </View>
    );
  }

  function onBarcodeScanned({ data }: { data: string }) {
    if (scanned) return;
    setScanned(true);

    const match = items.find(i => i.barcode === data);
    if (match) {
      navigation.replace('InventoryDetail', { itemId: match.id });
    } else {
      Alert.alert(
        'Barcode Not Found',
        `Scanned: ${data}\n\nNo inventory item has this barcode. Add the barcode to an item from the web dashboard.`,
        [
          { text: 'Scan Again', onPress: () => setScanned(false) },
          { text: 'Back to List', onPress: () => navigation.goBack() },
        ]
      );
    }
  }

  return (
    <View style={[styles.container]}>
      <CameraView
        style={StyleSheet.absoluteFill}
        facing="back"
        barcodeScannerSettings={{ barcodeTypes: ['qr', 'ean13', 'ean8', 'upc_a', 'upc_e', 'code128', 'code39', 'itf14', 'pdf417', 'aztec', 'datamatrix'] }}
        onBarcodeScanned={scanned ? undefined : onBarcodeScanned}
      />
      {/* Overlay */}
      <View style={[styles.scanOverlay, { paddingTop: insets.top }]}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.scanClose}>
          <Text style={styles.scanCloseText}>✕ Cancel</Text>
        </TouchableOpacity>
        <View style={styles.scanFrame} />
        <Text style={styles.scanHint}>Align barcode within the frame</Text>
        {scanned && (
          <TouchableOpacity style={styles.scanAgainBtn} onPress={() => setScanned(false)}>
            <Text style={styles.scanAgainText}>Tap to Scan Again</Text>
          </TouchableOpacity>
        )}
      </View>
    </View>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 20 },
  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 16, paddingVertical: 12,
    backgroundColor: colors.surface, borderBottomWidth: 1, borderBottomColor: colors.border,
  },
  headerTitle: { fontSize: 18, fontWeight: '700', color: colors.text, flex: 1, textAlign: 'center' },
  backBtn: { paddingRight: 8, width: 70 },
  backBtnText: { color: colors.accent, fontSize: 15, fontWeight: '600' },
  scanBtn: {
    backgroundColor: colors.accent, borderRadius: 8,
    paddingHorizontal: 14, paddingVertical: 7,
  },
  scanBtnText: { color: '#fff', fontWeight: '700', fontSize: 13 },
  searchRow: { padding: 12, backgroundColor: colors.surface, borderBottomWidth: 1, borderBottomColor: colors.border },
  searchInput: {
    backgroundColor: colors.bg, borderWidth: 1, borderColor: colors.border,
    borderRadius: 10, paddingHorizontal: 14, paddingVertical: 9,
    color: colors.text, fontSize: 15,
  },
  catHeader: {
    fontSize: 11, fontWeight: '700', color: colors.muted,
    textTransform: 'uppercase', letterSpacing: 1,
    paddingHorizontal: 16, paddingTop: 16, paddingBottom: 6,
  },
  itemRow: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 16, paddingVertical: 14,
    borderBottomWidth: 1, borderBottomColor: colors.border,
  },
  itemLeft: { flex: 1 },
  itemName: { fontSize: 15, fontWeight: '600', color: colors.text },
  itemSub: { fontSize: 12, color: colors.muted, marginTop: 2 },
  itemRight: { alignItems: 'flex-end', marginLeft: 12 },
  itemQty: { fontSize: 18, fontWeight: '700' },
  itemUnit: { fontSize: 11, color: colors.muted, marginTop: 1 },
  loadingText: { color: colors.muted, marginTop: 10 },
  errorText: { color: colors.danger, fontSize: 15, textAlign: 'center' },
  emptyText: { color: colors.muted, fontSize: 15, textAlign: 'center' },
  retryBtn: {
    marginTop: 12, paddingHorizontal: 20, paddingVertical: 8,
    backgroundColor: colors.accent, borderRadius: 8,
  },
  retryText: { color: '#fff', fontWeight: '600' },
  // Detail
  detailScroll: { flex: 1, padding: 16 },
  qtyCard: {
    backgroundColor: colors.surface, borderRadius: 14,
    padding: 20, marginBottom: 16,
    borderWidth: 1, borderColor: colors.border, alignItems: 'center',
  },
  qtyLabel: { fontSize: 12, fontWeight: '700', color: colors.muted, textTransform: 'uppercase', letterSpacing: 0.8, marginBottom: 16 },
  qtyControls: { flexDirection: 'row', alignItems: 'center', gap: 16 },
  qtyBtn: {
    width: 44, height: 44, borderRadius: 22,
    backgroundColor: colors.bg, borderWidth: 1, borderColor: colors.border,
    alignItems: 'center', justifyContent: 'center',
  },
  qtyBtnText: { fontSize: 22, color: colors.text, fontWeight: '300' },
  qtyInput: {
    fontSize: 36, fontWeight: '800', color: colors.text,
    borderBottomWidth: 2, borderBottomColor: colors.accent,
    paddingBottom: 4, textAlign: 'center', minWidth: 100,
  },
  qtyUnit: { color: colors.muted, marginTop: 8, fontSize: 13 },
  saveBtn: {
    marginTop: 20, backgroundColor: colors.accent,
    borderRadius: 10, paddingVertical: 12, paddingHorizontal: 32,
  },
  saveBtnText: { color: '#fff', fontWeight: '700', fontSize: 15 },
  infoCard: {
    backgroundColor: colors.surface, borderRadius: 14,
    borderWidth: 1, borderColor: colors.border, overflow: 'hidden',
  },
  infoRow: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    paddingHorizontal: 16, paddingVertical: 13,
    borderBottomWidth: 1, borderBottomColor: colors.border,
  },
  infoLabel: { fontSize: 14, color: colors.muted, fontWeight: '500' },
  infoValue: { fontSize: 14, color: colors.text, fontWeight: '600', textAlign: 'right', flex: 1, marginLeft: 12 },
  // Scanner overlay
  scanOverlay: {
    ...StyleSheet.absoluteFillObject,
    alignItems: 'center',
    paddingTop: 60,
  },
  scanClose: {
    alignSelf: 'flex-end', marginRight: 20,
    backgroundColor: 'rgba(0,0,0,0.6)', borderRadius: 20,
    paddingHorizontal: 16, paddingVertical: 8,
  },
  scanCloseText: { color: '#fff', fontWeight: '700', fontSize: 15 },
  scanFrame: {
    width: 250, height: 250,
    borderWidth: 3, borderColor: colors.accent,
    borderRadius: 16, marginTop: 40,
    backgroundColor: 'transparent',
  },
  scanHint: {
    color: '#fff', fontSize: 14, marginTop: 20,
    textShadowColor: 'rgba(0,0,0,0.8)', textShadowOffset: { width: 0, height: 1 }, textShadowRadius: 4,
  },
  scanAgainBtn: {
    marginTop: 20, backgroundColor: colors.accent, borderRadius: 10,
    paddingVertical: 12, paddingHorizontal: 28,
  },
  scanAgainText: { color: '#fff', fontWeight: '700', fontSize: 15 },
  permText: { color: colors.text, fontSize: 16, textAlign: 'center', marginBottom: 20 },
  permBtn: {
    backgroundColor: colors.accent, borderRadius: 10,
    paddingVertical: 12, paddingHorizontal: 28,
  },
  permBtnText: { color: '#fff', fontWeight: '700', fontSize: 15 },
});
