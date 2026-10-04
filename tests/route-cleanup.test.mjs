import test from 'node:test';
import assert from 'node:assert/strict';
import { build } from 'esbuild';
import express from 'express';
import { mkdtemp, rm, symlink } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';

const directory = await mkdtemp(join(tmpdir(), 'restro-routes-'));
const categories = [
  { id: 'category-A', name: 'Food', locationId: '11111111-1111-4111-8111-111111111111' },
  { id: 'category-B', name: 'Other restaurant', locationId: '22222222-2222-4222-8222-222222222222' },
  { id: 'category-global', name: 'Shared', locationId: null },
];
const vendors = [];
const items = [];
let writes = 0;
globalThis.__restroRouteStorage = {
  getLocationById: async id => ({ id, ownerId: id === '11111111-1111-4111-8111-111111111111' ? 'owner-A' : 'owner-B' }),
  createSecurityLog: async () => {},
  getCategory: async id => categories.find(category => category.id === id),
  updateCategory: async (id, data) => { writes++; return { ...categories.find(category => category.id === id), ...data }; },
  deleteCategory: async () => { writes++; },
  getCategories: async locationId => categories.filter(category => category.locationId === locationId || !category.locationId),
  createCategory: async data => { const record = { ...data, id: `category-${categories.length}` }; categories.push(record); return record; },
  getVendors: async locationId => vendors.filter(vendor => vendor.locationId === locationId),
  getVendor: async id => vendors.find(vendor => vendor.id === id),
  createInventoryTransaction: async data => data,
  createVendor: async data => { const record = { ...data, id: `vendor-${vendors.length}` }; vendors.push(record); return record; },
  getInventoryItems: async locationId => items.filter(item => item.locationId === locationId).map(item => ({ ...item,
    category: categories.find(category => category.id === item.categoryId), vendor: vendors.find(vendor => vendor.id === item.vendorId) })),
  createInventoryItem: async data => { const record = { ...data, id: `item-${items.length}` }; items.push(record); return record; },
  updateInventoryItem: async (id, data) => { const item = items.find(item => item.id === id); Object.assign(item, data); return item; },
};
const output = join(directory, 'routes.mjs');
await build({ stdin: { contents: `export { registerInventoryRoutes } from './server/routes/inventory.ts'; export { registerCsvRoutes } from './server/routes/csv.ts';`, resolveDir: process.cwd() },
  outfile: output, bundle: true, format: 'esm', platform: 'node', packages: 'external',
  plugins: [{ name: 'isolated-services', setup(builder) {
    builder.onResolve({ filter: /^(\.\.\/storage|\.\/storage)$/ }, () => ({ path: 'storage', namespace: 'stub' }));
    builder.onResolve({ filter: /^\.\/helpers$/ }, () => ({ path: 'helpers', namespace: 'stub' }));
    builder.onResolve({ filter: /^\.\.\/db$/ }, () => ({ path: 'db', namespace: 'stub' }));
    builder.onResolve({ filter: /^@clerk\/express$/ }, () => ({ path: 'clerk', namespace: 'stub' }));
    builder.onLoad({ filter: /.*/, namespace: 'stub' }, ({ path }) => ({ contents: {
      storage: 'export const storage = globalThis.__restroRouteStorage;',
      db: 'export const db = {};',
      clerk: 'export const getAuth = () => ({ userId: "owner-A" });',
      helpers: `import multer from 'multer'; export const csvUpload = multer(); export const PLAN_LOCATION_LIMITS = {};
        export const isAuthenticated = (req, res, next) => { req.user = { id: 'owner-A', role: 'owner' }; next(); };`,
    }[path], loader: 'js', resolveDir: process.cwd() }));
  } }],
});
await symlink(join(process.cwd(), 'node_modules'), join(directory, 'node_modules'));
const { registerInventoryRoutes, registerCsvRoutes } = await import(pathToFileURL(output).href);
const app = express(); app.use(express.json()); registerInventoryRoutes(app); registerCsvRoutes(app);
const server = app.listen(0, '127.0.0.1');
await new Promise(resolve => server.once('listening', resolve));
const base = `http://127.0.0.1:${server.address().port}`;
const request = (path, method, data) => fetch(base + path, { method, headers: { 'Content-Type': 'application/json' }, body: data ? JSON.stringify(data) : undefined });
try {
  await test('category editing and deletion work for the authorized restaurant', async () => {
    assert.equal((await request('/api/categories/category-A', 'PUT', { name: 'New name' })).status, 200);
    assert.equal((await request('/api/categories/category-A?locationId=11111111-1111-4111-8111-111111111111', 'DELETE')).status, 204);
    assert.equal(writes, 2);
  });
  await test('a new location cannot authorize edits to a category in another restaurant', async () => {
    const before = writes;
    assert.equal((await request('/api/categories/category-B', 'PUT', { name: 'Stolen', locationId: '11111111-1111-4111-8111-111111111111' })).status, 403);
    assert.equal((await request('/api/categories/category-global?locationId=11111111-1111-4111-8111-111111111111', 'DELETE')).status, 403);
    assert.equal((await request('/api/categories/category-A', 'PUT', { locationId: null })).status, 403);
    assert.equal(writes, before);
  });
  await test('inventory CSV round trip preserves category, supplier, and zero reorder level', async () => {
    const csv = 'name,category,unit,quantity,cost_per_unit,min_quantity,supplier\nPasta,Dry Goods,lb,8,2.50,0,"Vendor, Inc"';
    const response = await request('/api/csv/import-inventory', 'POST', { locationId: '11111111-1111-4111-8111-111111111111', csv });
    assert.equal(response.status, 200); assert.equal((await response.json()).created, 1);
    assert.equal(items[0].reorderLevel, '0'); assert.ok(items[0].categoryId); assert.ok(items[0].vendorId);
    const exported = await (await fetch(base + '/api/csv/export-inventory?locationId=11111111-1111-4111-8111-111111111111')).text();
    assert.equal(exported, 'name,category,unit,quantity,cost_per_unit,min_quantity,supplier\nPasta,Dry Goods,lb,8,2.5,0,"Vendor, Inc"');
    const imported = await request('/api/csv/import-inventory', 'POST', { locationId: '11111111-1111-4111-8111-111111111111', csv: exported });
    assert.equal((await imported.json()).updated, 1); assert.equal(items.length, 1); assert.equal(vendors.length, 1);
  });
  await test('single-item creation saves the scanned barcode and rejects invalid amounts', async () => {
    const payload = { name: 'Milk', unit: 'each', quantity: '2.00', costPerUnit: '3.50', barcode: '012345678905', locationId: '11111111-1111-4111-8111-111111111111' };
    const response = await request('/api/inventory', 'POST', payload);
    assert.equal(response.status, 201); assert.equal((await response.json()).barcode, payload.barcode);
    const before = items.length;
    for (const quantity of ['-1', 'NaN', '2abc', '1.234']) assert.equal((await request('/api/inventory', 'POST', { ...payload, quantity })).status, 400);
    assert.equal(items.length, before);
  });
  await test('a single item cannot link another restaurant category or vendor', async () => {
    const payload = { name: 'Wrong link', locationId: '11111111-1111-4111-8111-111111111111' };
    categories.push({ id: '33333333-3333-4333-8333-333333333333', name: 'Private', locationId: '22222222-2222-4222-8222-222222222222' });
    vendors.push({ id: '44444444-4444-4444-8444-444444444444', name: 'Private vendor', locationId: '22222222-2222-4222-8222-222222222222' });
    const before = items.length;
    assert.equal((await request('/api/inventory', 'POST', { ...payload, categoryId: '33333333-3333-4333-8333-333333333333' })).status, 400);
    assert.equal((await request('/api/inventory', 'POST', { ...payload, vendorId: '44444444-4444-4444-8444-444444444444' })).status, 400);
    assert.equal((await request('/api/inventory', 'POST', { ...payload, locationId: '22222222-2222-4222-8222-222222222222' })).status, 403);
    assert.equal(items.length, before);
  });
} finally {
  await new Promise(resolve => server.close(resolve));
  delete globalThis.__restroRouteStorage;
  await rm(directory, { recursive: true, force: true });
}
