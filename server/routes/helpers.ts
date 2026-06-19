import { createClerkClient } from '@clerk/express';
import { requireAuth } from '../clerkAuth';
import { storage } from '../storage';
import multer from 'multer';

export const clerkClient = createClerkClient({
  secretKey: process.env.CLERK_SECRET_KEY,
});

export const isAuthenticated = requireAuth;

export const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 50 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    const allowed = ['image/jpeg', 'image/png', 'image/jpg', 'application/pdf'];
    if (allowed.includes(file.mimetype)) cb(null, true);
    else cb(new Error('Invalid file type. Only JPEG, PNG, and PDF files are allowed.'));
  },
});

export const csvUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    const allowed = [
      'text/csv',
      'application/vnd.ms-excel',
      'application/csv',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'application/vnd.ms-excel.sheet.macroEnabled.12',
    ];
    if (
      allowed.includes(file.mimetype) ||
      file.originalname.endsWith('.csv') ||
      file.originalname.endsWith('.xlsx') ||
      file.originalname.endsWith('.xls')
    ) {
      cb(null, true);
    } else {
      cb(new Error('Invalid file type. Only CSV and Excel files are allowed.'));
    }
  },
});

export async function checkOcrAccess(userId: string): Promise<{ hasAccess: boolean; creditsRemaining: number; plan: string }> {
  const user = await storage.getUser(userId);
  if (!user) return { hasAccess: false, creditsRemaining: 0, plan: 'free' };
  const plan = user.subscriptionPlan || 'free';
  const ocrCreditsUsed = user.ocrCreditsUsed || 0;
  const maxOcrCredits = 5;
  if (plan === 'core') {
    return { hasAccess: true, creditsRemaining: 999, plan };
  }
  const creditsRemaining = Math.max(0, maxOcrCredits - ocrCreditsUsed);
  return { hasAccess: creditsRemaining > 0, creditsRemaining, plan };
}

export function mapPositionToRole(positionTitle: string | null | undefined): string {
  if (!positionTitle) return 'employee';
  const title = positionTitle.toLowerCase();
  if (title.includes('manager') || title.includes('supervisor')) return 'manager';
  if (title.includes('lead') || title.includes('team lead')) return 'team_lead';
  return 'employee';
}

// Single source of truth for subscription pricing (USD / month).
export const PLAN_BASE_PRICE: Record<string, number> = {
  free: 0,
  core: 179,
};
export const HR_ADDON_PRICE_PER_LOCATION = 79;
export const BAR_ADDON_PRICE_PER_LOCATION = 79;

// Plan location limits: free = 1, core = 3, platform_admin = unlimited
export const PLAN_LOCATION_LIMITS: Record<string, number> = {
  free: 1,
  core: 3,
};

export function calculateSubscriptionTotal(
  plan: string | null | undefined,
  hrAddonLocations: number,
  barAddonLocations = 0,
): number {
  const basePlanCost = PLAN_BASE_PRICE[plan || 'free'] ?? 0;
  return basePlanCost
    + hrAddonLocations * HR_ADDON_PRICE_PER_LOCATION
    + barAddonLocations * BAR_ADDON_PRICE_PER_LOCATION;
}

export function requirePlatformAdmin(req: any, res: any, next: any) {
  if (req.user?.role !== 'platform_admin') {
    return res.status(403).json({ message: 'Platform admin access required' });
  }
  next();
}

export const requireHRAccess = async (req: any, res: any, next: any) => {
  try {
    const locationId = (req.query.locationId || req.body?.locationId) as string;
    if (!locationId) {
      return res.status(400).json({ message: 'Location ID required', code: 'LOCATION_REQUIRED' });
    }
    const user = req.user;
    if (user?.role === 'platform_admin') return next();
    const locs = await storage.getLocations();
    const location = locs.find((loc: any) => loc.id === locationId);
    if (!location) {
      return res.status(404).json({ message: 'Location not found' });
    }
    if (!location.hrAddonEnabled) {
      return res.status(403).json({
        message: 'HR add-on not enabled for this location',
        code: 'HR_ADDON_REQUIRED',
        upgradeUrl: '/subscription',
      });
    }
    next();
  } catch (error) {
    console.error('Error checking HR access:', error);
    res.status(500).json({ message: 'Failed to check HR access' });
  }
};

export const requireBarAccess = async (req: any, res: any, next: any) => {
  try {
    const locationId = (req.query.locationId || req.body?.locationId) as string;
    if (!locationId) {
      return res.status(400).json({ message: 'Location ID required', code: 'LOCATION_REQUIRED' });
    }
    const user = req.user;
    if (user?.role === 'platform_admin') return next();
    const locs = await storage.getLocations();
    const location = locs.find((loc: any) => loc.id === locationId);
    if (!location) {
      return res.status(404).json({ message: 'Location not found' });
    }
    if (!location.barAddonEnabled) {
      return res.status(403).json({
        message: 'Bar & Beverage add-on not enabled for this location',
        code: 'BAR_ADDON_REQUIRED',
        upgradeUrl: '/subscription',
      });
    }
    next();
  } catch (error) {
    console.error('Error checking Bar access:', error);
    res.status(500).json({ message: 'Failed to check Bar access' });
  }
};
