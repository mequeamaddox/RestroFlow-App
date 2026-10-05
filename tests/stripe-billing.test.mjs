import test from 'node:test';
import assert from 'node:assert/strict';
import { build } from 'esbuild';
import { mkdtemp, rm, symlink } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
const dir = await mkdtemp(join(tmpdir(), 'restro-billing-'));
const calls = [];
const lockTails = new Map();
globalThis.__billingPool = { connect: async () => {
  let unlock;
  return { query: async (sql, [key]) => {
    if (sql.includes('pg_advisory_lock(')) {
      const prev = lockTails.get(key) || Promise.resolve();
      const next = new Promise(resolve => { unlock = resolve; });
      lockTails.set(key, next); await prev;
    } else unlock?.();
  }, release() {} };
} };
globalThis.__stripeMock = { checkout: { sessions: { create: async (params, options) => {
  calls.push({ params, options }); return { url: 'https://checkout.stripe.test/session' };
} } } };
process.env.STRIPE_SECRET_KEY = 'sk_test_placeholder';
process.env.STRIPE_PRICE_CORE = 'price_core';
await build({ stdin: { contents: `export * from './server/stripeService'; export * from './server/billingLock'; export { registerBillingRoutes } from './server/routes/billing';`, resolveDir: process.cwd() }, outfile: join(dir, 'billing.mjs'), bundle: true, platform: 'node', format: 'esm', packages: 'external', plugins: [{ name: 'billing-stubs', setup(b) {
  b.onResolve({ filter: /^\.\/db$/ }, () => ({ path: 'db', namespace: 'stub' }));
  b.onResolve({ filter: /^\.\.\/(storage|securityMiddleware|email|transactionalEmails)$|^\.\/helpers$/ }, args => ({ path: args.path, namespace: 'routes-stub' }));
  b.onLoad({ filter: /.*/, namespace: 'routes-stub' }, args => ({ contents: args.path === '../storage' ? 'export const storage = globalThis.__billingStorage;' : args.path === './helpers' ? 'export const isAuthenticated = (_req,_res,next) => next(); export const calculateSubscriptionTotal = () => 179;' : args.path === '../securityMiddleware' ? 'export const requireLocationAccess = () => (_req,_res,next) => next();' : 'export const sendEmail = async () => {}; export const sendWelcomeEmail = async () => {}; export const sendInvoiceReceiptEmail = async () => {};', loader: 'js' }));
  b.onResolve({ filter: /^stripe$/ }, () => ({ path: 'stripe', namespace: 'stub' }));
  b.onLoad({ filter: /.*/, namespace: 'stub' }, args => ({ contents: args.path === 'db' ? 'export const pool = globalThis.__billingPool;' : 'export default class Stripe { constructor() { return globalThis.__stripeMock; } }', loader: 'js' }));
} }] });
await symlink(join(process.cwd(), 'node_modules'), join(dir, 'node_modules'));
globalThis.__billingStorage = {};
const billing = await import(pathToFileURL(join(dir, 'billing.mjs')).href);
const handlers = {};
billing.registerBillingRoutes({ get() {}, put() {}, post(path, ...middleware) { handlers[path] = middleware.at(-1); } });
const response = () => ({ code: 200, status(code) { this.code = code; return this; }, json(body) { this.body = body; return this; } });
try {
  await test('failed event remains retryable and successful duplicate is skipped', async () => {
    let processed = false, attempts = 0;
    const run = () => billing.processBillingEvent('evt_retry', async () => processed, async () => { if (++attempts === 1) throw new Error('DB failed'); }, async () => { processed = true; });
    await assert.rejects(run(), /DB failed/); assert.equal(processed, false);
    await run(); await run(); assert.equal(attempts, 2); assert.equal(processed, true);
  });
  await test('simultaneous event deliveries execute durable updates once', async () => {
    let processed = false, attempts = 0;
    const run = () => billing.processBillingEvent('evt_concurrent', async () => processed, async () => { attempts++; await Promise.resolve(); }, async () => { processed = true; });
    await Promise.all([run(), run(), run()]); assert.equal(attempts, 1);
  });
  await test('unpaid and paused subscriptions lose access while past_due retains recovery access', () => {
    assert.equal(billing.mapStripeStatusToPlan('unpaid'), 'inactive');
    assert.equal(billing.mapStripeStatusToPlan('paused'), 'inactive');
    assert.equal(billing.mapStripeStatusToPlan('past_due'), 'past_due');
    assert.equal(billing.mapStripeStatusToPlan('canceled'), 'cancelled');
  });
  await test('Basil item periods and invoice parent select the correct subscription', () => {
    assert.equal(billing.subscriptionPeriodEnd({ items: { data: [{ current_period_end: 200 }, { current_period_end: 100 }] } }).getTime(), 100000);
    assert.equal(billing.invoiceSubscriptionId({ parent: { subscription_details: { subscription: 'sub_exact' } } }), 'sub_exact');
    assert.equal(billing.invoiceSubscriptionId({ parent: null }), undefined);
  });
  await test('checkout collects address, supports tax and add-ons, uses flexible billing and no default trial', async () => {
    process.env.STRIPE_AUTOMATIC_TAX = 'true';
    await billing.createCheckoutSession({ userId: 'owner', email: 'owner@example.com', plan: 'core', stripeCustomerId: 'cus_owner', successUrl: 'https://example.com/success', cancelUrl: 'https://example.com/cancel', addonItems: [{ price: 'price_hr', quantity: 2 }] });
    const { params, options } = calls.at(-1);
    assert.deepEqual(params.line_items, [{ price: 'price_core', quantity: 1 }, { price: 'price_hr', quantity: 2 }]);
    assert.equal(params.automatic_tax.enabled, true); assert.equal(params.billing_address_collection, 'required');
    assert.equal(params.subscription_data.billing_mode.type, 'flexible');
    assert.equal(params.subscription_data.trial_period_days, undefined);
    assert.equal(params.customer, 'cus_owner'); assert.equal(params.customer_email, undefined);
    assert.ok(options.idempotencyKey.startsWith('checkout:owner:'));
    process.env.STRIPE_AUTOMATIC_TAX = 'false';
  });
  await test('existing live subscription prevents another checkout charge', async () => {
    Object.assign(globalThis.__billingStorage, {
      getUser: async () => ({ id: 'owner', email: 'owner@example.com', role: 'owner', stripeCustomerId: 'cus_owner' }),
      getPlatformSetting: async () => null,
    });
    globalThis.__stripeMock.subscriptions = { list: async () => ({ data: [{ id: 'sub_existing', status: 'active' }] }) };
    const res = response(), count = calls.length;
    await handlers['/api/billing/checkout']({ user: { id: 'owner' }, body: { plan: 'core' } }, res);
    assert.match(res.body.message, /already have a subscription/); assert.equal(calls.length, count);
  });
  await test('repeated checkout reuses open session and staff cannot enter portal', async () => {
    globalThis.__stripeMock.subscriptions.list = async () => ({ data: [] });
    globalThis.__stripeMock.checkout.sessions.list = async () => ({ data: [{ mode: 'subscription', metadata: { userId: 'owner' }, url: 'https://checkout.stripe.test/open' }] });
    const res = response(), count = calls.length;
    await handlers['/api/billing/checkout']({ user: { id: 'owner' }, body: { plan: 'core' } }, res);
    assert.equal(res.body.checkoutUrl, 'https://checkout.stripe.test/open'); assert.equal(calls.length, count);
    globalThis.__billingStorage.getUser = async () => ({ id: 'staff', role: 'employee', stripeCustomerId: 'cus_owner' });
    const staff = response(); await handlers['/api/billing/portal']({ user: { id: 'staff' } }, staff); assert.equal(staff.code, 403);
  });
} finally { delete globalThis.__billingPool; delete globalThis.__stripeMock; delete globalThis.__billingStorage; await rm(dir, { recursive: true, force: true }); }
