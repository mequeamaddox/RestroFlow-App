import { ingredientCost, type UnitItem } from '../../../shared/inventoryUnits';
import React, { useState } from 'react';
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
  ScrollView,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { apiFetch } from '../lib/api';
import { useSelectedLocation } from '../contexts/LocationContext';
import { colors } from '../lib/colors';
import { QueryNotice } from '../components/QueryNotice';

interface InventoryItem extends UnitItem {
  id: string;
  name: string;
  displayName?: string;
  unit: string;
  recipeUnit: string;
  costPerUnit?: string;
}

interface WasteEntry {
  id: string;
  inventoryItemId: string;
  inventoryItem?: { name: string };
  quantity: string;
  unit: string;
  reason: string;
  cost?: string;
  createdAt: string;
  notes?: string;
}

// Values must match the server's waste_reason enum.
const REASONS = [
  { label: 'Spoiled', value: 'spoiled' },
  { label: 'Damaged / Spill', value: 'damaged' },
  { label: 'Prep Error', value: 'preparation_error' },
  { label: 'Overproduction', value: 'overproduction' },
  { label: 'Expired', value: 'expired' },
  { label: 'Other', value: 'other' },
] as const;

export function WasteLogScreen() {
  const insets = useSafeAreaInsets();
  const { locationId } = useSelectedLocation();
  const qc = useQueryClient();
  const [tab, setTab] = useState<'log' | 'history'>('log');
  const [refreshing, setRefreshing] = useState(false);
  const [showItemPicker, setShowItemPicker] = useState(false);
  const [itemSearch, setItemSearch] = useState('');

  // Form state
  const [selectedItem, setSelectedItem] = useState<InventoryItem | null>(null);
  const [quantity, setQuantity] = useState('');
  const [reason, setReason] = useState<string>(REASONS[0].value);
  const [notes, setNotes] = useState('');

  const { data: items = [], isLoading: itemsLoading, error: itemsError, refetch: refetchItems } = useQuery<InventoryItem[]>({
    queryKey: ['inventory', locationId],
    queryFn: () => apiFetch<InventoryItem[]>(`/api/inventory?locationId=${locationId}`),
    enabled: !!locationId,
  });

  const { data: entries = [], isLoading, error: entriesError, refetch } = useQuery<WasteEntry[]>({
    queryKey: ['waste', locationId],
    queryFn: () => apiFetch<WasteEntry[]>(`/api/waste?locationId=${locationId}`),
    enabled: !!locationId,
  });

  const todayEntries = entries.filter(e => {
    const d = new Date(e.createdAt);
    const now = new Date();
    return d.toDateString() === now.toDateString();
  });

  const logMutation = useMutation({
    mutationFn: () =>
      apiFetch('/api/waste', {
        method: 'POST',
        body: JSON.stringify({
          inventoryItemId: selectedItem!.id,
          quantity: String(parseFloat(quantity)),
          unit: selectedItem!.recipeUnit || selectedItem!.unit,
          reason,
          cost: ingredientCost(selectedItem!,parseFloat(quantity),selectedItem!.recipeUnit || selectedItem!.unit).toFixed(2),
          locationId,
          notes: notes.trim() || undefined,
        }),
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['waste', locationId] });
      qc.invalidateQueries({ queryKey: ['inventory', locationId] });
      setSelectedItem(null);
      setQuantity('');
      setReason(REASONS[0].value);
      setNotes('');
      Alert.alert('Logged', 'Waste entry recorded.');
      setTab('history');
    },
    onError: (err: Error) => Alert.alert('Error', err.message),
  });

  async function handleRefresh() {
    setRefreshing(true);
    try { await refetch(); } finally { setRefreshing(false); }
  }

  function handleSubmit() {
    if (!selectedItem) { Alert.alert('Missing', 'Select an inventory item.'); return; }
    if (!quantity || isNaN(parseFloat(quantity)) || parseFloat(quantity) <= 0) {
      Alert.alert('Missing', 'Enter a valid quantity.');
      return;
    }
    logMutation.mutate();
  }

  const filteredItems = items.filter(i =>
    (i.displayName ?? i.name).toLowerCase().includes(itemSearch.toLowerCase())
  );

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      <View style={styles.header}>
        <Text style={styles.headerTitle}>Waste Log</Text>
      </View>

      {/* Tabs */}
      <View style={styles.tabs}>
        <TouchableOpacity
          style={[styles.tab, tab === 'log' && styles.tabActive]}
          onPress={() => setTab('log')}
        >
          <Text style={[styles.tabText, tab === 'log' && styles.tabTextActive]}>Log Waste</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.tab, tab === 'history' && styles.tabActive]}
          onPress={() => setTab('history')}
        >
          <Text style={[styles.tabText, tab === 'history' && styles.tabTextActive]}>
            Today ({todayEntries.length})
          </Text>
        </TouchableOpacity>
      </View>

      {tab === 'log' ? (
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
          style={{ flex: 1 }}
        >
          <ScrollView
            contentContainerStyle={[styles.form, { paddingBottom: insets.bottom + 20 }]}
            keyboardShouldPersistTaps="handled"
          >
            {/* Item picker */}
            {itemsError && (
              <QueryNotice
                message={`Could not load inventory: ${itemsError.message}`}
                onRetry={() => { void refetchItems(); }}
              />
            )}
            <Text style={styles.fieldLabel}>Inventory Item</Text>
            <TouchableOpacity
              style={styles.picker}
              onPress={() => setShowItemPicker(true)}
            >
              <Text style={[styles.pickerText, !selectedItem && { color: colors.muted }]}>
                {selectedItem ? (selectedItem.displayName ?? selectedItem.name) : 'Select an item…'}
              </Text>
              <Text style={styles.pickerChevron}>▼</Text>
            </TouchableOpacity>

            {/* Quantity */}
            <Text style={styles.fieldLabel}>Quantity</Text>
            <View style={styles.quantityRow}>
              <TextInput
                style={[styles.input, { flex: 1 }]}
                placeholder="0.00"
                placeholderTextColor={colors.muted}
                value={quantity}
                onChangeText={setQuantity}
                keyboardType="decimal-pad"
              />
              {selectedItem && (
                <View style={styles.unitBadge}>
                  <Text style={styles.unitBadgeText}>{selectedItem.unit}</Text>
                </View>
              )}
            </View>

            {/* Reason */}
            <Text style={styles.fieldLabel}>Reason</Text>
            <View style={styles.reasonGrid}>
              {REASONS.map(r => (
                <TouchableOpacity
                  key={r.value}
                  style={[styles.reasonChip, reason === r.value && styles.reasonChipActive]}
                  onPress={() => setReason(r.value)}
                >
                  <Text style={[styles.reasonText, reason === r.value && styles.reasonTextActive]}>{r.label}</Text>
                </TouchableOpacity>
              ))}
            </View>

            {/* Notes */}
            <Text style={styles.fieldLabel}>Notes (optional)</Text>
            <TextInput
              style={[styles.input, { minHeight: 72, textAlignVertical: 'top' }]}
              placeholder="Additional details…"
              placeholderTextColor={colors.muted}
              value={notes}
              onChangeText={setNotes}
              multiline
            />

            <TouchableOpacity
              style={[styles.submitBtn, logMutation.isPending && { opacity: 0.6 }]}
              onPress={handleSubmit}
              disabled={logMutation.isPending}
              activeOpacity={0.8}
            >
              {logMutation.isPending ? (
                <ActivityIndicator color="#fff" />
              ) : (
                <Text style={styles.submitBtnText}>Log Waste Entry</Text>
              )}
            </TouchableOpacity>
          </ScrollView>
        </KeyboardAvoidingView>
      ) : (
        <FlatList
          data={entries.slice().reverse()}
          keyExtractor={e => e.id}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={handleRefresh} tintColor={colors.accent} />}
          ListHeaderComponent={entriesError ? (
            <QueryNotice
              message={`Could not load waste history: ${entriesError.message}`}
              onRetry={() => { void refetch(); }}
            />
          ) : null}
          ListEmptyComponent={
            <View style={styles.center}>
              {isLoading ? (
                <ActivityIndicator color={colors.accent} />
              ) : entriesError ? null : (
                <Text style={styles.emptyText}>No waste entries yet</Text>
              )}
            </View>
          }
          renderItem={({ item: entry }) => {
            const name = entry.inventoryItem?.name ?? 'Unknown Item';
            const date = new Date(entry.createdAt);
            const isToday = date.toDateString() === new Date().toDateString();
            return (
              <View style={styles.entryRow}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.entryName}>{name}</Text>
                  <Text style={styles.entrySub}>
                    {entry.reason.replace(/_/g, ' ')} · {isToday ? date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : date.toLocaleDateString()}
                  </Text>
                </View>
                <Text style={styles.entryQty}>
                  -{parseFloat(entry.quantity).toFixed(2)} {entry.unit}
                </Text>
              </View>
            );
          }}
        />
      )}

      {/* Item Picker Modal */}
      <Modal visible={showItemPicker} animationType="slide" presentationStyle="pageSheet">
        <View style={[styles.modalContainer, { paddingTop: insets.top + 8 }]}>
          <View style={styles.modalHeader}>
            <Text style={styles.modalTitle}>Select Item</Text>
            <TouchableOpacity onPress={() => setShowItemPicker(false)}>
              <Text style={styles.modalClose}>Done</Text>
            </TouchableOpacity>
          </View>
          <View style={styles.modalSearch}>
            <TextInput
              style={styles.input}
              placeholder="Search items…"
              placeholderTextColor={colors.muted}
              value={itemSearch}
              onChangeText={setItemSearch}
              autoFocus
            />
          </View>
          <FlatList
            data={filteredItems}
            keyExtractor={i => i.id}
            ListHeaderComponent={itemsError ? (
              <QueryNotice
                message={`Could not load inventory: ${itemsError.message}`}
                onRetry={() => { void refetchItems(); }}
              />
            ) : null}
            ListEmptyComponent={
              <View style={styles.center}>
                {itemsLoading ? <ActivityIndicator color={colors.accent} /> : itemsError ? null : (
                  <Text style={styles.emptyText}>{itemSearch ? 'No matching items' : 'No inventory items yet'}</Text>
                )}
              </View>
            }
            renderItem={({ item }) => (
              <TouchableOpacity
                style={styles.modalItem}
                onPress={() => {
                  setSelectedItem(item);
                  setItemSearch('');
                  setShowItemPicker(false);
                }}
              >
                <Text style={styles.modalItemName}>{item.displayName ?? item.name}</Text>
                <Text style={styles.modalItemUnit}>{item.unit}</Text>
              </TouchableOpacity>
            )}
          />
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 20 },
  header: {
    paddingHorizontal: 16, paddingVertical: 12,
    backgroundColor: colors.surface, borderBottomWidth: 1, borderBottomColor: colors.border,
  },
  headerTitle: { fontSize: 18, fontWeight: '700', color: colors.text, textAlign: 'center' },
  tabs: {
    flexDirection: 'row',
    backgroundColor: colors.surface,
    borderBottomWidth: 1, borderBottomColor: colors.border,
  },
  tab: { flex: 1, paddingVertical: 12, alignItems: 'center' },
  tabActive: { borderBottomWidth: 2, borderBottomColor: colors.accent },
  tabText: { fontSize: 14, fontWeight: '600', color: colors.muted },
  tabTextActive: { color: colors.accent },
  form: { padding: 16 },
  fieldLabel: {
    fontSize: 12, fontWeight: '700', color: colors.muted,
    textTransform: 'uppercase', letterSpacing: 0.6, marginBottom: 8, marginTop: 16,
  },
  picker: {
    backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border,
    borderRadius: 10, paddingHorizontal: 14, paddingVertical: 13,
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
  },
  pickerText: { fontSize: 15, color: colors.text, flex: 1 },
  pickerChevron: { color: colors.muted, fontSize: 12 },
  input: {
    backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border,
    borderRadius: 10, paddingHorizontal: 14, paddingVertical: 12,
    color: colors.text, fontSize: 15,
  },
  quantityRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  unitBadge: {
    backgroundColor: colors.bg, borderWidth: 1, borderColor: colors.border,
    borderRadius: 8, paddingHorizontal: 12, paddingVertical: 12,
  },
  unitBadgeText: { color: colors.muted, fontWeight: '600' },
  reasonGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  reasonChip: {
    backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border,
    borderRadius: 20, paddingHorizontal: 14, paddingVertical: 8,
  },
  reasonChipActive: { backgroundColor: colors.accent + '22', borderColor: colors.accent },
  reasonText: { color: colors.muted, fontSize: 13, fontWeight: '500' },
  reasonTextActive: { color: colors.accent, fontWeight: '700' },
  submitBtn: {
    backgroundColor: colors.danger, borderRadius: 10, marginTop: 24,
    paddingVertical: 14, alignItems: 'center',
  },
  submitBtnText: { color: '#fff', fontWeight: '700', fontSize: 15 },
  entryRow: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 16, paddingVertical: 13,
    borderBottomWidth: 1, borderBottomColor: colors.border,
  },
  entryName: { fontSize: 14, fontWeight: '600', color: colors.text },
  entrySub: { fontSize: 12, color: colors.muted, marginTop: 2, textTransform: 'capitalize' },
  entryQty: { fontSize: 14, color: colors.danger, fontWeight: '700' },
  emptyText: { color: colors.muted, fontSize: 15 },
  modalContainer: { flex: 1, backgroundColor: colors.bg },
  modalHeader: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    paddingHorizontal: 16, paddingVertical: 12,
    borderBottomWidth: 1, borderBottomColor: colors.border,
  },
  modalTitle: { fontSize: 17, fontWeight: '700', color: colors.text },
  modalClose: { color: colors.accent, fontSize: 16, fontWeight: '600' },
  modalSearch: { padding: 12 },
  modalItem: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    paddingHorizontal: 16, paddingVertical: 14,
    borderBottomWidth: 1, borderBottomColor: colors.border,
  },
  modalItemName: { fontSize: 15, color: colors.text },
  modalItemUnit: { fontSize: 13, color: colors.muted },
});
