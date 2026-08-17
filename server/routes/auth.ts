import { Router, Request, Response } from 'express';
import { supabaseServer } from '../lib/supabaseClient';
import { requireAuth } from '../middleware/auth';
import { validateBody } from '../middleware/validate';
import { signupSchema, loginSchema, resetPasswordSchema } from '../../shared/validators';
import { sendSuccess, sendError } from '../utils/response';
import { logger } from '../utils/logger';

export const authRouter = Router();

/**
 * POST /auth/signup
 * Creates auth user → profile → organization → organization_members (owner).
 * Uses service-role admin client (never exposed to frontend).
 */
authRouter.post('/signup', validateBody(signupSchema), async (req: Request, res: Response) => {
  const { email, password, fullName, organizationName } = req.body;

  try {
    // 1. Create auth user via Supabase Admin API
    const { data: authData, error: authError } = await supabaseServer.auth.admin.createUser({
      email,
      password,
      email_confirm: true, // Auto-confirm for now
      user_metadata: { full_name: fullName },
    });

    if (authError || !authData.user) {
      logger.warn('Signup: auth user creation failed', authError?.message);
      const message = authError?.message?.includes('already registered')
        ? 'An account with this email already exists.'
        : authError?.message || 'Failed to create user account.';
      sendError(res, message, 'SIGNUP_FAILED', 400);
      return;
    }

    const userId = authData.user.id;

    // 2. Create profile
    const { error: profileError } = await supabaseServer
      .from('profiles')
      .insert({
        id: userId,
        email,
        full_name: fullName,
      });

    if (profileError) {
      logger.error('Signup: profile creation failed', profileError.message);
      // Cleanup: delete the auth user on profile failure
      await supabaseServer.auth.admin.deleteUser(userId);
      sendError(res, 'Failed to create user profile.', 'SIGNUP_FAILED', 500);
      return;
    }

    // 3. Create organization
    const slug = organizationName
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '')
      .substring(0, 50);

    // Ensure slug uniqueness by appending short random suffix
    const uniqueSlug = `${slug}-${Date.now().toString(36).slice(-4)}`;

    const { data: orgData, error: orgError } = await supabaseServer
      .from('organizations')
      .insert({
        name: organizationName,
        slug: uniqueSlug,
        created_by: userId,
      })
      .select('id')
      .single();

    if (orgError || !orgData) {
      logger.error('Signup: organization creation failed', orgError?.message);
      await supabaseServer.auth.admin.deleteUser(userId);
      sendError(res, 'Failed to create organization.', 'SIGNUP_FAILED', 500);
      return;
    }

    // 4. Create organization_members record (owner role)
    const { error: memberError } = await supabaseServer
      .from('organization_members')
      .insert({
        organization_id: orgData.id,
        user_id: userId,
        role: 'owner',
        status: 'active',
      });

    if (memberError) {
      logger.error('Signup: member creation failed', memberError.message);
      await supabaseServer.auth.admin.deleteUser(userId);
      sendError(res, 'Failed to create organization membership.', 'SIGNUP_FAILED', 500);
      return;
    }

    // 5. Sign in the user to return a session
    const { data: signInData, error: signInError } = await supabaseServer.auth.signInWithPassword({
      email,
      password,
    });

    if (signInError || !signInData.session) {
      logger.warn('Signup: auto-login failed', signInError?.message);
      // Account was created successfully, but auto-login failed
      // User can still log in manually
      sendSuccess(res, {
        user: { id: userId, email, fullName },
        organization: { id: orgData.id, name: organizationName, slug: uniqueSlug },
        session: null,
        message: 'Account created successfully. Please log in.',
      }, 201);
      return;
    }

    sendSuccess(res, {
      user: {
        id: userId,
        email,
        fullName,
      },
      organization: {
        id: orgData.id,
        name: organizationName,
        slug: uniqueSlug,
      },
      session: {
        access_token: signInData.session.access_token,
        refresh_token: signInData.session.refresh_token,
        expires_at: signInData.session.expires_at,
      },
    }, 201);

  } catch (err) {
    logger.error('Signup: unexpected error', err);
    sendError(res, 'An unexpected error occurred during signup.', 'INTERNAL_SERVER_ERROR', 500);
  }
});

/**
 * POST /auth/login
 * Proxies login through the server to validate credentials.
 */
