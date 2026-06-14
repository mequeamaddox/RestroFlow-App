import { Request, Response, NextFunction } from 'express';
import { clerkMiddleware, getAuth, createClerkClient } from '@clerk/express';
import { storage } from './storage';

declare global {
  namespace Express {
    interface Request {
      user?: {
        id: string;
        email: string;
        firstName: string;
        lastName: string;
        role: string;
      };
    }
  }
}

export interface AuthenticatedRequest extends Request {
  user: {
    id: string;
    email: string;
    firstName: string;
    lastName: string;
    role: string;
  };
}

// Invitation system
interface Invitation {
  id: string;
  email: string;
  role: string;
  status: 'pending' | 'accepted';
  createdBy: string;
  createdAt: Date;
}

const invitations = new Map<string, Invitation>();

export function getAuthenticatedUser(req: any) {
  if (!req.user) throw new Error('User not authenticated');
  return req.user;
}

export function createInvitation(email: string, role: string, createdBy: string): Invitation {
  const invitation: Invitation = {
    id: `inv_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
    email: email.toLowerCase(),
    role,
    status: 'pending',
    createdBy,
    createdAt: new Date()
  };
  invitations.set(invitation.id, invitation);
  return invitation;
}

export function getInvitationByEmail(email: string): Invitation | undefined {
  return Array.from(invitations.values()).find(inv =>
    inv.email === email.toLowerCase() && inv.status === 'pending'
  );
}

export function acceptInvitation(invitationId: string): void {
  const invitation = invitations.get(invitationId);
  if (invitation) invitation.status = 'accepted';
}

export function getAllInvitations(): Invitation[] {
  return Array.from(invitations.values());
}

export { clerkMiddleware };

// Lazy Clerk client — only instantiated when secret key is present
function getClerkClient() {
  const secretKey = process.env.CLERK_SECRET_KEY;
  if (!secretKey) return null;
  return createClerkClient({ secretKey });
}

/**
 * Resolve the primary email for a Clerk userId.
 * Falls back to sessionClaims.email if the API call fails.
 */
async function resolveEmail(userId: string, sessionClaims: any): Promise<string> {
  // Try sessionClaims first (fastest, no API call)
  const claimEmail = (sessionClaims?.email ?? sessionClaims?.['email_address'] ?? '') as string;
  if (claimEmail) return claimEmail;

  // Fall back to Clerk API
  try {
    const clerkClient = getClerkClient();
    if (!clerkClient) return '';
    const clerkUser = await clerkClient.users.getUser(userId);
    return clerkUser.emailAddresses?.[0]?.emailAddress ?? '';
  } catch (err) {
    console.warn('⚠️ Could not fetch Clerk user by ID:', err);
    return '';
  }
}

/**
 * Main auth middleware — requires a valid Clerk session.
 */
export async function requireAuth(
  req: Request,
  res: Response,
  next: NextFunction
) {
  try {
    const { userId, sessionClaims } = getAuth(req);

    if (!userId) {
      return res.status(401).json({
        message: 'Unauthorized',
        error: 'No valid Clerk session found'
      });
    }

    const email = await resolveEmail(userId, sessionClaims);

    // Load user from DB
    let user = email ? await storage.getUserByEmail(email) : null;

    // If not found by email, try by Clerk ID directly
    if (!user) {
      user = await storage.getUser(userId).catch(() => null);
    }

    // If still not found, check invited employees
    if (!user && email) {
      console.log('🔍 User not in DB, checking invitations:', email);
      const employees = await storage.getEmployees();
      const invitedEmployee = employees.find(emp =>
        emp.email?.toLowerCase() === email.toLowerCase()
      );

      if (!invitedEmployee) {
        console.log('❌ User not invited:', email);
        return res.status(403).json({
          message: 'Not invited',
          error: 'This user has not been invited to access the system'
        });
      }

      // Auto-provision user for invited employee
      console.log('✅ Provisioning user for invited employee:', email);
      const clerkClient = getClerkClient();
      let firstName = '';
      let lastName = '';
      if (clerkClient) {
        try {
          const clerkUser = await clerkClient.users.getUser(userId);
          firstName = clerkUser.firstName ?? '';
          lastName = clerkUser.lastName ?? '';
        } catch {}
      }

      await storage.upsertUser({
        id: userId,
        email,
        firstName,
        lastName,
        role: invitedEmployee.role || 'employee',
      });

      user = await storage.getUserByEmail(email);
    }

    if (!user) {
      return res.status(403).json({
        message: 'Access denied',
        error: 'User account not found or inactive'
      });
    }

    req.user = {
      id: user.id,
      email: user.email || '',
      firstName: user.firstName || '',
      lastName: user.lastName || '',
      role: user.role || 'employee'
    };

    next();
  } catch (error) {
    console.error('❌ Clerk auth error:', error);
    res.status(500).json({
      message: 'Authentication error',
      error: 'Internal server error during authentication'
    });
  }
}

/**
 * Logs (at startup) which Clerk instance the configured keys belong to and warns
 * loudly if the publishable and secret keys are from different instance types
 * (e.g. one live + one test) — the #1 cause of 401 / "user not found" logins.
 * Never prints secret values, only key-type prefixes and the (public) instance domain.
 */
export function logClerkKeyDiagnostics(): void {
  const pk = process.env.CLERK_PUBLISHABLE_KEY || process.env.VITE_CLERK_PUBLISHABLE_KEY || '';
  const sk = process.env.CLERK_SECRET_KEY || '';

  if (!pk || !sk) {
    console.warn(
      `⚠️ [Clerk] Missing key(s) — publishableKey:${pk ? 'set' : 'MISSING'} secretKey:${sk ? 'set' : 'MISSING'}. Logins will fail until both are set.`
    );
    return;
  }

  const keyType = (k: string) =>
    k.startsWith('pk_live_') || k.startsWith('sk_live_')
      ? 'live'
      : k.startsWith('pk_test_') || k.startsWith('sk_test_')
        ? 'test'
        : 'unknown';

  let instance = 'unknown';
  try {
    const encoded = pk.replace(/^pk_(live|test)_/, '');
    instance = Buffer.from(encoded, 'base64').toString('utf8').replace(/\$+$/, '');
  } catch {
    /* ignore decode errors */
  }

  const pkType = keyType(pk);
  const skType = keyType(sk);
  console.log(`🔐 [Clerk] frontend instance="${instance}" publishableKey=${pkType} secretKey=${skType}`);

  if (pkType !== skType) {
    console.warn(
      `⚠️ [Clerk] KEY MISMATCH: publishable key is "${pkType}" but secret key is "${skType}". ` +
        `Both keys MUST come from the SAME Clerk application, or logins return 401 / "user not found".`
    );
  }
}

/**
 * Optional auth — attaches user to req if a valid session exists, otherwise continues.
 */
export async function optionalAuth(
  req: Request,
  res: Response,
  next: NextFunction
) {
  try {
    const { userId, sessionClaims } = getAuth(req);

    if (userId) {
      const email = await resolveEmail(userId, sessionClaims);
      const user = email ? await storage.getUserByEmail(email) : null;

      if (user) {
        req.user = {
          id: user.id,
          email: user.email || '',
          firstName: user.firstName || '',
          lastName: user.lastName || '',
          role: user.role || 'employee'
        };
      }
    }

    next();
  } catch {
    next();
  }
}
