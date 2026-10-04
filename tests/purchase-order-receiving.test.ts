import test from 'node:test';
import assert from 'node:assert/strict';
import { PgDialect } from 'drizzle-orm/pg-core';
import { purchaseOrders, purchaseOrderItems, inventoryItems, inventoryTransactions } from '../shared/schema';
import { planReceipts, updateOrderAndReceive } from '../server/purchaseOrderReceiving';
import { quantityMatchesOrder } from '../mobile/src/lib/receiving';

// Transaction adapter exercises commit/rollback and serialized receiving without a live database.
function database(failOnSecondItem = false) {
  const dialect = new PgDialect();
  let state = {
    order: { id: 'order', status: 'confirmed', locationId: 'restaurant', orderNumber: 'PO-1' },
    lines: [{ id: 'line-a', inventoryItemId: 'a', quantity: '2.00' }, { id: 'line-b', inventoryItemId: 'b', quantity: '3.50' }],
    stock: { a: 10, b: 20 } as Record<string, number>,
    transactions: [] as unknown[],
  };
  let queue = Promise.resolve();
  const client = {
    async transaction(work: (tx: any) => Promise<any>) {
      const previous = queue;
      let release!: () => void;
      queue = new Promise(resolve => { release = resolve; });
      await previous;
      const draft = structuredClone(state);
      const tx = {
        select: () => ({ from: (table: unknown) => ({ where: () => ({
          for: (lock: string) => { assert.equal(lock, 'update'); return Promise.resolve(table === purchaseOrders ? [draft.order] : draft.lines); },
        }) }) }),
        update: (table: unknown) => ({ set: (changes: any) => ({ where: (condition: any) => ({
          returning: async () => {
            if (table === purchaseOrders) { Object.assign(draft.order, changes); return [draft.order]; }
            assert.equal(table, inventoryItems);
            const [id, location] = dialect.sqlToQuery(condition).params as string[];
            assert.equal(location, draft.order.locationId);
            if (failOnSecondItem && id === 'b') throw new Error('simulated write failure');
            const increment = dialect.sqlToQuery(changes.quantity);
            assert.match(increment.sql, /quantity.*\+/);
            draft.stock[id] += Number(increment.params[0]);
            return [{ id }];
          },
        }) }) }),
        insert: (table: unknown) => ({ values: async (value: unknown) => {
          assert.equal(table, inventoryTransactions);
          draft.transactions.push(value);
        } }),
      };
      try { const result = await work(tx); state = draft; return result; }
      finally { release(); }
    },
  };
  return { client: client as unknown as Parameters<typeof updateOrderAndReceive>[0], read: () => state };
}

test('receiving records all stock and audit entries before committing delivered status', async () => {
  const db = database();
  await updateOrderAndReceive(db.client, 'order', { status: 'delivered' }, 'user');
  assert.equal(db.read().order.status, 'delivered');
  assert.deepEqual(db.read().stock, { a: 12, b: 23.5 });
  assert.equal(db.read().transactions.length, 2);
});

test('a later inventory failure rolls back status, earlier stock changes, and audit entries', async () => {
  const db = database(true);
  await assert.rejects(updateOrderAndReceive(db.client, 'order', { status: 'delivered' }, 'user'), /write failure/);
  assert.equal(db.read().order.status, 'confirmed');
  assert.deepEqual(db.read().stock, { a: 10, b: 20 });
  assert.equal(db.read().transactions.length, 0);
});

test('concurrent receiving calls under the order lock add stock once', async () => {
  const db = database();
  await Promise.all([
    updateOrderAndReceive(db.client, 'order', { status: 'delivered' }, 'first'),
    updateOrderAndReceive(db.client, 'order', { status: 'delivered' }, 'second'),
  ]);
  assert.deepEqual(db.read().stock, { a: 12, b: 23.5 });
  assert.equal(db.read().transactions.length, 2);
});

test('a delivered order cannot be reopened and received twice', async () => {
  const db = database();
  await updateOrderAndReceive(db.client, 'order', { status: 'delivered' }, 'user');
  await assert.rejects(updateOrderAndReceive(db.client, 'order', { status: 'confirmed' }, 'user'), /cannot be reopened/);
});

test('receipt planning aggregates duplicate items with exact decimal quantities', () => {
  assert.deepEqual(planReceipts([{ inventoryItemId: 'a', quantity: '0.10' }, { inventoryItemId: 'a', quantity: '0.20' }]), [{ id: 'a', quantity: '0.30' }]);
});

test('empty, unlinked, zero, and negative order lines cannot be silently received', () => {
  assert.throws(() => planReceipts([]));
  for (const item of [{ inventoryItemId: null, quantity: '1' }, { inventoryItemId: 'a', quantity: '0' }, { inventoryItemId: 'a', quantity: '-1' }]) assert.throws(() => planReceipts([item]));
});

test('a scan quantity must match the order, including fractional units', () => {
  assert.equal(quantityMatchesOrder('1', '12.00'), false);
  assert.equal(quantityMatchesOrder('12', '12.00'), true);
  assert.equal(quantityMatchesOrder('1.25', '1.25'), true);
  for (const input of ['', '-1', 'NaN', '1x', '1.251']) assert.equal(quantityMatchesOrder(input, '1.25'), false);
});

test('changed order quantities are rejected before stock is written', async () => {
  const db = database();
  await assert.rejects(updateOrderAndReceive(db.client, 'order', { status: 'delivered' }, 'user', [
    { id: 'line-a', quantity: '1.00' }, { id: 'line-b', quantity: '3.50' },
  ]), /order changed/);
  assert.deepEqual(db.read().stock, { a: 10, b: 20 });
  assert.equal(db.read().order.status, 'confirmed');
});
