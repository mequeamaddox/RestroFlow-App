import { Request, Response, NextFunction } from 'express';
import { storage } from './storage';

const PLAN_ORDER = ['free', 'core'] as const;
type Plan = (typeof PLAN_ORDER)[number];

// Statuses that constitute an active, billable subscription
const ACTIVE_STATUSES = new Set(['active', 'past_due']);

/**
 * Middleware that enforces a minimum subscription plan AND verifies the
 * subscription is actually active (not cancelled or lapsed).
 *
 * Free-tier routes skip the status check — no billing required.
 * Paid routes require subscriptionStatus to be 'active' or 'past_due'
 * (past_due gets a grace window; cancelled/inactive are rejected).
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

      // Step 1 — plan tier check
      if (PLAN_ORDER.indexOf(plan) < PLAN_ORDER.indexOf(minPlan)) {
        return res.status(403).json({
          error: 'Upgrade required',
          upgrade_url: '/subscription',
          currentPlan: plan,
          requiredPlan: minPlan,
          message: `This feature requires the ${minPlan} plan or higher.`,
        });
      }

      // Step 2 — subscription status check (only for paid plans)
      if (minPlan !== 'free') {
        const status = user?.subscriptionStatus || 'inactive';
        if (!ACTIVE_STATUSES.has(status)) {
          return res.status(403).json({
            error: 'Subscription inactive',
            upgrade_url: '/subscription',
            currentPlan: plan,
            subscriptionStatus: status,
            message: `Your ${plan} subscription is ${status}. Please reactivate to access this feature.`,
          });
        }
      }

      next();
    } catch (err) {
      console.error('requirePlan middleware error:', err);
      res.status(500).json({ error: 'Failed to verify subscription' });
    }
  };
}
