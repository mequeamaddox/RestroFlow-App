import test from 'node:test';
import assert from 'node:assert/strict';
import { PgDialect } from 'drizzle-orm/pg-core';
import { inventoryItems, inventoryTransactions, invoiceProcessing, vendorPriceCatalog, vendors, wasteEntries } from '../shared/schema';
import { amount, recordWaste, receiveInvoice, stockQuantity } from '../server/stockOperations';

// Serialized transaction adapter tests the production transaction functions.
function database(failAudit = false, withVendor = false) {
  let state = {
    item: { id: 'item', name: 'Milk', locationId: 'restaurant', vendorId: withVendor ? 'vendor' : null, quantity: '10.00', unit: 'each', purchaseUnit: 'each', recipeUnit: 'each', conversionFactor: '1', costPerUnit: '3.00', costPerPurchaseUnit: '3.00' },
    invoice: { id: 'invoice', locationId: 'restaurant', vendorId: withVendor ? 'vendor' : null, status: 'pending', inventoryReceivedAt: null, invoiceNumber: 'INV-1', invoiceDate: new Date(), total: '8.00', subtotal: '8.00', lineItems: [{ description: 'Milk', quantity: 2, unitPrice: 4, unitType: 'each' }], fees: [] },
    newItems: [] as any[], audits: [] as any[], wastes: [] as any[], catalog: [] as any[],
  };
  const dialect = new PgDialect();
  let queue = Promise.resolve();
  const client = { async transaction(work: (tx: any) => Promise<any>) {
    const previous = queue; let release!: () => void;
    queue = new Promise(resolve => { release = resolve; }); await previous;
    const draft = structuredClone(state);
    const tx = {
      execute: async () => {},
      select: () => ({ from: (table: any) => ({ where: (condition: any) => {
        const query: any = {
          then: (resolve: any, reject: any) => Promise.resolve().then(() => {
            const params = dialect.sqlToQuery(condition).params;
            if (table === invoiceProcessing) return [draft.invoice];
            if (table === inventoryItems) return params.includes('elsewhere') || params.includes('foreign-item') ? [] : [draft.item, ...draft.newItems];
            if (table === vendors) return [{ id: 'vendor', locationId: 'restaurant' }];
            if (table === vendorPriceCatalog) return draft.catalog;
            throw new Error('Unexpected select');
          }).then(resolve, reject),
          for: () => query, orderBy: () => query,
        }; return query;
      } }) }),
      update: (table: any) => ({ set: (values: any) => ({ where: (condition: any) => {
        const query: any = { then: (resolve: any, reject: any) => Promise.resolve().then(() => {
          if (table === inventoryItems) {
            const change = dialect.sqlToQuery(values.quantity);
            const id = dialect.sqlToQuery(condition).params[0];
            const item = [draft.item, ...draft.newItems].find(row => row.id === id);
            assert.ok(item);
            const next = Number(item.quantity) + (change.sql.includes(' - ') ? -1 : 1) * Number(change.params[0]);
            Object.assign(item, values, { quantity: next.toFixed(2) }); return [item];
          }
          if (table === invoiceProcessing) { Object.assign(draft.invoice, values); return [draft.invoice]; }
          if (table === vendorPriceCatalog) { Object.assign(draft.catalog[0], values); return draft.catalog; }
          throw new Error('Unexpected update');
        }).then(resolve, reject), returning: () => query }; return query;
      } }) }),
      insert: (table: any) => ({ values: (values: any) => {
        const query: any = { then: (resolve: any, reject: any) => Promise.resolve().then(() => {
          if (table === inventoryTransactions) { if (failAudit) throw new Error('audit failure'); draft.audits.push(values); return []; }
          if (table === inventoryItems) { const item = { ...values, id: 'new-item' }; draft.newItems.push(item); return [item]; }
          if (table === wasteEntries) { const waste = { ...values, id: 'waste' }; draft.wastes.push(waste); return [waste]; }
          if (table === vendorPriceCatalog) { draft.catalog.push({ ...values, id: 'catalog' }); return draft.catalog; }
          throw new Error('Unexpected insert');
        }).then(resolve, reject), returning: () => query }; return query;
      } }),
    };
    try { const result = await work(tx); state = draft; return result; } finally { release(); }
  } };
  return { client: client as unknown as Parameters<typeof recordWaste>[0], read: () => state };
}
const waste = { inventoryItemId: 'item', locationId: 'restaurant', quantity: '2.00', unit: 'each', reason: 'spoiled' as const, cost: '999.00', reportedBy: 'user' };
test('waste decreases stock and calculates trusted cost with its audit record', async () => {
  const db = database(); const saved = await recordWaste(db.client, waste);
  assert.equal(db.read().item.quantity, '8.00'); assert.equal(saved.cost, '6.00');
  assert.equal(db.read().audits.length, 1); assert.equal(db.read().wastes.length, 1);
});
test('waste audit failure rolls stock and waste entry back', async () => {
  const db = database(true); await assert.rejects(recordWaste(db.client, waste), /audit failure/);
  assert.equal(db.read().item.quantity, '10.00'); assert.equal(db.read().wastes.length, 0);
});
test('waste cannot use another restaurant item or exceed available stock', async () => {
  const db = database();
  await assert.rejects(recordWaste(db.client, { ...waste, locationId: 'elsewhere' }), /belong/);
  await assert.rejects(recordWaste(db.client, { ...waste, quantity: '11' }), /exceeds/);
  assert.equal(db.read().item.quantity, '10.00');
});
test('invoice approval adds stock, updates supplier price, and records persistent receipt', async () => {
  const db = database(false, true); await receiveInvoice(db.client, 'invoice', {}, 'user');
  assert.equal(db.read().item.quantity, '12.00'); assert.equal(db.read().item.costPerUnit, '4.000000');
  assert.equal(db.read().catalog[0].inventoryItemId, 'item'); assert.equal(db.read().catalog[0].costPerUnit, '4.00');
  assert.equal(db.read().invoice.status, 'approved'); assert.ok(db.read().invoice.inventoryReceivedAt);
});
test('concurrent invoice approval receives inventory only once', async () => {
  const db = database(); await Promise.all([receiveInvoice(db.client, 'invoice', {}, 'user'), receiveInvoice(db.client, 'invoice', {}, 'user')]);
  assert.equal(db.read().item.quantity, '12.00'); assert.equal(db.read().audits.length, 1);
});
test('invoice audit failure rolls back stock, prices, and receipt status', async () => {
  const db = database(true); await assert.rejects(receiveInvoice(db.client, 'invoice', {}, 'user'), /audit failure/);
  assert.equal(db.read().item.quantity, '10.00'); assert.equal(db.read().item.costPerUnit, '3.00');
  assert.equal(db.read().invoice.status, 'pending'); assert.equal(db.read().invoice.inventoryReceivedAt, null);
});
test('invoice linked item cannot belong to another restaurant', async () => {
  const db = database(); await assert.rejects(receiveInvoice(db.client, 'invoice', { lineItems: [{ description: 'Milk', quantity: 2, unitPrice: 4, inventoryItemId: 'foreign-item' }] }, 'user'), /belong/);
  assert.equal(db.read().item.quantity, '10.00');
});
test('quantities and conversions reject malformed or incompatible input', () => {
  for (const value of ['-1', '0', 'NaN', '1x', '1.234']) assert.throws(() => amount(value, 'Quantity', true));
  const item = { unit: 'case', purchaseUnit: 'case', recipeUnit: 'lb', conversionFactor: '40' };
  assert.equal(stockQuantity(item, '20', 'lbs'), '0.50000000');
  assert.equal(stockQuantity(item, '1', 'oz'), '0.00156250');
  assert.throws(() => stockQuantity(item, '1', 'fl oz'), /Weight, volume/);
  assert.equal(stockQuantity(item, '1', 'lb'), '0.02500000');
});

test('a new invoice product is created and received once with consistent units and costs', async () => {
  const db = database(); await receiveInvoice(db.client, 'invoice', { lineItems: [{ description: 'New product', quantity: 3, unitPrice: 2, unitType: 'bottle' }] }, 'user');
  assert.equal(db.read().newItems.length, 1); assert.equal(db.read().newItems[0].quantity, '3.00');
  assert.equal(db.read().newItems[0].unit, 'bottle'); assert.equal(db.read().newItems[0].costPerUnit, '2.000000');
  await receiveInvoice(db.client, 'invoice', {}, 'user'); assert.equal(db.read().newItems.length, 1);
});

test('inventory already received through an order is not added again on invoice approval', async () => {
  const db = database(); await receiveInvoice(db.client, 'invoice', { receiveInventory: false }, 'user');
  assert.equal(db.read().item.quantity, '10.00'); assert.equal(db.read().audits.length, 0); assert.ok(db.read().invoice.inventoryReceivedAt);
  await receiveInvoice(db.client, 'invoice', { receiveInventory: true }, 'user'); assert.equal(db.read().item.quantity, '10.00');
});
