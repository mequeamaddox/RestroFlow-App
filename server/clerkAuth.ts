import { Request, Response, NextFunction } from 'express';
import { clerkMiddleware, getAuth } from '@clerk/express';
import { storage } from './storage';

// Extend Express Request interface - same shape as before
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

// Invitation system - kept exactly as before
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

// Export Clerk's middleware for use in index.ts
export { clerkMiddleware };

/**
 * Main auth middleware - drop-in replacement for requireFirebaseAuth
 * Same req.user shape, same invitation check, same error responses
 */
export async function requireFirebaseAuth(
  req: Request,
  res: Response,
  next: NextFunction
) {
  try {
    // Get Clerk auth state from request
    const { userId, sessionClaims } = getAuth(req);

    if (!userId) {
      return res.status(401).json({
        message: 'Unauthorized',
        error: 'No valid authentication found'
      });
    }

    const email = sessionClaims?.email as string || '';

    // Load user from database by email
    let user = await storage.getUserByEmail(email);

    // If not in DB, check if they're an invited employee
    if (!user) {
      console.log('🔍 User not in DB, checking invitation:', email);

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

      // Create user record for invited employee
      console.log('✅ Creating user record for invited employee:', email);
      const nameParts = (sessionClaims?.name as string || '').split(' ');
      await storage.upsertUser({
        id: userId,
        email,
        firstName: nameParts[0] || '',
        lastName: nameParts.slice(1).join(' ') || '',
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

    // Set req.user - exact same shape as before
    req.user = {
      id: user.id,
      email: user.email || '',
      firstName: user.firstName || '',
      lastName: user.lastName || '',
      role: user.role || 'employee'
    };

    console.log('✅ Clerk auth successful:', user.email, 'role:', user.role);
    next();

  } catch (error) {
    console.error('❌ Clerk auth middleware error:', error);
    res.status(500).json({
      message: 'Authentication error',
      error: 'Internal server error during authentication'
    });
  }
}

/**
 * Optional auth - for public endpoints that work with or without auth
 */
export async function optionalFirebaseAuth(
  req: Request,
  res: Response,
  next: NextFunction
) {
  try {
    const { userId, sessionClaims } = getAuth(req);

    if (userId) {
      const email = sessionClaims?.email as string || '';
      const user = await storage.getUserByEmail(email);

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
  } catch (error) {
    console.log('ℹ️ Optional auth failed, continuing without user');
    next();
  }
}