import test from 'node:test';
import assert from 'node:assert/strict';
import { build } from 'esbuild';
import express from 'express';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';

// Exercise production route registration, real multipart parsing, and production
// location authorization. Stub external DB/OCR/S3 services; no credentials needed.
const directory = await mkdtemp(join(tmpdir(), 'restro-invoices-'));
const output = join(directory, 'routes.mjs');
await build({
  entryPoints: ['server/routes/invoices.ts'], outfile: output, bundle: true,
  format: 'esm', platform: 'node', packages: 'external',
  plugins: [{ name: 'external-services', setup(builder) {
    builder.onResolve({ filter: /^(\.\.\/storage|\.\/storage)$/ }, () => ({ path: 'storage', namespace: 'stub' }));
    builder.onResolve({ filter: /^\.\/helpers$/ }, () => ({ path: 'helpers', namespace: 'stub' }));
    builder.onResolve({ filter: /^\.\.\/ocrService$/ }, () => ({ path: 'ocr', namespace: 'stub' }));
    builder.onResolve({ filter: /^\.\.\/objectStorage$/ }, () => ({ path: 'objects', namespace: 'stub' }));
    builder.onLoad({ filter: /.*/, namespace: 'stub' }, ({ path }) => ({ contents: {
      storage: `export const storage = {
        getLocationById: async id => ({ id, ownerId: id === 'A' ? 'owner-A' : 'owner-B' }),
        createSecurityLog: async () => {}, getUserPermissions: async () => [], getUser: async () => ({ subscriptionPlan: 'core' }),
        createInvoice: async data => data,
      };`,
      helpers: `import multer from 'multer'; export const upload = multer({ storage: multer.memoryStorage() });
        export const isAuthenticated = (req, res, next) => { req.user = { id: 'owner-A', role: 'owner' }; next(); };`,
      ocr: `export const OCRService = { extractTextFromImage: async () => ({ text: 'invoice', confidence: 100 }),
        parseInvoiceFromText: () => ({ vendorName: 'Unknown Vendor', total: 10, subtotal: 10, invoiceNumber: '1', invoiceDate: new Date(), lineItems: [], fees: [] }) };`,
      objects: `export class ObjectStorageService { async uploadBuffer() { return '/objects/invoices/test'; } }`,
    }[path], loader: 'js', resolveDir: process.cwd() }));
  } }],
});
// Bundle lives in tmp; make installed packages resolvable there using a symlink.
const { symlink } = await import('node:fs/promises');
await symlink(join(process.cwd(), 'node_modules'), join(directory, 'node_modules'));
const { registerInvoiceRoutes } = await import(pathToFileURL(output).href);
const app = express(); registerInvoiceRoutes(app);
const server = app.listen(0, '127.0.0.1');
await new Promise(resolve => server.once('listening', resolve));
const base = `http://127.0.0.1:${server.address().port}`;
async function upload(location, query = '') {
  const form = new FormData(); form.append('invoice', new Blob(['image'], { type: 'image/png' }), 'invoice.png');
  if (location) form.append('locationId', location);
  return fetch(`${base}/api/invoices/upload${query}`, { method: 'POST', body: form });
}
try {
  await test('normal multipart upload authorizes the body location after parsing', async () => {
    const response = await upload('A'); assert.equal(response.status, 201);
    assert.equal((await response.json()).locationId, 'A');
  });
  await test('cross-restaurant multipart upload is denied', async () => {
    assert.equal((await upload('B')).status, 403);
  });
  await test('missing location is rejected', async () => {
    assert.equal((await upload(null)).status, 400);
  });
  await test('authorized query location cannot save an invoice to unauthorized body location', async () => {
    const response = await upload('B', '?locationId=A'); assert.equal(response.status, 400);
  });
} finally {
  await new Promise(resolve => server.close(resolve));
  await rm(directory, { recursive: true, force: true });
}
