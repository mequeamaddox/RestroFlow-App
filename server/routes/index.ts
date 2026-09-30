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

export async function registerRoutes(app: Express): Promise<Server> {
  app.get('/health', async (_req, res) => {
    try {
      await db.execute(sql`SELECT 1`);
      res.json({ status: 'ok', timestamp: new Date().toISOString() });
    } catch (err) {
      res.status(503).json({ status: 'error', error: 'Database unreachable' });
    }
  });

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

  const httpServer = createServer(app);
  return httpServer;
}
