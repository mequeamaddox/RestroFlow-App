import type { Express } from 'express';
import { getAuth } from '@clerk/express';
import { storage } from '../storage';
import { isAuthenticated, clerkClient, calculateSubscriptionTotal, requirePlatformAdmin } from './helpers';
import { requirePermission, Permission } from '../permissions';
import { isOwnerLevel } from '@shared/roles';
import { insertInvitationTokenSchema, invitationTokens, locations, departments, positions, employees } from '@shared/schema';
import { InvitationEmailService } from '../invitationEmailService';
import { db } from '../db';
import { eq, desc } from 'drizzle-orm';

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
          subscriptionPlan: user.subscriptionPlan,
          subscriptionStatus: user.subscriptionStatus,
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

  app.post('/api/user/upgrade-plan', isAuthenticated, requirePlatformAdmin, async (req, res) => {
    try {
      const userId = req.user!.id;
      const { plan, hrAddonEnabled } = req.body;
      await storage.updateUserSubscription(userId, {
        subscriptionPlan: plan,
        subscriptionStatus: 'active',
        hrAddonEnabled: hrAddonEnabled || false,
        ocrCreditsLimit: plan === 'core' ? 999 : 5,
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
      if (!isOwnerLevel(user?.role)) {
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
      const { email, role = 'employee', locationId: bodyLocationId, firstName, lastName, departmentId, positionId, hourlyRate, salary, startDate, personalMessage, expiresInHours = 168 } = req.body;

      if (!email) {
        return res.status(400).json({ message: 'Email is required' });
      }

      // Resolve locationId — fall back to the user's first owned location
      let locationId = bodyLocationId;
      if (!locationId) {
        const allLocations = await storage.getLocations();
        const owned = allLocations.find((l: any) => l.ownerId === userId);
        if (!owned) return res.status(400).json({ message: 'Location ID required and no owned location found' });
        locationId = owned.id;
      }

      // Build the token record
      const expiresAt = new Date(Date.now() + expiresInHours * 60 * 60 * 1000);
      const invitation = await storage.createInvitationToken({
        email,
        firstName: firstName || '',
        lastName: lastName || '',
        role,
        locationId,
        departmentId: departmentId || undefined,
        positionId: positionId || undefined,
        hourlyRate: hourlyRate || undefined,
        salary: salary || undefined,
        startDate: startDate || undefined,
        personalMessage: personalMessage || undefined,
        invitedBy: userId,
        expiresAt,
      });

      // Send email (non-blocking — log failure but still return the token)
      const inviter = await storage.getUser(userId);
      const allLocations = await storage.getLocations();
      const location = allLocations.find((l: any) => l.id === locationId);
      const companyName = location?.name || 'RestroFlow';
      const inviterName = inviter ? `${inviter.firstName || ''} ${inviter.lastName || ''}`.trim() || inviter.email || 'Your manager' : 'Your manager';

      const appUrl = process.env.APP_URL || `${process.env.PROTOCOL || 'https'}://${process.env.RAILWAY_STATIC_URL || 'restroflow.com'}`;
      const invitationUrl = `${appUrl}/invitation/accept/${invitation.token}`;

      let emailSent = false;
      try {
        emailSent = await InvitationEmailService.sendInvitationEmail(invitation, inviterName, companyName, location?.name);
      } catch (err: any) {
        console.error('Invitation email send failed (token created):', err?.message);
      }

      res.status(201).json({ ...invitation, emailSent, invitationUrl });
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

  // Public invitation token validation — returns full invitation details for the accept page
  app.get('/api/invite/:token', async (req, res) => {
    try {
      const result = await db
        .select({
          invitation: invitationTokens,
          location: locations,
          department: departments,
          position: positions,
        })
        .from(invitationTokens)
        .leftJoin(locations, eq(invitationTokens.locationId, locations.id))
        .leftJoin(departments, eq(invitationTokens.departmentId, departments.id))
        .leftJoin(positions, eq(invitationTokens.positionId, positions.id))
        .where(eq(invitationTokens.token, req.params.token))
        .limit(1);

      if (!result.length) {
        return res.status(404).json({ message: 'Invitation not found or expired' });
      }

      const { invitation, location, department, position } = result[0];

      if (invitation.expiresAt && new Date(invitation.expiresAt) < new Date()) {
        return res.status(410).json({ message: 'Invitation has expired' });
      }

      if (invitation.acceptedAt) {
        return res.status(410).json({ message: 'Invitation has already been used' });
      }

      res.json({
        email: invitation.email,
        firstName: invitation.firstName || '',
        lastName: invitation.lastName || '',
        role: invitation.role,
        expiresAt: invitation.expiresAt,
        personalMessage: invitation.personalMessage,
        location: location ? { name: location.name, address: (location as any).address || '' } : undefined,
        department: department ? { name: department.name } : undefined,
        position: position ? { title: position.title } : undefined,
      });
    } catch (error) {
      console.error('Error validating invite token:', error);
      res.status(500).json({ message: 'Failed to validate invitation' });
    }
  });

  // Public invitation acceptance — creates the Clerk account + employee record
  app.post('/api/invite/:token/accept', async (req, res) => {
    try {
      const { password } = req.body;
      if (!password) return res.status(400).json({ message: 'Password is required' });

      const [invitation] = await db
        .select()
        .from(invitationTokens)
        .where(eq(invitationTokens.token, req.params.token))
        .limit(1);

      if (!invitation) return res.status(404).json({ message: 'Invitation not found' });
      if (invitation.acceptedAt) return res.status(410).json({ message: 'Invitation has already been used' });
      if (invitation.expiresAt && new Date(invitation.expiresAt) < new Date()) {
        return res.status(410).json({ message: 'Invitation has expired. Contact your manager for a new invitation.' });
      }

      // Create the Clerk user with the provided password
      let clerkUserId: string;
      try {
        const clerkUser = await clerkClient.users.createUser({
          emailAddress: [invitation.email],
          password,
          firstName: invitation.firstName || undefined,
          lastName: invitation.lastName || undefined,
        });
        clerkUserId = clerkUser.id;
      } catch (clerkErr: any) {
        const msg = clerkErr?.errors?.[0]?.message || clerkErr?.message || 'Failed to create account';
        return res.status(400).json({ message: msg });
      }

      // Upsert the user record in our DB
      await storage.upsertUser({
        id: clerkUserId,
        email: invitation.email,
        firstName: invitation.firstName || undefined,
        lastName: invitation.lastName || undefined,
        role: invitation.role as any,
      });

      // Create the employee record
      let newEmployee;
      try {
        newEmployee = await storage.createEmployee({
          firstName: invitation.firstName || 'New',
          lastName: invitation.lastName || 'Employee',
          email: invitation.email,
          locationId: invitation.locationId,
          departmentId: invitation.departmentId || undefined,
          positionId: invitation.positionId || undefined,
          hourlyRate: invitation.hourlyRate || undefined,
          salary: invitation.salary || undefined,
          startDate: invitation.startDate || undefined,
          hireDate: invitation.startDate || new Date().toISOString().split('T')[0],
          status: 'active',
          notes: `Clerk ID: ${clerkUserId}`,
        } as any);
      } catch (empErr: any) {
        console.error('Failed to create employee record for invitation:', empErr);
        // Still mark accepted even if employee record fails
      }

      // Mark invitation as accepted
      await db
        .update(invitationTokens)
        .set({ status: 'accepted', acceptedAt: new Date(), employeeId: newEmployee?.id || undefined })
        .where(eq(invitationTokens.token, req.params.token));

      res.json({ success: true, message: 'Account created successfully. You can now log in.' });
    } catch (error) {
      console.error('Error accepting invitation:', error);
      res.status(500).json({ message: 'Failed to create account' });
    }
  });
}
