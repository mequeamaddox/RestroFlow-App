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

      if ((user?.role as string) === 'platform_admin') return next();

      let billingUser = user;
      let locationId = (req.query.locationId || req.query.location || req.body?.locationId) as string | undefined;
      // Prefix middleware runs before route params exist. Resolve ID routes from
      // their resource instead of trusting an unrelated location supplied by a client.
      const resource = req.originalUrl.split('?')[0].match(/^\/api\/(inventory|vendors|categories|recipes|purchase-orders|invoices)\/([^/]+)(?:\/|$)/);
      if (resource) {
        const loaders: Record<string, (id: string) => Promise<any>> = {
          inventory: id => storage.getInventoryItem(id), vendors: id => storage.getVendor(id),
          categories: id => storage.getCategory(id), recipes: id => storage.getRecipe(id),
          'purchase-orders': id => storage.getPurchaseOrder(id), invoices: id => storage.getInvoiceById(id),
        };
        // Static endpoint names are not record IDs.
        if (!['upload', 'stats', 'import', 'low-stock', 'stock-levels'].includes(resource[2])) {
          const record = await loaders[resource[1]](resource[2]);
          locationId = record?.locationId || record?.location_id || locationId;
        }
      }
      const memberships = await storage.getUserPermissions(userId);
      if (locationId) {
        const location = await storage.getLocationById(locationId);
        if (!location || location.isActive === false || location.deletedAt || (location.ownerId !== userId && !memberships.some(p => p.locationId === locationId && p.isActive))) {
          return res.status(403).json({ message: 'Access denied to this location' });
        }
        billingUser = location.ownerId ? await storage.getUser(location.ownerId) : undefined;
      } else {
        const owned = await storage.getLocations(userId);
        const assigned = await Promise.all(memberships.filter(p => p.isActive).map(p => storage.getLocationById(p.locationId)));
        const owners = await Promise.all([...new Set([...owned, ...assigned.filter(Boolean)].map(location => location!.ownerId).filter(Boolean))].map(id => storage.getUser(id!)));
        billingUser = owners.find(owner => (!owner?.accountState || owner.accountState === 'active') && owner?.subscriptionPlan === 'core' && ACTIVE_STATUSES.has(owner.subscriptionStatus || 'inactive')) || user;
      }
      if (billingUser?.accountState && billingUser.accountState !== 'active') return res.status(403).json({message:'The restaurant owner account is disabled.'});
      const plan = (billingUser?.subscriptionPlan as Plan) || 'free';

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
        const status = billingUser?.subscriptionStatus || 'inactive';
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
