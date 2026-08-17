import { Request, Response, NextFunction } from 'express';
import { supabaseServer } from '../lib/supabaseClient';
import { logger } from '../utils/logger';

/**
 * Tenant Context Middleware
 * Enforces server-side organization resolution.
 * Never trusts raw organization_id from client bodies.
 * Verifies membership via organization_members table using the admin client.
 */
export async function requireOrgContext(req: Request, res: Response, next: NextFunction): Promise<void> {
  const userId = req.user?.id;
  if (!userId) {
    res.status(401).json({
      success: false,
      error: {
        code: 'UNAUTHORIZED',
        message: 'User must be authenticated to resolve tenant context.',
      },
    });
    return;
  }

  const requestedOrgId = req.headers['x-organization-id'] as string | undefined;

  if (!requestedOrgId) {
    res.status(400).json({
      success: false,
      error: {
        code: 'BAD_REQUEST',
        message: 'X-Organization-Id header is required.',
      },
    });
    return;
  }

  try {
    // Server-side verification against organization_members table
    const { data: membership, error } = await supabaseServer
      .from('organization_members')
      .select('id, organization_id, user_id, role, status')
      .eq('organization_id', requestedOrgId)
      .eq('user_id', userId)
      .eq('status', 'active')
      .single();

    if (error || !membership) {
      logger.warn(`Tenant context denied: user ${userId} not a member of org ${requestedOrgId}`);
      res.status(403).json({
        success: false,
        error: {
          code: 'FORBIDDEN',
          message: 'You are not an active member of this organization.',
        },
      });
      return;
    }

    req.tenant = {
      organizationId: membership.organization_id,
      role: membership.role as 'owner' | 'admin' | 'member' | 'viewer',
      userId,
    };

    next();
  } catch (err) {
    logger.error('Tenant context middleware exception', err);
    res.status(500).json({
      success: false,
      error: {
        code: 'INTERNAL_SERVER_ERROR',
        message: 'Failed to resolve organization context.',
      },
    });
  }
}

export function requireRole(allowedRoles: Array<'owner' | 'admin' | 'member' | 'viewer'>) {
  return (req: Request, res: Response, next: NextFunction): void => {
    const userRole = req.tenant?.role;
    if (!userRole || !allowedRoles.includes(userRole)) {
      res.status(403).json({
        success: false,
        error: {
          code: 'FORBIDDEN',
          message: 'Insufficient permissions for this operation.',
        },
      });
      return;
    }
    next();
  };
}
