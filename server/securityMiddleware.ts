import { Request, Response, NextFunction } from 'express';
import { storage } from './storage';
import rateLimit from 'express-rate-limit';
import helmet from 'helmet';

// Security logging utility
export async function logSecurityEvent(req: any, action: string, severity: 'low' | 'medium' | 'high' | 'critical', metadata?: any) {
  try {
    await storage.createSecurityLog({
      userId: req.user?.id || null,
      action,
      resource: req.route?.path || req.path,
      ipAddress: req.ip || req.connection.remoteAddress,
      userAgent: req.get('User-Agent'),
      sessionId: (req as any).auth?.sessionId || req.user?.id || null,
      severity,
      metadata: metadata ? JSON.stringify(metadata) : null,
    });
  } catch (error) {
    console.error('Failed to log security event:', error);
  }
}

// Audit logging for data changes
export async function logAuditEvent(
  userId: string,
  locationId: string | null,
  tableName: string,
  recordId: string,
  action: 'create' | 'update' | 'delete',
  oldValues?: any,
  newValues?: any,
  reason?: string
) {
  try {
    const changedFields = action === 'update' && oldValues && newValues ? 
      Object.keys(newValues).filter(key => oldValues[key] !== newValues[key]) : null;

    await storage.createAuditLog({
      userId,
      locationId,
      tableName,
      recordId,
      action,
      oldValues: oldValues ? JSON.stringify(oldValues) : null,
      newValues: newValues ? JSON.stringify(newValues) : null,
      changedFields: changedFields ? JSON.stringify(changedFields) : null,
      reason,
    });
  } catch (error) {
    console.error('Failed to log audit event:', error);
  }
}

// Enhanced authentication middleware with logging
export function enhancedAuth(req: any, res: Response, next: NextFunction) {
  if (!req.user?.id) {
    logSecurityEvent(req, 'access_denied', 'medium', { 
      reason: 'unauthenticated_access',
      attempted_resource: req.path 
    });
    return res.status(401).json({ message: 'Unauthorized' });
  }

  // Log successful authentication
  logSecurityEvent(req, 'authenticated_access', 'low', {
    user_id: req.user.id,
    resource: req.path,
    method: req.method
  });

  next();
}

// Role-based authorization middleware
export function requireRole(roles: string[]) {
  return async (req: any, res: Response, next: NextFunction) => {
    try {
      const userId = req.user?.id;
      if (!userId) {
        await logSecurityEvent(req, 'authorization_failed', 'medium', { 
          reason: 'no_user_id',
          required_roles: roles 
        });
        return res.status(401).json({ message: 'Unauthorized' });
      }

      const userPermissions = await storage.getUserPermissions(userId);
      const hasRequiredRole = userPermissions.some(perm => 
        roles.includes(perm.role) && perm.isActive
      );

      if (!hasRequiredRole) {
        await logSecurityEvent(req, 'authorization_failed', 'high', { 
          reason: 'insufficient_permissions',
          user_roles: userPermissions.map(p => p.role),
          required_roles: roles 
        });
        return res.status(403).json({ message: 'Insufficient permissions' });
      }

      req.userPermissions = userPermissions;
      next();
    } catch (error) {
      console.error('Authorization error:', error);
      res.status(500).json({ message: 'Authorization error' });
    }
  };
}

// Data encryption utilities
export function sanitizeData(data: any): any {
  if (typeof data !== 'object' || data === null) return data;
  
  const sanitized = { ...data };
  const sensitiveFields = ['password', 'token', 'secret', 'key', 'ssn', 'credit_card'];
  
  Object.keys(sanitized).forEach(key => {
    if (sensitiveFields.some(field => key.toLowerCase().includes(field))) {
      sanitized[key] = '[REDACTED]';
    }
  });
  
  return sanitized;
}

// Rate limiting configuration
export const apiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 1000, // Limit each IP to 1000 requests per windowMs
  message: 'Too many requests, please try again later',
  standardHeaders: true,
  legacyHeaders: false,
  handler: async (req, res) => {
    await logSecurityEvent(req, 'rate_limit_exceeded', 'medium', {
      ip: req.ip,
      user_agent: req.get('User-Agent')
    });
    res.status(429).json({ message: 'Too many requests, please try again later' });
  }
});

export const strictLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100, // More restrictive for sensitive operations
  message: 'Too many requests for this operation',
  standardHeaders: true,
  legacyHeaders: false,
});

// Security headers middleware
export const securityHeaders = helmet({
  contentSecurityPolicy: process.env.NODE_ENV === 'production' ? {
    directives: {
      defaultSrc: ["'self'"],
      styleSrc: ["'self'", "'unsafe-inline'", "https://fonts.googleapis.com"],
      fontSrc: ["'self'", "https://fonts.gstatic.com"],
      imgSrc: ["'self'", "data:", "https:"],
      scriptSrc: ["'self'", "'unsafe-eval'"],
      connectSrc: ["'self'", "wss:", "https:"],
    },
  } : false, // Disable CSP in development for Vite compatibility
  hsts: {
    maxAge: 31536000,
    includeSubDomains: true,
    preload: true
  }
});

// Input validation middleware
export function validateInput(schema: any) {
  return (req: Request, res: Response, next: NextFunction) => {
    try {
      const validated = schema.parse(req.body);
      req.body = validated;
      next();
    } catch (error) {
      logSecurityEvent(req, 'input_validation_failed', 'medium', {
        error: error instanceof Error ? error.message : 'Unknown validation error',
        body: sanitizeData(req.body)
      });
      res.status(400).json({ 
        message: 'Invalid input data',
        errors: error instanceof Error ? error.message : 'Validation failed'
      });
    }
  };
}

// Location access control
export function requireLocationAccess(locationId?: string) {
  return async (req: any, res: Response, next: NextFunction) => {
    try {
      const userId = req.user?.id;
      const userRole = req.user?.role;
      const targetLocationId = locationId || req.params.locationId || req.query.locationId as string || req.body?.locationId;

      if (!targetLocationId) {
        return res.status(400).json({ message: 'Location ID required' });
      }

      // Owners can only access locations they own (ownerId matches) or legacy locations (ownerId null)
      if (userRole === 'owner') {
        const location = await storage.getLocationById(targetLocationId);
        if (!location) {
          return res.status(404).json({ message: 'Location not found' });
        }
        if (location.ownerId && location.ownerId !== userId) {
          await logSecurityEvent(req, 'location_access_denied', 'critical', {
            user_id: userId,
            attempted_location: targetLocationId,
            location_owner: location.ownerId,
          });
          return res.status(403).json({ message: 'Access denied to this location' });
        }
        req.authorizedLocationId = targetLocationId;
        return next();
      }

      const permissions = await storage.getUserPermissions(userId);
      const hasLocationAccess = permissions.some(perm =>
        perm.locationId === targetLocationId && perm.isActive
      );

      if (!hasLocationAccess) {
        await logSecurityEvent(req, 'location_access_denied', 'high', {
          user_id: userId,
          attempted_location: targetLocationId,
          user_locations: permissions.map((p: any) => p.locationId),
        });
        return res.status(403).json({ message: 'Access denied to this location' });
      }

      req.authorizedLocationId = targetLocationId;
      next();
    } catch (error) {
      console.error('Location access control error:', error);
      res.status(500).json({ message: 'Access control error' });
    }
  };
}