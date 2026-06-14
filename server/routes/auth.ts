import type { Express } from 'express';
import { getAuth } from '@clerk/express';
import { storage } from '../storage';
import { isAuthenticated, clerkClient, calculateSubscriptionTotal } from './helpers';
import { requirePermission, Permission } from '../permissions';
import { insertInvitationTokenSchema, invitationTokens } from '@shared/schema';
import { InvitationEmailService } from '../invitationEmailService';
import { db } from '../db';
import { eq } from 'drizzle-orm';

export function registerAuthRoutes(app: Express): void {
  app.get('/api/auth/me', async (req, res) => {
    try {
      res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
      const { userId, sessionClaims } = getAuth(req);
      if (!userId) {
        return res.status(401).json({ ok: false, message: 'Not authenticated' });
      }

      let user = await storage.getUser(userId);

      if (!user) {
        const email = sessionClaims?.email as string || '';
        if (email) user = await storage.getUserByEmail(email);
      }

      if (!user) {
        try {
          const clerkUser = await clerkClient.users.getUser(userId);
          const email = clerkUser.emailAddresses[0]?.emailAddress || '';
          const firstName = clerkUser.firstName || '';
          const lastName = clerkUser.lastName || '';

          const existingByEmail = email ? await storage.getUserByEmail(email) : undefined;

          // IMPORTANT: use upsertUser's RETURN value — never re-fetch by Clerk userId.
          // An account matched by email keeps its ORIGINAL id, which will NOT equal the
          // current Clerk userId after a Clerk app/key change. Re-fetching by userId then
          // returns null and surfaces a false "User not found" on an otherwise valid login.
          if (!existingByEmail) {
            user = await storage.upsertUser({ id: userId, email, firstName, lastName, role: 'owner' });
          } else {
            user = await storage.upsertUser({
              id: userId,
              email: existingByEmail.email || email,
              firstName: existingByEmail.firstName || firstName,
              lastName: existingByEmail.lastName || lastName,
              role: existingByEmail.role || 'owner',
            });
          }
        } catch (clerkErr) {
          console.error('❌ /api/auth/me provisioning failed:', clerkErr instanceof Error ? clerkErr.message : clerkErr);
          return res.status(401).json({ ok: false, message: 'User not found' });
        }
      }

      if (!user) {
        return res.status(401).json({ ok: false, message: 'User not found' });
      }

      res.json({
        ok: true,
        user: {
          id: user.id,
          email: user.email,
          firstName: user.firstName,
          lastName: user.lastName,
          role: user.role,
        },
      });
    } catch (error) {
      console.error('Error getting user info:', error);
      res.status(500).json({ message: 'Failed to get user info' });
    }
  });

  app.post('/api/auth/logout', (_req, res) => {
    res.clearCookie('__session');
    res.json({ success: true, message: 'Logout successful' });
  });

  app.post('/api/admin/create-employee', isAuthenticated, async (_req, res) => {
    res.status(410).json({
      message: 'This endpoint is deprecated. Please use /api/hr/employees for employee creation.',
      redirectTo: '/api/hr/employees',
    });
  });

  // User subscription status
  app.get('/api/user/subscription', isAuthenticated, async (req, res) => {
    try {
      const userId = req.user!.id;
      const user = await storage.getUser(userId);
      if (!user) return res.status(404).json({ message: 'User not found' });
      const allLocations = await storage.getLocations();
      // Scope to this owner's locations only — prevents cross-tenant count leak
      const hrAddonLocations = allLocations.filter((loc: any) => loc.ownerId === userId && loc.hrAddonEnabled).length;
      res.json({
        plan: user.subscriptionPlan || 'free',
        status: user.subscriptionStatus || 'inactive',
        ocrCreditsUsed: user.ocrCreditsUsed || 0,
        ocrCreditsLimit: user.ocrCreditsLimit || 5,
        hrAddonEnabled: user.hrAddonEnabled || false,
        hrAddonLocations,
        totalAmount: calculateSubscriptionTotal(user.subscriptionPlan, hrAddonLocations),
        nextBillingDate: user.subscriptionEndDate?.toISOString(),
      });
    } catch (error) {
      console.error('Error fetching user subscription:', error);
      res.status(500).json({ message: 'Failed to fetch subscription' });
    }
  });

  app.post('/api/user/upgrade-plan', isAuthenticated, async (req, res) => {
    try {
      const userId = req.user!.id;
      const { plan, hrAddonEnabled } = req.body;
      await storage.updateUserSubscription(userId, {
        subscriptionPlan: plan,
        subscriptionStatus: 'active',
        hrAddonEnabled: hrAddonEnabled || false,
        ocrCreditsLimit: plan === 'professional' || plan === 'enterprise' ? 999 : 5,
      });
      res.json({ success: true, message: 'Plan upgraded successfully' });
    } catch (error) {
      console.error('Error upgrading plan:', error);
      res.status(500).json({ message: 'Failed to upgrade plan' });
    }
  });

  app.post('/api/user/reset-credits', isAuthenticated, async (req, res) => {
    try {
      const userId = req.user!.id;
      const user = await storage.getUser(userId);
      if (user?.role !== 'owner' && user?.role !== 'admin') {
        return res.status(403).json({ message: 'Only owners can reset OCR credits' });
      }
      await storage.resetOcrCredits(userId);
      res.json({ success: true, message: 'OCR credits reset successfully' });
    } catch (error) {
      console.error('Error resetting credits:', error);
      res.status(500).json({ message: 'Failed to reset credits' });
    }
  });

  // Invitation token management — requires MANAGE_EMPLOYEES permission on all mutating routes
  app.get('/api/invitations', isAuthenticated, requirePermission(Permission.MANAGE_EMPLOYEES), async (req, res) => {
    try {
      const invitations = await db.select().from(invitationTokens).orderBy(invitationTokens.createdAt);
      res.json(invitations);
    } catch (error) {
      console.error('Error fetching invitations:', error);
      res.status(500).json({ message: 'Failed to fetch invitations' });
    }
  });

  app.post('/api/invitations', isAuthenticated, requirePermission(Permission.MANAGE_EMPLOYEES), async (req, res) => {
    try {
      const userId = req.user!.id;
      const { email, role, locationId, expiresInHours = 72 } = req.body;

      if (!email || !role) {
        return res.status(400).json({ message: 'Email and role are required' });
      }

      const emailService = new InvitationEmailService();
      const result = await emailService.createAndSendInvitation({
        email,
        role,
        locationId,
        invitedBy: userId,
        expiresInHours,
      });

      res.status(201).json(result);
    } catch (error) {
      console.error('Error creating invitation:', error);
      res.status(500).json({ message: 'Failed to create invitation' });
    }
  });

  app.get('/api/invitations/:id', isAuthenticated, requirePermission(Permission.MANAGE_EMPLOYEES), async (req, res) => {
    try {
      const [invitation] = await db.select().from(invitationTokens).where(eq(invitationTokens.id, req.params.id));
      if (!invitation) return res.status(404).json({ message: 'Invitation not found' });
      res.json(invitation);
    } catch (error) {
      console.error('Error fetching invitation:', error);
      res.status(500).json({ message: 'Failed to fetch invitation' });
    }
  });

  app.put('/api/invitations/:id', isAuthenticated, requirePermission(Permission.MANAGE_EMPLOYEES), async (req, res) => {
    try {
      const [updated] = await db
        .update(invitationTokens)
        .set(req.body)
        .where(eq(invitationTokens.id, req.params.id))
        .returning();
      res.json(updated);
    } catch (error) {
      console.error('Error updating invitation:', error);
      res.status(500).json({ message: 'Failed to update invitation' });
    }
  });

  app.delete('/api/invitations/:id', isAuthenticated, requirePermission(Permission.MANAGE_EMPLOYEES), async (req, res) => {
    try {
      await db.delete(invitationTokens).where(eq(invitationTokens.id, req.params.id));
      res.status(204).send();
    } catch (error) {
      console.error('Error deleting invitation:', error);
      res.status(500).json({ message: 'Failed to delete invitation' });
    }
  });

  // Public invitation token validation
  app.get('/api/invite/:token', async (req, res) => {
    try {
      const [invitation] = await db
        .select()
        .from(invitationTokens)
        .where(eq(invitationTokens.token, req.params.token));

      if (!invitation) {
        return res.status(404).json({ message: 'Invitation not found or expired' });
      }

      if (invitation.expiresAt && new Date(invitation.expiresAt) < new Date()) {
        return res.status(410).json({ message: 'Invitation has expired' });
      }

      if (invitation.usedAt) {
        return res.status(410).json({ message: 'Invitation has already been used' });
      }

      res.json({
        email: invitation.email,
        role: invitation.role,
        locationId: invitation.locationId,
      });
    } catch (error) {
      console.error('Error validating invite token:', error);
      res.status(500).json({ message: 'Failed to validate invitation' });
    }
  });
}
