import type { Express } from 'express';
import { storage } from '../storage';
import { isAuthenticated } from './helpers';
import { requireLocationAccess } from '../securityMiddleware';
import { requireAnyPermission, Permission } from '../permissions';
import { insertPosIntegrationSchema, posEmployeeMappings } from '@shared/schema';
import { posService } from '../posService';
import { cloverService } from '../cloverService';
import { db } from '../db';
import { eq } from 'drizzle-orm';

export function registerPosRoutes(app: Express): void {
  // POS Integrations
  app.get('/api/pos/integrations', isAuthenticated, requireLocationAccess(), async (req, res) => {
    try {
      const integrations = await storage.getPosIntegrations(req.query.locationId as string);
      res.json(integrations);
    } catch (error) {
      console.error('Error fetching POS integrations:', error);
      res.status(500).json({ message: 'Failed to fetch POS integrations' });
    }
  });

  app.post('/api/pos/integrations', isAuthenticated, requireLocationAccess(), async (req, res) => {
    try {
      const integration = await storage.createPosIntegration(insertPosIntegrationSchema.parse(req.body));
      res.status(201).json(integration);
    } catch (error) {
      console.error('Error creating POS integration:', error);
      res.status(500).json({ message: 'Failed to create POS integration' });
    }
  });

  app.get('/api/pos/integrations/:id/test', isAuthenticated, async (req, res) => {
    try {
      const success = await posService.testConnection(req.params.id);
      res.json({ success });
    } catch (error) {
      console.error('Error testing POS connection:', error);
      res.status(500).json({ message: 'Failed to test POS connection' });
    }
  });

  app.post('/api/pos/integrations/:id/sync', isAuthenticated, async (req, res) => {
    try {
      await posService.syncMenuItems(req.params.id);
      res.json({ message: 'Menu items synced successfully' });
    } catch (error) {
      console.error('Error syncing menu items:', error);
      res.status(500).json({ message: 'Failed to sync menu items' });
    }
  });

  app.post('/api/pos/integrations/:id/sync-sales', isAuthenticated, async (req, res) => {
    try {
      const newCount = await posService.syncHistoricalSales(req.params.id);
      res.json({ message: newCount > 0 ? `Successfully synced ${newCount} new sales` : 'All sales are already up to date (0 new sales found)', count: newCount });
    } catch (error) {
      console.error('Error syncing sales:', error);
      res.status(500).json({ message: 'Failed to sync sales data' });
    }
  });

  app.put('/api/pos/integrations/:id', isAuthenticated, async (req, res) => {
    try {
      const integration = await storage.updatePosIntegration(req.params.id, insertPosIntegrationSchema.partial().parse(req.body));
      res.json(integration);
    } catch (error) {
      console.error('Error updating POS integration:', error);
      res.status(500).json({ message: 'Failed to update POS integration' });
    }
  });

  app.delete('/api/pos/integrations/:id', isAuthenticated, async (req, res) => {
    try {
      await storage.deletePosIntegration(req.params.id);
      res.status(204).send();
    } catch (error) {
      console.error('Error deleting POS integration:', error);
      res.status(500).json({ message: 'Failed to delete POS integration' });
    }
  });

  // POS Menu Items & Recipe Mapping
  app.get('/api/pos/menu-items/unmapped', isAuthenticated, requireLocationAccess(), async (req, res) => {
    try {
      const menuItems = await storage.getUnmappedMenuItems(req.query.locationId as string);
      res.json(menuItems);
    } catch (error) {
      console.error('Error fetching unmapped menu items:', error);
      res.status(500).json({ message: 'Failed to fetch unmapped menu items' });
    }
  });

  app.put('/api/pos/menu-items/:id/recipe', isAuthenticated, async (req, res) => {
    try {
      const { recipeId, inventoryItemId } = req.body;
      if (recipeId && inventoryItemId) return res.status(400).json({ message: 'Cannot link both recipe and inventory item. Please select only one.' });
      const menuItem = await storage.updatePosMenuItemRecipe(req.params.id, recipeId, inventoryItemId);
      res.json(menuItem);
    } catch (error) {
      console.error('Error linking menu item:', error);
      res.status(500).json({ message: 'Failed to link menu item' });
    }
  });

  app.delete('/api/pos/menu-items/:id', isAuthenticated, async (req, res) => {
    try {
      await storage.deletePosMenuItem(req.params.id);
      res.json({ success: true });
    } catch (error) {
      console.error('Error deleting menu item:', error);
      res.status(500).json({ message: 'Failed to delete menu item' });
    }
  });

  app.get('/api/pos/menu-items/:id/suggested-recipes', isAuthenticated, async (req, res) => {
    try {
      const menuItems = await storage.getPosMenuItems(req.query.integrationId as string);
      const menuItem = menuItems.find((item: any) => item.id === req.params.id);
      if (!menuItem) return res.status(404).json({ message: 'Menu item not found' });
      const integration = await storage.getPosIntegration(menuItem.posIntegrationId);
      if (!integration) return res.status(404).json({ message: 'Integration not found' });
      const suggestions = await storage.getSuggestedRecipes(menuItem.name, integration.locationId);
      res.json(suggestions);
    } catch (error) {
      console.error('Error getting suggested recipes:', error);
      res.status(500).json({ message: 'Failed to get suggested recipes' });
    }
  });

  // POS Sales
  app.get('/api/pos/sales', isAuthenticated, async (req, res) => {
    try {
      const sales = await storage.getPosSales(req.query.locationId as string);
      res.json(sales);
    } catch (error) {
      console.error('Error fetching POS sales:', error);
      res.status(500).json({ message: 'Failed to fetch POS sales' });
    }
  });

  // Webhooks
  app.post('/api/pos/webhook', async (req, res) => {
    try {
      await posService.processOrderWebhook(req.body);
      res.status(200).json({ message: 'Webhook processed successfully', timestamp: new Date().toISOString() });
    } catch (error) {
      console.error('Error processing POS webhook:', error);
      res.status(500).json({ message: 'Failed to process webhook', error: error instanceof Error ? error.message : 'Unknown error' });
    }
  });

  // SpotOn webhook — enqueues immediately and returns 200 fast.
  // Set SPOTON_WEBHOOK_SECRET env var to enable HMAC-SHA256 signature verification.
  app.post('/api/webhooks/spoton', async (req, res) => {
    try {
      const sig = req.headers['x-spoton-signature'] as string | undefined;
      if (sig && process.env.SPOTON_WEBHOOK_SECRET) {
        const crypto = await import('crypto');
        const expected = `sha256=${crypto.createHmac('sha256', process.env.SPOTON_WEBHOOK_SECRET)
          .update(JSON.stringify(req.body)).digest('hex')}`;
        if (sig !== expected) return res.status(401).json({ message: 'Invalid webhook signature' });
      }

      const locationId = req.body.location_id ?? req.body.locationId;
      if (!locationId) return res.status(400).json({ message: 'Missing location_id in payload' });

      const integration = await storage.getPosIntegrationByMerchant(locationId, 'spoton');
      if (!integration) return res.status(404).json({ message: 'No active SpotOn integration for this location' });

      const eventId = req.body.eventId ?? req.body.id ?? `${locationId}:${req.body.type ?? 'event'}:${Date.now()}`;
      await posService.enqueueSpotOnWebhook(integration.id, req.body, eventId);

      res.status(200).json({ received: true });
    } catch (error) {
      console.error('SpotOn webhook error:', error);
      res.status(500).json({ message: 'Webhook processing failed' });
    }
  });

  app.post('/api/webhooks/clover', async (req, res) => {
    try {
      await posService.processOrderWebhook(req.body);
      res.status(200).json({ message: 'Clover webhook processed successfully', eventType: req.body.eventType, timestamp: new Date().toISOString() });
    } catch (error) {
      console.error('Error processing Clover webhook:', error);
      res.status(500).json({ message: 'Failed to process Clover webhook', error: error instanceof Error ? error.message : 'Unknown error' });
    }
  });

  app.get('/api/pos/webhook-status', isAuthenticated, async (req, res) => {
    try {
      const integrations = await storage.getPosIntegrations();
      res.json(integrations.map((integration: any) => ({
        id: integration.id, provider: integration.provider, name: integration.name,
        isActive: integration.isActive, lastSyncAt: integration.lastSyncAt,
        webhookUrl: `${req.protocol}://${req.get('host')}/api/webhooks/${integration.provider}`,
        status: integration.isActive ? 'active' : 'inactive',
      })));
    } catch (error) {
      console.error('Error fetching webhook status:', error);
      res.status(500).json({ message: 'Failed to fetch webhook status' });
    }
  });

  // POS Employees
  app.get('/api/pos-employees/:integrationId', isAuthenticated, async (req, res) => {
    try {
      const employees = await storage.getPosEmployees(req.params.integrationId);
      const employeesWithMappings = await Promise.all(employees.map(async (emp: any) => {
        const [mapping] = await db.select().from(posEmployeeMappings).where(eq(posEmployeeMappings.posEmployeeId, emp.id)).limit(1);
        return { ...emp, mapping: mapping ? { employeeId: mapping.employeeId, status: mapping.status } : null };
      }));
      res.json(employeesWithMappings);
    } catch (error) {
      console.error('Error fetching POS employees:', error);
      res.status(500).json({ message: 'Failed to fetch employees' });
    }
  });

  app.get('/api/pos-employees/unlinked/:locationId', isAuthenticated, async (req, res) => {
    try {
      const employees = await storage.getUnlinkedPosEmployees(req.params.locationId);
      res.json(employees);
    } catch (error) {
      console.error('Error fetching unlinked POS employees:', error);
      res.status(500).json({ message: 'Failed to fetch unlinked employees' });
    }
  });

  app.post('/api/pos-employees/import/:posEmployeeId', isAuthenticated, requireAnyPermission([Permission.MANAGE_EMPLOYEES]), async (req, res) => {
    try {
      const posEmployee = await storage.getPosEmployee(req.params.posEmployeeId);
      if (!posEmployee) return res.status(404).json({ message: 'POS employee not found' });

      const existingMapping = await db.select().from(posEmployeeMappings).where(eq(posEmployeeMappings.posEmployeeId, posEmployee.id)).limit(1);
      if (existingMapping.length > 0) {
        const existingEmployee = await storage.getEmployee(existingMapping[0].employeeId);
        return res.json({ message: 'Employee already imported', employee: existingEmployee });
      }

      const nameParts = (posEmployee.displayName || '').trim().split(/\s+/);
      const firstName = posEmployee.firstName || nameParts[0] || 'Unknown';
      const lastName = posEmployee.lastName || nameParts.slice(1).join(' ') || '';

      const hrEmployee = await storage.createEmployee({
        firstName, lastName, email: posEmployee.email || '', phone: '', status: 'active',
        hireDate: new Date().toISOString().split('T')[0],
        departmentId: req.body.departmentId || null, positionId: req.body.positionId || null,
      });

      await db.insert(posEmployeeMappings).values({ posEmployeeId: posEmployee.id, employeeId: hrEmployee.id, status: 'manual', confidence: '1.00', matchRule: 'Manual import from POS Integration' });
      res.json({ message: 'Employee imported successfully', employee: hrEmployee });
    } catch (error) {
      console.error('Error importing POS employee:', error);
      res.status(500).json({ message: 'Failed to import employee', error: error instanceof Error ? error.message : 'Unknown error' });
    }
  });

  app.post('/api/pos-employees/sync/:integrationId', isAuthenticated, async (req, res) => {
    try {
      const integration = await storage.getPosIntegration(req.params.integrationId);
      if (!integration) return res.status(404).json({ message: 'Integration not found' });

      let syncedCount = 0;
      if (integration.provider === 'clover') {
        syncedCount = await cloverService.syncEmployees(req.params.integrationId);
      } else {
        return res.status(400).json({ message: `Employee sync not supported for provider: ${integration.provider}` });
      }

      const unlinkedEmployees = await storage.getUnlinkedPosEmployees(integration.locationId);
      let autoCreatedCount = 0;
      for (const posEmployee of unlinkedEmployees) {
        try {
          const nameParts = (posEmployee.displayName || '').trim().split(/\s+/);
          const firstName = posEmployee.firstName || nameParts[0] || 'Unknown';
          const lastName = posEmployee.lastName || nameParts.slice(1).join(' ') || '';
          const hrEmployee = await storage.createEmployee({ firstName, lastName, email: posEmployee.email || null, phone: '', status: 'active', hireDate: new Date().toISOString().split('T')[0], departmentId: null, positionId: null });
          await db.insert(posEmployeeMappings).values({ posEmployeeId: posEmployee.id, employeeId: hrEmployee.id, status: 'auto', confidence: '1.00', matchRule: 'Auto-imported during POS sync' });
          autoCreatedCount++;
        } catch (e) { console.error(`Failed to auto-create HR employee for POS employee ${posEmployee.id}:`, e); }
      }

      res.json({ message: `Successfully synced ${syncedCount} employees and auto-imported ${autoCreatedCount} to HR system`, syncedCount, autoCreatedCount });
    } catch (error) {
      console.error('Error syncing employees:', error);
      res.status(500).json({ message: 'Failed to sync employees', error: error instanceof Error ? error.message : 'Unknown error' });
    }
  });

  app.post('/api/pos-employees/sync-shifts/:integrationId', isAuthenticated, async (req, res) => {
    try {
      const { daysBack = 7 } = req.body;
      const integration = await storage.getPosIntegration(req.params.integrationId);
      if (!integration) return res.status(404).json({ message: 'Integration not found' });
      let syncedCount = 0;
      if (integration.provider === 'clover') {
        syncedCount = await cloverService.syncShifts(req.params.integrationId, daysBack);
      } else {
        return res.status(400).json({ message: `Shift sync not supported for provider: ${integration.provider}` });
      }
      res.json({ message: `Successfully synced ${syncedCount} shifts from the last ${daysBack} days`, syncedCount, daysBack });
    } catch (error) {
      console.error('Error syncing shifts:', error);
      res.status(500).json({ message: 'Failed to sync shifts', error: error instanceof Error ? error.message : 'Unknown error' });
    }
  });
}
