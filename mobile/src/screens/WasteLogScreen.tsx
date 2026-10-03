import React, { useState } from 'react';
import {
  View,
  Text,
  FlatList,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  TextInput,
  Alert,
  ScrollView,
  RefreshControl,
  Modal,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { apiFetch } from '../lib/api';
import { useSelectedLocation } from '../contexts/LocationContext';
import { colors } from '../lib/colors';

// ─── Types ───────────────────────────────────────────────────────────────────

interface WasteEntry {
  id: string;
  inventoryItemId: string;
  itemName?: string;
  quantity: number;
  unit: string;
  reason: string;
  createdAt: string;
}

interface InventoryItem {
  id: string;
  name: string;
  unit: string;
}

const REASONS = ['spoilage', 'spill', 'prep', 'other'] as const;
type Reason = typeof REASONS[number];

function formatDate(iso: string) {
  try {
    return new Date(iso).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
  } catch { return iso; }
}

// ─── Main Screen ──────────────────────────────────────────────────────────────

export function WasteLogScreen() {
  const insets = useSafeAreaInsets();
  const { locationId } = useSelectedLocation();
  const queryClientInst = useQueryClient();
  const [activeTab, setActiveTab] = useState<'list' | 'log'>('list');
  const [refreshing, setRefreshing] = useState(false);

  // Form state
  const [selectedItem, setSelectedItem] = useState<InventoryItem | null>(null);
  const [itemSearch, setItemSearch] = useState('');
  const [pickerVisible, setPickerVisible] = useState(false);
  const [quantity, setQuantity] = useState('');
  const [unit, setUnit] = useState('');
  const [reason, setReason] = useState<Reason>('spoilage');
  const [submitting, setSubmitting] = useState(false);

  const { data: entries = [], isLoading: entriesLoading, refetch: refetchEntries } = useQuery<WasteEntry[]>({
    queryKey: ['waste-entries', locationId],
    queryFn: () => apiFetch<WasteEntry[]>(`/api/waste-entries?locationId=${locationId}`),
    enabled: !!locationId,
  });

  const { data: inventory = [] } = useQuery<InventoryItem[]>({
    queryKey: ['inventory', locationId],
    queryFn: () => apiFetch<InventoryItem[]>(`/api/inventory?locationId=${locationId}`),
    enabled: !!locationId,
  });

  const mutation = useMutation({
    mutationFn: (body: object) =>
      apiFetch<WasteEntry>('/api/waste-entries', {
        method: 'POST',
        body: JSON.stringify(body),
      }),
    onSuccess: () => {
      queryClientInst.invalidateQueries({ queryKey: ['waste-entries', locationId] });
      // Reset form
      setSelectedItem(null);
      setItemSearch('');
      setQuantity('');
      setUnit('');
      setReason('spoilage');
      setActiveTab('list');
      Alert.alert('Logged', 'Waste entry recorded successfully.');
    },
    onError: (err: Error) => {
      Alert.alert('Error', err.message);
    },
  });

  async function handleRefresh() {
    setRefreshing(true);
    try { await refetchEntries(); } finally { setRefreshing(false); }
  }

  async function handleSubmit() {
    if (!selectedItem) { Alert.alert('Error', 'Please select an inventory item.'); return; }
    const qty = parseFloat(quantity);
    if (!quantity || isNaN(qty) || qty <= 0) { Alert.alert('Error', 'Enter a valid quantity.'); return; }

    setSubmitting(true);
    try {
      await mutation.mutateAsync({
        inventoryItemId: selectedItem.id,
        quantity: qty,
        unit: unit || selectedItem.unit,
        reason,
        locationId,
      });
    } finally {
      setSubmitting(false);
    }
  }

  const filteredInventory = inventory.filter((i) =>
    i.name.toLowerCase().includes(itemSearch.toLowerCase()),
  );

  // Today's entries
  const today = new Date().toDateString();
  const todayEntries = entries.filter(
    (e) => new Date(e.createdAt).toDateString() === today,
  );

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      {/* Header */}
      <View style={styles.header}>
        <Text style={styles.headerTitle}>Waste Log</Text>
      </View>

      {/* Tabs */}
      <View style={styles.tabs}>
        <TouchableOpacity
          style={[styles.tab, activeTab === 'list' && styles.activeTab]}
          onPress={() => setActiveTab('list')}
        >
          <Text style={[styles.tabText, activeTab === 'list' && styles.activeTabText]}>
            Today ({todayEntries.length})
          </Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.tab, activeTab === 'log' && styles.activeTab]}
          onPress={() => setActiveTab('log')}
        >
          <Text style={[styles.tabText, activeTab === 'log' && styles.activeTabText]}>
            Log Waste
          </Text>
        </TouchableOpacity>
      </View>

      {activeTab === 'list' ? (
        // ── List Tab ──
        entriesLoading ? (
          <View style={styles.centered}>
            <ActivityIndicator color={colors.accent} />
          </View>
        ) : (
          <FlatList
            data={entries}
            keyExtractor={(e) => e.id}
            refreshControl={<RefreshControl refreshing={refreshing} onRefresh={handleRefresh} tintColor={colors.accent} />}
            contentContainerStyle={[styles.list, { paddingBottom: insets.bottom + 16 }]}
            ListEmptyComponent={
              <View style={styles.centered}>
                <Text style={styles.mutedText}>No waste entries yet</Text>
              </View>
            }
            renderItem={({ item }) => (
              <View style={styles.entryCard}>
                <View style={styles.entryLeft}>
                  <Text style={styles.entryName}>{item.itemName ?? item.inventoryItemId}</Text>
                  <Text style={styles.entryDetail}>
                    {item.quantity} {item.unit} · {item.reason}
                  </Text>
                  <Text style={styles.entryDate}>{formatDate(item.createdAt)}</Text>
                </View>
                <View style={[styles.reasonBadge, reasonColor(item.reason)]}>
                  <Text style={styles.reasonText}>{item.reason}</Text>
                </View>
              </View>
            )}
          />
        )
      ) : (
        // ── Log Tab ──
        <KeyboardAvoidingView
          style={{ flex: 1 }}
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        >
          <ScrollView
            contentContainerStyle={[styles.formContent, { paddingBottom: insets.bottom + 16 }]}
            keyboardShouldPersistTaps="handled"
          >
            {/* Item Picker */}
            <View style={styles.formCard}>
              <Text style={styles.fieldLabel}>Inventory Item *</Text>
              <TouchableOpacity
                style={styles.pickerTrigger}
                onPress={() => setPickerVisible(true)}
              >
                <Text style={selectedItem ? styles.pickerValue : styles.pickerPlaceholder}>
                  {selectedItem ? selectedItem.name : 'Select an item…'}
                </Text>
                <Text style={styles.pickerArrow}>▼</Text>
              </TouchableOpacity>
            </View>

            {/* Quantity */}
            <View style={styles.formCard}>
              <Text style={styles.fieldLabel}>Quantity *</Text>
              <TextInput
                style={styles.fieldInput}
                placeholder="e.g. 2.5"
                placeholderTextColor={colors.muted}
                value={quantity}
                onChangeText={setQuantity}
                keyboardType="decimal-pad"
              />
            </View>

            {/* Unit */}
            <View style={styles.formCard}>
              <Text style={styles.fieldLabel}>Unit {selectedItem ? `(default: ${selectedItem.unit})` : ''}</Text>
              <TextInput
                style={styles.fieldInput}
                placeholder={selectedItem?.unit ?? 'e.g. kg, lbs, each'}
                placeholderTextColor={colors.muted}
                value={unit}
                onChangeText={setUnit}
              />
            </View>

            {/* Reason */}
            <View style={styles.formCard}>
              <Text style={styles.fieldLabel}>Reason *</Text>
              <View style={styles.reasonRow}>
                {REASONS.map((r) => (
                  <TouchableOpacity
                    key={r}
                    style={[styles.reasonChip, reason === r && styles.reasonChipActive]}
                    onPress={() => setReason(r)}
                  >
                    <Text style={[styles.reasonChipText, reason === r && styles.reasonChipTextActive]}>
                      {r}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>
            </View>

            <TouchableOpacity
              style={[styles.submitBtn, submitting && { opacity: 0.6 }]}
              onPress={handleSubmit}
              disabled={submitting}
            >
              {submitting ? (
                <ActivityIndicator color="#fff" />
              ) : (
                <Text style={styles.submitBtnText}>Log Waste Entry</Text>
              )}
            </TouchableOpacity>
          </ScrollView>
        </KeyboardAvoidingView>
      )}

      {/* Item Picker Modal */}
      <Modal visible={pickerVisible} animationType="slide" transparent>
        <View style={styles.modalOverlay}>
          <View style={[styles.modalSheet, { paddingBottom: insets.bottom + 16 }]}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Select Item</Text>
              <TouchableOpacity onPress={() => setPickerVisible(false)}>
                <Text style={styles.modalClose}>✕</Text>
              </TouchableOpacity>
            </View>
            <TextInput
              style={styles.modalSearch}
              placeholder="Search inventory…"
              placeholderTextColor={colors.muted}
              value={itemSearch}
              onChangeText={setItemSearch}
              autoFocus
            />
            <FlatList
              data={filteredInventory}
              keyExtractor={(i) => i.id}
              style={{ maxHeight: 400 }}
              keyboardShouldPersistTaps="handled"
              ListEmptyComponent={
                <Text style={[styles.mutedText, { textAlign: 'center', marginTop: 16 }]}>No items found</Text>
              }
              renderItem={({ item }) => (
                <TouchableOpacity
                  style={styles.modalItem}
                  onPress={() => {
                    setSelectedItem(item);
                    setUnit(item.unit);
                    setItemSearch('');
                    setPickerVisible(false);
                  }}
                >
                  <Text style={styles.modalItemName}>{item.name}</Text>
                  <Text style={styles.modalItemUnit}>{item.unit}</Text>
                </TouchableOpacity>
              )}
            />
          </View>
        </View>
      </Modal>
    </View>
  );
}

function reasonColor(reason: string) {
  switch (reason) {
    case 'spoilage': return { backgroundColor: colors.danger + '20' };
    case 'spill': return { backgroundColor: colors.warning + '20' };
    case 'prep': return { backgroundColor: colors.accent + '20' };
    default: return { backgroundColor: colors.muted + '20' };
  }
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
  tabs: {
    flexDirection: 'row',
    backgroundColor: colors.surface,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  tab: {
    flex: 1,
    paddingVertical: 12,
    alignItems: 'center',
  },
  activeTab: {
    borderBottomWidth: 2,
    borderBottomColor: colors.accent,
  },
  tabText: { fontSize: 14, fontWeight: '600', color: colors.muted },
  activeTabText: { color: colors.accent },
  list: { padding: 16 },
  centered: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 24 },
  mutedText: { color: colors.muted, fontSize: 14 },
  entryCard: {
    backgroundColor: colors.surface,
    borderRadius: 12,
    padding: 14,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: colors.border,
    flexDirection: 'row',
    alignItems: 'center',
  },
  entryLeft: { flex: 1 },
  entryName: { fontSize: 15, fontWeight: '600', color: colors.text },
  entryDetail: { fontSize: 13, color: colors.muted, marginTop: 2 },
  entryDate: { fontSize: 12, color: colors.muted + '99', marginTop: 2 },
  reasonBadge: { borderRadius: 8, paddingHorizontal: 10, paddingVertical: 4 },
  reasonText: { fontSize: 12, fontWeight: '600', color: colors.text },
  formContent: { padding: 16 },
  formCard: {
    backgroundColor: colors.surface,
    borderRadius: 12,
    padding: 16,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: colors.border,
  },
  fieldLabel: {
    fontSize: 12,
    fontWeight: '600',
    color: colors.muted,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: 8,
  },
  fieldInput: {
    backgroundColor: colors.bg,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    color: colors.text,
    fontSize: 16,
  },
  pickerTrigger: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: colors.bg,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 12,
  },
  pickerValue: { fontSize: 16, color: colors.text },
  pickerPlaceholder: { fontSize: 16, color: colors.muted },
  pickerArrow: { color: colors.muted, fontSize: 12 },
  reasonRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  reasonChip: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.bg,
  },
  reasonChipActive: { backgroundColor: colors.accent, borderColor: colors.accent },
  reasonChipText: { fontSize: 13, color: colors.muted, fontWeight: '500' },
  reasonChipTextActive: { color: '#fff', fontWeight: '700' },
  submitBtn: {
    backgroundColor: colors.accent,
    borderRadius: 12,
    padding: 16,
    alignItems: 'center',
    marginTop: 8,
  },
  submitBtnText: { color: '#fff', fontSize: 16, fontWeight: '700' },
  // Modal
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.6)',
    justifyContent: 'flex-end',
  },
  modalSheet: {
    backgroundColor: colors.surface,
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    paddingTop: 16,
    paddingHorizontal: 16,
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  modalTitle: { fontSize: 18, fontWeight: '700', color: colors.text },
  modalClose: { fontSize: 18, color: colors.muted, padding: 4 },
  modalSearch: {
    backgroundColor: colors.bg,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    color: colors.text,
    fontSize: 15,
    marginBottom: 12,
  },
  modalItem: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  modalItemName: { fontSize: 15, color: colors.text, fontWeight: '500' },
  modalItemUnit: { fontSize: 13, color: colors.muted },
});
