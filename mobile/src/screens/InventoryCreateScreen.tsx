import { PackagingFields } from '../components/PackagingFields';
import React, { useState } from 'react';
import { View, Text, TextInput, TouchableOpacity, ScrollView, Modal, FlatList, KeyboardAvoidingView, Platform, ActivityIndicator, StyleSheet } from 'react-native';
import { useNavigation, useRoute } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useSelectedLocation } from '../contexts/LocationContext';
import { apiFetch } from '../lib/api';
import { colors } from '../lib/colors';
import { barcodeKey, inventoryDraftPayload, type InventoryDraft } from '../lib/inventoryDraft';
import { QueryNotice } from '../components/QueryNotice';
import type { InventoryStackParamList, InventoryItem } from './InventoryScreen';

type Choice = { id: string; name: string };

export function InventoryCreateScreen() {
  const insets = useSafeAreaInsets();
  const navigation = useNavigation<NativeStackNavigationProp<InventoryStackParamList>>();
  const route = useRoute<any>();
  const { locationId, locationName } = useSelectedLocation();
  const qc = useQueryClient();
  const [draft, setDraft] = useState<InventoryDraft>({ name: '', unit: 'each', quantity: '0', costPerUnit: '0', reorderLevel: '0', barcode: route.params?.barcode ?? '' });
  const [picker, setPicker] = useState<'categoryId' | 'vendorId' | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const categories = useQuery<Choice[]>({ queryKey: ['categories', locationId], queryFn: () => apiFetch(`/api/categories?locationId=${locationId}`), enabled: !!locationId });
  const vendors = useQuery<Choice[]>({ queryKey: ['vendors', locationId], queryFn: () => apiFetch(`/api/vendors?locationId=${locationId}`), enabled: !!locationId });
  const mutation = useMutation({
    mutationFn: async () => {
      const payload = inventoryDraftPayload(draft, locationId);
      // Check fresh data before creating a duplicate from a cached scanner list.
      const items = await apiFetch<InventoryItem[]>(`/api/inventory?locationId=${locationId}`);
      if (draft.barcode.trim()) {
        const existing = items.find(item => item.barcode && barcodeKey(item.barcode) === barcodeKey(draft.barcode));
        if (existing) throw new Error(`This barcode already belongs to ${existing.displayName ?? existing.name}. Open that item instead.`);
      }
      return apiFetch<InventoryItem>('/api/inventory', { method: 'POST', body: JSON.stringify(payload) });
    },
    onSuccess: item => {
      qc.setQueryData<InventoryItem[]>(['inventory', locationId], old => [...(old ?? []).filter(i => i.id !== item.id), item]);
      void qc.invalidateQueries({ queryKey: ['inventory', locationId] });
      navigation.replace('InventoryDetail', { itemId: item.id });
    },
  });
  const set = (field: keyof InventoryDraft, value: string) => { setFormError(null); mutation.reset(); setDraft(old => ({ ...old, [field]: value })); };
  const choices = picker === 'categoryId' ? categories : vendors;
  const submit = () => {
    if (mutation.isPending) return;
    try { inventoryDraftPayload(draft, locationId); setFormError(null); mutation.mutate(); }
    catch (err) { setFormError(err instanceof Error ? err.message : 'Check the item details.'); }
  };
  return (
    <KeyboardAvoidingView style={[styles.container, { paddingTop: insets.top }]} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <View style={styles.header}>
        <TouchableOpacity disabled={mutation.isPending} onPress={() => navigation.goBack()} accessibilityRole="button"><Text style={styles.back}>← Back</Text></TouchableOpacity>
        <Text style={styles.title}>Add Inventory Item</Text>
      </View>
      <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={{ padding: 16, paddingBottom: insets.bottom + 24 }}>
        <Text style={styles.hint}>Adding to {locationName ?? 'the selected restaurant'}</Text>
        <Text style={styles.hint}>Enter the product details. A barcode identifies the item; it does not supply its name or price.</Text>
        {([
          ['name', 'Item name', 'e.g., Whole milk'],
          ['unit', 'Purchase unit', 'each, lb, bottle, case…'],
          ['quantity', 'Starting quantity', '0'],
          ['costPerUnit', 'Cost per purchase unit ($)', '0.00'],
          ['reorderLevel', 'Reorder level', '0'],
          ['barcode', 'Barcode (optional)', 'Scanned or typed barcode'],
        ] as const).map(([field, label, placeholder]) => (
          <View key={field} style={styles.field}>
            <Text style={styles.label}>{label}</Text>
            <TextInput style={styles.input} accessibilityLabel={label} value={draft[field]} onChangeText={value => set(field, value)} editable={!mutation.isPending}
              keyboardType={['quantity', 'costPerUnit', 'reorderLevel'].includes(field) ? 'decimal-pad' : 'default'}
              autoCapitalize={field === 'name' ? 'words' : 'none'} placeholder={placeholder} placeholderTextColor={colors.muted} />
          </View>
        ))}
        <View style={styles.field}><Text style={styles.label}>Ingredient tracking unit</Text><TextInput style={styles.input} value={draft.recipeUnit || ''} editable={!mutation.isPending} placeholder="each, lb, oz (weight), fl oz (volume)…" placeholderTextColor={colors.muted} autoCapitalize="none" onChangeText={value=>set('recipeUnit',value)}/></View>
        <PackagingFields value={draft} recipeUnit={draft.recipeUnit || draft.unit} disabled={mutation.isPending} onChange={pack=>{setDraft(old=>({...old,...pack}));mutation.reset();setFormError(null);}}/>
        {(['categoryId', 'vendorId'] as const).map(field => {
          const query = field === 'categoryId' ? categories : vendors;
          return <View key={field} style={styles.field}>
            <Text style={styles.label}>{field === 'categoryId' ? 'Category (optional)' : 'Vendor (optional)'}</Text>
            <TouchableOpacity style={styles.input} disabled={mutation.isPending} onPress={() => setPicker(field)} accessibilityRole="button">
              <Text style={styles.value}>{query.data?.find(choice => choice.id === draft[field])?.name ?? 'None'} ▾</Text>
            </TouchableOpacity>
          </View>;
        })}
        {(formError || mutation.error) && <Text accessibilityRole="alert" style={styles.error}>{formError || mutation.error?.message}</Text>}
        <TouchableOpacity style={[styles.save, mutation.isPending && { opacity: 0.6 }]} onPress={submit} disabled={mutation.isPending} accessibilityRole="button">
          {mutation.isPending ? <ActivityIndicator color="#fff" /> : <Text style={styles.saveText}>Save Item</Text>}
        </TouchableOpacity>
      </ScrollView>
      <Modal visible={picker !== null} transparent animationType="slide" onRequestClose={() => setPicker(null)}>
        <View style={styles.overlay}><View style={[styles.sheet, { paddingBottom: insets.bottom + 16 }]}>
          <TouchableOpacity onPress={() => setPicker(null)} style={styles.choice} accessibilityRole="button"><Text style={styles.back}>Close</Text></TouchableOpacity>
          {choices.isLoading && <ActivityIndicator color={colors.accent} />}
          {choices.error && <QueryNotice message={`Could not load choices: ${choices.error.message}`} onRetry={() => { void choices.refetch(); }} />}
          <FlatList data={[{ id: '', name: 'None' }, ...(choices.data ?? [])]} keyExtractor={item => item.id} renderItem={({ item }) => (
            <TouchableOpacity style={styles.choice} onPress={() => { if (picker) set(picker, item.id); setPicker(null); }} accessibilityRole="button"><Text style={styles.value}>{item.name}</Text></TouchableOpacity>
          )} />
        </View></View>
      </Modal>
    </KeyboardAvoidingView>
  );
}
const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg }, header: { flexDirection: 'row', alignItems: 'center', gap: 16, padding: 16, backgroundColor: colors.surface, borderBottomWidth: 1, borderBottomColor: colors.border },
  back: { color: colors.accent, fontSize: 15, fontWeight: '600' }, title: { color: colors.text, fontSize: 18, fontWeight: '700' }, hint: { color: colors.muted, fontSize: 13, marginBottom: 14 },
  field: { marginBottom: 16 }, label: { color: colors.text, fontSize: 14, fontWeight: '600', marginBottom: 8 }, input: { borderWidth: 1, borderColor: colors.border, borderRadius: 10, backgroundColor: colors.surface, padding: 12, color: colors.text, fontSize: 15 },
  value: { color: colors.text, fontSize: 15 }, error: { color: colors.danger, marginBottom: 12 }, save: { backgroundColor: colors.accent, borderRadius: 10, alignItems: 'center', padding: 15 }, saveText: { color: '#fff', fontWeight: '700', fontSize: 15 },
  overlay: { flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(0,0,0,0.6)' }, sheet: { maxHeight: '65%', backgroundColor: colors.surface, borderTopLeftRadius: 16, borderTopRightRadius: 16, padding: 16 }, choice: { paddingVertical: 14, borderBottomWidth: 1, borderBottomColor: colors.border },
});
