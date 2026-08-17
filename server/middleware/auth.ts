import { Request, Response, NextFunction } from 'express';
import { supabaseServer } from '../lib/supabaseClient';
import { logger } from '../utils/logger';

export interface AuthenticatedUser {
  id: string;
  email: string;
  role?: string;
}

export interface TenantContext {
  organizationId: string;
  role: 'owner' | 'admin' | 'member' | 'viewer';
  userId: string;
}

declare global {
  namespace Express {
    interface Request {
      user?: AuthenticatedUser;
      tenant?: TenantContext;
      /** Captured raw request body (Buffer) for webhook signature verification. */
      rawBody?: Buffer;
    }
  }
}

/**
 * Authentication Middleware
 * Verifies Supabase JWT token from Authorization header using the
 * server-side admin client (service-role key, never exposed to frontend).
 * On success, populates req.user with { id, email }.
 */
export async function requireAuth(req: Request, res: Response, next: NextFunction): Promise<void> {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    res.status(401).json({
      success: false,
      error: {
        code: 'UNAUTHORIZED',
        message: 'Missing or invalid authorization header.',
      },
    });
    return;
  }

  const token = authHeader.split(' ')[1];
  if (!token) {
    res.status(401).json({
      success: false,
      error: {
        code: 'UNAUTHORIZED',
        message: 'JWT token not provided.',
      },
    });
    return;
  }

  try {
    const { data, error } = await supabaseServer.auth.getUser(token);

    if (error || !data.user) {
      logger.warn('Auth token verification failed', error?.message);
      res.status(401).json({
        success: false,
        error: {
          code: 'UNAUTHORIZED',
          message: 'Invalid or expired token.',
        },
      });
      return;
    }

    req.user = {
      id: data.user.id,
      email: data.user.email || '',
      role: data.user.role,
    };

    next();
  } catch (err) {
    logger.error('Auth middleware exception', err);
    res.status(401).json({
      success: false,
      error: {
        code: 'UNAUTHORIZED',
        message: 'Authentication failed.',
      },
    });
  }
}
