import { Request, Response, NextFunction } from 'express';
import { logger } from '../utils/logger';
import { sendError, sendSuccess } from '../utils/response';

/** 
 * Permission levels for organization roles
 * OWNER: Everything
 * ADMIN: Business management, Customers, Invoices, Payments, Follow-ups, Communications
 * MEMBER: Operational access according to configured permissions
 */

export const ROLE_PERMISSIONS = {
  owner: ['*'], // OWNER has access to everything
  
  admin: [
    'business_management',     // Can manage organization settings
    'customers.read',          // Can view customers
    'customers.write',         // Can create/update customers
    'invoices.read',           // Can view invoices
    'invoices.write',          // Can create/update invoices
    'payments.read',           // Can view payments
    'payments.write',          // Can create payments
    'followups.read',          // Can view follow-ups
    'followups.write',         // Can create follow-ups
    'communications.read',     // Can view communications
    'communications.write',    // Can create communications
  ],
  
  member: [
  'customers.read',
  'invoices.read',
  'payments.read',
  'followups.read',
  'followups.write',
  'communications.read',
],
};

/**
 * Check if a role has a specific permission
 */
export function hasPermission(role: string | undefined, permission: string): boolean {
  if (!role) return false;
  
  const permissions = ROLE_PERMISSIONS[role as keyof typeof ROLE_PERMISSIONS];
  if (!permissions) return false;
  
  // OWNER has access to everything
  if (permissions.includes('*')) return true;
  
  return permissions.includes(permission);
}

/**
 * Generate permission middleware for a specific permission
 */
export function requirePermission(permission: string) {
  return async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const userRole = (req as any).tenant?.role;
      
      if (!userRole) {
        return sendError(
          res,
          'User role not found. Please authenticate again.',
          'MISSING_ROLE',
          401,
        );
      }
      
      if (!hasPermission(userRole, permission)) {
        return sendError(
          res,
          `Insufficient permissions. Required: ${permission}`,
          'FORBIDDEN',
          403,
        );
      }
      
      next();
    } catch (err) {
      logger.error('Permission check failed', {
        error: err instanceof Error ? err.message : String(err),
      });
      sendError(res, 'Failed to check permissions.', 'PERMISSION_CHECK_FAILED', 500);
    }
  };
}

/**
 * Generate middleware that checks multiple permissions (ALL must pass)
 */
export function requirePermissions(permissions: string[]) {
  return async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const userRole = (req as any).tenant?.role;
      
      if (!userRole) {
        return sendError(
          res,
          'User role not found. Please authenticate again.',
          'MISSING_ROLE',
          401,
        );
      }
      
      // OWNER has access to everything
      if (hasPermission(userRole, '*')) {
        return next();
      }
      
      const missing: string[] = [];
      for (const perm of permissions) {
        if (!hasPermission(userRole, perm)) {
          missing.push(perm);
        }
      }
      
      if (missing.length > 0) {
        return sendError(
          res,
          `Insufficient permissions. Missing: ${missing.join(', ')}`,
          'INSUFFICIENT_PERMISSIONS',
          403,
        );
      }
      
      next();
    } catch (err) {
      logger.error('Permission check failed', {
        error: err instanceof Error ? err.message : String(err),
      });
      sendError(res, 'Failed to check permissions.', 'PERMISSION_CHECK_FAILED', 500);
    }
  };
}

/**
 * Generate middleware that checks ANY of the given permissions (ANY can pass)
 */
export function requireAnyPermission(permissions: string[]) {
  return async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const userRole = (req as any).tenant?.role;
      
      if (!userRole) {
        return sendError(
          res,
          'User role not found. Please authenticate again.',
          'MISSING_ROLE',
          401,
        );
      }
      
      // OWNER has access to everything
      if (hasPermission(userRole, '*')) {
        return next();
      }
      
      const hasAny = permissions.some(perm => hasPermission(userRole, perm));
      
      if (!hasAny) {
        return sendError(
          res,
          `Insufficient permissions. Required any of: ${permissions.join(', ')}`,
          'INSUFFICIENT_PERMISSIONS',
          403,
        );
      }
      
      next();
    } catch (err) {
      logger.error('Permission check failed', {
        error: err instanceof Error ? err.message : String(err),
      });
      sendError(res, 'Failed to check permissions.', 'PERMISSION_CHECK_FAILED', 500);
    }
  };
}

export const permissionService = {
  hasPermission,
  requirePermission,
  requirePermissions,
  requireAnyPermission,
};
