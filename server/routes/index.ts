import type { Express } from 'express';
import { createServer, type Server } from 'http';
import { db } from '../db';
import { sql } from 'drizzle-orm';
import { registerAuthRoutes } from './auth';
import { registerObjectRoutes } from './objects';
import { registerAnalyticsRoutes } from './analytics';
import { registerInventoryRoutes } from './inventory';
import { registerRecipeRoutes } from './recipes';
import { registerPosRoutes } from './pos';
import { registerHRRoutes } from './hr';
import { registerDocumentRoutes } from './payroll';
import { registerBillingRoutes } from './billing';
import { registerInvoiceRoutes } from './invoices';
import { registerPlatformRoutes } from './platform';
import { registerBarRoutes } from './bar';
import { registerCsvRoutes } from './csv';
import { requireAuth } from '../clerkAuth';
import { requirePlan } from '../billingMiddleware';

// API path prefixes that require an active core subscription.
// Analytics routes carry per-route guards already; everything else is gated here.
const CORE_PLAN_PREFIXES = [
  '/api/inventory', '/api/locations', '/api/categories',
  '/api/vendors', '/api/purchase-orders', '/api/waste',
  '/api/recipes',
  '/api/hr', '/api/employees', '/api/employee-onboarding',
  '/api/timeclock', '/api/time-off-requests',
  '/api/bar',
  '/api/invoices',
  '/api/document-templates', '/api/employee-documents',
  '/api/csv',
];

export async function registerRoutes(app: Express): Promise<Server> {
  app.get('/health', async (_req, res) => {
    try {
      await db.execute(sql`SELECT 1`);
      res.json({ status: 'ok', timestamp: new Date().toISOString() });
    } catch (err) {
      res.status(503).json({ status: 'error', error: 'Database unreachable' });
    }
  });

  // Apply plan gate before route handlers so no route accidentally leaks data
  // requireAuth runs first to populate req.user, then requirePlan checks the plan
  for (const prefix of CORE_PLAN_PREFIXES) {
    app.use(prefix, requireAuth, requirePlan('core'));
  }

  registerAuthRoutes(app);
  registerObjectRoutes(app);
  registerInvoiceRoutes(app);
  registerAnalyticsRoutes(app);
  registerInventoryRoutes(app);
  registerRecipeRoutes(app);
  registerPosRoutes(app);
  registerHRRoutes(app);
  registerDocumentRoutes(app);
  registerBillingRoutes(app);
  registerPlatformRoutes(app);
  registerBarRoutes(app);
  registerCsvRoutes(app);

  const httpServer = createServer(app);
  return httpServer;
}
