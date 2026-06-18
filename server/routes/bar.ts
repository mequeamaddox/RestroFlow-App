import type { Express } from 'express';
import { db } from '../db';
import { eq, and, desc, gte, sql } from 'drizzle-orm';
import {
  barInventoryCounts,
  barInventoryCountItems,
  barWasteLog,
  inventoryItems,
  menuItems,
  menuItemIngredients,
} from '../../shared/schema';
import { isAuthenticated, requireBarAccess } from './helpers';

export function registerBarRoutes(app: Express) {
  // ── Pour Cost Summary (dashboard) ─────────────────────────────────────────

  app.get('/api/bar/pour-cost-summary', isAuthenticated, requireBarAccess, async (req: any, res) => {
    const locationId = req.query.locationId as string;
    try {
      // All menu items with their ingredients for this location
      const items = await db
        .select()
        .from(menuItems)
        .where(and(eq(menuItems.locationId, locationId), eq(menuItems.isActive, true)));

      const ingredients = await db
        .select({
          menuItemId: menuItemIngredients.menuItemId,
          quantity: menuItemIngredients.quantity,
          unit: menuItemIngredients.unit,
          itemName: inventoryItems.name,
          pricePerOz: inventoryItems.pricePerOz,
          costPerUnit: inventoryItems.costPerUnit,
        })
        .from(menuItemIngredients)
        .leftJoin(inventoryItems, eq(menuItemIngredients.inventoryItemId, inventoryItems.id))
        .where(
          sql`${menuItemIngredients.menuItemId} IN (SELECT id FROM menu_items WHERE location_id = ${locationId})`
        );

      const ingredientsByItem = ingredients.reduce<Record<string, typeof ingredients>>((acc, ing) => {
        const key = ing.menuItemId!;
        if (!acc[key]) acc[key] = [];
        acc[key].push(ing);
        return acc;
      }, {});

      const itemsWithCost = items.map(item => {
        const ings = ingredientsByItem[item.id] || [];
        const totalCost = ings.reduce((sum, ing) => {
          const qty = parseFloat(ing.quantity as string) || 0;
          const costPerOz = parseFloat(ing.pricePerOz as string) || parseFloat(ing.costPerUnit as string) || 0;
          return sum + qty * costPerOz;
        }, 0);
        const price = parseFloat(item.price as string) || 0;
        const pourCostPct = price > 0 ? (totalCost / price) * 100 : 0;
        return { ...item, totalCost, pourCostPct, ingredientCount: ings.length };
      });

      // Waste log totals for last 7 days
      const sevenDaysAgo = new Date();
      sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);

      const recentWaste = await db
        .select()
        .from(barWasteLog)
        .where(and(eq(barWasteLog.locationId, locationId), gte(barWasteLog.logDate, sevenDaysAgo)));

      const wasteTotalCost = recentWaste.reduce((sum, e) => sum + (parseFloat(e.cost as string) || 0), 0);
      const wasteByReason = recentWaste.reduce<Record<string, { count: number; cost: number }>>((acc, e) => {
        if (!acc[e.reason]) acc[e.reason] = { count: 0, cost: 0 };
        acc[e.reason].count++;
        acc[e.reason].cost += parseFloat(e.cost as string) || 0;
        return acc;
      }, {});

      // Last 2 counts for variance
      const lastCounts = await db
        .select()
        .from(barInventoryCounts)
        .where(and(eq(barInventoryCounts.locationId, locationId), eq(barInventoryCounts.status, 'complete')))
        .orderBy(desc(barInventoryCounts.countDate))
        .limit(2);

      res.json({
        menuItems: itemsWithCost,
        avgPourCostPct: itemsWithCost.length > 0
          ? itemsWithCost.reduce((s, i) => s + i.pourCostPct, 0) / itemsWithCost.length
          : 0,
        wasteLast7Days: { totalCost: wasteTotalCost, entryCount: recentWaste.length, byReason: wasteByReason },
        lastCounts,
      });
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  // ── Bar Inventory Counts ───────────────────────────────────────────────────

  app.get('/api/bar/inventory-counts', isAuthenticated, requireBarAccess, async (req: any, res) => {
    const locationId = req.query.locationId as string;
    try {
      const counts = await db
        .select()
        .from(barInventoryCounts)
        .where(eq(barInventoryCounts.locationId, locationId))
        .orderBy(desc(barInventoryCounts.createdAt))
        .limit(50);
      res.json(counts);
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  app.post('/api/bar/inventory-counts', isAuthenticated, requireBarAccess, async (req: any, res) => {
    const { locationId, shift, notes, items } = req.body;
    const userId = req.user?.id || req.user?.claims?.sub || 'unknown';
    try {
      const [count] = await db.insert(barInventoryCounts).values({
        locationId,
        countedBy: userId,
        countDate: new Date().toISOString().split('T')[0],
        shift: shift || 'end_of_day',
        notes,
        status: 'complete',
      }).returning();

      if (items && items.length > 0) {
        await db.insert(barInventoryCountItems).values(
          items.map((item: any) => ({
            countId: count.id,
            inventoryItemId: item.inventoryItemId,
            fillLevel: String(item.fillLevel ?? 1),
            quantityMl: item.quantityMl ? String(item.quantityMl) : null,
            unitCost: item.unitCost ? String(item.unitCost) : null,
            notes: item.notes,
          }))
        );
      }

      res.json(count);
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  app.get('/api/bar/inventory-counts/:id', isAuthenticated, requireBarAccess, async (req: any, res) => {
    const { id } = req.params;
    try {
      const [count] = await db.select().from(barInventoryCounts).where(eq(barInventoryCounts.id, id));
      if (!count) return res.status(404).json({ message: 'Count not found' });

      const countItems = await db
        .select({
          id: barInventoryCountItems.id,
          inventoryItemId: barInventoryCountItems.inventoryItemId,
          fillLevel: barInventoryCountItems.fillLevel,
          quantityMl: barInventoryCountItems.quantityMl,
          unitCost: barInventoryCountItems.unitCost,
          notes: barInventoryCountItems.notes,
          itemName: inventoryItems.name,
          bottleSize: inventoryItems.bottleSize,
          unit: inventoryItems.unit,
          costPerUnit: inventoryItems.costPerUnit,
        })
        .from(barInventoryCountItems)
        .leftJoin(inventoryItems, eq(barInventoryCountItems.inventoryItemId, inventoryItems.id))
        .where(eq(barInventoryCountItems.countId, id));

      res.json({ ...count, items: countItems });
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  // ── Bar Waste Log ──────────────────────────────────────────────────────────

  app.get('/api/bar/waste-log', isAuthenticated, requireBarAccess, async (req: any, res) => {
    const locationId = req.query.locationId as string;
    const days = parseInt(req.query.days as string) || 30;
    try {
      const since = new Date();
      since.setDate(since.getDate() - days);
      const entries = await db
        .select()
        .from(barWasteLog)
        .where(and(eq(barWasteLog.locationId, locationId), gte(barWasteLog.logDate, since)))
        .orderBy(desc(barWasteLog.logDate))
        .limit(200);
      res.json(entries);
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  app.post('/api/bar/waste-log', isAuthenticated, requireBarAccess, async (req: any, res) => {
    const { locationId, inventoryItemId, menuItemId, itemName, quantity, unit, cost, reason, notes, shift } = req.body;
    const userId = req.user?.id || req.user?.claims?.sub || 'unknown';
    if (!itemName || !quantity || !reason) {
      return res.status(400).json({ message: 'itemName, quantity, and reason are required' });
    }
    try {
      const [entry] = await db.insert(barWasteLog).values({
        locationId,
        inventoryItemId: inventoryItemId || null,
        menuItemId: menuItemId || null,
        itemName,
        quantity: String(quantity),
        unit: unit || 'oz',
        cost: cost ? String(cost) : null,
        reason,
        notes,
        loggedBy: userId,
        logDate: new Date(),
        shift,
      }).returning();
      res.json(entry);
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  app.delete('/api/bar/waste-log/:id', isAuthenticated, async (req: any, res) => {
    const { id } = req.params;
    const userId = req.user?.id || req.user?.claims?.sub;
    try {
      const [entry] = await db.select().from(barWasteLog).where(eq(barWasteLog.id, id));
      if (!entry) return res.status(404).json({ message: 'Entry not found' });
      if (entry.loggedBy !== userId && req.user?.role !== 'owner' && req.user?.role !== 'platform_admin') {
        return res.status(403).json({ message: 'Not authorized' });
      }
      await db.delete(barWasteLog).where(eq(barWasteLog.id, id));
      res.json({ success: true });
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  // ── Bartender Build Sheets (employee-facing cocktail recipes) ─────────────

  app.get('/api/bar/build-sheets', isAuthenticated, async (req: any, res) => {
    const locationId = req.query.locationId as string;
    if (!locationId) return res.status(400).json({ message: 'locationId required' });
    try {
      const items = await db
        .select()
        .from(menuItems)
        .where(and(eq(menuItems.locationId, locationId), eq(menuItems.isActive, true)));

      const ingredients = await db
        .select({
          menuItemId: menuItemIngredients.menuItemId,
          quantity: menuItemIngredients.quantity,
          unit: menuItemIngredients.unit,
          itemName: inventoryItems.name,
          displayName: inventoryItems.displayName,
        })
        .from(menuItemIngredients)
        .leftJoin(inventoryItems, eq(menuItemIngredients.inventoryItemId, inventoryItems.id))
        .where(
          sql`${menuItemIngredients.menuItemId} IN (SELECT id FROM menu_items WHERE location_id = ${locationId} AND is_active = true)`
        );

      const byItem = ingredients.reduce<Record<string, typeof ingredients>>((acc, ing) => {
        const key = ing.menuItemId!;
        if (!acc[key]) acc[key] = [];
        acc[key].push(ing);
        return acc;
      }, {});

      const sheets = items.map(item => ({ ...item, ingredients: byItem[item.id] || [] }));
      res.json(sheets);
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });
}
