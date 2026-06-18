import type { Express } from 'express';
import { isAuthenticated } from './helpers';

// In-memory storage for auto-ordering rules (not yet persisted to DB)
let autoOrderingRules: any[] = [];

export function registerAdvancedFeatureRoutes(app: Express): void {
  // ─── Auto-ordering rules ─────────────────────────────────────────────────

  app.get('/api/auto-ordering/rules', isAuthenticated, async (req: any, res) => {
    try {
      res.json(autoOrderingRules);
    } catch (error) {
      console.error('Error fetching auto-ordering rules:', error);
      res.status(500).json({ message: 'Failed to fetch auto-ordering rules' });
    }
  });

  app.post('/api/auto-ordering/rules', isAuthenticated, async (req: any, res) => {
    try {
      const ruleData = req.body;
      const newRule = {
        id: `rule_${Date.now()}`,
        ...ruleData,
        status: 'active',
        lastTriggered: null,
        ordersCreated: 0,
        totalSavings: 0,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };
      autoOrderingRules.push(newRule);
      res.status(201).json(newRule);
    } catch (error) {
      console.error('Error creating auto-ordering rule:', error);
      res.status(500).json({ message: 'Failed to create auto-ordering rule' });
    }
  });

  app.patch('/api/auto-ordering/rules/:id', isAuthenticated, async (req: any, res) => {
    try {
      const { id } = req.params;
      const updateData = req.body;
      const idx = autoOrderingRules.findIndex((r) => r.id === id);
      if (idx !== -1) {
        autoOrderingRules[idx] = { ...autoOrderingRules[idx], ...updateData, updatedAt: new Date().toISOString() };
        res.json(autoOrderingRules[idx]);
      } else {
        res.json({ id, ...updateData, updatedAt: new Date().toISOString() });
      }
    } catch (error) {
      console.error('Error updating auto-ordering rule:', error);
      res.status(500).json({ message: 'Failed to update auto-ordering rule' });
    }
  });

  app.delete('/api/auto-ordering/rules/:id', isAuthenticated, async (req: any, res) => {
    try {
      const { id } = req.params;
      const before = autoOrderingRules.length;
      autoOrderingRules = autoOrderingRules.filter((r) => r.id !== id);
      if (autoOrderingRules.length < before) {
        res.json({ message: 'Rule deleted successfully' });
      } else {
        res.status(404).json({ message: 'Rule not found' });
      }
    } catch (error) {
      console.error('Error deleting auto-ordering rule:', error);
      res.status(500).json({ message: 'Failed to delete auto-ordering rule' });
    }
  });

  // ─── Demand forecasting ───────────────────────────────────────────────────

  app.get('/api/forecasting/demand', isAuthenticated, async (_req, res) => {
    try {
      const forecastData = {
        weeklyForecast: [
          { day: 'Monday', predicted: 145, confidence: 92 },
          { day: 'Tuesday', predicted: 132, confidence: 88 },
          { day: 'Wednesday', predicted: 158, confidence: 91 },
          { day: 'Thursday', predicted: 167, confidence: 89 },
          { day: 'Friday', predicted: 223, confidence: 94 },
          { day: 'Saturday', predicted: 287, confidence: 96 },
          { day: 'Sunday', predicted: 198, confidence: 93 },
        ],
        topItems: [
          { item: 'Chicken Breast', forecast: 45, unit: 'lbs', confidence: 91 },
          { item: 'Ground Beef', forecast: 32, unit: 'lbs', confidence: 88 },
          { item: 'Salmon Fillet', forecast: 18, unit: 'lbs', confidence: 85 },
        ],
        accuracy: 91.2,
        wasteReduction: 24.8,
        costSavings: 1847,
      };
      res.json(forecastData);
    } catch (error) {
      console.error('Error fetching forecast data:', error);
      res.status(500).json({ message: 'Failed to fetch forecast data' });
    }
  });
}
