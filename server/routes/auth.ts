import type { Express } from 'express';
import { getAuth } from '@clerk/express';
import { storage } from '../storage';
import { isAuthenticated, clerkClient, calculateSubscriptionTotal, requirePlatformAdmin } from './helpers';
import { canManageUser, requirePermission, Permission } from '../permissions';
import { assertLocationAccess, strictLimiter } from '../securityMiddleware';
import { isOwnerLevel } from '@shared/roles';
import { insertInvitationTokenSchema, invitationTokens, locations, departments, positions, employees } from '@shared/schema';
import { InvitationEmailService } from '../invitationEmailService';
import { db } from '../db';
import { and, eq, gt, desc } from 'drizzle-orm';
import { acceptStaffInvitation, StaffAccessError } from '../staffAccess';

export function registerAuthRoutes(app: Express): void {
  app.get('/api/auth/me', async (req, res) => {
    try {
      res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');

      // getAuth() throws when the Authorization header contains a malformed token
      // (e.g. "Bearer null" sent while Clerk is still initialising on the client).
      // Catch that and return 401 rather than falling through to the 500 handler.
      let userId: string | null | undefined;
      let sessionClaims: Record<string, unknown> | null | undefined;
      try {
        const auth = getAuth(req);
        userId = auth.userId;
        sessionClaims = auth.sessionClaims as Record<string, unknown>;
      } catch {
        return res.status(401).json({ ok: false, message: 'Not authenticated' });
      }

      if (!userId) {
        return res.status(401).json({ ok: false, message: 'Not authenticated' });
      }

      let user = await storage.getUser(userId).catch((e: any) => {
        throw new Error(`getUser(${userId}) failed: ${e?.message ?? e}`);
      });

      if (!user) {
        const email = (sessionClaims?.email as string) || '';
        if (email) {
          user = await storage.getUserByEmail(email).catch((e: any) => {
            throw new Error(`getUserByEmail(${email}) failed: ${e?.message ?? e}`);
          });
        }
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
            // Check for a pending invitation — if one exists, use its role; otherwise this is an owner signup
            const [pendingInvite] = await db
              .select()
              .from(invitationTokens)
              .where(and(eq(invitationTokens.email, email), eq(invitationTokens.status, 'pending'), gt(invitationTokens.expiresAt, new Date())))
              .limit(1);
            const role = (pendingInvite?.role as any) || 'owner';
            user = await storage.upsertUser({ id: userId, email, firstName, lastName, role });
          } else {
            user = await storage.upsertUser({
              id: userId,
              email: existingByEmail.email || email,
              firstName: existingByEmail.firstName || firstName,
              lastName: existingByEmail.lastName || lastName,
              role: existingByEmail.role || 'employee',
            });
          }
        } catch (clerkErr) {
          console.error('❌ /api/auth/me provisioning failed:', clerkErr instanceof Error ? clerkErr.message : clerkErr);
          return res.status(401).json({ ok: false, message: 'User not found', detail: clerkErr instanceof Error ? clerkErr.message : String(clerkErr) });
        }
      }

      if (!user) {
        return res.status(401).json({ ok: false, message: 'User not found' });
      }

      const owned = user.role === 'platform_admin' ? [] : await storage.getLocations(user.id);
      const memberships = user.role === 'platform_admin' ? [] : await storage.getUserPermissions(user.id);
      const assigned = await Promise.all(memberships.filter(p => p.isActive).map(p => storage.getLocationById(p.locationId)));
      const assignedOwners = await Promise.all(assigned.filter(Boolean).map(location => location!.ownerId ? storage.getUser(location!.ownerId) : undefined));
      const inherited = assignedOwners.find(owner => owner?.subscriptionPlan === 'core' && ['active', 'past_due'].includes(owner.subscriptionStatus || ''));
      const billing = user.subscriptionPlan === 'core' && ['active', 'past_due'].includes(user.subscriptionStatus || '') ? user : inherited || user;
      res.json({
        ok: true,
        user: {
          id: user.id,
          email: user.email,
          firstName: user.firstName,
          lastName: user.lastName,
          role: !owned.length && memberships.length && user.role !== 'platform_admin' ? memberships[0].role : user.role,
          subscriptionPlan: billing.subscriptionPlan,
          subscriptionStatus: billing.subscriptionStatus,
        },
      });
    } catch (error) {
      console.error('Error getting user info:', error);
      res.status(500).json({ message: 'Failed to get user info' });
    }
  });

  app.post('/api/auth/logout', async (req, res) => {
    try {
      const sessionId = getAuth(req).sessionId;
      if (sessionId) await clerkClient.sessions.revokeSession(sessionId);
    } catch (e) {
      // best-effort revocation
    }
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
      const ownedLocations = await storage.getLocations(userId);
      const hrAddonLocations = ownedLocations.filter((loc: any) => loc.hrAddonEnabled).length;
      res.json({
        plan: user.subscriptionPlan || 'free',
        status: user.subscriptionStatus || 'inactive',
        ocrCreditsUsed: user.ocrCreditsUsed || 0,
        ocrCreditsLimit: user.ocrCreditsLimit || 5,
        hrAddonEnabled: hrAddonLocations > 0,
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
      const locationId = req.query.locationId as string;
      if (!locationId) return res.status(400).json({ message: 'locationId required' });
      if (!await assertLocationAccess(req, res, locationId)) return;
      const invitations = await db.select().from(invitationTokens)
        .where(eq(invitationTokens.locationId, locationId))
        .orderBy(invitationTokens.createdAt);
      res.json(invitations);
    } catch (error) {
      console.error('Error fetching invitations:', error);
      res.status(500).json({ message: 'Failed to fetch invitations' });
    }
  });

  app.post('/api/invitations', isAuthenticated, strictLimiter, requirePermission(Permission.MANAGE_EMPLOYEES), async (req, res) => {
    try {
      const userId = req.user!.id;
      const { email, role = 'employee', locationId: bodyLocationId, firstName, lastName, departmentId, positionId, hourlyRate, salary, startDate, personalMessage, expiresInHours = 168 } = req.body;

      if (!email) {
        return res.status(400).json({ message: 'Email is required' });
      }

      const ALLOWED_ROLES = ['employee', 'team_lead', 'foh_manager', 'boh_manager', 'gm', 'owner'];
      if (!ALLOWED_ROLES.includes(role)) {
        return res.status(400).json({ message: `Invalid role. Must be one of: ${ALLOWED_ROLES.join(', ')}` });
      }

      if (req.user!.role !== 'platform_admin' && !canManageUser(req.user!.role, role)) return res.status(403).json({ message: 'You cannot invite a role at or above your own authority.' });

      // Resolve locationId — fall back to the user's first owned location
      let locationId = bodyLocationId;
      if (bodyLocationId && !await assertLocationAccess(req, res, bodyLocationId)) return;
      if (!locationId) {
        const ownedLocations = await storage.getLocations(userId);
        const owned = ownedLocations[0];
        if (!owned) return res.status(400).json({ message: 'Location ID required and no owned location found' });
        locationId = owned.id;
      }

      if (req.user!.role !== 'platform_admin' && !canManageUser(req.user!.role, role)) return res.status(403).json({ message: 'You cannot grant this role in this restaurant.' });
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
      const [inviter, location] = await Promise.all([
        storage.getUser(userId),
        storage.getLocationById(locationId),
      ]);
      const companyName = location?.name || 'RestroFlow';
      const inviterName = inviter ? `${inviter.firstName || ''} ${inviter.lastName || ''}`.trim() || inviter.email || 'Your manager' : 'Your manager';

      const appUrl = process.env.APP_URL || 'https://restroflowsolutions.com';
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
      if (!await assertLocationAccess(req, res, invitation.locationId)) return;
      res.json(invitation);
    } catch (error) {
      console.error('Error fetching invitation:', error);
      res.status(500).json({ message: 'Failed to fetch invitation' });
    }
  });

  app.put('/api/invitations/:id', isAuthenticated, requirePermission(Permission.MANAGE_EMPLOYEES), async (req, res) => {
    try {
      const userId = req.user!.id;
      const [existing] = await db.select().from(invitationTokens).where(eq(invitationTokens.id, req.params.id));
      if (!existing) return res.status(404).json({ message: 'Invitation not found' });

      if (!await assertLocationAccess(req, res, existing.locationId)) return;

      const parsed = insertInvitationTokenSchema.partial().safeParse(req.body);
      if (!parsed.success) return res.status(400).json({ message: 'Invalid data', errors: parsed.error.errors });

      if (existing.acceptedAt) return res.status(400).json({ message: 'Accepted invitations cannot be changed.' });
      if (parsed.data.locationId !== undefined && parsed.data.locationId !== existing.locationId) return res.status(400).json({ message: 'Invitation cannot be moved to another restaurant.' });
      const nextRole = parsed.data.role || existing.role;
      if (!['employee', 'team_lead', 'foh_manager', 'boh_manager', 'gm', 'owner'].includes(nextRole) || (req.user!.role !== 'platform_admin' && !canManageUser(req.user!.role, nextRole))) return res.status(403).json({ message: 'You cannot grant this role.' });
      const [updated] = await db
        .update(invitationTokens)
        .set({ ...parsed.data, token: existing.token, invitedBy: existing.invitedBy, status: existing.status, acceptedAt: existing.acceptedAt, employeeId: existing.employeeId })
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
      const [invitation] = await db.select().from(invitationTokens).where(eq(invitationTokens.id, req.params.id));
      if (!invitation) return res.status(404).json({ message: 'Invitation not found' });
      if (!await assertLocationAccess(req, res, invitation.locationId)) return;
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
      const [invitation] = await db.select().from(invitationTokens).where(eq(invitationTokens.token, req.params.token)).limit(1);
      if (!invitation || invitation.acceptedAt || invitation.status !== 'pending' || (invitation.expiresAt && invitation.expiresAt < new Date())) {
        return res.status(410).json({ message: 'Invitation is expired or already used.' });
      }
      let clerkUserId = getAuth(req).userId;
      if (clerkUserId) {
        const clerkUser = await clerkClient.users.getUser(clerkUserId);
        if (!clerkUser.emailAddresses.some(address => address.emailAddress.toLowerCase() === invitation.email.toLowerCase())) {
          return res.status(403).json({ message: 'Sign in with the email address on this invitation.' });
        }
      } else {
        if (!req.body.password) return res.status(400).json({ message: 'Password is required for a new account.' });
        try {
          const clerkUser = await clerkClient.users.createUser({ emailAddress: [invitation.email], password: req.body.password, firstName: invitation.firstName || undefined, lastName: invitation.lastName || undefined });
          clerkUserId = clerkUser.id;
        } catch (clerkErr: any) {
          return res.status(400).json({ message: (clerkErr?.errors?.[0]?.longMessage || clerkErr?.errors?.[0]?.message || 'Account creation failed.') + ' If you already have an account, sign in and reopen this invitation.' });
        }
      }
      // All local records and acceptance commit together. If this fails, the
      // Clerk account can sign in and retry this still-pending invitation.
      await acceptStaffInvitation(db, req.params.token, { id: clerkUserId, email: invitation.email });
      res.json({ success: true, message: 'Account created successfully. You can now log in.' });
    } catch (error) {
      console.error('Error accepting invitation:', error);
      res.status(error instanceof StaffAccessError ? 400 : 500).json({ message: error instanceof StaffAccessError ? error.message : 'Could not complete invitation. Sign in and reopen this invitation to retry.' });
    }
  });
}
