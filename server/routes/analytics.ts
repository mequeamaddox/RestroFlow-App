import type { Express } from 'express';
import { storage } from '../storage';
import { isAuthenticated } from './helpers';
import { assertLocationAccess } from '../securityMiddleware';
import { requirePlan } from '../billingMiddleware';
import { db } from '../db';
import { sql, desc } from 'drizzle-orm';
import { inventoryItems, recipes, wasteEntries, posSales } from '@shared/schema';

export function registerAnalyticsRoutes(app: Express): void {
  // Cost Monitoring
  app.get('/api/cost-alerts', isAuthenticated, async (req, res) => {
    try {
      const location = req.query.location as string;
      if (!location) return res.status(400).json({ message: 'Location ID required' });
      if (!await assertLocationAccess(req, res, location)) return;
      const alerts = await storage.getCostAlerts(location);
      res.json(alerts);
    } catch (error) {
      console.error('Error fetching cost alerts:', error);
      res.status(500).json({ message: 'Failed to fetch cost alerts' });
    }
  });

  app.get('/api/price-monitoring', isAuthenticated, async (req, res) => {
    try {
      const { range, locationId } = req.query;
      if (!locationId) return res.status(400).json({ message: 'Location ID required' });
      if (!await assertLocationAccess(req, res, locationId as string)) return;
      const monitoring = await storage.getPriceMonitoring(range as string, locationId as string);
      res.json(monitoring);
    } catch (error) {
      console.error('Error fetching price monitoring:', error);
      res.status(500).json({ message: 'Failed to fetch price monitoring' });
    }
  });

  app.get('/api/cost-trends', isAuthenticated, async (req, res) => {
    try {
      const { range, location } = req.query;
      if (!location) return res.status(400).json({ message: 'Location ID required' });
      if (!await assertLocationAccess(req, res, location as string)) return;
      const trends = await storage.getCostTrends(range as string, location as string);
      res.json(trends);
    } catch (error) {
      console.error('Error fetching cost trends:', error);
      res.status(500).json({ message: 'Failed to fetch cost trends' });
    }
  });

  app.get('/api/budget-tracking', isAuthenticated, async (req, res) => {
    try {
      const { location } = req.query;
      if (!location) return res.status(400).json({ message: 'Location ID required' });
      if (!await assertLocationAccess(req, res, location as string)) return;
      const tracking = await storage.getBudgetTracking(location as string);
      res.json(tracking);
    } catch (error) {
      console.error('Error fetching budget tracking:', error);
      res.status(500).json({ message: 'Failed to fetch budget tracking' });
    }
  });

  // Business Intelligence
  app.get('/api/business-intelligence/daily-pnl', isAuthenticated, requirePlan('professional'), async (req, res) => {
    try {
      const { range, location } = req.query;
      if (location && !await assertLocationAccess(req, res, location as string)) return;
      const pnl = await storage.getDailyPnL(range as string, location as string);
      res.json(pnl);
    } catch (error) {
      console.error('Error fetching daily P&L:', error);
      res.status(500).json({ message: 'Failed to fetch daily P&L' });
    }
  });

  app.get('/api/business-intelligence/kpis', isAuthenticated, requirePlan('professional'), async (req, res) => {
    try {
      const { range, location } = req.query;
      if (location && !await assertLocationAccess(req, res, location as string)) return;
      const kpis = await storage.getKPIMetrics(range as string, location as string);
      res.json(kpis);
    } catch (error) {
      console.error('Error fetching KPIs:', error);
      res.status(500).json({ message: 'Failed to fetch KPIs' });
    }
  });

  app.get('/api/business-intelligence/profitability', isAuthenticated, requirePlan('professional'), async (req, res) => {
    try {
      const { range, location } = req.query;
      if (location && !await assertLocationAccess(req, res, location as string)) return;
      const analysis = await storage.getProfitabilityAnalysis(range as string, location as string);
      res.json(analysis);
    } catch (error) {
      console.error('Error fetching profitability analysis:', error);
      res.status(500).json({ message: 'Failed to fetch profitability analysis' });
    }
  });

  app.get('/api/business-intelligence/menu-performance', isAuthenticated, requirePlan('professional'), async (req, res) => {
    try {
      const { range, location } = req.query;
      if (location && !await assertLocationAccess(req, res, location as string)) return;
      const performance = await storage.getMenuPerformance(range as string, location as string);
      res.json(performance);
    } catch (error) {
      console.error('Error fetching menu performance:', error);
      res.status(500).json({ message: 'Failed to fetch menu performance' });
    }
  });

  app.get('/api/business-intelligence/cost-analysis', isAuthenticated, requirePlan('professional'), async (req, res) => {
    try {
      const { range, location } = req.query;
      if (location && !await assertLocationAccess(req, res, location as string)) return;
      const analysis = await storage.getCostAnalysis(range as string, location as string);
      res.json(analysis);
    } catch (error) {
      console.error('Error fetching cost analysis:', error);
      res.status(500).json({ message: 'Failed to fetch cost analysis' });
    }
  });

  // Dashboard metrics
  app.get('/api/dashboard/metrics', isAuthenticated, async (req, res) => {
    try {
      const locationId = req.query.locationId as string;
      if (!locationId) return res.status(400).json({ message: 'Location ID required' });
      if (!await assertLocationAccess(req, res, locationId)) return;
      const metrics = await storage.getDashboardMetrics(locationId);
      res.json(metrics);
    } catch (error) {
      console.error('Error fetching dashboard metrics:', error);
      res.status(500).json({ message: 'Failed to fetch dashboard metrics' });
    }
  });

  // Analytics alerts
  app.get('/api/analytics/alerts', isAuthenticated, async (req, res) => {
    try {
      const locationId = req.query.locationId as string;
      if (!locationId) return res.status(400).json({ message: 'Location ID required' });
      if (!await assertLocationAccess(req, res, locationId)) return;
      const alerts = await storage.getAnalyticsAlerts(locationId);
      res.json(alerts);
    } catch (error) {
      console.error('Error fetching analytics alerts:', error);
      res.status(500).json({ message: 'Failed to fetch analytics alerts' });
    }
  });

  // Business intelligence summary
  app.get('/api/analytics/business-intelligence', isAuthenticated, requirePlan('professional'), async (req, res) => {
    try {
      const locationId = req.query.locationId as string;
      if (locationId && !await assertLocationAccess(req, res, locationId)) return;
      res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
      const bi = await storage.getBusinessIntelligenceSummary(locationId);
      res.json(bi);
    } catch (error) {
      console.error('Error fetching business intelligence:', error);
      res.status(500).json({ message: 'Failed to fetch business intelligence' });
    }
  });

  // Profit & Loss
  app.get('/api/analytics/profit-loss', isAuthenticated, requirePlan('professional'), async (req, res) => {
    try {
      const locationId = req.query.locationId as string;
      const period = req.query.period as string || 'monthly';
      if (locationId && !await assertLocationAccess(req, res, locationId)) return;
      const pnl = await storage.getProfitLoss(locationId, period);
      res.json(pnl);
    } catch (error) {
      console.error('Error fetching profit & loss:', error);
      res.status(500).json({ message: 'Failed to fetch profit & loss' });
    }
  });

  // Activities
  app.get('/api/activities', isAuthenticated, async (req, res) => {
    try {
      const locationId = req.query.locationId as string;
      if (locationId && !await assertLocationAccess(req, res, locationId)) return;
      const activities: any[] = [];

      const recentInventory = await db
        .select({ id: inventoryItems.id, name: inventoryItems.name, createdAt: inventoryItems.createdAt })
        .from(inventoryItems)
        .where(locationId ? sql`${inventoryItems.locationId} = ${locationId}` : sql`1=1`)
        .orderBy(desc(inventoryItems.createdAt))
        .limit(5);

      recentInventory.forEach(item => {
        activities.push({ id: `inv_${item.id}`, type: 'inventory', description: `Added ${item.name} to inventory`, createdAt: item.createdAt, user: 'System' });
      });

      const recentRecipes = await db
        .select({ id: recipes.id, name: recipes.name, createdAt: recipes.createdAt })
        .from(recipes)
        .where(locationId ? sql`${recipes.locationId} = ${locationId}` : sql`1=1`)
        .orderBy(desc(recipes.createdAt))
        .limit(3);

      recentRecipes.forEach(recipe => {
        activities.push({ id: `recipe_${recipe.id}`, type: 'recipe', description: `Created recipe: ${recipe.name}`, createdAt: recipe.createdAt, user: 'Chef' });
      });

      activities.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
      res.json(activities.slice(0, 8));
    } catch (error) {
      console.error('Error fetching activities:', error);
      res.status(500).json({ message: 'Failed to fetch activities' });
    }
  });

  // Real-time analytics
  app.get('/api/analytics/realtime', isAuthenticated, requirePlan('professional'), async (req, res) => {
    try {
      const locationId = req.query.locationId as string;
      if (locationId && !await assertLocationAccess(req, res, locationId)) return;
      res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
      res.setHeader('Pragma', 'no-cache');
      res.setHeader('Expires', '0');

      const salesData = await db
        .select({
          totalSales: sql<number>`COALESCE(SUM(CAST(${posSales.total} AS DECIMAL)), 0)`,
          orderCount: sql<number>`COUNT(*)`,
        })
        .from(posSales)
        .where(sql`${posSales.orderDate} >= CURRENT_DATE - INTERVAL '7 days'
          ${locationId ? sql`AND ${posSales.locationId} = ${locationId}` : sql``}`);

      const recentSales = salesData[0] || { totalSales: 0, orderCount: 0 };
      const avgOrderValue = recentSales.orderCount > 0 ? recentSales.totalSales / recentSales.orderCount : 0;
      res.json({
        currentSales: Number(recentSales.totalSales),
        ordersToday: Number(recentSales.orderCount),
        avgOrderValue: Number(avgOrderValue),
      });
    } catch (error) {
      console.error('Error fetching real-time data:', error);
      res.status(500).json({ message: 'Failed to fetch real-time data' });
    }
  });

  // Sales trend
  app.get('/api/analytics/sales-trend', isAuthenticated, requirePlan('professional'), async (req, res) => {
    try {
      const locationId = req.query.locationId as string;
      if (locationId && !await assertLocationAccess(req, res, locationId)) return;
      const timeRange = req.query.timeRange as string || '7d';
      const days = timeRange === '30d' ? 30 : 7;

      const salesByDay = await db
        .select({
          date: sql<string>`DATE(${posSales.orderDate})`,
          sales: sql<number>`COALESCE(SUM(CAST(${posSales.total} AS DECIMAL)), 0)`,
          orders: sql<number>`COUNT(*)`,
        })
        .from(posSales)
        .where(sql`${posSales.orderDate} >= CURRENT_DATE - INTERVAL '${sql.raw(days.toString())} days'
          ${locationId ? sql`AND ${posSales.locationId} = ${locationId}` : sql``}`)
        .groupBy(sql`DATE(${posSales.orderDate})`)
        .orderBy(sql`DATE(${posSales.orderDate})`);

      const dailyData = salesByDay.map(day => {
        const s = Number(day.sales);
        const o = Number(day.orders);
        return { date: day.date, sales: s, orders: o, avgOrder: o > 0 ? s / o : 0 };
      });
      res.json(dailyData);
    } catch (error) {
      console.error('Error fetching sales trend:', error);
      res.status(500).json({ message: 'Failed to fetch sales trend' });
    }
  });

  // Manual BI backfill (owner only)
  app.post('/api/analytics/backfill-bi', isAuthenticated, requirePlan('professional'), async (req: any, res) => {
    try {
      if (req.user.role !== 'owner') {
        return res.status(403).json({ message: 'Only owners can trigger BI backfill' });
      }
      const { computeBusinessIntelligence } = await import('../jobs/analyticsScheduler');
      await computeBusinessIntelligence(true);
      res.json({ message: 'Business intelligence backfill completed successfully' });
    } catch (error) {
      console.error('Error running BI backfill:', error);
      res.status(500).json({ message: 'Failed to run BI backfill' });
    }
  });

  // Waste summary
  app.get('/api/waste/summary', isAuthenticated, async (req, res) => {
    try {
      const locationId = req.query.locationId as string;
      if (locationId && !await assertLocationAccess(req, res, locationId)) return;

      const wasteStats = await db
        .select({
          category: wasteEntries.reason,
          totalAmount: sql<number>`SUM(CAST(${wasteEntries.quantity} AS DECIMAL))`,
          totalCost: sql<number>`SUM(CAST(${wasteEntries.cost} AS DECIMAL))`,
        })
        .from(wasteEntries)
        .where(sql`${wasteEntries.createdAt} >= CURRENT_DATE - INTERVAL '7 days'
          ${locationId ? sql`AND ${wasteEntries.locationId} = ${locationId}` : sql``}`)
        .groupBy(wasteEntries.reason);

      const colorMap: Record<string, string> = {
        food_prep: '#EF4444',
        spoilage: '#F59E0B',
        customer_leftover: '#10B981',
        overproduction: '#8B5CF6',
      };

      res.json(wasteStats.map(stat => ({
        category: stat.category?.replace('_', ' ').replace(/\b\w/g, (l: string) => l.toUpperCase()) || 'Other',
        amount: Number(stat.totalAmount || 0),
        cost: Number(stat.totalCost || 0),
        color: colorMap[stat.category || ''] || '#6B7280',
      })));
    } catch (error) {
      console.error('Error fetching waste summary:', error);
      res.status(500).json({ message: 'Failed to fetch waste summary' });
    }
  });
}
