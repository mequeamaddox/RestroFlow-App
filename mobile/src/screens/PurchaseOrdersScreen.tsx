import React, { useState } from 'react';
import {
  View,
  Text,
  FlatList,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  Alert,
  RefreshControl,
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

interface PurchaseOrder {
  id: string;
  orderNumber?: string;
  vendorName?: string;
  vendor?: { name: string };
  status: 'pending' | 'ordered' | 'received' | 'cancelled';
  total?: string;
  expectedDate?: string;
  createdAt: string;
  notes?: string;
}

interface POItem {
  id: string;
  inventoryItemId: string;
  itemName?: string;
  inventoryItem?: { name: string; barcode?: string };
  quantity: string;
  unit: string;
  unitCost?: string;
  receivedQuantity?: string;
}

type POStackParamList = {
  POList: undefined;
  PODetail: { orderId: string };
  POScanner: { orderId: string };
};

const Stack = createNativeStackNavigator<POStackParamList>();

// ─── Navigator ────────────────────────────────────────────────────────────────

export function PurchaseOrdersNavigator() {
  return (
    <Stack.Navigator screenOptions={{ headerShown: false }}>
      <Stack.Screen name="POList" component={POListScreen} />
      <Stack.Screen name="PODetail" component={PODetailScreen} />
      <Stack.Screen name="POScanner" component={POScannerScreen} />
    </Stack.Navigator>
  );
}

// ─── Status helpers ───────────────────────────────────────────────────────────

function statusColor(s: string) {
  switch (s) {
    case 'received': return colors.success;
    case 'pending': return colors.warning;
    case 'ordered': return colors.accent;
    case 'cancelled': return colors.muted;
    default: return colors.muted;
  }
}

// ─── PO List ──────────────────────────────────────────────────────────────────

function POListScreen() {
  const insets = useSafeAreaInsets();
  const navigation = useNavigation<NativeStackNavigationProp<POStackParamList>>();
  const { locationId } = useSelectedLocation();
  const [refreshing, setRefreshing] = useState(false);

  const { data: orders = [], isLoading, error, refetch } = useQuery<PurchaseOrder[]>({
    queryKey: ['purchase-orders', locationId],
    queryFn: () => apiFetch<PurchaseOrder[]>(`/api/purchase-orders?locationId=${locationId}`),
    enabled: !!locationId,
  });

  const sorted = [...orders].sort(
    (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
  );

  async function handleRefresh() {
    setRefreshing(true);
    try { await refetch(); } finally { setRefreshing(false); }
  }

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      <View style={styles.header}>
        <Text style={styles.headerTitle}>Purchase Orders</Text>
      </View>

      {isLoading ? (
        <View style={styles.center}>
          <ActivityIndicator color={colors.accent} size="large" />
          <Text style={styles.muted}>Loading orders…</Text>
        </View>
      ) : error ? (
        <View style={styles.center}>
          <Text style={styles.errorText}>Failed to load purchase orders</Text>
          <TouchableOpacity onPress={() => refetch()} style={styles.retryBtn}>
            <Text style={styles.retryText}>Retry</Text>
          </TouchableOpacity>
        </View>
      ) : (
        <FlatList
          data={sorted}
          keyExtractor={o => o.id}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={handleRefresh} tintColor={colors.accent} />}
          ListEmptyComponent={
            <View style={styles.center}>
              <Text style={styles.emptyText}>No purchase orders found</Text>
            </View>
          }
          renderItem={({ item: order }) => {
            const vendor = order.vendor?.name ?? order.vendorName ?? 'Unknown Vendor';
            const date = new Date(order.createdAt).toLocaleDateString();
            return (
              <TouchableOpacity
                style={styles.orderRow}
                onPress={() => navigation.navigate('PODetail', { orderId: order.id })}
                activeOpacity={0.7}
              >
                <View style={styles.orderLeft}>
                  <Text style={styles.orderVendor}>{vendor}</Text>
                  <Text style={styles.orderSub}>
                    {order.orderNumber ?? order.id.slice(0, 8).toUpperCase()} · {date}
                  </Text>
                </View>
                <View style={styles.orderRight}>
                  {order.total && (
                    <Text style={styles.orderTotal}>
                      ${parseFloat(order.total).toFixed(2)}
                    </Text>
                  )}
                  <View style={[styles.statusBadge, { backgroundColor: statusColor(order.status) + '22' }]}>
                    <Text style={[styles.statusText, { color: statusColor(order.status) }]}>
                      {order.status.charAt(0).toUpperCase() + order.status.slice(1)}
                    </Text>
                  </View>
                </View>
              </TouchableOpacity>
            );
          }}
        />
      )}
    </View>
  );
}

