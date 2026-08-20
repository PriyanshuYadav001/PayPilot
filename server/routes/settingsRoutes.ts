import { Router, Request, Response } from 'express';
import { requireAuth } from '../middleware/auth';
import { requireOrgContext, requireRole } from '../middleware/tenant';
import {
  settingsUpdateSchema,
  organizationUpdateSchema,
  invoiceDefaultsSchema,
  paymentSettingsSchema,
  followUpDefaultsSchema,
  SettingsUpdateInput,
  OrganizationUpdateInput,
} from '../validators/settings';
import {
  supabaseServer,
} from '../lib/supabaseClient';
import { logger } from '../utils/logger';
import { sendSuccess, sendError } from '../utils/response';
import type { Database } from '../../types/database.types';
import { toJson } from '../utils/json';

export const settingsRouter = Router();

settingsRouter.use(requireAuth, requireOrgContext);

/**
 * GET /api/settings
 * Returns the current organization settings.
 * Only organization members can view settings.
 */
settingsRouter.get(
  '/',
  async (req: Request, res: Response) => {
    try {
      const { organizationId } = req.tenant!;

      const { data: organization, error } = await supabaseServer
        .from('organizations')
        .select(`
          name,
          slug,
          currency,
          timezone,
          billing_address,
          tax_id,
          support_email,
          support_phone,
          updated_at
        `)
        .eq('id', organizationId)
        .single();

      if (error) {
        logger.error('Failed to fetch organization settings', {
          error: error.message,
          organizationId,
        });
        return sendError(res, 'Failed to retrieve organization settings.', 'FETCH_SETTINGS_FAILED', 500);
      }

      sendSuccess(res, { organization });
    } catch (err) {
      logger.error('Exception in settings GET', {
        error: err instanceof Error ? err.message : String(err),
        organizationId: req.tenant!.organizationId,
      });
      sendError(res, 'An unexpected error occurred.', 'INTERNAL_SERVER_ERROR', 500);
    }
  }
);

/**
 * PUT /api/settings
 * Updates organization settings.
 * Only organization owners and admins may modify settings.
 */
settingsRouter.put(
  '/',
  requireRole(['owner', 'admin']),
  async (req: Request, res: Response) => {
    try {
      const parsed = settingsUpdateSchema.safeParse(req.body);

      if (!parsed.success) {
        return sendError(
          res,
          'Invalid settings payload',
          'VALIDATION_ERROR',
          400,
        );
      }

      const { organization, invoiceDefaults, paymentSettings, followUpDefaults } = parsed.data;
      const { organizationId } = req.tenant!;

      // Build the update object
      const updateData: Database['public']['Tables']['organizations']['Update'] = {};

      if (organization.name !== undefined) updateData.name = organization.name;
      if (organization.supportEmail !== undefined) updateData.support_email = organization.supportEmail;
      if (organization.supportPhone !== undefined) updateData.support_phone = organization.supportPhone;
      if (organization.currency !== undefined) updateData.currency = organization.currency;
      if (organization.timezone !== undefined) updateData.timezone = organization.timezone;
      if (organization.billingAddress !== undefined) updateData.billing_address = toJson(organization.billingAddress);

      // Update organization
      const { data: updatedOrg, error: orgError } = await supabaseServer
        .from('organizations')
        .update(updateData)
        .eq('id', organizationId)
        .select()
        .single();

      if (orgError) {
        logger.error('Failed to update organization settings', {
          error: orgError.message,
          organizationId,
        });
        return sendError(res, 'Failed to update organization settings.', 'UPDATE_SETTINGS_FAILED', 500);
      }

      sendSuccess(res, { organization: updatedOrg });
    } catch (err) {
      logger.error('Exception in settings PUT', {
        error: err instanceof Error ? err.message : String(err),
        organizationId: req.tenant!.organizationId,
      });
      sendError(res, 'An unexpected error occurred.', 'INTERNAL_SERVER_ERROR', 500);
    }
  }
);

export const settingsRoutes = settingsRouter;