authRouter.post('/login', validateBody(loginSchema), async (req: Request, res: Response) => {
  const { email, password } = req.body;

  try {
    const { data, error } = await supabaseServer.auth.signInWithPassword({
      email,
      password,
    });

    if (error || !data.session) {
      logger.warn('Login failed', error?.message);
      sendError(res, 'Invalid email or password.', 'LOGIN_FAILED', 401);
      return;
    }

    // Fetch profile
    const { data: profile } = await supabaseServer
      .from('profiles')
      .select('id, email, full_name, phone_number, avatar_url')
      .eq('id', data.user.id)
      .single();

    // Fetch organizations
    const { data: memberships } = await supabaseServer
      .from('organization_members')
      .select('organization_id, role, organizations:organization_id(id, name, slug, logo_url, currency, timezone)')
      .eq('user_id', data.user.id)
      .eq('status', 'active');

    sendSuccess(res, {
      user: profile || { id: data.user.id, email: data.user.email },
      session: {
        access_token: data.session.access_token,
        refresh_token: data.session.refresh_token,
        expires_at: data.session.expires_at,
      },
      organizations: memberships?.map((m: Record<string, unknown>) => ({
        ...(m.organizations as Record<string, unknown>),
        role: m.role,
      })) || [],
    });
  } catch (err) {
    logger.error('Login: unexpected error', err);
    sendError(res, 'An unexpected error occurred during login.', 'INTERNAL_SERVER_ERROR', 500);
  }
});

/**
 * POST /auth/logout
 * Signs out the user (invalidates the session).
 */
authRouter.post('/logout', async (_req: Request, res: Response) => {
  try {
    // Server-side signout (current session)
    await supabaseServer.auth.signOut();
    sendSuccess(res, { message: 'Logged out successfully.' });
  } catch (err) {
    logger.error('Logout error', err);
    sendError(res, 'Failed to sign out.', 'LOGOUT_FAILED', 500);
  }
});

/**
 * POST /auth/reset-password
 * Sends a password reset email.
 */
authRouter.post('/reset-password', validateBody(resetPasswordSchema), async (req: Request, res: Response) => {
  const { email } = req.body;

  try {
    const redirectTo = process.env.APP_URL || 'http://localhost:5173';

    const { error } = await supabaseServer.auth.resetPasswordForEmail(email, {
      redirectTo: `${redirectTo}/reset-password`,
    });

    if (error) {
      logger.warn('Password reset failed', error.message);
      // Don't reveal whether email exists or not (security)
    }

    // Always return success to prevent email enumeration
    sendSuccess(res, {
      message: 'If an account exists with this email, a password reset link has been sent.',
    });
  } catch (err) {
    logger.error('Reset password: unexpected error', err);
    sendError(res, 'Failed to send password reset email.', 'INTERNAL_SERVER_ERROR', 500);
  }
});

/**
 * GET /auth/me
 * Protected: returns current user profile and organizations.
 */
authRouter.get('/me', requireAuth, async (req: Request, res: Response) => {
  const userId = req.user!.id;

  try {
    // Fetch profile
    const { data: profile, error: profileError } = await supabaseServer
      .from('profiles')
      .select('id, email, full_name, phone_number, avatar_url, created_at, updated_at')
      .eq('id', userId)
      .single();

    if (profileError || !profile) {
      sendError(res, 'Profile not found.', 'NOT_FOUND', 404);
      return;
    }

    // Fetch organizations with roles
    const { data: memberships } = await supabaseServer
      .from('organization_members')
      .select('organization_id, role, organizations:organization_id(id, name, slug, logo_url, currency, timezone, created_at, updated_at)')
      .eq('user_id', userId)
      .eq('status', 'active');

    sendSuccess(res, {
      profile: {
        id: profile.id,
        email: profile.email,
        fullName: profile.full_name,
        phoneNumber: profile.phone_number,
        avatarUrl: profile.avatar_url,
        createdAt: profile.created_at,
        updatedAt: profile.updated_at,
      },
      organizations: memberships?.map((m: Record<string, unknown>) => {
        const org = m.organizations as Record<string, unknown>;
        return {
          id: org.id,
          name: org.name,
          slug: org.slug,
          logoUrl: org.logo_url,
          currency: org.currency,
          timezone: org.timezone,
          role: m.role,
          createdAt: org.created_at,
          updatedAt: org.updated_at,
        };
      }) || [],
    });
  } catch (err) {
    logger.error('Get /me: unexpected error', err);
    sendError(res, 'Failed to fetch user profile.', 'INTERNAL_SERVER_ERROR', 500);
  }
});