// ─── PO Detail ────────────────────────────────────────────────────────────────

function PODetailScreen() {
  const route = useRoute<any>();
  const insets = useSafeAreaInsets();
  const navigation = useNavigation<NativeStackNavigationProp<POStackParamList>>();
  const { locationId } = useSelectedLocation();
  const qc = useQueryClient();
  const { orderId } = route.params as { orderId: string };

  const { data: orders = [] } = useQuery<PurchaseOrder[]>({
    queryKey: ['purchase-orders', locationId],
    queryFn: () => apiFetch<PurchaseOrder[]>(`/api/purchase-orders?locationId=${locationId}`),
    enabled: !!locationId,
  });
  const order = orders.find(o => o.id === orderId);

  const { data: items = [], isLoading: itemsLoading } = useQuery<POItem[]>({
    queryKey: ['po-items', orderId],
    queryFn: () => apiFetch<POItem[]>(`/api/purchase-orders/${orderId}/items`),
    enabled: !!orderId,
  });

  const receiveMutation = useMutation({
    mutationFn: () =>
      apiFetch(`/api/purchase-orders/${orderId}`, {
        method: 'PATCH',
        body: JSON.stringify({ status: 'received' }),
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['purchase-orders', locationId] });
      Alert.alert('Done', 'Order marked as received.');
      navigation.goBack();
    },
    onError: (err: Error) => Alert.alert('Error', err.message),
  });

  if (!order) {
    return (
      <View style={[styles.container, { paddingTop: insets.top }, styles.center]}>
        <ActivityIndicator color={colors.accent} />
      </View>
    );
  }

  const vendor = order.vendor?.name ?? order.vendorName ?? 'Unknown Vendor';
  const canReceive = order.status === 'pending' || order.status === 'ordered';

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backBtn}>
          <Text style={styles.backBtnText}>← Back</Text>
        </TouchableOpacity>
        <Text style={styles.headerTitle} numberOfLines={1}>{vendor}</Text>
        <View style={{ width: 70 }} />
      </View>

      <View style={{ padding: 16, flex: 1 }}>
        {/* PO summary card */}
        <View style={styles.summaryCard}>
          {[
            ['Status', order.status.charAt(0).toUpperCase() + order.status.slice(1)],
            ['Order #', order.orderNumber ?? order.id.slice(0, 8).toUpperCase()],
            ['Date', new Date(order.createdAt).toLocaleDateString()],
            ...(order.total ? [['Total', `$${parseFloat(order.total).toFixed(2)}`]] : []),
            ...(order.expectedDate ? [['Expected', new Date(order.expectedDate).toLocaleDateString()]] : []),
          ].map(([label, value]) => (
            <View key={label} style={styles.infoRow}>
              <Text style={styles.infoLabel}>{label}</Text>
              <Text style={styles.infoValue}>{value}</Text>
            </View>
          ))}
        </View>

        {/* Line items */}
        <Text style={styles.sectionTitle}>Line Items ({items.length})</Text>

        {itemsLoading ? (
          <ActivityIndicator color={colors.accent} style={{ marginTop: 20 }} />
        ) : items.length === 0 ? (
          <Text style={[styles.muted, { marginTop: 12 }]}>No line items</Text>
        ) : (
          <FlatList
            data={items}
            keyExtractor={i => i.id}
            style={{ flex: 1 }}
            renderItem={({ item }) => {
              const name = item.inventoryItem?.name ?? item.itemName ?? 'Unknown';
              return (
                <View style={styles.lineItem}>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.lineItemName}>{name}</Text>
                    {item.inventoryItem?.barcode && (
                      <Text style={styles.lineItemBarcode}>🔖 {item.inventoryItem.barcode}</Text>
                    )}
                  </View>
                  <Text style={styles.lineItemQty}>
                    {parseFloat(item.quantity).toFixed(2)} {item.unit}
                  </Text>
                </View>
              );
            }}
          />
        )}

        {/* Actions */}
        {canReceive && (
          <View style={{ gap: 10, marginTop: 12 }}>
            <TouchableOpacity
              style={styles.scanReceiveBtn}
              onPress={() => navigation.navigate('POScanner', { orderId })}
              activeOpacity={0.7}
            >
              <Text style={styles.scanReceiveBtnText}>📷 Scan to Receive</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.receiveBtn}
              onPress={() =>
                Alert.alert('Mark as Received?', 'This will mark all items received.', [
                  { text: 'Cancel', style: 'cancel' },
                  { text: 'Mark Received', onPress: () => receiveMutation.mutate() },
                ])
              }
              disabled={receiveMutation.isPending}
              activeOpacity={0.7}
            >
              {receiveMutation.isPending ? (
                <ActivityIndicator color="#fff" />
              ) : (
                <Text style={styles.receiveBtnText}>✓ Mark All Received</Text>
              )}
            </TouchableOpacity>
          </View>
        )}
      </View>
    </View>
  );
}

