-- ============================================================================
-- Migration 055: Remove superadmin cross-tenant access from consulting tables
-- ============================================================================
-- Privacy fix: Client consulting data (KPIs, SWOT, assessments, documents,
-- meetings, CRM contacts, deals) should NOT be visible to super admins.
-- Each client's data is private to their own tenant.
--
-- This drops all "superadmin_all_consulting_*" policies that were created
-- in migrations 044 and 054.
-- ============================================================================

BEGIN;

-- 1. consulting_projects
DROP POLICY IF EXISTS "superadmin_all_consulting_projects" ON public.consulting_projects;

-- 2. consulting_assessments
DROP POLICY IF EXISTS "superadmin_all_consulting_assessments" ON public.consulting_assessments;

-- 3. consulting_swot
DROP POLICY IF EXISTS "superadmin_all_consulting_swot" ON public.consulting_swot;

-- 4. consulting_kpis
DROP POLICY IF EXISTS "superadmin_all_consulting_kpis" ON public.consulting_kpis;

-- 5. consulting_kpi_history
DROP POLICY IF EXISTS "superadmin_all_consulting_kpi_history" ON public.consulting_kpi_history;

-- 6. consulting_documents
DROP POLICY IF EXISTS "superadmin_all_consulting_documents" ON public.consulting_documents;

-- 7. consulting_meetings
DROP POLICY IF EXISTS "superadmin_all_consulting_meetings" ON public.consulting_meetings;

-- 8. consulting_activity
DROP POLICY IF EXISTS "superadmin_all_consulting_activity" ON public.consulting_activity;

-- 9. consulting_crm_contacts
DROP POLICY IF EXISTS "superadmin_all_consulting_crm_contacts" ON public.consulting_crm_contacts;

-- 10. consulting_crm_deals
DROP POLICY IF EXISTS "superadmin_all_consulting_crm_deals" ON public.consulting_crm_deals;

COMMIT;

NOTIFY pgrst, 'reload schema';
