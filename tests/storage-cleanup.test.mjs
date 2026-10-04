import test from 'node:test';
import assert from 'node:assert/strict';
import { build } from 'esbuild';
import { drizzle } from 'drizzle-orm/pg-proxy';
import { mkdtemp, rm, symlink } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';

// Run the production storage methods and real Drizzle SQL/row mapping against
// deterministic responses. No production database or credentials are used.
const directory = await mkdtemp(join(tmpdir(), 'restro-storage-'));
let queries = [];
let respond = sql => sql.includes('from "locations"') || sql.includes('from "categories"') ? [{ id: 'existing' }] : [];
function values(sql, records) {
  const selection = sql.slice(sql.indexOf('select ') + 7, sql.indexOf(' from '));
  const columns = [...selection.matchAll(/(?:"[^"]+"\.)?"([^"]+)"/g)].map(match => match[1]);
  return records.map(record => columns.map(column => record[column] ?? null));
}
globalThis.__restroCleanupDb = drizzle(async (sql, params) => {
  queries.push({ sql, params });
  return { rows: values(sql, respond(sql, params)) };
});
await symlink(join(process.cwd(), 'node_modules'), join(directory, 'node_modules'));
const output = join(directory, 'storage.mjs');
await build({ entryPoints: ['server/storage.ts'], outfile: output, bundle: true, format: 'esm', platform: 'node', packages: 'external',
  plugins: [{ name: 'isolated-database', setup(builder) {
    builder.onResolve({ filter: /^\.\/db$/ }, () => ({ path: 'db', namespace: 'stub' }));
    builder.onLoad({ filter: /.*/, namespace: 'stub' }, () => ({ contents: 'export const db = globalThis.__restroCleanupDb;', loader: 'js' }));
  } }],
});
const { DatabaseStorage } = await import(pathToFileURL(output).href);
await new Promise(resolve => setImmediate(resolve));
const storage = new DatabaseStorage();
function scenario(callback) { queries = []; respond = callback; }
try {
  await test('location lookups map owner and add-on columns used by authorization', async () => {
    scenario(() => [{ id: 'A', name: 'Restaurant', type: 'restaurant', owner_id: 'owner-A', hr_addon_enabled: true }]);
    const location = await storage.getLocationById('A');
    assert.equal(location.ownerId, 'owner-A'); assert.equal(location.hrAddonEnabled, true);
    assert.deepEqual(queries[0].params, ['A', 1]);
  });
  await test('uploaded employee documents and assigned forms query separate tables', async () => {
    scenario(sql => sql.includes('from "employee_documents"') ? [{ id: 'upload', employee_id: 'employee', document_type: 'i9' }]
      : [{ id: 'assignment', name: 'W4 form', type: 'federal_w4', status: 'sent' }]);
    assert.equal((await storage.getEmployeeDocuments('employee'))[0].id, 'upload');
    assert.equal((await storage.getEmployeeDocumentAssignments('employee'))[0].id, 'assignment');
    assert.ok(queries.every(query => query.params.includes('employee')));
    assert.ok(queries[1].sql.includes('"employee_document_assignments"'));
  });
  await test('cost reports load purchase line totals and scope budgets to the restaurant', async () => {
    scenario((sql, params) => {
      if (sql.includes('from "purchase_orders"')) { assert.ok(params.includes('A')); return [{ id: 'order', total_amount: '25.00' }]; }
      if (sql.includes('from "budgets"')) { assert.ok(params.includes('A')); return [{ budget_amount: '100.00' }]; }
      if (sql.includes('from "purchase_order_items"')) { assert.ok(params.includes('order')); return [{ purchase_order_id: 'order', total_cost: '25.00', name: 'Food' }]; }
      throw new Error(`Unexpected query: ${sql}`);
    });
    const budget = await storage.getBudgetTracking('A');
    assert.equal(budget.monthlySpend, 25); assert.equal(budget.spendVariance, -75);
    assert.deepEqual(budget.categoryBreakdown, [{ name: 'Food', actual: 25, budget: 0, variance: 0 }]);
    assert.deepEqual((await storage.getCostAnalysis('30d', 'A')).categoryBreakdown, [{ name: 'Food', value: 25 }]);
  });
  await test('menu performance uses POS line quantities and actual extended totals', async () => {
    scenario((sql, params) => {
      if (sql.includes('from "pos_sales"')) { assert.ok(params.includes('A')); return [{ id: 'sale', total: '15.00' }]; }
      assert.ok(sql.includes('from "pos_sale_items"')); assert.ok(params.includes('sale'));
      return [{ pos_sale_id: 'sale', item_name: 'Pasta', quantity: 2, total_price: '15.00', category: 'Food' }];
    });
    const [item] = await storage.getMenuPerformance('30d', 'A');
    assert.equal(item.name, 'Pasta'); assert.equal(item.unitsSold, 2); assert.equal(item.revenue, 15); assert.equal(item.category, 'Food');
  });
  await test('overdue invoice filter uses due dates, unpaid states, and location together', async () => {
    scenario(() => []);
    await storage.getInvoices('overdue', 'A');
    assert.ok(queries[0].sql.includes('"invoice_processing"."due_date" <'));
    assert.ok(queries[0].params.includes('approved')); assert.ok(queries[0].params.includes('A'));
    assert.ok(!queries[0].params.includes('paid'));
  });
  await test('form responses match both assignment and field before updating', async () => {
    scenario(() => [{ id: 'response', assignment_id: 'assignment', field_id: 'field' }]);
    await storage.saveDocumentFormResponse({ assignmentId: 'assignment', fieldId: 'field', fieldValue: 'new' });
    assert.ok(queries[0].sql.includes(' and ')); assert.deepEqual(queries[0].params, ['assignment', 'field']);
  });
} finally {
  delete globalThis.__restroCleanupDb;
  await rm(directory, { recursive: true, force: true });
}
