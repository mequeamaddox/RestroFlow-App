import type { Express } from 'express';
import { createServer, type Server } from 'http';
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

export async function registerRoutes(app: Express): Promise<Server> {
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

  const httpServer = createServer(app);
  return httpServer;
}
