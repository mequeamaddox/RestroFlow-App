export interface InventoryDraft {
  name: string;
  unit: string;
  quantity: string;
  costPerUnit: string;
  reorderLevel: string;
  barcode: string;
  categoryId?: string;
  vendorId?: string;
}

// Android may report a UPC-A as EAN-13 with a leading zero.
export function barcodeKey(value: string): string {
  const code = value.trim();
  return /^0\d{12}$/.test(code) ? code.slice(1) : code;
}

export function inventoryDraftPayload(draft: InventoryDraft, locationId: string | null) {
  if (!locationId) throw new Error('Select a restaurant before adding inventory.');
  const name = draft.name.trim();
  const unit = draft.unit.trim();
  if (!name || name.length > 200) throw new Error('Enter an item name (up to 200 characters).');
  if (!unit || unit.length > 20) throw new Error('Enter a unit such as each, lb, bottle, or case (up to 20 characters).');
  const amounts: Record<string, string> = {};
  for (const [field, label] of [['quantity', 'Starting quantity'], ['costPerUnit', 'Cost per unit'], ['reorderLevel', 'Reorder level']] as const) {
    const value = draft[field].trim();
    if (!/^(?:\d{1,8}(?:\.\d{1,2})?|\.\d{1,2})$/.test(value)) {
      throw new Error(`${label} must be zero or more, with at most two decimal places.`);
    }
    amounts[field] = Number(value).toFixed(2);
  }
  return {
    name, unit, locationId, quantity: amounts.quantity, costPerUnit: amounts.costPerUnit, reorderLevel: amounts.reorderLevel,
    // A single-unit item starts with consistent purchase and recipe units.
    purchaseUnit: unit, recipeUnit: unit, conversionFactor: '1',
    costPerPurchaseUnit: amounts.costPerUnit,
    barcode: draft.barcode.trim() || null,
    categoryId: draft.categoryId || null,
    vendorId: draft.vendorId || null,
  };
}
