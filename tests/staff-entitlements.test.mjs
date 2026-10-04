import test from 'node:test';
import assert from 'node:assert/strict';
import { build } from 'esbuild';
import { mkdtemp, rm, symlink } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
const dir = await mkdtemp(join(tmpdir(), 'restro-entitlements-'));
const people = { staff: { id: 'staff', role: 'employee', subscriptionPlan: 'free', subscriptionStatus: 'inactive' }, ownerA: { id: 'ownerA', role: 'owner', subscriptionPlan: 'core', subscriptionStatus: 'active' }, ownerB: { id: 'ownerB', role: 'owner', subscriptionPlan: 'free', subscriptionStatus: 'inactive' } };
const locations = { A: { id: 'A', ownerId: 'ownerA' }, B: { id: 'B', ownerId: 'ownerB' } };
let memberships = [{ userId: 'staff', locationId: 'A', role: 'employee', isActive: true }];
globalThis.__entitlementsStorage = {
  getUser: async id => people[id], getLocationById: async id => locations[id],
  getUserPermissions: async id => memberships.filter(p => p.userId === id),
  getLocations: async id => Object.values(locations).filter(l => l.ownerId === id),
  getInventoryItem: async id => ({ id, locationId: 'B' }), createSecurityLog: async () => {},
};
await build({ stdin: { contents: `export { requirePlan } from './server/billingMiddleware'; export { assertLocationAccess, requireLocationAccess, assertSameLocation } from './server/securityMiddleware';`, resolveDir: process.cwd() }, outfile: join(dir, 'middleware.mjs'), bundle: true, format: 'esm', platform: 'node', packages: 'external', plugins: [{ name: 'isolated-storage', setup(b) {
  b.onResolve({ filter: /^\.\/storage$/ }, () => ({ path: 'storage', namespace: 'stub' }));
  b.onLoad({ filter: /.*/, namespace: 'stub' }, () => ({ contents: 'export const storage = globalThis.__entitlementsStorage;', loader: 'js' }));
} }] });
await symlink(join(process.cwd(), 'node_modules'), join(dir, 'node_modules'));
const { requirePlan, assertLocationAccess, requireLocationAccess, assertSameLocation } = await import(pathToFileURL(join(dir, 'middleware.mjs')).href);
const request = (query = {}, originalUrl = '/api/inventory') => ({ user: { id: 'staff', role: 'employee' }, query, body: {}, params: {}, originalUrl, headers: {}, get: () => '', path: originalUrl });
function response() { return { code: 200, body: undefined, status(code) { this.code = code; return this; }, json(body) { this.body = body; return this; } }; }
try {
  await test('free staff use the active subscription of their assigned restaurant owner', async () => {
    const req = request({ locationId: 'A' }); const res = response(); let passed = false;
    await requirePlan('core')(req, res, () => { passed = true; }); assert.equal(passed, true);
    const list = response(); passed = false; await requirePlan('core')(request({}, '/api/locations'), list, () => { passed = true; }); assert.equal(passed, true);
  });
  await test('staff membership does not unlock another restaurant or its inactive plan', async () => {
    let res = response(); await requirePlan('core')(request({ locationId: 'B' }), res, () => assert.fail()); assert.equal(res.code, 403);
    memberships.push({ userId: 'staff', locationId: 'B', role: 'employee', isActive: true });
    res = response(); await requirePlan('core')(request({ locationId: 'B' }), res, () => assert.fail()); assert.equal(res.code, 403);
    memberships.pop();
    people.ownerA.subscriptionStatus = 'cancelled'; res = response(); await requirePlan('core')(request({ locationId: 'A' }), res, () => assert.fail()); assert.equal(res.code, 403); people.ownerA.subscriptionStatus = 'active';
  });
  await test('ID routes bill the resource restaurant rather than an unrelated paid location', async () => {
    const res = response(); await requirePlan('core')(request({ locationId: 'A' }, '/api/inventory/item-B?locationId=A'), res, () => assert.fail()); assert.equal(res.code, 403);
  });
  await test('owners assigned as staff retain only their membership role in another restaurant', async () => {
    memberships.push({ userId: 'ownerB', locationId: 'A', role: 'employee', isActive: true });
    const req = request(); req.user = { id: 'ownerB', role: 'owner' }; const res = response();
    assert.equal(await assertLocationAccess(req, res, 'A'), true); assert.equal(req.user.role, 'employee');
    memberships.pop();
  });
  await test('conflicting query/body restaurant IDs and generic transfers are rejected', async () => {
    const req = request({ locationId: 'A' }); req.body = { locationId: 'B' }; const res = response();
    await requireLocationAccess()(req, res, () => assert.fail()); assert.equal(res.code, 400);
    assert.equal(assertSameLocation(response(), 'A', 'B'), false); assert.equal(assertSameLocation(response(), 'A', undefined), true);
  });
} finally { delete globalThis.__entitlementsStorage; await rm(dir, { recursive: true, force: true }); }
