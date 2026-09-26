import type { Express } from 'express';
import { isAuthenticated, requirePlatformAdmin } from './helpers';
import { storage } from '../storage';
import { db } from '../db';
import { sql, eq } from 'drizzle-orm';
import {
  locations, vendors, inventoryItems, invoiceProcessing, sales, salesItems, budgets,
} from '@shared/schema';

export function registerPlatformRoutes(app: Express): void {
  // All platform routes require platform_admin

  app.get('/api/platform/settings', isAuthenticated, requirePlatformAdmin, async (_req, res) => {
    try {
      const settings = await storage.getAllPlatformSettings();
      // Merge with env-var status so the UI knows what's configured
      res.json({
        settings,
        env: {
          stripeConfigured: !!process.env.STRIPE_SECRET_KEY,
          stripePriceCoreEnv: process.env.STRIPE_PRICE_CORE ? 'set' : 'not set',
          clerkConfigured: !!process.env.CLERK_SECRET_KEY,
          encryptionConfigured: !!process.env.PII_ENCRYPTION_KEY,
          sentryConfigured: !!process.env.SENTRY_DSN,
        },
      });
    } catch (error) {
      console.error('Error fetching platform settings:', error);
      res.status(500).json({ message: 'Failed to fetch platform settings' });
    }
  });

  app.put('/api/platform/settings/:key', isAuthenticated, requirePlatformAdmin, async (req: any, res) => {
    try {
      const { key } = req.params;
      const { value, description } = req.body;
      if (value === undefined) return res.status(400).json({ message: 'value is required' });
      // Block storing actual secret keys in the DB
      const blockedKeys = ['stripe_secret_key', 'clerk_secret_key', 'pii_encryption_key', 'stripe_webhook_secret'];
      if (blockedKeys.includes(key.toLowerCase())) {
        return res.status(400).json({ message: 'Secret keys must be stored as environment variables, not in the database.' });
      }
      await storage.setPlatformSetting(key, String(value), req.user.id, description);
      res.json({ success: true, key, value });
    } catch (error) {
      console.error('Error updating platform setting:', error);
      res.status(500).json({ message: 'Failed to update setting' });
    }
  });

  app.get('/api/platform/users', isAuthenticated, requirePlatformAdmin, async (_req, res) => {
    try {
      const allUsers = await storage.getAllUsers();
      res.json(allUsers);
    } catch (error) {
      console.error('Error fetching users:', error);
      res.status(500).json({ message: 'Failed to fetch users' });
    }
  });

  // Demo data seed — creates a realistic restaurant dataset under the calling admin's account
  app.post('/api/platform/seed-demo', isAuthenticated, requirePlatformAdmin, async (req: any, res) => {
    try {
      const userId = req.user.id;

      // Idempotency — don't double-seed
      const existing = await db.select().from(locations)
        .where(eq(locations.name, 'Riverside Grill'))
        .limit(1);
      if (existing.length > 0) {
        return res.status(409).json({ message: 'Demo data already exists. Delete "Riverside Grill" to re-seed.' });
      }

      // ── Location ──────────────────────────────────────────────────────────
      const [loc] = await db.insert(locations).values({
        name: 'Riverside Grill',
        type: 'full_service',
        address: '123 River Road, Nashville, TN 37201',
        phone: '(615) 555-0142',
        manager: 'Demo Manager',
        isActive: true,
        hrAddonEnabled: false,
        barAddonEnabled: false,
        ownerId: userId,
      }).returning();
      const locationId = loc.id;

      // ── Vendors ───────────────────────────────────────────────────────────
      const [sysco] = await db.insert(vendors).values({
        name: 'Sysco Nashville',
        contactPerson: 'Mark Thompson',
        email: 'mthompson@sysco.com',
        phone: '(615) 555-0200',
        address: '500 Distribution Way, Nashville, TN 37204',
        locationId,
      }).returning();

      const [freshFarms] = await db.insert(vendors).values({
        name: 'Local Fresh Farms',
        contactPerson: 'Sarah Chen',
        email: 'sarah@localfreshfarms.com',
        phone: '(615) 555-0301',
        address: '88 Farm Road, Franklin, TN 37064',
        locationId,
      }).returning();

      const [tnBeverage] = await db.insert(vendors).values({
        name: 'Tennessee Beverage Distributors',
        contactPerson: 'James Polk',
        email: 'jpolk@tnbev.com',
        phone: '(615) 555-0450',
        address: '1800 Commerce St, Nashville, TN 37203',
        locationId,
      }).returning();

      // ── Inventory ─────────────────────────────────────────────────────────
      const inventoryData = [
        { name: 'Chicken Breast', purchaseUnit: 'case', recipeUnit: 'lb', conversionFactor: '40', costPerPurchaseUnit: '89.50', quantity: '8', reorderLevel: '3', vendorId: sysco.id },
        { name: 'Ground Beef 80/20', purchaseUnit: 'case', recipeUnit: 'lb', conversionFactor: '40', costPerPurchaseUnit: '104.00', quantity: '6', reorderLevel: '2', vendorId: sysco.id },
        { name: 'Atlantic Salmon', purchaseUnit: 'case', recipeUnit: 'lb', conversionFactor: '12', costPerPurchaseUnit: '114.00', quantity: '3', reorderLevel: '2', vendorId: sysco.id },
        { name: 'French Fries Crinkle Cut', purchaseUnit: 'case', recipeUnit: 'lb', conversionFactor: '30', costPerPurchaseUnit: '28.00', quantity: '10', reorderLevel: '4', vendorId: sysco.id },
        { name: 'Romaine Lettuce', purchaseUnit: 'case', recipeUnit: 'head', conversionFactor: '24', costPerPurchaseUnit: '22.00', quantity: '5', reorderLevel: '2', vendorId: freshFarms.id },
        { name: 'Cherry Tomatoes', purchaseUnit: 'case', recipeUnit: 'lb', conversionFactor: '10', costPerPurchaseUnit: '18.50', quantity: '6', reorderLevel: '3', vendorId: freshFarms.id },
        { name: 'Cheddar Cheese Shredded', purchaseUnit: 'bag', recipeUnit: 'lb', conversionFactor: '5', costPerPurchaseUnit: '24.00', quantity: '8', reorderLevel: '4', vendorId: sysco.id },
        { name: 'Jack Daniel\'s Bourbon', purchaseUnit: 'bottle', recipeUnit: 'oz', conversionFactor: '59.2', costPerPurchaseUnit: '28.00', quantity: '12', reorderLevel: '6', vendorId: tnBeverage.id, isAlcoholic: true },
        { name: 'Draft Beer Keg', purchaseUnit: 'keg', recipeUnit: 'oz', conversionFactor: '1984', costPerPurchaseUnit: '145.00', quantity: '4', reorderLevel: '2', vendorId: tnBeverage.id, isAlcoholic: true },
        { name: 'House Red Wine', purchaseUnit: 'bottle', recipeUnit: 'oz', conversionFactor: '25.4', costPerPurchaseUnit: '12.00', quantity: '24', reorderLevel: '12', vendorId: tnBeverage.id, isAlcoholic: true },
        { name: 'Canola Oil', purchaseUnit: 'case', recipeUnit: 'gal', conversionFactor: '6', costPerPurchaseUnit: '38.00', quantity: '4', reorderLevel: '2', vendorId: sysco.id },
        { name: 'Pasta Penne', purchaseUnit: 'case', recipeUnit: 'lb', conversionFactor: '20', costPerPurchaseUnit: '21.00', quantity: '5', reorderLevel: '2', vendorId: sysco.id },
      ];
      await db.insert(inventoryItems).values(
        inventoryData.map(item => ({
          ...item,
          locationId,
          costPerUnit: item.costPerPurchaseUnit,
          unit: item.recipeUnit,
          isAlcoholic: item.isAlcoholic ?? false,
        }))
      );

      // ── Invoices ──────────────────────────────────────────────────────────
      const now = new Date();
      const daysAgo = (n: number) => new Date(now.getTime() - n * 86400000);

      await db.insert(invoiceProcessing).values([
        {
          vendorId: sysco.id,
          locationId,
          invoiceNumber: 'SYS-2024-0891',
          invoiceDate: daysAgo(21),
          subtotal: '1693.58',
          tax: '146.42',
          total: '1840.00',
          status: 'paid',
          paymentMethod: 'ach',
          paymentDate: daysAgo(14),
          uploadMethod: 'upload',
          ocrConfidence: 97,
          lineItems: [
            { description: 'Chicken Breast 40lb case x8', amount: 716.00 },
            { description: 'Ground Beef 80/20 40lb case x6', amount: 624.00 },
            { description: 'Canola Oil 6gal case x4', amount: 152.00 },
            { description: 'Pasta Penne 20lb case x5', amount: 105.00 },
            { description: 'Cheddar Cheese 5lb bag x8', amount: 96.58 },
          ],
          processedAt: daysAgo(21),
        },
        {
          vendorId: freshFarms.id,
          locationId,
          invoiceNumber: 'LFF-2024-0312',
          invoiceDate: daysAgo(14),
          subtotal: '313.58',
          tax: '26.42',
          total: '340.00',
          status: 'paid',
          paymentMethod: 'check',
          paymentDate: daysAgo(7),
          uploadMethod: 'photo',
          ocrConfidence: 91,
          lineItems: [
            { description: 'Romaine Lettuce 24ct case x5', amount: 110.00 },
            { description: 'Cherry Tomatoes 10lb case x6', amount: 111.00 },
            { description: 'Mixed Herbs (misc)', amount: 92.58 },
          ],
          processedAt: daysAgo(14),
        },
        {
          vendorId: tnBeverage.id,
          locationId,
          invoiceNumber: 'TNBEV-2024-0554',
          invoiceDate: daysAgo(7),
          subtotal: '570.37',
          tax: '49.63',
          total: '620.00',
          status: 'approved',
          uploadMethod: 'upload',
          ocrConfidence: 99,
          lineItems: [
            { description: 'Jack Daniel\'s 1.75L x12', amount: 336.00 },
            { description: 'Draft Beer 1/2 Keg x1', amount: 145.00 },
            { description: 'House Red Wine 1.5L x8', amount: 96.00 },
          ],
          processedAt: daysAgo(7),
        },
        {
          vendorId: sysco.id,
          locationId,
          invoiceNumber: 'SYS-2024-0944',
          invoiceDate: daysAgo(2),
          subtotal: '1929.00',
          tax: '171.00',
          total: '2100.00',
          status: 'pending',
          uploadMethod: 'email',
          ocrConfidence: 88,
          lineItems: [
            { description: 'Chicken Breast 40lb case x10', amount: 895.00 },
            { description: 'Atlantic Salmon 12lb case x5', amount: 570.00 },
            { description: 'French Fries 30lb case x8', amount: 224.00 },
            { description: 'Misc dry goods', amount: 240.00 },
          ],
          processedAt: daysAgo(2),
        },
      ]);

      // ── Sales — last 30 days ──────────────────────────────────────────────
      // Mon-Thu ~$2,800, Fri-Sat ~$4,200, Sun ~$3,100
      const dayRevenue: Record<number, number> = { 0: 3100, 1: 2800, 2: 2750, 3: 2900, 4: 3100, 5: 4200, 6: 4100 };
      for (let d = 30; d >= 1; d--) {
        const saleDate = daysAgo(d);
        const dow = saleDate.getDay();
        const base = dayRevenue[dow];
        const jitter = (Math.random() * 0.18 - 0.09); // ±9%
        const total = parseFloat((base * (1 + jitter)).toFixed(2));
        const customerCount = Math.round(total / 28);
        const [sale] = await db.insert(sales).values({
          locationId,
          saleDate,
          totalAmount: total.toString(),
          customerCount,
          paymentMethod: 'mixed',
          createdAt: saleDate,
          updatedAt: saleDate,
        }).returning();
        // Representative line items for one average table
        await db.insert(salesItems).values([
          { saleId: sale.id, itemName: 'Grilled Chicken', quantity: Math.round(customerCount * 0.3), unitPrice: '18.00', totalPrice: (Math.round(customerCount * 0.3) * 18).toFixed(2) },
          { saleId: sale.id, itemName: 'Burger & Fries', quantity: Math.round(customerCount * 0.25), unitPrice: '16.00', totalPrice: (Math.round(customerCount * 0.25) * 16).toFixed(2) },
          { saleId: sale.id, itemName: 'Salmon Entrée', quantity: Math.round(customerCount * 0.15), unitPrice: '26.00', totalPrice: (Math.round(customerCount * 0.15) * 26).toFixed(2) },
          { saleId: sale.id, itemName: 'Drinks & Beverages', quantity: Math.round(customerCount * 0.8), unitPrice: '9.00', totalPrice: (Math.round(customerCount * 0.8) * 9).toFixed(2) },
        ]);
      }

      // ── Budgets — current month ───────────────────────────────────────────
      const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
      const monthEnd = new Date(now.getFullYear(), now.getMonth() + 1, 0);
      const budgetRows = [
        { category: 'food',        budgetAmount: '12000.00', actualAmount: '10420.00' },
        { category: 'beverage',    budgetAmount: '4500.00',  actualAmount: '3820.00'  },
        { category: 'labor',       budgetAmount: '18000.00', actualAmount: '17240.00' },
        { category: 'utilities',   budgetAmount: '2200.00',  actualAmount: '2050.00'  },
        { category: 'maintenance', budgetAmount: '800.00',   actualAmount: '650.00'   },
        { category: 'supplies',    budgetAmount: '1200.00',  actualAmount: '980.00'   },
      ] as const;

      await db.insert(budgets).values(
        budgetRows.map(b => {
          const variance = parseFloat(b.actualAmount) - parseFloat(b.budgetAmount);
          const variancePct = (variance / parseFloat(b.budgetAmount)) * 100;
          return {
            locationId,
            category: b.category,
            period: 'monthly' as const,
            budgetAmount: b.budgetAmount,
            actualAmount: b.actualAmount,
            variance: variance.toFixed(2),
            variancePercentage: variancePct.toFixed(2),
            startDate: monthStart,
            endDate: monthEnd,
            isActive: true,
            createdBy: userId,
          };
        })
      );

      res.json({
        success: true,
        locationId,
        message: 'Demo data created — Riverside Grill is ready to show.',
        summary: {
          location: 'Riverside Grill',
          vendors: 3,
          inventoryItems: inventoryData.length,
          invoices: 4,
          salesDays: 30,
          budgetCategories: budgetRows.length,
        },
      });
    } catch (error: any) {
      console.error('Error seeding demo data:', error);
      res.status(500).json({ message: 'Failed to seed demo data', detail: error.message });
    }
  });

  // One-time bootstrap: promotes the caller to platform_admin if none exist yet.
  // Safe to leave in — once a platform_admin exists the endpoint returns 409.
  app.post('/api/platform/bootstrap', isAuthenticated, async (req: any, res) => {
    try {
      const existing = await db.execute(sql`SELECT id FROM users WHERE role = 'platform_admin' LIMIT 1`);
      if (existing.rows.length > 0) {
        return res.status(409).json({ message: 'A platform_admin already exists. Bootstrap is disabled.' });
      }
      await db.execute(sql`
        UPDATE users
        SET role = 'platform_admin',
            subscription_plan = 'core',
            subscription_status = 'active',
            ocr_credits_limit = 999
        WHERE id = ${req.user.id}
      `);
      res.json({ success: true, message: 'Your account has been promoted to platform_admin. Please refresh the page.' });
    } catch (error) {
      console.error('Bootstrap error:', error);
      res.status(500).json({ message: 'Bootstrap failed' });
    }
  });
}