// ─── PO Scanner (scan items to receive) ──────────────────────────────────────

function POScannerScreen() {
  const route = useRoute<any>();
  const insets = useSafeAreaInsets();
  const navigation = useNavigation<NativeStackNavigationProp<POStackParamList>>();
  const { locationId } = useSelectedLocation();
  const qc = useQueryClient();
  const { orderId } = route.params as { orderId: string };
  const [permission, requestPermission] = useCameraPermissions();
  const [scanned, setScanned] = useState(false);
  const [received, setReceived] = useState<string[]>([]);

  const { data: items = [] } = useQuery<POItem[]>({
    queryKey: ['po-items', orderId],
    queryFn: () => apiFetch<POItem[]>(`/api/purchase-orders/${orderId}/items`),
    enabled: !!orderId,
  });

  const receiveMutation = useMutation({
    mutationFn: () =>
      apiFetch(`/api/purchase-orders/${orderId}`, {
        method: 'PATCH',
        body: JSON.stringify({ status: 'received' }),
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['purchase-orders', locationId] });
      Alert.alert('Order Received', 'All items checked off. Order marked as received.', [
        { text: 'Done', onPress: () => navigation.navigate('POList') },
      ]);
    },
  });

  const allReceived = items.length > 0 && received.length >= items.length;

  if (!permission?.granted) {
    return (
      <View style={[styles.container, { paddingTop: insets.top }, styles.center]}>
        <Text style={styles.permText}>Camera access needed to scan barcodes</Text>
        <TouchableOpacity style={styles.retryBtn} onPress={requestPermission}>
          <Text style={styles.retryText}>Grant Permission</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.retryBtn, { backgroundColor: colors.surface, marginTop: 8 }]}
          onPress={() => navigation.goBack()}
        >
          <Text style={[styles.retryText, { color: colors.muted }]}>Back</Text>
        </TouchableOpacity>
      </View>
    );
  }

  function onBarcodeScanned({ data }: { data: string }) {
    if (scanned) return;
    setScanned(true);

    const match = items.find(i => i.inventoryItem?.barcode === data);
    if (match) {
      if (received.includes(match.id)) {
        Alert.alert('Already Scanned', `${match.inventoryItem?.name ?? 'Item'} was already checked off.`, [
          { text: 'OK', onPress: () => setScanned(false) },
        ]);
        return;
      }
      const newReceived = [...received, match.id];
      setReceived(newReceived);
      const remaining = items.length - newReceived.length;
      if (remaining === 0) {
        Alert.alert('All Items Received!', 'All line items scanned. Mark order complete?', [
          { text: 'Not Yet', onPress: () => setScanned(false) },
          { text: 'Mark Complete', onPress: () => receiveMutation.mutate() },
        ]);
      } else {
        Alert.alert('✓ Scanned', `${match.inventoryItem?.name ?? 'Item'} received.\n${remaining} item(s) remaining.`, [
          { text: 'Continue', onPress: () => setScanned(false) },
        ]);
      }
    } else {
      Alert.alert('Not on this Order', `Barcode ${data} is not in this purchase order.`, [
        { text: 'OK', onPress: () => setScanned(false) },
      ]);
    }
  }

  return (
    <View style={styles.container}>
      <CameraView
        style={StyleSheet.absoluteFill}
        facing="back"
        barcodeScannerSettings={{ barcodeTypes: ['qr', 'ean13', 'ean8', 'upc_a', 'upc_e', 'code128', 'code39'] }}
        onBarcodeScanned={scanned ? undefined : onBarcodeScanned}
      />
      <View style={[styles.scanOverlay, { paddingTop: insets.top }]}>
        <View style={styles.scanTopBar}>
          <TouchableOpacity onPress={() => navigation.goBack()} style={styles.scanClose}>
            <Text style={styles.scanCloseText}>✕ Cancel</Text>
          </TouchableOpacity>
          <View style={styles.progressPill}>
            <Text style={styles.progressText}>{received.length}/{items.length} received</Text>
          </View>
        </View>
        <View style={styles.scanFrame} />
        <Text style={styles.scanHint}>Scan each item's barcode to receive it</Text>
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
  backBtn: { width: 70 },
  backBtnText: { color: colors.accent, fontSize: 15, fontWeight: '600' },
  muted: { color: colors.muted, marginTop: 8 },
  errorText: { color: colors.danger, fontSize: 15, textAlign: 'center' },
  emptyText: { color: colors.muted, fontSize: 15 },
  retryBtn: {
    marginTop: 12, paddingHorizontal: 20, paddingVertical: 8,
    backgroundColor: colors.accent, borderRadius: 8,
  },
  retryText: { color: '#fff', fontWeight: '600' },
  orderRow: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 16, paddingVertical: 14,
    borderBottomWidth: 1, borderBottomColor: colors.border,
  },
  orderLeft: { flex: 1 },
  orderVendor: { fontSize: 15, fontWeight: '600', color: colors.text },
  orderSub: { fontSize: 12, color: colors.muted, marginTop: 2 },
  orderRight: { alignItems: 'flex-end', gap: 4 },
  orderTotal: { fontSize: 15, fontWeight: '700', color: colors.text },
  statusBadge: { borderRadius: 6, paddingHorizontal: 8, paddingVertical: 3 },
  statusText: { fontSize: 12, fontWeight: '700' },
  summaryCard: {
    backgroundColor: colors.surface, borderRadius: 14,
    borderWidth: 1, borderColor: colors.border,
    overflow: 'hidden', marginBottom: 16,
  },
  infoRow: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    paddingHorizontal: 16, paddingVertical: 12,
    borderBottomWidth: 1, borderBottomColor: colors.border,
  },
  infoLabel: { fontSize: 14, color: colors.muted },
  infoValue: { fontSize: 14, color: colors.text, fontWeight: '600' },
  sectionTitle: {
    fontSize: 12, fontWeight: '700', color: colors.muted,
    textTransform: 'uppercase', letterSpacing: 0.8, marginBottom: 8,
  },
  lineItem: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: colors.border,
  },
  lineItemName: { fontSize: 14, color: colors.text, fontWeight: '500' },
  lineItemBarcode: { fontSize: 11, color: colors.muted, marginTop: 2 },
  lineItemQty: { fontSize: 14, color: colors.accent, fontWeight: '600' },
  scanReceiveBtn: {
    backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.accent,
    borderRadius: 10, paddingVertical: 13, alignItems: 'center',
  },
  scanReceiveBtnText: { color: colors.accent, fontWeight: '700', fontSize: 15 },
  receiveBtn: {
    backgroundColor: colors.success, borderRadius: 10,
    paddingVertical: 13, alignItems: 'center',
  },
  receiveBtnText: { color: '#fff', fontWeight: '700', fontSize: 15 },
  scanOverlay: { ...StyleSheet.absoluteFillObject, alignItems: 'center' },
  scanTopBar: {
    flexDirection: 'row', justifyContent: 'space-between',
    alignItems: 'center', width: '100%', paddingHorizontal: 20, marginTop: 16,
  },
  scanClose: {
    backgroundColor: 'rgba(0,0,0,0.6)', borderRadius: 20,
    paddingHorizontal: 16, paddingVertical: 8,
  },
  scanCloseText: { color: '#fff', fontWeight: '700' },
  progressPill: {
    backgroundColor: colors.accent, borderRadius: 20,
    paddingHorizontal: 14, paddingVertical: 7,
  },
  progressText: { color: '#fff', fontWeight: '700', fontSize: 13 },
  scanFrame: {
    width: 250, height: 250,
    borderWidth: 3, borderColor: colors.accent, borderRadius: 16,
    marginTop: 60, backgroundColor: 'transparent',
  },
  scanHint: {
    color: '#fff', fontSize: 14, marginTop: 20,
    textShadowColor: 'rgba(0,0,0,0.8)', textShadowOffset: { width: 0, height: 1 }, textShadowRadius: 4,
  },
  permText: { color: colors.text, fontSize: 16, textAlign: 'center', marginBottom: 20 },
});
