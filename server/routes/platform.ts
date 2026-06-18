import type { Express } from 'express';
import { isAuthenticated, requirePlatformAdmin } from './helpers';
import { storage } from '../storage';

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
}
