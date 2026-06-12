import { Request, Response, NextFunction } from 'express';
import { storage } from './storage';

const PLAN_ORDER = ['free', 'professional', 'enterprise'] as const;
type Plan = (typeof PLAN_ORDER)[number];

/**
 * Middleware that enforces a minimum subscription plan.
 * Returns 403 with upgrade_url if the user's plan is below the minimum.
 */
export function requirePlan(minPlan: Plan) {
  return async (req: Request, res: Response, next: NextFunction) => {
    const userId = req.user?.id;
    if (!userId) {
      return res.status(401).json({ error: 'Not authenticated' });
    }

    try {
      const user = await storage.getUser(userId);
      const plan = (user?.subscriptionPlan as Plan) || 'free';

      if (PLAN_ORDER.indexOf(plan) < PLAN_ORDER.indexOf(minPlan)) {
        return res.status(403).json({
          error: 'Upgrade required',
          upgrade_url: '/subscription',
          currentPlan: plan,
          requiredPlan: minPlan,
          message: `This feature requires the ${minPlan} plan or higher.`,
        });
      }

      next();
    } catch (err) {
      console.error('requirePlan middleware error:', err);
      res.status(500).json({ error: 'Failed to verify subscription' });
    }
  };
}
