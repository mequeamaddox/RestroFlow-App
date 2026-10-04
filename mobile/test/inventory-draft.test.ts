import test from 'node:test';
import assert from 'node:assert/strict';
import { barcodeKey, inventoryDraftPayload, type InventoryDraft } from '../src/lib/inventoryDraft';
const draft: InventoryDraft = { name: ' Milk ', unit: 'each', quantity: '2', costPerUnit: '3.50', reorderLevel: '0', barcode: ' 012345678905 ' };
test('new scanned inventory retains barcode, restaurant, stock, and consistent unit costs', () => {
  const payload = inventoryDraftPayload(draft, 'restaurant-A');
  assert.equal(payload.locationId, 'restaurant-A'); assert.equal(payload.barcode, '012345678905');
  assert.equal(payload.name, 'Milk'); assert.equal(payload.quantity, '2.00');
  assert.equal(payload.costPerUnit, payload.costPerPurchaseUnit);
  assert.equal(payload.purchaseUnit, payload.unit); assert.equal(payload.recipeUnit, payload.unit);
  assert.equal(payload.conversionFactor, '1'); assert.equal(payload.vendorId, null);
});
test('invalid stock and cost cannot be silently converted to a different amount', () => {
  for (const value of ['', '-1', 'NaN', '2abc', '1.234', '100000000', '1e3']) {
    for (const field of ['quantity', 'costPerUnit', 'reorderLevel']) assert.throws(() => inventoryDraftPayload({ ...draft, [field]: value }, 'restaurant-A'));
  }
  assert.throws(() => inventoryDraftPayload(draft, null));
  assert.throws(() => inventoryDraftPayload({ ...draft, name: ' ' }, 'restaurant-A'));
  assert.equal(inventoryDraftPayload({ ...draft, quantity: '.5' }, 'restaurant-A').quantity, '0.50');
});
test('UPC-A and Android zero-prefixed EAN-13 identify the same product without changing other barcodes', () => {
  assert.equal(barcodeKey('012345678905'), barcodeKey('0012345678905'));
  assert.notEqual(barcodeKey('1234567890123'), barcodeKey('234567890123'));
  assert.equal(barcodeKey(' ABC-01 '), 'ABC-01');
});
