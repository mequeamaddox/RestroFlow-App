import test from 'node:test';
import assert from 'node:assert/strict';
import { requireObjectAccess } from '../server/objectAccessMiddleware';

async function run(path: string, locations: (string | null)[], permitted: string[], fail = false) {
  const checked: string[] = [];
  let status = 200, downloads = 0, lookups = 0;
  const res: any = { sendStatus: (code: number) => { status = code; } };
  const req: any = { path, query: { locationId: 'my-restaurant' } };
  await requireObjectAccess({
    getLocationIds: async () => { lookups++; if (fail) throw new Error('DB unavailable'); return locations; },
    assertAccess: async (_req, _res, id) => { checked.push(id); if (!permitted.includes(id)) { status = 403; return false; } return true; },
  })(req, res, () => { downloads++; });
  return { status, downloads, lookups, checked };
}

test('authorized restaurant can download its registered object', async () => {
  assert.equal((await run('/objects/invoices/file', ['A'], ['A'])).downloads, 1);
});
test('knowing another restaurant file path or passing own location cannot unlock it', async () => {
  const r = await run('/objects/invoices/file', ['B'], ['A']);
  assert.equal(r.status, 403); assert.equal(r.downloads, 0);
});
test('unregistered and unscoped files fail closed', async () => {
  for (const locations of [[], [null]]) {
    const r = await run('/objects/invoices/file', locations, ['A']);
    assert.equal(r.status, 404); assert.equal(r.downloads, 0);
  }
});
test('a second reference in an accessible restaurant does not unlock another restaurant file', async () => {
  const r = await run('/objects/invoices/file', ['A', 'B'], ['A']);
  assert.equal(r.status, 403); assert.equal(r.downloads, 0);
});
test('traversal and encoded aliases are rejected before querying storage', async () => {
  for (const path of ['/objects/../secret', '/objects/%2e%2e/secret', '/objects/invoices\\secret', '/objects//secret']) {
    const r = await run(path, ['A'], ['A']);
    assert.equal(r.status, 404); assert.equal(r.lookups, 0); assert.equal(r.downloads, 0);
  }
});
test('lookup errors do not fall through to download', async () => {
  const r = await run('/objects/invoices/file', ['A'], ['A'], true);
  assert.equal(r.status, 500); assert.equal(r.downloads, 0);
});
