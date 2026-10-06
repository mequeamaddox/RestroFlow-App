import test from 'node:test';
import assert from 'node:assert/strict';
import { build } from 'esbuild';
import { mkdtemp, rm, symlink } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';

const dir = await mkdtemp(join(tmpdir(), 'restro-record-access-'));
const people = {
  owner: { id: 'owner', role: 'owner', email: 'owner@example.com' },
  gm: { id: 'gm', role: 'gm', email: 'gm@example.com' },
  alice: { id: 'alice', role: 'employee', email: 'alice@example.com' },
  bob: { id: 'bob', role: 'employee', email: 'Bob@Example.com' },
};
const memberships = [
  { userId: 'gm', locationId: 'A', role: 'gm', isActive: true },
  { userId: 'alice', locationId: 'A', role: 'employee', isActive: true },
  { userId: 'bob', locationId: 'A', role: 'employee', isActive: true },
];
globalThis.__recordAccessStorage = {
  getUser: async id => people[id],
  getLocationById: async id => (id === 'A' ? { id: 'A', ownerId: 'owner', isActive: true } : null),
  getUserPermissions: async id => memberships.filter(p => p.userId === id),
  getLocations: async id => (id === 'owner' ? [{ id: 'A', ownerId: 'owner' }] : []),
  createSecurityLog: async () => {},
};
await build({
  stdin: { contents: `export { assertEmployeeRecordAccess } from './server/employeeIdentity';`, resolveDir: process.cwd() },
  outfile: join(dir, 'access.mjs'), bundle: true, format: 'esm', platform: 'node', packages: 'external',
  plugins: [{ name: 'isolated-storage', setup(b) {
    b.onResolve({ filter: /^\.\/storage$/ }, () => ({ path: 'storage', namespace: 'stub' }));
    b.onLoad({ filter: /.*/, namespace: 'stub' }, () => ({ contents: 'export const storage = globalThis.__recordAccessStorage;', loader: 'js' }));
  } }],
});
await symlink(join(process.cwd(), 'node_modules'), join(dir, 'node_modules'));
const { assertEmployeeRecordAccess } = await import(pathToFileURL(join(dir, 'access.mjs')).href);

const aliceRecord = { email: 'alice@example.com', locationId: 'A' };
const bobRecord = { email: 'bob@example.com', locationId: 'A' };
const request = id => ({ user: { id, role: people[id].role }, query: {}, body: {}, params: {}, headers: {}, get: () => '', path: '/' });
function response() { return { code: 200, status(c) { this.code = c; return this; }, json(b) { this.body = b; return this; } }; }

try {
  await test('an employee can open their own paperwork, matched case-insensitively', async () => {
    assert.equal(await assertEmployeeRecordAccess(request('alice'), response(), aliceRecord), 'self');
    assert.equal(await assertEmployeeRecordAccess(request('bob'), response(), bobRecord), 'self');
  });
  await test('a coworker at the same restaurant cannot open someone else\'s paperwork', async () => {
    const res = response();
    assert.equal(await assertEmployeeRecordAccess(request('bob'), res, aliceRecord), undefined);
    assert.equal(res.code, 403);
  });
  await test('owners and managers can open any employee\'s paperwork at their restaurant', async () => {
    assert.equal(await assertEmployeeRecordAccess(request('owner'), response(), aliceRecord), 'manager');
    assert.equal(await assertEmployeeRecordAccess(request('gm'), response(), aliceRecord), 'manager');
  });
  await test('manager-only actions are refused to the employee themselves', async () => {
    const res = response();
    assert.equal(await assertEmployeeRecordAccess(request('alice'), res, aliceRecord, { managerOnly: true }), undefined);
    assert.equal(res.code, 403);
    assert.equal(await assertEmployeeRecordAccess(request('gm'), response(), aliceRecord, { managerOnly: true }), 'manager');
  });
} finally {
  delete globalThis.__recordAccessStorage;
  await rm(dir, { recursive: true, force: true });
}
