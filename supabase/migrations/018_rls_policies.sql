-- Migration: 018_rls_policies.sql
-- Description: Row Level Security (RLS) enablement, security helper functions, and organization isolation policies

-- ============================================================================
-- 1. RLS Helper Functions (Security Definer)
-- ============================================================================

-- Function to get all active organization IDs for the authenticated user
CREATE OR REPLACE FUNCTION public.get_auth_user_organizations()
RETURNS TABLE (org_id UUID)
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public
AS $$
    SELECT organization_id
    FROM public.organization_members
    WHERE user_id = auth.uid() AND status = 'active';
$$;

-- Function to check if the authenticated user is an owner or admin of a target organization
CREATE OR REPLACE FUNCTION public.is_org_admin(target_org_id UUID)
RETURNS BOOLEAN
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public
AS $$
    SELECT EXISTS (
        SELECT 1
        FROM public.organization_members
        WHERE organization_id = target_org_id
          AND user_id = auth.uid()
          AND role IN ('owner', 'admin')
          AND status = 'active'
    );
$$;

-- ============================================================================
-- 2. Enable RLS on All Public Tables
-- ============================================================================
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.organizations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.organization_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.customers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.invoices ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.invoice_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.payments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.payment_links ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.communications ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.follow_up_rules ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.follow_up_tasks ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.payment_promises ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.disputes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.calls ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.webhook_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.subscriptions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.usage_records ENABLE ROW LEVEL SECURITY;

-- ============================================================================
-- 3. Profiles RLS Policies
-- ============================================================================
CREATE POLICY "Users can view and manage their own profile"
ON public.profiles FOR ALL
USING (id = auth.uid())
WITH CHECK (id = auth.uid());

-- ============================================================================
-- 4. Organizations RLS Policies
-- ============================================================================
CREATE POLICY "Members can view their organizations"
ON public.organizations FOR SELECT
USING (id IN (SELECT public.get_auth_user_organizations()));

CREATE POLICY "Authenticated users can create organizations"
ON public.organizations FOR INSERT
WITH CHECK (auth.uid() IS NOT NULL);

CREATE POLICY "Owners and admins can update their organization"
ON public.organizations FOR UPDATE
USING (public.is_org_admin(id))
WITH CHECK (public.is_org_admin(id));

-- ============================================================================
-- 5. Organization Members RLS Policies
-- ============================================================================
CREATE POLICY "Members can view roster of their organizations"
ON public.organization_members FOR SELECT
USING (organization_id IN (SELECT public.get_auth_user_organizations()));

CREATE POLICY "Owners and admins can manage members"
ON public.organization_members FOR ALL
USING (public.is_org_admin(organization_id))
WITH CHECK (public.is_org_admin(organization_id));

-- ============================================================================
-- 6. Customers RLS Policies
-- ============================================================================
CREATE POLICY "Tenant isolation for customers"
ON public.customers FOR ALL
USING (organization_id IN (SELECT public.get_auth_user_organizations()))
WITH CHECK (organization_id IN (SELECT public.get_auth_user_organizations()));

-- ============================================================================
-- 7. Invoices RLS Policies
-- ============================================================================
CREATE POLICY "Tenant isolation for invoices"
ON public.invoices FOR ALL
USING (organization_id IN (SELECT public.get_auth_user_organizations()))
WITH CHECK (organization_id IN (SELECT public.get_auth_user_organizations()));

-- ============================================================================
-- 8. Invoice Items RLS Policies
-- ============================================================================
CREATE POLICY "Tenant isolation for invoice_items"
ON public.invoice_items FOR ALL
USING (
    invoice_id IN (
        SELECT id FROM public.invoices
        WHERE organization_id IN (SELECT public.get_auth_user_organizations())
    )
)
WITH CHECK (
    invoice_id IN (
        SELECT id FROM public.invoices
        WHERE organization_id IN (SELECT public.get_auth_user_organizations())
    )
);

-- ============================================================================
-- 9. Payments RLS Policies
-- ============================================================================
CREATE POLICY "Tenant isolation for payments"
ON public.payments FOR ALL
USING (organization_id IN (SELECT public.get_auth_user_organizations()))
WITH CHECK (organization_id IN (SELECT public.get_auth_user_organizations()));

-- ============================================================================
-- 10. Payment Links RLS Policies
-- ============================================================================
CREATE POLICY "Tenant isolation for payment_links"
ON public.payment_links FOR ALL
USING (organization_id IN (SELECT public.get_auth_user_organizations()))
WITH CHECK (organization_id IN (SELECT public.get_auth_user_organizations()));

-- ============================================================================
-- 11. Communications RLS Policies
-- ============================================================================
CREATE POLICY "Tenant isolation for communications"
ON public.communications FOR ALL
USING (organization_id IN (SELECT public.get_auth_user_organizations()))
WITH CHECK (organization_id IN (SELECT public.get_auth_user_organizations()));

-- ============================================================================
-- 12. Follow-Up Rules RLS Policies
-- ============================================================================
CREATE POLICY "Tenant isolation for follow_up_rules"
ON public.follow_up_rules FOR ALL
USING (organization_id IN (SELECT public.get_auth_user_organizations()))
WITH CHECK (organization_id IN (SELECT public.get_auth_user_organizations()));

-- ============================================================================
-- 13. Follow-Up Tasks RLS Policies
-- ============================================================================
CREATE POLICY "Tenant isolation for follow_up_tasks"
ON public.follow_up_tasks FOR ALL
USING (organization_id IN (SELECT public.get_auth_user_organizations()))
WITH CHECK (organization_id IN (SELECT public.get_auth_user_organizations()));

-- ============================================================================
-- 14. Payment Promises RLS Policies
-- ============================================================================
CREATE POLICY "Tenant isolation for payment_promises"
ON public.payment_promises FOR ALL
USING (organization_id IN (SELECT public.get_auth_user_organizations()))
WITH CHECK (organization_id IN (SELECT public.get_auth_user_organizations()));

-- ============================================================================
-- 15. Disputes RLS Policies
-- ============================================================================
CREATE POLICY "Tenant isolation for disputes"
ON public.disputes FOR ALL
USING (organization_id IN (SELECT public.get_auth_user_organizations()))
WITH CHECK (organization_id IN (SELECT public.get_auth_user_organizations()));

-- ============================================================================
-- 16. Calls RLS Policies
-- ============================================================================
CREATE POLICY "Tenant isolation for calls"
ON public.calls FOR ALL
USING (organization_id IN (SELECT public.get_auth_user_organizations()))
WITH CHECK (organization_id IN (SELECT public.get_auth_user_organizations()));

-- ============================================================================
-- 17. Webhook Events RLS Policies
-- ============================================================================
CREATE POLICY "Tenant isolation for webhook_events select"
ON public.webhook_events FOR SELECT
USING (organization_id IN (SELECT public.get_auth_user_organizations()));

-- ============================================================================
-- 18. Subscriptions RLS Policies
-- ============================================================================
CREATE POLICY "Tenant isolation for subscriptions select"
ON public.subscriptions FOR SELECT
USING (organization_id IN (SELECT public.get_auth_user_organizations()));

CREATE POLICY "Owners and admins can update subscriptions"
ON public.subscriptions FOR UPDATE
USING (public.is_org_admin(organization_id))
WITH CHECK (public.is_org_admin(organization_id));

-- ============================================================================
-- 19. Usage Records RLS Policies
-- ============================================================================
CREATE POLICY "Tenant isolation for usage_records select"
ON public.usage_records FOR SELECT
USING (organization_id IN (SELECT public.get_auth_user_organizations()));
